/** v0.5 step 4c: connector block, motor, legend, colour through a relay output (design-v0.5.md §4). */
import { describe, expect, test } from "bun:test";
import { AvoidLib } from "libavoid-js";
import { buildBms01 } from "../bench/bms01";
import { newProject } from "./model";
import { addElement, connect, placePlantView, setConductorInfo } from "./ops";
import { legendEntries, legendTable } from "./annotations";
import { localGeometry, partName, requireSymbol } from "./symbols";

await AvoidLib.load();

const sheet = () => {
  const p = newProject("t");
  return { p, pg: p.pages[0]!.id };
};

describe("v0.5 step 4c", () => {
  test("A48: a connector block's Columns: Terminals is the total, the rows follow; two columns by default", () => {
    const { p, pg } = sheet();
    const geo = (params: Record<string, number>) => localGeometry(addElement(p, pg, "connector-block", [40, 40], { params }), "X1");
    const two = geo({ terminals: 4 });
    expect(two.body.h).toBe(4);
    expect(two.terminals.filter((t) => /^\d+$/.test(t.name)).map((t) => t.dir)).toEqual(["left", "right", "left", "right"]);
    const one = geo({ terminals: 4, columns: 1 });
    expect([one.body.w, one.body.h]).toEqual([4, 8]);
    expect(new Set(one.terminals.filter((t) => /^\d+$/.test(t.name)).map((t) => t.dir))).toEqual(new Set(["left"]));
    // Wide: 6 in 3 columns is 2 rows, the top up and the bottom down, E1 and E2 at the ends.
    const wide = geo({ terminals: 6, columns: 3 });
    expect([wide.body.w, wide.body.h]).toEqual([6, 4]);
    const dirs = Object.fromEntries(wide.terminals.map((t) => [t.name, t.dir]));
    expect([dirs["1"], dirs["3"], dirs["4"], dirs["6"], dirs.E1, dirs.E2]).toEqual(["up", "up", "down", "down", "left", "right"]);
    // A wide block has two rows: 12 terminals in 4 columns is drawn 6 across.
    expect(geo({ terminals: 12, columns: 4 }).body.w).toBe(12);
    const names = wide.terminals.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test("A56: a motor's Type names it: a pump reads Pump in its properties and in the legend", () => {
    const { p, pg } = sheet();
    expect(requireSymbol("motor").params.find((x) => x.key === "type")?.label).toBe("Type");
    const m = addElement(p, pg, "motor", [20, 40]);
    const pump = addElement(p, pg, "motor", [60, 40], { params: { type: "pump" } });
    expect([partName(m), partName(pump)]).toEqual(["Motor", "Pump"]);
    expect(legendEntries(p).map((e) => e.name)).toEqual(["Motor", "Pump"]);
  });

  test("A55: a strip line is drawn about 10 long in the legend, and a big symbol smaller, its text at full size", () => {
    const { p, pg } = sheet();
    addElement(p, pg, "strip-line", [20, 40], { params: { length: 60 } });
    addElement(p, pg, "transformer", [60, 40]);
    const entries = legendEntries(p);
    const strip = entries.find((e) => e.el.symbol === "strip-line")!;
    expect(strip.el.params.length).toBe(10);
    const t = legendTable(entries, 1, 2.5);
    const full = localGeometry(entries.find((e) => e.el.symbol === "transformer")!.el, { tag: "", xref: "", label: "" }).bbox.h;
    expect(full).toBeGreaterThan(8);
    // The table is shorter than the transformer drawn full size would make it.
    expect(t.h).toBeLessThan(full + 2.5 * 1.6 + 6);
    const sizes = t.prims.filter((x) => x.t === "text").map((x) => (x.t === "text" ? x.size : 0));
    // Sizes are in grid units: 1.8 mm is 0.974.
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(0.97);
  });

  test("A24: a wire from a relay output's NO takes the colour of the wire on its common (confirmed on the BMS fixture)", () => {
    const { project: p, modules } = buildBms01(AvoidLib.getInstance());
    const doMod = modules.do;
    const pt = doMod.points!.find((q) => q.form === "contact")!;
    const [com, no] = pt.pins;
    const pg = p.pages.find((x) => !x.ga && !x.spare)!;
    const view = placePlantView(p, pg.id, doMod.id, [100, 60], [com!, no!]);
    const lamp = addElement(p, pg.id, "lamp", [120, 20]);
    const lamp2 = addElement(p, pg.id, "lamp", [130, 20]);
    const a = connect(p, pg.id, [lamp.id, "+V"], [view.id, com!]);
    setConductorInfo(p, a.conductor, { colour: "Og" });
    const b = connect(p, pg.id, [view.id, no!], [lamp2.id, "+V"]);
    expect(p.conductors.find((c) => c.id === b.conductor)?.colour).toBe("Og");
  });
});

describe("v0.5 step 5: project settings", () => {
  test("A50: no numbering scheme in the project; A1: Client is the third of three equal cells on the title block's top row", async () => {
    const { titleBlock } = await import("./titleblock");
    const p = newProject("t");
    expect("numbering" in p).toBe(false);
    p.project.client = "Example Client";
    const tb = titleBlock(p, p.pages[0]!);
    const cell = (l: string) => tb.cells.find((c) => c.label === l)!;
    expect([cell("Sheet").w, cell("Job no.").w, cell("Client").w]).toEqual([24, 24, 24]);
    expect([cell("Sheet").y, cell("Job no.").y, cell("Client").y]).toEqual([0, 0, 0]);
    expect(cell("Client").x).toBe(cell("Job no.").x + 24);
    expect(cell("Client").value).toBe("Example Client");
  });
});
