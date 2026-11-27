/** v0.5 step 8: the Design workbench (design-design-workbench.md). */
import { describe, expect, test } from "bun:test";
import { newProject } from "./model";
import { addDesignPlant, addDesignPoint, needsChannel, pointType, updateDesignPoint } from "./design";
import { parseProject } from "./validate";
import { compile } from "./sim";

describe("step 8a: pick a thing, and Properties shows that thing (A69)", () => {
  test("+ Point adds an empty point with no form yet: it needs no channel and doesn't simulate until a form is set", () => {
    const p = newProject("t");
    const it = addDesignPlant(p);
    const pt = addDesignPoint(p, it.id);
    expect([pt.name, pt.form, pt.pins]).toEqual(["Point 1", "none", []]);
    expect(pointType(pt.form)).toBeUndefined();
    expect(needsChannel(pt)).toBe(false);
    expect(() => compile(p)).not.toThrow();
    // Kept as it is through a save.
    expect(parseProject(JSON.parse(JSON.stringify(p))).plant[0]!.points![0]!.form).toBe("none");
    updateDesignPoint(p, it.id, "Point 1", { form: "contact", name: "Fault" });
    expect([it.points![0]!.name, it.points![0]!.form, needsChannel(it.points![0]!)]).toEqual(["Fault", "contact", true]);
  });

  test("Enabled by and Source are gone from plant", () => {
    const p = newProject("t");
    const it = addDesignPlant(p);
    const raw = JSON.parse(JSON.stringify(p));
    raw.plant[0].enabledBy = "time zone";
    raw.plant[0].source = "4.2";
    const back = parseProject(raw).plant[0] as unknown as Record<string, unknown>;
    expect(back.enabledBy).toBeUndefined();
    expect(back.source).toBeUndefined();
    void it;
  });
});

describe("step 8b: the Terminals window (A67)", () => {
  test("Add terminal numbers one on from the highest; delete and reorder leave every number alone", async () => {
    const { addPlant, addPin, deletePin, movePin, nextPinNumber, updatePin } = await import("./ops");
    const p = newProject("t");
    const it = addPlant(p, "", "Fan", ["1", "2", "11", "14"]);
    expect(nextPinNumber(it)).toBe("15");
    addPin(p, it.id, nextPinNumber(it));
    deletePin(p, it.id, "2");
    expect(it.terminals).toEqual(["1", "11", "14", "15"]);
    movePin(p, it.id, "15", 0);
    expect(it.terminals).toEqual(["15", "1", "11", "14"]);
    // A point name not used yet makes a point with no form yet.
    updatePin(p, it.id, "11", { point: "Run" });
    expect(it.points!.find((q) => q.name === "Run")!.form).toBe("none");
  });

  test("Generate says what it makes first, and a dash uses up a number without making a terminal", async () => {
    const { generatePins, patternSummary } = await import("./modules");
    const di = { channels: 16, ids: "I C", first: 1, group: "DI#", form: "dry-in" as const, shared: "C", shareBy: 4 };
    expect(patternSummary(di)).toBe("Makes 16 channels and 4 shared terminals, numbered 1 to 20");
    const gap = generatePins({ channels: 2, ids: "I - C", first: 1, group: "DI#", form: "dry-in" });
    expect(gap.terminals).toEqual(["1", "3", "4", "6"]);
    expect(gap.points.map((q) => q.pins)).toEqual([["1", "3"], ["4", "6"]]);
  });
});

describe("step 8c: adapters and marks (A68, A66)", () => {
  test("an adapter is a module with no channels, added empty, its terminals entered by hand", async () => {
    const { addModule, addController } = await import("./controllers");
    const { addPin, updatePin } = await import("./ops");
    const { channelsOf } = await import("./design");
    const { moduleTypeName } = await import("./modules");
    const { moduleGaSize } = await import("./ga");
    const p = newProject("t");
    const c = addController(p);
    const a = addModule(p, c.id, { type: "adapter", pattern: null });
    expect(a.terminals).toEqual([]);
    expect(moduleTypeName(a.module!)).toBe("Adapter");
    for (const t of ["1", "2", "3", "4"]) addPin(p, a.id, t);
    updatePin(p, a.id, "1", { point: "Supply in" });
    updatePin(p, a.id, "3", { point: "Supply out" });
    expect(a.points!.map((q) => q.form)).toEqual(["none", "none"]);
    // Whatever a point's form, a module with no channels has none.
    updateDesignPoint(p, a.id, "Supply out", { form: "contact" });
    expect(channelsOf(p).some((ch) => ch.module.id === a.id)).toBe(false);
    expect(moduleGaSize(p, a)).toEqual({ w: 22.5, h: 90 });
    const back = parseProject(JSON.parse(JSON.stringify(p)));
    expect(back.plant.find((x) => x.id === a.id)!.module!.type).toBe("adapter");
  });

  test("a mark is a picture, or Other with up to four letters: a circle for two, a lozenge for three or four", async () => {
    const { setPlantDesign } = await import("./design");
    const { addPlant } = await import("./ops");
    const { markPrims, markWidth } = await import("./symbols");
    const p = newProject("t");
    const it = addPlant(p, "", "CO2 sensor", ["1", "2"]);
    setPlantDesign(p, it.id, { mark: "other", markText: "  CO2x9 " });
    expect(it.markText).toBe("CO2x");
    setPlantDesign(p, it.id, { markText: "CO2" });
    expect(it.markText).toBe("CO2");
    // Two letters: a circle 4 mm across; three: wider, the same height.
    expect(markWidth("other", "RH")).toBeCloseTo(2.2);
    expect(markWidth("other", "CO2")).toBeGreaterThan(2.2);
    expect(markPrims("other", 0, 0, "RH").some((x) => x.t === "circle")).toBe(true);
    expect(markPrims("other", 0, 0, "IAQ").filter((x) => x.t === "arc")).toHaveLength(2);
    expect(markPrims("other", 0, 0, "")).toEqual([]);
    // A picture clears the letters.
    setPlantDesign(p, it.id, { mark: "fan" });
    expect(it.markText).toBeUndefined();
    expect(markPrims("fan", 0, 0).filter((x) => x.t === "ellipse")).toHaveLength(2);
    expect(markPrims("pump", 0, 0).some((x) => x.t === "line")).toBe(true);
    // The letter-only marks are gone: a file with one opens without it.
    const json = JSON.parse(JSON.stringify(p));
    json.plant.find((x: { id: string }) => x.id === it.id).mark = "temperature";
    expect(parseProject(json).plant.find((x) => x.id === it.id)!.mark).toBeUndefined();
  });
});
