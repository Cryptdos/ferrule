import { describe, expect, test } from "bun:test";
import { assignAddresses, collisionSuffix } from "./numbering";

describe("collisionSuffix", () => {
  test("first item has no suffix, then A, B, C", () => {
    expect([0, 1, 2, 3].map(collisionSuffix)).toEqual(["", "A", "B", "C"]);
  });

  test("runs past Z", () => {
    expect(collisionSuffix(26)).toBe("Z");
    expect(collisionSuffix(27)).toBe("AA");
  });
});

describe("assignAddresses", () => {
  test("a lone item gets the plain page-column address", () => {
    const a = assignAddresses([{ id: "c1", page: 11, column: 22, y: 40 }]);
    expect(a.get("c1")).toBe("11-22");
  });

  test("topmost keeps the plain address, then A, B down the column", () => {
    const a = assignAddresses([
      { id: "low", page: 11, column: 22, y: 90 },
      { id: "top", page: 11, column: 22, y: 10 },
      { id: "mid", page: 11, column: 22, y: 50 },
    ]);
    expect(a.get("top")).toBe("11-22");
    expect(a.get("mid")).toBe("11-22A");
    expect(a.get("low")).toBe("11-22B");
  });

  test("same column on different pages does not collide", () => {
    const a = assignAddresses([
      { id: "x", page: 10, column: 16, y: 10 },
      { id: "y", page: 11, column: 16, y: 10 },
    ]);
    expect(a.get("x")).toBe("10-16");
    expect(a.get("y")).toBe("11-16");
  });
});
