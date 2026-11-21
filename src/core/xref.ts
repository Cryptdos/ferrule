/**
 * Element links and cross-references (DESIGN.md §8).
 *
 * A coil is a *master*; the contacts it drives are its *slaves*. Links are
 * stored on both sides (`links`) and kept in step by the link operations.
 * A slave takes its tag from its coil, shows where the coil is, and the
 * coil shows a table of its contacts and where they are. Off-page arrows
 * link in pairs and show where the other one is.
 */
import { columnOf, type Rect, type Vec } from "./geometry";
import type { Element, Page, Project } from "./model";
import { isolatorAux, type Prim } from "./symbols";

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

/** Rows of a coil's contact table: type, marks, where. A contactor's auxiliary contacts get a row each. */
export function contactTable(project: Project, el: Element): [string, string, string][] {
  return contactRows(project, el).map((r) => r.row);
}

/** The same rows, each with the contact it describes. */
export function contactRows(project: Project, el: Element): { row: [string, string, string]; id: string }[] {
  return slavesOf(project, el).flatMap((s) => {
    const where = address(s.page, s.el.pos);
    const rows: { row: [string, string, string]; id: string }[] = [
      { row: [contactType(s.el), contactMarks(s.el), where], id: s.el.id },
    ];
    if (s.el.symbol === "isolator") {
      for (const a of isolatorAux(s.el)) rows.push({ row: [a.nc ? "NC" : "NO", `${a.a}-${a.b}`, where], id: s.el.id });
    }
    return rows;
  });
}

/** Which row of a contact table a point (relative to the table's corner) is on, or -1. */
export function contactTableRowAt(rows: number, local: Vec): number {
  if (local[0] < 0 || local[0] > TABLE_W || local[1] < 0) return -1;
  const i = Math.floor((local[1] - 0.15) / TABLE_ROW);
  return i >= 0 && i < rows ? i : local[1] < 0.4 ? 0 : -1;
}

/** Where a double-click on an element takes you: coil ↔ contact, arrow ↔ arrow. */
export function linkedTarget(project: Project, el: Element): string | null {
  const m = masterOf(project, el);
  if (m) return m.el.id;
  const p = partnerOf(project, el);
  if (p) return p.el.id;
  const first = slavesOf(project, el)[0];
  return first ? first.el.id : null;
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

// Contact table layout, in grid units.
const TABLE_ROW = 1.1;
const TABLE_TEXT = 0.85;
const TABLE_W = 7.4;
/** Where the marks column ends and the address column starts. */
const TABLE_SEP = 4.4;

/**
 * Where a coil's contact table sits, relative to the coil, or wherever it
 * has been dragged to (params xrefDx/xrefDy). By default it's to the right
 * of the coil's wire, ending just above the coil: clear of the coil's own
 * wires and of a coil on the next rung at the same height, and narrow
 * enough to sit between rungs 5 columns apart.
 */
export function contactTableAt(el: Element, body: Rect, rows: number): Vec {
  const dx = typeof el.params.xrefDx === "number" ? el.params.xrefDx : Math.max(1.9, body.x + body.w + 0.3);
  const dy = typeof el.params.xrefDy === "number" ? el.params.xrefDy : body.y - 0.2 - contactTableRect(rows, [0, 0]).h;
  return [dx, dy];
}

/** The table's outline, relative to the coil, for picking it up. */
export function contactTableRect(rows: number, at: Vec): Rect {
  return { x: at[0], y: at[1], w: TABLE_W, h: rows * TABLE_ROW + 0.4 };
}

/** The contact table drawn beside a coil, one row per contact, in the coil's coordinates. */
export function contactTablePrims(rows: [string, string, string][], at: Vec): Prim[] {
  if (!rows.length) return [];
  const [x0, top] = at;
  const sep = x0 + TABLE_SEP;
  const out: Prim[] = [
    { t: "line", pts: [[x0, top], [x0 + TABLE_W, top]], w: 0.1 },
    { t: "line", pts: [[sep, top], [sep, top + rows.length * TABLE_ROW + 0.3]], w: 0.1 },
  ];
  rows.forEach(([type, marks, where], i) => {
    const y = top + (i + 1) * TABLE_ROW - 0.15;
    out.push(
      { t: "text", at: [x0 + 0.1, y], text: type, size: TABLE_TEXT, anchor: "start", role: "xref" },
      { t: "text", at: [sep - 0.2, y], text: marks, size: TABLE_TEXT, anchor: "end", role: "xref" },
      { t: "text", at: [sep + 0.25, y], text: where, size: TABLE_TEXT, anchor: "start", role: "xref" },
    );
  });
  return out;
}
