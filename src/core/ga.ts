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
import type { DoorColumn, DoorLeaf, Element, GaDimPoint, GaItem, GaSettings, GaView, Page, PlantItem, Project } from "./model";
import { getSymbol } from "./symbols";
import { controllerName, modulesOf, viewsOf } from "./modules";
import { isSlave, slavesOf } from "./xref";

/** Where the enclosure's top-left corner sits on the sheet, in grid units. */
export const GA_ORIGIN: Vec = [8, 9];

/** Scales offered, as 1:n. */
export const GA_SCALES = [1, 2, 2.5, 5, 10, 15, 20];

/** Real millimetres to grid units on a GA sheet. */
export function mmToUnits(ga: Pick<GaSettings, "scale">, mm: number): number {
  return mm / ga.scale / UNIT_MM;
}

/**
 * What part of the panel a sheet shows, in the sheet's own mm: from x0
 * across w (one leaf of a door, or all of it), h high. A position x mm on the
 * panel is drawn at x - x0.
 */
export interface GaFrame {
  scale: number;
  x0: number;
  /** From the top: one door of a modular door starts lower down (v0.4.x M13). Unset: 0. */
  y0?: number;
  w: number;
  h: number;
}

/** A real position on the panel (mm from the enclosure's corner) to grid units on the sheet. */
export function gaToSheet(ga: Pick<GaFrame, "scale"> & { x0?: number; y0?: number }, p: Vec): Vec {
  return [GA_ORIGIN[0] + mmToUnits(ga, p[0] - (ga.x0 ?? 0)), GA_ORIGIN[1] + mmToUnits(ga, p[1] - (ga.y0 ?? 0))];
}

/** The other way: a point on the sheet to real mm on the panel. */
export function sheetToGa(ga: Pick<GaFrame, "scale"> & { x0?: number; y0?: number }, p: Vec): Vec {
  return [(p[0] - GA_ORIGIN[0]) * UNIT_MM * ga.scale + (ga.x0 ?? 0), (p[1] - GA_ORIGIN[1]) * UNIT_MM * ga.scale + (ga.y0 ?? 0)];
}

// ---------------------------------------------------------------------------
// Doors: front and back views, one or two leaves

export const VIEW_NAMES: Record<GaView, string> = { backplate: "Backplate", "door-front": "Door front", "door-back": "Door back", detail: "Detail" };
export const isDoorView = (v: GaView | undefined) => v === "door-front" || v === "door-back";

/** The door-front sheet that owns the door a sheet shows: itself, or the sheet it's a view of. Null for a backplate. */
export function doorOwner(project: Project, page: Page): Page | null {
  if (!page.ga || !isDoorView(page.ga.view)) return null;
  if (page.ga.of) {
    const o = project.pages.find((p) => p.id === page.ga!.of);
    if (o?.ga?.view === "door-front" && !o.ga.of) return o;
  }
  return page.ga.view === "door-front" ? page : null;
}

/** The size a GA sheet draws: its enclosure, or the door it's a view of. */
export function gaSize(project: Project, page: Page): { w: number; h: number } {
  const owner = doorOwner(project, page);
  return { ...(owner ?? page).ga!.enclosure };
}

/** A door's leaves, left to right from the front. One leaf hinged left unless set. */
export function doorLeaves(owner: Page): DoorLeaf[] {
  const ga = owner.ga!;
  const leaves = ga.leaves?.length ? ga.leaves.slice(0, 2) : [{ w: ga.enclosure.w, hinge: "left" as const }];
  if (leaves.length === 1) return [{ w: ga.enclosure.w, hinge: leaves[0]!.hinge }];
  // Two leaves share the door's width: the second takes what the first leaves.
  const a = Math.min(Math.max(1, leaves[0]!.w), ga.enclosure.w - 1);
  return [
    { w: a, hinge: leaves[0]!.hinge },
    { w: ga.enclosure.w - a, hinge: leaves[1]!.hinge },
  ];
}

/** Leaves as a sheet sees them, left to right: mirrored on the door back (the front's left leaf is on the right). */
export function sheetLeaves(project: Project, page: Page): { x: number; w: number; hinge: "left" | "right"; index: 0 | 1 }[] {
  const owner = doorOwner(project, page);
  if (!owner) return [];
  const leaves = doorLeaves(owner);
  const W = owner.ga!.enclosure.w;
  let x = 0;
  const out = leaves.map((l, i) => {
    const r = { x, w: l.w, hinge: l.hinge, index: i as 0 | 1 };
    x += l.w;
    return r;
  });
  if (page.ga!.view !== "door-back") return out;
  return out.map((l) => ({ ...l, x: W - l.x - l.w, hinge: l.hinge === "left" ? ("right" as const) : ("left" as const) })).sort((a, b) => a.x - b.x);
}

// ---------------------------------------------------------------------------
// Modular doors (v0.4.x M13): columns of stacked doors

export const MAX_COLUMNS = 6;
export const MAX_DOORS = 8;

/** One door of a door, where it is (mm from the front's top-left), its hinge and name. */
export interface Pane {
  col: number;
  row: number;
  x: number;
  y: number;
  w: number;
  h: number;
  hinge: "left" | "right";
  name?: string;
}

/**
 * A door's columns, as set or as its leaves make them (a leaf is a column
 * with one door the full height), sized to fit: the last column takes the
 * width that's left, the last door in each column the height.
 */
export function doorColumns(owner: Page): DoorColumn[] {
  const ga = owner.ga!;
  const { w: W, h: H } = ga.enclosure;
  const raw: DoorColumn[] = ga.columns?.length
    ? ga.columns.slice(0, MAX_COLUMNS)
    : doorLeaves(owner).map((l) => ({ w: l.w, doors: [{ h: H, hinge: l.hinge }] }));
  let left = W;
  return raw.map((c, i) => {
    const last = i === raw.length - 1;
    const w = last ? left : Math.min(Math.max(1, c.w), left - (raw.length - 1 - i));
    left -= w;
    const doors = (c.doors.length ? c.doors : [{ h: H, hinge: "left" as const }]).slice(0, MAX_DOORS);
    let down = H;
    return {
      w,
      doors: doors.map((d, j) => {
        const lastD = j === doors.length - 1;
        const h = lastD ? down : Math.min(Math.max(1, d.h), down - (doors.length - 1 - j));
        down -= h;
        return { h, hinge: d.hinge, ...(d.name ? { name: d.name } : {}) };
      }),
    };
  });
}

/** Every door of a door, from the front: column by column, top to bottom. */
export function doorPanes(owner: Page): Pane[] {
  const out: Pane[] = [];
  let x = 0;
  doorColumns(owner).forEach((c, col) => {
    let y = 0;
    c.doors.forEach((d, row) => {
      out.push({ col, row, x, y, w: c.w, h: d.h, hinge: d.hinge, ...(d.name ? { name: d.name } : {}) });
      y += d.h;
    });
    x += c.w;
  });
  return out;
}

/** The doors as a sheet sees them: mirrored left to right on the door back, hinges with them. */
export function sheetPanes(project: Project, page: Page): Pane[] {
  const owner = doorOwner(project, page);
  if (!owner) return [];
  const panes = doorPanes(owner);
  if (page.ga!.view !== "door-back") return panes;
  const W = owner.ga!.enclosure.w;
  return panes.map((p) => ({ ...p, x: W - p.x - p.w, hinge: p.hinge === "left" ? ("right" as const) : ("left" as const) }));
}

/** The door a sheet shows on its own: its `pane`, or with `leaf` that column's only door. */
export function shownPane(project: Project, page: Page): Pane | undefined {
  const ga = page.ga!;
  const panes = sheetPanes(project, page);
  if (panes.length < 2) return undefined;
  if (ga.pane) return panes.find((p) => p.col === ga.pane![0] && p.row === ga.pane![1]);
  if (ga.leaf !== undefined) {
    const col = panes.filter((p) => p.col === ga.leaf);
    return col.length === 1 ? col[0] : undefined;
  }
  return undefined;
}

/** A door's printed name: its own, or by column and row (*C2 R1*). */
export const paneName = (p: Pick<Pane, "col" | "row" | "name">) => p.name || `C${p.col + 1} R${p.row + 1}`;

/** The door (from the front) an item on a door front belongs to: the one its centre is on. */
export function paneOf(owner: Page, it: Pick<GaItem, "x" | "y" | "w" | "h">): Pane | undefined {
  const cx = it.x + it.w / 2;
  const cy = it.y + it.h / 2;
  return doorPanes(owner).find((p) => cx >= p.x - 0.01 && cx <= p.x + p.w + 0.01 && cy >= p.y - 0.01 && cy <= p.y + p.h + 0.01);
}

/** The doors an item on a door front lies across (more than one: it's across a joint). */
export function panesUnder(owner: Page, it: Pick<GaItem, "x" | "y" | "w" | "h">): Pane[] {
  const e = 0.5;
  return doorPanes(owner).filter((p) => it.x < p.x + p.w - e && it.x + it.w > p.x + e && it.y < p.y + p.h - e && it.y + it.h > p.y + e);
}

// ---------------------------------------------------------------------------
// A backplate behind each door (v0.4.x M13)

/** The margin a plate made for a door starts with, all round, mm. */
export const PLATE_MARGIN = 25;

/** The door a backplate sheet is behind: its door-front sheet and the door, if both are still there. */
export function plateDoor(project: Project, page: Page): { front: Page; pane: Pane } | null {
  const b = page.ga?.behind;
  if (!b?.pane) return null;
  const front = project.pages.find((p) => p.id === b.sheet);
  if (front?.ga?.view !== "door-front" || front.ga.of) return null;
  const pane = doorPanes(front).find((p) => p.col === b.pane![0] && p.row === b.pane![1]);
  return pane ? { front, pane } : null;
}

/** The backplate sheets behind a door front's doors, by door (`col:row`). */
export function platesOf(project: Project, front: Page): Map<string, Page> {
  const out = new Map<string, Page>();
  for (const p of project.pages) {
    const b = p.ga?.view === "backplate" ? p.ga.behind : undefined;
    if (b?.sheet === front.id && b.pane) out.set(`${b.pane[0]}:${b.pane[1]}`, p);
  }
  return out;
}

/** What the sheet shows: all of it, one leaf of a door, or one door of a modular door. */
export function gaFrame(project: Project, page: Page): GaFrame {
  const ga = page.ga!;
  const size = gaSize(project, page);
  if (isDoorView(ga.view) && (ga.pane || ga.columns?.length || doorOwner(project, page)?.ga?.columns?.length)) {
    const p = shownPane(project, page);
    if (p) return { scale: ga.scale, x0: p.x, ...(p.y ? { y0: p.y } : {}), w: p.w, h: p.h };
    return { scale: ga.scale, x0: 0, w: size.w, h: size.h };
  }
  const leaf = ga.leaf !== undefined ? sheetLeaves(project, page).find((l) => l.index === ga.leaf) : undefined;
  return leaf && sheetLeaves(project, page).length > 1 ? { scale: ga.scale, x0: leaf.x, w: leaf.w, h: size.h } : { scale: ga.scale, x0: 0, w: size.w, h: size.h };
}

/** Which kinds of GA item go on a view. */
export function viewTakes(view: GaView, kind: GaItem["kind"]): boolean {
  // A detail sheet holds frames, and nothing else; a detail rectangle goes on any other GA sheet (design-v0.3 §6).
  if (view === "detail") return kind === "frame" || kind === "dim";
  if (kind === "frame") return false;
  if (kind === "detail") return true;
  if (kind === "dim") return true;
  if (kind === "label") return view === "door-front";
  if (kind === "rail" || kind === "trunking") return view !== "door-front";
  return true;
}

/** What can be laid out on this sheet: a view of another sheet's door front takes dimensions only (its devices are on that sheet). */
export function sheetTakes(project: Project, page: Page, kind: GaItem["kind"]): boolean {
  if (!page.ga) return false;
  if (page.ga.view === "door-front" && doorOwner(project, page) !== page) return kind === "dim" || kind === "detail";
  return viewTakes(page.ga.view, kind);
}

export interface DrawnGaItem {
  it: GaItem;
  /** On this sheet (editable), rather than the door's front drawn here (from its own sheet). */
  own: boolean;
  /** Seen from inside the door: drawn as what's behind it. */
  back: boolean;
}

/**
 * Everything drawn on a GA sheet, in the sheet's own mm: its items, and on a
 * door view of another sheet's door the devices and label plates laid out
 * there (mirrored on the door back). Only what falls in the sheet's frame.
 */
export function drawnGaItems(project: Project, page: Page): DrawnGaItem[] {
  const out: DrawnGaItem[] = [];
  const frame = gaFrame(project, page);
  const y0 = frame.y0 ?? 0;
  const inFrame = (it: GaItem) =>
    it.kind === "dim" ||
    page.ga!.view === "detail" ||
    (it.x + it.w / 2 >= frame.x0 - 0.01 && it.x + it.w / 2 <= frame.x0 + frame.w + 0.01 && it.y + it.h / 2 >= y0 - 0.01 && it.y + it.h / 2 <= y0 + frame.h + 0.01);
  const owner = doorOwner(project, page);
  if (owner && owner !== page) {
    const back = page.ga!.view === "door-back";
    const W = owner.ga!.enclosure.w;
    for (const it of owner.gaItems ?? []) {
      if (it.kind !== "device" && it.kind !== "label") continue;
      const m = back ? { ...it, x: W - it.x - it.w } : it;
      if (inFrame(m)) out.push({ it: m, own: false, back });
    }
  }
  for (const it of page.gaItems ?? []) if (inFrame(it)) out.push({ it, own: true, back: false });
  return out;
}

/**
 * The largest drawing of an enclosure that fits the sheet beside its
 * dimensions: any scale (1:7.5, 1:12…), to the next half step, so the layout
 * uses the page well. The usual scales stay as quick picks.
 */
/** Standard drawing scales a fitted sheet chooses from (v0.4.x T10). */
export const STANDARD_SCALES = [1, 2, 2.5, 5, 10, 20, 25, 50];

/** The smallest standard scale (1:1, 1:2, 1:2.5, 1:5, 1:10…) at which an enclosure fits the sheet. A sheet already made keeps its scale. */
export function fitScale(w: number, h: number): number {
  // Room to the right and below for the dimensions.
  const room = { w: (AREA_UNITS.w - GA_ORIGIN[0]) * UNIT_MM - 20, h: (AREA_UNITS.h - GA_ORIGIN[1]) * UNIT_MM - 18 };
  const need = Math.max(w / room.w, h / room.h);
  return STANDARD_SCALES.find((s) => s >= need - 1e-9) ?? Math.ceil(need / 50) * 50;
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
  handle: { w: 65, h: 65, label: "Door handle (isolator worked through the door)" },
  ctrlPsu: { w: 36, h: 90, label: "Controller power supply" },
  ctrlHost: { w: 90, h: 100, label: "Controller host" },
  ctrlIo: { w: 9, h: 100, label: "Controller IO module, per 2 channels", perPole: true },
  panelPlant: { w: 50, h: 90, label: "Panel device (power supply, UPS, battery)" },
  connBlock: { w: 6, h: 45, label: "Connector block, per 2 terminals", perPole: true },
  plugSocket: { w: 20, h: 40, label: "Connector (plug and socket)" },
};

/** A controller module's size on the GA: its device from the table, else a generic one by type and channels. */
export function moduleGaSize(project: Project, item: PlantItem): { w: number; h: number } {
  const m = item.module;
  const dev = m?.device ? project.devices?.find((d) => d.id === m.device) : undefined;
  if (dev) return { w: dev.w, h: dev.h };
  const sizes = gaSizes(project);
  // Plant in the panel (v0.4.x T3): one size for all, until a device is picked.
  if (!m) return { w: sizes.panelPlant!.w, h: sizes.panelPlant!.h };
  if (m?.type === "psu") return { w: sizes.ctrlPsu!.w, h: sizes.ctrlPsu!.h };
  if (!m || m.type === "host") return { w: sizes.ctrlHost!.w, h: sizes.ctrlHost!.h };
  const io = sizes.ctrlIo!;
  return { w: Math.round(io.w * Math.ceil(Math.max(4, m.channels ?? 8) / 2) * 10) / 10, h: io.h };
}

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
      return { key: el.params.function === "breaker" || el.params.function === "rcd" ? "mcb" : "isolator", poles: poles + (Number(el.params.aux) || 0) * 0.5 };
    case "fuse":
      return { key: "fuse", poles };
    case "terminal":
      return { key: "terminal", poles: 1 };
    case "transformer":
      return { key: "transformer", poles: 1 };
    case "socket":
      return { key: "socket", poles: 1 };
    case "plug-socket":
      return { key: "plugSocket", poles: 1 };
    case "connector-block":
      // Its length follows its terminal count (v0.4.x M9).
      return { key: "connBlock", poles: Math.ceil((Number(el.params.terminals) || 2) / 2) };
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
  { key: "connBlock", label: "Connector block" },
  { key: "plugSocket", label: "Connector (plug and socket)" },
  { key: "block", label: "Busbar (distribution block)" },
  { key: "lamp", label: "Indicator lamp" },
  { key: "pushbutton", label: "Push button" },
  { key: "selector", label: "Selector / keyswitch" },
  { key: "module", label: "Controller module" },
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

/** An isolator worked through the door has its handle on the door as well as its body on the backplate. */
export const hasDoorHandle = (el: Element) => el.symbol === "isolator" && el.params.operator === "door" && el.zone !== "external";

/** How a placed element is known: its id, or id#handle for its door handle. */
export const placeKey = (ref: string, part?: string) => (part ? `${ref}#${part}` : ref);

/** Every element (and door handle) already on some GA sheet. */
export function placedOnGa(project: Project): Set<string> {
  const out = new Set<string>();
  for (const pg of project.pages)
    for (const it of pg.gaItems ?? []) {
      for (const r of it.refs ?? []) out.add(placeKey(r, it.part));
      if (it.module) out.add(it.module);
    }
  return out;
}

export interface GaCandidate {
  /** One element, or a whole terminal strip on a sheet. */
  refs: string[];
  /** A controller: its modules still to place, in rail order, each with its size. */
  modules?: { id: string; w: number; h: number; device?: string }[];
  /** Its door handle rather than its body. */
  part?: "handle";
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
    // Left to right across the sheet, so a strip's terminals are in the order they're built in (v0.3 §2).
    const across = [...pg.elements].sort((a, b) => a.pos[0] - b.pos[0] || a.pos[1] - b.pos[1]);
    for (const el of across) {
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
    for (const el of pg.elements) {
      if (!hasDoorHandle(el) || placed.has(placeKey(el.id, "handle"))) continue;
      const s = gaSizes(project).handle!;
      out.push({ refs: [el.id], part: "handle", label: `${tagOf(el) || "Isolator"} handle`, sheet: pg.number, door: true, w: s.w, h: s.h });
    }
  }
  for (const [strip, s] of strips) {
    const { w, h } = stripSize(project, s.refs);
    out.push({ refs: s.refs, label: `${strip} (${s.refs.length} terminals)`, sheet: s.sheet, door: false, w, h });
  }
  // Plant in the panel (v0.4.x T3), once drawn: one item each, like any panel part.
  for (const it of project.plant) {
    if (!it.inPanel || it.module || placed.has(it.id)) continue;
    const views = viewsOf(project, it.id);
    if (!views.length) continue;
    const size = moduleGaSize(project, it);
    // Placed as a controller's module is: a GA item naming the plant item (its `module`).
    out.push({ refs: [], modules: [{ id: it.id, ...size }], label: `${it.tag || `${it.prefix || "U"}?`} ${it.description}`.trim(), sheet: views[0]!.page.number, door: false, ...size });
  }
  // A controller is one item: its modules side by side on a rail, in rail order (controller.md §8).
  for (const c of project.controllers ?? []) {
    const mods = modulesOf(project, c).filter((m) => !placed.has(m.id));
    if (!mods.length) continue;
    const sized = mods.map((m) => ({ id: m.id, ...moduleGaSize(project, m), ...(m.module.device ? { device: m.module.device } : {}) }));
    const sheet = Math.min(...mods.map((m) => viewsOf(project, m.id)[0]?.page.number ?? Infinity));
    out.push({
      refs: [],
      modules: sized,
      label: `${controllerName(project, c)} (${mods.length} module${mods.length === 1 ? "" : "s"})`,
      sheet: Number.isFinite(sheet) ? sheet : 0,
      door: false,
      w: Math.round(sized.reduce((a, m) => a + m.w, 0) * 10) / 10,
      h: Math.max(...sized.map((m) => m.h)),
    });
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
    // By sheet, then left to right along the boundary: always the order it's built in (v0.3 §2, 28).
    const refs = now;
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

// ---------------------------------------------------------------------------
// Dimensions (chain and baseline), attached to what they measure

export const ENCL = "@encl";

/** An item's start, middle and end along an axis. */
const along = (it: Pick<GaItem, "x" | "y" | "w" | "h">, axis: "h" | "v") => (axis === "h" ? { a: it.x, len: it.w } : { a: it.y, len: it.h });

/** Where a dimension point is along its axis now: on the item it's attached to, or where it was put. */
export function dimValue(p: GaDimPoint, axis: "h" | "v", items: Map<string, Pick<GaItem, "x" | "y" | "w" | "h">>, size: { w: number; h: number; x0?: number; y0?: number }): number {
  const k = p.edge === "mid" ? 0.5 : p.edge === "end" ? 1 : 0;
  if (p.item === ENCL) return axis === "h" ? (size.x0 ?? 0) + size.w * k : (size.y0 ?? 0) + size.h * k;
  const it = p.item ? items.get(p.item) : undefined;
  if (!it) return p.v;
  const { a, len } = along(it, axis);
  return a + len * k;
}

export interface DimTarget {
  v: number;
  item: string;
  edge: "start" | "mid" | "end";
  /** Its extent across the axis, so the extension line can stop short of it. */
  cross: [number, number];
}

/** A door of a modular door as a dimension's target: `@pane:col:row` (v0.4.x M13). */
export const paneRef = (p: Pick<Pane, "col" | "row">) => `@pane:${p.col}:${p.row}`;

/**
 * What a sheet's dimensions measure from as "the enclosure": the part it
 * shows (a leaf, or one door of a modular door, by its own edges) or all of
 * it; and, on a door view, each door's own rectangle by `paneRef`.
 */
export function dimFrame(project: Project, page: Page): { size: { w: number; h: number; x0: number; y0: number }; panes: { id: string; x: number; y: number; w: number; h: number }[] } {
  const f = gaFrame(project, page);
  const panes = sheetPanes(project, page);
  return {
    size: { w: f.w, h: f.h, x0: f.x0, y0: f.y0 ?? 0 },
    panes: panes.length > 1 ? panes.map((p) => ({ id: paneRef(p), x: p.x, y: p.y, w: p.w, h: p.h })) : [],
  };
}

/** What a dimension can snap to along an axis: the enclosure's edges (or the part shown), each door's, each item's edges and middle. */
export function dimTargets(
  drawn: DrawnGaItem[],
  size: { w: number; h: number; x0?: number; y0?: number },
  axis: "h" | "v",
  panes: { id: string; x: number; y: number; w: number; h: number }[] = [],
): DimTarget[] {
  const out: DimTarget[] = [];
  const [x0, y0] = [size.x0 ?? 0, size.y0 ?? 0];
  const crossAll: [number, number] = axis === "h" ? [y0, y0 + size.h] : [x0, x0 + size.w];
  const start = axis === "h" ? x0 : y0;
  const full = axis === "h" ? size.w : size.h;
  out.push(
    { v: start, item: ENCL, edge: "start", cross: crossAll },
    { v: start + full / 2, item: ENCL, edge: "mid", cross: crossAll },
    { v: start + full, item: ENCL, edge: "end", cross: crossAll },
  );
  for (const p of panes) {
    const { a, len } = along(p, axis);
    const cross: [number, number] = axis === "h" ? [p.y, p.y + p.h] : [p.x, p.x + p.w];
    out.push({ v: a, item: p.id, edge: "start", cross }, { v: a + len, item: p.id, edge: "end", cross });
  }
  for (const { it } of drawn) {
    if (it.kind === "dim" || it.kind === "detail") continue;
    const { a, len } = along(it, axis);
    const c = axis === "h" ? [it.y, it.y + it.h] : [it.x, it.x + it.w];
    const cross = c as [number, number];
    out.push({ v: a, item: it.id, edge: "start", cross }, { v: a + len / 2, item: it.id, edge: "mid", cross }, { v: a + len, item: it.id, edge: "end", cross });
  }
  return out;
}

/** The nearest snap target to a point, within reach (mm), on either axis's terms. */
export function nearestDimTarget(targets: DimTarget[], v: number, across: number, reach: number): DimTarget | null {
  let best: { t: DimTarget; d: number } | null = null;
  for (const t of targets) {
    const d = Math.abs(t.v - v);
    // Prefer what's near the pointer across the axis too (the item under it).
    const off = across < t.cross[0] ? t.cross[0] - across : across > t.cross[1] ? across - t.cross[1] : 0;
    const score = d + off * 0.05;
    if (d <= reach && (!best || score < best.d)) best = { t, d: score };
  }
  return best?.t ?? null;
}

/** How a number of mm is written on a dimension: whole mm, or to 0.5 mm. */
export const dimText = (mm: number) => {
  const r = Math.round(Math.abs(mm) * 2) / 2;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
};

/** Baseline dimension lines are stacked this far apart (sheet units), away from the panel. */
export const DIM_STEP_UNITS = 4;

// ---------------------------------------------------------------------------
// Rail fill (Check, and the rail's properties)

export interface RailFill {
  rail: GaItem;
  /** Rail length, mm. */
  length: number;
  /** Taken by devices on it, mm (clipped to the rail). */
  used: number;
  /** Devices on it, along it. */
  devices: GaItem[];
  /** Devices on it that overlap each other. */
  overlaps: [GaItem, GaItem][];
  /** Devices that run off its ends. */
  overhang: GaItem[];
}

/** How full each DIN rail on a sheet is: the devices sitting across its line, in mm and as a share of it. */
export function railFill(page: Page): RailFill[] {
  const items = page.gaItems ?? [];
  const out: RailFill[] = [];
  for (const rail of items) {
    if (rail.kind !== "rail") continue;
    const horiz = rail.w >= rail.h;
    const line = horiz ? rail.y + rail.h / 2 : rail.x + rail.w / 2;
    const r0 = horiz ? rail.x : rail.y;
    const r1 = r0 + (horiz ? rail.w : rail.h);
    const on = items
      .filter((d) => d.kind === "device")
      .filter((d) => {
        const c0 = horiz ? d.y : d.x;
        const c1 = c0 + (horiz ? d.h : d.w);
        const a0 = horiz ? d.x : d.y;
        const a1 = a0 + (horiz ? d.w : d.h);
        return c0 < line && c1 > line && a1 > r0 && a0 < r1;
      })
      .sort((a, b) => (horiz ? a.x - b.x : a.y - b.y));
    const span = (d: GaItem): [number, number] => (horiz ? [d.x, d.x + d.w] : [d.y, d.y + d.h]);
    let used = 0;
    const overlaps: [GaItem, GaItem][] = [];
    const overhang: GaItem[] = [];
    on.forEach((d, i) => {
      const [a, b] = span(d);
      used += Math.max(0, Math.min(b, r1) - Math.max(a, r0));
      if (a < r0 - 0.01 || b > r1 + 0.01) overhang.push(d);
      for (const e of on.slice(i + 1)) {
        const [c, f] = span(e);
        if (Math.min(b, f) - Math.max(a, c) > 0.5) overlaps.push([d, e]);
      }
    });
    out.push({ rail, length: r1 - r0, used: Math.round(used * 10) / 10, devices: on, overlaps, overhang });
  }
  return out;
}

/** Rails on a sheet are numbered top to bottom, then left to right, for Check and the bill of materials. */
export function railNumber(page: Page, rail: GaItem): number {
  const rails = (page.gaItems ?? []).filter((r) => r.kind === "rail").sort((a, b) => a.y - b.y || a.x - b.x);
  return rails.findIndex((r) => r.id === rail.id) + 1;
}

export interface DimLayout {
  /** Lines in sheet units: dimension lines, extension lines and ticks. */
  lines: [number, number, number, number][];
  texts: { at: Vec; text: string; vertical: boolean }[];
  /** Its extent on the sheet, for picking. */
  box: { x: number; y: number; w: number; h: number };
}

/**
 * How a dimension is drawn on its sheet: each gap (chain) or each distance
 * from the first point (baseline, stacked away from the panel), with
 * extension lines back to what's measured and oblique ticks at the ends.
 */
export function dimLayout(project: Project, page: Page, it: GaItem, drawn = drawnGaItems(project, page)): DimLayout {
  const d = it.dim!;
  const frame = gaFrame(project, page);
  const { size, panes } = dimFrame(project, page);
  const items = new Map<string, Pick<GaItem, "x" | "y" | "w" | "h">>([...drawn.map((x) => [x.it.id, x.it] as const), ...panes.map((p) => [p.id, p] as const)]);
  const vals = d.points.map((p) => dimValue(p, d.axis, items, size));
  const crossOf = (i: number): [number, number] | null => {
    const p = d.points[i]!;
    if (p.item === ENCL) return d.axis === "h" ? [size.y0, size.y0 + size.h] : [size.x0, size.x0 + size.w];
    const t = p.item ? items.get(p.item) : undefined;
    if (!t) return null;
    return d.axis === "h" ? [t.y, t.y + t.h] : [t.x, t.x + t.w];
  };
  const S = (mm: Vec): Vec => gaToSheet(frame, mm);
  const stepMm = DIM_STEP_UNITS * UNIT_MM * frame.scale;
  const mid = d.axis === "h" ? size.y0 + size.h / 2 : size.x0 + size.w / 2;
  const away = d.at < mid ? -1 : 1;
  const lineAt = (k: number) => (d.style === "baseline" ? d.at + away * k * stepMm : d.at);
  const lines: DimLayout["lines"] = [];
  const texts: DimLayout["texts"] = [];
  // A point on the axis and across it, to sheet units.
  const P = (v: number, c: number): Vec => (d.axis === "h" ? S([v, c]) : S([c, v]));
  const tick = 0.5;
  const pairs = d.style === "baseline" ? vals.slice(1).map((v, i) => [0, i + 1, i] as const) : vals.slice(1).map((_, i) => [i, i + 1, 0] as const);
  const gap = 0.5;
  // Extension lines: from just short of what's measured to just past the farthest line.
  const farthest = lineAt(d.style === "baseline" ? Math.max(0, vals.length - 2) : 0);
  vals.forEach((v, i) => {
    const c = crossOf(i);
    const tip = P(v, farthest);
    const beyond = away * 0.8;
    let from: Vec;
    if (c && (d.at < c[0] || d.at > c[1])) {
      const near = d.at < c[0] ? c[0] : c[1];
      from = P(v, near);
      // Leave a small gap at the feature.
      const s = d.at < c[0] ? -1 : 1;
      from = d.axis === "h" ? [from[0], from[1] + s * gap] : [from[0] + s * gap, from[1]];
    } else from = d.axis === "h" ? [tip[0], tip[1] - beyond * 2] : [tip[0] - beyond * 2, tip[1]];
    const to: Vec = d.axis === "h" ? [tip[0], tip[1] + beyond] : [tip[0] + beyond, tip[1]];
    lines.push([from[0], from[1], to[0], to[1]]);
  });
  for (const [a, b, k] of pairs) {
    const at = lineAt(k);
    const p = P(vals[a]!, at);
    const q = P(vals[b]!, at);
    lines.push([p[0], p[1], q[0], q[1]]);
    for (const e of [p, q]) lines.push([e[0] - tick, e[1] + tick, e[0] + tick, e[1] - tick]);
    const text = dimText(vals[b]! - vals[a]!);
    const m: Vec = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    // Above a horizontal line; left of a vertical one, reading up.
    texts.push(d.axis === "h" ? { at: [m[0], m[1] - 0.45], text, vertical: false } : { at: [m[0] - 0.45, m[1]], text, vertical: true });
  }
  const xs = lines.flatMap((l) => [l[0], l[2]]);
  const ys = lines.flatMap((l) => [l[1], l[3]]);
  const pad = 1.6;
  const box = {
    x: Math.min(...xs) - (d.axis === "v" ? pad : 0),
    y: Math.min(...ys) - (d.axis === "h" ? pad : 0),
    w: Math.max(...xs) - Math.min(...xs) + (d.axis === "v" ? pad : 0),
    h: Math.max(...ys) - Math.min(...ys) + (d.axis === "h" ? pad : 0),
  };
  return { lines, texts, box };
}

/** A cut-out as written: round ("22.3", "Ø22.3") or rectangular ("92 x 92"), mm. */
export function parseCutout(s: string | undefined): { d: number } | { w: number; h: number } | null {
  if (!s) return null;
  const nums = s.replace(/,/g, ".").match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
  if (nums.length >= 2 && /[x×*]/i.test(s)) return { w: nums[0]!, h: nums[1]! };
  if (nums.length >= 1) return { d: nums[0]! };
  return null;
}

/** A cut-out as it's printed on the door back: Ø22.3, 92 × 92. */
export function cutoutText(s: string | undefined): string {
  const c = parseCutout(s);
  if (!c) return "";
  // Cut-outs are given to a tenth of a millimetre (22.3), not rounded like dimensions.
  const t = (n: number) => String(Math.round(n * 10) / 10);
  return "d" in c ? `Ø${t(c.d)}` : `${t(c.w)} × ${t(c.h)}`;
}

// ---------------------------------------------------------------------------
// Detail sheets (design-v0.3 §6)

/** The scales a frame can be: paper mm per real mm (2:1, 1:1, 1:2, 1:5). */
export const DETAIL_ZOOMS = [2, 1, 0.5, 0.2];

/** A frame's scale as it's written: 2:1, 1:1, 1:5. */
export const zoomText = (k: number) => (k >= 1 ? `${Number(k.toFixed(2))}:1` : `1:${Number((1 / k).toFixed(2))}`);

/** Room under a frame for its caption, paper mm. */
export const CAPTION_MM = 7;

/**
 * A detail sheet's usable space for frames, in its own mm (paper mm, with
 * the sheet's GA origin at 0): the drawing area inside the border, above
 * the title block.
 */
export function detailSpace(): { x: number; y: number; w: number; h: number } {
  const x = -GA_ORIGIN[0] * UNIT_MM;
  const y = -GA_ORIGIN[1] * UNIT_MM;
  return { x, y, w: AREA_UNITS.w * UNIT_MM, h: AREA_UNITS.h * UNIT_MM };
}

/** The largest frame scale that fits a detail of this size on a detail sheet; the smallest if none does. */
export function fitZoom(w: number, h: number): number {
  const s = detailSpace();
  return DETAIL_ZOOMS.find((k) => w * k <= s.w - 10 && h * k + CAPTION_MM <= s.h - 10) ?? DETAIL_ZOOMS[DETAIL_ZOOMS.length - 1]!;
}

/** Every detail rectangle in the project, with its sheet. */
export function allDetails(project: Project): { page: Page; it: GaItem }[] {
  return project.pages.flatMap((page) => (page.gaItems ?? []).filter((it) => it.kind === "detail").map((it) => ({ page, it })));
}

/** Every frame in the project, with its sheet. */
export function allFrames(project: Project): { page: Page; it: GaItem }[] {
  return project.pages.flatMap((page) => (page.gaItems ?? []).filter((it) => it.kind === "frame").map((it) => ({ page, it })));
}

/** The next free detail letter: A…Z, then AA, AB… */
export function nextDetailLetter(project: Project): string {
  const taken = new Set(allDetails(project).map((d) => d.it.letter));
  const name = (n: number): string => (n < 26 ? String.fromCharCode(65 + n) : name(Math.floor(n / 26) - 1) + String.fromCharCode(65 + (n % 26)));
  for (let n = 0; ; n++) if (!taken.has(name(n))) return name(n);
}

/** Where a detail is shown: its frame and that frame's sheet, if it's placed. */
export function frameOf(project: Project, detailId: string): { page: Page; it: GaItem } | null {
  return allFrames(project).find((f) => f.it.detail === detailId) ?? null;
}

/** The detail a frame shows, and its sheet. */
export function detailOf(project: Project, frame: GaItem): { page: Page; it: GaItem } | null {
  return allDetails(project).find((d) => d.it.id === frame.detail) ?? null;
}

/** A frame's caption: DETAIL A: SAFETY EXTRACT FAN, 1:1 (8), the bracket being the sheet the detail is drawn on. */
export function frameCaption(project: Project, frame: GaItem): string {
  const d = detailOf(project, frame);
  if (!d) return "DETAIL (deleted)";
  const title = d.it.text?.trim();
  return `DETAIL ${d.it.letter ?? "?"}${title ? `: ${title.toUpperCase()}` : ""}, ${zoomText(frame.zoom ?? 1)} (${d.page.number})`;
}

/** A detail rectangle's label on its own sheet: A (12), the bracket being where it's shown. */
export function detailLabel(project: Project, detail: GaItem): string {
  const f = frameOf(project, detail.id);
  return `${detail.letter ?? "?"}${f ? ` (${f.page.number})` : ""}`;
}

/** Frames keep the size of their detail at their scale. Returns whether anything changed. */
export function syncDetailFrames(project: Project): boolean {
  let changed = false;
  for (const { it } of allFrames(project)) {
    const d = detailOf(project, it);
    if (!d) continue;
    const k = it.zoom ?? 1;
    const w = Math.round(d.it.w * k * 2) / 2;
    const h = Math.round(d.it.h * k * 2) / 2;
    if (w !== it.w || h !== it.h) {
      it.w = w;
      it.h = h;
      changed = true;
    }
  }
  return changed;
}

/**
 * How a frame draws its detail's sheet (design-v0.3 §6): that sheet at the
 * frame's scale (`src`, a copy with its scale changed), and the shift, in
 * sheet units, that puts the detail's corner on the frame's. Also maps
 * points between the detail sheet's mm and the source sheet's.
 */
export interface FrameView {
  frame: GaItem;
  det: GaItem;
  /** The source sheet as it is in the project. */
  page: Page;
  /** The source sheet drawn at the frame's scale. */
  src: Page;
  k: number;
  /** Add to the zoomed source sheet's units to get the detail sheet's. */
  dx: number;
  dy: number;
}

export function frameView(project: Project, frame: GaItem): FrameView | null {
  const d = detailOf(project, frame);
  if (!d?.page.ga) return null;
  const k = frame.zoom ?? 1;
  const src: Page = { ...d.page, ga: { ...d.page.ga, scale: 1 / k } };
  const x0 = gaFrame(project, src).x0;
  const qx = GA_ORIGIN[0] + ((d.it.x - x0) * k) / UNIT_MM;
  const qy = GA_ORIGIN[1] + (d.it.y * k) / UNIT_MM;
  const fx = GA_ORIGIN[0] + frame.x / UNIT_MM;
  const fy = GA_ORIGIN[1] + frame.y / UNIT_MM;
  return { frame, det: d.it, page: d.page, src, k, dx: fx - qx, dy: fy - qy };
}

/** A point on a detail sheet (its mm) to the source sheet's mm, through a frame. */
export const toSourceMm = (v: FrameView, mm: Vec): Vec => [v.det.x + (mm[0] - v.frame.x) / v.k, v.det.y + (mm[1] - v.frame.y) / v.k];
/** A rectangle on the source sheet (mm) to the detail sheet's mm. */
export const toFrameMm = (v: FrameView, r: { x: number; y: number; w: number; h: number }) => ({
  x: v.frame.x + (r.x - v.det.x) * v.k,
  y: v.frame.y + (r.y - v.det.y) * v.k,
  w: r.w * v.k,
  h: r.h * v.k,
});
