/** v0.5 step 1: small fixes (design-v0.5.md §4). */
import { describe, expect, test } from "bun:test";
import { newProject } from "./model";
import { addElement, flipElements } from "./ops";
import { addDesignPlant, duplicatePlant, insertDesignTemplate, designTemplateOf } from "./design";
import { localGeometry, poleMates, requireSymbol } from "./symbols";

const sheet = () => {
  const p = newProject("t");
  return { p, pg: p.pages[0]!.id };
};

describe("v0.5 step 1", () => {
  test("A13: the lamp test setting names its terminal LT", () => {
    expect(requireSymbol("lamp").params.find((x) => x.key === "testPin")!.label).toBe("Lamp test terminal (LT)");
  });

  test("A25: a push button carries colour through every pole, NO or NC", () => {
    const { p, pg } = sheet();
    const s = addElement(p, pg, "pushbutton", [10, 10], { params: { poles: 4, pole1: "nc", pole2: "no", pole3: "no", pole4: "nc" } });
    expect(poleMates(s, "11")).toEqual(["12"]);
    expect(poleMates(s, "24")).toEqual(["23"]);
    expect(poleMates(s, "33")).toEqual(["34"]);
    expect(poleMates(s, "42")).toEqual(["41"]);
    // Numbers a pole doesn't have carry nothing.
    expect(poleMates(s, "13")).toEqual([]);
  });

  test("A40: flipped, the symbol turns over and the tag stays above the label", () => {
    const { p, pg } = sheet();
    for (const sym of ["contact", "coil", "lamp", "isolator", "pushbutton", "fuse"]) {
      const el = addElement(p, pg, sym, [20, 20], { label: "RUN" });
      const at = (role: string) => {
        const g = localGeometry(el, { tag: "K1", label: "RUN" });
        const t = g.prims.find((q) => q.t === "text" && q.role === role);
        return t && t.t === "text" ? t.at[1] : NaN;
      };
      const [tag, label] = [at("tag"), at("label")];
      expect(tag).toBeLessThan(label);
      flipElements(p, pg, [el.id]);
      expect(at("tag")).toBeLessThan(at("label"));
      // The block keeps its own spacing.
      expect(at("label") - at("tag")).toBeCloseTo(label - tag, 5);
    }
  });

  test("A74: copies from Duplicate ×n start with no description; a template keeps its own", () => {
    const p = newProject("d");
    const a = addDesignPlant(p);
    Object.assign(a, { tag: "SF1", description: "Supply fan 1" });
    const r = duplicatePlant(p, [a.id], 3, 1);
    expect(r.plant.map((x) => x.description)).toEqual(["", "", ""]);
    expect(a.description).toBe("Supply fan 1");
    const t = designTemplateOf(p, [a.id], "Fan");
    const ins = insertDesignTemplate(p, t);
    expect(ins.plant[0]!.description).toBe("Supply fan 1");
  });
});
