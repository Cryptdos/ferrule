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
import { legendTable, notesLayout, revisionTable, type LegendEntry } from "./annotations";
import {
  type Dir,
  type Rect,
  type Rotation,
  type Vec,
  rotate,
  rotateDir,
  rotateRect,
  unionRect,
} from "./geometry";
import type { Element, ParamValue } from "./model";
import type { SymbolKind } from "./designations";

// ---------------------------------------------------------------------------
// Primitives

export type Anchor = "start" | "middle" | "end";

export type Prim =
  | { t: "line"; pts: Vec[]; w?: number; dash?: boolean }
  | { t: "poly"; pts: Vec[]; fill: boolean }
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
  /** Kept on the element but not shown for editing. */
  hidden?: boolean;
}

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

const W = 0.18; // normal line weight (≈ 0.25 mm)
const RAIL_W = 0.3;
const BAR_W = 0.6;
const TAG = 1.4; // tag text size (≈ 1.9 mm)
const LABEL = 1.1; // ≈ 1.5 mm
const TERM = 0.95; // ≈ 1.3 mm
/** Text sizes for drawing text, in grid units (2.5, 3.5, 5 and 7 mm on paper). */
const TEXT_SIZES: Record<string, number> = { small: 1.8, normal: 2.53, large: 3.61, title: 5.05 };

const line = (...pts: Vec[]): Prim => ({ t: "line", pts });
const dashed = (...pts: Vec[]): Prim => ({ t: "line", pts, dash: true });
const heavy = (w: number, ...pts: Vec[]): Prim => ({ t: "line", pts, w });
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
  text(x, y, s, TERM, anchor, "term");

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
  const out: Prim[] = [text(x, 0.5, "{tag}", TAG, "end", "tag"), text(x, 1.75, "{xref}", TERM, "end", "xref")];
  if (el.label) out.push(text(x, 3.0, "{label}", LABEL, "end", "label"));
  return out;
}

/** Contact terminal markings from the pole number set by renumbering: 1 → 13/14, 2 → 23/24… */
function poleMarks(el: Element, base: [string, string]): [string, string] {
  const pole = num(el, "pole", 0, 0, 9);
  if (!pole) return base;
  return [`${pole}${base[0].slice(-1)}`, `${pole}${base[1].slice(-1)}`];
}

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

/** Terminal names are fixed (wires refer to them); the printed marks follow the pole number. */
function contactTerms(labels: [string, string], el?: Element): { prims: Prim[]; terminals: TerminalDef[] } {
  const marks = el ? poleMarks(el, labels) : labels;
  return {
    prims: [term(0.45, -2.2, marks[0]), term(0.45, 2.9, marks[1])],
    terminals: vterms(labels[0], labels[1]),
  };
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
  // Names and shorthand as IEC 61131-3 where it has them (TON, TOF, TP);
  // flashers have no IEC name.
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
    label: "Flasher, ON first (cyclic; no IEC 61131-3 name)",
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
  { code: "Cl", name: "clear" },
];

// ---------------------------------------------------------------------------
// The library

const SYMBOLS: SymbolDef[] = [
  {
    id: "contact-no",
    name: "Contact NO",
    group: "Contacts",
    palette: true,
    params: [familyParam],
    kind: familyKind,
    draw(el) {
      const t = contactTerms(["13", "14"], el);
      return {
        prims: [...noContact(0, opOf(el)), ...t.prims, ...tagAndLabel(-1.9, el)],
        terminals: t.terminals,
        body: { x: -1.3, y: -1.7, w: 1.4, h: 3.2 },
      };
    },
  },
  {
    id: "contact-nc",
    name: "Contact NC",
    group: "Contacts",
    palette: true,
    params: [familyParam],
    kind: familyKind,
    draw(el) {
      const t = contactTerms(["21", "22"], el);
      return {
        prims: [...ncContact(0, opOf(el)), ...t.prims, ...tagAndLabel(-0.8, el)],
        terminals: t.terminals,
        body: { x: -0.1, y: -1.9, w: 1.5, h: 3.4 },
      };
    },
  },
  {
    id: "contact-co",
    name: "Changeover contact",
    group: "Contacts",
    palette: true,
    params: [familyParam],
    kind: familyKind,
    draw(el) {
      return {
        prims: [
          line([0, -3], [0, -1.5]),
          line([-2, -3], [-2, -1.5], [-0.9, -1.5]),
          line([0, 1.5], [0, 3]),
          opOf(el) ? line([0, 1.5], [-0.25, -1.5]) : line([0, 1.5], [-1.1, -1.7]),
          term(0.45, -2.2, poleMarks(el, ["14", "11"])[0]),
          term(-2.45, -2.2, poleMarks(el, ["12", "11"])[0], "end"),
          term(0.45, 2.9, poleMarks(el, ["14", "11"])[1]),
          ...tagAndLabel(-2.6, el).map((p) => (p.t === "text" ? { ...p, at: [p.at[0], p.at[1] + 1.2] as Vec } : p)),
        ],
        terminals: [
          { name: "12", at: [-2, -3], dir: "up" },
          { name: "14", at: [0, -3], dir: "up" },
          { name: "11", at: [0, 3], dir: "down" },
        ],
        body: { x: -2, y: -1.8, w: 2.1, h: 3.3 },
      };
    },
  },
  {
    id: "timer-contact",
    name: "Timer contact",
    group: "Contacts",
    palette: true,
    params: [
      {
        key: "contact",
        label: "Contact",
        type: "select",
        options: [
          { value: "no", label: "NO (17/18)" },
          { value: "nc", label: "NC (15/16)" },
        ],
        default: "no",
      },
      {
        key: "mode",
        label: "Delay",
        type: "select",
        options: [
          { value: "on", label: "Delay on" },
          { value: "off", label: "Delay off" },
        ],
        default: "on",
      },
    ],
    kind: () => "timer",
    draw(el) {
      const nc = str(el, "contact", "no") === "nc";
      const labels: [string, string] = nc ? ["15", "16"] : ["17", "18"];
      const mid = nc ? NC_MID : NO_MID;
      const on = str(el, "mode", "on") === "on";
      // Timing mark: double stem from the blade to an arc.
      const ax = -2.1;
      const arc: Prim = on
        ? { t: "arc", from: [ax, -0.6], to: [ax, 0.6], r: 0.6, sweep: 0 }
        : { t: "arc", from: [ax, -0.6], to: [ax, 0.6], r: 0.6, sweep: 1 };
      return {
        prims: [
          ...(nc ? ncContact(0, opOf(el)) : noContact(0, opOf(el))),
          line([mid[0], mid[1] - 0.15], [ax, -0.15]),
          line([mid[0], mid[1] + 0.15], [ax, 0.15]),
          arc,
          ...contactTerms(labels, el).prims,
          ...tagAndLabel(-3, el),
        ],
        terminals: vterms(labels[0], labels[1]),
        body: { x: -2.7, y: -1.8, w: 4.1, h: 3.4 },
      };
    },
  },
  {
    id: "pb-no",
    name: "Push button NO",
    group: "Operators",
    palette: true,
    params: [],
    kind: () => "pushButton",
    draw(el) {
      return {
        prims: [
          ...noContact(0, opOf(el)),
          dashed(NO_MID, [-2.4, 0]),
          ...pushHead(-2.4),
          ...contactTerms(["13", "14"]).prims,
          ...tagAndLabel(-3.2, el),
        ],
        terminals: vterms("13", "14"),
        body: { x: -2.8, y: -1.7, w: 2.9, h: 3.2 },
      };
    },
  },
  {
    id: "pb-nc",
    name: "Push button NC",
    group: "Operators",
    palette: true,
    params: [],
    kind: () => "pushButton",
    draw(el) {
      return {
        prims: [
          ...ncContact(0, opOf(el)),
          dashed(NC_MID, [-2.4, NC_MID[1]]),
          ...pushHead(-2.4).map((p) =>
            p.t === "line" ? { ...p, pts: p.pts.map(([x, y]) => [x, y + NC_MID[1]] as Vec) } : p,
          ),
          ...contactTerms(["21", "22"]).prims,
          ...tagAndLabel(-3.2, el),
        ],
        terminals: vterms("21", "22"),
        body: { x: -2.8, y: -1.9, w: 4.2, h: 3.4 },
      };
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
          { value: "2", label: "2 position" },
          { value: "3", label: "3 position" },
        ],
        default: "2",
      },
      {
        key: "contact",
        label: "Contact",
        type: "select",
        options: [
          { value: "no", label: "NO (13/14)" },
          { value: "co", label: "Changeover (11/12/14)" },
        ],
        default: "no",
      },
      { key: "key", label: "Key operated", type: "bool", default: false },
      { key: "legend", label: "Position legend", type: "text", default: "" },
    ],
    kind: () => "selector",
    draw(el) {
      const key = bool(el, "key", false);
      const three = str(el, "positions", "2") === "3";
      const legend = str(el, "legend", "") || (three ? "I 0 II" : "0  I");
      if (str(el, "contact", "no") === "co") {
        // Changeover: common 11 at the bottom, 12 (left) and 14 (right) at the top.
        const hx = -3.4;
        return {
          prims: [
            line([0, -3], [0, -1.5]),
            line([-2, -3], [-2, -1.5], [-0.9, -1.5]),
            line([0, 1.5], [0, 3]),
            opOf(el) ? line([0, 1.5], [-0.25, -1.5]) : line([0, 1.5], [-1.1, -1.7]),
            dashed([-0.55, -0.1], [hx, -0.1]),
            ...(key ? keyHead(hx) : turnHead(hx)).map((p) => (p.t === "line" ? { ...p, pts: p.pts.map(([x, y]) => [x, y - 0.1] as Vec) } : p)),
            text(hx, -1.5, legend, TERM, "middle", "note"),
            term(0.45, -2.2, "14"),
            term(-2.45, -2.2, "12", "end"),
            term(0.45, 2.9, "11"),
            ...tagAndLabel(-4.6, el),
          ],
          terminals: [
            { name: "12", at: [-2, -3], dir: "up" },
            { name: "14", at: [0, -3], dir: "up" },
            { name: "11", at: [0, 3], dir: "down" },
          ],
          body: { x: -3.9, y: -1.8, w: 4, h: 3.3 },
        };
      }
      return {
        prims: [
          ...noContact(0, opOf(el)),
          dashed(NO_MID, [-2.4, 0]),
          ...(key ? keyHead(-2.4) : turnHead(-2.4)),
          text(-2.4, -1.4, legend, TERM, "middle", "note"),
          ...contactTerms(["13", "14"]).prims,
          ...tagAndLabel(-3.6, el),
        ],
        terminals: vterms("13", "14"),
        body: { x: -3.4, y: -1.7, w: 3.5, h: 3.2 },
      };
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
          { value: "push", label: "Push" },
          { value: "none", label: "None" },
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
      if (op === "turn") prims.push(...turnHead(hx));
      if (op === "push") prims.push(...pushHead(hx));
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
        prims.push(line([x, -3], [x, 3]), rect(x - 0.6, -1.6, 1.2, 3.2), term(x + 0.45, -2.2, a), term(x + 0.45, 2.9, b));
        terminals.push({ name: a, at: [x, -3], dir: "up" }, { name: b, at: [x, 3], dir: "down" });
      }
      if (poles > 1) prims.push(dashed([0.6, 0], [(poles - 1) * 3 - 0.6, 0]));
      if (rating) prims.push(text((poles - 1) * 3 + 1, 0.45, rating, LABEL, "start", "note"));
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
      { key: "time", label: "Time", type: "text", default: "", placeholder: "e.g. 5s, 1.5s, 2min" },
      { key: "code", label: "Maker's function code", type: "text", default: "", placeholder: "e.g. A (Selec 600XU)" },
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
        text(tx, 1.75, fn, LABEL, "end", "note"),
      ];
      if (el.label) prims.push(text(tx, 3.0, "{label}", LABEL, "end", "label"));
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
        options: [{ value: "", label: "None" }, ...LAMP_COLOURS.map((c) => ({ value: c.code, label: `${c.code} ${c.name}` }))],
        default: "",
      },
      { key: "testPin", label: "Lamp test terminal (T)", type: "bool", default: false },
    ],
    kind: () => "lamp",
    draw(el) {
      const r = 1.3;
      const d = r * Math.SQRT1_2;
      const colour = str(el, "colour", "");
      const test = bool(el, "testPin", false);
      const prims: Prim[] = [
        line([0, -3], [0, -r]),
        line([0, r], [0, 3]),
        circle(0, 0, r),
        line([-d, -d], [d, d]),
        line([-d, d], [d, -d]),
        term(0.45, -2.2, "V+"),
        term(0.45, 2.9, "V-"),
        ...(colour ? [text(1.8, 0.45, colour, LABEL, "start", "note")] : []),
      ];
      const terminals = vterms("V+", "V-");
      if (test) {
        // Test terminal beside the supply, on the same side, so both wire from above.
        // Enters the bulb from the side, clear of the cross.
        prims.push(line([-2, -3], [-2, -1.4], [-r * 0.87, -r * 0.5]), term(-2.45, -2.2, "T", "end"));
        terminals.unshift({ name: "T", at: [-2, -3], dir: "up" });
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
      { key: "showStrip", label: "Show the strip identifier beside it", type: "bool", default: false },
    ],
    kind: () => "terminal",
    bridged: () => [["1", "2"]],
    draw(el) {
      const strip = el.params.showStrip === true ? String(el.params.strip ?? "").trim() : "";
      return {
        prims: [
          line([0, -1], [0, -0.45]),
          line([0, 0.45], [0, 1]),
          // White inside: a terminal on the panel boundary sits over the line.
          { t: "circle", c: [0, 0], r: 0.45, bg: true },
          // The terminal's number sits beside it, across the wire, so it doesn't read as a wire number.
          text(0.6, -0.15, "{tag}", 0.85, "start", "tag"),
          // Its strip on the other side, when asked for.
          ...(strip ? [text(-0.6, -0.15, strip, 0.85, "end", "note")] : []),
          ...(el.label ? [text(0.65, 1.0, "{label}", TERM, "start", "label")] : []),
        ],
        terminals: vterms("1", "2", 1),
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
      if (rating) prims.push(text(cx + 3, 2.6, rating, LABEL, "start", "note"));
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
          ...(rating ? [text(4.1, 2.5, rating, LABEL, "start", "note")] : []),
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
    name: "Distribution block / busbar",
    group: "Connection",
    palette: true,
    params: [
      { key: "length", label: "Length (units)", type: "number", min: 2, max: 200, default: 8 },
      { key: "name", label: "Name", type: "text", default: "" },
    ],
    kind: () => "busbar",
    bridged: (el) => [railTerminals(el).map((t) => t.name)],
    draw(el) {
      const len = num(el, "length", 8, 2, 200);
      const name = str(el, "name", "");
      return {
        prims: [
          heavy(BAR_W, [0, 0], [len, 0]),
          ...(name ? [text(-0.8, 0.5, name, LABEL, "end", "note")] : []),
          text(len / 2, -1, "{tag}", TAG, "middle", "tag"),
          ...(el.label ? [text(len / 2, 2.2, "{label}", LABEL, "middle", "label")] : []),
        ],
        terminals: railTerminals(el),
        body: { x: 0, y: -0.3, w: len, h: 0.6 },
      };
    },
  },
  {
    id: "rail",
    name: "Control rail (CCT / 0V)",
    group: "Connection",
    palette: true,
    params: [
      { key: "length", label: "Length (units)", type: "number", min: 2, max: 200, default: 190 },
      { key: "name", label: "Name", type: "text", default: "CCT" },
    ],
    kind: () => null,
    bridged: (el) => [railTerminals(el).map((t) => t.name)],
    draw(el) {
      const len = num(el, "length", 190, 2, 200);
      const name = str(el, "name", "CCT");
      return {
        prims: [
          heavy(RAIL_W, [0, 0], [len, 0]),
          // Names sit just above the rail at each end, clear of the line.
          text(-0.6, -0.45, name, TAG, "end", "note"),
          text(len + 0.6, -0.45, name, TAG, "start", "note"),
          // Other sheets the same rail is on (a rail of the same name is the same conductor).
          text(len + 0.6, 1.5, "{xref}", TERM, "start", "xref"),
        ],
        terminals: railTerminals(el),
        body: { x: 0, y: -0.15, w: len, h: 0.3 },
      };
    },
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
        prims = [line([0, -2], [0, -1.3]), line([0, -1.3], [0, -0.4]), ...bars.map((b) => shift(b, 0, -0.4)), circle(0, 0.1, 1.5)];
        body = { x: -1.5, y: -1.4, w: 3, h: 3 };
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
    ],
    kind: () => null,
    draw(el) {
      const source = el.params.source !== false;
      // A slim isosceles triangle. The source points away along the wire
      // (it goes on elsewhere); the destination points back into its wire
      // (it comes from elsewhere) and is filled, so the two never get mixed up.
      const w = 0.6;
      const h = 1.8;
      const head: Prim = source
        ? { t: "poly", pts: [[-w, 0], [w, 0], [0, h]], fill: false }
        : { t: "poly", pts: [[-w, h], [w, h], [0, 0]], fill: true };
      return {
        prims: [
          line([0, -2], [0, 0]),
          head,
          // Whichever way the arrow points, the reference reads on its right and the label on its left.
          ...(el.rot === 180
            ? [
                text(-1, -1, "{xref}", LABEL, "end", "xref"),
                ...(el.label ? [text(1, -1, "{label}", LABEL, "start", "label")] : []),
              ]
            : [
                text(1, 1.2, "{xref}", LABEL, "start", "xref"),
                ...(el.label ? [text(-1, 1.2, "{label}", LABEL, "end", "label")] : []),
              ]),
        ],
        terminals: [{ name: "1", at: [0, -2], dir: "up" }],
        body: { x: -w, y: 0, w: 2 * w, h },
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
      {
        key: "drain",
        label: "Drain wire (E)",
        type: "select",
        default: "right",
        options: [
          { value: "right", label: "Drain on the right" },
          { value: "left", label: "Drain on the left" },
          { value: "none", label: "No drain (not terminated here)" },
        ],
      },
      { key: "dashed", label: "Dashed", type: "bool", default: false },
    ],
    kind: () => "cable",
    draw(el) {
      // An ellipse drawn across the cores of a screened cable, the screen
      // (drain) taken off one end to earth. Origin on the first core.
      const span = num(el, "span", 3, 1, 60);
      const drain = str(el, "drain", "right");
      const rx = span / 2 + 0.9;
      const cx = span / 2;
      const prims: Prim[] = [{ t: "ellipse", c: [cx, 0], rx, ry: 0.7, dash: bool(el, "dashed", false) }];
      const terminals: TerminalDef[] = [];
      if (drain !== "none") {
        const side = drain === "left" ? -1 : 1;
        const ex = side === 1 ? cx + rx : cx - rx;
        const tx = side === 1 ? Math.ceil(ex + 0.6) : Math.floor(ex - 0.6);
        prims.push(line([ex, 0], [tx, 0], [tx, 2]));
        terminals.push({ name: "E", at: [tx, 2], dir: "down" });
      }
      const lx = drain === "left" ? cx + rx + 0.5 : cx - rx - 0.5;
      const anchor: Anchor = drain === "left" ? "start" : "end";
      prims.push(text(lx, -0.4, "{tag}", TAG, anchor, "tag"));
      if (el.label) prims.push(text(lx, 0.95, "{label}", LABEL, anchor, "label"));
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
    draw(el) {
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
          text(left - 0.9, h / 2 - 0.2, "POWER BY", LABEL, "end", "note"),
          text(left - 0.9, h / 2 + 1.2, "OTHERS", LABEL, "end", "note"),
        );
      }
      // Terminal boxes along the top inside edge; adjacent ones share a wall.
      for (const t of lay.terms) {
        prims.push(rect(t.x - 1.5, 0, 3, PLANT.termH), text(t.x, PLANT.termH - 0.35, t.name, TERM, "middle", "term"));
      }
      for (const g of lay.groups) prims.push(text((g.x0 + g.x1) / 2, PLANT.termH + 1.7, g.name, PLANT.group, "middle", "note"));
      // Tag, description and information under the box: centred under a box
      // wider than they are, otherwise left-aligned from its left edge.
      const lines: [string, number, TextRole][] = [["{tag}", TAG, "tag"]];
      for (const l of [str(el, "pdesc", ""), ...str(el, "pinfo", "").split("\n")].filter(Boolean)) lines.push([l, LABEL, "note"]);
      if (el.label) lines.push(["{label}", LABEL, "label"]);
      const widest = Math.max(...lines.map(([t, size]) => (t === "{tag}" ? 8 : t.length) * size * 0.55));
      const centred = widest < right - left;
      let y = h + 1.8;
      for (const [t, size, role] of lines) {
        prims.push(text(centred ? (left + right) / 2 : left, y, t, size, centred ? "middle" : "start", role));
        y += size === TAG ? 1.6 : 1.4;
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
        key: "size",
        label: "Size",
        type: "select",
        default: "normal",
        options: [
          { value: "small", label: "Small (2.5 mm)" },
          { value: "normal", label: "Normal (3.5 mm)" },
          { value: "large", label: "Large (5 mm)" },
          { value: "title", label: "Title (7 mm)" },
        ],
      },
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
    ],
    kind: () => null,
    draw(el) {
      const size = TEXT_SIZES[str(el, "size", "normal")] ?? TEXT_SIZES.normal!;
      const anchor = str(el, "align", "start") as Anchor;
      const lines = (el.label || "Text").split("\n");
      const width = Math.max(...lines.map((l) => l.length)) * size * 0.5;
      const x0 = anchor === "start" ? 0 : anchor === "middle" ? -width / 2 : -width;
      return {
        prims: lines.map((l, i) => text(0, i * size * 1.45, `{line${i}}`, size, anchor, "label")),
        terminals: [],
        body: { x: x0, y: -size * 0.8, w: Math.max(1, width), h: lines.length * size * 1.45 },
      };
    },
  },
  {
    id: "notes",
    bench: "annotate",
    name: "Notes (formatted)",
    group: "Drawing",
    palette: true,
    params: [
      {
        key: "size",
        label: "Size",
        type: "select",
        default: "small",
        options: [
          { value: "small", label: "Small (2.5 mm)" },
          { value: "normal", label: "Normal (3.5 mm)" },
          { value: "large", label: "Large (5 mm)" },
        ],
      },
      { key: "width", label: "Width (units)", type: "number", min: 10, max: 200, default: 80 },
    ],
    kind: () => null,
    draw(el, t) {
      const size = TEXT_SIZES[str(el, "size", "small")] ?? TEXT_SIZES.small!;
      const md = (t?.label ?? el.label) || "## Notes\n- Write notes here";
      const n = notesLayout(md, size, num(el, "width", 80, 10, 200));
      return { prims: n.prims, terminals: [], body: { x: 0, y: 0, w: n.w, h: n.h } };
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
        default: "small",
        options: [
          { value: "small", label: "Small (2.5 mm)" },
          { value: "normal", label: "Normal (3.5 mm)" },
        ],
      },
    ],
    kind: () => null,
    draw(el, t) {
      const size = TEXT_SIZES[str(el, "size", "small")] ?? TEXT_SIZES.small!;
      const r = revisionTable(t?.rows ?? [], num(el, "rows", 6, 1, 40), size);
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
        default: "small",
        options: [
          { value: "small", label: "Small (2.5 mm)" },
          { value: "normal", label: "Normal (3.5 mm)" },
        ],
      },
    ],
    kind: () => null,
    draw(el, t) {
      const size = TEXT_SIZES[str(el, "size", "small")] ?? TEXT_SIZES.small!;
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
        prims: [prim, ...(el.label ? [text(0.6, 1.8, "{label}", LABEL, "start", "label")] : [])],
        terminals: [],
        body: { x: 0, y: 0, w, h },
      };
    },
  },
  {
    id: "plate",
    bench: "annotate",
    name: "Label plate",
    group: "Drawing",
    palette: true,
    params: [
      { key: "w", label: "Width (units)", type: "number", min: 4, max: 200, default: 20 },
      { key: "h", label: "Height (units)", type: "number", min: 2, max: 60, default: 5 },
      {
        key: "size",
        label: "Text size",
        type: "select",
        default: "small",
        options: [
          { value: "small", label: "Small (2.5 mm)" },
          { value: "normal", label: "Normal (3.5 mm)" },
          { value: "large", label: "Large (5 mm)" },
        ],
      },
    ],
    kind: () => null,
    draw(el) {
      const w = num(el, "w", 20, 4, 200);
      const h = num(el, "h", 5, 2, 60);
      const size = TEXT_SIZES[str(el, "size", "small")] ?? TEXT_SIZES.small!;
      const lines = (el.label || "LABEL").split("\n");
      const lh = size * 1.3;
      const top = h / 2 - ((lines.length - 1) * lh) / 2 + size * 0.35;
      return {
        prims: [
          { t: "poly", pts: [[0, 0], [w, 0], [w, h], [0, h]], fill: false },
          { t: "poly", pts: [[0.4, 0.4], [w - 0.4, 0.4], [w - 0.4, h - 0.4], [0.4, h - 0.4]], fill: false },
          ...lines.map((l, i) => text(w / 2, top + i * lh, `{line${i}}`, size, "middle", "label")),
        ],
        terminals: [],
        body: { x: 0, y: 0, w, h },
      };
    },
  },
  {
    id: "image",
    bench: "annotate",
    name: "Picture",
    group: "Drawing",
    // Pasted (Ctrl+V) or dropped onto the sheet; not placed from the palette.
    palette: false,
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
    ],
    kind: () => null,
    draw(el) {
      // Where power comes in from outside: an arrow down into each conductor,
      // 3 units apart like switch poles. The label says what it is (415V 3PH+N 50Hz).
      const sys = str(el, "system", "3ph-n");
      const names = sys === "1ph-n" ? ["L", "N"] : sys === "3ph" ? ["L1", "L2", "L3"] : sys === "dc" ? ["+", "-"] : ["L1", "L2", "L3", "N"];
      const prims: Prim[] = [];
      const terminals: TerminalDef[] = [];
      names.forEach((name, i) => {
        const x = i * 3;
        prims.push(
          line([x, -2.6], [x, 0]),
          { t: "poly", pts: [[x - 0.45, -1.5], [x + 0.45, -1.5], [x, -0.6]], fill: true },
          text(x, -3.0, name, TERM, "middle", "term"),
        );
        terminals.push({ name, at: [x, 0], dir: "down" });
      });
      if (el.label) prims.push(text(-0.6, -4.4, "{label}", LABEL, "start", "label"));
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

/** Rails and busbars can be tapped at any whole unit along their length. */
function railTerminals(el: Element): TerminalDef[] {
  const len = num(el, "length", el.symbol === "rail" ? 190 : 8, 2, 200);
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

/** Terminal groups of a plant view's params: "ENABLE=1,2;0-10V=3,4". */
export function parsePlantGroups(s: string): { name: string; terminals: string[] }[] {
  return s
    .split(";")
    .map((g) => {
      const i = g.indexOf("=");
      return i < 0 ? null : { name: g.slice(0, i).trim(), terminals: g.slice(i + 1).split(",").filter(Boolean) };
    })
    .filter((g): g is { name: string; terminals: string[] } => !!g && !!g.name);
}

/** A plant terminal's name as printed: its id without any group qualifier (R2.C → C). */
export function plantTerminalName(id: string, group?: string): string {
  return group && id.startsWith(`${group}.`) ? id.slice(group.length + 1) : id;
}

/** Plant view sizes, grid units. */
export const PLANT = {
  /** Every plant box is this tall, so they line up. */
  h: 6,
  /** Terminal boxes along the top inside edge. */
  termH: 1.6,
  /** Group names, in capitals, a touch larger than other labels. */
  group: 1.25,
};

/**
 * Where a plant view's terminals go, as on a maker's drawing: a row of
 * small boxes 3 units apart along the inside top edge, each group's name
 * under its boxes, a gap between groups. The box is as wide as its
 * terminals need.
 */
export function plantViewLayout(el: Element): {
  terms: { id: string; name: string; x: number }[];
  groups: { name: string; x0: number; x1: number }[];
  left: number;
  right: number;
  h: number;
  partial: boolean;
} {
  const all = str(el, "terms", "").split(",").filter(Boolean);
  const showSet = new Set(str(el, "show", "").split(",").filter(Boolean));
  const shown = all.filter((t) => showSet.has(t));
  const groupOf = new Map<string, string>();
  for (const g of parsePlantGroups(str(el, "pgroups", ""))) for (const t of g.terminals) groupOf.set(t, g.name);
  // Runs of shown terminals in the same group.
  const runs: { name: string; terms: string[] }[] = [];
  for (const t of shown) {
    const name = groupOf.get(t) ?? "";
    const last = runs[runs.length - 1];
    if (last && last.name === name) last.terms.push(t);
    else runs.push({ name, terms: [t] });
  }
  const textW = (name: string) => (name ? name.length * PLANT.group * 0.62 : 0);
  const terms: { id: string; name: string; x: number }[] = [];
  const groups: { name: string; x0: number; x1: number }[] = [];
  let prevRight = -Infinity; // right edge of whatever the previous run drew (boxes or name)
  for (const [i, r] of runs.entries()) {
    const span = (r.terms.length - 1) * 3;
    const half = Math.max(span + 3, textW(r.name)) / 2;
    // Centre far enough right to clear the last run by a box width.
    let x0 = 0;
    if (i > 0) x0 = Math.ceil(prevRight + 3 + half - span / 2);
    const centre = x0 + span / 2;
    r.terms.forEach((t, j) => terms.push({ id: t, name: plantTerminalName(t, r.name), x: x0 + j * 3 }));
    if (r.name) groups.push({ name: r.name.toUpperCase(), x0, x1: x0 + span });
    prevRight = centre + half;
  }
  const lastX = terms.length ? terms[terms.length - 1]!.x : 0;
  const nameEdge = (g: { name: string; x0: number; x1: number }, side: -1 | 1) => (g.x0 + g.x1) / 2 + (side * textW(g.name)) / 2;
  const left = Math.min(-3, ...groups.map((g) => nameEdge(g, -1) - 1));
  const right = Math.max(lastX + 3, left + 6, ...groups.map((g) => nameEdge(g, 1) + 1));
  return { terms, groups, left, right, h: PLANT.h, partial: shown.length < all.length };
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
  /** Revision list rows (revision table). */
  rows?: string[][];
  /** One of each part used (symbol legend). */
  legend?: LegendEntry[];
}

/**
 * Element geometry relative to its origin, already rotated, with the tag,
 * cross-reference and label placeholders filled in.
 */
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
  const prims = raw.map((p) => {
    const q = rotatePrim(p, el.rot);
    return q.t === "text" ? { ...q, text: fill(q.text) } : q;
  });
  const terminals = d.terminals.map((t) => ({ ...t, at: rotate(t.at, el.rot), dir: rotateDir(t.dir, el.rot) }));
  const body = rotateRect(d.body, el.rot);
  let bbox = body;
  for (const p of prims) {
    const b = primBounds(p);
    if (b) bbox = unionRect(bbox, b);
  }
  return { prims, terminals, body, bbox };
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
  const [x, y] = rotate(t.at, el.rot);
  return [el.pos[0] + x, el.pos[1] + y];
}

export function terminalDir(el: Element, name: string): Dir {
  const t = requireSymbol(el.symbol)
    .draw(el)
    .terminals.find((x) => x.name === name);
  return t ? rotateDir(t.dir, el.rot) : "any";
}
