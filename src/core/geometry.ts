/**
 * Page geometry (DESIGN.md §4, §4a).
 *
 * Everything in the model is in grid units. Millimetres only appear here,
 * where a page is fitted to A4 paper.
 *
 * The drawing area is 100 columns wide, two grid units per column, so a
 * grid unit is 277 mm / 200 = 1.385 mm on paper.
 */

/** A4 landscape, in millimetres. */
export const SHEET_MM = { w: 297, h: 210 } as const;

export const COLUMNS = 100;
export const UNITS_PER_COLUMN = 2;

/** Drawing area size in grid units. */
export const AREA_UNITS = { w: COLUMNS * UNITS_PER_COLUMN, h: 112 } as const;

/** Drawing area (the frame) on the sheet, in millimetres. */
export const AREA_MM = { x: 10, y: 8, w: 277 } as const;

/** Millimetres per grid unit. */
export const UNIT_MM = AREA_MM.w / AREA_UNITS.w;

/** Frame height in millimetres. */
export const AREA_H_MM = AREA_UNITS.h * UNIT_MM;

/** Column-number strip below the frame. */
export const COLUMN_STRIP_MM = 5;

/** Title block, below the column strip. */
export const TITLE_BLOCK_MM = {
  x: AREA_MM.x,
  y: AREA_MM.y + AREA_H_MM + COLUMN_STRIP_MM,
  w: AREA_MM.w,
  h: 32,
} as const;

/** Unlabelled tick marks down the left and right edges. */
export const SIDE_TICK_UNITS = 8;

export type Vec = [number, number];

/** Column (1–100) of an x position in grid units. */
export function columnOf(x: number): number {
  const c = Math.floor(x / UNITS_PER_COLUMN) + 1;
  return Math.min(COLUMNS, Math.max(1, c));
}

/** Snap a value to the grid (whole units). */
export function snap(v: number): number {
  return Math.round(v);
}

export function snapVec([x, y]: Vec): Vec {
  return [snap(x), snap(y)];
}

/** Keep a point inside the drawing area. */
export function clampToArea([x, y]: Vec): Vec {
  return [
    Math.min(AREA_UNITS.w, Math.max(0, x)),
    Math.min(AREA_UNITS.h, Math.max(0, y)),
  ];
}

export type Rotation = 0 | 90 | 180 | 270;

/** Rotate a point about the origin, clockwise on screen (y points down). */
export function rotate([x, y]: Vec, rot: Rotation): Vec {
  switch (rot) {
    case 0:
      return [x, y];
    case 90:
      return [-y, x];
    case 180:
      return [-x, -y];
    case 270:
      return [y, -x];
  }
}

export type Dir = "up" | "down" | "left" | "right" | "any";

const DIR_ORDER: Dir[] = ["up", "right", "down", "left"];

export function rotateDir(dir: Dir, rot: Rotation): Dir {
  if (dir === "any") return dir;
  const i = DIR_ORDER.indexOf(dir);
  return DIR_ORDER[(i + rot / 90) % 4]!;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function rotateRect(r: Rect, rot: Rotation): Rect {
  const a = rotate([r.x, r.y], rot);
  const b = rotate([r.x + r.w, r.y + r.h], rot);
  return {
    x: Math.min(a[0], b[0]),
    y: Math.min(a[1], b[1]),
    w: Math.abs(a[0] - b[0]),
    h: Math.abs(a[1] - b[1]),
  };
}

export function offsetRect(r: Rect, [dx, dy]: Vec): Rect {
  return { x: r.x + dx, y: r.y + dy, w: r.w, h: r.h };
}

export function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

export function pointInRect([x, y]: Vec, r: Rect, pad = 0): boolean {
  return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
}
