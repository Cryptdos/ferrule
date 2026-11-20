/**
 * Model operations. Every edit to a project goes through one of these
 * small functions, used by the UI now and the MCP tools later (DESIGN.md
 * §3, §12). They change the project in place; callers that want undo take
 * a copy first.
 */
import { type Rotation, type Vec, clampToArea, snapVec } from "./geometry";
import { type Element, type Page, type ParamValue, type Project, newId } from "./model";
import { defaultParams, requireSymbol } from "./symbols";

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
