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
import { addElement, addGaDim, addGaItem, addGaPage, addPlatesForDoors, joinDoorBelow, setPlateBehind, setBoundary, setGaSettings, splitDoor, updateElement } from "./ops";
import { ENCL, PLATE_MARGIN, dimLayout, doorPanes, plateDoor, platesOf, drawnGaItems, gaFrame, paneOf, paneRef, sheetPanes } from "./ga";
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

describe("step 1b: modular doors (M13)", () => {
  const twoByThree = () => {
    const p = newProject("d");
    const front = addGaPage(p, "Door", {
      scale: 10,
      enclosure: { w: 1000, h: 1800 },
      view: "door-front",
      columns: [
        { w: 400, doors: [{ h: 300, hinge: "left", name: "Incomer" }, { h: 900, hinge: "left" }, { h: 1, hinge: "left" }] },
        { w: 1, doors: [{ h: 600, hinge: "right" }, { h: 600, hinge: "right" }, { h: 1, hinge: "right", name: "Controls" }] },
      ],
    });
    return { p, front };
  };

  test("two columns of three doors: each door's outline, sized to fit", () => {
    const { front } = twoByThree();
    expect(doorPanes(front).map((d) => [d.col, d.row, d.x, d.y, d.w, d.h, d.hinge])).toEqual([
      [0, 0, 0, 0, 400, 300, "left"],
      [0, 1, 0, 300, 400, 900, "left"],
      [0, 2, 0, 1200, 400, 600, "left"],
      [1, 0, 400, 0, 600, 600, "right"],
      [1, 1, 400, 600, 600, 600, "right"],
      [1, 2, 400, 1200, 600, 600, "right"],
    ]);
  });

  test("an item belongs to the door its centre is on; Check warns when it lies across two", () => {
    const { p, front } = twoByThree();
    const it = addGaItem(p, front.id, { kind: "device", x: 600, y: 700, w: 30, h: 30 });
    expect(paneOf(front, it)).toMatchObject({ col: 1, row: 1 });
    const across = addGaItem(p, front.id, { kind: "device", x: 380, y: 100, w: 40, h: 40 });
    expect(checkProject(p).filter((f) => /lies across two doors/.test(f.message)).map((f) => f.ids)).toEqual([[across.id]]);
  });

  test("a dimension from its own door's edge, and a sheet of one door measures from its edges", () => {
    const { p, front } = twoByThree();
    const it = addGaItem(p, front.id, { kind: "device", x: 600, y: 700, w: 30, h: 30 });
    const d = addGaDim(p, front.id, { axis: "h", style: "chain", points: [{ v: 400, item: paneRef({ col: 1, row: 1 }), edge: "start" }, { v: 615, item: it.id, edge: "mid" }], at: 650 });
    expect(dimLayout(p, front, d).texts.map((t) => t.text)).toEqual(["215"]);
    // A door view of that one door: framed on it, the item drawn, ENCL its own edges.
    const one = addGaPage(p, "One door", { scale: 5, enclosure: { w: 1, h: 1 }, view: "door-front", of: front.id, pane: [1, 1] });
    expect(gaFrame(p, one)).toEqual({ scale: 5, x0: 400, y0: 600, w: 600, h: 600 });
    expect(drawnGaItems(p, one).map((x) => x.it.id)).toEqual([it.id]);
    const e = addGaDim(p, one.id, { axis: "v", style: "chain", points: [{ v: 600, item: ENCL, edge: "start" }, { v: 715, item: it.id, edge: "mid" }], at: 500 });
    expect(dimLayout(p, one, e).texts.map((t) => t.text)).toEqual(["115"]);
  });

  test("the door back mirrors the columns, hinges with them", () => {
    const { p, front } = twoByThree();
    const back = addGaPage(p, "Back", { scale: 10, enclosure: { w: 1, h: 1 }, view: "door-back", of: front.id });
    const panes = sheetPanes(p, back);
    expect(panes.filter((x) => x.row === 0).map((x) => [x.col, x.x, x.w, x.hinge])).toEqual([
      [0, 600, 400, "right"],
      [1, 0, 600, "left"],
    ]);
  });

  test("an old two-leaf door is two columns of one door, framed as before", () => {
    const p = newProject("o");
    const front = addGaPage(p, "Door", { scale: 10, enclosure: { w: 1000, h: 1600 }, view: "door-front", leaves: [{ w: 600, hinge: "left" }, { w: 400, hinge: "right" }] });
    expect(front.ga!.columns).toBeUndefined();
    expect(doorPanes(front).map((d) => [d.x, d.y, d.w, d.h, d.hinge])).toEqual([
      [0, 0, 600, 1600, "left"],
      [600, 0, 400, 1600, "right"],
    ]);
    const leaf = addGaPage(p, "Right leaf", { scale: 10, enclosure: { w: 1, h: 1 }, view: "door-front", of: front.id, leaf: 1 });
    expect(gaFrame(p, leaf)).toEqual({ scale: 10, x0: 600, w: 400, h: 1600 });
    // Saved and read back: unchanged, no columns written.
    const back = parseProject(JSON.parse(JSON.stringify(p)));
    expect(back.pages.find((x) => x.id === front.id)!.ga).toEqual(front.ga!);
  });

  test("split and join: Split this door, then Join with the door below; columns round-trip", () => {
    const p = newProject("s");
    const front = addGaPage(p, "Door", { scale: 10, enclosure: { w: 800, h: 1200 }, view: "door-front" });
    splitDoor(p, front.id, 0, 0, "across", 400);
    splitDoor(p, front.id, 0, 1, "down");
    expect(doorPanes(front).map((d) => [d.col, d.row, d.w, d.h])).toEqual([
      [0, 0, 400, 400],
      [0, 1, 400, 800],
      [1, 0, 400, 400],
      [1, 1, 400, 800],
    ]);
    joinDoorBelow(p, front.id, 1, 0);
    expect(doorPanes(front).filter((d) => d.col === 1).map((d) => d.h)).toEqual([1200]);
    const back = parseProject(JSON.parse(JSON.stringify(p)));
    expect(back.pages.find((x) => x.id === front.id)!.ga!.columns).toEqual(front.ga!.columns!);
    // Back to one plain door: no columns kept.
    setGaSettings(p, front.id, { columns: null });
    expect(doorPanes(front).length).toBe(1);
  });

  test("a backplate for each door: the door's size less the margin, named for it, in column then row order", () => {
    const { p, front } = twoByThree();
    const plates = addPlatesForDoors(p, front.id);
    expect(plates.length).toBe(6);
    expect(plates.map((x) => x.ga!.behind!.pane)).toEqual([[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]]);
    expect(plates[0]!.title).toBe("Backplate: Incomer");
    expect(plates[3]!.ga!.enclosure).toEqual({ w: 600 - 2 * PLATE_MARGIN, h: 600 - 2 * PLATE_MARGIN });
    expect(plateDoor(p, plates[3]!)?.pane).toMatchObject({ col: 1, row: 0 });
    expect(platesOf(p, front).get("1:0")?.id).toBe(plates[3]!.id);
    // Doors that have one are skipped; a plate's size is its own once made.
    expect(() => addPlatesForDoors(p, front.id)).toThrow("Every door already has a backplate");
    // Larger than its door: an info line.
    plates[0]!.ga!.enclosure = { w: 500, h: 250 };
    expect(checkProject(p).some((f) => /larger than its door's opening, Incomer/.test(f.message))).toBe(true);
    // Saved and read back.
    const back = parseProject(JSON.parse(JSON.stringify(p)));
    expect(back.pages.find((x) => x.id === plates[4]!.id)!.ga!.behind).toEqual({ sheet: front.id, pane: [1, 1] });
  });

  test("joining two doors leaves both plates as ordinary backplates, flagged; plates below move up", () => {
    const { p, front } = twoByThree();
    const plates = addPlatesForDoors(p, front.id);
    const item = addGaItem(p, plates[3]!.id, { kind: "rail", x: 10, y: 50, w: 400, h: 35 });
    joinDoorBelow(p, front.id, 1, 0);
    expect(plates[3]!.ga!.behind!.pane).toBeNull();
    expect(plates[4]!.ga!.behind!.pane).toBeNull();
    expect(plates[5]!.ga!.behind!.pane).toEqual([1, 1]);
    expect(plates[3]!.gaItems!.map((x) => x.id)).toEqual([item.id]);
    const flagged = checkProject(p).filter((f) => /backplate's door has been joined to another or removed/.test(f.message));
    expect(flagged.map((f) => f.pageId).sort()).toEqual([plates[3]!.id, plates[4]!.id].sort());
    // Put behind a door again by hand.
    setPlateBehind(p, plates[3]!.id, { sheet: front.id, pane: [1, 0] });
    expect(plateDoor(p, plates[3]!)?.pane.h).toBe(1200);
  });
});
