/**
 * Symbol library (DESIGN.md §5). IEC 60617 shapes in our own plain style.
 *
 * Symbols are defined in code: each one turns an element into drawing
 * primitives and terminal positions, in grid units about the element's
 * origin. Terminals always sit on whole grid units so wires line up.
 *
 * Default orientation is vertical, current flowing top to bottom, as in a
 * ladder rung between the CCT and 0V rails.
 */
import { CAP_HEIGHT, textWidth, wrapText } from "./textwidth";
import { BUSBAR_COLOUR_OPTIONS } from "./wirecolours";
import { BLOCK_HALF } from "./blocks";
import { legendTable, notesLayout, revisionTable, type LegendEntry } from "./annotations";
import { networkDiagram, type NetworkData } from "./networkdraw";
import {
  type Dir,
  type Rect,
  type Rotation,
  type Vec,
  UNIT_MM,
  lineUnits,
  rotate,
  rotateDir,
  rotateRect,
  textUnits,
  unionRect,
} from "./geometry";
import type { Element, ParamValue } from "./model";
import type { SymbolKind } from "./designations";

// ---------------------------------------------------------------------------
// Primitives

export type Anchor = "start" | "middle" | "end";

export type Prim =
  | { t: "line"; pts: Vec[]; w?: number; dash?: boolean }
  | { t: "poly"; pts: Vec[]; fill: boolean; /** A translucent marker colour instead of black (highlights). */ tint?: string }
  | { t: "circle"; c: Vec; r: number; fill?: boolean; /** Paper-white inside, to sit over a line. */ bg?: boolean }
  | { t: "arc"; from: Vec; to: Vec; r: number; sweep: 0 | 1 }
  | { t: "ellipse"; c: Vec; rx: number; ry: number; dash?: boolean }
  | {
      t: "text";
      at: Vec;
      text: string;
      size: number;
      anchor: Anchor;
      role: TextRole;
      vertical?: boolean;
      /** Drawn with an outline as well as fill, which reads as bold in the one-weight font. */
      bold?: boolean;
      /** Part of the element's label block, moved with it (v0.4.x T14). Tags and labels always are. */
      block?: boolean;
      /** Slanted (Markdown italic). */
      italic?: boolean;
      /** Already placed for the element's rotation: left exactly where the symbol put it. */
      placed?: boolean;
      /** A label on several lines grows upwards from here (it sits above something). */
      up?: boolean;
    };

export type TextRole = "tag" | "label" | "term" | "note" | "xref";

export interface TerminalDef {
  name: string;
  at: Vec;
  dir: Dir;
}

export interface Geometry {
  prims: Prim[];
  terminals: TerminalDef[];
  /** Solid part of the symbol: wires are routed around it. */
  body: Rect;
  /** Everything drawn, for selection. */
  bbox: Rect;
}

export interface ParamDef {
  key: string;
  label: string;
  type: "select" | "number" | "text" | "bool";
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  default: ParamValue;
  /** Only applies when this returns true (otherwise shown greyed out). */
  when?: (el: Element) => boolean;
  /** What it reads as when it doesn't apply. */
  fixed?: string;
  /** An example of the format to follow, shown greyed in an empty box. */
  placeholder?: string;
  /** What it takes, shown on a "?" beside the box. */
  help?: string;
  /** Kept on the element but not shown for editing. */
  hidden?: boolean;
}

/** What a load takes (v0.4.x M11): typed, "24 V DC" or "24 V AC, 24 V DC"; empty is not stated. */
const ACCEPTS_PARAM: ParamDef = {
  key: "accepts",
  label: "Takes (supply)",
  type: "text",
  default: "",
  placeholder: "e.g. 24 V DC",
  help: "What supply it takes: 24 V AC, 24 V DC, 230 V AC, 400 V AC, 12 V DC, or any other typed the same way. Two, comma between, for a part that takes either (24 V AC, 24 V DC). Check warns when it's fed from a supply that gives something else.",
};
/** What a supply gives (v0.4.x M11). */
const GIVES_PARAM: ParamDef = {
  key: "gives",
  label: "Gives (supply)",
  type: "text",
  default: "",
  placeholder: "e.g. 230 V AC",
  help: "What it supplies: 24 V AC, 24 V DC, 230 V AC, 400 V AC, 12 V DC, or any other typed the same way. Check compares it with what the loads it feeds take.",
};

export interface SymbolDef {
  id: string;
  name: string;
  /** Palette group. */
  group: "Contacts" | "Operators" | "Coils" | "Protection" | "Loads" | "Connection" | "Drawing" | "Tables";
  /** Shown in the palette. Junctions are created by wiring, not placed. */
  palette: boolean;
  params: ParamDef[];
  /** Designation kind, for the tag prefix. Null: not tagged. */
  kind(el: Element): SymbolKind | null;
  /** Terminal groups that are the same potential (e.g. both sides of a terminal). */
  bridged?(el: Element): string[][];
  /**
   * The workbench it belongs to. Drafting (the default) is the electrical
   * drawing; annotations (text, boxes, label plates, pictures) are added and
   * edited in the Annotate workbench.
   */
  bench?: "draft" | "annotate";
  /** `t` carries what the project says about it, where a symbol needs it (tables, notes with fields). */
  draw(el: Element, t?: GeometryText): { prims: Prim[]; terminals: TerminalDef[]; body: Rect };
}

// ---------------------------------------------------------------------------
// Drawing helpers

// Sizes come from the named styles in geometry.ts (millimetres on paper).
const W = lineUnits("thin");
/** Distribution blocks (thick) and control rails (a touch heavier than a wire). */
const BAR_W = lineUnits("thick");
const CONTROL_W = 0.35 / UNIT_MM;
/** Part tags, labels and names. */
const TAG = textUnits("tag");
/** Terminal numbers, ratings, functions, colours, cross-references. */
const DETAIL = textUnits("detail");
/** Text styles a user can pick for drawing text. */
const TEXT_SIZES: Record<string, number> = {
  detail: textUnits("detail"),
  note: textUnits("note"),
  heading: textUnits("heading"),
  title: textUnits("title"),
};
const TEXT_SIZE_OPTIONS = [
  { value: "detail", label: "Detail (1.8 mm)" },
  { value: "note", label: "Note (2.5 mm)" },
  { value: "heading", label: "Heading (3.5 mm)" },
  { value: "title", label: "Title (5 mm)" },
];

const line = (...pts: Vec[]): Prim => ({ t: "line", pts });
const dashed = (...pts: Vec[]): Prim => ({ t: "line", pts, dash: true });
const heavy = (w: number, ...pts: Vec[]): Prim => ({ t: "line", pts, w });
/** Room an earth terminal's cell keeps at the top for its earth sign. */
/** Half a terminal block cell's width: a column, so each terminal has its own (v0.3 §2). */
export const CELL_HALF_W = 1;
/**
 * The earth sign (three bars, widest first) hanging down from `at`; `w` is
 * the widest bar.
 */
function earthSign(at: Vec, w: number): Prim[] {
  const [x, y] = at;
  const stem = 0.3;
  const bars = [w, w * 0.62, w * 0.25];
  return [line([x, y], [x, y + stem]), ...bars.map((b, i) => line([x - b / 2, y + stem + i * 0.25], [x + b / 2, y + stem + i * 0.25]))];
}
/** A prim moved by (dx, dy). Lines and polys only. */
function shift(p: Prim, dx: number, dy: number): Prim {
  if (p.t === "line" || p.t === "poly") return { ...p, pts: p.pts.map(([x, y]) => [x + dx, y + dy] as Vec) };
  return p;
}
const rect = (x: number, y: number, w: number, h: number, fill = false): Prim => ({
  t: "poly",
  pts: [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ],
  fill,
});
const circle = (x: number, y: number, r: number, fill = false): Prim => ({ t: "circle", c: [x, y], r, fill });
const text = (x: number, y: number, s: string, size: number, anchor: Anchor, role: TextRole): Prim => ({
  t: "text",
  at: [x, y],
  text: s,
  size,
  anchor,
  role,
});
const term = (x: number, y: number, s: string, anchor: Anchor = "start"): Prim =>
  text(x, y, s, DETAIL, anchor, "term");

function str(el: Element, key: string, fallback: string): string {
  const v = el.params[key];
  return typeof v === "string" ? v : fallback;
}
function num(el: Element, key: string, fallback: number, min = -Infinity, max = Infinity): number {
  const v = el.params[key];
  const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.min(max, Math.max(min, n));
}
function bool(el: Element, key: string, fallback: boolean): boolean {
  const v = el.params[key];
  return typeof v === "boolean" ? v : fallback;
}

/**
 * Tag on the left of a vertical symbol, its cross-reference under it, and
 * the label under that. An empty cross-reference closes up.
 */
function tagAndLabel(x: number, el: Element): Prim[] {
  const out: Prim[] = [text(x, 0.5, "{tag}", TAG, "end", "tag"), { ...text(x, 1.75, "{xref}", DETAIL, "end", "xref"), block: true } as Prim];
  if (el.label) out.push(text(x, 3.0, "{label}", TAG, "end", "label"));
  return out;
}

/** Contact terminal markings from the pole number set by renumbering: 1 → 13/14, 2 → 23/24… */
function poleMarks(el: Element, base: [string, string]): [string, string] {
  const pole = num(el, "pole", 0, 0, 9);
  if (!pole) return base;
  return [`${pole}${base[0].slice(-1)}`, `${pole}${base[1].slice(-1)}`];
}

/** A block cell's number: 1.05 units (≈1.5 mm, clear of the cell walls), smaller only if it won't fit up the cell. */

const vterms = (a: string, b: string, half = 3): TerminalDef[] => [
  { name: a, at: [0, -half], dir: "up" },
  { name: b, at: [0, half], dir: "down" },
];

// Contact shapes, vertical, terminals at y = ±3. The blade pivots at the
// bottom fixed contact (0, 1.5).

// `op`: drawn operated (simulating): a NO closed, an NC open.
function noContact(dx = 0, op = false): Prim[] {
  return [line([dx, -3], [dx, -1.5]), line([dx, 1.5], [dx, 3]), op ? line([dx, 1.5], [dx - 0.25, -1.5]) : line([dx, 1.5], [dx - 1.2, -1.6])];
}
function ncContact(dx = 0, op = false): Prim[] {
  return [
    line([dx, -3], [dx, -1.5], [dx + 1.1, -1.5]),
    line([dx, 1.5], [dx, 3]),
    op ? line([dx, 1.5], [dx - 1.0, -1.5]) : line([dx, 1.5], [dx + 1.3, -1.8]),
  ];
}
/** Is this element drawn operated? Set only while simulating. */
const opOf = (el: Element) => el.params.__op === true;
/** Blade midpoint, where operators and timing marks attach. */
const NO_MID: Vec = [-0.6, 0];
const NC_MID: Vec = [0.65, -0.15];

/**
 * Terminal names are fixed (wires refer to them); the printed marks follow
 * the pole number. `names`: the terminal names when the marks differ (a
 * timed contact prints 17/18 on terminals 13/14).
 */
function contactTerms(labels: [string, string], el?: Element, names: [string, string] = labels): { prims: Prim[]; terminals: TerminalDef[] } {
  const marks = el ? poleMarks(el, labels) : labels;
  return {
    prims: [term(0.45, -2.2, marks[0]), term(0.45, 2.9, marks[1])],
    terminals: vterms(names[0], names[1]),
  };
}

/**
 * The delay mark on a contact timed by its coil (IEC 60617): a double stem
 * from the blade to an arc. On-delay and off-delay arcs face opposite ways;
 * on- and off-delay has both.
 */
function timingMark(mid: Vec, ax: number, fn: string): Prim[] {
  const on = fn !== "off";
  const both = fn === "on-off";
  const end = both ? ax - 0.9 : ax;
  const arc = (x: number, sweep: 0 | 1): Prim => ({ t: "arc", from: [x, -0.6], to: [x, 0.6], r: 0.6, sweep });
  return [
    line([mid[0], mid[1] - 0.15], [end, -0.15]),
    line([mid[0], mid[1] + 0.15], [end, 0.15]),
    arc(ax, on ? 0 : 1),
    ...(both ? [arc(ax - 0.9, 1)] : []),
  ];
}

/**
 * A selector pole: which positions close it. NO poles are open in 0, NC
 * poles closed in 0; a changeover (11 common) makes 11–12 in one position
 * and 11–14 in another (0 and I on a 2 position switch, I and II on a 3).
 */
const SELECTOR_POLE_OPTIONS = [
  { value: "I", label: "NO, closed in I" },
  { value: "II", label: "NO, closed in II (3 position)" },
  { value: "I+II", label: "NO, closed in I and II (3 position)" },
  { value: "nc-I", label: "NC, opened in I" },
  { value: "nc-II", label: "NC, opened in II (3 position)" },
  { value: "co", label: "Changeover (2 position: 12 in 0, 14 in I; 3 position: 2–3 in I, open in 0, 2–1 in II)" },
];

/**
 * A changeover pole's terminals (v0.2.1 note 23). On a 2-position switch,
 * k1 common, k2 made in 0, k4 in I. On a 3-position switch, numbered as
 * makers do: a common in the middle and a contact either side, pole 1 being
 * 3, 2, 1 (common 2) and pole 2 being 7, 6, 5: closed to the I side in I,
 * open in 0, to the II side in II.
 */
export function changeoverTerms(k: number, three: boolean): { com: string; first: string; second: string } {
  if (!three) return { com: `${k}1`, first: `${k}2`, second: `${k}4` };
  const b = 4 * (k - 1);
  return { com: String(b + 2), first: String(b + 3), second: String(b + 1) };
}

/** A selector's position names in the order they're drawn: I, 0, II on a 3-position switch; 0, I on a 2. */
export function selectorNames(el: Element): { pos: number; name: string }[] {
  const three = el.params.positions === "3";
  const nm = (i: number, d: string) => String(el.params[`pos${i}`] ?? "").trim() || d;
  return three
    ? [
        { pos: 1, name: nm(1, "I") },
        { pos: 0, name: nm(0, "0") },
        { pos: 2, name: nm(2, "II") },
      ]
    : [
        { pos: 0, name: nm(0, "0") },
        { pos: 1, name: nm(1, "I") },
      ];
}

export interface SelectorPole {
  kind: "no" | "nc" | "co";
  /** Positions (0, 1 = I, 2 = II) in which it's closed; for a changeover, those making 11–14. */
  closed: number[];
  /** A changeover's positions making 11–12. */
  closed12?: number[];
}

/** A selector's poles, as set up. */
export function selectorPoles(el: Element): SelectorPole[] {
  const three = el.params.positions === "3";
  const n = Math.max(1, Math.min(4, typeof el.params.poles === "number" ? el.params.poles : 1));
  const out: SelectorPole[] = [];
  for (let i = 1; i <= n; i++) {
    const v = String(el.params[`pole${i}`] ?? (i === 2 ? "II" : "I"));
    const usable = three || !v.includes("II") ? v : v === "nc-II" ? "nc-I" : "I";
    if (usable === "co") out.push(three ? { kind: "co", closed: [2], closed12: [1] } : { kind: "co", closed: [1], closed12: [0] });
    else if (usable === "nc-I") out.push({ kind: "nc", closed: three ? [0, 2] : [0] });
    else if (usable === "nc-II") out.push({ kind: "nc", closed: [0, 1] });
    else if (usable === "II") out.push({ kind: "no", closed: [2] });
    else if (usable === "I+II") out.push({ kind: "no", closed: [1, 2] });
    else out.push({ kind: "no", closed: [1] });
  }
  return out;
}

/** On a contact linked to a timer coil: switch with the coil itself, not after the delay. */
const instantParam: ParamDef = {
  key: "instant",
  label: "Instantaneous (not delayed by its timer)",
  type: "bool",
  default: false,
  when: (el) => el.links.length > 0,
  fixed: "Only for a contact linked to a timer",
};

/** A push button's poles, in order: true for NC. Files from before (`contact`: no, nc, both) are read the same way. */
export function pushPoles(el: Element): boolean[] {
  const n = Math.max(1, Math.min(4, typeof el.params.poles === "number" ? el.params.poles : 1));
  return Array.from({ length: n }, (_, i) => String(el.params[`pole${i + 1}`] ?? ((i + 1) % 2 ? "no" : "nc")) === "nc");
}

/** Push-button head on the left at x = hx. */
function pushHead(hx: number): Prim[] {
  return [line([hx - 0.4, -0.8], [hx, -0.8], [hx, 0.8], [hx - 0.4, 0.8])];
}
/** Turn (selector) head. */
function turnHead(hx: number): Prim[] {
  return [line([hx - 0.45, -0.8], [hx, -0.8], [hx, 0.8], [hx + 0.45, 0.8])];
}
/** Key head: a small key bow and bit. */
function keyHead(hx: number): Prim[] {
  return [circle(hx - 0.55, 0, 0.45), line([hx - 0.1, 0], [hx, 0])];
}

const familyParam: ParamDef = {
  key: "family",
  label: "Belongs to",
  type: "select",
  options: [
    { value: "relay", label: "Relay (K)" },
    { value: "contactor", label: "Contactor (Q)" },
    { value: "timer", label: "Timer (K)" },
  ],
  default: "relay",
  // Once linked to a coil, the contact takes the coil's tag: this is for one standing alone.
  when: (el) => el.links.length === 0,
  fixed: "Follows its coil",
};
const familyKind = (el: Element): SymbolKind => {
  const f = str(el, "family", "relay");
  return f === "contactor" ? "contactor" : f === "timer" ? "timer" : "relay";
};

/** What a timer does. `wave` is a small sketch of its output for the coil's function box. */
export interface TimerFunction {
  value: string;
  label: string;
  short: string;
  wave?: Vec[];
}

export const TIMER_FUNCTIONS: TimerFunction[] = [
  // Names and shorthand as IEC 61131-3 where it has them (TON, TOF, TP).
  { value: "on", label: "TON: on-delay", short: "TON" },
  { value: "off", label: "TOF: off-delay", short: "TOF" },
  { value: "on-off", label: "TON+TOF: on- and off-delay", short: "TON/TOF" },
  {
    value: "interval",
    label: "TP: pulse / interval (on for the time when energised)",
    short: "TP",
    wave: [[0, 0.8], [0.25, 0.8], [0.25, -0.8], [0.75, -0.8], [0.75, 0.8], [1, 0.8]],
  },
  {
    value: "flash-on",
    label: "Flasher, ON first (cyclic)",
    short: "FLASH",
    wave: [[0, 0.8], [0, -0.8], [0.33, -0.8], [0.33, 0.8], [0.67, 0.8], [0.67, -0.8], [1, -0.8]],
  },
  {
    value: "flash-off",
    label: "Flasher, OFF first (cyclic)",
    short: "FLASH OFF-1st",
    wave: [[0, 0.8], [0.33, 0.8], [0.33, -0.8], [0.67, -0.8], [0.67, 0.8], [1, 0.8]],
  },
];

export function timerFunction(el: Element): TimerFunction {
  const v = str(el, "mode", "on");
  return TIMER_FUNCTIONS.find((f) => f.value === v) ?? TIMER_FUNCTIONS[0]!;
}

/** Indicator colours: IEC 60757 two-letter codes, first letter capital. */
export const LAMP_COLOURS = [
  { code: "Rd", name: "red" },
  { code: "Ye", name: "yellow" },
  { code: "Gn", name: "green" },
  { code: "Bu", name: "blue" },
  { code: "Wh", name: "white" },
];

/** Marker colours for highlights: translucent, so the drawing under them still reads (and prints). */
export const HIGHLIGHT_COLOURS = [
  { value: "yellow", label: "Yellow", css: "rgba(255, 221, 0, 0.45)" },
  { value: "green", label: "Green", css: "rgba(80, 210, 90, 0.38)" },
  { value: "pink", label: "Pink", css: "rgba(255, 105, 180, 0.35)" },
  { value: "blue", label: "Blue", css: "rgba(80, 170, 255, 0.35)" },
];

/** Points kept in a part's params ("x,y x,y"), relative to its origin. */
export function parsePoints(s: string): Vec[] {
  const out: Vec[] = [];
  for (const bit of s.trim().split(/\s+/)) {
    const [a, b] = bit.split(",").map(Number);
    if (Number.isFinite(a) && Number.isFinite(b)) out.push([a!, b!]);
  }
  return out;
}

export const formatPoints = (pts: Vec[]) => pts.map((p) => `${Math.round(p[0] * 2) / 2},${Math.round(p[1] * 2) / 2}`).join(" ");

/** Parts drawn through points (arrow, polygon): their corners on the sheet, the origin first. */
export function partPoints(el: Pick<Element, "symbol" | "pos" | "params">): Vec[] | null {
  if (el.symbol !== "arrow" && el.symbol !== "polygon") return null;
  const rel = parsePoints(typeof el.params.pts === "string" ? el.params.pts : "");
  return [[...el.pos] as Vec, ...(el.symbol === "arrow" ? rel.slice(0, 1) : rel).map((p): Vec => [el.pos[0] + p[0], el.pos[1] + p[1]])];
}

// ---------------------------------------------------------------------------
// The library

const SYMBOLS: SymbolDef[] = [
  {
    id: "contact-no",
    name: "Contact NO",
    group: "Contacts",
    palette: true,
    params: [familyParam, instantParam],
    kind: familyKind,
    draw(el, t) {
      const timed = t?.timed;
      const c = contactTerms(timed ? ["17", "18"] : ["13", "14"], el, ["13", "14"]);
      return {
        prims: [...noContact(0, opOf(el)), ...(timed ? timingMark(NO_MID, -2.1, timed) : []), ...c.prims, ...tagAndLabel(timed ? -3.2 : -1.9, el)],
        terminals: c.terminals,
        body: { x: timed ? -2.7 : -1.3, y: -1.7, w: timed ? 2.8 : 1.4, h: 3.2 },
      };
    },
  },
  {
    id: "contact-nc",
    name: "Contact NC",
    group: "Contacts",
    palette: true,
    params: [familyParam, instantParam],
    kind: familyKind,
    draw(el, t) {
      const timed = t?.timed;
      const c = contactTerms(timed ? ["15", "16"] : ["21", "22"], el, ["21", "22"]);
      return {
        prims: [...ncContact(0, opOf(el)), ...(timed ? timingMark(NC_MID, -2.1, timed) : []), ...c.prims, ...tagAndLabel(timed ? -3.2 : -0.8, el)],
        terminals: c.terminals,
        body: { x: timed ? -2.7 : -0.1, y: -1.9, w: timed ? 4.1 : 1.5, h: 3.4 },
      };
    },
  },
  {
    id: "contact-co",
    name: "Changeover contact",
    group: "Contacts",
    palette: true,
    params: [familyParam, instantParam],
    kind: familyKind,
    draw(el, t) {
      const timed = t?.timed;
      // Printed marks: 11 common, 12 NC, 14 NO; a timed changeover 15, 16, 18.
      const [m12, m14, m11] = timed ? ["16", "18", "15"] : ["12", "14", "11"];
      return {
        prims: [
          line([0, -3], [0, -1.5]),
          line([-2, -3], [-2, -1.5], [-0.9, -1.5]),
          line([0, 1.5], [0, 3]),
          opOf(el) ? line([0, 1.5], [-0.25, -1.5]) : line([0, 1.5], [-1.1, -1.7]),
          // The timing mark goes out past the NC fixed contact.
          ...(timed ? timingMark([-0.55, 0], -3.2, timed) : []),
          term(0.45, -2.2, poleMarks(el, [m14, m11])[0]),
          term(-2.45, -2.2, poleMarks(el, [m12, m11])[0], "end"),
          term(0.45, 2.9, poleMarks(el, [m14, m11])[1]),
          ...tagAndLabel(timed ? -4.2 : -2.6, el).map((p) => (p.t === "text" ? { ...p, at: [p.at[0], p.at[1] + 1.2] as Vec } : p)),
        ],
        terminals: [
          { name: "12", at: [-2, -3], dir: "up" },
          { name: "14", at: [0, -3], dir: "up" },
          { name: "11", at: [0, 3], dir: "down" },
        ],
        body: { x: timed ? -3.8 : -2, y: -1.8, w: timed ? 3.9 : 2.1, h: 3.3 },
      };
    },
  },
  {
    id: "pushbutton",
    name: "Push button",
    group: "Operators",
    palette: true,
    params: [
      // Poles worked by the one head, each NO or NC, numbered by pole like a selector's: NO k3/k4, NC k1/k2 (v0.2.1 note 24).
      { key: "poles", label: "Poles", type: "number", min: 1, max: 4, default: 1 },
      ...[1, 2, 3, 4].map(
        (k): ParamDef => ({
          key: `pole${k}`,
          label: `Pole ${k}`,
          type: "select",
          default: k % 2 ? "no" : "nc",
          options: [
            { value: "no", label: `NO (${k}3/${k}4)` },
            { value: "nc", label: `NC (${k}1/${k}2)` },
          ],
          when: (el) => num(el, "poles", 1, 1, 4) >= k,
          fixed: "–",
        }),
      ),
    ],
    kind: () => "pushButton",
    draw(el) {
      const op = opOf(el);
      const poles = pushPoles(el);
      const prims: Prim[] = [];
      const terminals: TerminalDef[] = [];
      let lastMid: Vec = NO_MID;
      poles.forEach((nc, i) => {
        const x = i * 3;
        const k = i + 1;
        if (nc) {
          prims.push(...ncContact(x, op), term(x + 0.45, -2.2, `${k}1`), term(x + 0.45, 2.9, `${k}2`));
          terminals.push({ name: `${k}1`, at: [x, -3], dir: "up" }, { name: `${k}2`, at: [x, 3], dir: "down" });
          lastMid = [x + NC_MID[0], 0];
        } else {
          prims.push(...noContact(x, op), term(x + 0.45, -2.2, `${k}3`), term(x + 0.45, 2.9, `${k}4`));
          terminals.push({ name: `${k}3`, at: [x, -3], dir: "up" }, { name: `${k}4`, at: [x, 3], dir: "down" });
          lastMid = [x + NO_MID[0], 0];
        }
      });
      prims.push(dashed([-2.4, 0], lastMid), ...pushHead(-2.4), ...tagAndLabel(-3.2, el));
      return { prims, terminals, body: { x: -2.8, y: -1.9, w: (poles.length - 1) * 3 + 4.2, h: 3.4 } };
    },
  },
  {
    id: "selector",
    name: "Selector / keyswitch",
    group: "Operators",
    palette: true,
    params: [
      {
        key: "positions",
        label: "Positions",
        type: "select",
        options: [
          { value: "2", label: "2 position (0–I)" },
          { value: "3", label: "3 position (I–0–II)" },
        ],
        default: "2",
      },
      { key: "poles", label: "Poles", type: "number", min: 1, max: 4, default: 1 },
      {
        key: "pole1",
        label: "Pole 1",
        type: "select",
        default: "I",
        options: SELECTOR_POLE_OPTIONS,
        when: (el) => num(el, "poles", 1, 1, 4) >= 1,
        fixed: "–",
      },
      {
        key: "pole2",
        label: "Pole 2",
        type: "select",
        default: "II",
        options: SELECTOR_POLE_OPTIONS,
        when: (el) => num(el, "poles", 1, 1, 4) >= 2,
        fixed: "–",
      },
      {
        key: "pole3",
        label: "Pole 3",
        type: "select",
        default: "I",
        options: SELECTOR_POLE_OPTIONS,
        when: (el) => num(el, "poles", 1, 1, 4) >= 3,
        fixed: "–",
      },
      {
        key: "pole4",
        label: "Pole 4",
        type: "select",
        default: "I",
        options: SELECTOR_POLE_OPTIONS,
        when: (el) => num(el, "poles", 1, 1, 4) >= 4,
        fixed: "–",
      },
      { key: "key", label: "Key operated", type: "bool", default: false },
      // What each position is called, drawn as the legend under the head (v0.2.1 note 23).
      { key: "pos1", label: "Position 1 (I)", type: "text", default: "", placeholder: "e.g. SUPPLY 1" },
      { key: "pos0", label: "Off / mid position (0)", type: "text", default: "", placeholder: "e.g. OFF" },
      { key: "pos2", label: "Position 2 (II)", type: "text", default: "", placeholder: "e.g. SUPPLY 2", when: (el) => el.params.positions === "3", fixed: "3 position only" },
    ],
    kind: () => "selector",
    draw(el) {
      const key = bool(el, "key", false);
      const three = str(el, "positions", "2") === "3";
      const op = opOf(el);
      // In Simulate: the position it's in.
      const at = typeof el.params.__pos === "number" ? el.params.__pos : null;
      const poles = selectorPoles(el);
      const prims: Prim[] = [];
      const terminals: TerminalDef[] = [];
      // Poles 3 units apart; a changeover takes 2 more on its left for its NC side.
      let x = 0;
      let lastMid: Vec = NO_MID;
      poles.forEach((p, i) => {
        if (i > 0) x += 3 + (p.kind === "co" ? 2 : 0);
        const k = i + 1;
        if (p.kind === "co" && three) {
          // A common in the middle under a contact either side: I side left, II side right; open in 0.
          const t = changeoverTerms(k, true);
          const blade = at === 1 ? [x - 1.85, -1.55] : at === 2 ? [x - 0.15, -1.55] : [x - 1, -1.2];
          prims.push(
            line([x - 2, -3], [x - 2, -1.5], [x - 1.55, -1.5]),
            line([x, -3], [x, -1.5], [x - 0.45, -1.5]),
            line([x - 1, 3], [x - 1, 1.5]),
            line([x - 1, 1.5], blade as Vec),
            term(x - 2.45, -2.2, t.first, "end"),
            term(x + 0.45, -2.2, t.second),
            term(x - 0.55, 2.9, t.com),
          );
          terminals.push(
            { name: t.first, at: [x - 2, -3], dir: "up" },
            { name: t.second, at: [x, -3], dir: "up" },
            { name: t.com, at: [x - 1, 3], dir: "down" },
          );
          lastMid = [x - 1, 0];
        } else if (p.kind === "co") {
          prims.push(
            line([x, -3], [x, -1.5]),
            line([x - 2, -3], [x - 2, -1.5], [x - 0.9, -1.5]),
            line([x, 1.5], [x, 3]),
            op ? line([x, 1.5], [x - 0.25, -1.5]) : line([x, 1.5], [x - 1.1, -1.7]),
            term(x + 0.45, -2.2, `${k}4`),
            term(x - 2.45, -2.2, `${k}2`, "end"),
            term(x + 0.45, 2.9, `${k}1`),
          );
          terminals.push(
            { name: `${k}2`, at: [x - 2, -3], dir: "up" },
            { name: `${k}4`, at: [x, -3], dir: "up" },
            { name: `${k}1`, at: [x, 3], dir: "down" },
          );
          lastMid = [x - 0.55, -0.1];
        } else if (p.kind === "nc") {
          prims.push(...ncContact(x, op), term(x + 0.45, -2.2, `${k}1`), term(x + 0.45, 2.9, `${k}2`));
          terminals.push({ name: `${k}1`, at: [x, -3], dir: "up" }, { name: `${k}2`, at: [x, 3], dir: "down" });
          lastMid = [x + NC_MID[0], 0];
        } else {
          prims.push(...noContact(x, op), term(x + 0.45, -2.2, `${k}3`), term(x + 0.45, 2.9, `${k}4`));
          terminals.push({ name: `${k}3`, at: [x, -3], dir: "up" }, { name: `${k}4`, at: [x, 3], dir: "down" });
          lastMid = [x + NO_MID[0], 0];
        }
      });
      // The head on the left, clear of a first changeover's NC side; the legend under it,
      // away from the terminal numbers.
      const hx = poles[0]?.kind === "co" ? -4.4 : -2.4;
      prims.push(dashed([hx, 0], lastMid), ...(key ? keyHead(hx) : turnHead(hx)));
      // The legend: the position names in order, POS1 – MID – POS2, the one it's in boxed in Simulate.
      const names = selectorNames(el);
      const dash = " – ";
      const widths = names.map((n) => textWidth(n.name, DETAIL));
      const total = widths.reduce((a, b) => a + b, 0) + textWidth(dash, DETAIL) * (names.length - 1);
      // Ends just right of the head and runs left, under the tag and label, clear of the poles and their numbers.
      const ly = 3.1;
      let lx = hx + 0.3 - total;
      names.forEach((n, i) => {
        if (i) {
          const gap = textWidth(dash, DETAIL);
          prims.push(text(lx + gap / 2, ly, "–", DETAIL, "middle", "note"));
          lx += gap;
        }
        const tp: Prim = { ...text(lx, ly, n.name, DETAIL, "start", "note"), ...(at === n.pos ? { bold: true } : {}) } as Prim;
        prims.push(tp);
        if (at === n.pos) prims.push(rect(lx - 0.25, ly - DETAIL * CAP_HEIGHT - 0.3, widths[i]! + 0.5, DETAIL * CAP_HEIGHT + 0.6));
        lx += widths[i]!;
      });
      prims.push(...tagAndLabel(hx - 1.6, el));
      return { prims, terminals, body: { x: hx - 0.5, y: -1.9, w: x - hx + 1.9, h: 3.4 } };
    },
  },
  {
    id: "isolator",
    name: "Isolator / MCB / contactor",
    group: "Protection",
    palette: true,
    params: [
      {
        key: "function",
        label: "Function",
        type: "select",
        default: "isolator",
        options: [
          { value: "isolator", label: "Isolator / switch-disconnector (Q), hand operated" },
          { value: "contactor", label: "Contactor main contacts (Q), coil operated" },
          { value: "breaker", label: "Circuit breaker / MCB (F)" },
        ],
      },
      { key: "poles", label: "Main poles", type: "number", min: 1, max: 4, default: 3 },
      { key: "aux", label: "Auxiliary poles NO", type: "number", min: 0, max: 3, default: 0 },
      { key: "auxNc", label: "Auxiliary poles NC", type: "number", min: 0, max: 3, default: 0 },
      {
        key: "operator",
        label: "Operator",
        type: "select",
        default: "turn",
        options: [
          { value: "turn", label: "Rotary handle" },
          { value: "door", label: "Door handle (door interlocked)" },
          { value: "key", label: "Key" },
          { value: "none", label: "None (worked by something else)" },
        ],
        when: (el) => str(el, "function", "isolator") === "isolator",
        fixed: "none",
      },
    ],
    kind: (el) => {
      const f = str(el, "function", "isolator");
      return f === "contactor" ? "contactor" : f === "breaker" ? "breaker" : "isolator";
    },
    draw(el) {
      const fn = str(el, "function", "isolator");
      const poles = num(el, "poles", 3, 1, 4);
      const gap = 3;
      const prims: Prim[] = [];
      const terminals: TerminalDef[] = [];
      for (let i = 0; i < poles; i++) {
        const x = i * gap;
        const a = `${2 * i + 1}`;
        const b = `${2 * i + 2}`;
        prims.push(...noContact(x, opOf(el)));
        if (fn === "isolator") prims.push(line([x - 0.5, -1.5], [x + 0.5, -1.5]));
        // IEC contactor function: a small arc at the fixed contact.
        if (fn === "contactor") prims.push({ t: "arc", from: [x, -1.5], to: [x, -0.5], r: 0.5, sweep: 1 });
        // Circuit breaker function: a cross at the fixed contact.
        if (fn === "breaker") prims.push(line([x - 0.4, -1.9], [x + 0.4, -1.1]), line([x - 0.4, -1.1], [x + 0.4, -1.9]));
        prims.push(term(x + 0.45, -2.2, a), term(x + 0.45, 2.9, b));
        terminals.push({ name: a, at: [x, -3], dir: "up" }, { name: b, at: [x, 3], dir: "down" });
      }
      let lastX = (poles - 1) * gap;
      let lastMid = lastX + NO_MID[0];
      for (const [i, p] of isolatorAux(el).entries()) {
        const x = (poles + i) * gap + 1;
        prims.push(...(p.nc ? ncContact(x, opOf(el)) : noContact(x, opOf(el))), term(x + 0.45, -2.2, p.a), term(x + 0.45, 2.9, p.b));
        terminals.push({ name: p.a, at: [x, -3], dir: "up" }, { name: p.b, at: [x, 3], dir: "down" });
        lastX = x;
        lastMid = x + (p.nc ? NC_MID[0] : NO_MID[0]);
      }
      // Only a switch-disconnector has a handle of its own; a contactor is worked by its coil.
      const op = fn === "isolator" ? str(el, "operator", "turn") : "none";
      const hx = -2.4;
      prims.push(dashed([op === "none" ? NO_MID[0] : hx, 0], [lastMid, 0]));
      if (op === "turn" || op === "door") prims.push(...turnHead(hx));
      // A door handle: the rotary head coupled through the door (a short bar across the shaft).
      if (op === "door") prims.push(line([hx + 0.6, -0.7], [hx + 0.6, 0.7]));
      if (op === "key") prims.push(...keyHead(hx));
      prims.push(...tagAndLabel(op === "none" ? -1.6 : -3.2, el));
      return { prims, terminals, body: { x: op === "none" ? -1.3 : -2.9, y: -1.9, w: lastX + (op === "none" ? 2.7 : 4.3), h: 3.4 } };
    },
  },
  {
    id: "fuse",
    name: "Fuse / fuse carrier",
    group: "Protection",
    palette: true,
    params: [
      { key: "poles", label: "Poles", type: "number", min: 1, max: 4, default: 1 },
      { key: "rating", label: "Rating", type: "text", default: "", placeholder: "e.g. 2A" },
    ],
    kind: () => "fuse",
    draw(el) {
      const rating = str(el, "rating", "");
      const poles = num(el, "poles", 1, 1, 4);
      const prims: Prim[] = [];
      const terminals: TerminalDef[] = [];
      for (let i = 0; i < poles; i++) {
        const x = i * 3;
        // One pole keeps the plain 1/2 marking; a carrier is 1/2, 3/4, 5/6…
        const a = String(2 * i + 1);
        const b = String(2 * i + 2);
        // Blown (simulating): the link is broken inside the carrier and crossed out.
        const blown = opOf(el);
        prims.push(
          ...(blown
            ? [line([x, -3], [x, -0.7]), line([x, 0.7], [x, 3]), line([x - 0.6, -1.6], [x + 0.6, 1.6]), line([x + 0.6, -1.6], [x - 0.6, 1.6])]
            : [line([x, -3], [x, 3])]),
          rect(x - 0.6, -1.6, 1.2, 3.2),
          term(x + 0.45, -2.2, a),
          term(x + 0.45, 2.9, b),
        );
        terminals.push({ name: a, at: [x, -3], dir: "up" }, { name: b, at: [x, 3], dir: "down" });
      }
      if (poles > 1) prims.push(dashed([0.6, 0], [(poles - 1) * 3 - 0.6, 0]));
      if (rating) prims.push({ ...text((poles - 1) * 3 + 1, 0.45, rating, DETAIL, "start", "note"), block: true } as Prim);
      prims.push(...tagAndLabel(-1.2, el));
      return { prims, terminals, body: { x: -0.6, y: -1.6, w: (poles - 1) * 3 + 1.2, h: 3.2 } };
    },
  },
  {
    id: "coil",
    name: "Relay / contactor coil",
    group: "Coils",
    palette: true,
    params: [
      {
        key: "type",
        label: "Type",
        type: "select",
        options: [
          { value: "relay", label: "Relay (K)" },
          { value: "contactor", label: "Contactor (Q)" },
        ],
        default: "relay",
      },
      ACCEPTS_PARAM,
    ],
    kind: (el) => (str(el, "type", "relay") === "contactor" ? "contactor" : "relay"),
    draw(el) {
      return {
        prims: [
          line([0, -3], [0, -1.1]),
          line([0, 1.1], [0, 3]),
          rect(-1.6, -1.1, 3.2, 2.2),
          term(0.45, -1.6, "A1"),
          term(0.45, 2.9, "A2"),
          ...tagAndLabel(-2.1, el),
        ],
        terminals: vterms("A1", "A2"),
        body: { x: -1.6, y: -1.1, w: 3.2, h: 2.2 },
      };
    },
  },
  {
    id: "timer-coil",
    name: "Timer coil",
    group: "Coils",
    palette: true,
    params: [
      {
        key: "mode",
        label: "Function",
        type: "select",
        options: TIMER_FUNCTIONS.map((f) => ({ value: f.value, label: f.label })),
        default: "on",
      },
      {
        key: "time",
        label: "Time",
        type: "text",
        default: "",
        placeholder: "e.g. 5s, 1.5s, 2min",
        help: "A number and a unit: 500ms, 5s, 1.5s, 2min (or 2m). Decimals are fine; a number on its own is seconds.",
      },
      { key: "code", label: "Maker's function code", type: "text", default: "", placeholder: "e.g. A" },
      ACCEPTS_PARAM,
    ],
    kind: () => "timer",
    draw(el) {
      const mode = timerFunction(el);
      const time = str(el, "time", "");
      const code = str(el, "code", "");
      // Function mark in a box on the left of the coil (IEC 60617 for the two delays).
      const bx = -2.8;
      const mark: Prim[] = [rect(bx, -1.1, 1.2, 2.2, mode.value === "off")];
      if (mode.value === "on") mark.push(line([bx, -1.1], [bx + 1.2, 1.1]), line([bx, 1.1], [bx + 1.2, -1.1]));
      if (mode.value === "on-off") mark.push(line([bx, -1.1], [bx + 1.2, 1.1]), { t: "poly", pts: [[bx, 1.1], [bx + 1.2, 1.1], [bx + 1.2, -1.1]], fill: true });
      if (mode.wave) mark.push(line(...mode.wave.map(([x, y]) => [bx + 0.15 + x * 0.9, y * 0.7] as Vec)));
      // What it does, under the tag: the function (with the maker's code) and the time.
      const fn = [mode.short, time, code ? `(${code})` : ""].filter(Boolean).join(" ");
      const tx = -3.3;
      const prims: Prim[] = [
        line([0, -3], [0, -1.1]),
        line([0, 1.1], [0, 3]),
        rect(-1.6, -1.1, 3.2, 2.2),
        ...mark,
        term(0.45, -1.6, "A1"),
        term(0.45, 2.9, "A2"),
        text(tx, 0.5, "{tag}", TAG, "end", "tag"),
        text(tx, 1.75, fn, DETAIL, "end", "note"),
      ];
      if (el.label) prims.push(text(tx, 3.0, "{label}", TAG, "end", "label"));
      return { prims, terminals: vterms("A1", "A2"), body: { x: -2.8, y: -1.1, w: 4.4, h: 2.2 } };
    },
  },
  {
    id: "lamp",
    name: "Indicator lamp",
    group: "Loads",
    palette: true,
    params: [
      {
        key: "colour",
        label: "Colour",
        type: "select",
        // Every lamp has a colour; white covers a clear lens (4).
        options: LAMP_COLOURS.map((c) => ({ value: c.code, label: `${c.code} ${c.name}` })),
        default: "Wh",
      },
      { key: "testPin", label: "Lamp test terminal (T)", type: "bool", default: false },
      ACCEPTS_PARAM,
    ],
    kind: () => "lamp",
    draw(el) {
      const r = 1.3;
      const d = r * Math.SQRT1_2;
      const colour = str(el, "colour", "Wh");
      const test = bool(el, "testPin", false);
      const prims: Prim[] = [
        line([0, -3], [0, -r]),
        line([0, r], [0, 3]),
        circle(0, 0, r),
        line([-d, -d], [d, d]),
        line([-d, d], [d, -d]),
        term(0.45, -2.2, "+V"),
        term(0.45, 2.9, "-V"),
        ...(colour ? [text(1.8, 0.45, colour, DETAIL, "start", "note")] : []),
      ];
      const terminals = vterms("+V", "-V");
      if (test) {
        // Test terminal beside the supply, on the same side, so both wire from above.
        // Enters the bulb from the side, clear of the cross.
        prims.push(line([-2, -3], [-2, -1.4], [-r * 0.87, -r * 0.5]), term(-2.45, -2.2, "LT", "end"));
        terminals.unshift({ name: "LT", at: [-2, -3], dir: "up" });
      }
      prims.push(...tagAndLabel(test ? -2.4 : -1.8, el));
      return { prims, terminals, body: { x: test ? -2 : -r, y: -r, w: test ? 2 + r : 2 * r, h: 2 * r } };
    },
  },
  {
    id: "terminal",
    name: "Terminal",
    group: "Connection",
    palette: true,
    params: [
      { key: "strip", label: "Terminal strip", type: "text", default: "X1", placeholder: "e.g. X1" },
      {
        key: "function",
        label: "Type",
        type: "select",
        default: "plain",
        options: [
          { value: "plain", label: "Terminal" },
          { value: "fuse", label: "Fused terminal" },
          { value: "disconnect", label: "Disconnect (knife) terminal" },
          { value: "fuse-disconnect", label: "Switched fuse terminal (fuse disconnect)" },
          { value: "earth", label: "Earth terminal (green-yellow)" },
        ],
      },
      {
        key: "showStrip",
        label: "Show the strip identifier beside it",
        type: "bool",
        default: false,
        when: (el) => el.params.onBlock !== true,
        fixed: "Shown on the terminal block",
      },
      // Set by the sheet: the terminal sits in the panel boundary's terminal block.
      { key: "onBlock", label: "In the terminal block", type: "bool", default: false, hidden: true },
    ],
    kind: () => "terminal",
    bridged: () => [["1", "2"]],
    draw(el, t) {
      const onBlock = el.params.onBlock === true;
      const fn = str(el, "function", "plain");
      const prims: Prim[] = [];
      // In the block the cell is 3 units tall (room for a readable number);
      // on its own the terminal is a small circle with leads to ±1.
      // params.cellHalf is set by the sheet (fitBlock) when a long number needs taller cells.
      const cellHalf = typeof el.params.cellHalf === "number" ? Math.min(10, Math.max(BLOCK_HALF, el.params.cellHalf)) : BLOCK_HALF;
      const half = onBlock ? cellHalf : 1;
      // A fused or disconnect terminal: the fuse or knife in the lead on the
      // panel side, right on top of the terminal, so it can't be missed.
      const top = fn === "plain" || fn === "earth" ? -half : -half - 2;
      const y0 = -half; // where the terminal itself starts
      if (fn === "fuse") {
        // IEC fuse: a rectangle with the conductor through it.
        prims.push(line([0, top], [0, y0]), line([-0.32, y0 - 1.75], [0.32, y0 - 1.75], [0.32, y0 - 0.2], [-0.32, y0 - 0.2], [-0.32, y0 - 1.75]));
      } else if (fn === "disconnect" || fn === "fuse-disconnect") {
        // Knife link drawn open, hinged at the bottom; a switched fuse carries the fuse on the blade.
        const pivot: Vec = [0, y0 - 0.25];
        const tip: Vec = [-0.5, y0 - 1.6];
        prims.push(line([0, top], [0, y0 - 1.6]), line([-0.3, y0 - 1.6], [0.3, y0 - 1.6]), line(pivot, [0, y0]), line(pivot, tip), { t: "circle", c: pivot, r: 0.12, fill: true });
        if (fn === "fuse-disconnect") {
          const dx = tip[0] - pivot[0];
          const dy = tip[1] - pivot[1];
          const len = Math.hypot(dx, dy);
          const u: Vec = [dx / len, dy / len];
          const n: Vec = [-u[1] * 0.22, u[0] * 0.22];
          const a: Vec = [pivot[0] + u[0] * 0.3, pivot[1] + u[1] * 0.3];
          const b: Vec = [pivot[0] + u[0] * (len - 0.15), pivot[1] + u[1] * (len - 0.15)];
          prims.push(line([a[0] + n[0], a[1] + n[1]], [b[0] + n[0], b[1] + n[1]], [b[0] - n[0], b[1] - n[1]], [a[0] - n[0], a[1] - n[1]], [a[0] + n[0], a[1] + n[1]]));
        }
      }
      const earth = fn === "earth";
      if (onBlock) {
        // A cell of the boundary's terminal block, a column wide (v0.3 §2), its number written up the cell.
        // An earth terminal prints no number: its earth sign is centred in the cell (27, 13).
        prims.push(line([-CELL_HALF_W, -half], [CELL_HALF_W, -half], [CELL_HALF_W, half], [-CELL_HALF_W, half], [-CELL_HALF_W, -half]));
        if (earth) prims.push(...earthSign([0, -0.4], 1.1));
        else
          prims.push({
            t: "text",
            // Centred across the cell: the capitals sit either side of the middle.
            // Always the tag size: a long number makes the cells taller instead.
            at: [TAG * CAP_HEIGHT * 0.5, 0],
            text: "{tag}",
            size: TAG,
            anchor: "middle",
            role: "tag",
            vertical: true,
          });
        if (el.label) prims.push(text(CELL_HALF_W + 0.15, half + 1, "{label}", DETAIL, "start", "label"));
        return {
          prims,
          terminals: [
            { name: "1", at: [0, top], dir: "up" },
            { name: "2", at: [0, half], dir: "down" },
          ],
          body: { x: -CELL_HALF_W, y: -half, w: CELL_HALF_W * 2, h: half * 2 },
        };
      }
      const strip = el.params.showStrip === true ? String(el.params.strip ?? "").trim() : "";
      prims.push(
        line([0, -1], [0, -0.45]),
        line([0, 0.45], [0, 1]),
        // White inside: a terminal on the panel boundary sits over the line.
        { t: "circle", c: [0, 0], r: 0.45, bg: true },
        // An earth terminal: the earth sign hanging from a stub off its lower left,
        // clear of its leads and of a strip line through it.
        ...(earth ? [line([-0.32, 0.32], [-0.9, 0.9]), ...earthSign([-0.9, 0.9], 0.9)] : []),
        // The terminal's number sits beside it, across the wire, so it doesn't read as a wire number.
        text(0.6, 0.1, "{tag}", TAG, "start", "tag"),
        // Its strip on the other side, when asked for.
        ...(strip ? [text(-0.6, -0.15, strip, DETAIL, "end", "note")] : []),
        ...(el.label ? [text(0.65, 1.0, "{label}", DETAIL, "start", "label")] : []),
      );
      return {
        prims,
        terminals: [
          { name: "1", at: [0, top], dir: "up" },
          { name: "2", at: [0, 1], dir: "down" },
        ],
        body: { x: -0.45, y: -0.45, w: 0.9, h: 0.9 },
      };
    },
  },
  {
    id: "socket",
    name: "Socket outlet",
    group: "Loads",
    palette: true,
    params: [],
    kind: () => "socket",
    draw(el) {
      // L and N 3 units apart, straight down from a two-pole MCB; the earth
      // comes out of the side, to go to an earth symbol.
      const cx = 1.5;
      const r = 2.6;
      return {
        prims: [
          line([0, -4], [0, -1]),
          line([3, -4], [3, -1]),
          line([cx - r, -1], [cx + r, -1]),
          { t: "arc", from: [cx - r, -1], to: [cx + r, -1], r, sweep: 0 },
          line([cx + r, -1], [cx + r, -2], [6, -2]),
          term(-0.45, -2.6, "L", "end"),
          term(0.45, -2.6, "N"),
          term(5.6, -2.4, "E", "end"),
          ...tagAndLabel(-1.4, el),
        ],
        terminals: [
          { name: "L", at: [0, -4], dir: "up" },
          { name: "N", at: [3, -4], dir: "up" },
          { name: "E", at: [6, -2], dir: "right" },
        ],
        body: { x: cx - r, y: -1, w: 2 * r, h: r },
      };
    },
  },
  {
    id: "transformer",
    name: "Transformer",
    group: "Loads",
    palette: true,
    params: [
      { key: "screen", label: "Earthed screen", type: "bool", default: false },
      { key: "rating", label: "Rating", type: "text", default: "", placeholder: "e.g. 230/24V 100VA" },
      GIVES_PARAM,
    ],
    kind: () => "transformer",
    draw(el) {
      // Windings 3 units apart, the same as switch poles, so it wires straight from an isolator or MCB.
      const r = 2.2;
      const cy = 1.4;
      const cx = 1.5;
      const edge = cy + Math.sqrt(r * r - 0.36); // circle edge at x = cx ± 0.6
      const rating = str(el, "rating", "");
      const prims: Prim[] = [
        circle(cx, -cy, r),
        circle(cx, cy, r),
        line([0, -6], [0, -5], [cx - 0.6, -edge]),
        line([3, -6], [3, -5], [cx + 0.6, -edge]),
        line([0, 6], [0, 5], [cx - 0.6, edge]),
        line([3, 6], [3, 5], [cx + 0.6, edge]),
        term(-0.45, -5.2, "P1", "end"),
        term(3.45, -5.2, "P2"),
        term(-0.45, 5.9, "S1", "end"),
        term(3.45, 5.9, "S2"),
        ...tagAndLabel(-1.2, el),
      ];
      if (bool(el, "screen", false)) prims.push(dashed([cx - 3, 0], [cx + 3, 0]), line([cx + 3, 0], [cx + 3.6, 0]));
      if (rating) prims.push({ ...text(cx + 3, 2.6, rating, DETAIL, "start", "note"), block: true } as Prim);
      return {
        prims,
        terminals: [
          { name: "P1", at: [0, -6], dir: "up" },
          { name: "P2", at: [3, -6], dir: "up" },
          { name: "S1", at: [0, 6], dir: "down" },
          { name: "S2", at: [3, 6], dir: "down" },
        ],
        body: { x: cx - r, y: -cy - r, w: 2 * r, h: 2 * (cy + r) },
      };
    },
  },
  {
    id: "motor",
    name: "Motor (3-phase)",
    group: "Loads",
    palette: true,
    params: [{ key: "rating", label: "Rating", type: "text", default: "", placeholder: "e.g. 1.5kW 3.4A FLC" }],
    kind: () => "motor",
    draw(el) {
      // U V W 3 units apart, in line with the poles of the contactor above.
      const r = 3.6;
      const e = Math.sqrt(r * r - 9);
      const rating = str(el, "rating", "");
      return {
        prims: [
          circle(0, 0, r),
          line([-3, -6], [-3, -e]),
          line([0, -6], [0, -r]),
          line([3, -6], [3, -e]),
          text(0, 0.3, "M", 2.2, "middle", "note"),
          text(0, 2, "3~", 1.3, "middle", "note"),
          term(-3.45, -4.4, "U", "end"),
          term(0.45, -4.4, "V"),
          term(3.45, -4.4, "W"),
          ...(rating ? [{ ...text(4.1, 2.5, rating, DETAIL, "start", "note"), block: true } as Prim] : []),
          ...tagAndLabel(-4.2, el),
        ],
        terminals: [
          { name: "U", at: [-3, -6], dir: "up" },
          { name: "V", at: [0, -6], dir: "up" },
          { name: "W", at: [3, -6], dir: "up" },
        ],
        body: { x: -r, y: -r, w: 2 * r, h: 2 * r },
      };
    },
  },
  {
    id: "busbar",
    name: "Distribution block",
    group: "Connection",
    palette: true,
    params: barParams(),
    // The physical busbar or distribution block (v0.3 §1): tagged W, placed on the GA, in the bill of materials.
    kind: () => "busbar",
    draw: (el, t) => drawBar(el, t, BAR_W, true),
  },
  {
    id: "rail",
    name: "Control rail",
    group: "Connection",
    palette: true,
    params: barParams(),
    // A drawing convention (CCT, 0V), not a part: no tag, not on the GA.
    kind: () => null,
    draw: (el, t) => drawBar(el, t, CONTROL_W, false),
  },
  {
    id: "earth",
    name: "Earth",
    group: "Connection",
    palette: true,
    params: [
      {
        key: "type",
        label: "Type",
        type: "select",
        default: "earth",
        options: [
          { value: "earth", label: "Earth, general (IEC 60417-5017)" },
          { value: "protective", label: "Protective earth, PE (5019)" },
          { value: "functional", label: "Functional / clean earth, FE (5018)" },
          { value: "chassis", label: "Frame or chassis (5020)" },
          { value: "equipotential", label: "Equipotential bonding (5021)" },
        ],
      },
    ],
    kind: () => null,
    draw(el) {
      const type = str(el, "type", "earth");
      // The three bars of the general earth, under a stem from the terminal.
      const bars: Prim[] = [line([-1.2, 0], [1.2, 0]), line([-0.8, 0.5], [0.8, 0.5]), line([-0.4, 1], [0.4, 1])];
      let prims: Prim[] = [line([0, -2], [0, 0]), ...bars];
      let body: Rect = { x: -1.2, y: 0, w: 2.4, h: 1 };
      if (type === "protective") {
        // In a circle.
        // The earth sign centred in its circle: the stem runs in from the top, the bars sit just below the middle (26).
        const pe: Prim[] = [line([-1, -0.25], [1, -0.25]), line([-0.65, 0.3], [0.65, 0.3]), line([-0.3, 0.85], [0.3, 0.85])];
        prims = [line([0, -2], [0, -0.25]), ...pe, circle(0, 0, 1.5)];
        body = { x: -1.5, y: -1.5, w: 3, h: 3 };
      } else if (type === "functional") {
        // In a cup: an arc under the bars.
        prims = [line([0, -2], [0, -0.3]), ...bars.map((b) => shift(b, 0, -0.3)), { t: "arc", from: [-1.5, -0.3], to: [1.5, -0.3], r: 1.5, sweep: 0 }];
        body = { x: -1.5, y: -0.3, w: 3, h: 1.5 };
      } else if (type === "chassis") {
        // A bar with hatching under it.
        prims = [line([0, -2], [0, 0]), line([-1.2, 0], [1.2, 0])];
        for (const x of [-1.2, -0.2, 0.8]) prims.push(line([x + 0.4, 0], [x - 0.2, 0.9]));
        body = { x: -1.4, y: 0, w: 2.6, h: 0.9 };
      } else if (type === "equipotential") {
        // A triangle pointing down.
        prims = [line([0, -2], [0, 0]), { t: "poly", pts: [[-1.2, 0], [1.2, 0], [0, 1.5]], fill: false }];
        body = { x: -1.2, y: 0, w: 2.4, h: 1.5 };
      }
      return { prims, terminals: [{ name: "E", at: [0, -2], dir: "up" }], body };
    },
  },
  {
    id: "offpage",
    name: "Link arrow",
    group: "Connection",
    palette: true,
    params: [
      { key: "source", label: "Source (where the conductor comes from)", type: "bool", default: true },
      { key: "ref", label: "Reference (if not linked)", type: "text", default: "", placeholder: "e.g. 8-34" },
      // A destination shows its source's label unless it has its own (70).
      {
        key: "sameLabel",
        label: "Same label as its source",
        type: "bool",
        default: true,
        when: (el) => el.params.source === false && el.links.length > 0,
        fixed: "For a linked destination arrow",
      },
      // Picked from the project's distribution list (Props): the arrow carries that supply.
      { key: "dist", label: "Distribution", type: "text", default: "", hidden: true },
    ],
    kind: () => null,
    draw(el, t) {
      const source = el.params.source !== false;
      const label = t?.label ?? el.label;
      // A slim isosceles triangle. The source points away along the wire
      // (it goes on elsewhere); the destination points back into its wire
      // (it comes from elsewhere) and is filled, so the two never get mixed up.
      const w = 0.6;
      const h = 1.8;
      const head: Prim = source
        ? { t: "poly", pts: [[-w, 0], [w, 0], [0, h]], fill: false }
        : { t: "poly", pts: [[-w, h], [w, h], [0, 0]], fill: true };
      // The label at the arrow's tip, then its reference (71): to the right of
      // the tip on a vertical wire, under the arrow on a horizontal one,
      // running on the way the arrow points. Text stays upright.
      const xref = t?.xref ?? "";
      // The reference follows the label's first line.
      const lwidth = typeof el.params.labelWidth === "number" && el.params.labelWidth > 0 ? el.params.labelWidth : 0;
      const first = label ? (lwidth ? wrapText(label, TAG, lwidth) : label.split("\n"))[0]! : "";
      const lw = first ? textWidth(first, TAG) : 0;
      const gap = label && xref ? 0.8 : 0;
      const cap = TAG * CAP_HEIGHT;
      const placed = (at: Vec, s: string, size: number, anchor: Anchor, role: TextRole): Prim => ({ t: "text", at, text: s, size, anchor, role, placed: true });
      const texts: Prim[] = [];
      const rot = el.rot;
      // The wire number it carries, horizontal and in line with the arrow (v0.3 §2): on a
      // vertical arrow, left of the head on the label's line (number, arrow, label); on a
      // horizontal one, beyond its free end.
      const wire = t?.wire ?? "";
      if (wire) {
        if (rot === 0) texts.push(placed([-w - 0.5, h - 0.2], wire, TAG, "end", "note"));
        else if (rot === 180) texts.push(placed([-w - 0.5, -h + 0.2 + cap], wire, TAG, "end", "note"));
        else if (rot === 270) texts.push(placed([h + 0.5, cap / 2], wire, TAG, "start", "note"));
        else texts.push(placed([-h - 0.5, cap / 2], wire, TAG, "end", "note"));
      }
      if (rot === 0 || rot === 180) {
        const y = rot === 0 ? h - 0.2 : -h + 0.2 + cap;
        if (label) texts.push(placed([1, y], "{label}", TAG, "start", "label"));
        texts.push(placed([1 + lw + gap, y], "{xref}", DETAIL, "start", "xref"));
      } else {
        // Pointing left (90) or right (270): under the arrow, from its middle on past the tip.
        const y = w + 0.5 + cap;
        const xw = xref ? textWidth(xref, DETAIL) : 0;
        if (rot === 270) {
          if (label) texts.push(placed([0, y], "{label}", TAG, "start", "label"));
          texts.push(placed([lw + gap, y], "{xref}", DETAIL, "start", "xref"));
        } else {
          if (label) texts.push(placed([-xw - gap, y], "{label}", TAG, "end", "label"));
          texts.push(placed([0, y], "{xref}", DETAIL, "end", "xref"));
        }
      }
      return {
        prims: [line([0, -2], [0, 0]), head, ...texts],
        terminals: [{ name: "1", at: [0, -2], dir: "up" }],
        body: { x: -w, y: 0, w: 2 * w, h },
      };
    },
  },
  {
    id: "strip-line",
    name: "Terminal strip line",
    group: "Connection",
    palette: true,
    params: [
      { key: "strip", label: "Terminal strip", type: "text", default: "X1", placeholder: "e.g. X0" },
      { key: "length", label: "Length (units)", type: "number", min: 2, max: 150, default: 20 },
    ],
    kind: () => null,
    draw(el) {
      // A dashed line through a group of terminals, its strip's name at the end (55).
      // Every terminal it crosses joins that strip (applyStripLines).
      const len = num(el, "length", 20, 2, 150);
      const name = str(el, "strip", "X1");
      return {
        prims: [dashed([0, 0], [len, 0]), ...(name ? [text(len + 0.6, 0.45, name, TAG, "start", "note")] : [])],
        terminals: [],
        body: { x: 0, y: -0.3, w: len, h: 0.6 },
      };
    },
  },
  {
    id: "screen",
    name: "Cable screen",
    group: "Connection",
    palette: true,
    params: [
      { key: "span", label: "Width across the cores (units)", type: "number", min: 1, max: 60, default: 3 },
      { key: "dashed", label: "Dashed", type: "bool", default: false },
    ],
    // Not a part of its own: no tag (v0.2.1 note 25).
    kind: () => null,
    // Its two points are the one screen.
    bridged: () => [["E", "E2"]],
    draw(el) {
      // A rounded rectangle drawn across the cores of a screened cable, with a
      // point at each end for its drain (screen) wire, left or right: no tail
      // (v0.2.1 note 13). Origin on the first core.
      const span = num(el, "span", 3, 1, 60);
      const cx = span / 2;
      const [x0, x1, y0, y1, r] = [-1, span + 1, -0.7, 0.7, 0.5];
      // The outline as one line, corners rounded in short steps, so a dash runs round it evenly.
      const corner = (ox: number, oy: number, a0: number): Vec[] =>
        [0, 1, 2, 3, 4].map((i) => {
          const a = ((a0 + i * 22.5) * Math.PI) / 180;
          return [ox + r * Math.cos(a), oy + r * Math.sin(a)] as Vec;
        });
      const outline: Vec[] = [
        ...corner(x1 - r, y0 + r, 270),
        ...corner(x1 - r, y1 - r, 0),
        ...corner(x0 + r, y1 - r, 90),
        ...corner(x0 + r, y0 + r, 180),
      ];
      outline.push(outline[0]!);
      const prims: Prim[] = [{ t: "line", pts: outline, ...(bool(el, "dashed", false) ? { dash: true } : {}) }];
      const terminals: TerminalDef[] = [
        { name: "E", at: [x1, 0], dir: "right" },
        { name: "E2", at: [x0, 0], dir: "left" },
      ];
      if (el.label) prims.push(text(x0 - 0.5, 0.45, "{label}", TAG, "end", "label"));
      // No body: the wires pass through the screen.
      return { prims, terminals, body: { x: cx, y: 0, w: 0, h: 0 } };
    },
  },
  {
    id: "plant-view",
    name: "Plant view",
    group: "Drawing",
    // Placed from the Plant list, which says which plant item it shows.
    palette: false,
    params: [],
    kind: () => null,
    draw(el, t) {
      // Groups of terminals on chosen sides (v0.4.x T15).
      if (usesSides(el)) return drawSideView(el, t);
      // A controller's module: at the top of the sheet, terminals along the bottom (controller.md §5).
      if (str(el, "pmod", "")) return drawModuleView(el, t);
      const lay = plantViewLayout(el);
      const { left, right, h } = lay;
      const pbo = bool(el, "pbo", false);
      const zig = (x: number): Vec[] => {
        const pts: Vec[] = [[x, 0]];
        for (let i = 0, y = 0.4; y < h; i++, y += 0.8) pts.push([x + (i % 2 ? 0.4 : -0.4), y]);
        pts.push([x, h]);
        return pts;
      };
      const prims: Prim[] = [line([left, 0], [right, 0]), line([left, h], [right, h])];
      // A break on a side means "more of this plant isn't shown here": on the
      // right, other terminals on another sheet; on the left, its power, by others.
      prims.push(pbo ? line(...zig(left)) : line([left, 0], [left, h]));
      prims.push(lay.partial ? line(...zig(right)) : line([right, 0], [right, h]));
      if (pbo) {
        prims.push(
          text(left - 0.9, h / 2 - 0.2, "POWER BY", DETAIL, "end", "note"),
          text(left - 0.9, h / 2 + 1.2, "OTHERS", DETAIL, "end", "note"),
        );
      }
      // Terminal boxes along the top inside edge, adjacent ones sharing a wall,
      // each name written up its box like a terminal block cell.
      const half = PLANT.pitch / 2;
      for (const t of lay.terms) {
        prims.push(rect(t.x - half, 0, PLANT.pitch, lay.termH), {
          t: "text",
          at: [t.x + TAG * CAP_HEIGHT * 0.5, lay.termH / 2],
          text: t.name,
          size: TAG,
          anchor: "middle",
          role: "term",
          vertical: true,
        });
        // A pin's id (C, Y1, VO) in its own box under its number.
        if (lay.idH && t.pinId) {
          prims.push(rect(t.x - half, lay.termH, PLANT.pitch, lay.idH), {
            t: "text",
            at: [t.x + DETAIL * CAP_HEIGHT * 0.5, lay.termH + lay.idH / 2],
            text: t.pinId,
            size: DETAIL,
            anchor: "middle",
            role: "note",
            vertical: true,
          });
        }
      }
      for (const g of lay.groups) g.lines.forEach((l, i) => prims.push(text((g.x0 + g.x1) / 2, lay.termH + lay.idH + 1.9 + i * PLANT.group * LINE, l, PLANT.group, "middle", "note")));
      // Tag, description and information under the box, centred, wrapped to
      // the box plus 1.5 units each side and never narrower than 12 (v0.4.x F4):
      // words at spaces; a tag only at a hyphen, and only when it must.
      const wrapW = Math.max(right - left + 3, 12);
      const mid = (left + right) / 2;
      const lines: [string, number, TextRole][] = [];
      const tagText = t?.tag ?? "";
      const tagLines = tagText ? wrapTag(tagText, TAG, wrapW) : ["{tag}"];
      if (tagLines.length > 1) for (const l of tagLines) lines.push([l, TAG, "tag"]);
      else lines.push(["{tag}", TAG, "tag"]);
      for (const l of [str(el, "pdesc", ""), ...str(el, "pinfo", "").split("\n")].filter(Boolean)) for (const w of wrapText(l, TAG, wrapW)) lines.push([w, TAG, "note"]);
      if (el.label) lines.push(["{label}", TAG, "label"]);
      let y = h + 1.8;
      for (const [tx, size, role] of lines) {
        prims.push({ ...text(mid, y, tx, size, "middle", role), block: true } as Prim);
        y += size * 1.35;
      }
      const terminals: TerminalDef[] = lay.terms.map((t) => ({ name: t.id, at: [t.x, 0], dir: "up" as Dir }));
      return { prims, terminals, body: { x: left, y: 0, w: right - left, h } };
    },
  },
  {
    id: "text",
    bench: "annotate",
    name: "Text",
    group: "Drawing",
    palette: true,
    params: [
      {
        key: "align",
        label: "Align",
        type: "select",
        default: "start",
        options: [
          { value: "start", label: "Left" },
          { value: "middle", label: "Centre" },
          { value: "end", label: "Right" },
        ],
      },
      { key: "width", label: "Wrap at (units; 0: don't wrap)", type: "number", min: 0, max: 150, default: 0 },
    ],
    kind: () => null,
    draw(el, t) {
      // Formatted text in Markdown, top left at the origin; centred or right-aligned
      // lines are placed about it. Body text is Note; headings set their own sizes (v0.2.1 note 8).
      const size = TEXT_SIZES.note!;
      const width = num(el, "width", 0, 0, 150);
      const n = notesLayout((t?.label ?? el.label) || "Text", size, width || 1000);
      const anchor = str(el, "align", "start");
      if (anchor === "start") return { prims: n.prims, terminals: [], body: { x: 0, y: 0, w: Math.max(1, wrappedWidth(n.prims)), h: n.h } };
      // Line by line: each line's text moves left by all (right) or half (centre) its width.
      const lines = new Map<number, { x0: number; x1: number }>();
      const key = (y: number) => Math.round(y * 100);
      for (const p of n.prims) {
        if (p.t !== "text") continue;
        const w = textWidth(p.text, p.size);
        const l = lines.get(key(p.at[1])) ?? { x0: Infinity, x1: -Infinity };
        l.x0 = Math.min(l.x0, p.at[0]);
        l.x1 = Math.max(l.x1, p.at[0] + w);
        lines.set(key(p.at[1]), l);
      }
      const k = anchor === "middle" ? 0.5 : 1;
      const prims = n.prims.map((p): Prim => {
        if (p.t !== "text") return p;
        const l = lines.get(key(p.at[1]))!;
        return { ...p, at: [p.at[0] - (l.x1 - l.x0) * k, p.at[1]] };
      });
      const w = Math.max(1, ...[...lines.values()].map((l) => l.x1 - l.x0));
      return { prims, terminals: [], body: { x: -w * k, y: 0, w, h: n.h } };
    },
  },
  {
    id: "revtable",
    bench: "annotate",
    name: "Revision list",
    group: "Tables",
    palette: true,
    params: [
      { key: "rows", label: "Rows at least", type: "number", min: 1, max: 40, default: 6 },
      {
        key: "size",
        label: "Size",
        type: "select",
        default: "note",
        options: TEXT_SIZE_OPTIONS,
      },
    ],
    kind: () => null,
    draw(el, t) {
      const size = TEXT_SIZES[str(el, "size", "note")] ?? TEXT_SIZES.note!;
      const r = revisionTable(t?.rows ?? [], num(el, "rows", 6, 1, 40), size);
      return { prims: r.prims, terminals: [], body: { x: 0, y: 0, w: r.w, h: r.h } };
    },
  },
  {
    id: "ctrlmap",
    bench: "annotate",
    name: "Controller map",
    group: "Tables",
    palette: true,
    params: [
      // Picked from the project's controllers (Props); empty: the first one.
      { key: "ctrl", label: "Controller", type: "text", default: "", hidden: true },
      { key: "width", label: "Width (units; wraps onto more rows)", type: "number", min: 20, max: 150, default: 120 },
    ],
    kind: () => null,
    draw(el, t) {
      const r = controllerMap(t?.modules ?? [], num(el, "width", 120, 20, 150));
      return { prims: r.prims, terminals: [], body: { x: 0, y: 0, w: r.w, h: r.h } };
    },
  },
  {
    id: "netmap",
    bench: "annotate",
    name: "Network diagram",
    group: "Tables",
    palette: true,
    params: [{ key: "width", label: "Width (units)", type: "number", min: 40, max: 150, default: 146 }],
    kind: () => null,
    draw(el, t) {
      // Redrawn from Design's networks every time (design-v0.4 §7), like the controller map.
      const r = networkDiagram(t?.network ?? { lans: [], buses: [], loose: [] }, num(el, "width", 146, 40, 150));
      return { prims: r.prims, terminals: [], body: { x: 0, y: 0, w: r.w, h: r.h } };
    },
  },
  {
    id: "legend",
    bench: "annotate",
    name: "Symbol legend",
    group: "Tables",
    palette: true,
    params: [
      { key: "cols", label: "Columns", type: "number", min: 1, max: 4, default: 2 },
      {
        key: "size",
        label: "Size",
        type: "select",
        default: "note",
        options: TEXT_SIZE_OPTIONS,
      },
    ],
    kind: () => null,
    draw(el, t) {
      const size = TEXT_SIZES[str(el, "size", "note")] ?? TEXT_SIZES.note!;
      const entries = t?.legend ?? [];
      if (!entries.length) {
        return { prims: [text(0, 2, "SYMBOL LEGEND: no parts drawn yet", size, "start", "label")], terminals: [], body: { x: 0, y: 0, w: 40, h: 3 } };
      }
      const r = legendTable(entries, num(el, "cols", 2, 1, 4), size);
      return { prims: r.prims, terminals: [], body: { x: 0, y: 0, w: r.w, h: r.h } };
    },
  },
  {
    id: "box",
    bench: "annotate",
    name: "Box",
    group: "Drawing",
    palette: true,
    params: [
      { key: "w", label: "Width (units)", type: "number", min: 2, max: 200, default: 30 },
      { key: "h", label: "Height (units)", type: "number", min: 2, max: 120, default: 20 },
      { key: "dashed", label: "Dashed", type: "bool", default: false },
      { key: "heavy", label: "Heavy line", type: "bool", default: false },
    ],
    kind: () => null,
    draw(el) {
      const w = num(el, "w", 30, 2, 200);
      const h = num(el, "h", 20, 2, 120);
      const pts: Vec[] = [[0, 0], [w, 0], [w, h], [0, h], [0, 0]];
      const prim: Prim = { t: "line", pts, dash: bool(el, "dashed", false), w: bool(el, "heavy", false) ? 0.35 : W };
      return {
        prims: [prim, ...(el.label ? [text(0.6, 1.8, "{label}", TAG, "start", "label")] : [])],
        terminals: [],
        body: { x: 0, y: 0, w, h },
      };
    },
  },
  {
    id: "arrow",
    bench: "annotate",
    name: "Arrow",
    group: "Drawing",
    palette: true,
    params: [
      // Its tip, from where it starts (the part's origin), in units: dragged by its handle.
      { key: "pts", label: "Points", type: "text", default: "12,0", hidden: true },
      {
        key: "heads",
        label: "Heads",
        type: "select",
        default: "end",
        options: [
          { value: "end", label: "At the tip" },
          { value: "both", label: "Both ends" },
        ],
      },
      { key: "dashed", label: "Dashed", type: "bool", default: false },
      { key: "heavy", label: "Heavy line", type: "bool", default: false },
    ],
    kind: () => null,
    draw(el) {
      const pts = [[0, 0] as Vec, ...parsePoints(str(el, "pts", "12,0")).slice(0, 1)];
      const tip = pts[1] ?? [12, 0];
      const w = bool(el, "heavy", false) ? 0.35 / UNIT_MM : W;
      const prims: Prim[] = [];
      const len = Math.hypot(tip[0], tip[1]) || 1;
      const u: Vec = [tip[0] / len, tip[1] / len];
      // A filled head 1.4 units long; the shaft stops at its base so a heavy line doesn't blunt it.
      const head = (at: Vec, dir: Vec): Prim => {
        const base: Vec = [at[0] - dir[0] * 1.4, at[1] - dir[1] * 1.4];
        const n: Vec = [-dir[1] * 0.5, dir[0] * 0.5];
        return { t: "poly", pts: [at, [base[0] + n[0], base[1] + n[1]], [base[0] - n[0], base[1] - n[1]]], fill: true };
      };
      const both = str(el, "heads", "end") === "both";
      const from: Vec = both ? [u[0] * 1.2, u[1] * 1.2] : [0, 0];
      const to: Vec = [tip[0] - u[0] * 1.2, tip[1] - u[1] * 1.2];
      prims.push({ t: "line", pts: [from, to], w, dash: bool(el, "dashed", false) }, head(tip, u));
      if (both) prims.push(head([0, 0], [-u[0], -u[1]]));
      const x = Math.min(0, tip[0]);
      const y = Math.min(0, tip[1]);
      return { prims, terminals: [], body: { x, y, w: Math.abs(tip[0]), h: Math.abs(tip[1]) } };
    },
  },
  {
    id: "highlight",
    bench: "annotate",
    name: "Highlight",
    group: "Drawing",
    palette: true,
    params: [
      { key: "w", label: "Width (units)", type: "number", min: 1, max: 150, default: 20 },
      { key: "h", label: "Height (units)", type: "number", min: 1, max: 90, default: 3 },
      {
        key: "colour",
        label: "Colour",
        type: "select",
        default: "yellow",
        options: HIGHLIGHT_COLOURS.map((c) => ({ value: c.value, label: c.label })),
      },
    ],
    kind: () => null,
    draw(el) {
      // A translucent marker band: what's under it still reads.
      const w = num(el, "w", 20, 1, 150);
      const h = num(el, "h", 3, 1, 90);
      const tint = HIGHLIGHT_COLOURS.find((c) => c.value === str(el, "colour", "yellow"))?.css ?? HIGHLIGHT_COLOURS[0]!.css;
      return { prims: [{ t: "poly", pts: [[0, 0], [w, 0], [w, h], [0, h]], fill: true, tint }], terminals: [], body: { x: 0, y: 0, w, h } };
    },
  },
  {
    id: "callout",
    bench: "annotate",
    name: "Call-out",
    group: "Drawing",
    palette: true,
    params: [
      // Auto: numbered 1, 2, 3… on its sheet in the order they were placed, skipping numbers set by hand (6).
      { key: "auto", label: "Auto (numbered in order on the sheet)", type: "bool", default: true },
      { key: "n", label: "Number", type: "number", min: 1, max: 999, default: 1, when: (el) => el.params.auto === false, fixed: "Numbered automatically" },
    ],
    kind: () => null,
    draw(el, t) {
      const n = el.params.auto !== false && t?.name ? t.name : String(Math.round(num(el, "n", 1, 1, 999)));
      const r = Math.max(1.6, textWidth(n, TAG) / 2 + 0.6);
      return {
        prims: [circle(0, 0, r), text(0, (TAG * CAP_HEIGHT) / 2, n, TAG, "middle", "label")],
        terminals: [],
        body: { x: -r, y: -r, w: 2 * r, h: 2 * r },
      };
    },
  },
  {
    id: "polygon",
    bench: "annotate",
    name: "Polygon",
    group: "Drawing",
    // Drawn point by point with its own tool (the palette entry starts it).
    palette: true,
    params: [
      // Its corners after the first (the part's origin), in units.
      { key: "pts", label: "Points", type: "text", default: "10,0 10,6", hidden: true },
      { key: "dashed", label: "Dashed", type: "bool", default: false },
      { key: "heavy", label: "Heavy line", type: "bool", default: false },
    ],
    kind: () => null,
    draw(el) {
      const pts: Vec[] = [[0, 0], ...parsePoints(str(el, "pts", "10,0 10,6"))];
      const w = bool(el, "heavy", false) ? 0.35 / UNIT_MM : W;
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return {
        prims: [{ t: "line", pts: [...pts, pts[0]!], w, dash: bool(el, "dashed", false) }],
        terminals: [],
        body: { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y },
      };
    },
  },
  {
    id: "image",
    bench: "annotate",
    name: "Picture",
    group: "Drawing",
    // Placed from the list like any part (its file chosen in its properties), or pasted or dropped onto the sheet.
    palette: true,
    params: [
      { key: "asset", label: "Picture", type: "text", default: "", hidden: true },
      { key: "w", label: "Width (units)", type: "number", min: 2, max: 200, default: 30 },
      { key: "h", label: "Height (units)", type: "number", min: 2, max: 120, default: 20 },
    ],
    kind: () => null,
    draw(el) {
      // The picture itself is drawn from the project's assets; this is its frame.
      const w = num(el, "w", 30, 2, 200);
      const h = num(el, "h", 20, 2, 120);
      return { prims: [], terminals: [], body: { x: 0, y: 0, w, h } };
    },
  },
  {
    id: "supply",
    name: "Incoming supply",
    group: "Connection",
    palette: true,
    params: [
      {
        key: "system",
        label: "System",
        type: "select",
        default: "3ph-n",
        options: [
          { value: "3ph-n", label: "3-phase + neutral (L1 L2 L3 N)" },
          { value: "3ph", label: "3-phase (L1 L2 L3)" },
          { value: "1ph-n", label: "Single phase (L N)" },
          { value: "dc", label: "DC (+ -)" },
        ],
      },
      GIVES_PARAM,
    ],
    kind: () => null,
    draw(el) {
      // Where power comes in from outside: an arrow down into each conductor,
      // 3 units apart like switch poles. The label says what it is (415V 3PH+N 50Hz).
      const sys = str(el, "system", "3ph-n");
      const names = sys === "1ph-n" ? ["L", "N"] : sys === "3ph" ? ["L1", "L2", "L3"] : sys === "dc" ? ["+V", "-V"] : ["L1", "L2", "L3", "N"];
      const prims: Prim[] = [];
      const terminals: TerminalDef[] = [];
      // Text stays upright, so the names and label are placed for the way the
      // arrows point once turned and flipped: each name just beyond its arrow's
      // tail, the label clear of the names (above them, or below when the arrows
      // point up). Placed where they'll be drawn, so a flip doesn't move them
      // onto the arrows (v0.2.1 note 30).
      const tf = (v: Vec): Vec => rotate(el.flip ? [v[0], -v[1]] : v, el.rot);
      const d = tf([0, 1]);
      const way = d[1] > 0 ? "down" : d[1] < 0 ? "up" : d[0] < 0 ? "left" : "right";
      const gap = 0.4;
      const cap = (size: number) => size * CAP_HEIGHT;
      const placed = (at: Vec, s: string, size: number, anchor: Anchor, role: TextRole): Prim => ({ t: "text", at, text: s, size, anchor, role, placed: true });
      const tails: Vec[] = [];
      const heads: Vec[] = [];
      names.forEach((name, i) => {
        const x = i * 3;
        prims.push(line([x, -2.6], [x, 0]), { t: "poly", pts: [[x - 0.45, -1.5], [x + 0.45, -1.5], [x, -0.6]], fill: true });
        const [tx, ty] = tf([x, -2.6]);
        tails.push([tx, ty]);
        heads.push(tf([x, 0]));
        const mid = ty + cap(DETAIL) / 2;
        prims.push(
          way === "down"
            ? placed([tx, ty - gap], name, DETAIL, "middle", "term")
            : way === "up"
              ? placed([tx, ty + gap + cap(DETAIL)], name, DETAIL, "middle", "term")
              : way === "left"
                ? placed([tx + gap, mid], name, DETAIL, "start", "term")
                : placed([tx - gap, mid], name, DETAIL, "end", "term"),
        );
        terminals.push({ name, at: [x, 0], dir: "down" });
      });
      if (el.label) {
        // Centred on the arrows (65); with a width it wraps, growing away from the names.
        const xs = tails.map((t) => t[0]);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        const top = Math.min(...heads.map((h) => h[1]));
        const tailY = tails[0]![1];
        const label =
          way === "down"
            ? { ...placed([cx, tailY - 1.8], "{label}", TAG, "middle", "label"), up: true }
            : way === "up"
              ? placed([cx, tailY + 2 * gap + cap(DETAIL) + cap(TAG)], "{label}", TAG, "middle", "label")
              : way === "left"
                ? placed([heads[0]![0] - 0.6, top - 0.9], "{label}", TAG, "start", "label")
                : placed([heads[0]![0] + 0.6, top - 0.9], "{label}", TAG, "end", "label");
        prims.push(label);
      }
      return { prims, terminals, body: { x: -0.5, y: -2.6, w: (names.length - 1) * 3 + 1, h: 2.6 } };
    },
  },
  {
    id: "junction",
    name: "Junction",
    group: "Drawing",
    palette: false,
    params: [],
    kind: () => null,
    draw() {
      return {
        prims: [circle(0, 0, 0.35, true)],
        terminals: [{ name: "j", at: [0, 0], dir: "any" }],
        body: { x: 0, y: 0, w: 0, h: 0 },
      };
    },
  },
];

/** Distribution blocks and control rails: whole-unit taps, a name, a distribution. */
function barParams(): ParamDef[] {
  return [
    { key: "length", label: "Length (units)", type: "number", min: 2, max: 150, default: 20 },
    // Picked from the project's distribution list (Props); empty: Local, this bar alone.
    { key: "dist", label: "Distribution", type: "text", default: "", hidden: true },
    { key: "name", label: "Name", type: "text", default: "", when: (el) => !el.params.dist, fixed: "From its distribution", placeholder: "e.g. La" },
    { key: "bothEnds", label: "Name at both ends", type: "bool", default: false },
    // The same colours as a wire (T4); its wires take it when they're drawn.
    { key: "colour", label: "Core colour", type: "select", default: "", options: BUSBAR_COLOUR_OPTIONS },
    { key: "function", label: "Function", type: "text", default: "", placeholder: "from its distribution" },
  ];
}

function drawBar(el: Element, t: GeometryText | undefined, weight: number, tagged: boolean): Omit<Geometry, "bbox"> {
  const len = num(el, "length", 20, 2, 150);
  const name = t?.name ?? str(el, "name", "");
  const label = t?.label ?? el.label;
  return {
    prims: [
      heavy(weight, [0, 0], [len, 0]),
      // The name at the left end and the tag just before it, on the bar's line, clear
      // of the wires tapping it and of bars stacked above and below.
      ...(name ? [text(-0.8, 0.45, name, TAG, "end", "note")] : []),
      ...(name && el.params.bothEnds === true ? [text(len + 0.8, 0.45, name, TAG, "start", "note")] : []),
      ...(tagged ? [text(name ? -1.6 - textWidth(name, TAG) : -0.8, 0.45, "{tag}", TAG, "end", "tag")] : []),
      ...(label ? [text(len / 2, 2.2, "{label}", TAG, "middle", "label")] : []),
    ],
    terminals: railTerminals(el),
    body: { x: 0, y: -0.3, w: len, h: 0.6 },
  };
}

/** A distribution block or a control rail: both join everything on them (v0.3 §1). */
export function isBar(el: { symbol: string } | undefined): boolean {
  return el?.symbol === "busbar" || el?.symbol === "rail";
}

/** Rails and busbars can be tapped at any whole unit along their length. */
function railTerminals(el: Element): TerminalDef[] {
  const len = num(el, "length", 20, 2, 150);
  const out: TerminalDef[] = [];
  for (let i = 0; i <= len; i++) out.push({ name: String(i), at: [i, 0], dir: "any" });
  return out;
}

/**
 * Auxiliary contacts of an isolator or contactor, after the main poles.
 * Numbered in sequence with the usual function digits: NO x3/x4, NC x1/x2
 * (e.g. 13/14, 23/24, 31/32).
 */
export function isolatorAux(el: Element): { a: string; b: string; nc: boolean }[] {
  const no = num(el, "aux", 0, 0, 3);
  const nc = num(el, "auxNc", 0, 0, 3);
  const out: { a: string; b: string; nc: boolean }[] = [];
  for (let i = 0; i < no + nc; i++) {
    const isNc = i >= no;
    out.push({ a: `${i + 1}${isNc ? 1 : 3}`, b: `${i + 1}${isNc ? 2 : 4}`, nc: isNc });
  }
  return out;
}

/**
 * A plant view's pins as its params carry them (ops.ts plantPinsParam):
 * number, as printed, id, label under its run; a module's also its point
 * and that point's job label.
 */
export function parsePlantPins(s: string): { pin: string; printed: string; id: string; label: string; point: string; job: string }[] {
  try {
    const v = JSON.parse(s || "[]");
    if (!Array.isArray(v)) return [];
    return v
      .filter((r): r is string[] => Array.isArray(r) && typeof r[0] === "string")
      .map((r) => ({
        pin: r[0]!,
        printed: String(r[1] ?? r[0]),
        id: String(r[2] ?? ""),
        label: String(r[3] ?? ""),
        point: String(r[4] ?? ""),
        job: String(r[5] ?? ""),
      }));
  } catch {
    return [];
  }
}

/** One box of a controller map: a module in rail order, or a spare slot. */
export interface MapEntry {
  tag: string;
  address: number;
  maker: string;
  model: string;
  type: string;
  /** Every view's sheet-column. */
  where: string;
  spare?: boolean;
}

/**
 * A controller map (controller.md §5): one box per module in rail order,
 * each with its tag and bus address (in a circle), maker, model, type and
 * where it's drawn; spare slots dashed. Wraps onto more rows to fit.
 */
export function controllerMap(entries: MapEntry[], width: number): { prims: Prim[]; w: number; h: number } {
  if (!entries.length) return { prims: [text(0, 2, "CONTROLLER MAP: no modules yet (Controllers…)", TAG, "start", "label")], w: 40, h: 3 };
  const lh = DETAIL * 1.45;
  const pad = 0.8;
  const r = 1.1;
  const lines = (e: MapEntry) => (e.spare ? ["SPARE", "I/O"] : [e.maker.toUpperCase(), e.model.toUpperCase(), e.type, e.where]);
  const boxW = Math.ceil(
    Math.max(
      14,
      ...entries.map((e) => Math.max(textWidth(e.spare ? "" : e.tag, TAG) + 2 * r + 1.5, ...lines(e).map((l) => textWidth(l, DETAIL)))) ,
    ) + 2 * pad,
  );
  const boxH = Math.ceil(pad * 2 + TAG * 1.4 + 4 * lh);
  const per = Math.max(1, Math.floor((width + 0.5) / boxW));
  const prims: Prim[] = [];
  entries.forEach((e, i) => {
    const x = (i % per) * boxW;
    const y = Math.floor(i / per) * (boxH + 1);
    const pts: Vec[] = [[x, y], [x + boxW, y], [x + boxW, y + boxH], [x, y + boxH], [x, y]];
    prims.push(e.spare ? { t: "line", pts, dash: true, w: W } : line(...pts));
    const ty = y + pad + TAG * CAP_HEIGHT;
    if (!e.spare) prims.push(text(x + pad, ty, e.tag, TAG, "start", "tag"));
    // The bus address, circled, top right.
    const cx = x + boxW - pad - r;
    const cy = y + pad + r;
    prims.push(circle(cx, cy, r), text(cx, cy + (DETAIL * CAP_HEIGHT) / 2, String(e.address), DETAIL, "middle", "note"));
    lines(e).forEach((l, k) => {
      if (l) prims.push(text(x + pad, y + pad + TAG * 1.4 + (k + 1) * lh - 0.3, l, DETAIL, "start", "note"));
    });
  });
  const rows = Math.ceil(entries.length / per);
  return { prims, w: Math.min(entries.length, per) * boxW, h: rows * boxH + (rows - 1) };
}

/** Module view sizes, grid units. */
export const MODULE = {
  /** Room for the channel names (AO1) over the id boxes. */
  groups: 2.5,
  /** Room for the heading (ANALOGUE OUTPUTS) over the channel names. */
  heading: 2.5,
  /** Job labels start this far under the terminals, along the wire. */
  labelGap: 0.8,
};

/**
 * A module view (controller.md §5): its title row above the box; inside,
 * the heading, then per channel its name, pin ids and pin numbers, with the
 * terminals along the bottom edge; each point's job label under them, along
 * its wire. A view that leaves out channels has a break at that edge.
 */
export function moduleViewLayout(el: Element) {
  const base = plantViewLayout(el);
  const all = str(el, "terms", "").split(",").filter(Boolean);
  const shown = base.terms.map((t) => t.id);
  const cutLeft = !!all.length && !!shown.length && shown[0] !== all[0];
  const cutRight = !!all.length && !!shown.length && shown[shown.length - 1] !== all[all.length - 1];
  // Channel names wrap like a plant's group names, at their own size; their band grows with the tallest (v0.4.x F4).
  const chLines = base.groups.map((g) => wrapText(g.name, DETAIL, Math.max(g.x1 - g.x0 + 2, GROUP_MIN)));
  const groupsBand = Math.max(MODULE.groups, Math.ceil((0.7 + chLines.reduce((a, l) => Math.max(a, l.length), 1) * DETAIL * LINE + 0.4) * 2) / 2);
  const h = base.termH + base.idH + groupsBand + MODULE.heading;
  // Job labels, one per point, between (or beside) its shown pins.
  const pins = parsePlantPins(str(el, "ppins", ""));
  const xOf = new Map(base.terms.map((t) => [t.id, t.x]));
  const labels: { x: number; text: string }[] = [];
  const seen = new Set<string>();
  for (const p of pins) {
    if (!p.point || !p.job || seen.has(p.point)) continue;
    const xs = pins.filter((q) => q.point === p.point && xOf.has(q.pin)).map((q) => xOf.get(q.pin)!);
    if (!xs.length) continue;
    seen.add(p.point);
    const a = Math.min(...xs);
    // Beside the point's first wire, in the gap before it (between channels), reading along it.
    labels.push({ x: a - 0.55, text: p.job.toUpperCase() });
  }
  return { ...base, h, cutLeft, cutRight, labels, chLines };
}

function drawModuleView(el: Element, t?: GeometryText): { prims: Prim[]; terminals: TerminalDef[]; body: Rect } {
  const lay = moduleViewLayout(el);
  const { left, right, h } = lay;
  let info: { heading?: string } = {};
  try {
    info = JSON.parse(str(el, "pmod", "{}")) as { heading?: string };
  } catch {
    /* drawn without a heading */
  }
  const zig = (x: number): Vec[] => {
    const pts: Vec[] = [[x, -h]];
    for (let i = 0, y = -h + 0.4; y < 0; i++, y += 0.8) pts.push([x + (i % 2 ? 0.4 : -0.4), y]);
    pts.push([x, 0]);
    return pts;
  };
  const prims: Prim[] = [line([left, -h], [right, -h]), line([left, 0], [right, 0])];
  prims.push(lay.cutLeft ? line(...zig(left)) : line([left, -h], [left, 0]));
  prims.push(lay.cutRight ? line(...zig(right)) : line([right, -h], [right, 0]));
  // Title row over the box: tag, type, maker and model, controller (or where it
  // carries on from), wrapped at its separators to the view's width, the band
  // above growing a line at a time (v0.4.x F5).
  const title = t?.xref ? wrapTitle(t.xref, TAG, right - left) : ["{xref}"];
  if (title.length < 2) prims.push(text(left, -h - 0.7, "{xref}", TAG, "start", "tag"));
  else title.forEach((l, i) => prims.push(text(left, -h - 0.7 - (title.length - 1 - i) * TAG * LINE, l, TAG, "start", "tag")));
  // Heading, centred under the top edge.
  if (info.heading) prims.push(text((left + right) / 2, -h + MODULE.heading - 0.6, info.heading, PLANT.group, "middle", "note"));
  // Channel names over the id boxes.
  const top = -(lay.termH + lay.idH);
  lay.groups.forEach((g, gi) => {
    const ls = lay.chLines[gi] ?? [g.name];
    ls.forEach((l, i) => prims.push(text((g.x0 + g.x1) / 2, top - 0.7 - (ls.length - 1 - i) * DETAIL * LINE, l, DETAIL, "middle", "note")));
  });
  // Terminal boxes along the bottom inside edge: numbers at the bottom, ids above them.
  const half = PLANT.pitch / 2;
  for (const tm of lay.terms) {
    prims.push(rect(tm.x - half, -lay.termH, PLANT.pitch, lay.termH), {
      t: "text",
      at: [tm.x + TAG * CAP_HEIGHT * 0.5, -lay.termH / 2],
      text: tm.name,
      size: TAG,
      anchor: "middle",
      role: "term",
      vertical: true,
    });
    if (lay.idH && tm.pinId) {
      prims.push(rect(tm.x - half, top, PLANT.pitch, lay.idH), {
        t: "text",
        at: [tm.x + DETAIL * CAP_HEIGHT * 0.5, top + lay.idH / 2],
        text: tm.pinId,
        size: DETAIL,
        anchor: "middle",
        role: "note",
        vertical: true,
      });
    }
  }
  // What each point does on this job, along its wire under the terminals.
  for (const l of lay.labels) {
    prims.push({
      t: "text",
      at: [l.x + DETAIL * CAP_HEIGHT * 0.5, MODULE.labelGap],
      text: l.text,
      size: DETAIL,
      anchor: "end",
      role: "note",
      vertical: true,
    });
  }
  void t;
  const terminals: TerminalDef[] = lay.terms.map((tm) => ({ name: tm.id, at: [tm.x, 0], dir: "down" as Dir }));
  return { prims, terminals, body: { x: left, y: -h, w: right - left, h } };
}

/** Plant view sizes, grid units. */
/**
 * A tag broken to fit a width (v0.4.x F4): only at a hyphen (kept at the end
 * of its line), and only when the whole tag is wider than the width.
 */
export function wrapTag(tag: string, size: number, width: number): string[] {
  if (textWidth(tag, size) <= width) return [tag];
  const parts = tag.split(/(?<=-)/);
  const out: string[] = [];
  let cur = "";
  for (const p of parts) {
    if (cur && textWidth(cur + p, size) > width) {
      out.push(cur);
      cur = p;
    } else cur += p;
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * A module view's title row wrapped to a width (v0.4.x F5): at its " · "
 * separators, the separator ending the line; a part wider than the width
 * by itself keeps a line of its own.
 */
export function wrapTitle(title: string, size: number, width: number): string[] {
  if (textWidth(title, size) <= width) return [title];
  const parts = title.split(" · ");
  const out: string[] = [];
  let cur = "";
  for (const p of parts) {
    const next = cur ? `${cur} · ${p}` : p;
    if (cur && textWidth(next, size) > width) {
      out.push(`${cur} ·`);
      cur = p;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

/** Group names never wrap narrower than this (v0.4.x F4). */
const GROUP_MIN = 8;
/** Line spacing of wrapped text under a view, as a share of its size. */
const LINE = 1.25;

export const PLANT = {
  /** Terminal boxes along the top inside edge: 2 units apart (a column each), like terminal block cells (v0.3 §2). */
  pitch: 2,
  /** Terminal boxes are at least this tall (as tall as a terminal block cell); a long name makes them taller. */
  termH: 3,
  /** The name every terminal box is tall enough for, at least: 5 characters. */
  minName: "BAT+5",
  /** Room under the boxes for the group names. */
  below: 3,
  /** Pin ids, in a row of boxes under the numbers, as tall as their longest id. */
  idH: 3,
  /** Group names, in capitals. */
  group: textUnits("tag"),
};

/**
 * Where a plant view's terminals go, as on a maker's drawing: a row of
 * small boxes 3 units apart along the inside top edge, each group's name
 * under its boxes, a gap between groups. The box is as wide as its
 * terminals need.
 */
export function plantViewLayout(el: Element): {
  terms: { id: string; name: string; pinId: string; x: number }[];
  /** Each group's name, wrapped to its width (v0.4.x F4), and where its terminals run. */
  groups: { name: string; lines: string[]; x0: number; x1: number }[];
  left: number;
  right: number;
  h: number;
  /** Height of the number boxes; the id boxes (if any) run from there to termH + idH. */
  termH: number;
  idH: number;
  partial: boolean;
} {
  const all = str(el, "terms", "").split(",").filter(Boolean);
  const showSet = new Set(str(el, "show", "").split(",").filter(Boolean));
  const shown = all.filter((t) => showSet.has(t));
  const info = new Map(parsePlantPins(str(el, "ppins", "")).map((p) => [p.pin, p]));
  // Runs of shown pins under the same label (their group, else their point).
  const runs: { name: string; terms: string[] }[] = [];
  for (const t of shown) {
    const name = info.get(t)?.label ?? "";
    const last = runs[runs.length - 1];
    if (last && last.name === name) last.terms.push(t);
    else runs.push({ name, terms: [t] });
  }
  const P = PLANT.pitch;
  // A group's name wraps to its group's width plus a unit each side, never less than 8 (v0.4.x F4).
  const wrapName = (name: string, span: number) => (name ? wrapText(name.toUpperCase(), PLANT.group, Math.max(span + 2, GROUP_MIN)) : []);
  const linesW = (lines: string[]) => Math.max(0, ...lines.map((l) => textWidth(l, PLANT.group)));
  const terms: { id: string; name: string; pinId: string; x: number }[] = [];
  const groups: { name: string; lines: string[]; x0: number; x1: number }[] = [];
  let prevRight = -Infinity; // right edge of whatever the previous run drew (boxes or name)
  for (const [i, r] of runs.entries()) {
    const span = (r.terms.length - 1) * P;
    const lines = wrapName(r.name, span);
    const half = Math.max(span + P, linesW(lines)) / 2;
    // Centre far enough right to clear the last run by a unit and a half.
    let x0 = 0;
    if (i > 0) x0 = Math.ceil(prevRight + 1.5 + half - span / 2);
    const centre = x0 + span / 2;
    r.terms.forEach((t, j) => terms.push({ id: t, name: info.get(t)?.printed ?? t, pinId: info.get(t)?.id ?? "", x: x0 + j * P }));
    if (r.name) groups.push({ name: r.name.toUpperCase(), lines, x0, x1: x0 + span });
    prevRight = centre + half;
  }
  let lastX = terms.length ? terms[terms.length - 1]!.x : 0;
  const nameEdge = (g: { lines: string[]; x0: number; x1: number }, side: -1 | 1) => (g.x0 + g.x1) / 2 + (side * linesW(g.lines)) / 2;
  const left = Math.min(-1.5, ...groups.map((g) => nameEdge(g, -1) - 1));
  let right = Math.max(lastX + 1.5, left + 6, ...groups.map((g) => nameEdge(g, 1) + 1));
  // A chosen width (v0.4.x T2): wider than it needs, its groups spread with equal gaps between
  // them, the first and last a margin in from the ends; within a group the pitch stays 2.
  const span = num(el, "span", 0, 0, 150);
  if (span > right - left && runs.length) {
    const extents = runs.map((r) => {
      const sp = (r.terms.length - 1) * P;
      const ls = r.name ? wrapName(r.name, sp) : [];
      return { sp, w: Math.max(sp + P, linesW(ls)) };
    });
    const margin = 1.5 - P / 2;
    const used = extents.reduce((a, x) => a + x.w, 0);
    const gap = runs.length > 1 ? (span - 2 * margin - used) / (runs.length - 1) : 0;
    let cursor = left + margin + (runs.length > 1 ? 0 : (span - 2 * margin - used) / 2);
    let k = 0;
    const groupOf = new Map(groups.map((g) => [g.x0, g]));
    runs.forEach((r, i) => {
      const e = extents[i]!;
      const x0 = Math.round(cursor + (e.w - e.sp) / 2);
      const old = terms[k]!.x;
      const g = groupOf.get(old);
      if (g) {
        g.x0 = x0;
        g.x1 = x0 + e.sp;
      }
      for (let j = 0; j < r.terms.length; j++) terms[k + j]!.x = x0 + j * P;
      k += r.terms.length;
      cursor += e.w + gap;
    });
    lastX = terms[terms.length - 1]!.x;
    right = left + span;
  }
  // Boxes tall enough for the longest name written up them, in half-unit steps.
  const tall = (names: string[], min: number, size: number) => Math.max(min, Math.ceil((Math.max(0, ...names.map((n) => textWidth(n, size))) + 0.4) * 2) / 2);
  // Every plant's boxes are at least tall enough for a 5-character name, so plant views line up (v0.2.1 note 36).
  // Pin numbers are at the tag size (v0.3 §2); ids stay at the detail size.
  const termH = tall([...terms.map((t) => t.name), PLANT.minName], PLANT.termH, TAG);
  const ids = terms.map((t) => t.pinId).filter(Boolean);
  const idH = ids.length ? tall(ids, PLANT.idH, DETAIL) : 0;
  // Room under the boxes for the tallest wrapped group name.
  const nameLines = Math.max(1, ...groups.map((g) => g.lines.length));
  const below = Math.max(PLANT.below, Math.ceil((1.9 + (nameLines - 1) * PLANT.group * LINE + 1.1) * 2) / 2);
  return { terms, groups, left, right, h: termH + idH + below, termH, idH, partial: shown.length < all.length };
}

/** Does a parameter apply to this element as it's set now? */
export function paramApplies(def: ParamDef, el: Element): boolean {
  return !def.when || def.when(el);
}

const BY_ID = new Map(SYMBOLS.map((s) => [s.id, s]));

/** Which workbench an element is edited in. */
export function benchOf(el: Pick<Element, "symbol">): "draft" | "annotate" {
  return getSymbol(el.symbol)?.bench ?? "draft";
}

export function listSymbols(): SymbolDef[] {
  return SYMBOLS;
}

export function getSymbol(id: string): SymbolDef | undefined {
  return BY_ID.get(id);
}

export function requireSymbol(id: string): SymbolDef {
  const s = BY_ID.get(id);
  if (!s) throw new Error(`Unknown symbol "${id}"`);
  return s;
}

/** Default params for a symbol. */
export function defaultParams(symbolId: string): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  for (const p of requireSymbol(symbolId).params) out[p.key] = p.default;
  return out;
}

// ---------------------------------------------------------------------------
// Geometry

/** Flip top to bottom (y → -y), before rotating. Text stays upright and reads the same way. */
function flipPrim(p: Prim): Prim {
  const f = (v: Vec): Vec => [v[0], -v[1]];
  switch (p.t) {
    case "line":
    case "poly":
      return { ...p, pts: p.pts.map(f) };
    case "circle":
    case "ellipse":
      return { ...p, c: f(p.c) };
    case "arc":
      return { ...p, from: f(p.from), to: f(p.to), sweep: p.sweep ? 0 : 1 };
    case "text": {
      if (p.placed) return p;
      // Text is placed by its baseline: keep it on the same side of what it labels.
      if (p.vertical) return { ...p, at: f(p.at) };
      const lift = p.size * CAP_HEIGHT;
      return { ...p, at: [p.at[0], -p.at[1] + lift] };
    }
  }
}
const flipDir = (d: Dir): Dir => (d === "up" ? "down" : d === "down" ? "up" : d);
const flipVec = (v: Vec): Vec => [v[0], -v[1]];
const flipRect = (r: Rect): Rect => ({ x: r.x, y: -r.y - r.h, w: r.w, h: r.h });

function rotatePrim(p: Prim, rot: Rotation): Prim {
  if (rot === 0) return p;
  switch (p.t) {
    case "line":
    case "poly":
      return { ...p, pts: p.pts.map((v) => rotate(v, rot)) };
    case "circle":
      return { ...p, c: rotate(p.c, rot) };
    case "ellipse":
      return rot === 90 || rot === 270 ? { ...p, c: rotate(p.c, rot), rx: p.ry, ry: p.rx } : { ...p, c: rotate(p.c, rot) };
    case "arc":
      return { ...p, from: rotate(p.from, rot), to: rotate(p.to, rot) };
    case "text": {
      if (p.placed) return p;
      // Text stays upright. Text beside a vertical symbol ends up above or
      // below it once turned, so centre it there.
      let at = rotate(p.at, rot);
      let anchor = p.anchor;
      if (rot === 180) anchor = anchor === "start" ? "end" : anchor === "end" ? "start" : anchor;
      if (p.vertical && (rot === 90 || rot === 270)) return { ...p, at, vertical: false, anchor: "middle" };
      if (p.vertical) return { ...p, at };
      if (rot === 90 || rot === 270) {
        anchor = "middle";
        // Terminal numbers sit just above a horizontal lead, not on it.
        if (p.role === "term") at = [at[0], Math.min(at[1], 0) - 0.45];
      }
      return { ...p, at, anchor };
    }
  }
}

/** Where a line of text sits: its width from the font's measures, cap height up from its baseline. */
export function textBounds(p: Extract<Prim, { t: "text" }>): Rect {
  const w = textWidth(p.text, p.size);
  const h = p.size * CAP_HEIGHT;
  const k = p.anchor === "middle" ? 0.5 : p.anchor === "end" ? 1 : 0;
  // Vertical text reads up the page: its length runs upwards from the anchor.
  if (p.vertical) return { x: p.at[0] - h, y: p.at[1] - w * (1 - k), w: h, h: w };
  return { x: p.at[0] - w * k, y: p.at[1] - h, w, h };
}

function primBounds(p: Prim): Rect | null {
  const fromPts = (pts: Vec[]): Rect => {
    const xs = pts.map((v) => v[0]);
    const ys = pts.map((v) => v[1]);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  };
  switch (p.t) {
    case "line":
    case "poly":
      return fromPts(p.pts);
    case "circle":
      return { x: p.c[0] - p.r, y: p.c[1] - p.r, w: 2 * p.r, h: 2 * p.r };
    case "ellipse":
      return { x: p.c[0] - p.rx, y: p.c[1] - p.ry, w: 2 * p.rx, h: 2 * p.ry };
    case "arc": {
      const r = fromPts([p.from, p.to]);
      return { x: r.x - p.r / 2, y: r.y - p.r / 2, w: r.w + p.r, h: r.h + p.r };
    }
    case "text":
      return null; // text is not part of the hit area
  }
}

export interface GeometryText {
  /** Tag as drawn. */
  tag: string;
  /** Cross-reference under the tag (e.g. where the coil is). */
  xref?: string;
  /** Label with any fields filled in. Defaults to the element's label. */
  label?: string;
  /** A link arrow: the number of the wire it carries (v0.3 §2). */
  wire?: string;
  /** A busbar's name: its distribution's, or its own when it's local. */
  name?: string;
  /** A contact timed by its timer coil: the coil's function (on, off, on-off…), so the delay mark is drawn. */
  timed?: string;
  /** A controller map's boxes. */
  modules?: MapEntry[];
  /** A network diagram's networks and devices. */
  network?: NetworkData;
  /** Revision list rows (revision table). */
  rows?: string[][];
  /** One of each part used (symbol legend). */
  legend?: LegendEntry[];
}

/**
 * Element geometry relative to its origin, already rotated, with the tag,
 * cross-reference and label placeholders filled in.
 */
/** How wide laid-out text actually is (its longest line). */
function wrappedWidth(prims: Prim[]): number {
  let w = 0;
  for (const p of prims) if (p.t === "text") w = Math.max(w, p.at[0] + textWidth(p.text, p.size));
  return w;
}

export function localGeometry(el: Element, texts: string | GeometryText): Geometry {
  const t: GeometryText = typeof texts === "string" ? { tag: texts } : texts;
  const def = requireSymbol(el.symbol);
  const d = def.draw(el, t);
  // With no cross-reference, close up the gap it would have left.
  let raw = d.prims;
  const xrefPrim = raw.find((p) => p.t === "text" && p.text === "{xref}");
  if (xrefPrim && xrefPrim.t === "text" && !t.xref) {
    const y0 = xrefPrim.at[1];
    raw = raw
      .filter((p) => p !== xrefPrim)
      .map((p) => (p.t === "text" && p.role === "label" && p.at[1] > y0 ? { ...p, at: [p.at[0], p.at[1] - 1.25] as Vec } : p));
  }
  const labelLines = (t.label ?? el.label).split("\n");
  const fill = (s: string) => {
    if (s === "{tag}") return t.tag;
    if (s === "{xref}") return t.xref ?? "";
    if (s === "{label}") return t.label ?? el.label;
    const m = /^\{line(\d+)\}$/.exec(s);
    if (m) return labelLines[Number(m[1])] ?? "";
    return s;
  };
  const rotated = raw.map((p) => rotatePrim(el.flip ? flipPrim(p) : p, el.rot));
  const tagAt = rotated.find((p) => p.t === "text" && p.text === "{tag}");
  const prims = rotated.flatMap((q): Prim[] => {
    if (q.t !== "text") return [q];
    const filled = fill(q.text);
    // A label written on several lines reads down from where its first line
    // goes; a label drawn above the tag grows upwards instead, clear of it.
    // A label with a width wraps to it (28, 65).
    const width = typeof el.params.labelWidth === "number" && el.params.labelWidth > 0 ? el.params.labelWidth : 0;
    if (q.text === "{label}" && (filled.includes("\n") || (width && textWidth(filled, q.size) > width))) {
      const lines = width ? wrapText(filled, q.size, width) : filled.split("\n");
      const up = q.up || (!!tagAt && tagAt.t === "text" && q.at[1] < tagAt.at[1]);
      const lh = q.size * 1.25;
      return lines.map((line, i) => ({ ...q, at: [q.at[0], q.at[1] + (up ? i - (lines.length - 1) : i) * lh] as Vec, text: line }));
    }
    return [{ ...q, text: filled }];
  });
  // The label block moved by hand (v0.4.x T14): tags, labels and what's marked part of it.
  if (el.labelAt && (el.labelAt[0] || el.labelAt[1])) {
    const [dx, dy] = el.labelAt;
    for (let i = 0; i < prims.length; i++) {
      const q = prims[i]!;
      if (q.t === "text" && inLabelBlock(q)) prims[i] = { ...q, at: [q.at[0] + dx, q.at[1] + dy] };
    }
  }
  const terminals = d.terminals.map((t) => ({
    ...t,
    at: rotate(el.flip ? flipVec(t.at) : t.at, el.rot),
    dir: rotateDir(el.flip ? flipDir(t.dir) : t.dir, el.rot),
  }));
  const body = rotateRect(el.flip ? flipRect(d.body) : d.body, el.rot);
  let bbox = body;
  for (const p of prims) {
    const b = primBounds(p);
    if (b) bbox = unionRect(bbox, b);
  }
  // A plant view's text under its box is part of its extent (v0.4.x F4), so the router and checks see it.
  if (el.symbol === "plant-view" && !el.params.pmod) for (const p of prims) if (p.t === "text" && p.block && p.text) bbox = unionRect(bbox, textBounds(p));
  return { prims, terminals, body, bbox };
}

/** Is a text prim part of its element's label block (v0.4.x T14)? Tags and labels, and what's marked. */
export const inLabelBlock = (p: Extract<Prim, { t: "text" }>) => p.role === "tag" || p.role === "label" || p.block === true;

/** An element's label block on the sheet: the box round its tags, labels and ratings, or null if it has none. */
export function labelBlockRect(el: Element, g: Geometry): Rect | null {
  let r: Rect | null = null;
  for (const p of g.prims) {
    if (p.t !== "text" || !inLabelBlock(p) || !p.text) continue;
    const b = textBounds(p);
    if (b) r = r ? unionRect(r, b) : b;
  }
  return r ? { x: r.x + el.pos[0], y: r.y + el.pos[1], w: r.w, h: r.h } : null;
}

/** Terminal names of an element, in drawing order. */
export function terminalNames(el: Element): string[] {
  return requireSymbol(el.symbol).draw(el).terminals.map((t) => t.name);
}

/** World position of a terminal, or null if the element has no such terminal. */
export function terminalPoint(el: Element, name: string): Vec | null {
  const t = requireSymbol(el.symbol)
    .draw(el)
    .terminals.find((x) => x.name === name);
  if (!t) return null;
  const [x, y] = rotate(el.flip ? flipVec(t.at) : t.at, el.rot);
  return [el.pos[0] + x, el.pos[1] + y];
}

export function terminalDir(el: Element, name: string): Dir {
  const t = requireSymbol(el.symbol)
    .draw(el)
    .terminals.find((x) => x.name === name);
  return t ? rotateDir(el.flip ? flipDir(t.dir) : t.dir, el.rot) : "any";
}

/**
 * The terminals on the other side of the same pole of an in-line part
 * (fuse, contact, isolator pole, terminal, push button, selector), for a
 * wire drawn from one side to take the colour of the wire on the other (T5).
 */
export function poleMates(el: Element, terminal: string): string[] {
  const pairs: [string, string][] = [];
  const poles = (n: number) => {
    for (let i = 0; i < n; i++) pairs.push([String(2 * i + 1), String(2 * i + 2)]);
  };
  switch (el.symbol) {
    case "contact-no":
      pairs.push(["13", "14"]);
      break;
    case "contact-nc":
      pairs.push(["21", "22"]);
      break;
    case "contact-co":
      pairs.push(["11", "14"], ["11", "12"]);
      break;
    case "pushbutton":
      pairs.push(["13", "14"], ["21", "22"]);
      break;
    case "selector":
      selectorPoles(el).forEach((p, i) => {
        const k = i + 1;
        if (p.kind === "co") pairs.push([`${k}1`, `${k}4`], [`${k}1`, `${k}2`]);
        else if (p.kind === "nc") pairs.push([`${k}1`, `${k}2`]);
        else pairs.push([`${k}3`, `${k}4`]);
      });
      break;
    case "isolator":
      poles(typeof el.params.poles === "number" ? el.params.poles : 3);
      for (const a of isolatorAux(el)) pairs.push([a.a, a.b]);
      break;
    case "fuse":
      poles(typeof el.params.poles === "number" ? el.params.poles : 1);
      break;
    case "terminal":
      pairs.push(["1", "2"]);
      break;
  }
  return pairs.flatMap(([a, b]) => (a === terminal ? [b] : b === terminal ? [a] : []));
}

// ---------------------------------------------------------------------------
// Terminal groups on any side (v0.4.x T15)

export type ViewSide = "top" | "bottom" | "left" | "right";
const SIDES: ViewSide[] = ["top", "bottom", "left", "right"];

/** A view's side for its terminals (`params.side`; default plant top, module bottom) and any group's own (`params.sides`, JSON). */
export function viewSides(el: Element): { view: ViewSide; groups: Record<string, ViewSide> } {
  const module = !!str(el, "pmod", "");
  const v = str(el, "side", "");
  const view = SIDES.includes(v as ViewSide) ? (v as ViewSide) : module ? "bottom" : "top";
  let groups: Record<string, ViewSide> = {};
  try {
    const raw = JSON.parse(str(el, "sides", "{}")) as Record<string, string>;
    groups = Object.fromEntries(Object.entries(raw).filter(([, s]) => SIDES.includes(s as ViewSide))) as Record<string, ViewSide>;
  } catch {
    /* none */
  }
  return { view, groups };
}

/** Does the view leave the usual layout (plant top, module bottom, every group with it)? */
export function usesSides(el: Element): boolean {
  const s = viewSides(el);
  const usual = str(el, "pmod", "") ? "bottom" : "top";
  return s.view !== usual || Object.values(s.groups).some((x) => x !== usual);
}

interface SideRun {
  name: string;
  terms: string[];
  side: ViewSide;
  lines: string[];
  /** Along its side: where its first pin is. */
  at: number;
}

/**
 * A view with its groups of terminals on chosen sides (v0.4.x T15). The
 * origin is the box's top-left corner. Along the top and bottom the
 * terminals are boxes 2 apart with their numbers reading up, as usual; down
 * the left and right they stack 2 apart with their numbers reading across,
 * and the box grows with them. The text block (tag and lines, or a module's
 * title row) sits on the side opposite the view's own, below for left and right.
 */
export function sideViewLayout(el: Element) {
  const module = !!str(el, "pmod", "");
  const { view, groups: perGroup } = viewSides(el);
  const P = PLANT.pitch;
  const all = str(el, "terms", "").split(",").filter(Boolean);
  const showSet = new Set(str(el, "show", "").split(",").filter(Boolean));
  const shown = all.filter((t) => showSet.has(t));
  const info = new Map(parsePlantPins(str(el, "ppins", "")).map((p) => [p.pin, p]));
  const nameSize = module ? DETAIL : PLANT.group;
  const lh = nameSize * LINE;
  const runs: SideRun[] = [];
  for (const t of shown) {
    const name = info.get(t)?.label ?? "";
    const last = runs[runs.length - 1];
    if (last && last.name === name) last.terms.push(t);
    else runs.push({ name, terms: [t], side: view, lines: [], at: 0 });
  }
  for (const r of runs) {
    r.side = perGroup[r.name] ?? view;
    const sp = (r.terms.length - 1) * P;
    const across = r.side === "top" || r.side === "bottom";
    r.lines = r.name ? wrapText(r.name.toUpperCase(), nameSize, across ? Math.max(sp + 2, GROUP_MIN) : 12) : [];
  }
  const printed = (t: string) => info.get(t)?.printed ?? t;
  const pinId = (t: string) => info.get(t)?.id ?? "";
  const tall = (names: string[], min: number, size: number) => Math.max(min, Math.ceil((Math.max(0, ...names.map((n) => textWidth(n, size))) + 0.4) * 2) / 2);
  const sideRuns = (s: ViewSide) => runs.filter((r) => r.side === s);
  const extentOf = (r: SideRun) => {
    const sp = (r.terms.length - 1) * P;
    const across = r.side === "top" || r.side === "bottom";
    return Math.max(sp + P, across ? Math.max(0, ...r.lines.map((l) => textWidth(l, nameSize))) : r.lines.length * lh);
  };
  // Along each side: its runs' extents, 1.5 apart, 0.5 in from the ends.
  const lengthOf = (s: ViewSide) => {
    const rs = sideRuns(s);
    return rs.length ? rs.reduce((a, r) => a + extentOf(r), 0) + 1.5 * (rs.length - 1) + 1 : 0;
  };
  // Depth into the box from each side.
  const termsOn = (s: ViewSide) => sideRuns(s).flatMap((r) => r.terms);
  const termH = tall([...runs.flatMap((r) => r.terms.map(printed)), PLANT.minName], PLANT.termH, TAG);
  const ids = runs.flatMap((r) => r.terms.map(pinId)).filter(Boolean);
  const idH = ids.length ? tall(ids, PLANT.idH, DETAIL) : 0;
  const nameBand = (s: ViewSide) => {
    const n = Math.max(0, ...sideRuns(s).map((r) => r.lines.length));
    return n ? Math.ceil((1.9 + (n - 1) * lh + 1.1) * 2) / 2 : 1;
  };
  const termW = (s: ViewSide) => Math.ceil((Math.max(0, ...termsOn(s).map((t) => textWidth(printed(t), TAG))) + 0.8) * 2) / 2;
  const idW = (s: ViewSide) => {
    const xs = termsOn(s).map(pinId).filter(Boolean);
    return xs.length ? Math.ceil((Math.max(...xs.map((x) => textWidth(x, DETAIL))) + 0.6) * 2) / 2 : 0;
  };
  const nameW = (s: ViewSide) => {
    const w = Math.max(0, ...sideRuns(s).flatMap((r) => r.lines.map((l) => textWidth(l, nameSize))));
    return w ? w + 1.6 : 0.5;
  };
  const depth = (s: ViewSide) => (!sideRuns(s).length ? 0 : s === "top" || s === "bottom" ? termH + idH + nameBand(s) : Math.max(3, termW(s)) + idW(s) + nameW(s));
  const heading = module ? MODULE.heading : 0;
  const span = num(el, "span", 0, 0, 150);
  let W = Math.ceil(Math.max(lengthOf("top"), lengthOf("bottom"), depth("left") + depth("right") + 4, 6));
  if (span > W) W = Math.round(span);
  const H = Math.ceil(Math.max(lengthOf("left"), lengthOf("right"), depth("top") + depth("bottom") + heading + 1, 4 + heading));
  // Place each side's runs: spread along a top or bottom given a width (T2), otherwise centred.
  for (const s of SIDES) {
    const rs = sideRuns(s);
    if (!rs.length) continue;
    const full = s === "top" || s === "bottom" ? W : H;
    const used = rs.reduce((a, r) => a + extentOf(r), 0);
    const spread = (s === "top" || s === "bottom") && span > 0 && rs.length > 1;
    const gap = spread ? (full - 1 - used) / (rs.length - 1) : 1.5;
    let cursor = spread ? 0.5 : (full - lengthOf(s)) / 2 + 0.5;
    for (const r of rs) {
      const e = extentOf(r);
      const sp = (r.terms.length - 1) * P;
      r.at = Math.round(cursor + (e - sp) / 2);
      cursor += e + gap;
    }
  }
  const textSide: "above" | "below" = view === "bottom" ? "above" : "below";
  return { module, view, runs, W, H, termH, idH, termW, idW, lh, nameSize, heading, textSide, printed, pinId, info };
}

function drawSideView(el: Element, t?: GeometryText): { prims: Prim[]; terminals: TerminalDef[]; body: Rect } {
  const L = sideViewLayout(el);
  const { W, H, termH, idH, lh, nameSize } = L;
  const P = PLANT.pitch;
  const half = P / 2;
  const prims: Prim[] = [rect(0, 0, W, H)];
  const terminals: TerminalDef[] = [];
  const firstPin = new Map<string, { at: Vec; dir: Dir }>();
  for (const r of L.runs) {
    const tw = Math.max(3, L.termW(r.side));
    const iw = L.idW(r.side);
    r.terms.forEach((tm, j) => {
      const a = r.at + j * P;
      const num = L.printed(tm);
      const id = L.pinId(tm);
      let at: Vec;
      let dir: Dir;
      if (r.side === "top" || r.side === "bottom") {
        const top = r.side === "top";
        const y0 = top ? 0 : H - termH;
        const yi = top ? termH : H - termH - idH;
        prims.push(rect(a - half, y0, P, termH), { t: "text", at: [a + TAG * CAP_HEIGHT * 0.5, y0 + termH / 2], text: num, size: TAG, anchor: "middle", role: "term", vertical: true });
        if (idH && id) prims.push(rect(a - half, yi, P, idH), { t: "text", at: [a + DETAIL * CAP_HEIGHT * 0.5, yi + idH / 2], text: id, size: DETAIL, anchor: "middle", role: "note", vertical: true });
        at = [a, top ? 0 : H];
        dir = top ? "up" : "down";
      } else {
        const left = r.side === "left";
        const x0 = left ? 0 : W - tw;
        const xi = left ? tw : W - tw - iw;
        prims.push(rect(x0, a - half, tw, P), text(x0 + tw / 2, a + (TAG * CAP_HEIGHT) / 2, num, TAG, "middle", "term"));
        if (iw && id) prims.push(rect(xi, a - half, iw, P), text(xi + iw / 2, a + (DETAIL * CAP_HEIGHT) / 2, id, DETAIL, "middle", "note"));
        at = [left ? 0 : W, a];
        dir = left ? "left" : "right";
      }
      terminals.push({ name: tm, at, dir });
      const pt = L.info.get(tm)?.point;
      if (pt && !firstPin.has(pt)) firstPin.set(pt, { at, dir });
    });
    // The group's name, by its terminals.
    const mid = r.at + ((r.terms.length - 1) * P) / 2;
    r.lines.forEach((l, i) => {
      if (r.side === "top") prims.push(text(mid, termH + idH + 1.9 + i * lh, l, nameSize, "middle", "note"));
      else if (r.side === "bottom") prims.push(text(mid, H - termH - idH - 0.7 - (r.lines.length - 1 - i) * lh, l, nameSize, "middle", "note"));
      else {
        const y = mid + (nameSize * CAP_HEIGHT) / 2 + (i - (r.lines.length - 1) / 2) * lh;
        if (r.side === "left") prims.push(text(tw + iw + 0.8, y, l, nameSize, "start", "note"));
        else prims.push(text(W - tw - iw - 0.8, y, l, nameSize, "end", "note"));
      }
    });
  }
  // A module: its heading inside the box, at the top unless terminals are there; each point's job along its wire.
  if (L.module) {
    let inf: { heading?: string } = {};
    try {
      inf = JSON.parse(str(el, "pmod", "{}")) as { heading?: string };
    } catch {
      /* none */
    }
    const topUsed = L.runs.some((r) => r.side === "top");
    if (inf.heading) prims.push(text(W / 2, topUsed ? H - 0.9 : MODULE.heading - 0.6, inf.heading, PLANT.group, "middle", "note"));
    const jobs = new Map(parsePlantPins(str(el, "ppins", "")).filter((p) => p.point && p.job).map((p) => [p.point, p.job.toUpperCase()]));
    for (const [pt, at] of firstPin) {
      const job = jobs.get(pt);
      if (!job) continue;
      const g = MODULE.labelGap;
      if (at.dir === "down") prims.push({ t: "text", at: [at.at[0] - 0.55 + DETAIL * CAP_HEIGHT * 0.5, at.at[1] + g], text: job, size: DETAIL, anchor: "end", role: "note", vertical: true });
      else if (at.dir === "up") prims.push({ t: "text", at: [at.at[0] - 0.55 + DETAIL * CAP_HEIGHT * 0.5, at.at[1] - g], text: job, size: DETAIL, anchor: "start", role: "note", vertical: true });
      else if (at.dir === "left") prims.push(text(at.at[0] - g, at.at[1] - 0.45, job, DETAIL, "end", "note"));
      else prims.push(text(at.at[0] + g, at.at[1] - 0.45, job, DETAIL, "start", "note"));
    }
  }
  // The text block, opposite the view's side (below for left and right), centred and wrapped as F4 has it.
  const wrapW = Math.max(W + 3, 12);
  const lines: [string, TextRole][] = [];
  if (L.module) {
    const title = t?.xref ? wrapTitle(t.xref, TAG, W) : ["{xref}"];
    for (const l of title) lines.push([l, "tag"]);
  } else {
    const tagText = t?.tag ?? "";
    const tagLines = tagText ? wrapTag(tagText, TAG, wrapW) : ["{tag}"];
    if (tagLines.length > 1) for (const l of tagLines) lines.push([l, "tag"]);
    else lines.push(["{tag}", "tag"]);
    for (const l of [str(el, "pdesc", ""), ...str(el, "pinfo", "").split("\n")].filter(Boolean)) for (const w of wrapText(l, TAG, wrapW)) lines.push([w, "note"]);
  }
  if (el.label) lines.push(["{label}", "label"]);
  const step = TAG * 1.35;
  lines.forEach(([tx, role], i) => {
    const y = L.textSide === "below" ? H + 1.8 + i * step : -0.7 - (lines.length - 1 - i) * step;
    prims.push({ ...text(L.module ? 0 : W / 2, y, tx, TAG, L.module ? "start" : "middle", role), block: true } as Prim);
  });
  return { prims, terminals, body: { x: 0, y: 0, w: W, h: H } };
}
