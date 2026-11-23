/**
 * v0.2.1 (docs/design-v0.2.1.md): fixes and changes from QA of the v0.2 builds.
 */
import { describe, expect, test } from "bun:test";
import { FORMAT, FORMAT_VERSION, newProject } from "./model";
import { addElement, flipElements, updateElement } from "./ops";
import { localGeometry } from "./symbols";
import { elementTexts } from "./tags";
import { parseProject } from "./validate";

function sheet() {
  const p = newProject("t");
  return { p, pg: p.pages[0]!.id };
}

describe("step 2a: parts and Annotate", () => {
  test("Auto call-outs number in placing order, skipping numbers set by hand (6)", () => {
    const { p, pg } = sheet();
    const a = addElement(p, pg, "callout", [10, 10]);
    const hand = addElement(p, pg, "callout", [20, 10], { params: { auto: false, n: 2 } });
    const b = addElement(p, pg, "callout", [30, 10]);
    const num = (el: typeof a) => localGeometry(el, elementTexts(el, p)).prims.find((x) => x.t === "text")!;
    expect([a, hand, b].map((el) => (num(el) as { text: string }).text)).toEqual(["1", "2", "3"]);
    p.pages[0]!.elements = p.pages[0]!.elements.filter((e) => e.id !== a.id);
    expect((num(b) as { text: string }).text).toBe("1");
  });

  test("labels are one line: a line break becomes a space, with a width that keeps it wrapping (18)", () => {
    const { p, pg } = sheet();
    const k = addElement(p, pg, "coil", [10, 10], { label: "FANS\nFAIL" });
    expect(k.label).toBe("FANS FAIL");
    expect(k.params.labelWidth).toBeGreaterThan(0);
    updateElement(p, pg, k.id, { label: "A\nB" });
    expect(k.label).toBe("A B");
    // Text keeps its lines.
    const t = addElement(p, pg, "text", [10, 30], { label: "# Notes\n- one" });
    expect(t.label).toBe("# Notes\n- one");
  });

  test("files: lamps with no colour or clear are white; label plates become boxes; a left drain moves to E2", () => {
    const { p, pg } = sheet();
    const l1 = addElement(p, pg, "lamp", [10, 10]);
    const l2 = addElement(p, pg, "lamp", [20, 10]);
    const raw = JSON.parse(JSON.stringify(p));
    raw.pages[0].elements.find((e: { id: string }) => e.id === l1.id).params.colour = "";
    raw.pages[0].elements.find((e: { id: string }) => e.id === l2.id).params.colour = "Cl";
    raw.pages[0].elements.push({ id: "e_plate", symbol: "plate", tag: "", label: "POWER\nON", pos: [40, 40], rot: 0, zone: "internal", params: { w: 14, h: 5, size: "note" }, links: [] });
    raw.pages[0].elements.push({ id: "e_scr", symbol: "screen", tag: "W1", label: "", pos: [60, 40], rot: 0, zone: "internal", params: { drain: "left", span: 3 }, links: [] });
    const k = addElement(p, pg, "coil", [70, 60]);
    raw.pages[0].elements.push(JSON.parse(JSON.stringify(k)));
    raw.pages[0].segments.push({ id: "s1", conductor: "", from: ["e_scr", "E"], to: [k.id, "A1"], route: "auto", points: [] });
    expect(raw.format).toBe(FORMAT);
    expect(raw.version).toBe(FORMAT_VERSION);
    const back = parseProject(raw);
    const els = back.pages[0]!.elements;
    expect(els.filter((e) => e.symbol === "lamp").map((e) => e.params.colour)).toEqual(["Wh", "Wh"]);
    const box = els.find((e) => e.id === "e_plate")!;
    expect([box.symbol, box.label, box.params.w, box.params.h]).toEqual(["box", "POWER ON", 14, 5]);
    expect(back.pages[0]!.segments.find((s) => s.id === "s1")!.from).toEqual(["e_scr", "E2"]);
  });

  test("a flipped incoming supply keeps its names beyond the arrows' tails and its label clear of them (30)", () => {
    const { p, pg } = sheet();
    const s = addElement(p, pg, "supply", [20, 20], { label: "415V" });
    flipElements(p, pg, [s.id]);
    const g = localGeometry(s, elementTexts(s, p));
    // Flipped, the arrows point up: their tails are below, at +2.6, with the names under them and the label lower still.
    const name = g.prims.find((x) => x.t === "text" && x.text === "L1")!;
    const label = g.prims.find((x) => x.t === "text" && x.text === "415V")!;
    expect(name.t === "text" && name.at[1]).toBeGreaterThan(2.6);
    expect(label.t === "text" && name.t === "text" && label.at[1]).toBeGreaterThan(name.t === "text" ? name.at[1] : 0);
  });
});
