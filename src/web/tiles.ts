/**
 * Tiles (design-v0.3 §7): the main area is a tree of splits, each dividing
 * its space between two tiles side by side ("row") or one above the other
 * ("col"), with a draggable divider. A leaf holds one thing: a sheet view
 * or a window. Pure functions on plain data; the editor keeps the tree as
 * state. Layouts aren't saved: a project opens with one sheet tile.
 */

export type TileContent = { type: "sheet"; pageId: string } | { type: "window"; name: string };
export interface TileLeaf {
  kind: "leaf";
  id: string;
  content: TileContent;
}
export interface TileSplit {
  kind: "split";
  id: string;
  /** "row": a | b side by side; "col": a over b. */
  dir: "row" | "col";
  /** The share of the space `a` takes, 0.1–0.9. */
  ratio: number;
  a: TileNode;
  b: TileNode;
}
export type TileNode = TileLeaf | TileSplit;
/** Where something dropped on a tile goes: one of its edges (splitting it) or its middle (replacing it). */
export type DropZone = "left" | "right" | "top" | "bottom" | "middle";

let counter = 0;
export const tileId = (): string => `t${Date.now().toString(36)}${(counter++).toString(36)}`;

export function sheetLeaf(pageId: string): TileLeaf {
  return { kind: "leaf", id: tileId(), content: { type: "sheet", pageId } };
}

export function leaves(node: TileNode): TileLeaf[] {
  return node.kind === "leaf" ? [node] : [...leaves(node.a), ...leaves(node.b)];
}

export function findLeaf(node: TileNode, id: string): TileLeaf | null {
  return leaves(node).find((l) => l.id === id) ?? null;
}

/** Replace the node with this id (leaf or split) by another, returning the new tree. */
function replace(node: TileNode, id: string, by: TileNode): TileNode {
  if (node.id === id) return by;
  if (node.kind === "leaf") return node;
  return { ...node, a: replace(node.a, id, by), b: replace(node.b, id, by) };
}

/**
 * Put a new leaf beside the one with this id: to its right or below it
 * (or left/above with `before`). Returns the new tree.
 */
export function splitLeaf(root: TileNode, id: string, dir: "row" | "col", leaf: TileLeaf, before = false): TileNode {
  const at = findLeaf(root, id);
  if (!at) return root;
  const split: TileSplit = { kind: "split", id: tileId(), dir, ratio: 0.5, a: before ? leaf : at, b: before ? at : leaf };
  return replace(root, id, split);
}

/** Drop a leaf onto a tile: an edge splits it, the middle replaces what's there. */
export function dropOn(root: TileNode, targetId: string, zone: DropZone, leaf: TileLeaf): TileNode {
  if (zone === "middle") {
    return findLeaf(root, targetId) ? replace(root, targetId, leaf) : root;
  }
  const dir = zone === "left" || zone === "right" ? "row" : "col";
  return splitLeaf(root, targetId, dir, leaf, zone === "left" || zone === "top");
}

/** Take a leaf out: its sibling takes the split's place. The last leaf can't go. */
export function removeLeaf(root: TileNode, id: string): TileNode {
  if (root.kind === "leaf") return root;
  const walk = (node: TileNode): TileNode => {
    if (node.kind === "leaf") return node;
    if (node.a.id === id) return node.b;
    if (node.b.id === id) return node.a;
    return { ...node, a: walk(node.a), b: walk(node.b) };
  };
  return walk(root);
}

export function setRatio(root: TileNode, splitId: string, ratio: number): TileNode {
  const r = Math.min(0.9, Math.max(0.1, ratio));
  const walk = (node: TileNode): TileNode => {
    if (node.kind === "leaf") return node;
    if (node.id === splitId) return { ...node, ratio: r };
    return { ...node, a: walk(node.a), b: walk(node.b) };
  };
  return walk(root);
}

/** Change what a leaf shows. */
export function setContent(root: TileNode, id: string, content: TileContent): TileNode {
  const at = findLeaf(root, id);
  return at ? replace(root, id, { ...at, content }) : root;
}

/** The zone of a tile a point falls in: the outer quarter of each side is an edge, the rest the middle. */
export function zoneAt(rect: { left: number; top: number; width: number; height: number }, x: number, y: number): DropZone {
  const fx = (x - rect.left) / Math.max(1, rect.width);
  const fy = (y - rect.top) / Math.max(1, rect.height);
  const edges: [DropZone, number][] = [
    ["left", fx],
    ["right", 1 - fx],
    ["top", fy],
    ["bottom", 1 - fy],
  ];
  const [zone, d] = edges.reduce((m, e) => (e[1] < m[1] ? e : m));
  return d < 0.25 ? zone : "middle";
}
