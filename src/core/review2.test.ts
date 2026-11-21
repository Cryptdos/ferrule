/** Second review: rails across sheets, plant tags, renumber preview, link arrows, field wires, parts. */
import { describe, expect, test } from "bun:test";
import { newProject } from "./model";
import { addElement, addPage, addPlant, connect, linkContact, linkOffpage, placePlantView, updateElement } from "./ops";
import { renumber, renumberPreview } from "./renumber";
import { slideRailTaps } from "./routing";
import { localGeometry, terminalNames } from "./symbols";
import { parseProject } from "./validate";
import { isFieldWire } from "./wires";
import { contactTable, xrefText } from "./xref";

function project() {
  const p = newProject("t");
  const pg = p.pages[0]!.id;
  return { p, pg };
}

describe("control rails across sheets", () => {
  test("rails with the same name are one conductor, and each shows the other sheets", () => {
    const { p, pg } = project();
    const pg2 = addPage(p, "Two").id;
    const a = addElement(p, pg, "rail", [0, 80], { params: { name: "0V", length: 100 } });
    const b = addElement(p, pg2, "rail", [0, 80], { params: { name: "0V", length: 100 } });
    const k1 = addElement(p, pg, "coil", [20, 60]);
    const k2 = addElement(p, pg2, "coil", [20, 60]);
    connect(p, pg, [k1.id, "A2"], [a.id, "20"]);
    connect(p, pg2, [k2.id, "A2"], [b.id, "20"]);
    const cond = (id: string) => p.conductors.find((c) => c.terminals.some(([x, t]) => x === id && t === "A2"))!.id;
    expect(cond(k1.id)).toBe(cond(k2.id));
    expect(xrefText(p, a, "")).toBe("/2");
    expect(xrefText(p, b, "")).toBe("/1");
  });
});

describe("link arrows", () => {
  test("ticking Source on one makes its partner the destination", () => {
    const { p, pg } = project();
    const a = addElement(p, pg, "offpage", [10, 10]);
    const b = addElement(p, pg, "offpage", [50, 10]);
    linkOffpage(p, a.id, b.id);
    expect([a.params.source, b.params.source]).toEqual([true, false]);
    updateElement(p, pg, b.id, { params: { source: true } });
    expect(a.params.source).toBe(false);
  });

  test("on the same sheet a reference is just the column", () => {
    const { p, pg } = project();
    const a = addElement(p, pg, "offpage", [10, 10]);
    const b = addElement(p, pg, "offpage", [50, 10]);
    linkOffpage(p, a.id, b.id);
    expect(xrefText(p, a, "")).toBe("26");
  });

  test("older files: direction in/out becomes the Source tick", () => {
    const { p, pg } = project();
    const a = addElement(p, pg, "offpage", [10, 10]);
    const old = JSON.parse(JSON.stringify(p));
    old.pages[0].elements.find((e: { id: string }) => e.id === a.id).params = { direction: "in" };
    expect(parseProject(old).pages[0]!.elements[0]!.params.source).toBe(false);
  });
});

describe("plant tags", () => {
  test("prefix + where the first view is, like every other tag", () => {
    const { p, pg } = project();
    const sef = addPlant(p, "", "Safety extract fan", ["1", "2"], { prefix: "SEF" });
    const u = addPlant(p, "", "Damper", ["1", "2"], { prefix: "U" });
    placePlantView(p, pg, sef.id, [24, 100]);
    placePlantView(p, pg, u.id, [60, 100]);
    renumber(p);
    expect(sef.tag).toBe("SEF-1-13");
    expect(u.tag).toBe("U1-31");
  });

  test("older plant tags give their prefix", () => {
    const { p } = project();
    const old = JSON.parse(JSON.stringify(p));
    old.plant = [{ id: "p1", tag: "SF-01", description: "", terminals: [] }];
    expect(parseProject(old).plant[0]!.prefix).toBe("SF");
  });
});

describe("renumber preview", () => {
  test("lists only what would change, and changes nothing", () => {
    const { p, pg } = project();
    const k = addElement(p, pg, "coil", [20, 60]);
    const s = addElement(p, pg, "contact-no", [40, 30]);
    linkContact(p, s.id, k.id);
    renumber(p);
    expect(renumberPreview(p).changes).toEqual([]);
    updateElement(p, pg, k.id, { tag: "K99" });
    const { changes } = renumberPreview(p);
    expect(changes).toEqual([{ kind: "Tag", where: "1-11", from: "K99", to: "K1-11" }]);
    expect(k.tag).toBe("K99");
    void contactTable;
  });
});

describe("rail taps", () => {
  test("don't slide under a terminal that points away from the rail", () => {
    const { p, pg } = project();
    const page = p.pages[0]!;
    const bus = addElement(p, pg, "busbar", [10, 10], { params: { length: 60, name: "L" } });
    const h = addElement(p, pg, "lamp", [20, 45]);
    const down = connect(p, pg, [h.id, "V-"], [bus.id, "24"]); // V- points down, the bar is above
    const up = connect(p, pg, [h.id, "V+"], [bus.id, "30"]); // V+ points up at the bar
    slideRailTaps(page);
    expect(down.to[1]).toBe("24");
    expect(up.to[1]).toBe("10");
  });
});

describe("field wires", () => {
  test("decided by the panel boundary unless set by hand", () => {
    const { p, pg } = project();
    const page = p.pages[0]!;
    const x = addElement(p, pg, "terminal", [20, 80]);
    const k = addElement(p, pg, "coil", [20, 100]);
    k.zone = "external";
    const s = connect(p, pg, [x.id, "2"], [k.id, "A1"]);
    expect(isFieldWire(page, s)).toBe(true);
    s.field = false;
    expect(isFieldWire(page, s)).toBe(false);
  });
});

describe("parts", () => {
  test("socket: L and N at the pole pitch, earth out of the side", () => {
    const { p, pg } = project();
    const s = addElement(p, pg, "socket", [20, 20]);
    const g = localGeometry(s, "");
    const at = (n: string) => g.terminals.find((t) => t.name === n)!;
    expect(at("N").at[0] - at("L").at[0]).toBe(3);
    expect(at("E").dir).toBe("right");
  });

  test("earth types draw differently", () => {
    const { p, pg } = project();
    const shapes = ["earth", "protective", "functional", "chassis", "equipotential"].map((type) =>
      JSON.stringify(localGeometry(addElement(p, pg, "earth", [20, 20], { params: { type } }), "").prims),
    );
    expect(new Set(shapes).size).toBe(5);
    expect(terminalNames(addElement(p, pg, "earth", [30, 20], { params: { type: "chassis" } }))).toEqual(["E"]);
  });

  test("amber lamps become yellow", () => {
    const { p, pg } = project();
    const h = addElement(p, pg, "lamp", [20, 20], { params: { colour: "AM" } });
    expect(h.params.colour).toBe("Ye");
  });
});

import { advance, compile, hold, initialState, operatedNow, plantInputId, timerRemaining, toggle } from "./sim";
import { parseTerminalSpec } from "./ops";

describe("simulation: supplies", () => {
  test("an Incoming supply feeds busbars; the isolator cuts them; a transformer makes its own supply", () => {
    const { p, pg } = project();
    const sup = addElement(p, pg, "supply", [10, 6], { params: { system: "1ph-n" } });
    const q = addElement(p, pg, "isolator", [10, 12], { params: { poles: 2 } });
    const l = addElement(p, pg, "busbar", [4, 20], { params: { length: 80, name: "L" } });
    const nb = addElement(p, pg, "busbar", [4, 24], { params: { length: 80, name: "N" } });
    connect(p, pg, [sup.id, "L"], [q.id, "1"]);
    connect(p, pg, [sup.id, "N"], [q.id, "3"]);
    connect(p, pg, [q.id, "2"], [l.id, "6"]);
    connect(p, pg, [q.id, "4"], [nb.id, "9"]);
    const h = addElement(p, pg, "lamp", [40, 32]);
    connect(p, pg, [l.id, "36"], [h.id, "V+"]);
    connect(p, pg, [h.id, "V-"], [nb.id, "36"]);
    const t = addElement(p, pg, "transformer", [60, 34]);
    connect(p, pg, [l.id, "56"], [t.id, "P1"]);
    connect(p, pg, [nb.id, "59"], [t.id, "P2"]);
    const k = addElement(p, pg, "coil", [60, 50]);
    connect(p, pg, [t.id, "S1"], [k.id, "A1"]);
    connect(p, pg, [k.id, "A2"], [t.id, "S2"]);
    const c = compile(p);
    let s = initialState(c);
    expect(s.lamps[h.id]).toBe(true);
    expect(s.energised[t.id]).toBe(true);
    expect(s.energised[k.id]).toBe(true);
    expect(operatedNow(c, s)[q.id]).toBe(true);
    s = toggle(c, s, q.id); // isolate
    expect(s.lamps[h.id]).toBe(false);
    expect(s.energised[k.id]).toBe(false);
  });
});

describe("simulation: plant groups", () => {
  function plantRig(spec: string) {
    const { p, pg } = project();
    const cct = addElement(p, pg, "rail", [0, 10], { params: { name: "CCT", length: 100 } });
    const ov = addElement(p, pg, "rail", [0, 60], { params: { name: "0V", length: 100 } });
    const parsed = parseTerminalSpec(spec);
    const item = addPlant(p, "", "Fan", parsed.terminals, { groups: parsed.groups, prefix: "SF" });
    const v = placePlantView(p, pg, item.id, [20, 90]);
    return { p, pg, cct, ov, item, v };
  }

  test("a relay output: C-NO closes and C-NC opens when it's operated", () => {
    const { p, pg, cct, ov, item, v } = plantRig("R1: C NO NC");
    const run = addElement(p, pg, "lamp", [20, 40]);
    const stop = addElement(p, pg, "lamp", [40, 40]);
    connect(p, pg, [cct.id, "20"], [v.id, "C"]);
    connect(p, pg, [v.id, "NO"], [run.id, "V+"]);
    connect(p, pg, [v.id, "NC"], [stop.id, "V+"]);
    connect(p, pg, [run.id, "V-"], [ov.id, "20"]);
    connect(p, pg, [stop.id, "V-"], [ov.id, "40"]);
    const c = compile(p);
    let s = initialState(c);
    expect([s.lamps[run.id], s.lamps[stop.id]]).toEqual([false, true]);
    s = toggle(c, s, plantInputId(item.id, "R1"));
    expect([s.lamps[run.id], s.lamps[stop.id]]).toEqual([true, false]);
  });

  test("an output can follow an input after a delay, or the other way round", () => {
    const { p, pg, cct, ov, item, v } = plantRig("ENABLE: 1 2 | RUNNING: 3 4 | FAULT: 5 6");
    const sw = addElement(p, pg, "contact-no", [10, 30]);
    connect(p, pg, [cct.id, "10"], [sw.id, "13"]);
    connect(p, pg, [sw.id, "14"], [v.id, "1"]);
    connect(p, pg, [v.id, "2"], [ov.id, "12"]);
    const run = addElement(p, pg, "lamp", [40, 40]);
    const fault = addElement(p, pg, "lamp", [60, 40]);
    connect(p, pg, [cct.id, "30"], [v.id, "3"]);
    connect(p, pg, [v.id, "4"], [run.id, "V+"]);
    connect(p, pg, [run.id, "V-"], [ov.id, "40"]);
    connect(p, pg, [cct.id, "50"], [v.id, "5"]);
    connect(p, pg, [v.id, "6"], [fault.id, "V+"]);
    connect(p, pg, [fault.id, "V-"], [ov.id, "60"]);
    item.groups!.find((g) => g.name === "RUNNING")!.follows = "ENABLE";
    item.groups!.find((g) => g.name === "RUNNING")!.delay = 3;
    item.groups!.find((g) => g.name === "FAULT")!.follows = "ENABLE";
    item.groups!.find((g) => g.name === "FAULT")!.invert = true;
    const c = compile(p);
    let s = initialState(c);
    expect([s.lamps[run.id], s.lamps[fault.id]]).toEqual([false, true]);
    s = toggle(c, s, sw.id);
    expect(s.energised[plantInputId(item.id, "ENABLE")]).toBe(true);
    expect(s.lamps[fault.id]).toBe(false);
    expect(s.lamps[run.id]).toBe(false);
    expect(timerRemaining(c, s, `${plantInputId(item.id, "RUNNING")}:f`)).toBe(3);
    s = advance(c, s, 3);
    expect(s.lamps[run.id]).toBe(true);
  });
});

describe("simulation: push buttons", () => {
  test("held for as long as they're held", () => {
    const { p, pg } = project();
    const cct = addElement(p, pg, "rail", [0, 10], { params: { name: "CCT", length: 100 } });
    const ov = addElement(p, pg, "rail", [0, 60], { params: { name: "0V", length: 100 } });
    const b = addElement(p, pg, "pb-no", [20, 25]);
    const h = addElement(p, pg, "lamp", [20, 45]);
    connect(p, pg, [cct.id, "20"], [b.id, "13"]);
    connect(p, pg, [b.id, "14"], [h.id, "V+"]);
    connect(p, pg, [h.id, "V-"], [ov.id, "20"]);
    const c = compile(p);
    let s = hold(c, initialState(c), b.id, true);
    expect(s.lamps[h.id]).toBe(true);
    expect(operatedNow(c, s)[b.id]).toBe(true);
    s = hold(c, s, b.id, false);
    expect(s.lamps[h.id]).toBe(false);
  });
});

import { addGaItem, addGaPage } from "./ops";
import { deviceSize, gaCandidates, snapToRail } from "./ga";

describe("GA sheets", () => {
  test("devices from the schematic, sized from the library, snap onto rails, and leave the to-place list", () => {
    const { p, pg } = project();
    const k = addElement(p, pg, "coil", [20, 60]);
    const q = addElement(p, pg, "isolator", [40, 20], { params: { function: "breaker", poles: 2 } });
    const t1 = addElement(p, pg, "terminal", [60, 80], { params: { strip: "X1" } });
    const t2 = addElement(p, pg, "terminal", [63, 80], { params: { strip: "X1" } });
    addElement(p, pg, "lamp", [80, 60]);
    expect(deviceSize(p, k)).toEqual({ w: 16, h: 80 });
    expect(deviceSize(p, q)).toEqual({ w: 36, h: 90 });
    const ga = addGaPage(p, "", { scale: 5, enclosure: { w: 600, h: 800 }, view: "backplate" });
    let c = gaCandidates(p, (e) => e.symbol);
    expect(c.find((x) => x.refs.length === 2)?.refs).toEqual([t1.id, t2.id]); // the strip, together
    expect(c.find((x) => x.door)).toBeTruthy(); // the lamp goes on the door
    addGaItem(p, ga.id, { kind: "rail", x: 50, y: 100, w: 500, h: 35 });
    expect(snapToRail(ga, { x: 60, y: 90, w: 16, h: 80 })).toBe(77.5);
    addGaItem(p, ga.id, { kind: "device", x: 60, y: 77.5, w: 16, h: 80, refs: [k.id] });
    c = gaCandidates(p, (e) => e.symbol);
    expect(c.some((x) => x.refs.includes(k.id))).toBe(false);
    expect(() => addGaItem(p, ga.id, { kind: "device", x: 0, y: 0, w: 1, h: 1, refs: [k.id] })).toThrow(/already/);
  });
});
