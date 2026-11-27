/**
 * Wire geometry (DESIGN.md §3, milestone 2). Routes are orthogonal
 * polylines in grid units whose first and last points sit on terminals.
 * These helpers are pure so the UI, the router and tests share them.
 */
import { BLOCK_INSET } from "./blocks";
import { textUnits, type Vec } from "./geometry";
import type { Element, Page, Project, Segment, TerminalRef } from "./model";
import { isBar, terminalDir, terminalPoint } from "./symbols";
import { textWidth } from "./textwidth";

const eq = (a: Vec, b: Vec) => a[0] === b[0] && a[1] === b[1];

/** Drop repeated points and points in the middle of a straight run. */
export function simplifyRoute(points: Vec[]): Vec[] {
  const out: Vec[] = [];
  for (const p of points) {
    if (out.length && eq(out[out.length - 1]!, p)) continue;
    out.push([p[0], p[1]]);
    while (out.length >= 3) {
      const [a, b, c] = out.slice(-3) as [Vec, Vec, Vec];
      const collinear = (a[0] === b[0] && b[0] === c[0]) || (a[1] === b[1] && b[1] === c[1]);
      if (!collinear) break;
      out.splice(out.length - 2, 1);
    }
  }
  return out;
}

export function isOrthogonal(points: Vec[]): boolean {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (a[0] !== b[0] && a[1] !== b[1]) return false;
  }
  return true;
}

/**
 * A simple fallback route: straight if aligned, otherwise one bend placed
 * to leave each terminal in its own direction where possible.
 */
export function simpleRoute(a: Vec, b: Vec, startDir: string = "any"): Vec[] {
  if (a[0] === b[0] || a[1] === b[1]) return [a, b];
  const vertical = startDir === "up" || startDir === "down" || startDir === "any";
  return vertical ? [a, [a[0], b[1]], b] : [a, [b[0], a[1]], b];
}

/**
 * Drag one leg of a route sideways by `delta` (only the component across
 * the leg counts). Dragging the first or last leg adds a short jog so the
 * wire stays on its terminal.
 */
export function dragLeg(points: Vec[], index: number, delta: Vec): Vec[] {
  if (index < 0 || index >= points.length - 1) return points;
  let pts = points.map((p) => [p[0], p[1]] as Vec);
  let i = index;
  if (i === 0) {
    pts = [pts[0]!, [pts[0]![0], pts[0]![1]], ...pts.slice(1)];
    i = 1;
  }
  if (i === pts.length - 2) {
    const last = pts[pts.length - 1]!;
    pts = [...pts.slice(0, -1), [last[0], last[1]], last];
  }
  const a = pts[i]!;
  const b = pts[i + 1]!;
  const vertical = a[0] === b[0];
  if (vertical) {
    a[0] += delta[0];
    b[0] += delta[0];
  } else {
    a[1] += delta[1];
    b[1] += delta[1];
  }
  return pts;
}

/**
 * Keep a manual route attached when its terminals move: the end points
 * move and the legs next to them slide to stay square. Returns null when
 * the route can't be kept (too short or no longer orthogonal), meaning it
 * should go back to automatic routing.
 */
export function refitManual(points: Vec[], start: Vec, end: Vec): Vec[] | null {
  if (points.length < 3) return null;
  const pts = points.map((p) => [p[0], p[1]] as Vec);
  const move = (endIdx: number, nextIdx: number, to: Vec) => {
    const p = pts[endIdx]!;
    const n = pts[nextIdx]!;
    if (p[0] === n[0]) n[0] = to[0];
    else n[1] = to[1];
    pts[endIdx] = [to[0], to[1]];
  };
  move(0, 1, start);
  move(pts.length - 1, pts.length - 2, end);
  return isOrthogonal(pts) ? simplifyRoute(pts) : null;
}

/** Distance from a point to a polyline. */
export function distanceToRoute(p: Vec, points: Vec[]): { dist: number; leg: number } {
  let best = { dist: Infinity, leg: -1 };
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
    const d = Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
    if (d < best.dist) best = { dist: d, leg: i };
  }
  return best;
}

/** The nearest grid point on a route to `p`. */
export function nearestPointOnRoute(p: Vec, points: Vec[]): Vec | null {
  const { leg } = distanceToRoute(p, points);
  if (leg < 0) return null;
  const a = points[leg]!;
  const b = points[leg + 1]!;
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(lo, hi), Math.max(Math.min(lo, hi), v));
  return a[0] === b[0]
    ? [a[0], Math.round(clamp(p[1], a[1], b[1]))]
    : [Math.round(clamp(p[0], a[0], b[0])), a[1]];
}

export function findElement(page: Page, id: string): Element | undefined {
  return page.elements.find((e) => e.id === id);
}

export function endPoint(page: Page, ref: TerminalRef): Vec | null {
  const el = findElement(page, ref[0]);
  return el ? terminalPoint(el, ref[1]) : null;
}

export function endDir(page: Page, ref: TerminalRef): string {
  const el = findElement(page, ref[0]);
  return el ? terminalDir(el, ref[1]) : "any";
}

/** Points to draw for a segment, falling back to a simple route if none are stored. */
export function routeOf(page: Page, seg: Segment): Vec[] {
  if (seg.points.length >= 2) return seg.points;
  const a = endPoint(page, seg.from);
  const b = endPoint(page, seg.to);
  return a && b ? simpleRoute(a, b, endDir(page, seg.from)) : [];
}

/**
 * Connection dots: where a wire taps a rail or busbar part-way along, and
 * where three or more wires meet at one terminal. Junction elements draw
 * their own dot.
 */
export function connectionDots(page: Page): Vec[] {
  const count = new Map<string, { n: number; at: Vec; tap: boolean }>();
  for (const seg of page.segments) {
    for (const ref of [seg.from, seg.to]) {
      const el = findElement(page, ref[0]);
      if (!el || el.symbol === "junction") continue;
      const at = terminalPoint(el, ref[1]);
      if (!at) continue;
      const key = `${ref[0]}:${ref[1]}`;
      const bar = isBar(el);
      const len = typeof el.params.length === "number" ? el.params.length : 0;
      const tap = bar && ref[1] !== "0" && ref[1] !== String(len);
      const cur = count.get(key) ?? { n: 0, at, tap };
      cur.n += 1;
      count.set(key, cur);
    }
  }
  return [...count.values()].filter((c) => c.tap || c.n >= 3).map((c) => c.at);
}

/**
 * How many wires land on a distribution block (v0.5 A23, design-wire-numbering
 * §3): each needs a way of its own, so it's the fewest ways the block can have.
 * Counted from the drawing, on the block's own sheet: a block doesn't span sheets.
 */
export function blockWays(project: Project, el: Element): number {
  const page = project.pages.find((p) => p.elements.some((e) => e.id === el.id));
  let n = 0;
  for (const seg of page?.segments ?? []) for (const ref of [seg.from, seg.to]) if (ref[0] === el.id) n++;
  return n;
}

/**
 * Where a wire's number is printed: beside the middle of its longest leg,
 * reading up the page on vertical legs. Null for legs too short to label.
 */
export function wireLabelSpot(points: Vec[], minLength = 3): { at: Vec; vertical: boolean } | null {
  let best = -1;
  let len = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const l = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
    if (l > len) {
      len = l;
      best = i;
    }
  }
  if (best < 0 || len < minLength) return null;
  const a = points[best]!;
  const b = points[best + 1]!;
  const vertical = a[0] === b[0];
  const mid: Vec = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  return { at: vertical ? [mid[0] - 0.35, mid[1]] : [mid[0], mid[1] - 0.35], vertical };
}

/** Is this a field wire (out to plant)? Set by hand, or because an end is outside the panel boundary. */
export function isFieldWire(page: Page, seg: Segment): boolean {
  if (seg.field !== undefined) return seg.field;
  const ext = (id: string) => page.elements.find((e) => e.id === id)?.zone === "external";
  return ext(seg.from[0]) || ext(seg.to[0]);
}

/** Is this part an earth: the earth symbol, or a terminal of the Earth type (9, 24)? */
export function isEarthPart(el: Element | undefined): boolean {
  return !!el && (el.symbol === "earth" || (el.symbol === "terminal" && el.params.function === "earth"));
}

/** Earth conductors: those that reach an earth symbol or an earth terminal anywhere in the project (24). */
export function earthConductors(project: Project): Set<string> {
  const els = new Map<string, Element>();
  for (const pg of project.pages) for (const el of pg.elements) els.set(el.id, el);
  const out = new Set<string>();
  for (const c of project.conductors) if (c.terminals.some((t) => isEarthPart(els.get(t[0])))) out.add(c.id);
  return out;
}

/** A wire from a cable screen's drain, drawn dashed like the screen (26). */
export function isScreenWire(page: Page, seg: Segment): boolean {
  const scr = (id: string) => page.elements.find((e) => e.id === id)?.symbol === "screen";
  return scr(seg.from[0]) || scr(seg.to[0]);
}

/**
 * Whether a wire prints its number unless told otherwise: not on field wires
 * (out to plant) or earth wires (24).
 */
export function numberByDefault(page: Page, seg: Segment, earth: Set<string>): boolean {
  return !isFieldWire(page, seg) && !earth.has(seg.conductor);
}

/**
 * The wires on a sheet that print their conductor's number: once per
 * conductor, on its longest run, not on every branch at a junction (15).
 * A wire set to show its number always does; one set not to never does.
 */
export function numberedSegments(page: Page, earth: Set<string>, route: (seg: Segment) => Vec[]): Set<string> {
  const out = new Set<string>();
  const best = new Map<string, { id: string; len: number }>();
  const longestLeg = (pts: Vec[]) => {
    let m = 0;
    for (let i = 0; i < pts.length - 1; i++) m = Math.max(m, Math.abs(pts[i]![0] - pts[i + 1]![0]) + Math.abs(pts[i]![1] - pts[i + 1]![1]));
    return m;
  };
  for (const seg of page.segments) {
    if (seg.showNumber === true) out.add(seg.id);
    if (seg.showNumber !== undefined || !numberByDefault(page, seg, earth)) continue;
    const len = longestLeg(route(seg));
    const b = best.get(seg.conductor);
    if (!b || len > b.len) best.set(seg.conductor, { id: seg.id, len });
  }
  // A conductor already numbered by hand on this sheet doesn't get a second one.
  const byHand = new Set(page.segments.filter((s) => s.showNumber === true).map((s) => s.conductor));
  for (const [cond, b] of best) if (!byHand.has(cond)) out.add(b.id);
  return out;
}

export interface WireText {
  text: string;
  at: Vec;
  /** Reads up the page, beside a vertical leg. */
  vertical: boolean;
  anchor: "start" | "middle" | "end";
  role: "number" | "colour" | "function";
  /** The number is at the tag size (2.5 mm, v0.3 §2); colour and function at the detail size. */
  size: "tag" | "detail";
}

const WIRE_TEXT = { tag: textUnits("tag"), detail: textUnits("detail") };
const sizeOf = (role: WireText["role"]): WireText["size"] => (role === "number" ? "tag" : "detail");
const textLen = (s: string, role: WireText["role"]) => textWidth(s, WIRE_TEXT[sizeOf(role)]);
/** Gap between the pieces of a wire's text, and its inset from the source terminal (67). */
const TEXT_GAP = 0.8;
const SOURCE_INSET = 2;

/**
 * Everything printed along a wire, as on a manufacturer's drawing:
 * - colour, function and number together, running along the wire at the
 *   source end (the end it was drawn from), inset about 2 units from the
 *   terminal (67);
 * - if the first leg can't take them, on the longest leg, centred;
 * - a number on its own sits at the middle of the longest leg;
 * - on a wire no longer than its text, everything is centred on it (T6).
 */
export function wireTexts(
  points: Vec[],
  info: {
    number?: string;
    colour?: string;
    func?: string;
    /** Ends on a busbar: text too long for a short wire runs away from the bar instead of across it. */
    railFrom?: boolean;
    railTo?: boolean;
    /** Slid along the wire by hand (v0.4.x T13): the number's, and the colour's (with its function), as 0–1 of its length. */
    numberAt?: number;
    colourAt?: number;
  },
): WireText[] {
  const out: WireText[] = [];
  if (points.length < 2) return out;
  // Slid by hand: that part sits centred where it was put along its own wire, the rest as usual.
  if (info.numberAt !== undefined || info.colourAt !== undefined) {
    const rest = { ...info, numberAt: undefined, colourAt: undefined };
    if (info.numberAt !== undefined && info.number) {
      out.push(...placedAlong(points, [{ text: info.number, role: "number" }], info.numberAt));
      rest.number = undefined;
    }
    if (info.colourAt !== undefined && (info.colour || info.func)) {
      const parts: { text: string; role: WireText["role"] }[] = [];
      if (info.colour) parts.push({ text: info.colour, role: "colour" });
      if (info.func) parts.push({ text: info.func, role: "function" });
      out.push(...placedAlong(points, parts, info.colourAt));
      rest.colour = undefined;
      rest.func = undefined;
    }
    return [...out, ...wireTexts(points, rest)];
  }
  const along = (from: Vec, to: Vec, dist: number): Vec => {
    const len = Math.abs(to[0] - from[0]) + Math.abs(to[1] - from[1]) || 1;
    return [from[0] + ((to[0] - from[0]) / len) * dist, from[1] + ((to[1] - from[1]) / len) * dist];
  };
  const legLen = (a: Vec, b: Vec) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
  const beside = (p: Vec, vertical: boolean): Vec => (vertical ? [p[0] - 0.35, p[1]] : [p[0], p[1] - 0.35]);
  const parts: { text: string; role: WireText["role"] }[] = [];
  if (info.colour) parts.push({ text: info.colour, role: "colour" });
  if (info.func) parts.push({ text: info.func, role: "function" });
  if (info.number) parts.push({ text: info.number, role: "number" });
  if (!parts.length) return out;
  const need = parts.reduce((s, p) => s + textLen(p.text, p.role), 0) + TEXT_GAP * (parts.length - 1);

  let longest = 0;
  for (let k = 0; k < points.length - 1; k++) if (legLen(points[k]!, points[k + 1]!) > legLen(points[longest]!, points[longest + 1]!)) longest = k;
  const onlyNumber = parts.length === 1 && parts[0]!.role === "number";
  // At the source: the first leg, if the text fits after the inset with a little to spare.
  const atSource = !onlyNumber && legLen(points[0]!, points[1]!) >= SOURCE_INSET + need + 0.5;
  const i = atSource ? 0 : longest;
  const a = points[i]!;
  const b = points[i + 1]!;
  if (legLen(a, b) === 0) return out;
  const vertical = a[0] === b[0];
  // Start of the group along the leg: the inset at the source, else centred (even if it overhangs),
  // except that an overhang doesn't cross a busbar the wire lands on.
  const len = legLen(a, b);
  let d = atSource ? SOURCE_INSET : (len - need) / 2;
  if (!atSource && need > len) {
    const railA = i === 0 && !!info.railFrom;
    const railB = i === points.length - 2 && !!info.railTo;
    if (railA && !railB) d = 0.3;
    else if (railB && !railA) d = len - 0.3 - need;
  }
  // Colour nearest the source, as before.
  for (const p of parts) {
    const w = textLen(p.text, p.role);
    out.push({ text: p.text, at: beside(along(a, b, d + w / 2), vertical), vertical, anchor: "middle", role: p.role, size: sizeOf(p.role) });
    d += w + TEXT_GAP;
  }
  return out;
}

/** A point a fraction of the way along a route, and its leg (v0.4.x T13). */
export function pointAlong(points: Vec[], f: number): { at: Vec; leg: number } {
  const lens = points.slice(1).map((p, i) => Math.abs(p[0] - points[i]![0]) + Math.abs(p[1] - points[i]![1]));
  const total = lens.reduce((a, b) => a + b, 0);
  let d = Math.max(0, Math.min(1, f)) * total;
  for (let i = 0; i < lens.length; i++) {
    const l = lens[i]!;
    if (d <= l || i === lens.length - 1) {
      const a = points[i]!;
      const b = points[i + 1]!;
      const k = l ? Math.min(1, d / l) : 0;
      return { at: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], leg: i };
    }
    d -= l;
  }
  return { at: points[0]!, leg: 0 };
}

/** The fraction along a route nearest a point (for dragging a wire's text along it). */
export function fractionAlong(points: Vec[], p: Vec): number {
  const lens = points.slice(1).map((q, i) => Math.abs(q[0] - points[i]![0]) + Math.abs(q[1] - points[i]![1]));
  const total = lens.reduce((a, b) => a + b, 0) || 1;
  let best = { d: Infinity, f: 0 };
  let run = 0;
  for (let i = 0; i < lens.length; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const l = lens[i]!;
    const k = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / (l * l))) : 0;
    const q: Vec = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d < best.d) best = { d, f: (run + l * k) / total };
    run += l;
  }
  return best.f;
}

/** Parts of a wire's text centred together at a fraction along it, on the leg there. */
function placedAlong(points: Vec[], parts: { text: string; role: WireText["role"] }[], f: number): WireText[] {
  const { at, leg } = pointAlong(points, f);
  const a = points[leg]!;
  const b = points[leg + 1] ?? a;
  const vertical = a[0] === b[0] && a[1] !== b[1];
  const need = parts.reduce((s, p) => s + textLen(p.text, p.role), 0) + TEXT_GAP * (parts.length - 1);
  const dir: Vec = vertical ? [0, Math.sign(b[1] - a[1]) || 1] : [Math.sign(b[0] - a[0]) || 1, 0];
  let d = -need / 2;
  const out: WireText[] = [];
  for (const p of parts) {
    const w = textLen(p.text, p.role);
    const c: Vec = [at[0] + dir[0] * (d + w / 2), at[1] + dir[1] * (d + w / 2)];
    out.push({ text: p.text, at: vertical ? [c[0] - 0.35, c[1]] : [c[0], c[1] - 0.35], vertical, anchor: "middle", role: p.role, size: sizeOf(p.role) });
    d += w + TEXT_GAP;
  }
  return out;
}

export { BLOCK_HALF, BLOCK_INSET } from "./blocks";

/**
 * The strip names along a boundary's terminal block: one at the left end and
 * one wherever the strip changes, just before its first terminal.
 */
export function blockLabels(page: Page): { x: number; text: string; anchor: "start" | "end" }[] {
  if (page.boundaryY === null) return [];
  const terms = page.elements
    .filter((e) => e.symbol === "terminal" && e.params.onBlock === true)
    .sort((a, b) => a.pos[0] - b.pos[0]);
  const out: { x: number; text: string; anchor: "start" | "end" }[] = [];
  let last = "";
  for (const t of terms) {
    const strip = String(t.params.strip ?? "X1").trim() || "X1";
    if (strip === last) continue;
    out.push(out.length === 0 ? { x: BLOCK_INSET + 0.6, text: strip, anchor: "start" } : { x: t.pos[0] - 1.3, text: strip, anchor: "end" });
    last = strip;
  }
  return out;
}

/** Some wire's stored route no longer meets its ends (a part changed shape since), or has none. */
export function routesStale(page: Page): boolean {
  return page.segments.some((s) => {
    if (s.points.length < 2) return true;
    const a = endPoint(page, s.from);
    const b = endPoint(page, s.to);
    if (!a || !b) return false;
    const f = s.points[0]!;
    const l = s.points[s.points.length - 1]!;
    return f[0] !== a[0] || f[1] !== a[1] || l[0] !== b[0] || l[1] !== b[1];
  });
}

/**
 * Cut out any loop in a square route: wherever a run meets an earlier run
 * (crossing it, or doubling back along it), the route goes straight on from
 * that point instead of going round. The ends stay where they are.
 */
export function removeLoops(points: Vec[]): Vec[] {
  let pts = points.map((p) => [p[0], p[1]] as Vec);
  const between = (v: number, a: number, b: number) => v >= Math.min(a, b) - 1e-9 && v <= Math.max(a, b) + 1e-9;
  // Where runs p1-p2 and q1-q2 meet (null if they don't), choosing the meeting point that keeps the route shortest.
  const meet = (p1: Vec, p2: Vec, q1: Vec, q2: Vec): Vec | null => {
    const pv = p1[0] === p2[0];
    const qv = q1[0] === q2[0];
    if (pv && qv) {
      if (p1[0] !== q1[0]) return null;
      const lo = Math.max(Math.min(p1[1], p2[1]), Math.min(q1[1], q2[1]));
      const hi = Math.min(Math.max(p1[1], p2[1]), Math.max(q1[1], q2[1]));
      if (lo > hi + 1e-9) return null;
      const best = Math.min(Math.max(q2[1], lo), hi);
      return [p1[0], best];
    }
    if (!pv && !qv) {
      if (p1[1] !== q1[1]) return null;
      const lo = Math.max(Math.min(p1[0], p2[0]), Math.min(q1[0], q2[0]));
      const hi = Math.min(Math.max(p1[0], p2[0]), Math.max(q1[0], q2[0]));
      if (lo > hi + 1e-9) return null;
      const best = Math.min(Math.max(q2[0], lo), hi);
      return [best, p1[1]];
    }
    const [v1, v2, h1, h2] = pv ? [p1, p2, q1, q2] : [q1, q2, p1, p2];
    const x = v1[0];
    const y = h1[1];
    return between(x, h1[0], h2[0]) && between(y, v1[1], v2[1]) ? [x, y] : null;
  };
  for (let guard = 0; guard < 50; guard++) {
    let cut = false;
    outer: for (let i = 0; i < pts.length - 1; i++) {
      for (let j = pts.length - 2; j >= i + 2; j--) {
        const x = meet(pts[i]!, pts[i + 1]!, pts[j]!, pts[j + 1]!);
        if (!x) continue;
        pts = [...pts.slice(0, i + 1), x, ...pts.slice(j + 1)];
        cut = true;
        break outer;
      }
    }
    if (!cut) break;
  }
  return simplifyRoute(pts);
}

