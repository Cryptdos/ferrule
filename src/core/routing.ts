/**
 * Automatic wire routing with libavoid (DESIGN.md §3): orthogonal routes
 * around symbol bodies, with parallel wires nudged a grid unit apart.
 *
 * The libavoid module is passed in, so the browser, the server and tests
 * can each load the wasm their own way. Without it, routes fall back to a
 * simple one-bend route.
 */
import type { Avoid, ConnRef } from "libavoid-js";
import type { Rect, Vec } from "./geometry";
import type { Element, Page, Segment, TerminalRef } from "./model";
import { benchOf, localGeometry, type Prim } from "./symbols";
import { endDir, endPoint, findElement, refitManual, removeLoops, simpleRoute, simplifyRoute } from "./wires";

/** Gap kept between parallel wires, and between wires and symbol bodies. */
const NUDGE = 1;
const BUFFER = 0.25;
/** How far symbol outlines are pulled in, so terminals sit outside them. */
const INSET = 0.5;

/** Symbols wires may cross or run along: conductors themselves, or a cable screen drawn over the cores. */
const NOT_OBSTACLES = new Set(["junction", "rail", "busbar", "screen"]);

/** Rough outline of a symbol's text, so wires keep off tags, labels and ratings. */
function textRect(el: Element, p: Extract<Prim, { t: "text" }>): Rect | null {
  const s = p.text
    .replace("{tag}", el.tag || "K10-10")
    .replace("{label}", el.label ?? "")
    .replace("{xref}", "10-10");
  if (!s.trim()) return null;
  const len = s.length * p.size * 0.55;
  const h = p.size * 0.8;
  const start = p.anchor === "start" ? 0 : p.anchor === "middle" ? -len / 2 : -len;
  // Vertical text reads up the page: its length runs upwards from the anchor.
  const r = p.vertical
    ? { x: p.at[0] - h, y: p.at[1] - start - len, w: h, h: len }
    : { x: p.at[0] + start, y: p.at[1] - h, w: len, h };
  return { x: el.pos[0] + r.x, y: el.pos[1] + r.y, w: r.w, h: r.h };
}

function obstacleRect(el: Element): Rect | null {
  // Annotations (text, boxes, tables, pictures) are drawn over; wires don't avoid them.
  if (NOT_OBSTACLES.has(el.symbol) || benchOf(el) === "annotate") return null;
  const g = localGeometry(el, "");
  // Outline of everything drawn (leads included), pulled in on the sides
  // that carry terminals so the terminals sit just outside it.
  const r = g.bbox;
  let [x0, y0, x1, y1] = [r.x, r.y, r.x + r.w, r.y + r.h];
  const on = (v: number, edge: number) => Math.abs(v - edge) < 0.01;
  const ts = g.terminals.map((t) => t.at);
  if (ts.some((t) => on(t[1], r.y))) y0 += INSET;
  if (ts.some((t) => on(t[1], r.y + r.h))) y1 -= INSET;
  if (ts.some((t) => on(t[0], r.x))) x0 += INSET;
  if (ts.some((t) => on(t[0], r.x + r.w))) x1 -= INSET;
  if (x1 - x0 < 0.2 || y1 - y0 < 0.2) return null;
  return { x: el.pos[0] + x0, y: el.pos[1] + y0, w: x1 - x0, h: y1 - y0 };
}

function dirFlags(avoid: Avoid, page: Page, ref: [string, string]): number {
  const F = avoid.ConnDirFlag;
  const el = findElement(page, ref[0]);
  if (el && (el.symbol === "rail" || el.symbol === "busbar")) {
    // Rails are tapped from above or below, never along their length.
    return el.rot % 180 === 0 ? F.ConnDirUp | F.ConnDirDown : F.ConnDirLeft | F.ConnDirRight;
  }
  switch (endDir(page, ref)) {
    case "up":
      return F.ConnDirUp;
    case "down":
      return F.ConnDirDown;
    case "left":
      return F.ConnDirLeft;
    case "right":
      return F.ConnDirRight;
    default:
      return F.ConnDirAll;
  }
}

// ---------------------------------------------------------------------------
// Checking the router's work

type Meet = "cross" | "touch" | null;

/** How two square runs meet: a clean crossing, a touch (a shared point or an overlap), or not at all. */
function meet(p1: Vec, p2: Vec, q1: Vec, q2: Vec): Meet {
  const eps = 1e-6;
  const pv = Math.abs(p1[0] - p2[0]) < eps;
  const qv = Math.abs(q1[0] - q2[0]) < eps;
  const inside = (v: number, a: number, b: number) => v > Math.min(a, b) + eps && v < Math.max(a, b) - eps;
  const within = (v: number, a: number, b: number) => v >= Math.min(a, b) - eps && v <= Math.max(a, b) + eps;
  if (pv === qv) {
    // Parallel: they only meet if on one line and their extents overlap or touch.
    const [i, j] = pv ? [0, 1] : [1, 0];
    if (Math.abs(p1[i] - q1[i]) > eps) return null;
    const lo = Math.max(Math.min(p1[j], p2[j]), Math.min(q1[j], q2[j]));
    const hi = Math.min(Math.max(p1[j], p2[j]), Math.max(q1[j], q2[j]));
    return lo <= hi + eps ? "touch" : null;
  }
  const [v1, v2, h1, h2] = pv ? [p1, p2, q1, q2] : [q1, q2, p1, p2];
  const x = v1[0];
  const y = h1[1];
  if (!within(x, h1[0], h2[0]) || !within(y, v1[1], v2[1])) return null;
  return inside(x, h1[0], h2[0]) && inside(y, v1[1], v2[1]) ? "cross" : "touch";
}

/** Does a run pass through a rectangle (not just along its edge)? */
function throughRect(p: Vec, q: Vec, r: Rect): boolean {
  const e = 0.05;
  const [x0, x1] = [Math.min(p[0], q[0]), Math.max(p[0], q[0])];
  const [y0, y1] = [Math.min(p[1], q[1]), Math.max(p[1], q[1])];
  return x1 > r.x + e && x0 < r.x + r.w - e && y1 > r.y + e && y0 < r.y + r.h - e;
}

/** What's wrong with a route: it meets itself, goes through a part, or touches a wire it isn't joined to. */
function judge(pts: Vec[], others: Vec[][], rects: Rect[]): { ok: boolean; crossings: number } {
  for (let i = 0; i < pts.length - 1; i++) {
    for (let j = i + 2; j < pts.length - 1; j++) if (meet(pts[i]!, pts[i + 1]!, pts[j]!, pts[j + 1]!)) return { ok: false, crossings: 0 };
    for (const r of rects) if (throughRect(pts[i]!, pts[i + 1]!, r)) return { ok: false, crossings: 0 };
  }
  let crossings = 0;
  for (const o of others) {
    for (let i = 0; i < pts.length - 1; i++) {
      for (let j = 0; j < o.length - 1; j++) {
        const m = meet(pts[i]!, pts[i + 1]!, o[j]!, o[j + 1]!);
        if (m === "touch") return { ok: false, crossings: 0 };
        if (m === "cross") crossings++;
      }
    }
  }
  return { ok: true, crossings };
}

const STEP: Record<string, Vec> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

/** Simple square routes from a to b with one or two corners, leaving and arriving the way the terminals face. */
function candidates(a: Vec, da: string, b: Vec, db: string): Vec[][] {
  const out: Vec[][] = [];
  const leaves = (d: string, from: Vec, to: Vec) => {
    const s = STEP[d];
    if (!s) return true;
    // The first run goes the way the terminal faces, at least a unit.
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    return s[0] !== 0 ? Math.sign(dx) === s[0] && Math.abs(dx) >= 1 && dy === 0 : Math.sign(dy) === s[1] && Math.abs(dy) >= 1 && dx === 0;
  };
  const vert = (d: string) => d === "up" || d === "down" || d === "any";
  const horiz = (d: string) => d === "left" || d === "right" || d === "any";
  const lo = (i: 0 | 1) => Math.floor(Math.min(a[i], b[i])) - 10;
  const hi = (i: 0 | 1) => Math.ceil(Math.max(a[i], b[i])) + 10;
  if (vert(da) && vert(db)) {
    for (let y = lo(1); y <= hi(1); y++) {
      const r: Vec[] = [a, [a[0], y], [b[0], y], b];
      if (leaves(da, a, r[1]!) && leaves(db, b, r[2]!)) out.push(r);
    }
  }
  if (horiz(da) && horiz(db)) {
    for (let x = lo(0); x <= hi(0); x++) {
      const r: Vec[] = [a, [x, a[1]], [x, b[1]], b];
      if (leaves(da, a, r[1]!) && leaves(db, b, r[2]!)) out.push(r);
    }
  }
  for (const corner of [
    [a[0], b[1]],
    [b[0], a[1]],
  ] as Vec[]) {
    const r: Vec[] = [a, corner, b];
    if (leaves(da, a, corner) && leaves(db, b, corner)) out.push(r);
  }
  return out.map((r) => simplifyRoute(r));
}

const length = (pts: Vec[]) => pts.slice(1).reduce((n, p, i) => n + Math.abs(p[0] - pts[i]![0]) + Math.abs(p[1] - pts[i]![1]), 0);

/**
 * The router occasionally returns a route that loops back over itself or runs
 * along another wire (seen with two wires whose ends are swapped). Check every
 * route it gave; a bad one is replaced with the best simple route (fewest
 * crossings, then shortest) that clears every part and every other wire.
 */
function repairRoutes(page: Page, segs: Segment[]): void {
  const rects = page.elements.map(obstacleRect).filter((r): r is Rect => !!r);
  for (const seg of segs) {
    const others = page.segments.filter((o) => o.id !== seg.id && o.conductor !== seg.conductor && o.points.length >= 2).map((o) => o.points);
    const a = endPoint(page, seg.from);
    const b = endPoint(page, seg.to);
    if (!a || !b) continue;
    // Ends in line, facing each other, and nothing in the way but text: straight.
    // (Tags and labels are obstacles to steer wires that have room to move,
    // never a reason to bend one that could run straight.)
    if ((a[0] === b[0] || a[1] === b[1]) && seg.points.length > 2) {
      const straight: Vec[] = [a, b];
      const da = STEP[endDir(page, seg.from)];
      const db = STEP[endDir(page, seg.to)];
      const facing = (d: Vec | undefined, from: Vec, to: Vec) =>
        !d || (Math.sign(to[0] - from[0]) === d[0] && Math.sign(to[1] - from[1]) === d[1]);
      if (facing(da, a, b) && facing(db, b, a) && judge(straight, others, rects).ok) {
        seg.points = straight;
        continue;
      }
    }
    if (judge(seg.points, others, rects).ok) continue;
    let best: { pts: Vec[]; score: number } | null = null;
    for (const c of candidates(a, endDir(page, seg.from), b, endDir(page, seg.to))) {
      const j = judge(c, others, rects);
      if (!j.ok) continue;
      const score = j.crossings * 20 + length(c) + (c.length - 2) * 3;
      if (!best || score < best.score) best = { pts: c, score };
    }
    // Nothing simple fits: at least never leave a wire looping over itself.
    seg.points = best ? best.pts : removeLoops(seg.points);
  }
}

/** Round to the grid and tidy, keeping the ends exactly on the terminals. */
function cleanRoute(points: Vec[], a: Vec, b: Vec): Vec[] {
  const pts = points.map(([x, y]) => [Math.round(x), Math.round(y)] as Vec);
  pts[0] = a;
  pts[pts.length - 1] = b;
  const out = simplifyRoute(pts);
  for (let i = 1; i < out.length; i++) {
    const p = out[i - 1]!;
    const q = out[i]!;
    // Rounding can skew a leg by a unit; square it with an extra corner.
    if (p[0] !== q[0] && p[1] !== q[1]) {
      out.splice(i, 0, [q[0], p[1]]);
      i++;
    }
  }
  // A wire never crosses or doubles back over its own path.
  return removeLoops(simplifyRoute(out));
}

/** How far a wire runs straight out of a terminal before it may turn. */
const STUB = 1;

/** The point a wire's route starts from: a little way out from a symbol's terminal. */
function stubPoint(page: Page, ref: TerminalRef, at: Vec): Vec {
  const el = findElement(page, ref[0]);
  if (!el || NOT_OBSTACLES.has(el.symbol)) return at;
  const d = endDir(page, ref);
  const v: Vec = d === "up" ? [0, -1] : d === "down" ? [0, 1] : d === "left" ? [-1, 0] : d === "right" ? [1, 0] : [0, 0];
  return [at[0] + v[0] * STUB, at[1] + v[1] * STUB];
}

export interface RouteOptions {
  /** Only these segments are re-routed; others keep their points. Default: all auto segments. */
  only?: Set<string>;
}

/**
 * Updates the points of every wire on a page: auto wires are routed,
 * manual wires are refitted to their terminals (and fall back to auto if
 * they can't be kept square).
 */
export function routePage(avoid: Avoid | null, page: Page, opts: RouteOptions = {}): void {
  slideRailTaps(page);
  const auto: { seg: Segment; a: Vec; b: Vec }[] = [];
  for (const seg of page.segments) {
    const a = endPoint(page, seg.from);
    const b = endPoint(page, seg.to);
    if (!a || !b) continue;
    if (seg.route === "manual") {
      const fitted = refitManual(seg.points, a, b);
      if (fitted) {
        seg.points = fitted;
        continue;
      }
      seg.route = "auto";
    }
    if (opts.only && !opts.only.has(seg.id) && seg.points.length >= 2) {
      // Not asked to re-route; just keep the ends attached.
      const first = seg.points[0]!;
      const last = seg.points[seg.points.length - 1]!;
      if (first[0] === a[0] && first[1] === a[1] && last[0] === b[0] && last[1] === b[1]) continue;
    }
    auto.push({ seg, a, b });
  }
  if (!auto.length) return;

  if (!avoid) {
    for (const { seg, a, b } of auto) seg.points = simpleRoute(a, b, endDir(page, seg.from));
    return;
  }

  const router = new avoid.Router(avoid.RouterFlag.OrthogonalRouting);
  try {
    router.setRoutingParameter(avoid.RoutingParameter.shapeBufferDistance, BUFFER);
    router.setRoutingParameter(avoid.RoutingParameter.idealNudgingDistance, NUDGE);
    router.setRoutingParameter(avoid.RoutingParameter.segmentPenalty, 20);
    router.setRoutingOption(avoid.RoutingOption.nudgeOrthogonalSegmentsConnectedToShapes, true);
    router.setRoutingOption(avoid.RoutingOption.nudgeSharedPathsWithCommonEndPoint, true);
    for (const el of page.elements) {
      const r = obstacleRect(el);
      if (r) router.addShape({ x: r.x, y: r.y, width: r.w, height: r.h });
      // Tags, ratings and colour codes beside a symbol get their own small obstacles,
      // so a wire doesn't run through them. (Tags and labels are often placed
      // across a rung on purpose; wires going round them would wander.)
      if (!NOT_OBSTACLES.has(el.symbol) && el.symbol !== "plant-view" && benchOf(el) === "draft" && el.params.onBlock !== true) {
        // Tags aren't known until Renumber: allow for a typical one.
        for (const p of localGeometry(el, el.tag || "K10-10").prims) {
          if (p.t !== "text" || (p.role !== "note" && p.role !== "tag")) continue;
          const t = textRect(el, p);
          if (t && t.w > 0.3) router.addShape({ x: t.x, y: t.y, width: t.w, height: t.h });
        }
      }
    }
    const conns: { seg: Segment; a: Vec; b: Vec; conn: ConnRef; sa: Vec; sb: Vec }[] = [];
    for (const item of auto) {
      // Every wire leaves a symbol's terminal straight for a short way before
      // it turns, clear of the terminal's own marking.
      let sa = stubPoint(page, item.seg.from, item.a);
      let sb = stubPoint(page, item.seg.to, item.b);
      const gap = Math.abs(item.a[0] - item.b[0]) + Math.abs(item.a[1] - item.b[1]);
      if (gap <= 2 * STUB) {
        sa = item.a;
        sb = item.b;
      }
      const conn = router.addConnector(
        { x: sa[0], y: sa[1], directions: dirFlags(avoid, page, item.seg.from) },
        { x: sb[0], y: sb[1], directions: dirFlags(avoid, page, item.seg.to) },
      );
      conns.push({ ...item, conn, sa, sb });
    }
    router.processTransaction();
    for (const { seg, a, b, conn, sa, sb } of conns) {
      const route = conn.displayRoute().map((p) => [p.x, p.y] as Vec);
      seg.points = route.length >= 2 ? cleanRoute([a, sa, ...route, sb, b], a, b) : simpleRoute(a, b, endDir(page, seg.from));
    }
    repairRoutes(page, conns.map((c) => c.seg));
  } finally {
    router.delete();
  }
}

/**
 * Wires on rails and busbars tap straight above or below the other end:
 * when a symbol moves along a rung, its rail tap moves with it rather than
 * the wire running along the rail. Hand-routed wires keep their tap.
 */
export function slideRailTaps(page: Page): void {
  // Only when the other end faces the rail: a terminal pointing away (a lamp's
  // V- below it, wired back up) keeps the tap where it was put, or the wire
  // would have to double back past its own symbol.
  const faces = (dir: string, railBelow: boolean, horizontal: boolean) =>
    dir === "any" || (horizontal ? dir === (railBelow ? "down" : "up") : true);
  for (const seg of page.segments) {
    if (seg.route === "manual") continue;
    for (const [railEnd, otherEnd] of [
      [seg.from, seg.to],
      [seg.to, seg.from],
    ] as [TerminalRef, TerminalRef][]) {
      const rail = findElement(page, railEnd[0]);
      if (!rail || (rail.symbol !== "rail" && rail.symbol !== "busbar")) continue;
      if (otherEnd[0] === rail.id) continue;
      const p = endPoint(page, otherEnd);
      if (!p) continue;
      const len = typeof rail.params.length === "number" ? rail.params.length : 0;
      const horizontal = rail.rot % 180 === 0;
      if (!faces(endDir(page, otherEnd), horizontal && rail.pos[1] > p[1], horizontal)) continue;
      const along =
        rail.rot === 0 ? p[0] - rail.pos[0] : rail.rot === 180 ? rail.pos[0] - p[0] : rail.rot === 90 ? p[1] - rail.pos[1] : rail.pos[1] - p[1];
      if (Number.isInteger(along) && along >= 0 && along <= len) railEnd[1] = String(along);
    }
  }
}
