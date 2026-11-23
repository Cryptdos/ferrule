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
