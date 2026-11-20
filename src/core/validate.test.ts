import { describe, expect, test } from "bun:test";
import { newProject } from "./model";
import { addElement } from "./ops";
import { parseProject, ProjectFormatError } from "./validate";

describe("parseProject", () => {
  test("round-trips a project", () => {
    const p = newProject("demo", "Demo");
    addElement(p, p.pages[0]!.id, "coil", [10, 10], { tag: "K1" });
    const back = parseProject(JSON.parse(JSON.stringify(p)));
    expect(back).toEqual(p);
  });

  test("fills fields missing from older files", () => {
    const back = parseProject({ format: "ferrule", version: 1, id: "x", pages: [{ id: "pg1", elements: [] }] });
    expect(back.project.title).toBe("Untitled project");
    expect(back.pages[0]!.number).toBe(1);
    expect(back.pages[0]!.segments).toEqual([]);
  });

  test("rejects non-projects, newer formats and unknown symbols", () => {
    expect(() => parseProject({})).toThrow(ProjectFormatError);
    expect(() => parseProject({ format: "ferrule", version: 99, id: "x" })).toThrow(/newer/);
    expect(() =>
      parseProject({ format: "ferrule", version: 1, id: "x", pages: [{ id: "p", elements: [{ id: "e", symbol: "zz", pos: [0, 0] }] }] }),
    ).toThrow(/Unknown symbol/);
  });
});
