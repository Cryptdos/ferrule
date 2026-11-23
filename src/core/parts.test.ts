/**
 * Parts as revised after the first review: lamp terminals and test pin,
 * isolator NC auxiliaries, timer functions, off-page directions, cable
 * screens, grouped plant terminals and wire colours.
 */
import { controlBusbars } from "./testing";
import { describe, expect, test } from "bun:test";
import { newProject } from "./model";
import {
  addElement,
  addPlant,
  connect,
  formatTerminalSpec,
  linkContact,
  linkOffpage,
  parseTerminalSpec,
  placePlantView,
  setConductorInfo,
  updateElement,
} from "./ops";
import { refreshConductors } from "./conductors";
import { compile, initialState, press, advance, stepTimer, timerEvent, toggle } from "./sim";
import { localGeometry, paramApplies, plantViewLayout, requireSymbol, terminalNames } from "./symbols";
import { textUnits } from "./geometry";
import { textWidth } from "./textwidth";
import { parseProject } from "./validate";
import { contactTable, linkedTarget } from "./xref";

function sheet() {
  const p = newProject("t");
  const pg = p.pages[0]!.id;
  const add = (s: string, x: number, y: number, params = {}) => addElement(p, pg, s, [x, y], { params });
  return { p, pg, add };
}

describe("lamps", () => {
  test("V+ and V-, with an optional test terminal on the supply side", () => {
    const { add } = sheet();
    expect(terminalNames(add("lamp", 10, 10))).toEqual(["V+", "V-"]);
    const t = add("lamp", 20, 10, { testPin: true });
    expect(terminalNames(t)).toEqual(["T", "V+", "V-"]);
    const g = localGeometry(t, "");
    const tt = g.terminals.find((x) => x.name === "T")!;
    expect(tt.at[1]).toBe(-3);
    expect(tt.dir).toBe("up");
  });

  test("the test terminal lights the lamp", () => {
    const { p, pg, add } = sheet();
    const { cct: cct, ov: ov } = controlBusbars(p, pg, 10, 80);
    const lt = add("pb-no", 30, 20);
    const h = add("lamp", 40, 60, { testPin: true });
    connect(p, pg, [cct.id, "30"], [lt.id, "13"]);
    connect(p, pg, [lt.id, "14"], [h.id, "T"]);
    connect(p, pg, [h.id, "V-"], [ov.id, "40"]);
    const c = compile(p);
    let s = initialState(c);
    expect(s.lamps[h.id]).toBe(false);
    s = toggle(c, s, lt.id); // hold the lamp test button
    expect(s.lamps[h.id]).toBe(true);
  });

});

describe("isolators", () => {
  test("NC auxiliaries number on after the NOs: 13/14 then 21/22", () => {
    const { add } = sheet();
    const q = add("isolator", 10, 10, { poles: 3, aux: 1, auxNc: 1 });
    expect(terminalNames(q)).toEqual(["1", "2", "3", "4", "5", "6", "13", "14", "21", "22"]);
  });

  test("only a switch-disconnector has an operator", () => {
    const { add } = sheet();
    const op = requireSymbol("isolator").params.find((x) => x.key === "operator")!;
    expect(paramApplies(op, add("isolator", 10, 10, { function: "isolator" }))).toBe(true);
    expect(paramApplies(op, add("isolator", 20, 10, { function: "breaker" }))).toBe(false);
    expect(paramApplies(op, add("isolator", 30, 10, { function: "contactor" }))).toBe(false);
    // A breaker set to a rotary handle before still draws no handle.
    const b = add("isolator", 40, 10, { function: "breaker", operator: "turn" });
    const turn = localGeometry(add("isolator", 50, 10, { function: "isolator", operator: "turn" }), "").prims.length;
    const none = localGeometry(add("isolator", 60, 10, { function: "isolator", operator: "none" }), "").prims.length;
    expect(turn).toBeGreaterThan(none);
    expect(localGeometry(b, "").prims.filter((x) => x.t === "line").length).toBeLessThan(turn);
  });

  test("a contactor's auxiliaries follow its coil, NC opening", () => {
    const { p, pg, add } = sheet();
    const { cct: cct, ov: ov } = controlBusbars(p, pg, 10, 80);
    const s = add("pb-no", 10, 20);
    const k = add("coil", 10, 60);
    connect(p, pg, [cct.id, "10"], [s.id, "13"]);
    connect(p, pg, [s.id, "14"], [k.id, "A1"]);
    connect(p, pg, [k.id, "A2"], [ov.id, "10"]);
    const q = add("isolator", 40, 30, { function: "contactor", poles: 3, aux: 0, auxNc: 1 });
    linkContact(p, q.id, k.id);
    const h = add("lamp", 70, 60);
    connect(p, pg, [cct.id, "70"], [q.id, "11"]);
    connect(p, pg, [q.id, "12"], [h.id, "V+"]);
    connect(p, pg, [h.id, "V-"], [ov.id, "70"]);
    expect(contactTable(p, k).map((r) => r[0])).toEqual(["Main", "NC"]);
    const c = compile(p);
    let st = initialState(c);
    expect(st.lamps[h.id]).toBe(true);
    st = toggle(c, st, s.id);
    expect(st.energised[k.id]).toBe(true);
    expect(st.lamps[h.id]).toBe(false);
  });
});

describe("timer functions", () => {
  const run = (mode: Parameters<typeof stepTimer>[0], edges: [number, boolean][], until: number, delay = 5) => {
    // Step a lone timer through energise/de-energise edges, sampling once a second.
    let done = false;
    let since: number | undefined;
    const out: number[] = [];
    for (let t = 0; t <= until; t++) {
      const e = edges.filter(([at]) => at <= t).at(-1)?.[1] ?? false;
      ({ done, since } = stepTimer(mode, delay, e, done, since, t));
      out.push(done ? 1 : 0);
    }
    return out.join("");
  };
  test("on-delay, off-delay, both", () => {
    expect(run("on", [[1, true], [12, false]], 14)).toBe("000000111111000");
    expect(run("off", [[1, true], [4, false]], 12)).toBe("0111111110000");
    expect(run("on-off", [[1, true], [8, false]], 15)).toBe("0000001111111000");
  });
  test("interval: on for the time, then off while still energised", () => {
    expect(run("interval", [[1, true], [12, false]], 13, 3)).toBe("01110000000000");
  });
  test("cyclic, ON first and OFF first", () => {
    expect(run("flash-on", [[0, true]], 9, 2)).toBe("1100110011");
    expect(run("flash-off", [[0, true]], 9, 2)).toBe("0011001100");
  });
  test("the next change of a flasher, and none for a timed-out on-delay", () => {
    expect(timerEvent("flash-on", 2, 0, 3)).toBe(4);
    expect(timerEvent("on", 5, 0, 7)).toBeNull();
    expect(timerEvent("on", 5, 0, 2)).toBe(5);
  });
  test("a flasher drives its contact in the simulator", () => {
    const { p, pg, add } = sheet();
    const { cct: cct, ov: ov } = controlBusbars(p, pg, 10, 80);
    const kt = add("timer-coil", 10, 60, { mode: "flash-on", time: "1s" });
    connect(p, pg, [cct.id, "10"], [kt.id, "A1"]);
    connect(p, pg, [kt.id, "A2"], [ov.id, "10"]);
    const tc = add("timer-contact", 40, 30);
    linkContact(p, tc.id, kt.id);
    const h = add("lamp", 40, 60);
    connect(p, pg, [cct.id, "40"], [tc.id, "17"]);
    connect(p, pg, [tc.id, "18"], [h.id, "V+"]);
    connect(p, pg, [h.id, "V-"], [ov.id, "40"]);
    const c = compile(p);
    let s = initialState(c);
    expect(s.lamps[h.id]).toBe(true);
    s = advance(c, s, 1);
    expect(s.lamps[h.id]).toBe(false);
    s = advance(c, s, 1);
    expect(s.lamps[h.id]).toBe(true);
    void press;
  });
});

describe("off-page arrows", () => {
  test("pairing turns the other one round so one goes and one comes", () => {
    const { p, add } = sheet();
    const a = add("offpage", 10, 10);
    const b = add("offpage", 50, 10);
    linkOffpage(p, a.id, b.id);
    expect(b.params.source).toBe(false);
    expect(linkedTarget(p, a)).toBe(b.id);
    expect(linkedTarget(p, b)).toBe(a.id);
    // Coming and going are drawn differently.
    const fills = (el: typeof a) => localGeometry(el, "").prims.filter((x) => x.t === "poly" && x.fill).length;
    expect(fills(a)).toBe(0);
    expect(fills(b)).toBe(1);
  });
});

describe("cable screen", () => {
  test("spans its cores and has a drain terminal, but no body for wires to route round", () => {
    const { add } = sheet();
    const s = add("screen", 10, 10, { span: 6 });
    const g = localGeometry(s, "W1");
    expect(g.body.w).toBe(0);
    expect(g.terminals.map((t) => t.name)).toEqual(["E"]);
    expect(g.prims.some((x) => x.t === "ellipse" && x.rx > 3)).toBe(true);
    expect(terminalNames(add("screen", 30, 10, { drain: "none" }))).toEqual([]);
  });
});

describe("plant terminal groups", () => {
  test("written as one line and read back", () => {
    const spec = parseTerminalSpec("L N E | ENABLE: 1 2 | 0-10V: 3, 4 | FAULT: 5 6");
    expect(spec.terminals).toEqual(["L", "N", "E", "1", "2", "3", "4", "5", "6"]);
    expect(spec.groups.map((g) => g.name)).toEqual(["ENABLE", "0-10V", "FAULT"]);
    expect(formatTerminalSpec(spec)).toBe("L N E | ENABLE: 1 2 | 0-10V: 3 4 | FAULT: 5 6");
  });

  test("the box is as wide as its terminals, with room for each group name", () => {
    const { p, pg } = sheet();
    const spec = parseTerminalSpec("1 2 | ENABLE: 3 4 | 0-10V: 5 6");
    const item = addPlant(p, "SF-01", "SUPPLY FAN", spec.terminals, { groups: spec.groups, info: "MODEL X\n7.5kW" });
    const v = placePlantView(p, pg, item.id, [20, 90]);
    const lay = plantViewLayout(v);
    const xs = lay.terms.map((t) => t.x);
    expect(xs[0]).toBe(0);
    // 1 unit apart within a group, like terminal block cells; more between groups.
    expect(xs.slice(0, 2)).toEqual([0, 1]);
    for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBeGreaterThanOrEqual(1);
    expect(lay.right - lay.left).toBeLessThan(xs.at(-1)! + 8);
    // Group names don't overlap.
    const nameW = (n: string) => textWidth(n, textUnits("tag"));
    const spans = lay.groups.map((g) => [(g.x0 + g.x1) / 2 - nameW(g.name) / 2, (g.x0 + g.x1) / 2 + nameW(g.name) / 2]);
    for (let i = 1; i < spans.length; i++) expect(spans[i]![0]).toBeGreaterThan(spans[i - 1]![1]);
    // Information lines go under the box.
    const g = localGeometry(v, "SF-01");
    const texts = g.prims.filter((x) => x.t === "text").map((x) => (x.t === "text" ? x.text : ""));
    expect(texts).toContain("MODEL X");
    expect(texts).toContain("7.5kW");
    expect(g.prims.some((x) => x.t === "text" && x.text === "ENABLE")).toBe(true);
    // Every plant box is the same height.
    expect(g.body.h).toBe(6);
  });

  test("the same terminal names in two groups are told apart: R1: C NO NC | R2: C NO NC", () => {
    const spec = parseTerminalSpec("R1: C NO NC | R2: C NO NC");
    expect(spec.terminals).toEqual(["R1.C", "R1.NO", "R1.NC", "R2.C", "R2.NO", "R2.NC"]);
    expect(formatTerminalSpec(spec)).toBe("R1: C NO NC | R2: C NO NC");
    const { p, pg } = sheet();
    const item = addPlant(p, "", "DPS", spec.terminals, { groups: spec.groups, prefix: "DPS" });
    const v = placePlantView(p, pg, item.id, [20, 90]);
    const lay = plantViewLayout(v);
    expect(lay.terms.map((t) => t.name)).toEqual(["C", "NO", "NC", "C", "NO", "NC"]);
    expect(lay.terms.map((t) => t.id)).toContain("R2.NC");
  });

  test("a plant whose power is by others gets a break on its left", () => {
    const { p, pg } = sheet();
    const item = addPlant(p, "", "LIFT 2", ["1", "2"], { prefix: "LIFT", powerByOthers: true });
    const v = placePlantView(p, pg, item.id, [20, 90]);
    const texts = localGeometry(v, "").prims.filter((x) => x.t === "text").map((x) => (x.t === "text" ? x.text : ""));
    expect(texts).toContain("POWER BY");
  });
});

describe("wire colour and function", () => {
  test("kept on the conductor through rewiring", () => {
    const { p, pg, add } = sheet();
    const a = add("coil", 10, 10);
    const b = add("lamp", 10, 30);
    const s = connect(p, pg, [a.id, "A2"], [b.id, "V+"]);
    setConductorInfo(p, s.conductor, { colour: "bu", function: "0V" });
    refreshConductors(p);
    const c = p.conductors.find((x) => x.id === s.conductor)!;
    expect(c.colour).toBe("Bu");
    expect(c.function).toBe("0V");
    setConductorInfo(p, s.conductor, { colour: "" });
    expect(p.conductors.find((x) => x.id === s.conductor)!.colour).toBeUndefined();
    void updateElement;
  });
});

describe("wire text placement", () => {
  test("colour at the source end, number just after it, function at both terminal ends", () => {
    const { wireTexts } = require("./wires") as typeof import("./wires");
    const pts: [number, number][] = [
      [10, 10],
      [10, 40],
    ];
    const t = wireTexts(pts, { number: "17-38", colour: "Bu", func: "0V", labelFrom: true, labelTo: true });
    const colour = t.find((x) => x.role === "colour")!;
    const num = t.find((x) => x.role === "number")!;
    expect(colour.text).toBe("Bu");
    expect(colour.vertical).toBe(true);
    // Colour nearer the source (top), number after it, both beside the wire.
    expect(colour.at[1]).toBeLessThan(num.at[1]);
    expect(colour.at[1]).toBeLessThan(14);
    const fn = t.filter((x) => x.role === "function");
    expect(fn.map((x) => x.text)).toEqual(["0V", "0V"]);
    expect(fn[0]!.at[1]).toBeLessThan(15);
    expect(fn[1]!.at[1]).toBeGreaterThan(35);
    // No function at a rail or junction end.
    expect(wireTexts(pts, { func: "0V", labelFrom: false, labelTo: true }).length).toBe(1);
    // No colour: the number goes mid-wire as before.
    const plain = wireTexts(pts, { number: "17-38" });
    expect(plain[0]!.at[1]).toBe(25);
  });

  test("colour codes are written with a capital first letter", () => {
    const { colourCode } = require("./wirecolours") as typeof import("./wirecolours");
    expect(colourCode("BU")).toBe("Bu");
    expect(colourCode("gnye")).toBe("GnYe");
    expect(colourCode("Blue")).toBe("Blue");
    expect(colourCode("RD")).toBe("Rd");
  });
});
