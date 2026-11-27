/** v0.5 step 3: windows, row two, sheets (design-v0.5.md §4). */
import { describe, expect, test } from "bun:test";
import { newProject } from "./model";
import { addGaItem, addGaPage, OpError, setGaSettings } from "./ops";

describe("v0.5 step 3", () => {
  test("A33: an empty GA sheet changes to any view, Detail included; one with things on it says why", () => {
    const p = newProject("t");
    const ga = addGaPage(p, "", { scale: 5, enclosure: { w: 600, h: 800 }, view: "backplate" });
    setGaSettings(p, ga.id, { view: "detail" });
    expect(ga.ga).toMatchObject({ view: "detail", scale: 1 });
    setGaSettings(p, ga.id, { view: "door-front" });
    expect(ga.ga!.view).toBe("door-front");
    setGaSettings(p, ga.id, { view: "backplate" });
    addGaItem(p, ga.id, { kind: "rail", x: 50, y: 50, w: 200, h: 35 });
    expect(() => setGaSettings(p, ga.id, { view: "detail" })).toThrow(OpError);
    expect(() => setGaSettings(p, ga.id, { view: "detail" })).toThrow("Only an empty sheet changes to a detail sheet: delete what's on it first");
    expect(ga.ga!.view).toBe("backplate");
  });
});
