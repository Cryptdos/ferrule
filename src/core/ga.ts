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
import { AREA_UNITS, UNIT_MM, type Vec } from "./geometry";
import type { Element, GaItem, GaSettings, Page, Project } from "./model";
import { getSymbol } from "./symbols";
import { isSlave, slavesOf } from "./xref";

/** Where the enclosure's top-left corner sits on the sheet, in grid units. */
export const GA_ORIGIN: Vec = [8, 9];

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

/**
 * The largest drawing of an enclosure that fits the sheet beside its
 * dimensions: any scale (1:7.5, 1:12…), to the next half step, so the layout
 * uses the page well. The usual scales stay as quick picks.
 */
export function fitScale(w: number, h: number): number {
  // Room to the right and below for the dimensions.
  const room = { w: (AREA_UNITS.w - GA_ORIGIN[0]) * UNIT_MM - 20, h: (AREA_UNITS.h - GA_ORIGIN[1]) * UNIT_MM - 18 };
  const need = Math.max(w / room.w, h / room.h, 0.5);
  return Math.ceil(need * 2 - 1e-9) / 2;
}

/** A scale as it's written: 1:7.5, 1:12. */
export const scaleText = (n: number) => `1:${Number.isInteger(n) ? n : n.toFixed(1).replace(/\.0$/, "")}`;

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
    case "pushbutton":
    case "selector":
      return { key: "door", poles: 1 };
    default:
      return null;
  }
}

/**
 * What a device in the device table suits: the schematic parts you draw
 * (design-v0.2 §8), not the GA's size groups. Keys from before (the size
 * groups) mostly carry on; "door" became lamp, push button and selector.
 */
export const SUITS: { key: string; label: string }[] = [
  { key: "relay", label: "Relay coil (plug-in relay)" },
  { key: "contactor", label: "Contactor" },
  { key: "timer", label: "Timer coil (timer relay)" },
  { key: "mcb", label: "Circuit breaker / MCB" },
  { key: "isolator", label: "Isolator / switch-disconnector" },
  { key: "fuse", label: "Fuse / fuse carrier" },
  { key: "terminal", label: "Terminal" },
  { key: "fuseTerminal", label: "Fused terminal" },
  { key: "disconnectTerminal", label: "Disconnect terminal" },
  { key: "earthTerminal", label: "Earth terminal" },
  { key: "transformer", label: "Transformer" },
  { key: "socket", label: "Socket outlet" },
  { key: "block", label: "Busbar (distribution block)" },
  { key: "lamp", label: "Indicator lamp" },
  { key: "pushbutton", label: "Push button" },
  { key: "selector", label: "Selector / keyswitch" },
];

/** Which entry of SUITS a schematic part is, or "" if it isn't a panel device. */
export function suitsKey(project: Project, el: Element): string {
  const k = sizeKey(project, el)?.key ?? "";
  if (k === "door") return el.symbol;
  if (k === "terminal") {
    const fn = el.params.function;
    return fn === "fuse" ? "fuseTerminal" : fn === "disconnect" || fn === "fuse-disconnect" ? "disconnectTerminal" : fn === "earth" ? "earthTerminal" : "terminal";
  }
  return k;
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
    const t = (fn === "fuse" || fn === "fuse-disconnect" ? sizes.fuseTerminal : fn === "disconnect" ? sizes.disconnectTerminal : sizes.terminal)!;
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

// ---------------------------------------------------------------------------
// Terminal strips keep up with the schematic (note 45)

/** A GA item's strip name: set, or (an item from before) its first terminal's strip. */
export function itemStrip(project: Project, it: GaItem): string | null {
  if (it.kind !== "device" || !it.refs?.length) return null;
  if (it.strip) return it.strip;
  const els = new Map(project.pages.flatMap((pg) => pg.elements.map((e) => [e.id, e] as const)));
  const first = it.refs.map((r) => els.get(r)).find((e) => !!e);
  return first?.symbol === "terminal" ? String(first.params.strip ?? "X1") : null;
}

/**
 * Bring every placed terminal strip up to date: terminals added to the
 * strip in the schematic join it (and the strip grows on the GA), deleted
 * or moved ones leave it. Its length follows unless a real device sets it.
 * Returns whether anything changed.
 */
export function syncGaStrips(project: Project): boolean {
  let changed = false;
  const placedElsewhere = new Set<string>();
  const stripItems: { it: GaItem; strip: string }[] = [];
  for (const pg of project.pages)
    for (const it of pg.gaItems ?? []) {
      const strip = itemStrip(project, it);
      if (strip) stripItems.push({ it, strip });
      else for (const r of it.refs ?? []) placedElsewhere.add(r);
    }
  if (!stripItems.length) return false;
  // Every panel terminal on the schematic, by strip, in sheet order then across the sheet.
  const byStrip = new Map<string, string[]>();
  for (const pg of project.pages) {
    if (pg.ga) continue;
    const terms = pg.elements.filter((e) => e.symbol === "terminal" && e.zone !== "external" && !placedElsewhere.has(e.id));
    terms.sort((a, b) => a.pos[0] - b.pos[0] || a.pos[1] - b.pos[1]);
    for (const t of terms) {
      const s = String(t.params.strip ?? "X1");
      byStrip.set(s, [...(byStrip.get(s) ?? []), t.id]);
    }
  }
  const taken = new Set<string>();
  for (const { it, strip } of stripItems) {
    const now = (byStrip.get(strip) ?? []).filter((id) => !taken.has(id));
    now.forEach((id) => taken.add(id));
    // Keep the order the strip had, new terminals after.
    const kept = (it.refs ?? []).filter((r) => now.includes(r));
    const refs = [...kept, ...now.filter((r) => !kept.includes(r))];
    if (!it.strip) {
      it.strip = strip;
      changed = true;
    }
    if (!it.seen) it.seen = [...(it.refs ?? [])];
    if (refs.join(",") === (it.refs ?? []).join(",")) continue;
    // Along its length, whichever way it was turned: the side that matched its old length.
    const was = stripSize(project, it.refs ?? []).w;
    const turned = Math.abs(it.h - was) < Math.abs(it.w - was);
    it.refs = refs;
    changed = true;
    if (!it.device && refs.length) {
      const { w } = stripSize(project, refs);
      if (turned) it.h = w;
      else it.w = w;
    }
  }
  return changed;
}

/** Placed strips whose terminals changed since their GA sheet was last open. */
export function changedGaStrips(project: Project): { page: Page; it: GaItem; added: number; removed: number }[] {
  const out: { page: Page; it: GaItem; added: number; removed: number }[] = [];
  for (const page of project.pages)
    for (const it of page.gaItems ?? []) {
      if (!it.strip || !it.seen) continue;
      const added = (it.refs ?? []).filter((r) => !it.seen!.includes(r)).length;
      const removed = it.seen.filter((r) => !(it.refs ?? []).includes(r)).length;
      if (added || removed) out.push({ page, it, added, removed });
    }
  return out;
}

/** Opening a GA sheet: its strips are as seen now. Returns whether anything changed. */
export function markGaSeen(page: Page): boolean {
  let changed = false;
  for (const it of page.gaItems ?? []) {
    if (!it.strip) continue;
    if ((it.seen ?? []).join(",") !== (it.refs ?? []).join(",")) {
      it.seen = [...(it.refs ?? [])];
      changed = true;
    }
  }
  return changed;
}
