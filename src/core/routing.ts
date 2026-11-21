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
import { localGeometry } from "./symbols";
import { endDir, endPoint, findElement, refitManual, simpleRoute, simplifyRoute } from "./wires";

/** Gap kept between parallel wires, and between wires and symbol bodies. */
const NUDGE = 1;
const BUFFER = 0.25;
/** How far symbol outlines are pulled in, so terminals sit outside them. */
const INSET = 0.5;

/** Symbols wires may cross or run along: conductors themselves, or a cable screen drawn over the cores. */
const NOT_OBSTACLES = new Set(["junction", "rail", "busbar", "screen"]);

function obstacleRect(el: Element): Rect | null {
  if (NOT_OBSTACLES.has(el.symbol)) return null;
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
  return simplifyRoute(out);
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
    }
    const conns: { seg: Segment; a: Vec; b: Vec; conn: ConnRef }[] = [];
    for (const item of auto) {
      const conn = router.addConnector(
        { x: item.a[0], y: item.a[1], directions: dirFlags(avoid, page, item.seg.from) },
        { x: item.b[0], y: item.b[1], directions: dirFlags(avoid, page, item.seg.to) },
      );
      conns.push({ ...item, conn });
    }
    router.processTransaction();
    for (const { seg, a, b, conn } of conns) {
      const route = conn.displayRoute().map((p) => [p.x, p.y] as Vec);
      seg.points = route.length >= 2 ? cleanRoute(route, a, b) : simpleRoute(a, b, endDir(page, seg.from));
    }
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
      const along =
        rail.rot === 0 ? p[0] - rail.pos[0] : rail.rot === 180 ? rail.pos[0] - p[0] : rail.rot === 90 ? p[1] - rail.pos[1] : rail.pos[1] - p[1];
      if (Number.isInteger(along) && along >= 0 && along <= len) railEnd[1] = String(along);
    }
  }
}
