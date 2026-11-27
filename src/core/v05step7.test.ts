/** v0.5 step 7: wire labels and link ends (design-wire-labels-and-links.md). */
import { describe, expect, test } from "bun:test";
import { newProject } from "./model";
import { addElement, addPage, connect, deleteElements, deleteSegments, pairLinkEnds, rotateElements, setConductorInfo, wire } from "./ops";
import { renumber } from "./renumber";
import { getSymbol, localGeometry, textBounds } from "./symbols";
import { elementTexts } from "./tags";
import { parseProject } from "./validate";
import { labelOnLinkEnd, routeOf, wireLabelOf } from "./wires";

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

describe("step 7b: link ends in place of the link arrow (A27)", () => {
  const links = (p: ReturnType<typeof newProject>, pg: string) => p.pages.find((x) => x.id === pg)!.elements.filter((e) => e.symbol === "link");

  test("drawn out to bare paper it's a source; drawn from bare paper, a destination; it points along its wire", () => {
    const { p, pg } = sheet();
    expect(getSymbol("link")!.palette).toBe(false);
    const k = addElement(p, pg, "contact", [20, 20]);
    const out = wire(p, pg, { terminal: [k.id, "14"] }, { free: [20, 40], label: "FAN RUN" });
    const [src] = links(p, pg);
    expect([src!.pos, src!.params.source, src!.label, out.to[0]]).toEqual([[20, 40], true, "FAN RUN", src!.id]);
    // Its wire comes from above: it points down, away from it.
    expect(src!.rot).toBe(0);
    const h = addElement(p, pg, "lamp", [60, 40]);
    wire(p, pg, { free: [40, 40] }, { terminal: [h.id, "+V"] });
    const dst = links(p, pg).find((e) => e.id !== src!.id)!;
    expect(dst.params.source).toBe(false);
    // Its wire goes off to the right, so its tail is on the left.
    expect(dst.rot).toBe(90);
    expect(() => wire(p, pg, { free: [10, 10] }, { free: [12, 10] })).toThrow("terminal");
  });

  test("a link end is the end of one wire: a second is refused, and it goes when its wire does", () => {
    const { p, pg } = sheet();
    const k = addElement(p, pg, "contact", [20, 20]);
    const k2 = addElement(p, pg, "contact", [40, 20]);
    const s = wire(p, pg, { terminal: [k.id, "14"] }, { free: [20, 40] });
    const end = links(p, pg)[0]!;
    expect(() => connect(p, pg, [k2.id, "14"], [end.id, "1"])).toThrow("one wire");
    const pg2 = addPage(p, "two").id;
    const h = addElement(p, pg2, "lamp", [30, 40]);
    wire(p, pg2, { free: [30, 20] }, { terminal: [h.id, "+V"] });
    const far = links(p, pg2)[0]!;
    pairLinkEnds(p, end.id, far.id);
    deleteSegments(p, pg, [s.id]);
    expect(links(p, pg)).toEqual([]);
    expect(far.links).toEqual([]);
    // Deleting the part its wire comes from takes the wire, and so the link end.
    deleteElements(p, pg2, [h.id]);
    expect(links(p, pg2)).toEqual([]);
  });

  test("Link… then bare paper carries the wire on: the arriving end is made already linked", () => {
    const { p, pg } = sheet();
    const k = addElement(p, pg, "contact", [20, 20]);
    wire(p, pg, { terminal: [k.id, "14"] }, { free: [20, 40], label: "FAN RUN" });
    const src = links(p, pg)[0]!;
    const pg2 = addPage(p, "two").id;
    const h = addElement(p, pg2, "lamp", [30, 40]);
    wire(p, pg2, { free: [30, 20], linkTo: src.id }, { terminal: [h.id, "+V"] });
    const dst = links(p, pg2)[0]!;
    expect([dst.params.source, dst.links, src.links]).toEqual([false, [src.id], [dst.id]]);
    expect(elementTexts(dst, p).label).toBe("FAN RUN");
    renumber(p);
    expect(elementTexts(dst, p).xref).toMatch(/^\(1-\d+\)$/);
  });

  test("a wire too short for its label prints none of its own: its link end prints it, number then colour", () => {
    const { p, pg } = sheet();
    const page = p.pages[0]!;
    const k = addElement(p, pg, "contact", [20, 20]);
    const s = wire(p, pg, { terminal: [k.id, "14"] }, { free: [20, 25] });
    renumber(p);
    setConductorInfo(p, s.conductor, { colour: "Bn" });
    const end = links(p, pg)[0]!;
    const label = wireLabelOf(p, page, s);
    expect(label.number).toBeTruthy();
    expect(label.colour).toBe("Bn");
    // Two units of wire can't carry "1-21 Bn".
    expect(labelOnLinkEnd(page, s, routeOf(page, s), label)).toBe(true);
    expect(elementTexts(end, p).wireLabel).toEqual(label);
    const texts = localGeometry(end, elementTexts(end, p)).prims.flatMap((x) => (x.t === "text" ? [x.text] : []));
    expect(texts).toContain(label.number!);
    expect(texts).toContain("Bn");
    // A long wire carries its own, and the link end prints none.
    const k2 = addElement(p, pg, "contact", [60, 10]);
    const long = wire(p, pg, { terminal: [k2.id, "14"] }, { free: [60, 60] });
    renumber(p);
    const far = page.elements.find((e) => e.symbol === "link" && (e.id === long.to[0]))!;
    expect(elementTexts(far, p).wireLabel).toBeUndefined();
  });
});
