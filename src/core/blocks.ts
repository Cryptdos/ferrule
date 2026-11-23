/** The terminal block along a panel boundary: its size, in grid units. */
import { rotate, textUnits } from "./geometry";
import type { Page } from "./model";
import { textWidth } from "./textwidth";

/**
 * Half a cell's height, at its smallest: cells are 3 units tall. A terminal
 * number is written up the cell in the `detail` style and never smaller; a
 * number that won't fit makes every cell in the block taller instead.
 */
export const BLOCK_HALF = 1.5;
/** White space left clear at each end of the sheet. */
export const BLOCK_INSET = 2;

/** Room an earth terminal's cell keeps for its earth sign (matches symbols.ts). */
const EARTH_ROOM = 1.3;

/** Half the cell height that fits every one of these numbers up a cell (earth cells also fit their sign). */
export function cellHalfFor(numbers: string[], earth: boolean[] = []): number {
  const longest = Math.max(0, ...numbers.map((n, i) => textWidth(n, textUnits("detail")) + (earth[i] ? EARTH_ROOM : 0)));
  // 0.2 clear at each end, in half-unit steps.
  return Math.max(BLOCK_HALF, Math.ceil(longest + 0.4) / 2);
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
      const reach = t.params.onBlock === true ? 0.5 : 0.45;
      const [x, y] = t.pos;
      const crosses = dy === 0 ? Math.abs(y - a[1]) <= reach && x >= x0 - reach && x <= x1 + reach : Math.abs(x - a[0]) <= reach && y >= y0 - reach && y <= y1 + reach;
      if (crosses) t.params.strip = name;
    }
  }
}
