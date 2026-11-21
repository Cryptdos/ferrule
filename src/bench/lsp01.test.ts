/**
 * Benchmark LSP-01 pass criteria (docs/benchmark-lsp01.md), as far as code
 * can judge them. Layout and readability are judged by eye on the PDF.
 */
import { describe, expect, test } from "bun:test";
import { AvoidLib } from "libavoid-js";
import { checkProject } from "../core/checks";
import { resolveFields } from "../core/fields";
import { renumber } from "../core/renumber";
import { displayTag } from "../core/tags";
import { parseProject } from "../core/validate";
import { buildLsp01 } from "./lsp01";

await AvoidLib.load();
const { project: p } = buildLsp01(AvoidLib.getInstance());

describe("LSP-01 benchmark", () => {
  test("1. twelve sheets, in the order of the original set", () => {
    expect(p.pages.map((pg) => resolveFields(pg.title, p))).toEqual([
      "Cover sheet",
      "Main incoming section",
      "SF-01 starter section",
      "SF-02 starter section",
      "EF-01 starter section",
      "EF-02 starter section",
      "Controls section: supplies",
      "Controls section: SF-01/SF-02 duty/standby",
      "Controls section: EF-01/EF-02 duty/standby",
      "General arrangement",
      "Door labels: power section",
      "Door labels: controls section",
    ]);
  });

  test("2. every tag, terminal and wire number is generated", () => {
    const before = JSON.stringify(p);
    const again = parseProject(JSON.parse(before));
    renumber(again);
    // Renumbering again changes nothing: all numbers are the tool's own.
    expect(JSON.stringify(again.pages)).toBe(JSON.stringify(parseProject(JSON.parse(before)).pages));
    for (const pg of p.pages) {
      for (const el of pg.elements) expect(displayTag(el, p).endsWith("?")).toBe(false);
    }
    const unnumbered = p.conductors.filter((c) => !c.number);
    expect(unnumbered).toEqual([]);
  });

  test("3. labels, section titles and sheet titles take plant names from plant data", () => {
    const plantTag = /\b(SF|EF)-0\d\b|DPS-|FA-(SF|EF)/;
    for (const pg of p.pages) {
      expect(pg.title).not.toMatch(plantTag);
      for (const s of pg.sections) expect(s.label).not.toMatch(plantTag);
      for (const el of pg.elements) expect(el.label).not.toMatch(plantTag);
    }
    // …yet they print the right names.
    expect(resolveFields(p.pages[4]!.sections[0]!.label, p)).toBe("EF-01 STARTER SECTION");
  });

  test("4. sheets 3–6 come from one template, and 8–9 from another", () => {
    const shape = (n: number) =>
      p.pages[n - 1]!.elements.map((e) => `${e.symbol}@${e.pos.join(",")}`).sort().join(" ");
    expect(shape(4)).toBe(shape(3));
    expect(shape(5)).toBe(shape(3));
    expect(shape(6)).toBe(shape(3));
    expect(shape(9)).toBe(shape(8));
    expect(p.templates.map((t) => t.name)).toEqual(["Fan starter section", "Fans duty/standby controls"]);
  });

  test("checks are clean: no errors, no warnings", () => {
    expect(checkProject(p)).toEqual([]);
  });

  test("the enable loop runs from each controls sheet to its starter as one circuit", () => {
    // EF-02's contactor coil (sheet 6) is wired to the enable contact on sheet 9 through an off-page pair.
    const coil = p.pages[5]!.elements.find((e) => e.symbol === "coil")!;
    const cond = p.conductors.find((c) => c.terminals.some(([id, t]) => id === coil.id && t === "A1"))!;
    const sheet9 = new Set(p.pages[8]!.elements.map((e) => e.id));
    expect(cond.terminals.some(([id]) => sheet9.has(id))).toBe(true);
  });

  test("6. the title block is filled from project data, with revision B clouded", () => {
    expect(p.project.drawingNo).toBe("LSP01-E");
    expect(p.revisions.map((r) => r.rev)).toEqual(["A", "B"]);
    expect(p.revisions[1]!.clouds).toHaveLength(1);
  });
});
