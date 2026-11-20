import { describe, expect, test } from "bun:test";
import {
  FORBIDDEN_LETTERS,
  RESERVED_LETTERS,
  STANDARDS,
  validateOverride,
} from "./designations";

describe("standards", () => {
  test("no standard uses forbidden or reserved letters", () => {
    for (const std of STANDARDS) {
      for (const prefix of Object.values(std.prefixes)) {
        expect(FORBIDDEN_LETTERS).not.toContain(prefix[0]);
        expect(RESERVED_LETTERS).not.toContain(prefix[0]);
      }
    }
  });
});

describe("validateOverride", () => {
  test("accepts a local habit like R for relays", () => {
    expect(validateOverride("R")).toBeNull();
  });

  test("rejects A, I and O", () => {
    expect(validateOverride("A")).not.toBeNull();
    expect(validateOverride("IK")).not.toBeNull();
    expect(validateOverride("O")).not.toBeNull();
  });

  test("rejects lowercase and non-letters", () => {
    expect(validateOverride("k")).not.toBeNull();
    expect(validateOverride("K1")).not.toBeNull();
  });
});
