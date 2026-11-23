/**
 * Alignment tools (design-v0.3 §5). Align left, centre or right, top,
 * middle or bottom; distribute evenly across or down.
 *
 * - One item aligns to the sheet's usable space (inside the border, above
 *   the title block).
 * - Two or more align to the first one picked, which stays put; a box
 *   selection has no first, so it aligns to the outline around them all.
 * - Distribute (three or more) keeps the two outer items and makes the gaps
 *   between bodies equal.
 *
 * Edges are an element's body (not its tag or label). Parts move as if
 * dragged: to whole grid units, wires following. GA items move in mm on the
 * GA's finer (1 mm) snap.
 */
import { AREA_UNITS, offsetRect, type Rect, type Vec } from "./geometry";
import type { Project } from "./model";
import { gaFrame, sheetToGa } from "./ga";
import { moveElements, moveGaItems, OpError } from "./ops";
import { localGeometry } from "./symbols";
import { elementTexts } from "./tags";

export type AlignHow = "left" | "centre" | "right" | "top" | "middle" | "bottom";
export type DistributeHow = "across" | "down";

interface Box extends Rect {
  id: string;
}

/** Where a set of boxes moves to line up on `how` against `target`. */
export function alignDeltas(boxes: Box[], how: AlignHow, target: Rect): Map<string, Vec> {
  const out = new Map<string, Vec>();
  for (const b of boxes) {
    let dx = 0;
    let dy = 0;
    if (how === "left") dx = target.x - b.x;
    else if (how === "right") dx = target.x + target.w - (b.x + b.w);
    else if (how === "centre") dx = target.x + target.w / 2 - (b.x + b.w / 2);
    else if (how === "top") dy = target.y - b.y;
    else if (how === "bottom") dy = target.y + target.h - (b.y + b.h);
    else dy = target.y + target.h / 2 - (b.y + b.h / 2);
    out.set(b.id, [dx, dy]);
  }
  return out;
}

/** Equal gaps between bodies, the outer two staying put. */
export function distributeDeltas(boxes: Box[], how: DistributeHow): Map<string, Vec> {
  const across = how === "across";
  const start = (b: Box) => (across ? b.x : b.y);
  const size = (b: Box) => (across ? b.w : b.h);
  const sorted = [...boxes].sort((a, b) => start(a) - start(b) || start(a) + size(a) - (start(b) + size(b)));
  const out = new Map<string, Vec>();
  if (sorted.length < 3) return out;
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const total = start(last) + size(last) - start(first);
  const bodies = sorted.reduce((s, b) => s + size(b), 0);
  const gap = (total - bodies) / (sorted.length - 1);
  let at = start(first);
  for (const b of sorted) {
    const d = at - start(b);
    out.set(b.id, across ? [d, 0] : [0, d]);
    at += size(b) + gap;
  }
  return out;
}

/** The outline around some boxes. */
function outline(boxes: Rect[]): Rect {
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The sheet's usable space, in grid units: the drawing area inside the border, above the title block. */
export const USABLE: Rect = { x: 0, y: 0, w: AREA_UNITS.w, h: AREA_UNITS.h };

/** An element's body on the sheet. */
function bodyOf(project: Project, el: Project["pages"][number]["elements"][number]): Box {
  const g = localGeometry(el, elementTexts(el, project));
  return { id: el.id, ...offsetRect(g.body, el.pos) };
}

function target(boxes: Box[], usable: Rect, fromBox: boolean): Rect {
  if (boxes.length === 1) return usable;
  return fromBox ? outline(boxes) : boxes[0]!;
}

/**
 * Align parts on a schematic or spare sheet. `ids` in the order they were
 * picked; `fromBox` when they were picked with a box.
 */
export function alignElements(project: Project, pageId: string, ids: string[], how: AlignHow, fromBox = false): void {
  const page = project.pages.find((p) => p.id === pageId);
  if (!page) throw new OpError("No such sheet");
  const boxes = ids.flatMap((id) => {
    const el = page.elements.find((e) => e.id === id);
    return el ? [bodyOf(project, el)] : [];
  });
  if (!boxes.length) throw new OpError("Pick something to align");
  const deltas = alignDeltas(boxes, how, target(boxes, USABLE, fromBox));
  // The first picked stays put; the rest line up to it.
  for (const [id, d] of deltas) {
    const r: Vec = [Math.round(d[0]), Math.round(d[1])];
    if (r[0] || r[1]) moveElements(project, pageId, [id], r);
  }
}

export function distributeElements(project: Project, pageId: string, ids: string[], how: DistributeHow): void {
  const page = project.pages.find((p) => p.id === pageId);
  if (!page) throw new OpError("No such sheet");
  const boxes = ids.flatMap((id) => {
    const el = page.elements.find((e) => e.id === id);
    return el ? [bodyOf(project, el)] : [];
  });
  if (boxes.length < 3) throw new OpError("Pick three or more to distribute");
  for (const [id, d] of distributeDeltas(boxes, how)) {
    const r: Vec = [Math.round(d[0]), Math.round(d[1])];
    if (r[0] || r[1]) moveElements(project, pageId, [id], r);
  }
}

/** GA items, as boxes in panel mm. Dimensions don't align: they follow what they measure. */
function gaBoxes(project: Project, pageId: string, ids: string[]): { boxes: Box[]; usable: Rect } {
  const page = project.pages.find((p) => p.id === pageId);
  if (!page?.ga) throw new OpError("Not a GA sheet");
  const items = page.gaItems ?? [];
  const boxes = ids.flatMap((id) => {
    const it = items.find((i) => i.id === id);
    return it && !it.dim ? [{ id, x: it.x, y: it.y, w: it.w, h: it.h }] : [];
  });
  const frame = gaFrame(project, page);
  const a = sheetToGa(frame, [USABLE.x, USABLE.y]);
  const b = sheetToGa(frame, [USABLE.x + USABLE.w, USABLE.y + USABLE.h]);
  return { boxes, usable: { x: a[0], y: a[1], w: b[0] - a[0], h: b[1] - a[1] } };
}

export function alignGaItems(project: Project, pageId: string, ids: string[], how: AlignHow, fromBox = false): void {
  const { boxes, usable } = gaBoxes(project, pageId, ids);
  if (!boxes.length) throw new OpError("Pick something to align");
  for (const [id, d] of alignDeltas(boxes, how, target(boxes, usable, fromBox))) {
    const r: Vec = [Math.round(d[0]), Math.round(d[1])];
    if (r[0] || r[1]) moveGaItems(project, pageId, [id], r);
  }
}

export function distributeGaItems(project: Project, pageId: string, ids: string[], how: DistributeHow): void {
  const { boxes } = gaBoxes(project, pageId, ids);
  if (boxes.length < 3) throw new OpError("Pick three or more to distribute");
  for (const [id, d] of distributeDeltas(boxes, how)) {
    const r: Vec = [Math.round(d[0]), Math.round(d[1])];
    if (r[0] || r[1]) moveGaItems(project, pageId, [id], r);
  }
}

