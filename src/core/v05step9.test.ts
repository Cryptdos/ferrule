/** v0.5 step 9: Layout (A58, A60, A71). */
import { describe, expect, test } from "bun:test";
import { newProject } from "./model";
import { addElement, addGaDim, addGaItem, addGaPage, setGaSettings } from "./ops";
import { dimFrame, dimLayout, gaFrame, gaToSheet, GA_ORIGIN, mmToUnits, plateRect, fitScale } from "./ga";
import { checkProject } from "./checks";
import { elementTexts } from "./tags";
import { localGeometry } from "./symbols";
import { parseProject } from "./validate";

describe("step 9: a backplate sheet sized by its enclosure (A58)", () => {
  test("the size typed is the enclosure's; the plate is 25 mm in, and positions are measured from its corner", () => {
    const p = newProject("t");
    const ga = addGaPage(p, "", { scale: 10, enclosure: { w: 600, h: 800 }, view: "backplate" });
    expect(plateRect(ga.ga!)).toEqual({ x: 25, y: 25, w: 550, h: 750 });
    // The enclosure's corner is where the sheet starts; the plate's corner, 25 mm in, is 0 mm.
    const f = gaFrame(p, ga);
    expect(gaToSheet(f, [-25, -25])).toEqual(GA_ORIGIN);
    expect(gaToSheet(f, [0, 0])).toEqual([GA_ORIGIN[0] + mmToUnits(f, 25), GA_ORIGIN[1] + mmToUnits(f, 25)]);
    // Dimensions measure from the plate, never from the enclosure.
    expect(dimFrame(p, ga).size).toEqual({ w: 550, h: 750, x0: 0, y0: 0 });
    const it = addGaItem(p, ga.id, { kind: "rail", x: 50, y: 100, w: 400, h: 35 });
    const dim = addGaDim(p, ga.id, { axis: "h", style: "chain", points: [{ v: 0, item: "@encl", edge: "start" }, { v: 50, item: it.id, edge: "start" }], at: 60 });
    expect(dimLayout(p, ga, dim).texts.map((t) => t.text)).toEqual(["50"]);
    // Outside the plate is a warning, by the plate's size.
    it.w = 520;
    expect(checkProject(p).some((x) => /a DIN rail lies outside the backplate \(550 × 750 mm\)/.test(x.message))).toBe(true);
  });

  test("the plate can be typed over, no larger than its enclosure; it's saved and read back", () => {
    const p = newProject("t");
    const ga = addGaPage(p, "", { scale: 10, enclosure: { w: 600, h: 800 }, view: "backplate" });
    setGaSettings(p, ga.id, { plate: { w: 560, h: 740 } });
    expect(plateRect(ga.ga!)).toEqual({ x: 20, y: 30, w: 560, h: 740 });
    expect(() => setGaSettings(p, ga.id, { plate: { w: 700, h: 740 } })).toThrow(/larger than its enclosure/);
    const back = parseProject(JSON.parse(JSON.stringify(p)));
    expect(back.pages.find((x) => x.id === ga.id)!.ga!.plate).toEqual({ w: 560, h: 740 });
    // A smaller enclosure it no longer fits: back to 25 mm in.
    setGaSettings(p, ga.id, { enclosure: { w: 500, h: 700 } });
    expect(plateRect(ga.ga!)).toEqual({ x: 25, y: 25, w: 450, h: 650 });
    setGaSettings(p, ga.id, { plate: { w: 400, h: 600 } });
    setGaSettings(p, ga.id, { plate: null });
    expect(ga.ga!.plate).toBeUndefined();
  });
});

describe("step 9: Fit, and a bill of materials table (A60, A71)", () => {
  test("Fit is any scale to one decimal place", () => {
    expect(fitScale(1000, 1600)).toBe(12.2);
    expect(fitScale(10, 10)).toBe(1);
  });

  test("a Bill of materials table lists what's placed on the GA sheets and keeps up", () => {
    const p = newProject("t");
    const pg = p.pages[0]!.id;
    const k = addElement(p, pg, "coil", [20, 20]);
    const ga = addGaPage(p, "", { scale: 10, enclosure: { w: 600, h: 800 }, view: "backplate" });
    const table = addElement(p, ga.id, "bomtable", [10, 10]);
    const rows = () => elementTexts(table, p).bom!;
    expect(rows()).toEqual([]);
    const empty = localGeometry(table, elementTexts(table, p));
    expect(empty.prims.some((x) => x.t === "text" && /Nothing placed/.test(x.text))).toBe(true);
    addGaItem(p, ga.id, { kind: "device", x: 10, y: 10, w: 16, h: 80, refs: [k.id] });
    addGaItem(p, ga.id, { kind: "rail", x: 0, y: 100, w: 500, h: 35 });
    expect(rows().map((r) => r[1])).toEqual(["DIN rail 35 mm", "Plug-in relay with base (no device picked)"]);
    const g = localGeometry(table, elementTexts(table, p));
    expect(g.prims.filter((x) => x.t === "text").map((x) => (x as { text: string }).text)).toEqual(expect.arrayContaining(["ITEM", "QTY", "TAGS"]));
  });
});
