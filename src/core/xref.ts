/**
 * Element links and cross-references (DESIGN.md §8).
 *
 * A coil is a *master*; the contacts it drives are its *slaves*. Links are
 * stored on both sides (`links`) and kept in step by the link operations.
 * A slave takes its tag from its coil, shows where the coil is, and the
 * coil shows a table of its contacts and where they are. Off-page arrows
 * link in pairs and show where the other one is.
 */
import { columnOf, type Vec } from "./geometry";
import type { Element, Page, Project } from "./model";
import type { Prim } from "./symbols";

export const MASTER_SYMBOLS = new Set(["coil", "timer-coil"]);
const SLAVE_SYMBOLS = new Set(["contact-no", "contact-nc", "contact-co", "timer-contact"]);

export function isMaster(el: Element): boolean {
  return MASTER_SYMBOLS.has(el.symbol);
}

/** Contacts, and the main contacts of a contactor, can be driven by a coil. */
export function isSlave(el: Element): boolean {
  return SLAVE_SYMBOLS.has(el.symbol) || (el.symbol === "isolator" && el.params.function === "contactor");
}

export interface Located {
  el: Element;
  page: Page;
}

/** Find an element anywhere in the project. */
export function locate(project: Project, id: string): Located | null {
  for (const page of project.pages) {
    const el = page.elements.find((e) => e.id === id);
    if (el) return { el, page };
  }
  return null;
}

/** Sheet-column address of a point, e.g. "10-16". */
export function address(page: Page, pos: Vec): string {
  return `${page.number}-${columnOf(pos[0])}`;
}

export function masterOf(project: Project, el: Element): Located | null {
  if (!isSlave(el)) return null;
  for (const id of el.links) {
    const m = locate(project, id);
    if (m && isMaster(m.el)) return m;
  }
  return null;
}

export function slavesOf(project: Project, el: Element): Located[] {
  if (!isMaster(el)) return [];
  const out: Located[] = [];
  for (const id of el.links) {
    const s = locate(project, id);
    if (s && isSlave(s.el)) out.push(s);
  }
  // In drawing order: by sheet, then column, then down the page.
  return out.sort(
    (a, b) =>
      a.page.number - b.page.number || columnOf(a.el.pos[0]) - columnOf(b.el.pos[0]) || a.el.pos[1] - b.el.pos[1],
  );
}

/** The other arrow of an off-page pair. */
export function partnerOf(project: Project, el: Element): Located | null {
  if (el.symbol !== "offpage") return null;
  for (const id of el.links) {
    const p = locate(project, id);
    if (p && p.el.symbol === "offpage") return p;
  }
  return null;
}

/** How a contact is described in a coil's contact table. */
export function contactType(el: Element): string {
  switch (el.symbol) {
    case "contact-no":
      return "NO";
    case "contact-nc":
      return "NC";
    case "contact-co":
      return "CO";
    case "timer-contact":
      return el.params.contact === "nc" ? "NC" : "NO";
    case "isolator":
      return "Main";
    default:
      return "";
  }
}

/** Printed terminal marks of a contact, e.g. "23-24". */
export function contactMarks(el: Element): string {
  const pole = typeof el.params.pole === "number" && el.params.pole > 0 ? String(el.params.pole) : "";
  const pair = (a: string, b: string) => (pole ? `${pole}${a[1]}-${pole}${b[1]}` : `${a}-${b}`);
  switch (el.symbol) {
    case "contact-no":
      return pair("13", "14");
    case "contact-nc":
      return pair("21", "22");
    case "contact-co":
      return pole ? `${pole}1-${pole}2/${pole}4` : "11-12/14";
    case "timer-contact":
      return el.params.contact === "nc" ? pair("15", "16") : pair("17", "18");
    case "isolator": {
      const n = typeof el.params.poles === "number" ? el.params.poles : 3;
      return `1-${2 * n}`;
    }
    default:
      return "";
  }
}

/** Rows of a coil's contact table: type, marks, where. */
export function contactTable(project: Project, el: Element): [string, string, string][] {
  return slavesOf(project, el).map((s) => [contactType(s.el), contactMarks(s.el), address(s.page, s.el.pos)]);
}

/** The cross-reference shown under an element's tag. */
export function xrefText(project: Project, el: Element, masterTag: string): string {
  if (el.symbol === "offpage") {
    const p = partnerOf(project, el);
    if (p) return address(p.page, p.el.pos);
    return typeof el.params.ref === "string" ? el.params.ref : "";
  }
  const m = masterOf(project, el);
  if (m) {
    const where = address(m.page, m.el.pos);
    // With position-based tags the coil's tag already says where it is.
    return masterTag.endsWith(where) ? "" : `/${where}`;
  }
  return "";
}

/**
 * The contact table drawn under a coil, in the coil's local coordinates:
 * one row per contact, below everything else the coil draws.
 */
export function contactTablePrims(rows: [string, string, string][], below: number): Prim[] {
  if (!rows.length) return [];
  const rowH = 1.35;
  const top = below + 0.9;
  const out: Prim[] = [
    { t: "line", pts: [[-4.4, top], [3.6, top]], w: 0.12 },
    { t: "line", pts: [[0.6, top], [0.6, top + rows.length * rowH + 0.3]], w: 0.12 },
  ];
  rows.forEach(([type, marks, where], i) => {
    const y = top + (i + 1) * rowH - 0.2;
    out.push(
      { t: "text", at: [-4.3, y], text: type, size: 1.0, anchor: "start", role: "xref" },
      { t: "text", at: [0.4, y], text: marks, size: 1.0, anchor: "end", role: "xref" },
      { t: "text", at: [0.9, y], text: where, size: 1.0, anchor: "start", role: "xref" },
    );
  });
  return out;
}
