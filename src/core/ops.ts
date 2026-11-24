/**
 * Model operations. Every edit to a project goes through one of these
 * small functions, used by the UI now and the MCP tools later (DESIGN.md
 * §3, §12). They change the project in place; callers that want undo take
 * a copy first.
 */
import { fitBlock, freeCellX, spreadBlock } from "./blocks";
import { projectCopy, type DeviceEntry, type ProjectDevice } from "./devices";
import { resolveFields } from "./fields";
import { textWidth } from "./textwidth";
import { AREA_UNITS, textUnits, type Rotation, type Vec, clampToArea, rotate, snapVec } from "./geometry";
import { refreshConductors } from "./conductors";
import {
  type Distribution,
  type Element,
  type Page,
  type ParamValue,
  type PlantItem,
  type IoPoint,
  type PinInfo,
  type Expectation,
  type Condition,
  type Asset,
  type DoorColumn,
  type DoorLeaf,
  type GaDim,
  type GaItem,
  type GaSettings,
  type GaView,
  type Project,
  type Section,
  type Segment,
  type TerminalRef,
  newId,
} from "./model";
import { benchOf, defaultParams, isBar, formatPoints, getSymbol, partPoints, plantViewLayout, poleMates, requireSymbol, terminalPoint, viewSides, type ViewSide } from "./symbols";
import { moduleType, moduleTypeName } from "./modules";
import { channelLabel, renamePointDesign, tidyDesign } from "./design";
import { cleanPoints, formatQuickEntry, mergePoints, isInputForm, missingRefs, parseQuickEntry, pointOfPin, printedPin } from "./points";
import { isOrthogonal, routeOf, simplifyRoute } from "./wires";
import { isMaster, isSlave, locate } from "./xref";
import { colourCode, knownColour, lampColour } from "./wirecolours";
import { DETAIL_ZOOMS, MAX_COLUMNS, MAX_DOORS, PLATE_MARGIN, allDetails, detailOf, detailSpace, doorColumns, doorOwner, doorPanes, paneName, platesOf, plateDoor, fitScale, fitZoom, frameOf, itemStrip, stripSize, nextDetailLetter, sheetTakes, syncDetailFrames, viewTakes } from "./ga";

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
  if ((symbol === "busbar" || symbol === "rail") && typeof params.colour === "string") params.colour = knownColour(params.colour);
  // A selector's legend as it was written before its positions had names (v0.2.1 note 23).
  if (symbol === "selector" && typeof params.legend === "string") Object.assign(params, legendToPositions(params.legend, params.positions === "3"));
  if (symbol === "selector") delete params.legend;
  // A push button's contact as it was set before poles (v0.2.1 note 24): NO, NC, or both.
  if (symbol === "pushbutton" && typeof params.contact === "string") {
    const c = params.contact;
    delete params.contact;
    if (c === "both") Object.assign(params, { poles: 2, pole1: "no", pole2: "nc" });
    else Object.assign(params, { poles: 1, pole1: c === "nc" ? "nc" : "no" });
  }
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
  if (page.spare && benchOf({ symbol }) !== "annotate")
    throw new OpError(`Sheet ${page.number} is a spare sheet: only annotations go on it`);
  const el: Element = {
    id: newId("e"),
    symbol,
    tag: opts.tag ?? "",
    label: symbol === "text" ? (opts.label ?? "Text") : (opts.label ?? "").replace(/\s*\n\s*/g, " "),
    pos: clampToArea(snapVec(pos)),
    rot: opts.rot ?? 0,
    zone: opts.zone ?? "internal",
    params: normaliseParams(symbol, { ...defaultParams(symbol), ...opts.params }),
    links: [],
  };
  if (symbol !== "plant-view") for (const k of PLANT_VIEW_KEYS) delete el.params[k];
  // A label written on lines wraps at its widest line instead (v0.2.1 note 18).
  if (symbol !== "text" && opts.label?.includes("\n") && opts.params?.labelWidth === undefined) el.params.labelWidth = labelWidthFor(opts.label, project);
  // Call-outs are numbered 1, 2, 3… on each sheet, the next one after the highest there.
  if (symbol === "callout" && opts.params?.n === undefined) {
    el.params.n = 1 + Math.max(0, ...page.elements.filter((e) => e.symbol === "callout").map((e) => Number(e.params.n) || 0));
  }
  page.elements.push(el);
  snapToBlock(page, el);
  if (page.boundaryY !== null) updateZones(page);
  return el;
}

/** Move elements by a delta, snapped to the grid and kept on the page. */
export function moveElements(project: Project, pageId: string, ids: string[], delta: Vec): void {
  const page = getPage(project, pageId);
  const d = snapVec(delta);
  const moving = new Set(ids);
  for (const id of ids) {
    const el = getElement(page, id);
    el.pos = clampToArea([el.pos[0] + d[0], el.pos[1] + d[1]]);
  }
  // Moved together, terminals keep their spacing; each is kept a column from the ones staying put.
  for (const id of ids) snapToBlock(page, getElement(page, id), moving);
  if (page.boundaryY !== null) updateZones(page);
}

/** Rotate elements 90° clockwise about their own origins. */
export function rotateElements(project: Project, pageId: string, ids: string[]): void {
  const page = getPage(project, pageId);
  for (const id of ids) {
    const el = getElement(page, id);
    // Arrows and polygons turn their points, so their handles stay where they're drawn.
    const pts = partPoints(el);
    if (pts) {
      el.params.pts = formatPoints(pts.slice(1).map((q) => rotate([q[0] - el.pos[0], q[1] - el.pos[1]], 90)));
      continue;
    }
    el.rot = (((el.rot + 90) % 360) as Rotation);
  }
  updateZones(page);
}

/** Move the corners of an arrow or polygon (sheet units; the first is its origin). */
export function setPartPoints(project: Project, pageId: string, id: string, points: Vec[]): void {
  const el = getElement(getPage(project, pageId), id);
  if (!partPoints(el)) throw new OpError("Only arrows and polygons have points to move");
  const need = el.symbol === "arrow" ? 2 : 3;
  if (points.length < need) throw new OpError(el.symbol === "arrow" ? "An arrow needs two points" : "A polygon needs at least three corners");
  const pts = points.map((q) => clampToArea(snapVec(q)));
  const [o, ...rest] = pts;
  if (el.symbol === "arrow" && rest[0]![0] === o![0] && rest[0]![1] === o![1]) throw new OpError("An arrow needs some length");
  el.pos = o!;
  el.params.pts = formatPoints(rest.map((q) => [q[0] - o![0], q[1] - o![1]]));
}

/** Flip parts top to bottom (F). Flipping twice puts them back. */
export function flipElements(project: Project, pageId: string, ids: string[]): void {
  const page = getPage(project, pageId);
  for (const id of ids) {
    const el = getElement(page, id);
    const pts = partPoints(el);
    if (pts) {
      el.params.pts = formatPoints(pts.slice(1).map((q) => [q[0] - el.pos[0], el.pos[1] - q[1]]));
      continue;
    }
    if (el.flip) delete el.flip;
    else el.flip = true;
  }
  updateZones(page);
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
  /** Move its label block by this much from its place; null puts it back (v0.4.x T14). */
  labelAt?: Vec | null;
}

/** A legend written as words ("HAND OFF AUTO", "1  2") as position names, when there's one word per position. */
export function legendToPositions(legend: string, three: boolean): Record<string, string> {
  const w = legend.trim().split(/\s+/).filter(Boolean);
  if (three && w.length === 3) return { pos1: w[0]!, pos0: w[1]!, pos2: w[2]! };
  if (!three && w.length === 2) return { pos0: w[0]!, pos1: w[1]! };
  return {};
}

/** The width a label written on several lines wraps at to keep those lines: its widest line, in whole units. */
export function labelWidthFor(label: string, project?: Pick<Project, "plant" | "project" | "pages" | "revisions">): number {
  const lines = (project ? resolveFields(label, project as Project) : label).split("\n");
  return Math.ceil(Math.max(...lines.map((l) => textWidth(l.trim(), textUnits("tag")))) + 0.5);
}

export function updateElement(project: Project, pageId: string, id: string, patch: ElementPatch): void {
  const el = getElement(getPage(project, pageId), id);
  if (patch.tag !== undefined) el.tag = patch.tag.trim();
  // A label is one line, wrapped by its width (v0.2.1 note 18); Text keeps its lines.
  if (patch.label !== undefined) el.label = el.symbol === "text" ? patch.label : patch.label.replace(/\s*\n\s*/g, " ");
  if (patch.zone !== undefined) el.zone = patch.zone;
  if (patch.rot !== undefined) el.rot = patch.rot;
  if (patch.labelAt !== undefined) {
    if (patch.labelAt && (patch.labelAt[0] || patch.labelAt[1])) el.labelAt = [Math.round(patch.labelAt[0] * 2) / 2, Math.round(patch.labelAt[1] * 2) / 2];
    else delete el.labelAt;
  }
  if (patch.params) el.params = normaliseParams(el.symbol, { ...el.params, ...patch.params });
  // A strip set by hand wins over one Renumber gave it by section (v0.4.x T4).
  if (el.symbol === "terminal" && patch.params && "strip" in patch.params) delete el.params.stripAuto;
  // A terminal's number changed: the block fits its numbers at once, not at the next route (F8).
  if (el.symbol === "terminal") fitBlock(getPage(project, pageId));
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
  inheritBusbarColour(project, page, seg);
  return seg;
}

/**
 * A new wire with no colour takes one, once, when it's drawn (a drafting
 * aid; it can be changed afterwards like any other wire's colour):
 * - from a busbar, the busbar's core colour;
 * - from one side of an in-line part (fuse, contact, isolator pole,
 *   terminal…), the colour of the wire on the other side of that pole (T5).
 */
function inheritBusbarColour(project: Project, page: Page, seg: Segment): void {
  const c = project.conductors.find((x) => x.id === seg.conductor);
  if (!c || c.colour) return;
  for (const ref of [seg.from, seg.to]) {
    const el = page.elements.find((e) => e.id === ref[0]);
    if (!el || !isBar(el)) continue;
    const colour = String(el.params.colour || distributionOf(project, el)?.colour || "");
    if (colour) {
      c.colour = colourCode(colour);
      return;
    }
  }
  for (const ref of [seg.from, seg.to]) {
    const el = page.elements.find((e) => e.id === ref[0]);
    if (!el) continue;
    for (const mate of poleMates(el, ref[1])) {
      const other = project.conductors.find((x) => x.id !== c.id && x.colour && x.terminals.some((t) => t[0] === el.id && t[1] === mate));
      if (other) {
        c.colour = other.colour;
        return;
      }
    }
  }
}

export function deleteSegments(project: Project, pageId: string, ids: string[]): void {
  const page = getPage(project, pageId);
  const gone = new Set(ids);
  page.segments = page.segments.filter((s) => !gone.has(s.id));
  dropOrphanJunctions(page);
  refreshConductors(project);
}

/**
 * Snap a route's corners to the grid, but leave its ends exactly on their
 * terminals (some sit on half units, e.g. terminal block cells) and keep the
 * runs next to the ends straight.
 */
function snapInside(points: Vec[], a: Vec, b: Vec): Vec[] {
  // Without repeated points or straight-through corners, the runs alternate across and down.
  const pre = simplifyRoute(points.map((p) => [p[0], p[1]] as Vec));
  if (pre.length < 2) return pre;
  const n = pre.length;
  // Ends within half a unit of their terminals are taken as on them.
  const near = (p: Vec, t: Vec) => Math.abs(p[0] - t[0]) <= 0.5 && Math.abs(p[1] - t[1]) <= 0.5;
  const out = pre.map((p, i) => (i === 0 || i === n - 1 ? ([p[0], p[1]] as Vec) : snapVec(p)));
  if (near(out[0]!, a)) out[0] = [a[0], a[1]];
  if (near(out[n - 1]!, b)) out[n - 1] = [b[0], b[1]];
  if (n === 2) return out;
  const vertical = (i: number) => Math.abs(pre[i]![0] - pre[i + 1]![0]) < 1e-6;
  // Square each run off from the start, keeping each corner's other coordinate on the grid…
  for (let i = 0; i < n - 2; i++) {
    if (vertical(i)) out[i + 1]![0] = out[i]![0];
    else out[i + 1]![1] = out[i]![1];
  }
  // …and the last run onto the end terminal.
  if (vertical(n - 2)) out[n - 2]![0] = out[n - 1]![0];
  else out[n - 2]![1] = out[n - 1]![1];
  return out;
}

/** Set a hand-drawn route. Must be square and start and end on the wire's terminals. */
/** A socket whose earth moved to the top (v0.4.x T17) stops being flagged once its earth wire is re-routed. */
function clearSocketFlag(page: Page, segIds: string[]): void {
  for (const sg of page.segments) {
    if (!segIds.includes(sg.id)) continue;
    for (const [id, t] of [sg.from, sg.to]) {
      const el = page.elements.find((e) => e.id === id);
      if (el?.symbol === "socket" && t === "E") delete el.params.eMoved;
    }
  }
}

export function setManualRoute(project: Project, pageId: string, id: string, points: Vec[]): void {
  const page = getPage(project, pageId);
  const seg = getSegment(page, id);
  const a = terminalPoint(getElement(page, seg.from[0]), seg.from[1])!;
  const b = terminalPoint(getElement(page, seg.to[0]), seg.to[1])!;
  const pts = simplifyRoute(snapInside(points, a, b));
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (!first || !last || first[0] !== a[0] || first[1] !== a[1] || last[0] !== b[0] || last[1] !== b[1]) {
    throw new OpError("A wire route must start and end on its terminals");
  }
  if (!isOrthogonal(pts)) throw new OpError("Wire routes must be horizontal and vertical runs");
  seg.points = pts;
  seg.route = pts.length >= 3 ? "manual" : "auto";
  clearSocketFlag(getPage(project, pageId), [id]);
}

/** Hand a wire back to the automatic router. */
export function resetRoute(project: Project, pageId: string, ids: string[]): void {
  const page = getPage(project, pageId);
  for (const id of ids) {
    const seg = getSegment(page, id);
    seg.route = "auto";
    seg.points = [];
  }
  clearSocketFlag(getPage(project, pageId), ids);
}

/**
 * Field or panel wire. `field`: true/false to fix it, null to go back to
 * deciding by the panel boundary. `showNumber` / `showColour`: print the
 * wire's number or colour here (true/false), or null for the usual rule
 * (numbers on panel wires, not field wires; colour whenever there is one).
 */
/**
 * Slide a wire's number or colour along it (v0.4.x T13): a fraction 0–1 of
 * its drawn length, kept through re-routing; null puts it back in its usual place.
 */
export function setWireTextAt(project: Project, pageId: string, id: string, at: { numberAt?: number | null; colourAt?: number | null }): void {
  const seg = getSegment(getPage(project, pageId), id);
  for (const k of ["numberAt", "colourAt"] as const) {
    const v = at[k];
    if (v === undefined) continue;
    if (v === null) delete seg[k];
    else seg[k] = Math.round(Math.max(0, Math.min(1, v)) * 1000) / 1000;
  }
}

export function setWireKind(
  project: Project,
  pageId: string,
  ids: string[],
  opts: { field?: boolean | null; showNumber?: boolean | null; showColour?: boolean | null },
): void {
  const page = getPage(project, pageId);
  for (const id of ids) {
    const seg = getSegment(page, id);
    if (opts.field === null) delete seg.field;
    else if (opts.field !== undefined) seg.field = opts.field;
    if (opts.showNumber === null) delete seg.showNumber;
    else if (opts.showNumber !== undefined) seg.showNumber = opts.showNumber;
    if (opts.showColour === null || opts.showColour === true) delete seg.showColour;
    else if (opts.showColour === false) seg.showColour = false;
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
  const gone = project.pages.find((p) => p.id === pageId)!;
  project.pages = project.pages.filter((p) => p.id !== pageId);
  // Door views of a door that's gone: a front keeps its place as a door of its own; a back is left for Check to flag.
  for (const p of project.pages) {
    if (p.ga?.of !== pageId) continue;
    if (p.ga.view === "door-front") {
      delete p.ga.of;
      delete p.ga.leaf;
    }
  }
  detachDims(project, new Set((gone.gaItems ?? []).map((it) => it.id)));
  renumberPages(project);
  refreshConductors(project);
}

export function renamePage(project: Project, pageId: string, title: string): void {
  getPage(project, pageId).title = title.trim();
}

/** Mark a sheet as spare (annotations only) or a working sheet again. */
export function setPageSpare(project: Project, pageId: string, spare: boolean): void {
  const page = getPage(project, pageId);
  if (!spare) {
    delete page.spare;
    return;
  }
  if (page.ga) throw new OpError("A GA sheet can't be a spare sheet");
  const drafted = page.elements.filter((e) => benchOf(e) !== "annotate").length + page.segments.length;
  if (drafted) throw new OpError(`Sheet ${page.number} has ${drafted} drawing items on it: move or delete them first`);
  page.spare = true;
}

/**
 * A sheet's type (note 12): a schematic, a spare sheet (annotations only)
 * or a GA. An empty sheet can become a GA; a GA with nothing placed on it
 * can become either of the others.
 */
export function setPageType(project: Project, pageId: string, type: "schematic" | "spare" | "ga"): void {
  const page = getPage(project, pageId);
  const now = page.ga ? "ga" : page.spare ? "spare" : "schematic";
  if (now === type) return;
  if (page.ga) {
    if (page.gaItems?.length) throw new OpError(`Sheet ${page.number} has ${page.gaItems.length} things laid out on it: delete them first`);
    delete page.ga;
    delete page.gaItems;
  }
  if (type === "ga") {
    const used = page.elements.length + page.segments.length + page.sections.length;
    if (used) throw new OpError(`Only an empty sheet can become a GA: sheet ${page.number} has ${used} things on it`);
    delete page.spare;
    page.boundaryY = null;
    const enclosure = { w: 600, h: 800 };
    page.ga = { scale: fitScale(enclosure.w, enclosure.h), enclosure, view: "backplate" };
    page.gaItems = [];
    return;
  }
  setPageSpare(project, pageId, type === "spare");
}

/** A spare sheet after the given one, titled "Spare". */
export function addSparePage(project: Project, afterId?: string): Page {
  const page = addPage(project, "Spare", afterId);
  page.spare = true;
  return page;
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
  if (src.spare) copy.spare = true;
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

/**
 * Pair a link arrow with another (Link… in its properties): the first is the
 * source, the one clicked becomes its destination (controller.md §5).
 */
export function linkArrows(project: Project, sourceId: string, targetId: string): void {
  linkOffpage(project, sourceId, targetId);
  locate(project, sourceId)!.el.params.source = true;
  locate(project, targetId)!.el.params.source = false;
}

/**
 * Link to a new arrow: a destination dropped at `at` on a sheet, already
 * paired with the source, pointing back into a wire that carries on the
 * same way. Returns the new arrow.
 */
export function linkToNewArrow(project: Project, sourceId: string, pageId: string, at: Vec): Element {
  const a = locate(project, sourceId);
  if (!a || a.el.symbol !== "offpage") throw new OpError("That isn't an off-page arrow");
  const rot = ((a.el.rot + 180) % 360) as Element["rot"];
  const params: Record<string, ParamValue> = { source: false };
  if (a.el.params.dist) params.dist = a.el.params.dist;
  const b = addElement(project, pageId, "offpage", at, { rot, params });
  linkArrows(project, a.el.id, b.id);
  return b;
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
  project.numbering = { ...project.numbering, scheme };
}

/** Terminal strips: one (X1), or one per section (v0.4.x T4). Takes effect at the next Renumber. */
export function setTerminalStrips(project: Project, by: "one" | "section"): void {
  if (by === "section") project.numbering = { ...project.numbering, strips: "section" };
  else {
    const { strips: _, ...rest } = project.numbering;
    project.numbering = rest;
  }
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
 * What a plant view needs to draw its boxes, copied from its plant item:
 * per pin its number as printed, its id, and the label under its run (its
 * group, else its point's name). JSON: [[pin, printed, id, label], …].
 */
export function plantPinsParam(item: PlantItem, project?: Project): string {
  const pointOf = pointOfPin(item);
  // A module's labels follow the points on its channels (design-v0.4 §4).
  const labelOf = new Map((item.points ?? []).map((p) => [p.name, project ? channelLabel(project, item, p) : (p.label ?? "")]));
  return JSON.stringify(
    item.terminals.map((t) => {
      const point = pointOf.get(t) ?? "";
      const info = item.pins?.[t];
      const row = [t, printedPin(t, point), info?.id ?? "", info?.group || point];
      // A module also prints each point's job label along its wire: [.., point, label].
      if (item.module) row.push(point, labelOf.get(point) ?? "");
      return row;
    }),
  );
}

/** What a module view draws besides its pins: its type and heading. JSON. */
export function moduleParam(item: PlantItem): string {
  if (!item.module) return "";
  return JSON.stringify({
    type: moduleTypeName(item.module),
    heading: moduleType(item.module.type).heading.toUpperCase(),
    ...(item.module.commons?.length ? { commons: item.module.commons } : {}),
  });
}

/** Kept for callers of the old name: quick entry, "L N E | ENABLE: 1 2 | R1: C NO NC". */
export const parseTerminalSpec = parseQuickEntry;
export const formatTerminalSpec = formatQuickEntry;

/** Pin labels only for pins the device has, and not empty. */
function cleanPins(pins: Record<string, PinInfo> | undefined, terminals: string[]): Record<string, PinInfo> | undefined {
  if (!pins) return undefined;
  const out: Record<string, PinInfo> = {};
  for (const t of terminals) {
    const p = pins[t];
    if (!p) continue;
    const id = p.id?.trim();
    const group = p.group?.trim();
    if (id || group) out[t] = { ...(id ? { id } : {}), ...(group ? { group } : {}), ...(group && p.port ? { port: true as const } : {}) };
  }
  return Object.keys(out).length ? out : undefined;
}

/** A plant item's or module's groups of pins that are serial ports (v0.4.x M7). */
export function portGroups(item: PlantItem): string[] {
  return [...new Set(Object.values(item.pins ?? {}).filter((p) => p.port && p.group).map((p) => p.group!))];
}

/** Every group of pins (in pin order) on a plant item or module. */
export function pinGroups(item: PlantItem): string[] {
  return [...new Set(item.terminals.map((t) => item.pins?.[t]?.group).filter((g): g is string => !!g))];
}

/**
 * Mark a group of a device's pins as a serial port, or not (v0.4.x M7). A
 * network on a port that's no longer one loses its port.
 */
export function setGroupPort(project: Project, plantId: string, group: string, on: boolean): void {
  const item = getPlant(project, plantId);
  const pins = item.terminals.filter((t) => item.pins?.[t]?.group === group);
  if (!pins.length) throw new OpError(`${item.tag || "It"} has no group "${group}"`);
  for (const t of pins) {
    const p = item.pins![t]!;
    if (on) p.port = true;
    else delete p.port;
  }
  if (!on) for (const n of project.networks ?? []) if (n.port?.plant === item.id && n.port.group === group) delete n.port;
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
  more: { points?: IoPoint[]; pins?: Record<string, PinInfo>; info?: string; prefix?: string; powerByOthers?: boolean } = {},
): PlantItem {
  const t = tag.trim();
  const prefix = (more.prefix?.trim() || prefixOf(t) || "U").toUpperCase();
  if (t && project.plant.some((p) => p.tag === t)) throw new OpError(`There's already a plant item ${t}`);
  const terms = cleanTerminals(terminals);
  const item: PlantItem = { id: newId("p"), tag: t, prefix, description: description.trim(), terminals: terms };
  // A tag typed in is kept; otherwise Renumber gives it one from where its first view is.
  if (t && more.prefix === undefined) item.locked = true;
  const points = cleanPoints(more.points ?? [], terms);
  if (points.length) item.points = points;
  const pins = cleanPins(more.pins, terms);
  if (pins) item.pins = pins;
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
    points?: IoPoint[];
    pins?: Record<string, PinInfo>;
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
  const before = item.points ?? [];
  const points = cleanPoints(patch.points ?? before, item.terminals);
  if (points.length) item.points = points;
  else delete item.points;
  const pins = cleanPins(patch.pins ?? item.pins, item.terminals);
  if (pins) item.pins = pins;
  else delete item.pins;
  // A point renamed or gone: expectations and conditions that named it by name follow, or are left to Check.
  for (const old of before) {
    if (points.some((p) => p.name === old.name)) continue;
    // Matched by its pins: a point with none can't be told apart from another, so isn't followed.
    const renamed = old.pins.length ? points.find((p) => !before.some((b) => b.name === p.name) && p.pins.join() === old.pins.join()) : undefined;
    if (renamed) {
      renamePointRefs(project, item.id, old.name, renamed.name);
      renamePointDesign(project, item.id, old.name, renamed.name);
    }
  }
  tidyDesign(project);
  syncPlantViews(project);
}

/** Point refs that named plant:<id>:<old> now name plant:<id>:<new>. */
export function renamePointRefs(project: Project, plantId: string, from: string, to: string): void {
  const a = `plant:${plantId}:${from}`;
  const b = `plant:${plantId}:${to}`;
  const fix = (cs: Condition[] | undefined) => cs?.forEach((c) => c.ref === a && (c.ref = b));
  for (const e of project.expectations) {
    if (e.point === a) e.point = b;
    fix(e.when);
  }
  for (const it of project.plant) {
    for (const p of it.points ?? []) fix(p.follows);
    for (const x of it.interlocks ?? []) fix(x.when);
  }
}

/** Quick entry edited: pins and points from one line, keeping what unchanged points had. */
export function setQuickEntry(project: Project, plantId: string, spec: string): void {
  const item = getPlant(project, plantId);
  const v = parseQuickEntry(spec);
  updatePlant(project, plantId, { terminals: v.terminals, points: mergePoints(item.points ?? [], v.points) });
}

/** Change one point's form or behaviour: what it follows, its delay, its distributions. */
export function updatePoint(
  project: Project,
  plantId: string,
  point: string,
  patch: {
    name?: string;
    form?: IoPoint["form"];
    follows?: Condition[] | null;
    join?: "and" | "or";
    delay?: number;
    dists?: Record<string, string>;
    /** What it does on this job, printed along its wire under a module's terminals. */
    label?: string;
  },
): void {
  const item = getPlant(project, plantId);
  const p = item.points?.find((x) => x.name === point);
  if (!p) throw new OpError(`${item.tag || "That plant"} has no point ${point}`);
  if (patch.name !== undefined) {
    const n = patch.name.trim();
    if (!n) throw new OpError("A point needs a name");
    if (n !== p.name && item.points!.some((x) => x.name === n)) throw new OpError(`There's already a point ${n}`);
    if (n !== p.name) {
      renamePointRefs(project, plantId, p.name, n);
      p.name = n;
    }
  }
  if (patch.form) p.form = patch.form;
  if (patch.follows !== undefined) {
    const list = (patch.follows ?? []).filter((c) => c.ref).slice(0, 2);
    if (list.length) p.follows = list;
    else delete p.follows;
  }
  if (patch.join) p.join = patch.join;
  if (patch.delay !== undefined) {
    if (patch.delay > 0) p.delay = patch.delay;
    else delete p.delay;
  }
  if (patch.dists !== undefined) p.dists = patch.dists;
  if (patch.label !== undefined) {
    if (patch.label.trim()) p.label = patch.label.trim();
    else delete p.label;
  }
  updatePlant(project, plantId, {});
}

/** One pin's number, id, group or point, as edited in the pins table. */
export function updatePin(
  project: Project,
  plantId: string,
  pin: string,
  patch: { number?: string; id?: string; group?: string; point?: string },
): void {
  const item = getPlant(project, plantId);
  if (!item.terminals.includes(pin)) throw new OpError(`No pin ${pin}`);
  let key = pin;
  if (patch.number !== undefined) {
    const n = patch.number.trim();
    if (!n) throw new OpError("A pin needs a number");
    if (n !== pin) {
      if (item.terminals.includes(n)) throw new OpError(`There's already a pin ${n}`);
      renamePin(project, item, pin, n);
      key = n;
    }
  }
  if (patch.id !== undefined || patch.group !== undefined) {
    const pins = { ...(item.pins ?? {}) };
    const cur = { ...(pins[key] ?? {}) };
    if (patch.id !== undefined) cur.id = patch.id;
    if (patch.group !== undefined) cur.group = patch.group;
    pins[key] = cur;
    item.pins = pins;
  }
  if (patch.point !== undefined) {
    const name = patch.point.trim();
    // A point that loses its last pin here goes, as before; one that never had pins (Design) stays.
    const points = (item.points ?? []).map((p) => ({ ...p, pins: p.pins.filter((t) => t !== key) })).filter((p, i) => p.pins.length || !item.points![i]!.pins.length);
    if (name) {
      const p = points.find((x) => x.name === name);
      if (p) p.pins = item.terminals.filter((t) => t === key || p.pins.includes(t));
      else points.push({ name, form: "contact", pins: [key] });
    }
    item.points = points;
  }
  updatePlant(project, plantId, {});
}

/** Add a pin at the end, or after a given one. */
export function addPin(project: Project, plantId: string, number: string, after?: string): void {
  const item = getPlant(project, plantId);
  const n = number.trim();
  if (!n) throw new OpError("A pin needs a number");
  if (item.terminals.includes(n)) throw new OpError(`There's already a pin ${n}`);
  const terms = [...item.terminals];
  const i = after ? terms.indexOf(after) : -1;
  terms.splice(i >= 0 ? i + 1 : terms.length, 0, n);
  updatePlant(project, plantId, { terminals: terms });
}

export function deletePin(project: Project, plantId: string, pin: string): void {
  const item = getPlant(project, plantId);
  updatePlant(project, plantId, { terminals: item.terminals.filter((t) => t !== pin) });
}

/** A pin renumbered: its points, labels, views and wires follow. */
function renamePin(project: Project, item: PlantItem, from: string, to: string): void {
  item.terminals = item.terminals.map((t) => (t === from ? to : t));
  for (const p of item.points ?? []) {
    p.pins = p.pins.map((t) => (t === from ? to : t));
    if (p.dists?.[from]) {
      p.dists[to] = p.dists[from]!;
      delete p.dists[from];
    }
  }
  if (item.pins?.[from]) {
    item.pins[to] = item.pins[from]!;
    delete item.pins[from];
  }
  for (const page of project.pages) {
    const views = new Set(page.elements.filter((e) => e.symbol === "plant-view" && e.params.plant === item.id).map((e) => e.id));
    if (!views.size) continue;
    for (const e of page.elements) {
      if (!views.has(e.id)) continue;
      e.params.show = String(e.params.show ?? "").split(",").map((t) => (t === from ? to : t)).join(",");
    }
    for (const sg of page.segments) {
      for (const r of [sg.from, sg.to]) if (views.has(r[0]) && r[1] === from) r[1] = to;
    }
  }
  for (const c of project.conductors) {
    for (const r of c.terminals) {
      if (r[1] !== from) continue;
      if (project.pages.some((pg) => pg.elements.some((e) => e.id === r[0] && e.symbol === "plant-view" && e.params.plant === item.id))) r[1] = to;
    }
  }
}

/** Remove a plant item and every view of it. */
export function deletePlant(project: Project, id: string): void {
  getPlant(project, id);
  project.plant = project.plant.filter((p) => p.id !== id);
  // A module leaves its controller's rail.
  for (const c of project.controllers ?? []) c.slots = c.slots.filter((s) => s.module !== id);
  for (const page of project.pages) {
    const views = page.elements.filter((e) => e.symbol === "plant-view" && e.params.plant === id).map((e) => e.id);
    if (views.length) deleteElements(project, page.id, views);
  }
  // Points on its channels (a module) let them go; labels that followed it go back.
  tidyDesign(project);
  syncPlantViews(project);
}

/** Place a view of a plant item, showing the given terminals (default: all). */
export function placePlantView(project: Project, pageId: string, plantId: string, pos: Vec, show?: string[]): Element {
  const item = getPlant(project, plantId);
  // A panel device is inside the panel (v0.4.x T3): never below the boundary.
  const pg = getPage(project, pageId);
  if (item.inPanel && pg.boundaryY !== null && pos[1] > pg.boundaryY) throw new OpError(`${item.tag || "It"} is in the panel: place it above the boundary`);
  const shown = (show ?? item.terminals).filter((t) => item.terminals.includes(t));
  // External only below a boundary (v0.4.x F7): updateZones decides, as for any part.
  const el = addElement(project, pageId, "plant-view", pos, {
    zone: "internal",
    params: { plant: plantId, show: shown.join(",") },
  });
  updateZones(getPage(project, pageId));
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
/** Settings that belong to plant views only; any other part carrying them picked them up by mistake. */
/**
 * A plant or module view's width (v0.4.x T2): spread its groups across that
 * many units; null back to its natural width; "fit" as wide as the usable
 * sheet from where it stands. Its wires follow its pins.
 */
export function setViewSpan(project: Project, pageId: string, id: string, span: number | null | "fit"): void {
  const page = getPage(project, pageId);
  const el = getElement(page, id);
  if (el.symbol !== "plant-view") throw new OpError("Only a plant or module view takes a width");
  if (span === null) {
    delete el.params.span;
    return;
  }
  const lay = plantViewLayout({ ...el, params: { ...el.params, span: 0 } });
  const w = span === "fit" ? Math.floor(AREA_UNITS.w - 2 - (el.pos[0] + lay.left)) : Math.round(span);
  if (w <= lay.right - lay.left) delete el.params.span;
  else el.params.span = Math.min(150, w);
}

/**
 * Which side of a plant or module view its terminals are on (v0.4.x T15):
 * top, bottom, left or right; null back to its usual side (plant top, module
 * bottom). Its wires follow its pins.
 */
export function setViewSide(project: Project, pageId: string, id: string, side: ViewSide | null): void {
  const el = getElement(getPage(project, pageId), id);
  if (el.symbol !== "plant-view") throw new OpError("Only a plant or module view has sides");
  const usual = el.params.pmod ? "bottom" : "top";
  if (!side || side === usual) delete el.params.side;
  else el.params.side = side;
}

/** One group of a view's terminals on a side of its own (v0.4.x T15); null: with the view's. */
export function setGroupSide(project: Project, pageId: string, id: string, group: string, side: ViewSide | null): void {
  const el = getElement(getPage(project, pageId), id);
  if (el.symbol !== "plant-view") throw new OpError("Only a plant or module view has sides");
  const { view, groups } = viewSides(el);
  const next = { ...groups };
  if (!side || side === view) delete next[group];
  else next[group] = side;
  if (Object.keys(next).length) el.params.sides = JSON.stringify(next);
  else delete el.params.sides;
}

export const PLANT_VIEW_KEYS = ["plant", "show", "terms", "pdesc", "pinfo", "ppins", "pgroups", "pbo", "pmod", "pmark"];

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
      el.params.ppins = item ? plantPinsParam(item, project) : "[]";
      delete el.params.pgroups;
      el.params.pbo = item?.powerByOthers === true;
      if (item?.mark) el.params.pmark = item.mark;
      else delete el.params.pmark;
      // A controller's module is drawn at the top of the sheet, terminals underneath (controller.md §5).
      if (item?.module) {
        el.params.pmod = moduleParam(item);
        el.zone = "internal";
      } else delete el.params.pmod;
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
  const before = page.boundaryY;
  page.boundaryY = y === null ? null : Math.round(Math.min(AREA_UNITS.h, Math.max(0, y)));
  // Terminals in the block move with it.
  if (before !== null && page.boundaryY !== null && before !== page.boundaryY) {
    for (const el of page.elements) if (el.params.onBlock === true) el.pos = [el.pos[0], page.boundaryY];
  }
  updateZones(page);
  spreadBlock(page);
}

/** A terminal dropped on or next to the boundary's terminal block goes into it. */
function snapToBlock(page: Page, el: Element, moving?: Set<string>): void {
  if (page.boundaryY === null || el.symbol !== "terminal" || (el.rot !== 0 && el.rot !== 180)) return;
  if (Math.abs(el.pos[1] - page.boundaryY) > 1.5) return;
  // A column from any other terminal in the block, so each has its own (v0.3 §2).
  el.pos = [freeCellX(page, el.pos[0], moving ?? new Set([el.id])), page.boundaryY];
}

/** Elements below the boundary are field equipment; on or above it, panel internals. */
export function updateZones(page: Page): void {
  for (const el of page.elements) {
    if (el.symbol === "terminal") {
      // Upright terminals on the boundary are cells of its terminal block.
      const onBlock = page.boundaryY !== null && el.pos[1] === page.boundaryY && (el.rot === 0 || el.rot === 180);
      if (onBlock) el.params.onBlock = true;
      else delete el.params.onBlock;
    }
    // No boundary: nothing on the sheet is outside the panel, plant views included (v0.4.x F7).
    if (page.boundaryY === null) {
      el.zone = "internal";
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
// Expectations (controller.md §6)

/** Add or replace an expectation. "should" needs an input point; both need one or two conditions. */
export function setExpectation(project: Project, e: Omit<Expectation, "id"> & { id?: string }): string {
  if (e.id && project.expectations.find((x) => x.id === e.id)?.interlock) throw new OpError("That one is made by an interlock: change the interlock, in Design");
  const when = (e.when ?? []).filter((c) => c.ref).slice(0, 2).map((c) => ({ ref: c.ref, on: c.on !== false }));
  if (!when.length) throw new OpError("Say when: pick what it depends on");
  if (e.kind === "should") {
    if (!e.point) throw new OpError("Pick the input it's about");
    const r = /^plant:([^:]+):(.+)$/.exec(e.point);
    const item = r && project.plant.find((p) => p.id === r[1]);
    const point = item?.points?.find((p) => p.name === r![2]);
    if (!point) throw new OpError("Pick the input it's about");
    if (!isInputForm(point.form)) throw new OpError(`${point.name} isn't an input: "should be … when …" is for inputs. Use "Never …" for anything else`);
  }
  const next: Expectation = {
    id: e.id ?? newId("x"),
    kind: e.kind === "never" ? "never" : "should",
    ...(e.kind === "should" ? { point: e.point, ...(e.on === false ? { on: false } : {}) } : {}),
    when,
    ...(when.length > 1 ? { join: e.join === "or" ? "or" : "and" } : {}),
    ...(e.note?.trim() ? { note: e.note.trim() } : {}),
  };
  const missing = missingRefs(project, next);
  if (missing.length) throw new OpError("It names something that isn't on the drawing");
  const i = project.expectations.findIndex((x) => x.id === next.id);
  if (i >= 0) project.expectations[i] = next;
  else project.expectations.push(next);
  return next.id;
}

export function deleteExpectation(project: Project, id: string): void {
  if (project.expectations.find((x) => x.id === id)?.interlock) throw new OpError("That one is made by an interlock: remove the interlock, in Design");
  project.expectations = project.expectations.filter((x) => x.id !== id);
}

// ---------------------------------------------------------------------------
// General arrangement (GA) sheets

const VIEW_TITLES: Record<GaView, string> = {
  backplate: "General arrangement: backplate",
  "door-front": "General arrangement: door front",
  "door-back": "General arrangement: door back",
  detail: "General arrangement: details",
};

/**
 * Add a GA sheet: the panel at true scale, backplate or door. A door back
 * (or a door front showing one leaf of a door laid out elsewhere) is `of`
 * a door-front sheet, and takes its door from there.
 */
export function addGaPage(project: Project, title: string, ga: GaSettings, afterId?: string): Page {
  if (ga.of) {
    const owner = project.pages.find((p) => p.id === ga.of);
    if (owner?.ga?.view !== "door-front" || owner.ga.of) throw new OpError("A door view must be of a door-front sheet");
  } else if (ga.view === "door-back") throw new OpError("A door back is the back of a door front: pick its sheet");
  const page = addPage(project, title || VIEW_TITLES[ga.view], afterId);
  page.ga = { scale: ga.scale, enclosure: { ...ga.enclosure }, view: ga.view };
  // A detail sheet has no enclosure and no scale of its own: its frames are in paper mm (design-v0.3 §6).
  if (ga.view === "detail") {
    const s = detailSpace();
    page.ga = { scale: 1, enclosure: { w: Math.round(s.w), h: Math.round(s.h) }, view: "detail" };
    page.gaItems = [];
    return page;
  }
  if (ga.of) {
    page.ga.of = ga.of;
    page.ga.enclosure = { ...project.pages.find((p) => p.id === ga.of)!.ga!.enclosure };
  }
  if (ga.view === "door-front" && !ga.of && ga.leaves?.length) setLeaves(page.ga, ga.leaves);
  if (ga.view === "door-front" && !ga.of && ga.columns?.length) setColumns(page.ga, ga.columns);
  if (ga.leaf !== undefined && ga.view !== "backplate") page.ga.leaf = ga.leaf;
  if (ga.pane && ga.view !== "backplate") page.ga.pane = [ga.pane[0], ga.pane[1]];
  if (ga.behind && ga.view === "backplate") page.ga.behind = { sheet: ga.behind.sheet, pane: ga.behind.pane ? [ga.behind.pane[0], ga.behind.pane[1]] : null };
  page.gaItems = [];
  return page;
}

/** One or two leaves; two share the door's width. */
function setLeaves(ga: GaSettings, leaves: DoorLeaf[]): void {
  if (leaves.length >= 2) {
    const a = Math.min(Math.max(50, leaves[0]!.w), ga.enclosure.w - 50);
    if (!(ga.enclosure.w > 100)) throw new OpError("The door is too narrow for two leaves");
    ga.leaves = [
      { w: a, hinge: leaves[0]!.hinge },
      { w: ga.enclosure.w - a, hinge: leaves[1]!.hinge },
    ];
  } else if (leaves.length === 1 && leaves[0]!.hinge === "right") ga.leaves = [{ w: ga.enclosure.w, hinge: "right" }];
  else delete ga.leaves;
  if (!ga.leaves || ga.leaves.length < 2) delete ga.leaf;
}

/**
 * A modular door's columns (v0.4.x M13): up to 6, each up to 8 doors.
 * Stored as given (sized to fit when drawn: the last column and door take
 * what's left); none, or one column of one door, is the plain door again.
 */
function setColumns(ga: GaSettings, columns: DoorColumn[]): void {
  const cols = columns
    .slice(0, MAX_COLUMNS)
    .map((c) => ({
      w: Math.max(1, Math.round(c.w)),
      doors: c.doors.slice(0, MAX_DOORS).map((d) => ({ h: Math.max(1, Math.round(d.h)), hinge: d.hinge === "right" ? ("right" as const) : ("left" as const), ...(d.name?.trim() ? { name: d.name.trim() } : {}) })),
    }))
    .filter((c) => c.doors.length);
  if (!cols.length || (cols.length === 1 && cols[0]!.doors.length === 1 && !cols[0]!.doors[0]!.name)) {
    delete ga.columns;
    if (cols[0]?.doors[0]?.hinge === "right") ga.leaves = [{ w: ga.enclosure.w, hinge: "right" }];
    else delete ga.leaves;
    return;
  }
  if (cols.reduce((a, c) => a + c.w, 0) - cols[cols.length - 1]!.w >= ga.enclosure.w) throw new OpError("The columns are wider than the door");
  ga.columns = cols;
  delete ga.leaves;
}

/** A door front's columns as they're drawn: its own, or its leaves as columns of one door. */
function columnsOf(page: Page): DoorColumn[] {
  return doorColumns(page).map((c) => ({ w: c.w, doors: c.doors.map((d) => ({ ...d })) }));
}

/** A door front that has its own door, for changing its doors. */
function doorFront(project: Project, pageId: string): Page & { ga: GaSettings } {
  const page = getPage(project, pageId);
  if (page.ga?.view !== "door-front" || page.ga.of) throw new OpError("Doors are set out on the door front that has the door");
  return page as Page & { ga: GaSettings };
}

/**
 * Split one door in two (v0.4.x M13): `down` makes two side by side (its
 * column split, the doors above and below it split with it), `across` two
 * stacked; at `at` mm from the door's own left or top edge (default its middle).
 */
export function splitDoor(project: Project, pageId: string, col: number, row: number, dir: "across" | "down", at?: number): void {
  const page = doorFront(project, pageId);
  const cols = columnsOf(page);
  const c = cols[col];
  const d = c?.doors[row];
  if (!c || !d) throw new OpError("No such door");
  if (dir === "across") {
    if (c.doors.length >= MAX_DOORS) throw new OpError(`A column has up to ${MAX_DOORS} doors`);
    const a = Math.round(at ?? d.h / 2);
    if (!(a >= 20 && d.h - a >= 20)) throw new OpError("Split it at least 20 mm from its edge");
    c.doors.splice(row, 1, { ...d, h: a }, { h: d.h - a, hinge: d.hinge });
    replate(project, page, ([c0, r0]) => (c0 === col && r0 > row ? [c0, r0 + 1] : [c0, r0]));
  } else {
    if (cols.length >= MAX_COLUMNS) throw new OpError(`A door has up to ${MAX_COLUMNS} columns`);
    const a = Math.round(at ?? c.w / 2);
    if (!(a >= 20 && c.w - a >= 20)) throw new OpError("Split it at least 20 mm from its edge");
    const right = { w: c.w - a, doors: c.doors.map((x) => ({ h: x.h, hinge: "right" as const })) };
    cols.splice(col, 1, { ...c, w: a }, right);
    // Plates behind columns to the right move with them.
    replate(project, page, ([c0, r0]) => (c0 > col ? [c0 + 1, r0] : [c0, r0]));
  }
  setColumns(page.ga, cols);
  page.ga.columns ??= cols;
}

/**
 * Plates behind a door front's doors when its doors change (v0.4.x M13): a
 * plate behind a door that's gone (joined, or its column removed) is left as
 * an ordinary backplate with nothing behind it, for Check to say so; plates
 * behind doors that moved up a row move with them. Nothing on a plate changes.
 */
function replate(project: Project, front: Page, map: (pane: [number, number]) => [number, number] | null): void {
  for (const p of project.pages) {
    const b = p.ga?.view === "backplate" ? p.ga.behind : undefined;
    if (b?.sheet !== front.id || !b.pane) continue;
    b.pane = map(b.pane);
  }
}

/** Join a door with the one below it (v0.4.x M13): one door, the top one's hinge and name. */
export function joinDoorBelow(project: Project, pageId: string, col: number, row: number): void {
  const page = doorFront(project, pageId);
  const cols = columnsOf(page);
  const c = cols[col];
  const d = c?.doors[row];
  const below = c?.doors[row + 1];
  if (!c || !d) throw new OpError("No such door");
  if (!below) throw new OpError("There's no door below it");
  c.doors.splice(row, 2, { ...d, h: d.h + below.h });
  setColumns(page.ga, cols);
  // Both doors' plates are left with nothing behind them; those below move up a row.
  replate(project, page, ([c0, r0]) => (c0 !== col ? [c0, r0] : r0 === row || r0 === row + 1 ? null : r0 > row + 1 ? [c0, r0 - 1] : [c0, r0]));
  // Sheets showing the door below now show the joined one; rows below move up.
  for (const p of project.pages) {
    const pn = p.ga?.of === page.id ? p.ga.pane : undefined;
    if (!pn || pn[0] !== col) continue;
    if (pn[1] > row) p.ga!.pane = [col, pn[1] - 1];
  }
}

/** Change one door of a modular door: its height, hinge or name; or a column's width. */
export function updateDoor(project: Project, pageId: string, col: number, row: number | null, patch: { w?: number; h?: number; hinge?: "left" | "right"; name?: string }): void {
  const page = doorFront(project, pageId);
  const cols = columnsOf(page);
  const c = cols[col];
  if (!c) throw new OpError("No such column");
  if (patch.w !== undefined) c.w = patch.w;
  if (row !== null) {
    const d = c.doors[row];
    if (!d) throw new OpError("No such door");
    if (patch.h !== undefined) d.h = patch.h;
    if (patch.hinge) d.hinge = patch.hinge;
    if (patch.name !== undefined) {
      if (patch.name.trim()) d.name = patch.name.trim();
      else delete d.name;
    }
  }
  // A plain door stays plain unless named: keep it modular once it's had columns set.
  setColumns(page.ga, cols);
  if (!page.ga.columns && (cols.length > 1 || cols[0]!.doors.length > 1 || cols[0]!.doors[0]!.name)) page.ga.columns = cols;
  dropGonePlates(project, page);
}

/** Plates behind doors that no longer exist are left with nothing behind them. */
function dropGonePlates(project: Project, front: Page): void {
  const there = new Set(doorPanes(front).map((p) => `${p.col}:${p.row}`));
  replate(project, front, (pn) => (there.has(`${pn[0]}:${pn[1]}`) ? pn : null));
}

/**
 * Add a backplate for each door (v0.4.x M13): one sheet per door of a door
 * front that has none yet, in column then row order, after the last GA sheet.
 * Each starts at its door's size less a margin all round, titled
 * *Backplate:* and the door's name. Returns the sheets made.
 */
export function addPlatesForDoors(project: Project, frontId: string, margin = PLATE_MARGIN): Page[] {
  const front = doorFront(project, frontId);
  const have = platesOf(project, front);
  const made: Page[] = [];
  let after = [...project.pages].reverse().find((p) => p.ga && p.ga.view !== "detail")?.id ?? front.id;
  for (const pane of doorPanes(front)) {
    if (have.has(`${pane.col}:${pane.row}`)) continue;
    const w = Math.max(50, pane.w - 2 * margin);
    const h = Math.max(50, pane.h - 2 * margin);
    const page = addGaPage(project, `Backplate: ${paneName(pane)}`, { scale: fitScale(w, h), enclosure: { w, h }, view: "backplate", behind: { sheet: front.id, pane: [pane.col, pane.row] } }, after);
    made.push(page);
    after = page.id;
  }
  if (!made.length) throw new OpError("Every door already has a backplate");
  return made;
}

/** Say which door a backplate is behind, or none (it's the panel's one backplate). Its size is left as it is. */
export function setPlateBehind(project: Project, pageId: string, behind: { sheet: string; pane: [number, number] } | null): void {
  const page = getPage(project, pageId);
  if (page.ga?.view !== "backplate") throw new OpError("Only a backplate sits behind a door");
  if (!behind) {
    delete page.ga.behind;
    return;
  }
  const front = doorFront(project, behind.sheet);
  if (!doorPanes(front).some((p) => p.col === behind.pane[0] && p.row === behind.pane[1])) throw new OpError("No such door");
  page.ga.behind = { sheet: front.id, pane: [behind.pane[0], behind.pane[1]] };
}

/** Size a backplate from its door again: the door's size less a margin all round. */
export function sizePlateFromDoor(project: Project, pageId: string, margin = PLATE_MARGIN): void {
  const page = getPage(project, pageId);
  const d = page.ga ? plateDoor(project, page) : null;
  if (!d) throw new OpError("This backplate isn't behind a door");
  page.ga!.enclosure = { w: Math.max(50, d.pane.w - 2 * margin), h: Math.max(50, d.pane.h - 2 * margin) };
}

export function setGaSettings(
  project: Project,
  pageId: string,
  patch: Partial<Omit<GaSettings, "of" | "leaf" | "pane" | "columns">> & { of?: string | null; leaf?: 0 | 1 | null; pane?: [number, number] | null; columns?: DoorColumn[] | null },
): void {
  const page = getPage(project, pageId);
  if (!page.ga) throw new OpError("That isn't a GA sheet");
  const ga = page.ga;
  if (patch.scale !== undefined) {
    if (!(patch.scale > 0)) throw new OpError("The scale must be more than 0");
    ga.scale = patch.scale;
  }
  if (patch.view && patch.view !== ga.view) {
    if (patch.view === "detail" || ga.view === "detail") throw new OpError("A detail sheet is added as one, and stays one");
    // Only what the new view takes may be on the sheet.
    const misfit = (page.gaItems ?? []).filter((it) => !viewTakes(patch.view!, it.kind));
    if (misfit.length) throw new OpError(`A ${patch.view.replace("-", " ")} can't have the ${misfit.length} rail, trunking or label item${misfit.length === 1 ? "" : "s"} on this sheet: delete them first`);
    if (patch.view === "door-back" && !patch.of && !ga.of) throw new OpError("A door back is the back of a door front: pick its sheet");
    if (ga.view === "door-front" && project.pages.some((p) => p.ga?.of === page.id)) throw new OpError("Other sheets show this door: change them first");
    ga.view = patch.view;
    if (ga.view === "backplate") {
      delete ga.of;
      delete ga.leaf;
    }
    if (ga.view !== "door-front") delete ga.leaves;
  }
  if (patch.of !== undefined) {
    if (patch.of === null) {
      if (ga.view === "door-back") throw new OpError("A door back is the back of a door front: pick its sheet");
      delete ga.of;
    } else {
      const owner = project.pages.find((p) => p.id === patch.of);
      if (owner?.ga?.view !== "door-front" || owner.ga.of || owner.id === page.id) throw new OpError("A door view must be of a door-front sheet");
      if (ga.view === "door-front" && (page.gaItems ?? []).some((it) => it.kind !== "dim")) throw new OpError("This door front has its own devices: delete them first, or keep it as its own door");
      ga.of = owner.id;
      ga.enclosure = { ...owner.ga.enclosure };
      delete ga.leaves;
    }
  }
  if (patch.enclosure) {
    const { w, h } = patch.enclosure;
    if (!(w > 0 && h > 0)) throw new OpError("The enclosure needs a width and height");
    if (ga.of) throw new OpError("This sheet shows another sheet's door: change its size there");
    ga.enclosure = { w, h };
    if (ga.leaves) setLeaves(ga, ga.leaves);
    // Door views of this door take its size too.
    for (const p of project.pages) if (p.ga?.of === page.id) p.ga.enclosure = { w, h };
  }
  if (patch.leaves) {
    if (ga.view !== "door-front" || ga.of) throw new OpError("Leaves are set on the door front that has the door");
    setLeaves(ga, patch.leaves);
    if (!ga.leaves || ga.leaves.length < 2) for (const p of project.pages) if (p.ga?.of === page.id) delete p.ga.leaf;
  }
  if (patch.leaf !== undefined) {
    if (patch.leaf === null) delete ga.leaf;
    else if (ga.view !== "backplate") ga.leaf = patch.leaf;
  }
  if (patch.columns !== undefined) {
    if (ga.view !== "door-front" || ga.of) throw new OpError("Doors are set out on the door front that has the door");
    if (patch.columns === null) delete ga.columns;
    else setColumns(ga, patch.columns);
    dropGonePlates(project, page);
  }
  if (patch.pane !== undefined) {
    if (patch.pane === null) delete ga.pane;
    else if (ga.view !== "backplate") {
      ga.pane = [patch.pane[0], patch.pane[1]];
      delete ga.leaf;
    }
  }
}

function gaPage(project: Project, pageId: string): Page & { ga: GaSettings; gaItems: GaItem[] } {
  const page = getPage(project, pageId);
  if (!page.ga) throw new OpError("That isn't a GA sheet");
  page.gaItems ??= [];
  return page as Page & { ga: GaSettings; gaItems: GaItem[] };
}

/** Put something on a GA sheet. Positions and sizes are real mm, rounded to 0.5 mm. */
export function addGaItem(project: Project, pageId: string, item: Omit<GaItem, "id">): GaItem {
  const page = gaPage(project, pageId);
  if (!sheetTakes(project, page, item.kind)) {
    const what = { rail: "A DIN rail", trunking: "Trunking", device: "A device", label: "A label plate", dim: "A dimension", detail: "A detail", frame: "A detail frame" }[item.kind];
    const owner = doorOwner(project, page);
    throw new OpError(
      owner && owner !== page && page.ga.view === "door-front"
        ? `This sheet shows the door laid out on sheet ${owner.number}: put it there`
        : `${what} doesn't go on a ${page.ga.view.replace("-", " ")}`,
    );
  }
  const r = (v: number) => Math.round(v * 2) / 2;
  const it: GaItem = { ...item, id: newId("g"), x: r(item.x), y: r(item.y), w: Math.max(1, r(item.w)), h: Math.max(1, r(item.h)) };
  // A controller's module is on one GA only.
  if (it.module && project.pages.some((pg) => (pg.gaItems ?? []).some((o) => o.module === it.module))) throw new OpError("That module's already on a GA");
  // A schematic device (or its door handle) is on one GA only.
  if (it.refs?.length)
    for (const pg of project.pages)
      for (const other of pg.gaItems ?? []) if ((other.part ?? "") === (it.part ?? "") && other.refs?.some((x) => it.refs!.includes(x))) throw new OpError("That's already on a GA");
  // A terminal strip keeps up with the schematic from here on (note 45).
  const strip = it.part ? null : itemStrip(project, it);
  if (strip) {
    it.strip = strip;
    it.seen = [...(it.refs ?? [])];
  }
  if (it.kind === "label") {
    it.text ??= "LABEL";
    it.textMm ??= 5;
  }
  // A detail gets the next free letter; a frame shows one detail, once, at the largest scale that fits (design-v0.3 §6).
  if (it.kind === "detail") it.letter = nextDetailLetter(project);
  if (it.kind === "frame") {
    const d = it.detail ? detailOf(project, it) : null;
    if (!d) throw new OpError("A frame shows a detail: pick one in Place detail…");
    if (frameOf(project, d.it.id)) throw new OpError(`Detail ${d.it.letter} is already shown in a frame`);
    it.zoom = it.zoom && DETAIL_ZOOMS.includes(it.zoom) ? it.zoom : fitZoom(d.it.w, d.it.h);
    it.w = d.it.w * it.zoom;
    it.h = d.it.h * it.zoom;
  }
  page.gaItems.push(it);
  return it;
}

/** Put a dimension on a GA sheet: its points along the axis, its line at `at` across it. */
/**
 * A door device with no schematic part (v0.4.x M5): an operator screen and
 * the like, with a name, a tag, a size and an optional cut-out. It prints its
 * tag and is on the bill of materials.
 */
export function addGaDevice(project: Project, pageId: string, d: { name: string; tag?: string; x: number; y: number; w: number; h: number; cutout?: string }): GaItem {
  return addGaItem(project, pageId, { kind: "device", x: d.x, y: d.y, w: d.w, h: d.h, text: d.name.trim() || "Device", ...(d.tag?.trim() ? { tag: d.tag.trim() } : {}), ...(d.cutout?.trim() ? { cutout: d.cutout.trim() } : {}) });
}

export function addGaDim(project: Project, pageId: string, dim: GaDim, frame?: string): GaItem {
  if (dim.points.length < 2) throw new OpError("A dimension needs two points at least");
  const page = gaPage(project, pageId);
  if (!sheetTakes(project, page, "dim")) throw new OpError("A dimension doesn't go here");
  // On a detail sheet a dimension belongs to a frame: it measures what the frame shows (design-v0.3 §6).
  if (page.ga.view === "detail" && !page.gaItems.some((f) => f.kind === "frame" && f.id === frame)) throw new OpError("On a detail sheet, a dimension goes in a frame");
  const it: GaItem = { id: newId("g"), kind: "dim", x: 0, y: 0, w: 1, h: 1, dim: { ...dim, points: dim.points.map((p) => ({ ...p })) }, ...(frame && page.ga.view === "detail" ? { frame } : {}) };
  page.gaItems.push(it);
  return it;
}

export function updateGaItem(project: Project, pageId: string, id: string, patch: Partial<Omit<GaItem, "id" | "kind">>): void {
  const it = gaPage(project, pageId).gaItems.find((x) => x.id === id);
  if (!it) throw new OpError(`No GA item "${id}"`);
  const r = (v: number) => Math.round(v * 2) / 2;
  if (patch.x !== undefined) it.x = r(patch.x);
  if (patch.y !== undefined) it.y = r(patch.y);
  if (patch.w !== undefined) it.w = Math.max(1, r(patch.w));
  if (patch.h !== undefined) it.h = Math.max(1, r(patch.h));
  if (patch.text !== undefined) it.text = patch.text;
  if (patch.tag !== undefined) {
    if (patch.tag.trim()) it.tag = patch.tag.trim();
    else delete it.tag;
  }
  if (patch.cutout !== undefined) {
    if (patch.cutout.trim()) it.cutout = patch.cutout.trim();
    else delete it.cutout;
  }
  if (patch.textMm !== undefined && patch.textMm > 0) it.textMm = patch.textMm;
  // A label plate's text place (v0.4.x T12): null, or the middle, clears it.
  if ("textAt" in patch && it.kind === "label") {
    if (patch.textAt) it.textAt = patch.textAt;
    else delete it.textAt;
  }
  if (patch.dim !== undefined && it.kind === "dim") it.dim = { ...it.dim!, ...patch.dim };
  if (patch.letter !== undefined && it.kind === "detail") {
    const letter = patch.letter.trim().toUpperCase();
    if (!letter) throw new OpError("A detail needs a letter");
    if (allDetails(project).some((d) => d.it.id !== it.id && d.it.letter === letter)) throw new OpError(`There's already a detail ${letter}`);
    it.letter = letter;
  }
  if (patch.zoom !== undefined && it.kind === "frame") {
    if (!DETAIL_ZOOMS.includes(patch.zoom)) throw new OpError("A frame's scale is 2:1, 1:1, 1:2 or 1:5");
    it.zoom = patch.zoom;
  }
  syncDetailFrames(project);
}

export function moveGaItems(project: Project, pageId: string, ids: string[], d: Vec): void {
  const page = gaPage(project, pageId);
  for (const it of page.gaItems) {
    if (!ids.includes(it.id)) continue;
    if (it.dim) {
      // A dimension moves its line, across its axis; its points stay on what they measure.
      it.dim.at = Math.round((it.dim.at + (it.dim.axis === "h" ? d[1] : d[0])) * 2) / 2;
      continue;
    }
    it.x = Math.round((it.x + d[0]) * 2) / 2;
    it.y = Math.round((it.y + d[1]) * 2) / 2;
  }
}

/** Turn items a quarter turn (swap width and height) about their centres. */
export function rotateGaItems(project: Project, pageId: string, ids: string[]): void {
  for (const it of gaPage(project, pageId).gaItems) {
    if (!ids.includes(it.id) || it.dim) continue;
    const cx = it.x + it.w / 2;
    const cy = it.y + it.h / 2;
    [it.w, it.h] = [it.h, it.w];
    it.x = Math.round((cx - it.w / 2) * 2) / 2;
    it.y = Math.round((cy - it.h / 2) * 2) / 2;
  }
}

/**
 * Split a placed terminal strip at one of its terminals (v0.4.x T4): that
 * terminal and the rest go on a new GA item, put on the next rail down when
 * there is one (or beside it, for a strip turned upright). Both keep the
 * strip's name and print their range. Returns the new item.
 */
export function splitGaStrip(project: Project, pageId: string, id: string, at: string): GaItem {
  const page = gaPage(project, pageId);
  const it = page.gaItems.find((x) => x.id === id);
  const strip = it && !it.part ? itemStrip(project, it) : null;
  if (!it || !strip) throw new OpError("Pick a placed terminal strip");
  const refs = it.refs ?? [];
  const i = refs.indexOf(at);
  if (i < 0) throw new OpError("That terminal isn't in this part of the strip");
  if (i === 0) throw new OpError("Split at a terminal after the first");
  const upright = it.h > it.w;
  const head = refs.slice(0, i);
  const tail = refs.slice(i);
  const size = (r: string[]) => stripSize(project, r).w;
  const part: GaItem = { ...structuredClone(it), id: newId("g"), refs: tail, seen: [...tail] };
  it.refs = head;
  it.seen = [...head];
  if (!it.device) {
    if (upright) {
      it.h = size(head);
      part.h = size(tail);
    } else {
      it.w = size(head);
      part.w = size(tail);
    }
  }
  if (upright) part.x = it.x + it.w + 10;
  else {
    // The next horizontal rail below, from its left end; else just below.
    const rails = page.gaItems.filter((r) => r.kind === "rail" && r.w >= r.h && r.y + r.h / 2 > it.y + it.h / 2 + 1).sort((a, b) => a.y - b.y);
    const rail = rails[0];
    if (rail) {
      part.x = rail.x;
      part.y = Math.round((rail.y + rail.h / 2 - part.h / 2) * 2) / 2;
    } else part.y = it.y + it.h + 10;
  }
  page.gaItems.push(part);
  return part;
}

export function deleteGaItems(project: Project, pageId: string, ids: string[]): void {
  const page = gaPage(project, pageId);
  // A frame's dimensions go with it.
  const gone = new Set([...ids, ...page.gaItems.filter((x) => x.frame && ids.includes(x.frame)).map((x) => x.id)]);
  page.gaItems = page.gaItems.filter((x) => !gone.has(x.id));
  detachDims(project, gone);
  // A detail's frame goes with it.
  for (const pg of project.pages) {
    const frames = new Set((pg.gaItems ?? []).filter((it) => it.kind === "frame" && it.detail && ids.includes(it.detail)).map((it) => it.id));
    if (frames.size) pg.gaItems = pg.gaItems!.filter((it) => !frames.has(it.id) && !(it.frame && frames.has(it.frame)));
  }
}

/** Dimension points on items that have gone stay where they were. */
function detachDims(project: Project, gone: Set<string>): void {
  for (const pg of project.pages)
    for (const it of pg.gaItems ?? [])
      for (const p of it.dim?.points ?? [])
        if (p.item && gone.has(p.item)) {
          delete p.item;
          delete p.edge;
        }
}

/** Change a generic GA size for this project (null: back to the generic one). */
export function setGaSize(project: Project, key: string, size: { w?: number; h?: number } | null): void {
  project.gaSizes ??= {};
  if (!size) delete project.gaSizes[key];
  else project.gaSizes[key] = { ...project.gaSizes[key], ...size };
}

// ---------------------------------------------------------------------------
// Device table (GA): devices with real sizes, from the shared library or the project's own

function devicesOf(project: Project): ProjectDevice[] {
  if (!project.devices) project.devices = [];
  return project.devices;
}

/**
 * Bring a library device into the project (or refresh the project's copy).
 * GA items using it that still had the old size take the new one.
 */
export function useLibraryDevice(project: Project, entry: DeviceEntry): ProjectDevice {
  const list = devicesOf(project);
  const copy = projectCopy(entry);
  const i = list.findIndex((d) => d.id === entry.id);
  if (i < 0) {
    list.push(copy);
    return copy;
  }
  const old = list[i]!;
  list[i] = copy;
  if (old.w !== copy.w || old.h !== copy.h) resizeDeviceItems(project, entry.id, old, copy);
  return copy;
}

/** A device made in this project only (not in the library). */
export function addProjectDevice(project: Project, d: Omit<ProjectDevice, "id" | "library">): ProjectDevice {
  if (!d.name.trim()) throw new OpError("A device needs a name");
  if (!(d.w > 0) || !(d.h > 0)) throw new OpError("A device needs a width and height");
  const dev: ProjectDevice = { ...d, name: d.name.trim(), id: newId("dev"), library: false };
  devicesOf(project).push(dev);
  return dev;
}

export function updateProjectDevice(project: Project, id: string, patch: Partial<Omit<ProjectDevice, "id" | "library">>): void {
  const dev = devicesOf(project).find((d) => d.id === id);
  if (!dev) throw new OpError(`No device "${id}" in this project`);
  const old = { w: dev.w, h: dev.h };
  if (patch.name !== undefined) {
    if (!patch.name.trim()) throw new OpError("A device needs a name");
    dev.name = patch.name.trim();
  }
  if (patch.maker !== undefined) dev.maker = patch.maker.trim();
  if (patch.part !== undefined) dev.part = patch.part.trim();
  if (patch.kind !== undefined) dev.kind = patch.kind;
  if (patch.w !== undefined && patch.w > 0) dev.w = patch.w;
  if (patch.h !== undefined && patch.h > 0) dev.h = patch.h;
  if (patch.d !== undefined && patch.d >= 0) dev.d = patch.d;
  if (old.w !== dev.w || old.h !== dev.h) resizeDeviceItems(project, id, old, dev);
}

/** Take a device out of the project's table. GA items that were it keep their size. */
export function removeProjectDevice(project: Project, id: string): void {
  project.devices = devicesOf(project).filter((d) => d.id !== id);
  for (const page of project.pages) for (const it of page.gaItems ?? []) if (it.device === id) delete it.device;
  for (const it of project.plant) if (it.module?.device === id) delete it.module.device;
}

/** Items of a device that had its old size (not sized by hand) get the new one, turned the same way. */
function resizeDeviceItems(project: Project, id: string, old: { w: number; h: number }, now: { w: number; h: number }): void {
  for (const page of project.pages) {
    for (const it of page.gaItems ?? []) {
      if (it.device !== id) continue;
      const turned = it.w === old.h && it.h === old.w && old.w !== old.h;
      if ((it.w === old.w && it.h === old.h) || turned) {
        it.w = turned ? now.h : now.w;
        it.h = turned ? now.w : now.h;
      }
    }
  }
}

/**
 * Make a GA device one from the device table (its size comes from there,
 * turned the way the item is), or back to a generic size (null).
 */
export function setGaItemDevice(project: Project, pageId: string, itemId: string, deviceId: string | null, generic?: { w: number; h: number }): void {
  const it = gaPage(project, pageId).gaItems.find((x) => x.id === itemId);
  if (!it) throw new OpError(`No GA item "${itemId}"`);
  const size = deviceId ? devicesOf(project).find((d) => d.id === deviceId) : generic;
  if (!size) throw new OpError(deviceId ? `No device "${deviceId}" in this project` : "No size given");
  // Keep the item turned the way it is: on its side stays on its side.
  const onSide = it.w > it.h && size.h > size.w;
  const cx = it.x + it.w / 2;
  it.w = onSide ? size.h : size.w;
  it.h = onSide ? size.w : size.h;
  // Grows about its middle along a rail; the top stays on the rail.
  it.x = Math.round((cx - it.w / 2) * 2) / 2;
  if (deviceId) it.device = deviceId;
  else delete it.device;
}

// ---------------------------------------------------------------------------
// Distributions (design-v0.2 §2)

/** The params on an element that name a distribution: a busbar's or arrow's `dist`, an incoming supply's `dist_<terminal>`. */
export function distParamKeys(el: Element): string[] {
  if (isBar(el) || el.symbol === "offpage") return ["dist"];
  if (el.symbol === "supply") return Object.keys(el.params).filter((k) => k.startsWith("dist_"));
  return [];
}

/** The distribution an element (or one supply terminal) is on, if any. */
export function distributionOf(project: Project, el: Element, terminal?: string): Distribution | undefined {
  const key = el.symbol === "supply" ? `dist_${terminal ?? ""}` : "dist";
  const id = el.params[key];
  return typeof id === "string" && id ? project.distributions.find((d) => d.id === id) : undefined;
}

export function addDistribution(project: Project, d: Partial<Omit<Distribution, "id">> & { name: string }): Distribution {
  const name = d.name.trim();
  if (!name) throw new OpError("A distribution needs a name");
  if (project.distributions.some((x) => x.name === name)) throw new OpError(`There's already a distribution called ${name}`);
  const out: Distribution = { id: newId("d"), name, kind: d.kind ?? "line", voltage: (d.voltage ?? "").trim() };
  if (d.colour?.trim()) out.colour = colourCode(d.colour);
  if (d.function?.trim()) out.function = d.function.trim();
  project.distributions.push(out);
  return out;
}

export function updateDistribution(project: Project, id: string, patch: Partial<Omit<Distribution, "id">>): Distribution {
  const d = project.distributions.find((x) => x.id === id);
  if (!d) throw new OpError(`No distribution "${id}"`);
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new OpError("A distribution needs a name");
    if (project.distributions.some((x) => x.id !== id && x.name === name)) throw new OpError(`There's already a distribution called ${name}`);
    d.name = name;
  }
  if (patch.kind) d.kind = patch.kind;
  if (patch.voltage !== undefined) d.voltage = patch.voltage.trim();
  if (patch.colour !== undefined) {
    if (patch.colour.trim()) d.colour = colourCode(patch.colour);
    else delete d.colour;
  }
  if (patch.function !== undefined) {
    if (patch.function.trim()) d.function = patch.function.trim();
    else delete d.function;
  }
  return d;
}

/** Delete a distribution: busbars and arrows on it become local, supply terminals stop feeding it. */
export function deleteDistribution(project: Project, id: string): void {
  project.distributions = project.distributions.filter((d) => d.id !== id);
  for (const pg of project.pages) for (const el of pg.elements) for (const k of distParamKeys(el)) if (el.params[k] === id) delete el.params[k];
}
