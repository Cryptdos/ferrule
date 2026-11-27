import { controlBusbars } from "./testing";
import { describe, expect, test } from "bun:test";
import { newProject } from "./model";
import { addElement, addPage, connect, linkContact, linkOffpage, setConductorNumber, updateElement } from "./ops";
import { renumber } from "./renumber";
import { displayTag, elementTexts } from "./tags";
import { contactTable } from "./xref";

function rung() {
  const p = newProject("t");
  const pg = p.pages[0]!.id;
  const { cct: cct, ov: ov } = controlBusbars(p, pg, 10, 60);
  // Column 16 is x = 30..31.
  const s1 = addElement(p, pg, "pushbutton", [30, 25]);
  const k1 = addElement(p, pg, "coil", [30, 57]);
  connect(p, pg, [cct.id, "30"], [s1.id, "13"]);
  connect(p, pg, [s1.id, "14"], [k1.id, "A1"]);
  connect(p, pg, [k1.id, "A2"], [ov.id, "30"]);
  return { p, pg, cct, ov, s1, k1 };
}

describe("renumber (position scheme)", () => {
  test("tags are prefix + sheet-column", () => {
    const { p, s1, k1 } = rung();
    renumber(p);
    expect(k1.tag).toBe("K1-16");
    expect(s1.tag).toBe("S1-16");
  });

  test("the highest item in a column keeps the plain address, the rest get A, B…", () => {
    const { p, pg } = rung();
    const a = addElement(p, pg, "lamp", [60, 20]);
    const b = addElement(p, pg, "lamp", [61, 40]);
    const c = addElement(p, pg, "lamp", [60, 30]);
    renumber(p);
    expect([a.tag, c.tag, b.tag]).toEqual(["P1-31", "P1-31A", "P1-31B"]);
  });

  test("a wire on a supply carries its tag; any other is numbered from its start (v0.5 A23)", () => {
    const { p, s1, k1, cct, ov } = rung();
    renumber(p);
    const byTerm = (id: string, t: string) =>
      p.conductors.find((c) => c.terminals.some(([e, n]) => e === id && n === t))!.number;
    const tagOf = (bar: typeof cct) => String(p.distributions.find((d) => d.id === bar.params.dist)!.tag);
    // Off the CCT rail and back to 0V: the supplies' numbers. Between: a new potential, by position.
    expect(byTerm(s1.id, "13")).toBe(tagOf(cct));
    expect(byTerm(s1.id, "14")).toBe("1-16");
    expect(byTerm(k1.id, "A2")).toBe(tagOf(ov));
  });

  test("locked tags and wire numbers are kept, and nobody else takes them", () => {
    const { p, pg, k1, s1 } = rung();
    updateElement(p, pg, k1.id, { tag: "K1-16", params: { locked: true } });
    const k2 = addElement(p, pg, "coil", [31, 40]);
    renumber(p);
    expect(k1.tag).toBe("K1-16");
    expect(k2.tag).toBe("K1-16A");
    const c = p.conductors.find((x) => x.terminals.some(([e, n]) => e === s1.id && n === "14"))!;
    setConductorNumber(p, c.id, "SPARE-1");
    renumber(p);
    expect(c.number).toBe("SPARE-1");
  });

  test("terminals are numbered by position within their strip", () => {
    const p = newProject("t");
    const pg = p.pages[0]!.id;
    const x1 = addElement(p, pg, "terminal", [20, 80]);
    const x2 = addElement(p, pg, "terminal", [24, 80]);
    const y1 = addElement(p, pg, "terminal", [40, 80], { params: { strip: "X2" } });
    renumber(p);
    expect([x1.tag, x2.tag, y1.tag]).toEqual(["1-11", "1-13", "1-21"]);
  });
});

describe("cross-references", () => {
  test("contacts take the coil's tag, get pole numbers, and show in its contact table", () => {
    const { p, pg, k1 } = rung();
    const pg2 = addPage(p, "Controls").id;
    const a = addElement(p, pg, "contact", [80, 30]);
    const b = addElement(p, pg2, "contact", [40, 30], { params: { contact: "nc" } });
    linkContact(p, a.id, k1.id);
    linkContact(p, b.id, k1.id);
    renumber(p);
    expect(displayTag(a, p)).toBe("K1-16");
    expect(displayTag(b, p)).toBe("K1-16");
    expect(a.params.pole).toBe(1);
    expect(b.params.pole).toBe(2);
    expect(contactTable(p, k1)).toEqual([
      ["NO", "13-14", "1-41"], // same sheet: still in full (21)
      ["NC", "21-22", "2-21"],
    ]);
    // Position tags already say where the coil is, so no extra cross-reference.
    expect(elementTexts(a, p).xref).toBe("");
  });

  test("only contacts link to coils", () => {
    const { p, s1, k1 } = rung();
    expect(() => linkContact(p, s1.id, k1.id)).toThrow();
  });

  test("off-page arrows pair up, point at each other and carry the wire number across", () => {
    const { p, pg, s1 } = rung();
    const pg2 = addPage(p, "Next").id;
    const out = addElement(p, pg, "offpage", [50, 30]);
    const inn = addElement(p, pg2, "offpage", [20, 20], { rot: 180 });
    const h = addElement(p, pg2, "lamp", [20, 40]);
    connect(p, pg, [s1.id, "14"], [out.id, "1"]);
    connect(p, pg2, [inn.id, "1"], [h.id, "+V"]);
    linkOffpage(p, out.id, inn.id);
    renumber(p);
    expect(elementTexts(out, p).xref).toBe("(2-11)");
    expect(elementTexts(inn, p).xref).toBe("(1-26)");
    const num = (id: string, t: string) => p.conductors.find((c) => c.terminals.some(([e, n]) => e === id && n === t))!.number;
    expect(num(h.id, "+V")).toBe(num(s1.id, "14"));
  });
});
