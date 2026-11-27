import { describe, expect, test } from "bun:test";
import { dropOn, findLeaf, leaves, removeLeaf, setRatio, sheetLeaf, splitLeaf, zoneAt, type TileNode } from "./tiles";

describe("tiles (design-v0.3 §7)", () => {
  test("split a tile right, then the new one down; close one and its sibling takes its place", () => {
    const a = sheetLeaf("p1");
    let t: TileNode = a;
    const b = sheetLeaf("p1");
    t = splitLeaf(t, a.id, "row", b);
    expect(t.kind === "split" && t.dir === "row" && t.a.id === a.id && t.b.id === b.id).toBe(true);
    const c = sheetLeaf("p2");
    t = splitLeaf(t, b.id, "col", c);
    expect(leaves(t).map((l) => l.id)).toEqual([a.id, b.id, c.id]);
    t = removeLeaf(t, b.id);
    expect(leaves(t).map((l) => l.id)).toEqual([a.id, c.id]);
    t = removeLeaf(t, a.id);
    expect(t.kind).toBe("leaf");
    // The last one stays.
    expect(removeLeaf(t, c.id)).toBe(t);
  });

  test("dividers keep within 10–90 %", () => {
    const a = sheetLeaf("p1");
    const t = splitLeaf(a, a.id, "row", sheetLeaf("p2"));
    const r = setRatio(t, t.id, 0.99);
    expect(r.kind === "split" && r.ratio).toBe(0.9);
  });

  test("dropping on an edge splits the tile that way; in the middle replaces it", () => {
    const a = sheetLeaf("p1");
    const w = { kind: "leaf" as const, id: "w", content: { type: "window" as const, name: "plant" } };
    const left = dropOn(a, a.id, "left", w);
    expect(left.kind === "split" && left.dir === "row" && left.a.id === "w").toBe(true);
    // Docking is splitting only (v0.5 A64): close to an edge, or nothing.
    const rect = { left: 0, top: 0, width: 100, height: 100 };
    expect(zoneAt(rect, 5, 50)).toBe("left");
    expect(zoneAt(rect, 50, 95)).toBe("bottom");
    expect(zoneAt(rect, 50, 50)).toBeNull();
    const big = { left: 0, top: 0, width: 1600, height: 900 };
    expect(zoneAt(big, 1560, 450)).toBe("right");
    expect(zoneAt(big, 300, 450)).toBeNull();
    expect(zoneAt(big, 800, 860)).toBe("bottom");
  });
});
