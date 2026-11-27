/** Third review: spare sheets, terminal strips, notes, revision list, legend, GA device table. */
import { describe, expect, test } from "bun:test";
import { legendEntries, legendTable, notesLayout, revisionRows, revisionTable } from "./annotations";
import { parseDeviceEntry, type DeviceEntry } from "./devices";
import { newProject } from "./model";
import {
  addElement,
  addGaItem,
  addGaPage,
  addProjectDevice,
  addSparePage,
  connect,
  removeProjectDevice,
  rotateGaItems,
  setGaItemDevice,
  setPageSpare,
  updateGaItem,
  updateProjectDevice,
  useLibraryDevice,
} from "./ops";
import { localGeometry } from "./symbols";
import { elementTexts } from "./tags";
import { textWidth } from "./textwidth";
import { parseProject } from "./validate";

function project() {
  const p = newProject("t");
  return { p, pg: p.pages[0]!.id };
}
const texts = (prims: { t: string }[]) => prims.filter((x) => x.t === "text").map((x) => (x as unknown as { text: string }).text);

describe("spare sheets", () => {
  test("take annotations only, survive a save, and can't be made from a drafted sheet", () => {
    const { p, pg } = project();
    const spare = addSparePage(p, pg);
    expect(spare.spare).toBe(true);
    expect(spare.title).toBe("Spare");
    expect(() => addElement(p, spare.id, "coil", [10, 10])).toThrow(/spare sheet/);
    addElement(p, spare.id, "text", [10, 10]);
    expect(parseProject(JSON.parse(JSON.stringify(p))).pages[1]!.spare).toBe(true);
    addElement(p, pg, "coil", [10, 10]);
    expect(() => setPageSpare(p, pg, true)).toThrow(/drawing items/);
    setPageSpare(p, spare.id, false);
    expect(spare.spare).toBeUndefined();
  });
});

describe("terminal strip identifier", () => {
  test("shows beside the terminal only when ticked", () => {
    const { p, pg } = project();
    const t = addElement(p, pg, "terminal", [10, 10], { params: { strip: "X2" } });
    expect(texts(localGeometry(t, elementTexts(t, p)).prims)).not.toContain("X2");
    t.params.showStrip = true;
    expect(texts(localGeometry(t, elementTexts(t, p)).prims)).toContain("X2");
  });
});

describe("notes", () => {
  test("headings and bold runs are bold, lists are numbered, long lines wrap", () => {
    const n = notesLayout("## Cables\n1. All wiring **1.0 mm²** unless noted\n- " + "word ".repeat(40), 1.8, 60);
    const t = n.prims.filter((x) => x.t === "text") as Extract<(typeof n.prims)[number], { t: "text" }>[];
    expect(t.find((x) => x.text === "Cables")?.bold).toBe(true);
    expect(t.find((x) => x.text === "1.0 mm²")?.bold).toBe(true);
    expect(t.find((x) => x.text.startsWith("All wiring"))?.bold).toBeFalsy();
    expect(t.some((x) => x.text === "1.")).toBe(true);
    // The long bullet wrapped: every line fits in the width.
    for (const x of t) expect(x.at[0] + textWidth(x.text, x.size)).toBeLessThanOrEqual(60.5);
    expect(n.prims.some((x) => x.t === "circle")).toBe(true);
  });

  test("tables draw a grid with a bold heading row", () => {
    const n = notesLayout("| Circuit | Cable |\n|---|---|\n| SF-01 | 4C SWA |\n| EF-01 | 4C SWA |", 1.8, 60);
    const t = n.prims.filter((x) => x.t === "text") as Extract<(typeof n.prims)[number], { t: "text" }>[];
    expect(t.find((x) => x.text === "Circuit")?.bold).toBe(true);
    expect(t.find((x) => x.text === "SF-01")?.bold).toBeFalsy();
    // 3 rows + bottom, 2 columns + left.
    expect(n.prims.filter((x) => x.t === "line").length).toBe(4 + 3);
  });
});

describe("revision list and symbol legend", () => {
  test("the revision list has the project's revisions and blank rows", () => {
    const { p, pg } = project();
    p.revisions = [{ rev: "A", date: "01/01/26", drawnBy: "AB", description: "First issue", clouds: [] }];
    const el = addElement(p, pg, "revtable", [10, 10], { params: { rows: 4 } });
    expect(texts(localGeometry(el, elementTexts(el, p)).prims)).toContain("First issue");
    expect(revisionRows(p)).toEqual([["A", "01/01/26", "First issue", "AB"]]);
    const t = revisionTable(revisionRows(p), 4, 1.8);
    expect(t.h).toBeCloseTo(5 * 1.8 * 1.8);
  });

  test("the legend has one of each kind of part, by name, without tags", () => {
    const { p, pg } = project();
    addElement(p, pg, "coil", [10, 10], { tag: "K1" });
    addElement(p, pg, "coil", [20, 10], { tag: "K2" });
    addElement(p, pg, "isolator", [30, 10], { params: { function: "breaker" } });
    addElement(p, pg, "isolator", [50, 10], { params: { function: "isolator" } });
    addElement(p, pg, "busbar", [0, 40], { params: { length: 140 } });
    addElement(p, pg, "text", [0, 50], { label: "not in the legend" });
    const e = legendEntries(p);
    const names = e.map((x) => x.name);
    expect(names.filter((n) => /coil/i.test(n)).length).toBe(1);
    expect(names.some((n) => /breaker/i.test(n))).toBe(true);
    expect(names.some((n) => /isolator/i.test(n))).toBe(true);
    expect(names.some((n) => /text/i.test(n))).toBe(false);
    const t = legendTable(e, 2, 1.8);
    expect(texts(t.prims)).not.toContain("K1");
    // Rails are drawn short in the legend.
    expect(t.w).toBeLessThan(150);
  });
});

describe("GA device table", () => {
  const relay: DeviceEntry = parseDeviceEntry({ id: "relay-4co", name: "Relay 4CO", maker: "Maker", part: "1234567", kind: "relay", w: 30.6, h: 101.8, d: 82.3 });

  test("picking a device sizes the part; a hand-sized part keeps its size when the device changes", () => {
    const { p, pg } = project();
    const k1 = addElement(p, pg, "coil", [20, 60]);
    const k2 = addElement(p, pg, "coil", [30, 60]);
    const ga = addGaPage(p, "", { scale: 5, enclosure: { w: 600, h: 800 }, view: "backplate" });
    const a = addGaItem(p, ga.id, { kind: "device", x: 100, y: 100, w: 16, h: 80, refs: [k1.id] });
    const b = addGaItem(p, ga.id, { kind: "device", x: 200, y: 100, w: 16, h: 80, refs: [k2.id] });
    const dev = useLibraryDevice(p, relay);
    setGaItemDevice(p, ga.id, a.id, dev.id);
    setGaItemDevice(p, ga.id, b.id, dev.id);
    expect([a.w, a.h, a.device]).toEqual([30.6, 101.8, "relay-4co"]);
    // b turned on its side, a sized by hand.
    rotateGaItems(p, ga.id, [b.id]);
    updateGaItem(p, ga.id, a.id, { w: 40 });
    // The library entry changes: the copy and b follow, a doesn't.
    useLibraryDevice(p, { ...relay, w: 27, h: 90 });
    expect(p.devices![0]!.w).toBe(27);
    expect([b.w, b.h]).toEqual([90, 27]);
    expect(a.w).toBe(40);
    // Back to the generic size.
    setGaItemDevice(p, ga.id, a.id, null, { w: 16, h: 80 });
    expect([a.w, a.h, a.device]).toEqual([16, 80, undefined]);
  });

  test("a project's own devices, and removing one leaves its parts sized", () => {
    const { p, pg } = project();
    const k = addElement(p, pg, "coil", [20, 60]);
    const ga = addGaPage(p, "", { scale: 5, enclosure: { w: 600, h: 800 }, view: "backplate" });
    const it = addGaItem(p, ga.id, { kind: "device", x: 100, y: 100, w: 16, h: 80, refs: [k.id] });
    const d = addProjectDevice(p, { name: "Timer", maker: "", part: "", kind: "timer", w: 22.5, h: 90, d: 0 });
    expect(d.library).toBe(false);
    setGaItemDevice(p, ga.id, it.id, d.id);
    updateProjectDevice(p, d.id, { w: 17.5 });
    expect(it.w).toBe(17.5);
    const back = parseProject(JSON.parse(JSON.stringify(p)));
    expect(back.devices?.[0]?.name).toBe("Timer");
    expect(back.pages[1]!.gaItems![0]!.device).toBe(d.id);
    removeProjectDevice(p, d.id);
    expect(it.device).toBeUndefined();
    expect(it.w).toBe(17.5);
  });

  test("a project can leave the shared library out", () => {
    const p = newProject("t");
    p.useDeviceLibrary = false;
    expect(parseProject(JSON.parse(JSON.stringify(p))).useDeviceLibrary).toBe(false);
    expect(parseProject(JSON.parse(JSON.stringify(newProject("u")))).useDeviceLibrary).toBeUndefined();
  });
});

describe("annotations and routing", () => {
  test("annotations aren't obstacles: a box round parts doesn't push wires about", async () => {
    const { p, pg } = project();
    const a = addElement(p, pg, "coil", [20, 20]);
    const b = addElement(p, pg, "coil", [20, 40]);
    addElement(p, pg, "box", [10, 25], { params: { w: 30, h: 10 } });
    connect(p, pg, [a.id, "A2"], [b.id, "A1"]);
    const { benchOf } = await import("./symbols");
    expect(benchOf({ symbol: "box" })).toBe("annotate");
  });
});

import { blockLabels, routesStale } from "./wires";
import { setBoundary, moveElements, rotateElements, updateElement, setManualRoute } from "./ops";
import { terminalPoint } from "./symbols";

describe("terminal block on the panel boundary", () => {
  test("terminals on the boundary become cells, follow it when it moves, and leave when moved off", () => {
    const { p, pg } = project();
    setBoundary(p, pg, 80);
    const t = addElement(p, pg, "terminal", [20, 80.5 as number]);
    expect(t.pos[1]).toBe(80); // dropped near it: snapped in
    expect(t.params.onBlock).toBe(true);
    const g = localGeometry(t, elementTexts(t, p));
    expect(g.body).toEqual({ x: -1, y: -2, w: 2, h: 4 });
    setBoundary(p, pg, 90);
    expect(t.pos[1]).toBe(90);
    moveElements(p, pg, [t.id], [0, -10]);
    expect(t.params.onBlock).toBeUndefined();
    moveElements(p, pg, [t.id], [0, 10]);
    expect(t.params.onBlock).toBe(true);
    rotateElements(p, pg, [t.id]);
    expect(t.params.onBlock).toBeUndefined(); // on its side: a circle again
  });

  test("strip names at the left end and where the strip changes", () => {
    const { p, pg } = project();
    setBoundary(p, pg, 80);
    for (const x of [10, 11, 12]) addElement(p, pg, "terminal", [x, 80], { params: { strip: "X1" } });
    for (const x of [30, 31]) addElement(p, pg, "terminal", [x, 80], { params: { strip: "X2" } });
    addElement(p, pg, "terminal", [50, 60], { params: { strip: "X9" } }); // not on the block
    expect(blockLabels(p.pages[0]!).map((l) => l.text)).toEqual(["X1", "X2"]);
    expect(blockLabels(p.pages[0]!)[1]!.x).toBeLessThan(30);
  });

  test("fused and disconnect terminals draw the fuse or knife above, and wires reroute to it", () => {
    const { p, pg } = project();
    setBoundary(p, pg, 80);
    const k = addElement(p, pg, "coil", [20, 60]);
    const t = addElement(p, pg, "terminal", [20, 80]);
    connect(p, pg, [k.id, "A2"], [t.id, "1"]);
    expect(terminalPoint(t, "1")).toEqual([20, 78]);
    updateElement(p, pg, t.id, { params: { function: "fuse" } });
    expect(terminalPoint(t, "1")).toEqual([20, 76]);
    expect(routesStale(p.pages[0]!)).toBe(true); // the editor and the print view route it again
    const lines = localGeometry(t, elementTexts(t, p)).prims.filter((x) => x.t === "line");
    expect(lines.length).toBeGreaterThan(2);
    // A switched fuse: the knife with the fuse on its blade.
    updateElement(p, pg, t.id, { params: { function: "fuse-disconnect" } });
    const sw = localGeometry(t, elementTexts(t, p)).prims.filter((x) => x.t === "line");
    expect(sw.length).toBeGreaterThan(lines.length);
    expect(terminalPoint(t, "1")).toEqual([20, 76]);
  });

  test("older files: terminals already on a boundary go into the block when loaded", () => {
    const { p, pg } = project();
    setBoundary(p, pg, 80);
    const t = addElement(p, pg, "terminal", [20, 80]);
    delete t.params.onBlock;
    expect(parseProject(JSON.parse(JSON.stringify(p))).pages[0]!.elements[0]!.params.onBlock).toBe(true);
  });
});

describe("sprint 1: hand-routed wires on half-unit terminals", () => {
  test("dragging a wire to a terminal block cell keeps its end on the terminal", () => {
    const { p, pg } = project();
    setBoundary(p, pg, 80);
    const k = addElement(p, pg, "coil", [20, 60]);
    const t = addElement(p, pg, "terminal", [30, 80]);
    const w = connect(p, pg, [k.id, "A2"], [t.id, "1"]);
    const end = terminalPoint(t, "1")!;
    expect(end[1]).toBe(78);
    const start = terminalPoint(k, "A2")!;
    // A dragged route: down from the coil, across, down onto the half-unit terminal.
    setManualRoute(p, pg, w.id, [start, [start[0], 70.2], [end[0], 70.2], end]);
    expect(w.points[0]).toEqual(start);
    expect(w.points[w.points.length - 1]).toEqual(end);
    for (let i = 0; i < w.points.length - 1; i++) {
      const [a, b] = [w.points[i]!, w.points[i + 1]!];
      expect(a[0] === b[0] || a[1] === b[1]).toBe(true);
    }
  });
});

describe("sprint 1: routing never loops", () => {
  test("two wires with swapped ends (testing note 4/23) route without loops or touching", async () => {
    const { loadServerAvoid } = await import("../server/avoid");
    const { routePage } = await import("./routing");
    const { p, pg } = project();
    const page = p.pages[0]!;
    const left = addElement(p, pg, "link", [40, 9], { rot: 180 });
    const right = addElement(p, pg, "link", [46, 9], { rot: 180 });
    const q = addElement(p, pg, "isolator", [24, 22], { params: { function: "isolator", poles: 3, aux: 2 } });
    const w1 = connect(p, pg, [left.id, "1"], [q.id, "13"]);
    const w2 = connect(p, pg, [right.id, "1"], [q.id, "23"]);
    routePage(await loadServerAvoid(), page);
    for (const w of [w1, w2]) {
      const pts = w.points;
      // Never visits a point twice, and every run is square.
      const seen = new Set(pts.map((x) => x.join(",")));
      expect(seen.size).toBe(pts.length);
      for (let i = 0; i < pts.length - 1; i++) expect(pts[i]![0] === pts[i + 1]![0] || pts[i]![1] === pts[i + 1]![1]).toBe(true);
      expect(pts.length).toBeLessThanOrEqual(6);
    }
    // The two wires don't share any point.
    const a = new Set(w1.points.map((x) => x.join(",")));
    expect(w2.points.some((x) => a.has(x.join(",")))).toBe(false);
  });
});

describe("sprint 1: straight wires stay straight", () => {
  test("a wire past a fuse's tag runs straight (testing note 66)", async () => {
    const { loadServerAvoid } = await import("../server/avoid");
    const { routePage } = await import("./routing");
    const { p, pg } = project();
    const page = p.pages[0]!;
    const sup = addElement(p, pg, "supply", [19, 89], { rot: 180, params: { system: "1ph-n" } });
    const q = addElement(p, pg, "isolator", [16, 57], { params: { function: "isolator", poles: 2, aux: 0 } });
    const f = addElement(p, pg, "fuse", [19, 74], { params: { poles: 1, rating: "100A BS88-3" } });
    f.tag = "F1-10";
    q.tag = "Q1-9";
    connect(p, pg, [sup.id, "L"], [f.id, "2"]);
    const n = connect(p, pg, [sup.id, "N"], [q.id, "2"]);
    routePage(await loadServerAvoid(), page);
    expect(n.points).toEqual([
      [16, 89],
      [16, 60],
    ]);
  });
});

describe("sprint 1: transformer polarity", () => {
  test("the secondary's live side follows the primary's (testing note 74)", async () => {
    const { compile, initialState } = await import("./sim");
    for (const swapped of [false, true]) {
      const { p, pg } = project();
      const sup = addElement(p, pg, "supply", [10, 6], { params: { system: "1ph-n" } });
      const t = addElement(p, pg, "transformer", [40, 30]);
      connect(p, pg, [sup.id, "L"], [t.id, swapped ? "P2" : "P1"]);
      connect(p, pg, [sup.id, "N"], [t.id, swapped ? "P1" : "P2"]);
      const h = addElement(p, pg, "lamp", [40, 60]);
      const w1 = connect(p, pg, [t.id, "S1"], [h.id, "+V"]);
      const w2 = connect(p, pg, [h.id, "-V"], [t.id, "S2"]);
      const c = compile(p);
      const s = initialState(c);
      expect(s.lamps[h.id]).toBe(true);
      const live = new Set(s.live);
      // The live node set holds the secondary terminal that's on the phase side.
      const s1 = [...live].some((x) => x.includes(t.id + ":S1") || x === w1.conductor);
      const s2 = [...live].some((x) => x.includes(t.id + ":S2") || x === w2.conductor);
      expect([s1, s2]).toEqual(swapped ? [false, true] : [true, false]);
    }
  });
});

describe("sprint 1: Incoming supply labels", () => {
  test("names sit beyond each arrow's tail at every rotation (testing note 64)", () => {
    const { p, pg } = project();
    for (const rot of [0, 90, 180, 270] as const) {
      const e = addElement(p, pg, "supply", [20, 20], { rot, params: { system: "3ph-n" } });
      const g = localGeometry(e, "");
      const names = g.prims.filter((q) => q.t === "text" && q.role === "term");
      expect(names.length).toBe(4);
      // Every name in its own place, and none on a lead.
      expect(new Set(names.map((q) => (q.t === "text" ? q.at.join(",") : ""))).size).toBe(4);
      for (const q of names) {
        if (q.t !== "text") continue;
        const along = rot === 90 || rot === 270 ? Math.abs(q.at[0]) : Math.abs(q.at[1]);
        expect(along).toBeGreaterThan(2.6);
      }
    }
  });
});
