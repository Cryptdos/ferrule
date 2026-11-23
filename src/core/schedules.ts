/**
 * Terminal and cable schedules, generated from the drawing (DESIGN.md §7).
 */
import type { Element, Page, Project, Segment } from "./model";
import { displayTag, elementTexts } from "./tags";
import { address } from "./xref";

export interface TerminalRow {
  strip: string;
  terminal: string;
  where: string;
  wire: string;
  internal: string;
  external: string;
}

export interface CableRow {
  plant: string;
  description: string;
  plantTerminal: string;
  wire: string;
  panelTerminal: string;
  where: string;
}

function endName(project: Project, el: Element | undefined, term: string): string {
  if (!el) return "?";
  if (el.symbol === "junction") return "(junction)";
  const tag = displayTag(el, project);
  if (el.symbol === "terminal") return `${el.params.strip ?? "X1"}:${tag}`;
  if (el.symbol === "busbar") return elementTexts(el, project).name || tag || "busbar";
  return `${tag || el.symbol}:${term}`;
}

function wireNumber(project: Project, seg: Segment): string {
  return project.conductors.find((c) => c.id === seg.conductor)?.number ?? "";
}

function natural(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true });
}

export function terminalSchedule(project: Project): TerminalRow[] {
  const rows: TerminalRow[] = [];
  for (const page of project.pages) {
    const byId = new Map(page.elements.map((e) => [e.id, e]));
    for (const el of page.elements) {
      if (el.symbol !== "terminal") continue;
      const internal: string[] = [];
      const external: string[] = [];
      let wire = "";
      for (const seg of page.segments) {
        const mine = seg.from[0] === el.id ? seg.from : seg.to[0] === el.id ? seg.to : null;
        if (!mine) continue;
        const other = mine === seg.from ? seg.to : seg.from;
        const o = byId.get(other[0]);
        wire ||= wireNumber(project, seg);
        const name = endName(project, o, other[1]);
        // The field side is wherever the other end is out in the field,
        // or the bottom of the terminal when there's no boundary.
        const field = o ? o.zone === "external" : false;
        (field || (page.boundaryY === null && mine[1] === "2") ? external : internal).push(name);
      }
      rows.push({
        strip: String(el.params.strip ?? "X1"),
        terminal: displayTag(el, project),
        where: address(page, el.pos),
        wire,
        internal: internal.join(", "),
        external: external.join(", "),
      });
    }
  }
  return rows.sort((a, b) => natural(a.strip, b.strip) || natural(a.terminal, b.terminal));
}

export function cableSchedule(project: Project): CableRow[] {
  const rows: CableRow[] = [];
  for (const page of project.pages) {
    const byId = new Map(page.elements.map((e) => [e.id, e]));
    for (const el of page.elements) {
      if (el.symbol !== "plant-view") continue;
      const item = project.plant.find((p) => p.id === el.params.plant);
      for (const seg of page.segments) {
        const mine = seg.from[0] === el.id ? seg.from : seg.to[0] === el.id ? seg.to : null;
        if (!mine) continue;
        const other = mine === seg.from ? seg.to : seg.from;
        rows.push({
          plant: item?.tag ?? "?",
          description: item?.description ?? "",
          plantTerminal: mine[1],
          wire: wireNumber(project, seg),
          panelTerminal: endName(project, byId.get(other[0]), other[1]),
          where: address(page as Page, el.pos),
        });
      }
    }
  }
  return rows.sort((a, b) => natural(a.plant, b.plant) || natural(a.plantTerminal, b.plantTerminal));
}

/** CSV text for a list of rows, for spreadsheets. */
export function toCsv<T extends object>(rows: T[], headers: [keyof T, string][]): string {
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(([, h]) => esc(h)).join(","), ...rows.map((r) => headers.map(([k]) => esc(r[k])).join(","))].join("\n") + "\n";
}
