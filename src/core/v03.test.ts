import { describe, expect, test } from "bun:test";
import { newProject } from "./model";
import { addDistribution, addElement, connect } from "./ops";
import { renumber } from "./renumber";
import { gaCandidates, sizeKey } from "./ga";
import { netJoins } from "./conductors";
import { getSymbol, isBar, localGeometry } from "./symbols";
import { displayTag, elementTexts } from "./tags";
import { parseProject } from "./validate";
import { compile, initialState } from "./sim";

function project() {
  const p = newProject("t");
  return { p, pg: p.pages[0]!.id };
}

describe("busbars split in two (v0.3 §1)", () => {
  test("a distribution block is tagged W and named so; a power rail has no tag", () => {
    const { p, pg } = project();
    const block = addElement(p, pg, "busbar", [10, 10], { params: { name: "L1", length: 30 } });
    const rail = addElement(p, pg, "rail", [10, 30], { params: { name: "CCT", length: 30 } });
    renumber(p);
    expect(getSymbol("busbar")!.name).toBe("Distribution block");
    expect(getSymbol("rail")!.name).toBe("Power rail");
    expect(displayTag(block, p)).toMatch(/^W1-/);
    expect(displayTag(rail, p)).toBe("");
    expect(isBar(block) && isBar(rail)).toBe(true);
    // Drawn heavy and in the control weight.
    const width = (el: typeof block) => {
      const prim = localGeometry(el, elementTexts(el, p)).prims.find((x) => x.t === "line");
      return prim && prim.t === "line" ? (prim.w ?? 0) : 0;
    };
    expect(width(block)).toBeGreaterThan(width(rail));
    expect(getSymbol("busbar")!.params.some((x) => x.key === "style")).toBe(false);
  });

  test("only distribution blocks are GA parts: a power rail isn't offered in Place parts", () => {
    const { p, pg } = project();
    const block = addElement(p, pg, "busbar", [10, 10], { params: { length: 30 } });
    const rail = addElement(p, pg, "rail", [10, 30], { params: { length: 30 } });
    renumber(p);
    expect(sizeKey(p, block)?.key).toBe("block");
    expect(sizeKey(p, rail)).toBeNull();
    const refs = gaCandidates(p, (el) => el.tag).flatMap((c) => c.refs);
    expect(refs).toContain(block.id);
    expect(refs).not.toContain(rail.id);
  });

  test("both join everything on the same distribution", () => {
    const { p, pg } = project();
    const cct = addDistribution(p, { name: "CCT", kind: "dc+" });
    const a = addElement(p, pg, "busbar", [0, 10], { params: { dist: cct.id, length: 40 } });
    const b = addElement(p, pg, "rail", [0, 30], { params: { dist: cct.id, length: 40 } });
    const t1 = addElement(p, pg, "terminal", [10, 20]);
    const t2 = addElement(p, pg, "terminal", [20, 40]);
    connect(p, pg, [a.id, "10"], [t1.id, "1"]);
    connect(p, pg, [b.id, "20"], [t2.id, "1"]);
    const joins = netJoins(p);
    expect(joins.some((j) => (j.a[0] === a.id && j.b[0] === b.id) || (j.a[0] === b.id && j.b[0] === a.id))).toBe(true);
    // A rail on a DC + distribution is a supply in simulation, as a busbar was.
    const m = compile(p);
    expect(() => initialState(m)).not.toThrow();
  });

  test("files: control busbars become control rails, the rest distribution blocks; style goes", () => {
    const { p, pg } = project();
    addElement(p, pg, "busbar", [0, 10], { params: { length: 40 } });
    addElement(p, pg, "busbar", [0, 30], { params: { length: 40 } });
    const json = JSON.parse(JSON.stringify(p));
    json.pages[0].elements[0].params.style = "control";
    json.pages[0].elements[1].params.style = "distribution";
    const q = parseProject(json);
    const [r, d] = q.pages[0]!.elements;
    expect(r!.symbol).toBe("rail");
    expect(d!.symbol).toBe("busbar");
    expect(r!.params.style).toBeUndefined();
    expect(d!.params.style).toBeUndefined();
  });
});

describe("terminals a column apart (v0.3 §2)", () => {
  test("files: terminals 1 unit apart in the block spread to 2, keeping their order; tags no longer share a column", async () => {
    const { setBoundary } = await import("./ops");
    const { p, pg } = project();
    setBoundary(p, pg, 70);
    const a = addElement(p, pg, "terminal", [30, 70]);
    const b = addElement(p, pg, "terminal", [34, 70]);
    const json = JSON.parse(JSON.stringify(p));
    // As a 0.2 build saved them: one unit apart.
    json.pages[0].elements[0].pos = [30, 70];
    json.pages[0].elements[1].pos = [31, 70];
    const q = parseProject(json);
    const [qa, qb] = q.pages[0]!.elements;
    expect(qa!.pos[0]).toBe(30);
    expect(qb!.pos[0]).toBe(32);
    renumber(q);
    expect(qa!.tag).not.toBe(qb!.tag);
    expect(qb!.tag.endsWith("A")).toBe(false);
    void a;
    void b;
  });

  test("a terminal dropped next to another in the block keeps a column clear of it", () => {
    const { p, pg } = project();
    const page = p.pages[0]!;
    page.boundaryY = 70;
    const a = addElement(p, pg, "terminal", [30, 70]);
    const b = addElement(p, pg, "terminal", [31, 70]);
    expect(Math.abs(b.pos[0] - a.pos[0])).toBeGreaterThanOrEqual(2);
  });

  test("terminal, pin and wire numbers are 2.5 mm; cells are a column wide", async () => {
    const { textUnits } = await import("./geometry");
    const { wireTexts } = await import("./wires");
    const { p, pg } = project();
    const page = p.pages[0]!;
    page.boundaryY = 70;
    const t = addElement(p, pg, "terminal", [30, 70]);
    const free = addElement(p, pg, "terminal", [30, 20]);
    const sizeOf = (el: typeof t) => {
      const x = localGeometry(el, "7-30").prims.find((q) => q.t === "text" && q.role === "tag");
      return x && x.t === "text" ? x.size : 0;
    };
    expect(sizeOf(t)).toBeCloseTo(textUnits("tag"));
    expect(sizeOf(free)).toBeCloseTo(textUnits("tag"));
    expect(localGeometry(t, "7-30").body.w).toBe(2);
    const w = wireTexts(
      [
        [0, 0],
        [0, 30],
      ],
      { number: "7-30", colour: "Bu", func: "0V" },
    );
    expect(w.find((x) => x.role === "number")!.size).toBe("tag");
    expect(w.find((x) => x.role === "colour")!.size).toBe("detail");
  });
});

describe("terminal order on the GA (v0.3 §2, 28)", () => {
  test("a strip lists its terminals by sheet, then left to right, earth terminals in their place", async () => {
    const { addPage } = await import("./ops");
    const { p, pg } = project();
    const page = p.pages[0]!;
    page.boundaryY = 70;
    const c = addElement(p, pg, "terminal", [50, 70]);
    const a = addElement(p, pg, "terminal", [20, 70]);
    const e = addElement(p, pg, "terminal", [30, 70], { params: { function: "earth" } });
    const pg2 = addPage(p, "two");
    pg2.boundaryY = 70;
    const d = addElement(p, pg2.id, "terminal", [10, 70]);
    renumber(p);
    const strip = gaCandidates(p, (el) => el.tag).find((x) => x.refs.length > 1)!;
    expect(strip.refs).toEqual([a.id, e.id, c.id, d.id]);
    // The earth terminal keeps its hidden address for schedules and the GA.
    expect(e.tag).not.toBe("");
  });
});

describe("terminals drive wire numbers (v0.3 §2, 33)", () => {
  test("a wire on a terminal takes its number; a wire on none is numbered from its highest end", async () => {
    const { setConductorNumber } = await import("./ops");
    const { checkProject } = await import("./checks");
    const { p, pg } = project();
    const page = p.pages[0]!;
    page.boundaryY = 70;
    const k = addElement(p, pg, "coil", [61, 40]);
    const t = addElement(p, pg, "terminal", [59, 70]);
    const k2 = addElement(p, pg, "coil", [80, 20]);
    const k3 = addElement(p, pg, "coil", [80, 40]);
    connect(p, pg, [k.id, "A2"], [t.id, "1"]);
    connect(p, pg, [k2.id, "A2"], [k3.id, "A1"]);
    renumber(p);
    const cond = (ref: [string, string]) => p.conductors.find((c) => c.terminals.some(([id, n]) => id === ref[0] && n === ref[1]))!;
    // The coil sits in column 31, the terminal in 30: the wire is the terminal's.
    expect(t.tag).toBe("1-30");
    expect(cond([k.id, "A2"]).number).toBe("1-30");
    expect(cond([k2.id, "A2"]).number).toBe("1-41");
    // A locked number that disagrees stays, and Check says so.
    setConductorNumber(p, cond([k.id, "A2"]).id, "1-99");
    renumber(p);
    expect(cond([k.id, "A2"]).number).toBe("1-99");
    expect(checkProject(p).some((f) => f.message.includes("wire 1-99 is locked but lands on terminal X1:1-30"))).toBe(true);
  });

  test("a conductor through two terminals takes the first along the strip, by sheet then left to right", async () => {
    const { addPage } = await import("./ops");
    const { p, pg } = project();
    p.pages[0]!.boundaryY = 70;
    const a = addElement(p, pg, "terminal", [40, 70]);
    const b = addElement(p, pg, "terminal", [20, 70]);
    connect(p, pg, [a.id, "1"], [b.id, "1"]);
    const pg2 = addPage(p, "two");
    void pg2;
    renumber(p);
    const c = p.conductors.find((x) => x.terminals.some(([id]) => id === a.id))!;
    expect(c.number).toBe(b.tag);
    expect(c.number).toBe("1-11");
  });

  test("a positional wire number steps aside for a terminal's", () => {
    const { p, pg } = project();
    p.pages[0]!.boundaryY = 70;
    // A wire starting at column 30 that is on no terminal, and a terminal in column 30.
    const k1 = addElement(p, pg, "coil", [59, 10]);
    const k2 = addElement(p, pg, "coil", [59, 30]);
    connect(p, pg, [k1.id, "A2"], [k2.id, "A1"]);
    const k3 = addElement(p, pg, "coil", [70, 40]);
    const t = addElement(p, pg, "terminal", [58, 70]);
    connect(p, pg, [k3.id, "A2"], [t.id, "1"]);
    renumber(p);
    const free = p.conductors.find((x) => x.terminals.some(([id]) => id === k1.id))!;
    const onT = p.conductors.find((x) => x.terminals.some(([id]) => id === t.id))!;
    expect(onT.number).toBe(t.tag);
    expect(free.number).not.toBe(onT.number);
  });
});

describe("link arrows: wire number and bracketed reference (v0.3 §2)", () => {
  test("an arrow shows the wire number it carries and its partner in brackets", async () => {
    const { addPage, linkOffpage } = await import("./ops");
    const { p, pg } = project();
    const k = addElement(p, pg, "coil", [20, 20]);
    const out = addElement(p, pg, "offpage", [20, 40]);
    connect(p, pg, [k.id, "A2"], [out.id, "1"]);
    const pg2 = addPage(p, "two");
    const inn = addElement(p, pg2.id, "offpage", [30, 20], { rot: 180 });
    const h = addElement(p, pg2.id, "lamp", [30, 40]);
    connect(p, pg2.id, [inn.id, "1"], [h.id, "+V"]);
    linkOffpage(p, out.id, inn.id);
    renumber(p);
    const t = elementTexts(out, p);
    const n = p.conductors.find((c) => c.terminals.some(([id]) => id === out.id))!.number;
    expect(n).not.toBe("");
    expect(t.wire).toBe(n);
    expect(elementTexts(inn, p).wire).toBe(n);
    expect(t.xref).toMatch(/^\(2-\d+\)$/);
    // Drawn horizontal, at the tag size.
    const prim = localGeometry(out, t).prims.find((x) => x.t === "text" && x.text === n);
    expect(prim && prim.t === "text" && !prim.vertical).toBe(true);
    // A typed reference is bracketed too, never twice.
    // An unlinked arrow carries no typed reference (v0.5 A23): there's nothing to set by hand.
    const lone = addElement(p, pg, "offpage", [60, 40]);
    expect(elementTexts(lone, p).xref).toBe("");
  });

  test("an arrow dropped straight onto a pin is on that pin's conductor and shows its number (32)", async () => {
    const { terminalPoint } = await import("./symbols");
    const { p, pg } = project();
    const k = addElement(p, pg, "coil", [20, 20]);
    const k2 = addElement(p, pg, "coil", [40, 20]);
    connect(p, pg, [k.id, "A2"], [k2.id, "A2"]);
    // The arrow's terminal (2 up from its origin) right on the coil's A2.
    const a2 = terminalPoint(k, "A2")!;
    const arrow = addElement(p, pg, "offpage", [a2[0], a2[1] + 2]);
    expect(terminalPoint(arrow, "1")).toEqual(a2);
    renumber(p);
    const c = p.conductors.find((x) => x.terminals.some(([id]) => id === k.id))!;
    expect(c.terminals.some(([id]) => id === arrow.id)).toBe(true);
    expect(elementTexts(arrow, p).wire).toBe(c.number);
  });
});

describe("alignment tools (design-v0.3 §5)", () => {
  test("one item aligns to the sheet's usable space; several to the first picked", async () => {
    const { alignElements, USABLE } = await import("./align");
    const { p, pg } = project();
    const a = addElement(p, pg, "coil", [20, 30]);
    const b = addElement(p, pg, "coil", [50, 41]);
    const body = (el: typeof a) => {
      const g = localGeometry(el, "");
      return { x: el.pos[0] + g.body.x, y: el.pos[1] + g.body.y, w: g.body.w, h: g.body.h };
    };
    // Centre one on the sheet, across and down.
    alignElements(p, pg, [a.id], "centre");
    alignElements(p, pg, [a.id], "middle");
    const ra = body(a);
    expect(Math.abs(ra.x + ra.w / 2 - USABLE.w / 2)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(ra.y + ra.h / 2 - USABLE.h / 2)).toBeLessThanOrEqual(0.5);
    // Then the first lines up with the second: the last clicked stays put (v0.5 A54).
    const before: [number, number] = [b.pos[0], b.pos[1]];
    alignElements(p, pg, [a.id, b.id], "centre");
    expect(b.pos).toEqual(before);
    expect(body(a).x + body(a).w / 2).toBeCloseTo(body(b).x + body(b).w / 2, 0);
    const top = body(a).y;
    alignElements(p, pg, [b.id, a.id], "top");
    expect(body(a).y).toBe(top);
    expect(body(b).y).toBe(top);
  });

  test("a box selection aligns to the outline around them all", async () => {
    const { alignElements } = await import("./align");
    const { p, pg } = project();
    const a = addElement(p, pg, "coil", [20, 30]);
    const b = addElement(p, pg, "coil", [50, 10]);
    alignElements(p, pg, [a.id, b.id], "top", true);
    expect(a.pos[1]).toBe(10);
    expect(b.pos[1]).toBe(10);
  });

  test("distribute keeps the outer two and makes the gaps between bodies equal", async () => {
    const { distributeElements } = await import("./align");
    const { p, pg } = project();
    const a = addElement(p, pg, "coil", [10, 30]);
    const b = addElement(p, pg, "lamp", [14, 30]);
    const c = addElement(p, pg, "coil", [50, 30]);
    distributeElements(p, pg, [a.id, b.id, c.id], "across");
    expect(a.pos[0]).toBe(10);
    expect(c.pos[0]).toBe(50);
    const box = (el: typeof a) => {
      const g = localGeometry(el, "");
      return [el.pos[0] + g.body.x, el.pos[0] + g.body.x + g.body.w];
    };
    const gap1 = box(b)[0]! - box(a)[1]!;
    const gap2 = box(c)[0]! - box(b)[1]!;
    expect(Math.abs(gap1 - gap2)).toBeLessThanOrEqual(1);
  });

  test("an aligned part's wires follow it, as if dragged", async () => {
    const { alignElements } = await import("./align");
    const { p, pg } = project();
    const a = addElement(p, pg, "coil", [20, 30]);
    const b = addElement(p, pg, "coil", [40, 50]);
    connect(p, pg, [a.id, "A2"], [b.id, "A1"]);
    alignElements(p, pg, [a.id, b.id], "centre");
    expect(a.pos[0]).toBe(40);
    expect(p.pages[0]!.segments).toHaveLength(1);
  });
});

describe("alignment on a GA (design-v0.3 §5)", () => {
  test("GA items align in whole mm to the last picked, and distribute down", async () => {
    const { alignGaItems, distributeGaItems } = await import("./align");
    const { addGaPage, addGaItem } = await import("./ops");
    const { p } = project();
    const ga = addGaPage(p, "", { scale: 5, enclosure: { w: 600, h: 800 }, view: "backplate" });
    const a = addGaItem(p, ga.id, { kind: "rail", x: 100.5, y: 100, w: 40, h: 10 });
    const b = addGaItem(p, ga.id, { kind: "rail", x: 230, y: 140, w: 20, h: 10 });
    const c = addGaItem(p, ga.id, { kind: "rail", x: 160, y: 400, w: 30, h: 10 });
    alignGaItems(p, ga.id, [a.id, b.id, c.id], "left");
    expect(c.x).toBe(160);
    expect(b.x).toBe(c.x);
    expect(Math.abs(a.x - c.x)).toBeLessThanOrEqual(0.5);
    distributeGaItems(p, ga.id, [a.id, b.id, c.id], "down");
    expect(b.y - (a.y + a.h)).toBeCloseTo(c.y - (b.y + b.h), 0);
  });
});

describe("GA detail sheets (design-v0.3 §6)", () => {
  async function setup() {
    const ops = await import("./ops");
    const ga = await import("./ga");
    const { p } = project();
    const door = ops.addGaPage(p, "", { scale: 12.5, enclosure: { w: 600, h: 800 }, view: "door-front" });
    const det = ops.addGaPage(p, "", { scale: 1, enclosure: { w: 1, h: 1 }, view: "detail" });
    return { p, ops, ga, door, det };
  }

  test("a detail is lettered A, B… across the project; its letter can be changed but not to one taken", async () => {
    const { p, ops, door } = await setup();
    const a = ops.addGaItem(p, door.id, { kind: "detail", x: 50, y: 50, w: 120, h: 60 });
    const b = ops.addGaItem(p, door.id, { kind: "detail", x: 50, y: 150, w: 120, h: 60 });
    expect([a.letter, b.letter]).toEqual(["A", "B"]);
    expect(() => ops.updateGaItem(p, door.id, b.id, { letter: "a" })).toThrow();
    ops.updateGaItem(p, door.id, b.id, { letter: "x" });
    expect(b.letter).toBe("X");
  });

  test("a frame shows one detail at the largest standard scale that fits; it follows the detail's size", async () => {
    const { p, ops, ga, door, det } = await setup();
    const a = ops.addGaItem(p, door.id, { kind: "detail", x: 50, y: 50, w: 120, h: 60, text: "Supply fan" });
    const f = ops.addGaItem(p, det.id, { kind: "frame", detail: a.id, x: 0, y: 0, w: 1, h: 1 });
    expect(f.zoom).toBe(2);
    expect([f.w, f.h]).toEqual([240, 120]);
    expect(ga.frameCaption(p, f)).toBe(`DETAIL A: SUPPLY FAN, 2:1 (${door.number})`);
    expect(ga.detailLabel(p, a)).toBe(`A (${det.number})`);
    // One frame per detail.
    expect(() => ops.addGaItem(p, det.id, { kind: "frame", detail: a.id, x: 0, y: 0, w: 1, h: 1 })).toThrow();
    // Resizing the detail resizes the frame; changing the frame's scale too.
    ops.updateGaItem(p, door.id, a.id, { w: 100 });
    expect(f.w).toBe(200);
    ops.updateGaItem(p, det.id, f.id, { zoom: 0.5 });
    expect([f.w, f.h]).toEqual([50, 30]);
    // Only frames go on a detail sheet, and frames go nowhere else.
    expect(() => ops.addGaItem(p, det.id, { kind: "rail", x: 0, y: 0, w: 100, h: 35 })).toThrow();
    expect(() => ops.addGaItem(p, door.id, { kind: "frame", detail: a.id, x: 0, y: 0, w: 1, h: 1 })).toThrow();
    // Deleting the detail takes its frame with it.
    ops.deleteGaItems(p, door.id, [a.id]);
    expect(det.gaItems).toHaveLength(0);
  });

  test("Check warns about a detail with no frame; files keep details and frames", async () => {
    const { checkProject } = await import("./checks");
    const { p, ops, door, det } = await setup();
    const a = ops.addGaItem(p, door.id, { kind: "detail", x: 50, y: 50, w: 120, h: 60 });
    expect(checkProject(p).some((x) => x.message.includes("detail A isn't shown"))).toBe(true);
    ops.addGaItem(p, det.id, { kind: "frame", detail: a.id, x: 10, y: 10, w: 1, h: 1, zoom: 1 });
    expect(checkProject(p).some((x) => x.message.includes("detail A isn't shown"))).toBe(false);
    const q = parseProject(JSON.parse(JSON.stringify(p)));
    const qd = q.pages.find((x) => x.id === det.id)!;
    expect(qd.ga!.view).toBe("detail");
    expect(qd.gaItems![0]).toMatchObject({ kind: "frame", detail: a.id, zoom: 1 });
    expect(q.pages.find((x) => x.id === door.id)!.gaItems![0]).toMatchObject({ kind: "detail", letter: "A" });
  });
});

describe("editing through a frame (design-v0.3 §6)", () => {
  test("a frame maps its sheet to the source's mm and back; a frame's dimension stays with the frame", async () => {
    const ops = await import("./ops");
    const ga = await import("./ga");
    const { p } = project();
    const door = ops.addGaPage(p, "", { scale: 12.5, enclosure: { w: 600, h: 800 }, view: "door-front" });
    const det = ops.addGaPage(p, "", { scale: 1, enclosure: { w: 1, h: 1 }, view: "detail" });
    const lamp = ops.addGaItem(p, door.id, { kind: "label", x: 120, y: 80, w: 60, h: 15 });
    const a = ops.addGaItem(p, door.id, { kind: "detail", x: 100, y: 50, w: 120, h: 60 });
    const f = ops.addGaItem(p, det.id, { kind: "frame", detail: a.id, x: 20, y: 30, w: 1, h: 1, zoom: 1 });
    const v = ga.frameView(p, f)!;
    // The frame's corner is the detail's corner.
    expect(ga.toSourceMm(v, [20, 30])).toEqual([100, 50]);
    expect(ga.toFrameMm(v, lamp)).toEqual({ x: 40, y: 60, w: 60, h: 15 });
    // A dimension on a detail sheet must be in a frame; deleting the frame deletes it.
    const dim = { axis: "h" as const, style: "chain" as const, points: [{ v: 120, item: lamp.id, edge: "start" as const }, { v: 180, item: lamp.id, edge: "end" as const }], at: 70 };
    expect(() => ops.addGaDim(p, det.id, dim)).toThrow();
    const d = ops.addGaDim(p, det.id, dim, f.id);
    expect(d.frame).toBe(f.id);
    // Not drawn on the door: it belongs to the frame.
    expect(door.gaItems!.some((i) => i.kind === "dim")).toBe(false);
    ops.deleteGaItems(p, det.id, [f.id]);
    expect(det.gaItems!.some((i) => i.id === d.id)).toBe(false);
  });
});
