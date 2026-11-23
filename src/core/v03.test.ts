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
  test("a distribution block is tagged W and named so; a control rail has no tag", () => {
    const { p, pg } = project();
    const block = addElement(p, pg, "busbar", [10, 10], { params: { name: "L1", length: 30 } });
    const rail = addElement(p, pg, "rail", [10, 30], { params: { name: "CCT", length: 30 } });
    renumber(p);
    expect(getSymbol("busbar")!.name).toBe("Distribution block");
    expect(getSymbol("rail")!.name).toBe("Control rail");
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

  test("only distribution blocks are GA parts: a control rail isn't offered in Place parts", () => {
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
