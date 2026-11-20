/**
 * Position-based numbering (DESIGN.md §8).
 *
 * Every item gets the address `page-column`. When several items share a
 * column on the same page, the one highest on the page keeps the plain
 * address and each further item, working down, gets A, B, C…
 */

export interface Placed {
  id: string;
  page: number;
  /** Column on the 100-column grid, 1–100. */
  column: number;
  /** Vertical position in grid units; smaller is higher on the page. */
  y: number;
}

/** 0 → "", 1 → "A", 26 → "Z", 27 → "AA" … */
export function collisionSuffix(index: number): string {
  let s = "";
  let n = index;
  while (n > 0) {
    n -= 1;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

export function baseAddress(page: number, column: number): string {
  return `${page}-${column}`;
}

/**
 * Assigns addresses to a set of items of one kind (e.g. all conductors).
 * Returns a map of item id → address.
 */
export function assignAddresses(items: Placed[]): Map<string, string> {
  const groups = new Map<string, Placed[]>();
  for (const item of items) {
    const key = baseAddress(item.page, item.column);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }

  const result = new Map<string, string>();
  for (const [key, group] of groups) {
    group.sort((a, b) => a.y - b.y || a.id.localeCompare(b.id));
    group.forEach((item, i) => result.set(item.id, key + collisionSuffix(i)));
  }
  return result;
}
