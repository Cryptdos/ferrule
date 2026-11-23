import { describe, expect, test } from "bun:test";
import { newProject } from "./model";
import { addDistribution, addElement, addPage, connect, deleteDistribution } from "./ops";
import { renumber } from "./renumber";
import { compile, initialState, toggle } from "./sim";
import { localGeometry } from "./symbols";
import { elementTexts, displayTag } from "./tags";
import { importTemplate, saveSheetTemplate, stampTemplate } from "./templates";

function project() {
  const p = newProject("t");
  return { p, pg: p.pages[0]!.id };
}

describe("distributions (design-v0.2 §2)", () => {
  test("new projects start with an empty list", () => {
    expect(newProject("x").distributions).toEqual([]);
  });

  test("a busbar shows its distribution's name; a local one its own; control busbars carry no tag", () => {
    const { p, pg } = project();
    const l1 = addDistribution(p, { name: "L1", kind: "line", voltage: "230 V", colour: "bn" });
    expect(l1.colour).toBe("Bn");
    const a = addElement(p, pg, "busbar", [10, 10], { params: { dist: l1.id, length: 30 } });
    const b = addElement(p, pg, "busbar", [10, 20], { params: { name: "La", length: 30 } });
    const c = addElement(p, pg, "busbar", [10, 30], { params: { style: "control", name: "LT", length: 30, bothEnds: true } });
    renumber(p);
    expect(elementTexts(a, p).name).toBe("L1");
    expect(elementTexts(b, p).name).toBe("La");
    expect(displayTag(a, p)).toMatch(/^W1-/);
    expect(displayTag(c, p)).toBe("");
    const texts = (el: typeof c) => localGeometry(el, elementTexts(el, p)).prims.filter((x) => x.t === "text").map((x) => (x.t === "text" ? x.text : ""));
    expect(texts(c).filter((t) => t === "LT")).toHaveLength(2);
    // Deleting the distribution makes its busbars local.
    deleteDistribution(p, l1.id);
    expect(a.params.dist).toBeUndefined();
  });

  test("busbars of the same name are no longer joined: only a distribution joins (testing note 73)", () => {
    const { p, pg } = project();
    const L = addDistribution(p, { name: "L (grid)", kind: "line" });
    const N = addDistribution(p, { name: "N (grid)", kind: "neutral" });
    const sup = addElement(p, pg, "supply", [10, 4], { params: { system: "1ph-n", dist_L: L.id, dist_N: N.id } });
    void sup;
    const busL = addElement(p, pg, "busbar", [4, 20], { params: { dist: L.id, length: 60 } });
    const busN = addElement(p, pg, "busbar", [4, 80], { params: { dist: N.id, length: 60 } });
    // The changeover's output: a local busbar fed through Q1.
    const q1 = addElement(p, pg, "isolator", [20, 30], { params: { poles: 1, aux: 0 } });
    const la = addElement(p, pg, "busbar", [4, 40], { params: { name: "La", length: 60 } });
    connect(p, pg, [busL.id, "16"], [q1.id, "1"]);
    connect(p, pg, [q1.id, "2"], [la.id, "16"]);
    const h1 = addElement(p, pg, "lamp", [40, 60]);
    connect(p, pg, [la.id, "36"], [h1.id, "V+"]);
    connect(p, pg, [h1.id, "V-"], [busN.id, "36"]);
    // Another local busbar called La on another sheet, fed by nothing.
    const pg2 = addPage(p, "Two").id;
    const la2 = addElement(p, pg2, "busbar", [4, 40], { params: { name: "La", length: 60 } });
    const n2 = addElement(p, pg2, "busbar", [4, 80], { params: { dist: N.id, length: 60 } });
    const h2 = addElement(p, pg2, "lamp", [40, 60]);
    connect(p, pg2, [la2.id, "36"], [h2.id, "V+"]);
    connect(p, pg2, [h2.id, "V-"], [n2.id, "36"]);
    const c = compile(p);
    let s = initialState(c);
    // The supply feeds its distributions with no wire drawn from it.
    expect(s.lamps[h1.id]).toBe(true);
    expect(s.lamps[h2.id]).toBe(false);
    s = toggle(c, s, q1.id);
    expect(s.lamps[h1.id]).toBe(false);
  });

  test("two supplies feeding one conductor is a short", () => {
    const { p, pg } = project();
    const L = addDistribution(p, { name: "L", kind: "line" });
    const N = addDistribution(p, { name: "N", kind: "neutral" });
    addElement(p, pg, "supply", [10, 4], { params: { system: "1ph-n", dist_L: L.id, dist_N: N.id } });
    const gen = addElement(p, pg, "supply", [40, 4], { params: { system: "1ph-n" } });
    const bus = addElement(p, pg, "busbar", [4, 20], { params: { dist: L.id, length: 60 } });
    connect(p, pg, [gen.id, "L"], [bus.id, "36"]);
    expect(initialState(compile(p)).short).toBe(true);
  });

  test("a template carries its distributions into another project, matched by name", () => {
    const { p, pg } = project();
    const cct = addDistribution(p, { name: "CCT", kind: "dc+", voltage: "24 V DC" });
    addElement(p, pg, "busbar", [0, 10], { params: { style: "control", dist: cct.id, length: 100 } });
    const t = saveSheetTemplate(p, pg, "Controls");
    expect(t.distributions?.map((d) => d.name)).toEqual(["CCT"]);
    // Into a project that has no CCT: it's added.
    const q = newProject("q");
    const t2 = importTemplate(q, t);
    const r = stampTemplate(q, t2.id);
    expect(q.distributions.map((d) => d.name)).toEqual(["CCT"]);
    expect(r.page.elements[0]!.params.dist).toBe(q.distributions[0]!.id);
    // Into one that has its own CCT: that one is used.
    const z = newProject("z");
    const own = addDistribution(z, { name: "CCT", kind: "dc+" });
    const r2 = stampTemplate(z, importTemplate(z, t).id);
    expect(z.distributions).toHaveLength(1);
    expect(r2.page.elements[0]!.params.dist).toBe(own.id);
  });
});

describe("wire colour from the busbar", () => {
  test("a wire drawn from a busbar takes its colour once, and can be changed", async () => {
    const { setConductorInfo } = await import("./ops");
    const { p, pg } = project();
    const n = addDistribution(p, { name: "N", kind: "neutral", colour: "Bu" });
    const bus = addElement(p, pg, "busbar", [0, 10], { params: { dist: n.id, length: 60 } });
    const own = addElement(p, pg, "busbar", [0, 20], { params: { colour: "Bk", dist: n.id, length: 60 } });
    const h = addElement(p, pg, "lamp", [20, 40]);
    const k = addElement(p, pg, "coil", [40, 40]);
    const w1 = connect(p, pg, [bus.id, "20"], [h.id, "V+"]);
    const colourOf = (w: { conductor: string }) => p.conductors.find((c) => c.id === w.conductor)?.colour;
    expect(colourOf(w1)).toBe("Bu");
    // The busbar's own colour wins over its distribution's.
    const w2 = connect(p, pg, [own.id, "40"], [k.id, "A1"]);
    expect(colourOf(w2)).toBe("Bk");
    // Changed by hand, it stays changed; changing the busbar later doesn't touch it.
    setConductorInfo(p, w1.conductor, { colour: "Rd" });
    bus.params.colour = "Gy";
    connect(p, pg, [h.id, "V-"], [k.id, "A2"]);
    expect(colourOf(w1)).toBe("Rd");
  });
});
