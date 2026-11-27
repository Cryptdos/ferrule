/** v0.5 step 7: wire labels and link ends (design-wire-labels-and-links.md). */
import { describe, expect, test } from "bun:test";
import { newProject } from "./model";
import { addElement, rotateElements } from "./ops";
import { localGeometry, textBounds } from "./symbols";
import { parseProject } from "./validate";

const sheet = () => {
  const p = newProject("t");
  return { p, pg: p.pages[0]!.id };
};
const texts = (el: Parameters<typeof localGeometry>[0]) =>
  localGeometry(el, "").prims.flatMap((x) => (x.t === "text" ? [x] : []));

describe("step 7a: text that can be turned (A29)", () => {
  test("R turns a text to read up the page, first line on the left, and back; it never turns further", () => {
    const { p, pg } = sheet();
    const t = addElement(p, pg, "text", [20, 40], { label: "FAN FAIL\nSECOND LINE" });
    const level = texts(t);
    expect(level.every((x) => !x.vertical)).toBe(true);
    rotateElements(p, pg, [t.id]);
    expect(t.rot).toBe(270);
    const up = texts(t);
    expect(up.map((x) => x.text)).toEqual(["FAN FAIL", "SECOND LINE"]);
    expect(up.every((x) => x.vertical)).toBe(true);
    // The lines stand side by side, the first on the left, each running up from the text's place.
    expect(up[0]!.at[0]).toBeLessThan(up[1]!.at[0]);
    for (const x of up) expect(textBounds(x).y + textBounds(x).h).toBeCloseTo(0);
    // Its extent turns with it: taller than wide.
    const g = localGeometry(t, "");
    expect(g.bbox.h).toBeGreaterThan(g.bbox.w);
    rotateElements(p, pg, [t.id]);
    expect(t.rot).toBe(0);
    expect(texts(t)).toEqual(level);
  });

  test("placed or opened turned any way, a text is level or turned up the page", () => {
    const { p, pg } = sheet();
    expect(addElement(p, pg, "text", [20, 40], { rot: 90 }).rot).toBe(270);
    expect(addElement(p, pg, "text", [20, 50], { rot: 180 }).rot).toBe(270);
    const raw = JSON.parse(JSON.stringify(p));
    raw.pages[0].elements[0].rot = 90;
    expect(parseProject(raw).pages[0]!.elements[0]!.rot).toBe(270);
  });
});
