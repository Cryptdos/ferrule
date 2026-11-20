/**
 * Model operations. Every edit to a project goes through one of these
 * small functions, used by the UI now and the MCP tools later (DESIGN.md
 * §3, §12). They change the project in place; callers that want undo take
 * a copy first.
 */
import { type Rotation, type Vec, clampToArea, snapVec } from "./geometry";
import { refreshConductors } from "./conductors";
import { type Element, type Page, type ParamValue, type Project, type Segment, type TerminalRef, newId } from "./model";
import { defaultParams, requireSymbol, terminalPoint } from "./symbols";
import { isOrthogonal, routeOf, simplifyRoute } from "./wires";

export class OpError extends Error {}

export function getPage(project: Project, pageId: string): Page {
  const page = project.pages.find((p) => p.id === pageId);
  if (!page) throw new OpError(`No page "${pageId}"`);
  return page;
}

export function getElement(page: Page, id: string): Element {
  const el = page.elements.find((e) => e.id === id);
  if (!el) throw new OpError(`No element "${id}" on page ${page.number}`);
  return el;
}

export interface AddElementOptions {
  tag?: string;
  label?: string;
  rot?: Rotation;
  zone?: Element["zone"];
  params?: Record<string, ParamValue>;
}

export function addElement(
  project: Project,
  pageId: string,
  symbol: string,
  pos: Vec,
  opts: AddElementOptions = {},
): Element {
  requireSymbol(symbol);
  const page = getPage(project, pageId);
  const el: Element = {
    id: newId("e"),
    symbol,
    tag: opts.tag ?? "",
    label: opts.label ?? "",
    pos: clampToArea(snapVec(pos)),
    rot: opts.rot ?? 0,
    zone: opts.zone ?? "internal",
    params: { ...defaultParams(symbol), ...opts.params },
    links: [],
  };
  page.elements.push(el);
  return el;
}

/** Move elements by a delta, snapped to the grid and kept on the page. */
export function moveElements(project: Project, pageId: string, ids: string[], delta: Vec): void {
  const page = getPage(project, pageId);
  const d = snapVec(delta);
  for (const id of ids) {
    const el = getElement(page, id);
    el.pos = clampToArea([el.pos[0] + d[0], el.pos[1] + d[1]]);
  }
}

/** Rotate elements 90° clockwise about their own origins. */
export function rotateElements(project: Project, pageId: string, ids: string[]): void {
  const page = getPage(project, pageId);
  for (const id of ids) {
    const el = getElement(page, id);
    el.rot = (((el.rot + 90) % 360) as Rotation);
  }
}

export function deleteElements(project: Project, pageId: string, ids: string[]): void {
  const page = getPage(project, pageId);
  const gone = new Set(ids);
  page.elements = page.elements.filter((e) => !gone.has(e.id));
  page.segments = page.segments.filter((s) => !gone.has(s.from[0]) && !gone.has(s.to[0]));
  for (const el of page.elements) el.links = el.links.filter((l) => !gone.has(l));
  dropOrphanJunctions(page);
  refreshConductors(project);
}

export interface ElementPatch {
  tag?: string;
  label?: string;
  zone?: Element["zone"];
  rot?: Rotation;
  params?: Record<string, ParamValue>;
}

export function updateElement(project: Project, pageId: string, id: string, patch: ElementPatch): void {
  const el = getElement(getPage(project, pageId), id);
  if (patch.tag !== undefined) el.tag = patch.tag.trim();
  if (patch.label !== undefined) el.label = patch.label;
  if (patch.zone !== undefined) el.zone = patch.zone;
  if (patch.rot !== undefined) el.rot = patch.rot;
  if (patch.params) el.params = { ...el.params, ...patch.params };
}

/** Copy elements to a new position (Ctrl+D / paste). Returns the new ids. */
export function duplicateElements(project: Project, pageId: string, ids: string[], delta: Vec): string[] {
  const page = getPage(project, pageId);
  const out: string[] = [];
  for (const id of ids) {
    const src = getElement(page, id);
    if (src.symbol === "junction") continue;
    const copy: Element = JSON.parse(JSON.stringify(src));
    copy.id = newId("e");
    copy.tag = "";
    copy.links = [];
    copy.pos = clampToArea(snapVec([src.pos[0] + delta[0], src.pos[1] + delta[1]]));
    page.elements.push(copy);
    out.push(copy.id);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Wires

export function getSegment(page: Page, id: string): Segment {
  const seg = page.segments.find((s) => s.id === id);
  if (!seg) throw new OpError(`No wire "${id}" on page ${page.number}`);
  return seg;
}

const sameRef = (a: TerminalRef, b: TerminalRef) => a[0] === b[0] && a[1] === b[1];

/**
 * Wire one terminal to another. The route starts as "auto"; the router
 * fills in its points.
 */
export function connect(project: Project, pageId: string, from: TerminalRef, to: TerminalRef): Segment {
  const page = getPage(project, pageId);
  for (const ref of [from, to]) {
    const el = getElement(page, ref[0]);
    if (!terminalPoint(el, ref[1])) throw new OpError(`${el.symbol} has no terminal "${ref[1]}"`);
  }
  if (sameRef(from, to)) throw new OpError("Can't wire a terminal to itself");
  if (from[0] === to[0] && !requireSymbol(getElement(page, from[0]).symbol).bridged) {
    throw new OpError("Can't wire a component across itself");
  }
  if (page.segments.some((s) => (sameRef(s.from, from) && sameRef(s.to, to)) || (sameRef(s.from, to) && sameRef(s.to, from)))) {
    throw new OpError("Those terminals are already wired together");
  }
  const seg: Segment = { id: newId("w"), conductor: "", from: [...from], to: [...to], route: "auto", points: [] };
  page.segments.push(seg);
  refreshConductors(project);
  return seg;
}

export function deleteSegments(project: Project, pageId: string, ids: string[]): void {
  const page = getPage(project, pageId);
  const gone = new Set(ids);
  page.segments = page.segments.filter((s) => !gone.has(s.id));
  dropOrphanJunctions(page);
  refreshConductors(project);
}

/** Set a hand-drawn route. Must be square and start and end on the wire's terminals. */
export function setManualRoute(project: Project, pageId: string, id: string, points: Vec[]): void {
  const page = getPage(project, pageId);
  const seg = getSegment(page, id);
  const pts = simplifyRoute(points.map(snapVec));
  const a = terminalPoint(getElement(page, seg.from[0]), seg.from[1])!;
  const b = terminalPoint(getElement(page, seg.to[0]), seg.to[1])!;
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (!first || !last || first[0] !== a[0] || first[1] !== a[1] || last[0] !== b[0] || last[1] !== b[1]) {
    throw new OpError("A wire route must start and end on its terminals");
  }
  if (!isOrthogonal(pts)) throw new OpError("Wire routes must be horizontal and vertical runs");
  seg.points = pts;
  seg.route = pts.length >= 3 ? "manual" : "auto";
}

/** Hand a wire back to the automatic router. */
export function resetRoute(project: Project, pageId: string, ids: string[]): void {
  const page = getPage(project, pageId);
  for (const id of ids) {
    const seg = getSegment(page, id);
    seg.route = "auto";
    seg.points = [];
  }
}

/**
 * Tee into a wire: put a junction at `at` (a grid point on the wire) and
 * split the wire there. Returns the junction element.
 */
export function splitSegment(project: Project, pageId: string, id: string, at: Vec): Element {
  const page = getPage(project, pageId);
  const seg = getSegment(page, id);
  const pts = routeOf(page, seg);
  const p = snapVec(at);
  let leg = -1;
  for (let i = 0; i < pts.length - 1 && leg < 0; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const within = (v: number, lo: number, hi: number) => v >= Math.min(lo, hi) && v <= Math.max(lo, hi);
    if ((a[0] === b[0] && p[0] === a[0] && within(p[1], a[1], b[1])) || (a[1] === b[1] && p[1] === a[1] && within(p[0], a[0], b[0]))) {
      leg = i;
    }
  }
  if (leg < 0) throw new OpError("That point isn't on the wire");
  const ends = [pts[0]!, pts[pts.length - 1]!];
  if (ends.some((e) => e[0] === p[0] && e[1] === p[1])) throw new OpError("Tee into the wire away from its terminals");

  const junction: Element = {
    id: newId("e"),
    symbol: "junction",
    tag: "",
    label: "",
    pos: p,
    rot: 0,
    zone: "internal",
    params: {},
    links: [],
  };
  page.elements.push(junction);
  const first: Segment = {
    id: newId("w"),
    conductor: seg.conductor,
    from: seg.from,
    to: [junction.id, "j"],
    route: seg.route,
    points: seg.route === "manual" ? simplifyRoute([...pts.slice(0, leg + 1), p]) : [],
  };
  const second: Segment = {
    id: newId("w"),
    conductor: seg.conductor,
    from: [junction.id, "j"],
    to: seg.to,
    route: seg.route,
    points: seg.route === "manual" ? simplifyRoute([p, ...pts.slice(leg + 1)]) : [],
  };
  for (const s of [first, second]) if (s.route === "manual" && s.points.length < 3) s.route = "auto";
  page.segments.splice(page.segments.indexOf(seg), 1, first, second);
  refreshConductors(project);
  return junction;
}

/**
 * Junctions left with fewer than three wires aren't junctions any more:
 * with two, join the wires back into one; with none or one, remove it.
 */
function dropOrphanJunctions(page: Page): void {
  for (const j of page.elements.filter((e) => e.symbol === "junction")) {
    const attached = page.segments.filter((s) => s.from[0] === j.id || s.to[0] === j.id);
    if (attached.length >= 3) continue;
    page.elements = page.elements.filter((e) => e.id !== j.id);
    page.segments = page.segments.filter((s) => !attached.includes(s));
    if (attached.length === 2) {
      const [a, b] = attached as [Segment, Segment];
      const farA = a.from[0] === j.id ? a.to : a.from;
      const farB = b.from[0] === j.id ? b.to : b.from;
      if (!sameRef(farA, farB)) {
        page.segments.push({ id: a.id, conductor: a.conductor, from: farA, to: farB, route: "auto", points: [] });
      }
    }
  }
}

/** One end of a wire being drawn: a terminal, or a point on an existing wire. */
export type WireEnd = { terminal: TerminalRef } | { wire: string; at: Vec };

function segmentAt(page: Page, at: Vec, prefer: string): Segment | undefined {
  const onRoute = (s: Segment) => {
    const pts = routeOf(page, s);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const within = (v: number, lo: number, hi: number) => v >= Math.min(lo, hi) && v <= Math.max(lo, hi);
      if ((a[0] === b[0] && at[0] === a[0] && within(at[1], a[1], b[1])) || (a[1] === b[1] && at[1] === a[1] && within(at[0], a[0], b[0]))) {
        return true;
      }
    }
    return false;
  };
  const preferred = page.segments.find((s) => s.id === prefer);
  if (preferred && onRoute(preferred)) return preferred;
  return page.segments.find(onRoute);
}

/** Draw a wire between two ends, teeing into existing wires where an end is on one. */
export function wire(project: Project, pageId: string, a: WireEnd, b: WireEnd): Segment {
  const page = getPage(project, pageId);
  const resolve = (end: WireEnd): TerminalRef => {
    if ("terminal" in end) return end.terminal;
    const at = snapVec(end.at);
    const existing = page.elements.find((e) => e.symbol === "junction" && e.pos[0] === at[0] && e.pos[1] === at[1]);
    if (existing) return [existing.id, "j"];
    const seg = segmentAt(page, at, end.wire);
    if (!seg) throw new OpError("That point isn't on a wire");
    return [splitSegment(project, pageId, seg.id, at).id, "j"];
  };
  const from = resolve(a);
  const to = resolve(b);
  return connect(project, pageId, from, to);
}
