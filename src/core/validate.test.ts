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

  test("fills fields a hand-written file leaves out", () => {
    const back = parseProject({ format: "ferrule", version: 3, id: "x", pages: [{ id: "pg1", elements: [] }] });
    expect(back.project.title).toBe("Untitled project");
    expect(back.pages[0]!.number).toBe(1);
    expect(back.pages[0]!.segments).toEqual([]);
  });

  test("rejects non-projects, older and newer formats, and unknown symbols", () => {
    expect(() => parseProject({})).toThrow(ProjectFormatError);
    expect(() => parseProject({ format: "ferrule", version: 99, id: "x" })).toThrow(/newer/);
    // No upgrading before 1.0: a 0.1 file (format 1 or 2) is refused plainly.
    expect(() => parseProject({ format: "ferrule", version: 2, id: "x" })).toThrow(/made with Ferrule 0\.1; this version can't open it/);
    expect(() => parseProject({ format: "ferrule", version: 1, id: "x" })).toThrow(/Ferrule 0\.1/);
    expect(() =>
      parseProject({ format: "ferrule", version: 3, id: "x", pages: [{ id: "p", elements: [{ id: "e", symbol: "zz", pos: [0, 0] }] }] }),
    ).toThrow(/Unknown symbol/);
  });
});
