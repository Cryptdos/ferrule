/**
 * The v0.4.x revision sprint (docs/design-v0.4.x.md): each step's rules,
 * mostly on the BMS-01 fixture.
 */
import { describe, expect, test } from "bun:test";
import { AvoidLib } from "libavoid-js";
import { buildBms01 } from "../bench/bms01";
import { cellHalfFor } from "./blocks";
import { checkProject } from "./checks";
import { setPlantDesign, toDraw } from "./design";
import { newProject } from "./model";
import { moduleTitle, viewsOf } from "./modules";
import { addElement, setBoundary, updateElement } from "./ops";
import { renumber } from "./renumber";
import { stampSaved } from "../server/storage";
import { parseProject } from "./validate";
import { VERSION } from "./version";

await AvoidLib.load();
const fresh = () => buildBms01(AvoidLib.getInstance());

describe("step 1: small fixes", () => {
  test("F3: comms-only plant is on the network, not 'not drawn'", () => {
    const { project: p, plant } = fresh();
    const td = toDraw(p);
    expect(td.plant.some((x) => x.item.id === plant.M1!.id)).toBe(false);
    expect(td.network.map((x) => [x.item.tag, x.net])).toEqual([
      ["EM-01", "Meters bus"],
      ["EM-02", "Meters bus"],
    ]);
    expect(checkProject(p).some((f) => /EM-0\d.*not drawn yet/.test(f.message))).toBe(false);
    // Off its network: still on the network list, with no network.
    setPlantDesign(p, plant.M2!.id, { network: "" });
    expect(toDraw(p).network.find((x) => x.item.id === plant.M2!.id)?.net).toBeUndefined();
    // Given a point with pins, it's ordinary plant again.
    plant.M1!.terminals = ["A", "B"];
    plant.M1!.points = [{ name: "Pulse", form: "contact", pins: ["A", "B"] }];
    expect(toDraw(p).plant.some((x) => x.item.id === plant.M1!.id)).toBe(true);
  });

  test("F8: the block fits its numbers whenever they change, and five characters fit at the smallest", () => {
    expect(cellHalfFor(["20-19"])).toBe(cellHalfFor(["1"]));
    const { project: p } = fresh();
    // Renumber into sequential numbers, then type a long one: each cell fits at once.
    const pg = p.pages.find((x) => x.boundaryY !== null)!;
    const cells = pg.elements.filter((e) => e.symbol === "terminal" && e.params.onBlock === true);
    updateElement(p, pg.id, cells[0]!.id, { tag: "100-199" });
    const half = (e: (typeof cells)[number]) => (typeof e.params.cellHalf === "number" ? e.params.cellHalf : 2);
    for (const c of cells) expect(half(c)).toBeGreaterThanOrEqual(cellHalfFor(cells.map((x) => x.tag)));
    renumber(p);
    for (const page of p.pages) {
      const cs = page.elements.filter((e) => e.symbol === "terminal" && e.params.onBlock === true);
      for (const c of cs) expect(half(c)).toBeGreaterThanOrEqual(cellHalfFor(cs.map((x) => x.tag)));
    }
  });

  test("F8: a typed terminal number on a fresh sheet grows its block straight away", () => {
    const p = newProject("t");
    const pg = p.pages[0]!.id;
    setBoundary(p, pg, 80);
    const t = addElement(p, pg, "terminal", [20, 80]);
    updateElement(p, pg, t.id, { tag: "12-3456" });
    expect(t.params.cellHalf).toBe(cellHalfFor(["12-3456"]));
  });

  test("T16: a module view's title gives its number on the rail", () => {
    const { project: p, modules } = fresh();
    const v = viewsOf(p, modules.do.id)[0]!;
    expect(moduleTitle(p, v.el)).toMatch(/^A\S+ · Module 6 · DO-8 · Generic DO-8X/);
  });

  test("T19: a file says which Ferrule saved it; a newer one names that version", () => {
    const { project: p } = fresh();
    const file = stampSaved(p);
    expect(Object.keys(file).slice(0, 3)).toEqual(["format", "version", "savedBy"]);
    expect(file.savedBy).toBe(VERSION);
    // Read back, it's ignored.
    expect(() => parseProject(JSON.parse(JSON.stringify(file)))).not.toThrow();
    const newer = { ...file, version: 99, savedBy: "0.9.1" };
    expect(() => parseProject(newer)).toThrow(`Saved by Ferrule 0.9.1 (format 99). This is ${VERSION} (format 3). Open it in 0.9.1 or later: https://github.com/Cryptdos/ferrule/releases`);
    const { savedBy: _, ...old } = newer;
    expect(() => parseProject(old)).toThrow("saved by a newer Ferrule (format 99)");
  });
});
