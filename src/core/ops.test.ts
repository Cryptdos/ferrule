import { describe, expect, test } from "bun:test";
import { newProject } from "./model";
import { addElement, deleteElements, duplicateElements, moveElements, rotateElements, updateElement } from "./ops";
import { AREA_UNITS } from "./geometry";
import { displayTag } from "./tags";

function setup() {
  const p = newProject("t");
  return { p, pg: p.pages[0]!.id };
}

describe("element operations", () => {
  test("add snaps to the grid and fills default params", () => {
    const { p, pg } = setup();
    const e = addElement(p, pg, "lamp", [10.4, 19.6]);
    expect(e.pos).toEqual([10, 20]);
    expect(e.params.colour).toBe("");
    expect(p.pages[0]!.elements).toHaveLength(1);
  });

  test("unknown symbols are refused", () => {
    const { p, pg } = setup();
    expect(() => addElement(p, pg, "nope", [0, 0])).toThrow();
  });

  test("move snaps and stays on the page", () => {
    const { p, pg } = setup();
    const e = addElement(p, pg, "coil", [10, 10]);
    moveElements(p, pg, [e.id], [2.6, -0.4]);
    expect(e.pos).toEqual([13, 10]);
    moveElements(p, pg, [e.id], [1000, 1000]);
    expect(e.pos).toEqual([AREA_UNITS.w, AREA_UNITS.h]);
  });

  test("rotate steps 90° and wraps", () => {
    const { p, pg } = setup();
    const e = addElement(p, pg, "coil", [10, 10]);
    for (let i = 0; i < 4; i++) rotateElements(p, pg, [e.id]);
    expect(e.rot).toBe(0);
  });

  test("delete removes the element and its wires", () => {
    const { p, pg } = setup();
    const a = addElement(p, pg, "coil", [10, 10]);
    const b = addElement(p, pg, "lamp", [20, 10]);
    p.pages[0]!.segments.push({ id: "w", conductor: "", from: [a.id, "A1"], to: [b.id, "L"], route: "auto", points: [] });
    deleteElements(p, pg, [a.id]);
    expect(p.pages[0]!.elements.map((e) => e.id)).toEqual([b.id]);
    expect(p.pages[0]!.segments).toHaveLength(0);
  });

  test("update and display tag", () => {
    const { p, pg } = setup();
    const e = addElement(p, pg, "coil", [10, 10]);
    expect(displayTag(e, p)).toBe("K?");
    updateElement(p, pg, e.id, { params: { type: "contactor" } });
    expect(displayTag(e, p)).toBe("Q?");
    updateElement(p, pg, e.id, { tag: " K10-16 " });
    expect(displayTag(e, p)).toBe("K10-16");
  });

  test("duplicate copies with a new id and no tag", () => {
    const { p, pg } = setup();
    const e = addElement(p, pg, "lamp", [10, 10], { tag: "P1", params: { colour: "G" } });
    const [id] = duplicateElements(p, pg, [e.id], [4, 0]);
    const copy = p.pages[0]!.elements.find((x) => x.id === id)!;
    expect(copy.pos).toEqual([14, 10]);
    expect(copy.tag).toBe("");
    expect(copy.params.colour).toBe("G");
  });
});

describe("bulk edits", () => {
  test("replace in tags and labels, lock tags, edit anywhere", async () => {
    const { addPage, replaceInElements, setTagLocks, updateElementAnywhere } = await import("./ops");
    const { p, pg } = setup();
    const pg2 = addPage(p, "Two").id;
    const a = addElement(p, pg, "lamp", [10, 10], { tag: "H1", label: "SF-01 RUNNING" });
    const b = addElement(p, pg2, "lamp", [10, 10], { tag: "H2", label: "SF-01 TRIPPED" });
    expect(replaceInElements(p, [a.id, b.id], "SF-01", "SF-02", { label: true })).toBe(2);
    expect(b.label).toBe("SF-02 TRIPPED");
    expect(replaceInElements(p, [a.id], "H", "P", { tag: true })).toBe(1);
    expect(a.tag).toBe("P1");
    setTagLocks(p, [a.id, b.id], true);
    expect(b.params.locked).toBe(true);
    updateElementAnywhere(p, b.id, { label: "X" });
    expect(b.label).toBe("X");
  });
});
