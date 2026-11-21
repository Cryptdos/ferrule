/**
 * Model operations. Every edit to a project goes through one of these
 * small functions, used by the UI now and the MCP tools later (DESIGN.md
 * §3, §12). They change the project in place; callers that want undo take
 * a copy first.
 */
import { AREA_UNITS, type Rotation, type Vec, clampToArea, snapVec } from "./geometry";
import { refreshConductors } from "./conductors";
import {
  type Element,
  type Page,
  type ParamValue,
  type PlantItem,
  type PlantGroup,
  type Asset,
  type Project,
  type Section,
  type Segment,
  type TerminalRef,
  newId,
} from "./model";
import { defaultParams, getSymbol, plantTerminalName, requireSymbol, terminalPoint } from "./symbols";
import { isOrthogonal, routeOf, simplifyRoute } from "./wires";
import { isMaster, isSlave, locate } from "./xref";
import { colourCode, lampColour } from "./wirecolours";

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

/** Lamp colours written the usual way whatever the case they came in ("GN" → "Gn"). */
function normaliseParams(symbol: string, params: Record<string, ParamValue>): Record<string, ParamValue> {
  if (symbol === "lamp" && typeof params.colour === "string") params.colour = lampColour(params.colour);
  return params;
}

export function addElement(
  project: Project,
  pageId: string,
  symbol: string,
  pos: Vec,
  opts: AddElementOptions = {},
): Element {
  if (!getSymbol(symbol)) throw new OpError(`Unknown symbol "${symbol}" (see list_symbols)`);
  const page = getPage(project, pageId);
  const el: Element = {
    id: newId("e"),
    symbol,
    tag: opts.tag ?? "",
    label: opts.label ?? "",
    pos: clampToArea(snapVec(pos)),
    rot: opts.rot ?? 0,
    zone: opts.zone ?? "internal",
    params: normaliseParams(symbol, { ...defaultParams(symbol), ...opts.params }),
    links: [],
  };
  page.elements.push(el);
  if (page.boundaryY !== null) updateZones(page);
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
  if (page.boundaryY !== null) updateZones(page);
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
  for (const pg of project.pages) for (const el of pg.elements) el.links = el.links.filter((l) => !gone.has(l));
  dropOrphanJunctions(page);
  refreshConductors(project);
  pruneAssets(project);
}

// ---------------------------------------------------------------------------
// Pictures

/** Keep a picture in the project. Returns its id. The same picture twice is kept once. */
export function addAsset(project: Project, asset: Asset): string {
  project.assets ??= {};
  for (const [id, a] of Object.entries(project.assets)) if (a.data === asset.data) return id;
  const id = newId("a");
  project.assets[id] = { ...asset };
  return id;
}

/** Put a picture on a sheet, `width` grid units wide (its height follows its shape). */
export function addImage(project: Project, pageId: string, assetId: string, pos: Vec, width = 40): Element {
  const a = project.assets?.[assetId];
  if (!a) throw new OpError("That picture isn't in the project");
  const w = Math.max(2, Math.round(width));
  const h = Math.max(2, Math.min(120, Math.round((w * a.h) / Math.max(1, a.w))));
  return addElement(project, pageId, "image", pos, { params: { asset: assetId, w, h } });
}

/** The title block logo; null takes it away. */
export function setLogo(project: Project, assetId: string | null): void {
  if (assetId && !project.assets?.[assetId]) throw new OpError("That picture isn't in the project");
  if (assetId) project.logo = assetId;
  else delete project.logo;
  pruneAssets(project);
}

/** Drop pictures nothing uses any more, so the file doesn't carry them. */
export function pruneAssets(project: Project): void {
  if (!project.assets) return;
  const used = new Set<string>(project.logo ? [project.logo] : []);
  for (const pg of project.pages) for (const el of pg.elements) if (el.symbol === "image") used.add(String(el.params.asset ?? ""));
  for (const t of project.templates) for (const el of t.elements) if (el.symbol === "image") used.add(String(el.params.asset ?? ""));
  for (const id of Object.keys(project.assets)) if (!used.has(id)) delete project.assets[id];
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
  if (patch.params) el.params = normaliseParams(el.symbol, { ...el.params, ...patch.params });
  // A linked arrow's partner is always the other way round: one source, one destination.
  if (el.symbol === "offpage" && patch.params && "source" in patch.params) {
    for (const other of el.links) {
      const o = project.pages.flatMap((p) => p.elements).find((e) => e.id === other);
      if (o) o.params.source = el.params.source === false;
    }
  }
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
 * Field or panel wire. `field`: true/false to fix it, null to go back to
 * deciding by the panel boundary. `showNumber`: print the number on a field wire.
 */
export function setWireKind(
  project: Project,
  pageId: string,
  ids: string[],
  opts: { field?: boolean | null; showNumber?: boolean },
): void {
  const page = getPage(project, pageId);
  for (const id of ids) {
    const seg = getSegment(page, id);
    if (opts.field === null) delete seg.field;
    else if (opts.field !== undefined) seg.field = opts.field;
    if (opts.showNumber !== undefined) {
      if (opts.showNumber) seg.showNumber = true;
      else delete seg.showNumber;
    }
  }
}

/** Turn a wire end for end: its colour and number print at the other end. The route stays as it is. */
export function reverseSegment(project: Project, pageId: string, id: string): void {
  const seg = getSegment(getPage(project, pageId), id);
  [seg.from, seg.to] = [seg.to, seg.from];
  seg.points = [...seg.points].reverse();
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

// ---------------------------------------------------------------------------
// Pages

function renumberPages(project: Project): void {
  project.pages.forEach((p, i) => (p.number = i + 1));
}

/** Add a blank page after `afterId` (or at the end). */
export function addPage(project: Project, title = "", afterId?: string): Page {
  const page: Page = { id: newId("pg"), number: 0, title, boundaryY: null, sections: [], elements: [], segments: [] };
  const i = afterId ? project.pages.findIndex((p) => p.id === afterId) : -1;
  project.pages.splice(i >= 0 ? i + 1 : project.pages.length, 0, page);
  renumberPages(project);
  return page;
}

export function deletePage(project: Project, pageId: string): void {
  getPage(project, pageId);
  if (project.pages.length === 1) throw new OpError("A project needs at least one page");
  project.pages = project.pages.filter((p) => p.id !== pageId);
  renumberPages(project);
  refreshConductors(project);
}

export function renamePage(project: Project, pageId: string, title: string): void {
  getPage(project, pageId).title = title.trim();
}

/** Move a page to a new position (0-based). */
export function movePage(project: Project, pageId: string, toIndex: number): void {
  const page = getPage(project, pageId);
  const rest = project.pages.filter((p) => p.id !== pageId);
  const i = Math.max(0, Math.min(rest.length, Math.round(toIndex)));
  rest.splice(i, 0, page);
  project.pages = rest;
  renumberPages(project);
}

/** Copy a page and everything on it, after the original. Tags are cleared on the copy. */
export function duplicatePage(project: Project, pageId: string): Page {
  const src = getPage(project, pageId);
  const ids = new Map<string, string>();
  const copy = addPage(project, src.title ? `${src.title} (copy)` : "", pageId);
  copy.boundaryY = src.boundaryY;
  copy.sections = src.sections.map((sc) => ({ ...sc, id: newId("sec"), rect: [...sc.rect] as Section["rect"] }));
  for (const el of src.elements) {
    const id = newId("e");
    ids.set(el.id, id);
    copy.elements.push({ ...JSON.parse(JSON.stringify(el)), id, tag: "", links: [] });
  }
  for (const s of src.segments) {
    const from = ids.get(s.from[0]);
    const to = ids.get(s.to[0]);
    if (!from || !to) continue;
    copy.segments.push({ ...JSON.parse(JSON.stringify(s)), id: newId("w"), conductor: "", from: [from, s.from[1]], to: [to, s.to[1]] });
  }
  refreshConductors(project);
  return copy;
}

// ---------------------------------------------------------------------------
// Project data and revisions

export function updateProjectInfo(project: Project, patch: Partial<Project["project"]>): void {
  for (const [k, v] of Object.entries(patch)) {
    if (k in project.project && typeof v === "string") (project.project as unknown as Record<string, string>)[k] = v;
  }
}

export function addRevision(project: Project, rev: Partial<Project["revisions"][number]> = {}): void {
  const last = project.revisions[project.revisions.length - 1]?.rev ?? "";
  // A, B, C… or 1, 2, 3… following the last issue.
  const next = /^\d+$/.test(last) ? String(Number(last) + 1) : /^[A-Y]$/.test(last) ? String.fromCharCode(last.charCodeAt(0) + 1) : "A";
  project.revisions.push({ rev: next, date: "", drawnBy: "", description: "", ...rev, clouds: rev.clouds ?? [] });
}

export function updateRevision(project: Project, index: number, patch: Partial<Project["revisions"][number]>): void {
  const r = project.revisions[index];
  if (!r) throw new OpError(`No revision ${index + 1}`);
  Object.assign(r, patch);
}

export function deleteRevision(project: Project, index: number): void {
  if (!project.revisions[index]) throw new OpError(`No revision ${index + 1}`);
  project.revisions.splice(index, 1);
}

// ---------------------------------------------------------------------------
// Links (coil ↔ contacts, off-page pairs)

function unlinkAll(project: Project, el: Element, keep: (other: Element) => boolean): void {
  for (const id of [...el.links]) {
    const o = locate(project, id);
    if (o && keep(o.el)) continue;
    el.links = el.links.filter((l) => l !== id);
    if (o) o.el.links = o.el.links.filter((l) => l !== el.id);
  }
}

/** Drive a contact from a coil (or detach it, with null). The contact takes the coil's tag. */
export function linkContact(project: Project, contactId: string, coilId: string | null): void {
  const c = locate(project, contactId);
  if (!c) throw new OpError(`No element "${contactId}"`);
  if (!isSlave(c.el)) throw new OpError("Only contacts can be linked to a coil");
  unlinkAll(project, c.el, (o) => !isMaster(o));
  if (!coilId) return;
  const m = locate(project, coilId);
  if (!m || !isMaster(m.el)) throw new OpError("That isn't a coil");
  c.el.links.push(m.el.id);
  if (!m.el.links.includes(c.el.id)) m.el.links.push(c.el.id);
  c.el.tag = "";
}

/** Pair two off-page arrows (or unpair, with null). Their wires become one conductor. */
export function linkOffpage(project: Project, aId: string, bId: string | null): void {
  const a = locate(project, aId);
  if (!a || a.el.symbol !== "offpage") throw new OpError("That isn't an off-page arrow");
  unlinkAll(project, a.el, () => false);
  if (bId) {
    const b = locate(project, bId);
    if (!b || b.el.symbol !== "offpage" || b.el.id === a.el.id) throw new OpError("Pick another off-page arrow");
    unlinkAll(project, b.el, () => false);
    a.el.links.push(b.el.id);
    b.el.links.push(a.el.id);
    // One source, one destination: if both are the same, the other one changes.
    const src = (e: Element) => e.params.source !== false;
    if (src(a.el) === src(b.el)) b.el.params.source = !src(a.el);
  }
  refreshConductors(project);
}

/** Set a wire number by hand. Locked numbers survive renumbering. */
export function setConductorNumber(project: Project, conductorId: string, number: string, locked = true): void {
  const c = project.conductors.find((x) => x.id === conductorId);
  if (!c) throw new OpError(`No conductor "${conductorId}"`);
  c.number = number.trim();
  if (locked && c.number) c.locked = true;
  else delete c.locked;
}

/** Core colour and what a conductor carries, shown after its number. Empty strings clear them. */
export function setConductorInfo(project: Project, conductorId: string, info: { colour?: string; function?: string }): void {
  const c = project.conductors.find((x) => x.id === conductorId);
  if (!c) throw new OpError(`No conductor "${conductorId}"`);
  for (const k of ["colour", "function"] as const) {
    const v = info[k];
    if (v === undefined) continue;
    const t = v.trim();
    if (t) c[k] = k === "colour" ? colourCode(t) : t;
    else delete c[k];
  }
}

export function setNumberingScheme(project: Project, scheme: Project["numbering"]["scheme"]): void {
  project.numbering = { scheme };
}

// ---------------------------------------------------------------------------
// Plant (DESIGN.md §6)

export function getPlant(project: Project, id: string): PlantItem {
  const p = project.plant.find((x) => x.id === id);
  if (!p) throw new OpError(`No plant item "${id}"`);
  return p;
}

const cleanTerminals = (list: string[]) => [...new Set(list.map((t) => t.trim()).filter(Boolean))];

/**
 * Terminals written with their groups: "L N E | ENABLE: 1 2 | 0-10V: 3 4".
 * Runs are separated by "|"; a run may start with a group name and a colon.
 */
export function parseTerminalSpec(spec: string): { terminals: string[]; groups: PlantGroup[] } {
  const runs = spec.split("|").map((run) => {
    const i = run.indexOf(":");
    return {
      name: i >= 0 ? run.slice(0, i).trim() : "",
      terms: cleanTerminals((i >= 0 ? run.slice(i + 1) : run).split(/[,\s]+/)),
    };
  });
  // A name used in more than one group (C, NO, NC on two relays) is told apart by its group: R2.C.
  const count = new Map<string, number>();
  for (const r of runs) for (const t of r.terms) count.set(t, (count.get(t) ?? 0) + 1);
  const terminals: string[] = [];
  const groups: PlantGroup[] = [];
  for (const r of runs) {
    const ids = r.terms
      .map((t) => ((count.get(t) ?? 0) > 1 && r.name ? `${r.name}.${t}` : t))
      .filter((id) => !terminals.includes(id));
    terminals.push(...ids);
    if (r.name && ids.length) {
      const g = groups.find((x) => x.name === r.name);
      if (g) g.terminals.push(...ids);
      else groups.push({ name: r.name, terminals: ids });
    }
  }
  return { terminals, groups };
}

export { plantTerminalName };

/** The other way: a plant item's terminals and groups as one line. */
export function formatTerminalSpec(item: Pick<PlantItem, "terminals" | "groups">): string {
  const groupOf = new Map<string, string>();
  for (const g of item.groups ?? []) for (const t of g.terminals) groupOf.set(t, g.name);
  const runs: { name: string; terms: string[] }[] = [];
  for (const t of item.terminals) {
    const name = groupOf.get(t) ?? "";
    const shown = plantTerminalName(t, name);
    const last = runs[runs.length - 1];
    if (last && last.name === name) last.terms.push(shown);
    else runs.push({ name, terms: [shown] });
  }
  return runs.map((r) => (r.name ? `${r.name}: ${r.terms.join(" ")}` : r.terms.join(" "))).join(" | ");
}

/** Groups that only mention terminals the item has, and not empty. Anything else a group carries is kept. */
function cleanGroups(groups: PlantGroup[], terminals: string[]): PlantGroup[] {
  const have = new Set(terminals);
  return groups
    .map((g) => ({ ...g, name: g.name.trim(), terminals: cleanTerminals(g.terminals).filter((t) => have.has(t)) }))
    .filter((g) => g.name && g.terminals.length);
}

/** The letters a tag starts with: SF-01 → SF, U3-13 → U. */
export function prefixOf(tag: string): string {
  return /^[A-Za-z]+/.exec(tag.trim())?.[0]?.toUpperCase() ?? "";
}

/** A plant tag from its prefix and address: U3-13, or SEF-3-13 when the prefix is more than one letter. */
export function plantTag(prefix: string, address: string): string {
  return prefix.length > 1 ? `${prefix}-${address}` : `${prefix}${address}`;
}

/** A plant item's tag as shown: its tag, or its prefix and "?" until Renumber gives it one. */
export function plantLabel(item: PlantItem): string {
  return item.tag || `${item.prefix || "U"}?`;
}

export function addPlant(
  project: Project,
  tag: string,
  description = "",
  terminals: string[] = [],
  more: { groups?: PlantGroup[]; info?: string; prefix?: string; powerByOthers?: boolean } = {},
): PlantItem {
  const t = tag.trim();
  const prefix = (more.prefix?.trim() || prefixOf(t) || "U").toUpperCase();
  if (t && project.plant.some((p) => p.tag === t)) throw new OpError(`There's already a plant item ${t}`);
  const terms = cleanTerminals(terminals);
  const item: PlantItem = { id: newId("p"), tag: t, prefix, description: description.trim(), terminals: terms };
  // A tag typed in is kept; otherwise Renumber gives it one from where its first view is.
  if (t && more.prefix === undefined) item.locked = true;
  const groups = cleanGroups(more.groups ?? [], terms);
  if (groups.length) item.groups = groups;
  if (more.info?.trim()) item.info = more.info.trim();
  if (more.powerByOthers) item.powerByOthers = true;
  project.plant.push(item);
  return item;
}

export function updatePlant(
  project: Project,
  id: string,
  patch: {
    tag?: string;
    prefix?: string;
    description?: string;
    terminals?: string[];
    groups?: PlantGroup[];
    info?: string;
    powerByOthers?: boolean;
  },
): void {
  const item = getPlant(project, id);
  if (patch.tag !== undefined) {
    const t = patch.tag.trim();
    if (t && project.plant.some((p) => p.id !== id && p.tag === t)) throw new OpError(`There's already a plant item ${t}`);
    // Typing a tag locks it; clearing it hands it back to Renumber.
    item.tag = t;
    if (t) item.locked = true;
    else delete item.locked;
  }
  if (patch.prefix !== undefined) item.prefix = patch.prefix.trim().toUpperCase() || "U";
  if (patch.powerByOthers !== undefined) {
    if (patch.powerByOthers) item.powerByOthers = true;
    else delete item.powerByOthers;
  }
  if (patch.description !== undefined) item.description = patch.description.trim();
  if (patch.terminals !== undefined) {
    const before = item.terminals;
    item.terminals = cleanTerminals(patch.terminals);
    // Views that showed every terminal go on showing every terminal.
    for (const page of project.pages) {
      for (const el of page.elements) {
        if (el.symbol !== "plant-view" || el.params.plant !== id) continue;
        const shown = String(el.params.show ?? "").split(",").filter(Boolean);
        if (before.every((t) => shown.includes(t))) el.params.show = item.terminals.join(",");
      }
    }
  }
  if (patch.info !== undefined) {
    if (patch.info.trim()) item.info = patch.info.trim();
    else delete item.info;
  }
  const groups = cleanGroups(patch.groups ?? item.groups ?? [], item.terminals);
  if (groups.length) item.groups = groups;
  else delete item.groups;
  syncPlantViews(project);
}

/** How a plant group behaves when simulating: role, what it follows, delay, inverted. */
export function updatePlantGroup(
  project: Project,
  plantId: string,
  group: string,
  patch: { role?: PlantGroup["role"] | null; follows?: string | null; delay?: number; invert?: boolean },
): void {
  const g = getPlant(project, plantId).groups?.find((x) => x.name === group);
  if (!g) throw new OpError(`No group ${group}`);
  if (patch.role !== undefined) {
    if (patch.role) g.role = patch.role;
    else delete g.role;
  }
  if (patch.follows !== undefined) {
    if (patch.follows) g.follows = patch.follows;
    else delete g.follows;
  }
  if (patch.delay !== undefined) {
    if (patch.delay > 0) g.delay = patch.delay;
    else delete g.delay;
  }
  if (patch.invert !== undefined) {
    if (patch.invert) g.invert = true;
    else delete g.invert;
  }
}

/** Remove a plant item and every view of it. */
export function deletePlant(project: Project, id: string): void {
  getPlant(project, id);
  project.plant = project.plant.filter((p) => p.id !== id);
  for (const page of project.pages) {
    const views = page.elements.filter((e) => e.symbol === "plant-view" && e.params.plant === id).map((e) => e.id);
    if (views.length) deleteElements(project, page.id, views);
  }
}

/** Place a view of a plant item, showing the given terminals (default: all). */
export function placePlantView(project: Project, pageId: string, plantId: string, pos: Vec, show?: string[]): Element {
  const item = getPlant(project, plantId);
  const shown = (show ?? item.terminals).filter((t) => item.terminals.includes(t));
  const el = addElement(project, pageId, "plant-view", pos, {
    zone: "external",
    params: { plant: plantId, show: shown.join(",") },
  });
  syncPlantViews(project);
  return el;
}

/** Choose which of the plant's terminals a view shows. Wires on terminals that are hidden are removed. */
export function setPlantViewTerminals(project: Project, pageId: string, elId: string, show: string[]): void {
  const el = getElement(getPage(project, pageId), elId);
  if (el.symbol !== "plant-view") throw new OpError("That isn't a plant view");
  el.params.show = cleanTerminals(show).join(",");
  syncPlantViews(project);
}

/** Copy plant data into its views (they draw from their own params) and drop wires on terminals that went away. */
export function syncPlantViews(project: Project): void {
  for (const page of project.pages) {
    for (const el of page.elements) {
      if (el.symbol !== "plant-view") continue;
      const item = project.plant.find((p) => p.id === el.params.plant);
      const terms = item?.terminals ?? [];
      const show = String(el.params.show ?? "").split(",").filter((t) => terms.includes(t));
      el.params.terms = terms.join(",");
      el.params.show = show.join(",");
      el.params.pdesc = item?.description ?? "";
      el.params.pinfo = item?.info ?? "";
      el.params.pgroups = (item?.groups ?? []).map((g) => `${g.name}=${g.terminals.join(",")}`).join(";");
      el.params.pbo = item?.powerByOthers === true;
      const keep = new Set(show);
      page.segments = page.segments.filter(
        (s) => !((s.from[0] === el.id && !keep.has(s.from[1])) || (s.to[0] === el.id && !keep.has(s.to[1]))),
      );
    }
  }
  refreshConductors(project);
}

// ---------------------------------------------------------------------------
// Panel boundary (DESIGN.md §7) and section boxes

/** Put the panel boundary at height y (grid units), or remove it with null. */
export function setBoundary(project: Project, pageId: string, y: number | null): void {
  const page = getPage(project, pageId);
  page.boundaryY = y === null ? null : Math.round(Math.min(AREA_UNITS.h, Math.max(0, y)));
  updateZones(page);
}

/** Elements below the boundary are field equipment; on or above it, panel internals. */
export function updateZones(page: Page): void {
  for (const el of page.elements) {
    if (page.boundaryY === null) {
      if (el.symbol !== "plant-view") el.zone = "internal";
      continue;
    }
    el.zone = el.pos[1] > page.boundaryY ? "external" : "internal";
  }
}

export function addSection(project: Project, pageId: string, label: string, rect: [number, number, number, number]): Section {
  const page = getPage(project, pageId);
  const sec: Section = { id: newId("sec"), label, rect: normRect(rect) };
  page.sections.push(sec);
  return sec;
}

function normRect([x, y, w, h]: [number, number, number, number]): [number, number, number, number] {
  const x0 = Math.round(Math.min(x, x + w));
  const y0 = Math.round(Math.min(y, y + h));
  const ww = Math.max(4, Math.round(Math.abs(w)));
  const hh = Math.max(4, Math.round(Math.abs(h)));
  const cx = Math.min(Math.max(0, x0), AREA_UNITS.w - ww);
  const cy = Math.min(Math.max(0, y0), AREA_UNITS.h - hh);
  return [cx, cy, Math.min(ww, AREA_UNITS.w), Math.min(hh, AREA_UNITS.h)];
}

export function updateSection(
  project: Project,
  pageId: string,
  id: string,
  patch: { label?: string; rect?: [number, number, number, number] },
): void {
  const sec = getPage(project, pageId).sections.find((s) => s.id === id);
  if (!sec) throw new OpError(`No section "${id}"`);
  if (patch.label !== undefined) sec.label = patch.label;
  if (patch.rect) sec.rect = normRect(patch.rect);
}

export function deleteSections(project: Project, pageId: string, ids: string[]): void {
  const page = getPage(project, pageId);
  page.sections = page.sections.filter((s) => !ids.includes(s.id));
}

// ---------------------------------------------------------------------------
// Bulk edits (table view)

/** Find and replace in the tags and/or labels of the given elements, anywhere in the project. Returns how many changed. */
export function replaceInElements(
  project: Project,
  ids: string[],
  find: string,
  replace: string,
  fields: { tag?: boolean; label?: boolean },
): number {
  if (!find) throw new OpError("Nothing to find");
  const want = new Set(ids);
  let n = 0;
  for (const page of project.pages) {
    for (const el of page.elements) {
      if (!want.has(el.id)) continue;
      const before = el.tag + "\u0000" + el.label;
      if (fields.tag && el.tag) el.tag = el.tag.split(find).join(replace);
      if (fields.label) el.label = el.label.split(find).join(replace);
      if (el.tag + "\u0000" + el.label !== before) n++;
    }
  }
  return n;
}

/** Lock or unlock the tags of elements anywhere in the project. */
export function setTagLocks(project: Project, ids: string[], locked: boolean): void {
  const want = new Set(ids);
  for (const page of project.pages) for (const el of page.elements) if (want.has(el.id)) el.params.locked = locked;
}

/** Edit an element anywhere in the project (the table view isn't tied to one sheet). */
export function updateElementAnywhere(project: Project, id: string, patch: ElementPatch): void {
  const page = project.pages.find((p) => p.elements.some((e) => e.id === id));
  if (!page) throw new OpError(`No element "${id}"`);
  updateElement(project, page.id, id, patch);
}

// ---------------------------------------------------------------------------
// Revision clouds

/** Cloud an area of a sheet for the latest revision. */
export function addCloud(project: Project, pageId: string, rect: [number, number, number, number]): string {
  getPage(project, pageId);
  const rev = project.revisions[project.revisions.length - 1];
  if (!rev) throw new OpError("Add a revision first (Project…)");
  const id = newId("cl");
  const [x, y, w, h] = rect;
  rev.clouds.push({
    id,
    pageId,
    rect: [Math.round(Math.min(x, x + w)), Math.round(Math.min(y, y + h)), Math.max(2, Math.round(Math.abs(w))), Math.max(2, Math.round(Math.abs(h)))],
  });
  return id;
}

/** Move or resize a cloud, or move it to another revision. */
export function updateCloud(project: Project, id: string, patch: { rect?: [number, number, number, number]; rev?: string }): void {
  const from = project.revisions.find((r) => r.clouds.some((c) => c.id === id));
  if (!from) throw new OpError(`No cloud "${id}"`);
  const cloud = from.clouds.find((c) => c.id === id)!;
  if (patch.rect) {
    const [x, y, w, h] = patch.rect;
    cloud.rect = [Math.round(x), Math.round(y), Math.max(2, Math.round(w)), Math.max(2, Math.round(h))];
  }
  if (patch.rev && patch.rev !== from.rev) {
    const to = project.revisions.find((r) => r.rev === patch.rev);
    if (!to) throw new OpError(`No revision ${patch.rev}`);
    from.clouds = from.clouds.filter((c) => c.id !== id);
    to.clouds.push(cloud);
  }
}

export function deleteClouds(project: Project, ids: string[]): void {
  for (const r of project.revisions) r.clouds = r.clouds.filter((c) => !ids.includes(c.id));
}

/** The clouds drawn on a sheet: the latest revision's. */
export function cloudsOn(project: Project, pageId: string): { id: string; rect: [number, number, number, number]; rev: string }[] {
  const rev = project.revisions[project.revisions.length - 1];
  return rev ? rev.clouds.filter((c) => c.pageId === pageId).map((c) => ({ id: c.id, rect: c.rect, rev: rev.rev })) : [];
}

// ---------------------------------------------------------------------------
// Logic rules (simulation)

export function addRule(project: Project, kind: "never-both" | "never", a: string, b?: string, note = ""): string {
  const exists = (id: string) => project.pages.some((pg) => pg.elements.some((e) => e.id === id));
  if (!exists(a) || (kind === "never-both" && (!b || !exists(b)))) throw new OpError("Pick the coils or lamps the rule is about");
  if (kind === "never-both" && a === b) throw new OpError("Pick two different items");
  const id = newId("r");
  project.rules.push({ id, kind, a, ...(kind === "never-both" ? { b } : {}), ...(note ? { note } : {}) });
  return id;
}

export function deleteRule(project: Project, id: string): void {
  project.rules = project.rules.filter((r) => r.id !== id);
}
