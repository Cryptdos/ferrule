import { describe, expect, test } from "bun:test";
import { FORMAT_VERSION, newProject } from "./model";
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
    const back = parseProject({ format: "ferrule", version: FORMAT_VERSION, id: "x", pages: [{ id: "pg1", elements: [] }] });
    expect(back.project.title).toBe("Untitled project");
    expect(back.pages[0]!.number).toBe(1);
    expect(back.pages[0]!.segments).toEqual([]);
  });

  test("rejects non-projects, other formats, and unknown symbols", () => {
    expect(() => parseProject({})).toThrow(ProjectFormatError);
    // No backwards compatibility (v0.5 A30): any other format is refused, naming the Ferrule it needs when the file says.
    expect(() => parseProject({ format: "ferrule", version: 99, id: "x" })).toThrow("Not opened. This file is from a newer Ferrule.");
    expect(() => parseProject({ format: "ferrule", version: FORMAT_VERSION - 1, id: "x" })).toThrow(
      "Not opened. This file is from an older Ferrule and can't be opened in this one.",
    );
    expect(() => parseProject({ format: "ferrule", version: FORMAT_VERSION - 1, savedBy: "0.4.5", id: "x" })).toThrow(
      "Not opened. This file needs Ferrule 0.4.5. Builds: https://github.com/Cryptdos/ferrule/releases",
    );
    expect(() => parseProject({ format: "ferrule", version: 1, id: "x" })).toThrow(/older Ferrule/);
    expect(() =>
      parseProject({ format: "ferrule", version: FORMAT_VERSION, id: "x", pages: [{ id: "p", elements: [{ id: "e", symbol: "zz", pos: [0, 0] }] }] }),
    ).toThrow(/Unknown symbol/);
  });
});
