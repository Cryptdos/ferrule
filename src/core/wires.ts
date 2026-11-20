/**
 * Wire geometry (DESIGN.md §3, milestone 2). Routes are orthogonal
 * polylines in grid units whose first and last points sit on terminals.
 * These helpers are pure so the UI, the router and tests share them.
 */
import type { Vec } from "./geometry";
import type { Element, Page, Segment, TerminalRef } from "./model";
import { terminalDir, terminalPoint } from "./symbols";

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
      const isBar = el.symbol === "rail" || el.symbol === "busbar";
      const len = typeof el.params.length === "number" ? el.params.length : 0;
      const tap = isBar && ref[1] !== "0" && ref[1] !== String(len);
      const cur = count.get(key) ?? { n: 0, at, tap };
      cur.n += 1;
      count.set(key, cur);
    }
  }
  return [...count.values()].filter((c) => c.tap || c.n >= 3).map((c) => c.at);
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
