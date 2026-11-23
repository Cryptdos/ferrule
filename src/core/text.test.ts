import { describe, expect, test } from "bun:test";
import { MIN_TEXT_MM, TEXT_MM, UNIT_MM, textUnits, type Rotation } from "./geometry";
import { type Element } from "./model";
import { defaultParams, listSymbols, localGeometry, type Prim } from "./symbols";
import { contactTablePrims } from "./xref";

/** Every select option of every parameter, one at a time, so each drawing variant is checked. */
function variants(symbol: string): Record<string, string | number | boolean>[] {
  const def = listSymbols().find((s) => s.id === symbol)!;
  const base = defaultParams(symbol);
  const out = [base];
  for (const p of def.params) {
    if (p.type === "select") for (const o of p.options ?? []) out.push({ ...base, [p.key]: o.value });
    if (p.type === "bool") out.push({ ...base, [p.key]: !base[p.key] });
    if (p.type === "number" && typeof p.max === "number") out.push({ ...base, [p.key]: p.max });
  }
  return out;
}

const smallest = (prims: Prim[]) => Math.min(Infinity, ...prims.filter((p) => p.t === "text").map((p) => (p.t === "text" ? p.size : Infinity)));

describe("text styles", () => {
  test("sizes are set in millimetres and the grid unit is 1.847 mm", () => {
    expect(UNIT_MM).toBeCloseTo(277 / 150, 6);
    expect(textUnits("tag") * UNIT_MM).toBeCloseTo(2.5, 6);
    expect(TEXT_MM.detail).toBe(1.8);
  });

  test("no symbol draws text smaller than 1.8 mm, in any variant or rotation", () => {
    const floor = MIN_TEXT_MM / UNIT_MM - 1e-9;
    for (const s of listSymbols()) {
      for (const params of variants(s.id)) {
        for (const rot of [0, 90, 180, 270] as Rotation[]) {
          const el: Element = {
            id: "e",
            symbol: s.id,
            tag: "K10-10",
            label: "LABEL\nSECOND LINE",
            pos: [20, 20],
            rot,
            zone: "internal",
            params: { ...params, onBlock: s.id === "terminal" ? params.onBlock : undefined } as Element["params"],
            links: [],
          };
          if (s.id === "plant-view") Object.assign(el.params, { terms: "1,2,3", show: "1,2,3", pgroups: "RUN:1,2", pdesc: "FAN", pinfo: "7.5kW" });
          const g = localGeometry(el, { tag: "K10-10", xref: "/3-14", label: el.label, rows: [["A", "B", "C", "D"]], legend: [] });
          const min = smallest(g.prims);
          if (min < floor) throw new Error(`${s.id} ${JSON.stringify(params)} rot ${rot}: text at ${(min * UNIT_MM).toFixed(2)} mm`);
        }
      }
    }
  });

  test("contact tables are no smaller either", () => {
    expect(smallest(contactTablePrims([["NO", "13-14", "3-12"]], [0, 0]))).toBeGreaterThanOrEqual(MIN_TEXT_MM / UNIT_MM - 1e-9);
  });
});
