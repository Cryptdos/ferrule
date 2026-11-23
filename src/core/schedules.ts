/**
 * Terminal and cable schedules, generated from the drawing (DESIGN.md §7).
 */
import type { Element, Page, Project, Segment } from "./model";
import { displayTag, elementTexts } from "./tags";
import { address } from "./xref";
import { gaSizes, sizeKey } from "./ga";

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

// ---------------------------------------------------------------------------
// Bill of materials (design-v0.2 §8): from the GA sheets and the device table

export interface BomRow {
  /** The GA sheet, as "5" (sheets in order). */
  sheet: string;
  item: string;
  maker: string;
  part: string;
  quantity: number;
  unit: string;
  /** The tags (or a label plate's text) it's for. */
  tags: string;
}

/**
 * What's laid out on each GA sheet, counted: devices by the device picked
 * from the table (or by their generic size where none is), terminals each,
 * label plates, and DIN rail and trunking by length.
 */
export function billOfMaterials(project: Project): BomRow[] {
  const sizes = gaSizes(project);
  const els = new Map(project.pages.flatMap((pg) => pg.elements.map((e) => [e.id, e] as const)));
  const out: BomRow[] = [];
  for (const page of project.pages) {
    if (!page.ga) continue;
    const rows = new Map<string, BomRow & { tagList: string[] }>();
    const add = (key: string, row: Omit<BomRow, "tags" | "sheet">, tags: string[]) => {
      const r = rows.get(key) ?? { ...row, sheet: String(page.number), tags: "", tagList: [], quantity: 0 };
      r.quantity += row.quantity;
      r.tagList.push(...tags.filter(Boolean));
      rows.set(key, r);
    };
    for (const it of page.gaItems ?? []) {
      if (it.kind === "rail") {
        add("rail", { item: "DIN rail 35 mm", maker: "", part: "", quantity: Math.max(it.w, it.h) / 1000, unit: "m" }, []);
      } else if (it.kind === "trunking") {
        const across = Math.min(it.w, it.h);
        add(`trunking:${across}`, { item: `Trunking ${across} mm wide`, maker: "", part: "", quantity: Math.max(it.w, it.h) / 1000, unit: "m" }, []);
      } else if (it.kind === "label") {
        add(`label:${it.w}x${it.h}`, { item: `Label plate ${it.w} × ${it.h} mm`, maker: "", part: "", quantity: 1, unit: "each" }, [(it.text ?? "").replace(/\n/g, " / ")]);
      } else if (it.kind === "device") {
        const refs = (it.refs ?? []).map((r) => els.get(r)).filter((e): e is Element => !!e);
        const first = refs[0];
        const strip = first?.symbol === "terminal" && !it.part;
        const tags = strip ? [`${it.strip ?? first.params.strip ?? "X1"}`] : refs.map((e) => displayTag(e, project) + (it.part === "handle" ? " handle" : ""));
        const qty = strip ? refs.length : 1;
        const dev = it.device ? project.devices?.find((d) => d.id === it.device) : undefined;
        if (dev) {
          add(`dev:${dev.id}`, { item: dev.name, maker: dev.maker, part: dev.part, quantity: qty, unit: "each" }, tags);
          continue;
        }
        // No device picked: counted by its generic size, so what's still to choose shows.
        const key = it.part === "handle" ? "handle" : first ? (sizeKey(project, first)?.key ?? "other") : "other";
        const generic = key === "terminal" && first ? terminalKind(first) : key;
        const label = sizes[generic]?.label ?? (it.text || "Device");
        add(`gen:${generic}`, { item: `${label} (no device picked)`, maker: "", part: "", quantity: qty, unit: "each" }, tags);
      }
    }
    const list = [...rows.values()].map(({ tagList, ...r }) => ({ ...r, quantity: Math.round(r.quantity * 1000) / 1000, tags: [...new Set(tagList)].sort(natural).join(" ") }));
    out.push(...list.sort((a, b) => natural(a.item, b.item)));
  }
  return out;
}

/** A terminal's generic size: plain, fused or disconnect. */
function terminalKind(el: Element): string {
  const fn = el.params.function;
  return fn === "fuse" || fn === "fuse-disconnect" ? "fuseTerminal" : fn === "disconnect" ? "disconnectTerminal" : "terminal";
}
