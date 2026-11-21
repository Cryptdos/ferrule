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
  test("1. twelve sheets, in the order of the original set, then a true-scale GA", () => {
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
      "General arrangement: controls backplate",
    ]);
    // The GA has the relays, timers and terminal strips from the schematic on it.
    const ga = p.pages[12]!;
    expect(ga.ga?.enclosure).toEqual({ w: 1000, h: 1600 });
    expect(ga.gaItems!.filter((i) => i.kind === "device").length).toBeGreaterThan(10);
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
    // Only the note that the GA (deliberately) has more devices to place.
    expect(checkProject(p).filter((f) => f.level !== "info")).toEqual([]);
    expect(checkProject(p).map((f) => f.message)).toEqual([expect.stringMatching(/not on a GA yet/)]);
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

describe("LSP-01 simulation (criterion 5)", async () => {
  const { compile, initialState, toggle, press, advance, search } = await import("../core/sim");
  const find = (sheet: number, label: string) => {
    const el = p.pages[sheet - 1]!.elements.find((e) => resolveFields(e.label, p) === label);
    if (!el) throw new Error(`No "${label}" on sheet ${sheet}`);
    return el;
  };
  const plantView = (tag: string) => {
    const item = p.plant.find((x) => x.tag === tag)!;
    for (const pg of p.pages) {
      const el = pg.elements.find((e) => e.symbol === "plant-view" && e.params.plant === item.id);
      if (el) return el;
    }
    throw new Error(tag);
  };
  const c = compile(p);
  const fa = plantView("FA");
  const fr = find(7, "FIRE ALARM RELAY");
  const healthy = find(7, "CONTROL CIRCUIT HEALTHY");
  const en1 = find(8, "SF-01 ENABLE");
  const en2 = find(8, "SF-02 ENABLE");
  const k1 = find(3, "SF-01 CONTACTOR");
  const k2 = find(4, "SF-02 CONTACTOR");
  const rr2 = find(8, "SF-02 RUNNING");
  const run2 = find(4, "SF-02 RUNNING");
  const ff = find(8, "FANS FAIL");
  const trip2 = find(8, "SF-02 TRIPPED");
  const duty = find(8, "DUTY SELECTOR");
  const reset = find(8, "FANS TRIP RESET");

  test("healthy at rest: control circuit lamp on, no fans", () => {
    const s = initialState(c);
    expect(s.lamps[healthy.id]).toBe(true);
    expect(s.energised[fr.id]).toBeFalsy();
    expect(s.energised[k1.id] || s.energised[k2.id]).toBeFalsy();
  });

  test("fire alarm starts the duty fan through its starter sheet, and the running relay comes back", () => {
    let s = toggle(c, initialState(c), fa.id);
    expect(s.energised[fr.id]).toBe(true);
    // Duty selector in position 1 (11–12): SF-02 is duty as drawn.
    expect(s.energised[en2.id]).toBe(true);
    expect(s.energised[en1.id]).toBe(false);
    expect(s.energised[k2.id]).toBe(true);
    expect(s.lamps[run2.id]).toBe(true);
    expect(s.energised[rr2.id]).toBe(true);
    // Turn the duty selector: SF-01 takes over.
    s = toggle(c, s, duty.id);
    expect(s.energised[k1.id]).toBe(true);
    expect(s.energised[k2.id]).toBe(false);
  });

  test("proven airflow stops the fail timer; unproven trips the fans after 10 s", () => {
    let s = toggle(c, initialState(c), fa.id);
    const proven = toggle(c, s, plantView("DPS-SF-02").id);
    expect(advance(c, proven, 30).energised[ff.id]).toBe(false);
    s = advance(c, s, 9);
    expect(s.energised[ff.id]).toBe(false);
    expect(s.lamps[trip2.id]).toBe(false);
    s = advance(c, s, 1);
    // Fans-fail latches and drops the enables…
    expect(s.energised[ff.id]).toBe(true);
    expect(s.energised[en2.id]).toBe(false);
    expect(s.energised[k2.id]).toBe(false);
    // …which resets the timer, so the TRIPPED lamp goes straight out again:
    // the operator never sees which fan failed. One of the original's suspected bugs.
    expect(s.lamps[trip2.id]).toBe(false);
    // The latch holds until FANS TRIP RESET.
    s = advance(c, s, 60);
    expect(s.energised[ff.id]).toBe(true);
    s = press(c, s, reset.id);
    // Reset with the alarm still on: the duty fan restarts (and will trip again unproven).
    expect(s.energised[ff.id]).toBe(false);
    expect(s.energised[k2.id]).toBe(true);
  });

  test("rule search: the two supply fans are never enabled together", () => {
    const r = search(c, initialState(c), [{ id: "duty", kind: "never-both", a: k1.id, b: k2.id }]);
    // Every sequence tried (only the inputs that can affect these contactors are searched).
    expect(r.truncated).toBe(false);
    expect(r.violations).toEqual([]);
    expect(r.faults).toEqual([]);
  });
});
