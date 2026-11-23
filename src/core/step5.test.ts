/** v0.2 step 5: wires, labels and terminals. */
import { describe, expect, test } from "bun:test";
import { newProject } from "./model";
import { addElement, connect, setConductorInfo, splitSegment } from "./ops";
import { earthConductors, isScreenWire, numberedSegments, routeOf } from "./wires";
import { parseProject } from "./validate";

function project() {
  const p = newProject("t");
  const pg = p.pages[0]!.id;
  return { p, pg, page: p.pages[0]! };
}
const condOf = (p: ReturnType<typeof project>["p"], id: string, t: string) => p.conductors.find((c) => c.terminals.some(([x, y]) => x === id && y === t))!;

describe("wire colour on creation", () => {
  test("a busbar's colour is picked from the wire colours; typed names become codes (T4)", () => {
    const { p, pg } = project();
    const bar = addElement(p, pg, "rail", [10, 10], { params: { length: 40, colour: "blue" } });
    expect(bar.params.colour).toBe("Bu");
    const k = addElement(p, pg, "coil", [20, 30]);
    connect(p, pg, [bar.id, "10"], [k.id, "A1"]);
    expect(condOf(p, k.id, "A1").colour).toBe("Bu");
  });

  test("a wire from the far side of a fuse or contact takes the colour of the wire into it (T5)", () => {
    const { p, pg } = project();
    const f = addElement(p, pg, "fuse", [20, 20]);
    const k = addElement(p, pg, "contact-no", [40, 20]);
    const h = addElement(p, pg, "lamp", [60, 40]);
    const src = addElement(p, pg, "coil", [20, 5]);
    connect(p, pg, [src.id, "A2"], [f.id, "1"]);
    setConductorInfo(p, condOf(p, f.id, "1").id, { colour: "Rd" });
    connect(p, pg, [f.id, "2"], [k.id, "13"]);
    expect(condOf(p, f.id, "2").colour).toBe("Rd");
    connect(p, pg, [k.id, "14"], [h.id, "+V"]);
    expect(condOf(p, h.id, "+V").colour).toBe("Rd");
    // Once, on creation: changing the first wire later doesn't follow through.
    setConductorInfo(p, condOf(p, f.id, "1").id, { colour: "Bu" });
    expect(condOf(p, h.id, "+V").colour).toBe("Rd");
  });
});

describe("wire numbers", () => {
  test("printed once per conductor per sheet, on the longest run (15)", () => {
    const { p, pg, page } = project();
    const a = addElement(p, pg, "coil", [10, 10]);
    const b = addElement(p, pg, "coil", [60, 10]);
    const c = addElement(p, pg, "coil", [30, 40]);
    const ab = connect(p, pg, [a.id, "A2"], [b.id, "A2"]);
    const route = (s: (typeof page.segments)[number]) => routeOf(page, s);
    const pts = routeOf(page, ab);
    const j = splitSegment(p, pg, ab.id, [30, pts[0]![1]]);
    connect(p, pg, [j.id, "j"], [c.id, "A1"]);
    const segs = page.segments.filter((s) => s.conductor === condOf(p, c.id, "A1").id);
    expect(segs.length).toBeGreaterThanOrEqual(3);
    const shown = numberedSegments(page, earthConductors(p), route);
    expect(segs.filter((s) => shown.has(s.id)).length).toBe(1);
    // Asked for on another branch: that one instead, not as well.
    const other = segs.find((s) => !shown.has(s.id))!;
    other.showNumber = true;
    const again = numberedSegments(page, earthConductors(p), route);
    expect(segs.filter((s) => again.has(s.id)).map((s) => s.id)).toEqual([other.id]);
  });

  test("earth wires get no number unless asked (24); a screen's wire is a screen wire (26)", () => {
    const { p, pg, page } = project();
    const m = addElement(p, pg, "coil", [10, 10]);
    const e = addElement(p, pg, "earth", [10, 40]);
    const w = connect(p, pg, [m.id, "A2"], [e.id, "E"]);
    const route = (s: (typeof page.segments)[number]) => routeOf(page, s);
    expect(earthConductors(p).has(w.conductor)).toBe(true);
    expect(numberedSegments(page, earthConductors(p), route).has(w.id)).toBe(false);
    w.showNumber = true;
    expect(numberedSegments(page, earthConductors(p), route).has(w.id)).toBe(true);
    // An earth terminal makes its wires earth wires too.
    const t = addElement(p, pg, "terminal", [40, 40], { params: { function: "earth" } });
    const w2 = connect(p, pg, [m.id, "A1"], [t.id, "1"]);
    expect(earthConductors(p).has(w2.conductor)).toBe(true);
    const s = addElement(p, pg, "screen", [60, 20]);
    const w3 = connect(p, pg, [s.id, "E"], [t.id, "2"]);
    expect(isScreenWire(page, w3)).toBe(true);
  });
});

describe("pre-release files", () => {
  test("free-text busbar colours from the test builds become colour codes", () => {
    const { p, pg } = project();
    const bar = addElement(p, pg, "rail", [10, 10], { params: { length: 40 } });
    bar.params.colour = "black";
    const back = parseProject(JSON.parse(JSON.stringify(p)));
    expect(back.pages[0]!.elements.find((e) => e.id === bar.id)!.params.colour).toBe("Bk");
  });
});

describe("terminals", () => {
  test("an earth terminal in the block prints no number; its earth sign is centred in the cell (27, 13; v0.3 §2)", () => {
    const { localGeometry } = require("./symbols") as typeof import("./symbols");
    const { fitBlock, BLOCK_HALF } = require("./blocks") as typeof import("./blocks");
    const { p, pg, page } = project();
    page.boundaryY = 60;
    const t = addElement(p, pg, "terminal", [20, 60], { tag: "PE1", params: { function: "earth" } });
    t.params.onBlock = true;
    fitBlock(page);
    const half = typeof t.params.cellHalf === "number" ? t.params.cellHalf : BLOCK_HALF;
    expect(half).toBe(BLOCK_HALF);
    const g = localGeometry(t, "PE1");
    expect(g.prims.some((x) => x.t === "text" && x.role === "tag")).toBe(false);
    // The sign's lines are centred on the cell, across and up and down.
    const pts = g.prims.filter((x) => x.t === "line").flatMap((x) => (x.t === "line" ? x.pts : [])).filter(([, y]) => Math.abs(y) < half);
    const ys = pts.map(([, y]) => y);
    expect(Math.abs((Math.min(...ys) + Math.max(...ys)) / 2)).toBeLessThan(0.05);
    expect(g.terminals.find((x) => x.name === "1")!.at[1]).toBe(-half);
    // Off the block, the earth sign hangs off the terminal's side.
    t.params.onBlock = false;
    const off = localGeometry(t, "PE1");
    expect(off.prims.some((x) => x.t === "line" && x.pts.some(([px, py]) => px < -1 && py > 1))).toBe(true);
  });

  test("a terminal strip line puts the terminals it crosses on its strip (55)", () => {
    const { routePage } = require("./routing") as typeof import("./routing");
    const { p, pg, page } = project();
    const a = addElement(p, pg, "terminal", [20, 30]);
    const b = addElement(p, pg, "terminal", [24, 30]);
    const c = addElement(p, pg, "terminal", [40, 30]);
    addElement(p, pg, "strip-line", [18, 30], { params: { strip: "X0", length: 10 } });
    routePage(null, page);
    expect([a, b, c].map((e) => e.params.strip)).toEqual(["X0", "X0", "X1"]);
    // Upright too.
    const d = addElement(p, pg, "terminal", [60, 40]);
    addElement(p, pg, "strip-line", [60, 35], { rot: 90, params: { strip: "X9", length: 10 } });
    routePage(null, page);
    expect(d.params.strip).toBe("X9");
  });
});

describe("link arrows", () => {
  test("label at the tip, reference after it: right of a vertical wire, under a horizontal one (71)", () => {
    const { localGeometry } = require("./symbols") as typeof import("./symbols");
    const { p, pg } = project();
    const a = addElement(p, pg, "offpage", [20, 20], { label: "TO PUMP" });
    const g = localGeometry(a, { tag: "", label: "TO PUMP", xref: "2-14" });
    const lab = g.prims.find((x) => x.t === "text" && x.role === "label") as any;
    const ref = g.prims.find((x) => x.t === "text" && x.role === "xref") as any;
    expect(lab.at[0]).toBeGreaterThan(0);
    expect(ref.at[0]).toBeGreaterThan(lab.at[0] + 3);
    expect(ref.at[1]).toBe(lab.at[1]);
    a.rot = 270;
    const h = localGeometry(a, { tag: "", label: "TO PUMP", xref: "2-14" });
    const hl = h.prims.find((x) => x.t === "text" && x.role === "label") as any;
    expect(hl.at[1]).toBeGreaterThan(0.6);
  });

  test("Link… makes the clicked arrow the destination; it shows its source's label (70); or link to a new arrow", () => {
    const { linkArrows, linkToNewArrow } = require("./ops") as typeof import("./ops");
    const { elementTexts } = require("./tags") as typeof import("./tags");
    const { p, pg } = project();
    const a = addElement(p, pg, "offpage", [20, 20], { label: "FAN RUN" });
    const b = addElement(p, pg, "offpage", [80, 20]);
    linkArrows(p, a.id, b.id);
    expect(a.params.source).toBe(true);
    expect(b.params.source).toBe(false);
    expect(elementTexts(b, p).label).toBe("FAN RUN");
    b.params.sameLabel = false;
    b.label = "OWN";
    expect(elementTexts(b, p).label).toBe("OWN");
    const c = linkToNewArrow(p, a.id, pg, [100, 40]);
    expect(c.links).toEqual([a.id]);
    expect(a.links).toEqual([c.id]);
    expect(b.links).toEqual([]);
    expect(c.rot).toBe(180);
  });
});

describe("labels", () => {
  test("a label with a width wraps (28); the supply's label is centred on its arrows and grows upwards (65)", () => {
    const { localGeometry } = require("./symbols") as typeof import("./symbols");
    const { p, pg } = project();
    const k = addElement(p, pg, "coil", [20, 20], { label: "SUPPLY FAN RUN COMMAND", params: { labelWidth: 8 } });
    const lines = localGeometry(k, { tag: "K1" }).prims.filter((x) => x.t === "text" && x.role === "label");
    expect(lines.length).toBeGreaterThan(1);
    const s = addElement(p, pg, "supply", [40, 20], { label: "415V 3PH+N 50Hz FROM MAIN SWITCHBOARD", params: { labelWidth: 12 } });
    const sl = localGeometry(s, { tag: "" }).prims.filter((x) => x.t === "text" && x.role === "label") as any[];
    expect(sl.length).toBeGreaterThan(1);
    expect(sl.every((x) => x.anchor === "middle" && x.at[0] === 4.5)).toBe(true);
    // The last line stays just above the conductor names; the others go up.
    expect(sl[sl.length - 1].at[1]).toBe(-4.4);
    expect(sl[0].at[1]).toBeLessThan(-4.4);
  });
});

test("a short wire's number runs away from the busbar it lands on, not across it", () => {
  const { wireTexts } = require("./wires") as typeof import("./wires");
  const t = wireTexts([[46, 30], [46, 31]], { number: "3-24", railFrom: true });
  expect(t[0]!.at[1]).toBeGreaterThan(30.3);
});
