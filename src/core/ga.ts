/**
 * General arrangement (GA) drawings: the panel's layout at true scale, a
 * view of the backplate or the door. Items are DIN rails, trunking, notes
 * and the devices from the schematic, each sized from a library of generic
 * sizes the project can change. A device on the GA refers to its schematic
 * element, so the GA shows its tag and the schematic can say what's not
 * yet placed.
 *
 * GA items are kept in real millimetres, measured from the enclosure's
 * top-left corner; they're drawn at the sheet's scale.
 */
import { UNIT_MM, type Vec } from "./geometry";
import type { Element, GaItem, GaSettings, Page, Project } from "./model";
import { getSymbol } from "./symbols";
import { isSlave, slavesOf } from "./xref";

/** Where the enclosure's top-left corner sits on the sheet, in grid units. */
export const GA_ORIGIN: Vec = [10, 12];

/** Scales offered, as 1:n. */
export const GA_SCALES = [1, 2, 2.5, 5, 10, 15, 20];

/** Real millimetres to grid units on a GA sheet. */
export function mmToUnits(ga: GaSettings, mm: number): number {
  return mm / ga.scale / UNIT_MM;
}

/** A real position on the panel (mm from the enclosure's corner) to grid units on the sheet. */
export function gaToSheet(ga: GaSettings, p: Vec): Vec {
  return [GA_ORIGIN[0] + mmToUnits(ga, p[0]), GA_ORIGIN[1] + mmToUnits(ga, p[1])];
}

/** The other way: a point on the sheet to real mm on the panel. */
export function sheetToGa(ga: GaSettings, p: Vec): Vec {
  return [(p[0] - GA_ORIGIN[0]) * UNIT_MM * ga.scale, (p[1] - GA_ORIGIN[1]) * UNIT_MM * ga.scale];
}

/** The smallest usual scale at which an enclosure fits the drawing area beside its dimensions. */
export function fitScale(w: number, h: number): number {
  const room = { w: 175 * UNIT_MM, h: 95 * UNIT_MM };
  return GA_SCALES.find((s) => w / s <= room.w && h / s <= room.h) ?? GA_SCALES[GA_SCALES.length - 1]!;
}

// ---------------------------------------------------------------------------
// Device sizes

export interface GaSize {
  w: number;
  h: number;
  label: string;
  /** Width per pole (MCBs, fuses): w is then per pole. */
  perPole?: boolean;
}

/** Generic sizes (mm, width × height on the backplate or door). Close to typical DIN-rail parts. */
export const GA_SIZES: Record<string, GaSize> = {
  relay: { w: 16, h: 80, label: "Plug-in relay with base" },
  contactor: { w: 45, h: 85, label: "Contactor (up to 3 poles + aux)" },
  timer: { w: 22.5, h: 90, label: "Timer relay" },
  mcb: { w: 18, h: 90, label: "MCB / breaker, per pole", perPole: true },
  isolator: { w: 18, h: 90, label: "DIN isolator, per pole", perPole: true },
  fuse: { w: 18, h: 81, label: "Fuse carrier, per pole", perPole: true },
  terminal: { w: 5.2, h: 45, label: "Terminal (each)" },
  fuseTerminal: { w: 8.2, h: 65, label: "Fused terminal (each)" },
  disconnectTerminal: { w: 6.2, h: 60, label: "Disconnect terminal (each)" },
  transformer: { w: 80, h: 75, label: "Control transformer" },
  socket: { w: 45, h: 90, label: "DIN socket outlet" },
  block: { w: 60, h: 50, label: "Distribution block" },
  door: { w: 30, h: 40, label: "Door device (22 mm) with legend" },
};

/** Sizes for this project: the generic ones with any the project has changed. */
export function gaSizes(project: Project): Record<string, GaSize> {
  const out: Record<string, GaSize> = {};
  for (const [k, v] of Object.entries(GA_SIZES)) out[k] = { ...v, ...(project.gaSizes?.[k] ?? {}) };
  return out;
}

/** Which size a schematic element takes on a GA, and how many poles; null if it isn't a panel device. */
export function sizeKey(project: Project, el: Element): { key: string; poles: number } | null {
  if (el.zone === "external") return null;
  const poles = typeof el.params.poles === "number" ? el.params.poles : 1;
  switch (el.symbol) {
    case "coil":
      // A coil working contactor main contacts is a contactor; otherwise a relay.
      return slavesOf(project, el).some((s) => s.el.symbol === "isolator") ? { key: "contactor", poles: 1 } : { key: "relay", poles: 1 };
    case "timer-coil":
      return { key: "timer", poles: 1 };
    case "isolator":
      if (el.params.function === "contactor") return isSlave(el) && el.links.length ? null : { key: "contactor", poles: 1 };
      return { key: el.params.function === "breaker" ? "mcb" : "isolator", poles: poles + (Number(el.params.aux) || 0) * 0.5 };
    case "fuse":
      return { key: "fuse", poles };
    case "terminal":
      return { key: "terminal", poles: 1 };
    case "transformer":
      return { key: "transformer", poles: 1 };
    case "socket":
      return { key: "socket", poles: 1 };
    case "busbar":
      return { key: "block", poles: 1 };
    case "lamp":
    case "pb-no":
    case "pb-nc":
    case "selector":
      return { key: "door", poles: 1 };
    default:
      return null;
  }
}

/** A device's size on the GA, mm. */
export function deviceSize(project: Project, el: Element): { w: number; h: number } {
  const k = sizeKey(project, el);
  const sizes = gaSizes(project);
  if (!k) return { w: 20, h: 40 };
  const s = sizes[k.key]!;
  return { w: Math.round((s.perPole ? s.w * k.poles : s.w) * 10) / 10, h: s.h };
}

/** Door devices go on the door view; everything else on the backplate. */
export function isDoorDevice(project: Project, el: Element): boolean {
  return sizeKey(project, el)?.key === "door";
}

/** Every element already on some GA sheet. */
export function placedOnGa(project: Project): Set<string> {
  const out = new Set<string>();
  for (const pg of project.pages) for (const it of pg.gaItems ?? []) for (const r of it.refs ?? []) out.add(r);
  return out;
}

export interface GaCandidate {
  /** One element, or a whole terminal strip on a sheet. */
  refs: string[];
  label: string;
  /** For sorting and showing where it is. */
  sheet: number;
  door: boolean;
  w: number;
  h: number;
}

/**
 * Panel devices from the schematic that aren't on a GA yet. Terminals come
 * as whole strips (all of X1 together), as they'd be fitted.
 */
export function gaCandidates(project: Project, tagOf: (el: Element) => string): GaCandidate[] {
  const placed = placedOnGa(project);
  const out: GaCandidate[] = [];
  const strips = new Map<string, { refs: string[]; sheet: number }>();
  for (const pg of project.pages) {
    if (pg.ga) continue;
    for (const el of pg.elements) {
      if (placed.has(el.id) || !sizeKey(project, el)) continue;
      if (el.symbol === "terminal") {
        const strip = String(el.params.strip ?? "X1");
        const s = strips.get(strip) ?? { refs: [], sheet: pg.number };
        s.refs.push(el.id);
        strips.set(strip, s);
        continue;
      }
      const size = deviceSize(project, el);
      out.push({ refs: [el.id], label: tagOf(el) || getSymbol(el.symbol)?.name || el.symbol, sheet: pg.number, door: isDoorDevice(project, el), ...size });
    }
  }
  for (const [strip, s] of strips) {
    const { w, h } = stripSize(project, s.refs);
    out.push({ refs: s.refs, label: `${strip} (${s.refs.length} terminals)`, sheet: s.sheet, door: false, w, h });
  }
  return out.sort((a, b) => a.sheet - b.sheet || a.label.localeCompare(b.label, undefined, { numeric: true }));
}

/** A strip's length on the rail: each terminal's width (fused and disconnect ones are wider), and its tallest. */
export function stripSize(project: Project, refs: string[]): { w: number; h: number } {
  const sizes = gaSizes(project);
  const byId = new Map(project.pages.flatMap((pg) => pg.elements.map((e) => [e.id, e])));
  let w = 0;
  let h = 0;
  for (const id of refs) {
    const fn = byId.get(id)?.params.function;
    const t = (fn === "fuse" ? sizes.fuseTerminal : fn === "disconnect" ? sizes.disconnectTerminal : sizes.terminal)!;
    w += t.w;
    h = Math.max(h, t.h);
  }
  return { w: Math.round(w * 10) / 10, h: h || sizes.terminal!.h };
}

/** Snap a device onto the nearest DIN rail it's dropped near: centred on the rail's line. */
export function snapToRail(page: Page, item: Pick<GaItem, "x" | "y" | "w" | "h">): number | null {
  let best: { y: number; d: number } | null = null;
  for (const r of page.gaItems ?? []) {
    if (r.kind !== "rail" || r.h > r.w) continue; // horizontal rails only
    const centre = r.y + r.h / 2;
    const d = Math.abs(item.y + item.h / 2 - centre);
    const along = item.x + item.w > r.x && item.x < r.x + r.w;
    if (along && d < 30 && (!best || d < best.d)) best = { y: centre - item.h / 2, d };
  }
  return best ? best.y : null;
}
