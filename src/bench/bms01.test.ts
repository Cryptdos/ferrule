/**
 * The BMS-01 fixture (design-v0.4.x step 0): it builds, sits inside the
 * drawing area, and has the structures the sprint's findings came from.
 */
import { describe, expect, test } from "bun:test";
import { AvoidLib } from "libavoid-js";
import { AREA_UNITS } from "../core/geometry";
import { proveInterlocks } from "../core/interlocks";
import { compile, initialState } from "../core/sim";
import { localGeometry } from "../core/symbols";
import { elementTexts } from "../core/tags";
import { parseProject } from "../core/validate";
import { buildBms01 } from "./bms01";

await AvoidLib.load();
const { project: p, plant, modules } = buildBms01(AvoidLib.getInstance());

describe("BMS-01 fixture", () => {
  test("every part and wire on a schematic sits inside the drawing area", () => {
    const out: string[] = [];
    for (const pg of p.pages) {
      if (pg.ga) continue;
      for (const e of pg.elements) {
        const b = localGeometry(e, elementTexts(e, p)).bbox;
        const [x0, y0, x1, y1] = [e.pos[0] + b.x, e.pos[1] + b.y, e.pos[0] + b.x + b.w, e.pos[1] + b.y + b.h];
        if (x0 < -0.01 || y0 < -0.01 || x1 > AREA_UNITS.w + 0.01 || y1 > AREA_UNITS.h + 0.01) out.push(`sheet ${pg.number} ${e.symbol} ${e.tag}`);
      }
      for (const s of pg.segments) for (const [x, y] of s.points) if (x < 0 || y < 0 || x > AREA_UNITS.w || y > AREA_UNITS.h) out.push(`sheet ${pg.number} wire`);
    }
    expect(out).toEqual([]);
  });

  test("it round-trips through a file", () => {
    const back = parseProject(JSON.parse(JSON.stringify(p)));
    expect(back.pages.length).toBe(p.pages.length);
    expect(back.plant.length).toBe(p.plant.length);
  });

  test("the structures it stands in for", () => {
    // A power supply and battery as plant, a controller with six modules, two buses, long tags.
    expect(plant.PSU!.points!.some((q) => q.form === "supply-out")).toBe(true);
    expect(Object.values(modules).map((m) => m.module!.type)).toEqual(["host", "psu", "di", "uio", "ao", "do"]);
    expect((p.networks ?? []).map((n) => n.name)).toEqual(["Drives bus", "Meters bus"]);
    expect(plant.DPS1!.tag).toBe("AHU-01-DPS-25-44");
    expect(plant.M1!.connects).toBe("comms");
    expect(p.pages.some((pg) => pg.ga?.view === "door-front")).toBe(true);
    expect(p.pages.some((pg) => pg.ga?.view === "backplate")).toBe(true);
  });

  test("the power supply feeds 24 V: the healthy lamp is lit at rest", () => {
    const c = compile(p);
    const s = initialState(c);
    const lamp = p.pages[0]!.elements.find((e) => e.symbol === "lamp")!;
    expect(s.lamps[lamp.id]).toBe(true);
  });

  test("two interlocks, one with an exception (all of two conditions): both proved", () => {
    const r = proveInterlocks(p);
    const sf = plant.SFD!.interlocks![0]!;
    const ef = plant.EFD!.interlocks![0]!.id;
    expect(sf.join).toBe("and");
    expect(r.results[ef]).toBe("proved");
    expect(r.results[sf.id]).toBe("proved");
  });
});
