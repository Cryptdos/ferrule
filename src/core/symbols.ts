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
  | { t: "circle"; c: Vec; r: number; fill?: boolean }
  | { t: "arc"; from: Vec; to: Vec; r: number; sweep: 0 | 1 }
  | { t: "text"; at: Vec; text: string; size: number; anchor: Anchor; role: TextRole; vertical?: boolean };

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
}

export interface SymbolDef {
  id: string;
  name: string;
  /** Palette group. */
  group: "Contacts" | "Operators" | "Coils" | "Protection" | "Loads" | "Connection" | "Drawing";
  /** Shown in the palette. Junctions are created by wiring, not placed. */
  palette: boolean;
  params: ParamDef[];
  /** Designation kind, for the tag prefix. Null: not tagged. */
  kind(el: Element): SymbolKind | null;
  /** Terminal groups that are the same potential (e.g. both sides of a terminal). */
  bridged?(el: Element): string[][];
  draw(el: Element): { prims: Prim[]; terminals: TerminalDef[]; body: Rect };
}

// ---------------------------------------------------------------------------
// Drawing helpers

const W = 0.18; // normal line weight (≈ 0.25 mm)
const RAIL_W = 0.3;
const BAR_W = 0.6;
const TAG = 1.6; // tag text size
const LABEL = 1.25;
const TERM = 1.05;
/** Text sizes for drawing text, in grid units (2.5, 3.5, 5 and 7 mm on paper). */
const TEXT_SIZES: Record<string, number> = { small: 1.8, normal: 2.53, large: 3.61, title: 5.05 };

const line = (...pts: Vec[]): Prim => ({ t: "line", pts });
const dashed = (...pts: Vec[]): Prim => ({ t: "line", pts, dash: true });
const heavy = (w: number, ...pts: Vec[]): Prim => ({ t: "line", pts, w });
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
  const out: Prim[] = [text(x, 0.55, "{tag}", TAG, "end", "tag"), text(x, 1.95, "{xref}", TERM, "end", "xref")];
  if (el.label) out.push(text(x, 3.35, "{label}", LABEL, "end", "label"));
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

function noContact(dx = 0): Prim[] {
  return [line([dx, -3], [dx, -1.5]), line([dx, 1.5], [dx, 3]), line([dx, 1.5], [dx - 1.2, -1.6])];
}
function ncContact(dx = 0): Prim[] {
  return [
    line([dx, -3], [dx, -1.5], [dx + 1.1, -1.5]),
    line([dx, 1.5], [dx, 3]),
    line([dx, 1.5], [dx + 1.3, -1.8]),
  ];
}
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
};
const familyKind = (el: Element): SymbolKind => {
  const f = str(el, "family", "relay");
  return f === "contactor" ? "contactor" : f === "timer" ? "timer" : "relay";
};

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
        prims: [...noContact(), ...t.prims, ...tagAndLabel(-1.9, el)],
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
        prims: [...ncContact(), ...t.prims, ...tagAndLabel(-0.8, el)],
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
          line([0, 1.5], [-1.1, -1.7]),
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
          ...(nc ? ncContact() : noContact()),
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
          ...noContact(),
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
          ...ncContact(),
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
            line([0, 1.5], [-1.1, -1.7]),
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
          ...noContact(),
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
    name: "Isolator / multi-pole switch",
    group: "Protection",
    palette: true,
    params: [
      {
        key: "function",
        label: "Function",
        type: "select",
        default: "isolator",
        options: [
          { value: "isolator", label: "Isolator / switch-disconnector (Q)" },
          { value: "contactor", label: "Contactor main contacts (Q)" },
          { value: "breaker", label: "Circuit breaker / MCB (F)" },
        ],
      },
      { key: "poles", label: "Main poles", type: "number", min: 1, max: 4, default: 3 },
      { key: "aux", label: "Auxiliary poles (NO)", type: "number", min: 0, max: 3, default: 0 },
      { key: "operator", label: "Operator", type: "select", default: "turn", options: [
        { value: "turn", label: "Rotary handle" },
        { value: "push", label: "Push" },
        { value: "none", label: "None" },
      ] },
    ],
    kind: (el) => {
      const f = str(el, "function", "isolator");
      return f === "contactor" ? "contactor" : f === "breaker" ? "breaker" : "isolator";
    },
    draw(el) {
      const fn = str(el, "function", "isolator");
      const poles = num(el, "poles", 3, 1, 4);
      const aux = num(el, "aux", 0, 0, 3);
      const gap = 3;
      const prims: Prim[] = [];
      const terminals: TerminalDef[] = [];
      const total = poles + aux;
      for (let i = 0; i < total; i++) {
        const x = i * gap + (i >= poles ? 1 : 0);
        const isAux = i >= poles;
        const a = isAux ? `${i - poles + 1}3` : `${2 * i + 1}`;
        const b = isAux ? `${i - poles + 1}4` : `${2 * i + 2}`;
        prims.push(...noContact(x));
        if (!isAux && fn === "isolator") prims.push(line([x - 0.5, -1.5], [x + 0.5, -1.5]));
        // IEC contactor function: a small arc at the fixed contact.
        if (!isAux && fn === "contactor") prims.push({ t: "arc", from: [x, -1.5], to: [x, -0.5], r: 0.5, sweep: 1 });
        // Circuit breaker function: a cross at the fixed contact.
        if (!isAux && fn === "breaker") prims.push(line([x - 0.4, -1.9], [x + 0.4, -1.1]), line([x - 0.4, -1.1], [x + 0.4, -1.9]));
        prims.push(term(x + 0.45, -2.2, a), term(x + 0.45, 2.9, b));
        terminals.push({ name: a, at: [x, -3], dir: "up" }, { name: b, at: [x, 3], dir: "down" });
      }
      const lastX = (total - 1) * gap + (aux > 0 ? 1 : 0);
      const op = fn === "contactor" ? "none" : str(el, "operator", "turn");
      const hx = -2.4;
      prims.push(dashed([op === "none" ? NO_MID[0] : hx, 0], [lastX + NO_MID[0], 0]));
      if (op === "turn") prims.push(...turnHead(hx));
      if (op === "push") prims.push(...pushHead(hx));
      prims.push(...tagAndLabel(-3.2, el));
      return { prims, terminals, body: { x: -2.9, y: -1.7, w: lastX + 3, h: 3.2 } };
    },
  },
  {
    id: "fuse",
    name: "Fuse / fuse carrier",
    group: "Protection",
    palette: true,
    params: [
      { key: "poles", label: "Poles", type: "number", min: 1, max: 4, default: 1 },
      { key: "rating", label: "Rating", type: "text", default: "" },
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
        label: "Delay",
        type: "select",
        options: [
          { value: "on", label: "Delay on" },
          { value: "off", label: "Delay off" },
        ],
        default: "on",
      },
      { key: "time", label: "Time", type: "text", default: "" },
    ],
    kind: () => "timer",
    draw(el) {
      const on = str(el, "mode", "on") === "on";
      const time = str(el, "time", "");
      const mark: Prim[] = on
        ? [rect(-2.8, -1.1, 1.2, 2.2), line([-2.8, -1.1], [-1.6, 1.1]), line([-2.8, 1.1], [-1.6, -1.1])]
        : [rect(-2.8, -1.1, 1.2, 2.2, true)];
      return {
        prims: [
          line([0, -3], [0, -1.1]),
          line([0, 1.1], [0, 3]),
          rect(-1.6, -1.1, 3.2, 2.2),
          ...mark,
          term(0.45, -1.6, "A1"),
          term(0.45, 2.9, "A2"),
          ...(time ? [text(1.9, 0.45, time, LABEL, "start", "note")] : []),
          ...tagAndLabel(-3.3, el),
        ],
        terminals: vterms("A1", "A2"),
        body: { x: -2.8, y: -1.1, w: 4.4, h: 2.2 },
      };
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
        options: [
          { value: "", label: "None" },
          { value: "A", label: "A amber" },
          { value: "G", label: "G green" },
          { value: "R", label: "R red" },
          { value: "W", label: "W white" },
          { value: "B", label: "B blue" },
          { value: "Y", label: "Y yellow" },
        ],
        default: "",
      },
    ],
    kind: () => "lamp",
    draw(el) {
      const r = 1.3;
      const d = r * Math.SQRT1_2;
      const colour = str(el, "colour", "");
      return {
        prims: [
          line([0, -3], [0, -r]),
          line([0, r], [0, 3]),
          circle(0, 0, r),
          line([-d, -d], [d, d]),
          line([-d, d], [d, -d]),
          term(0.45, -2.2, "L"),
          term(0.45, 2.9, "N"),
          ...(colour ? [text(1.8, 0.5, colour, LABEL, "start", "note")] : []),
          ...tagAndLabel(-1.8, el),
        ],
        terminals: vterms("L", "N"),
        body: { x: -r, y: -r, w: 2 * r, h: 2 * r },
      };
    },
  },
  {
    id: "terminal",
    name: "Terminal",
    group: "Connection",
    palette: true,
    params: [{ key: "strip", label: "Terminal strip", type: "text", default: "X1" }],
    kind: () => "terminal",
    bridged: () => [["1", "2"]],
    draw(el) {
      return {
        prims: [
          line([0, -1], [0, -0.45]),
          line([0, 0.45], [0, 1]),
          circle(0, 0, 0.45),
          // Terminal numbers read up the page, so a row of terminals doesn't collide.
          { t: "text", at: [-0.25, -0.75], text: "{tag}", size: TERM, anchor: "start", role: "tag", vertical: true },
          ...(el.label ? [text(0.8, 0.4, "{label}", TERM, "start", "label")] : []),
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
      return {
        prims: [
          line([-2, -4], [-2, -1]),
          line([0, -4], [0, -1]),
          line([2, -4], [2, -1]),
          line([-2.4, -1], [2.4, -1]),
          { t: "arc", from: [-2.4, -1], to: [2.4, -1], r: 2.4, sweep: 0 },
          term(-1.55, -2.6, "L"),
          term(0.45, -2.6, "E"),
          term(2.45, -2.6, "N"),
          ...tagAndLabel(-3, el),
        ],
        terminals: [
          { name: "L", at: [-2, -4], dir: "up" },
          { name: "E", at: [0, -4], dir: "up" },
          { name: "N", at: [2, -4], dir: "up" },
        ],
        body: { x: -2.4, y: -1, w: 4.8, h: 2.4 },
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
      { key: "rating", label: "Rating", type: "text", default: "" },
    ],
    kind: () => "transformer",
    draw(el) {
      const r = 2.2;
      const cy = 1.4;
      const edge = cy + Math.sqrt(r * r - 0.36); // circle edge at x = ±0.6
      const rating = str(el, "rating", "");
      const prims: Prim[] = [
        circle(0, -cy, r),
        circle(0, cy, r),
        line([-2, -6], [-2, -5], [-0.6, -edge]),
        line([2, -6], [2, -5], [0.6, -edge]),
        line([-2, 6], [-2, 5], [-0.6, edge]),
        line([2, 6], [2, 5], [0.6, edge]),
        term(-2.45, -5.2, "P1", "end"),
        term(2.45, -5.2, "P2"),
        term(-2.45, 5.9, "S1", "end"),
        term(2.45, 5.9, "S2"),
        ...tagAndLabel(-3.2, el),
      ];
      if (bool(el, "screen", false)) prims.push(dashed([-3, 0], [3, 0]), line([3, 0], [3.6, 0]));
      if (rating) prims.push(text(3, 2.6, rating, LABEL, "start", "note"));
      return {
        prims,
        terminals: [
          { name: "P1", at: [-2, -6], dir: "up" },
          { name: "P2", at: [2, -6], dir: "up" },
          { name: "S1", at: [-2, 6], dir: "down" },
          { name: "S2", at: [2, 6], dir: "down" },
        ],
        body: { x: -r, y: -cy - r, w: 2 * r, h: 2 * (cy + r) },
      };
    },
  },
  {
    id: "motor",
    name: "Motor (3-phase)",
    group: "Loads",
    palette: true,
    params: [{ key: "rating", label: "Rating", type: "text", default: "" }],
    kind: () => "motor",
    draw(el) {
      const r = 3;
      const e = Math.sqrt(r * r - 4);
      const rating = str(el, "rating", "");
      return {
        prims: [
          circle(0, 0, r),
          line([-2, -6], [-2, -e]),
          line([0, -6], [0, -r]),
          line([2, -6], [2, -e]),
          text(0, 0.3, "M", 2.2, "middle", "note"),
          text(0, 2, "3~", 1.3, "middle", "note"),
          term(-2.45, -4.4, "U", "end"),
          term(0.45, -4.4, "V"),
          term(2.45, -4.4, "W"),
          ...(rating ? [text(3.5, 2.5, rating, LABEL, "start", "note")] : []),
          ...tagAndLabel(-3.6, el),
        ],
        terminals: [
          { name: "U", at: [-2, -6], dir: "up" },
          { name: "V", at: [0, -6], dir: "up" },
          { name: "W", at: [2, -6], dir: "up" },
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
          text(-0.8, 0.5, name, TAG, "end", "note"),
          text(len + 0.8, 0.5, name, TAG, "start", "note"),
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
    params: [],
    kind: () => null,
    draw() {
      return {
        prims: [line([0, -2], [0, 0]), line([-1.2, 0], [1.2, 0]), line([-0.8, 0.5], [0.8, 0.5]), line([-0.4, 1], [0.4, 1])],
        terminals: [{ name: "E", at: [0, -2], dir: "up" }],
        body: { x: -1.2, y: 0, w: 2.4, h: 1 },
      };
    },
  },
  {
    id: "offpage",
    name: "Off-page arrow",
    group: "Drawing",
    palette: true,
    params: [{ key: "ref", label: "Reference (if not linked)", type: "text", default: "" }],
    kind: () => null,
    draw(el) {
      return {
        prims: [
          line([0, -2], [0, 0]),
          { t: "poly", pts: [[-0.8, 0], [0.8, 0], [0, 1.3]], fill: false },
          // Whichever way the arrow points, the reference reads on its right and the label on its left.
          ...(el.rot === 180
            ? [
                text(-1.2, -1, "{xref}", LABEL, "end", "xref"),
                ...(el.label ? [text(1.2, -1, "{label}", LABEL, "start", "label")] : []),
              ]
            : [
                text(1.2, 1, "{xref}", LABEL, "start", "xref"),
                ...(el.label ? [text(-1.2, 1, "{label}", LABEL, "end", "label")] : []),
              ]),
        ],
        terminals: [{ name: "1", at: [0, -2], dir: "up" }],
        body: { x: -0.8, y: 0, w: 1.6, h: 1.3 },
      };
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
      const all = str(el, "terms", "").split(",").filter(Boolean);
      const showSet = new Set(str(el, "show", "").split(",").filter(Boolean));
      const shown = all.filter((t) => showSet.has(t));
      const desc = str(el, "pdesc", "");
      const n = Math.max(1, shown.length);
      const right = Math.max((n - 1) * 3 + 2, Math.ceil(desc.length * LABEL * 0.5) + 0, 6) ;
      const left = -2;
      const h = 6;
      const prims: Prim[] = [line([right, 0], [left, 0], [left, h], [right, h])];
      if (shown.length < all.length) {
        // Break line: there's more to this plant on another sheet.
        const zig: Vec[] = [[right, 0]];
        for (let y = 0.75; y < h; y += 1.5) zig.push([right + (Math.round(y / 1.5) % 2 ? 0.6 : -0.6), y]);
        zig.push([right, h]);
        prims.push(line(...zig));
      } else {
        prims.push(line([right, 0], [right, h]));
      }
      const terminals: TerminalDef[] = shown.map((t, i) => ({ name: t, at: [i * 3, -1], dir: "up" as Dir }));
      shown.forEach((t, i) => {
        prims.push(line([i * 3, -1], [i * 3, 0]), text(i * 3, 1.5, t, TERM, "middle", "term"));
      });
      prims.push(text(left + 0.5, 3.7, "{tag}", TAG, "start", "tag"));
      if (desc) prims.push(text(left + 0.5, 5.3, desc, LABEL, "start", "note"));
      if (el.label) prims.push(text(left, h + 1.6, "{label}", LABEL, "start", "label"));
      return { prims, terminals, body: { x: left, y: 0, w: right - left, h } };
    },
  },
  {
    id: "text",
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
    id: "box",
    name: "Box",
    group: "Drawing",
    palette: true,
    params: [
      { key: "w", label: "Width (units)", type: "number", min: 2, max: 200, default: 30 },
      { key: "h", label: "Height (units)", type: "number", min: 2, max: 112, default: 20 },
      { key: "dashed", label: "Dashed", type: "bool", default: false },
      { key: "heavy", label: "Heavy line", type: "bool", default: false },
    ],
    kind: () => null,
    draw(el) {
      const w = num(el, "w", 30, 2, 200);
      const h = num(el, "h", 20, 2, 112);
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

const BY_ID = new Map(SYMBOLS.map((s) => [s.id, s]));

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
}

/**
 * Element geometry relative to its origin, already rotated, with the tag,
 * cross-reference and label placeholders filled in.
 */
export function localGeometry(el: Element, texts: string | GeometryText): Geometry {
  const t: GeometryText = typeof texts === "string" ? { tag: texts } : texts;
  const def = requireSymbol(el.symbol);
  const d = def.draw(el);
  // With no cross-reference, close up the gap it would have left.
  let raw = d.prims;
  const xrefPrim = raw.find((p) => p.t === "text" && p.text === "{xref}");
  if (xrefPrim && xrefPrim.t === "text" && !t.xref) {
    const y0 = xrefPrim.at[1];
    raw = raw
      .filter((p) => p !== xrefPrim)
      .map((p) => (p.t === "text" && p.role === "label" && p.at[1] > y0 ? { ...p, at: [p.at[0], p.at[1] - 1.4] as Vec } : p));
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
