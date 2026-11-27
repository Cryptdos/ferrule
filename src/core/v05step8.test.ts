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
