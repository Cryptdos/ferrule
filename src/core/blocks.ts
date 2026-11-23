/** The terminal block along a panel boundary: its size, in grid units. */
import { textUnits } from "./geometry";
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

/** Half the cell height that fits every one of these numbers up a cell. */
export function cellHalfFor(numbers: string[]): number {
  const longest = Math.max(0, ...numbers.map((n) => textWidth(n, textUnits("detail"))));
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
  const half = cellHalfFor(cs.map((e) => e.tag));
  for (const e of cs) {
    if (half === BLOCK_HALF) delete e.params.cellHalf;
    else e.params.cellHalf = half;
  }
  for (const e of page.elements) if (e.symbol === "terminal" && e.params.onBlock !== true) delete e.params.cellHalf;
}
