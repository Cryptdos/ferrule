/** The terminal block along a panel boundary: its size, in grid units. */
import { rotate, textUnits } from "./geometry";
import type { Page } from "./model";
import { textWidth } from "./textwidth";

/**
 * Half a cell's height, at its smallest: cells are 4 units tall, so a
 * five-character number (`20-19`) fits without growing (v0.4.x F8). A
 * terminal number is written up the cell in the `tag` style (2.5 mm, v0.3 §2)
 * and never smaller; a number that won't fit makes every cell in the block
 * taller instead.
 */
export const BLOCK_HALF = 2;
/** White space left clear at each end of the sheet. */
export const BLOCK_INSET = 2;

/** Half the cell height that fits every one of these numbers up a cell (earth cells print none: their sign is centred). */
export function cellHalfFor(numbers: string[], earth: boolean[] = []): number {
  const longest = Math.max(0, ...numbers.map((n, i) => (earth[i] ? 0 : textWidth(n, textUnits("tag")))));
  // 0.2 clear at each end, in half-unit steps.
  return Math.max(BLOCK_HALF, Math.ceil(longest + 0.4) / 2);
}

/** Terminals in the block are at least this far apart: a cell is a column wide, so each has its own (v0.3 §2). */
export const CELL_PITCH = 2;

/**
 * Terminals in the block at least a column apart (v0.3 §2): one closer than
 * that to the one before it moves along, keeping their order. Their wires
 * follow (they're rerouted). Returns whether anything moved.
 */
export function spreadBlock(page: Page): boolean {
  const cs = cells(page).sort((a, b) => a.pos[0] - b.pos[0]);
  let prev = -Infinity;
  let moved = false;
  for (const e of cs) {
    const x = Math.max(e.pos[0], prev + CELL_PITCH);
    if (x !== e.pos[0]) {
      e.pos = [x, e.pos[1]];
      moved = true;
    }
    prev = x;
  }
  return moved;
}

/** The nearest x to this one with no other terminal in the block closer than a column. */
export function freeCellX(page: Page, x: number, skip: Set<string>): number {
  const others = cells(page)
    .filter((e) => !skip.has(e.id))
    .map((e) => e.pos[0]);
  const free = (v: number) => others.every((o) => Math.abs(o - v) >= CELL_PITCH);
  for (let d = 0; d <= 150; d++) {
    if (free(x + d)) return x + d;
    if (free(x - d)) return x - d;
  }
  return x;
}

/** The terminals in a page's terminal block. */
function cells(page: Page) {
  return page.elements.filter((e) => e.symbol === "terminal" && e.params.onBlock === true);
}

/** Half the height of a page's terminal block, as drawn. */
export function blockHalf(page: Page): number {
  return Math.max(BLOCK_HALF, ...cells(page).map((e) => (typeof e.params.cellHalf === "number" ? e.params.cellHalf : BLOCK_HALF)));
}

/** Size every cell in the block to its longest number. */
export function fitBlock(page: Page): void {
  const cs = cells(page);
  const half = cellHalfFor(
    cs.map((e) => e.tag),
    cs.map((e) => e.params.function === "earth"),
  );
  for (const e of cs) {
    if (half === BLOCK_HALF) delete e.params.cellHalf;
    else e.params.cellHalf = half;
  }
  for (const e of page.elements) if (e.symbol === "terminal" && e.params.onBlock !== true) delete e.params.cellHalf;
}

/**
 * Terminal strip lines (55): every terminal a strip line crosses joins its
 * strip. Run with the other tidy-ups after each change, so moving or
 * renaming a line regroups its terminals.
 */
export function applyStripLines(page: Page): void {
  const lines = page.elements.filter((e) => e.symbol === "strip-line");
  if (!lines.length) return;
  for (const ln of lines) {
    const name = String(ln.params.strip ?? "").trim();
    if (!name) continue;
    const len = typeof ln.params.length === "number" ? ln.params.length : 20;
    const [dx, dy] = rotate([len, 0], ln.rot);
    const a = ln.pos;
    const x0 = Math.min(a[0], a[0] + dx);
    const x1 = Math.max(a[0], a[0] + dx);
    const y0 = Math.min(a[1], a[1] + dy);
    const y1 = Math.max(a[1], a[1] + dy);
    for (const t of page.elements) {
      if (t.symbol !== "terminal") continue;
      // The line crosses the terminal's circle (or its cell in the block).
      const reach = t.params.onBlock === true ? 1 : 0.45;
      const [x, y] = t.pos;
      const crosses = dy === 0 ? Math.abs(y - a[1]) <= reach && x >= x0 - reach && x <= x1 + reach : Math.abs(x - a[0]) <= reach && y >= y0 - reach && y <= y1 + reach;
      if (crosses) t.params.strip = name;
    }
  }
}
