import { describe, expect, test } from "bun:test";
import type { Element } from "./model";
import { defaultParams, listSymbols, localGeometry, terminalPoint } from "./symbols";

function el(symbol: string, rot: Element["rot"] = 0, params = {}): Element {
  return { id: "x", symbol, tag: "", label: "", pos: [10, 20], rot, zone: "internal", params: { ...defaultParams(symbol), ...params }, links: [] };
}

describe("symbol library", () => {
  test("has the v1 set (about 20 symbols)", () => {
    expect(listSymbols().filter((s) => s.palette).length).toBeGreaterThanOrEqual(19);
  });

  test("every terminal sits on a whole grid unit, in every rotation", () => {
    for (const s of listSymbols()) {
      for (const rot of [0, 90, 180, 270] as const) {
        for (const t of localGeometry(el(s.id, rot), "").terminals) {
          expect(Number.isInteger(t.at[0] + 0) && Number.isInteger(t.at[1] + 0)).toBe(true);
        }
      }
    }
  });

  test("terminal names are unique per symbol", () => {
    for (const s of listSymbols()) {
      const names = localGeometry(el(s.id), "").terminals.map((t) => t.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  test("standard terminal markings", () => {
    const names = (id: string, p = {}) => localGeometry(el(id, 0, p), "").terminals.map((t) => t.name);
    expect(names("coil")).toEqual(["A1", "A2"]);
    expect(names("contact-no")).toEqual(["13", "14"]);
    expect(names("contact-nc")).toEqual(["21", "22"]);
    expect(names("lamp")).toEqual(["+V", "-V"]);
    expect(names("isolator", { poles: 3, aux: 1 })).toEqual(["1", "2", "3", "4", "5", "6", "13", "14"]);
  });

  test("rotation turns terminals clockwise about the origin", () => {
    expect(terminalPoint(el("coil"), "A1")).toEqual([10, 17]);
    expect(terminalPoint(el("coil", 90), "A1")).toEqual([13, 20]);
    expect(terminalPoint(el("coil", 180), "A1")).toEqual([10, 23]);
    expect(terminalPoint(el("coil", 270), "A1")).toEqual([7, 20]);
  });

  test("rails can be tapped at every unit along their length", () => {
    const g = localGeometry(el("busbar", 0, { length: 10 }), "");
    expect(g.terminals.length).toBe(11);
  });

  test("the tag placeholder is filled in", () => {
    const texts = localGeometry(el("coil"), "K10-16").prims.filter((p) => p.t === "text");
    expect(texts.some((p) => p.t === "text" && p.text === "K10-16")).toBe(true);
  });
});
