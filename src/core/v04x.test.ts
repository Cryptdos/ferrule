/**
 * The v0.4.x revision sprint (docs/design-v0.4.x.md): each step's rules,
 * mostly on the BMS-01 fixture.
 */
import { describe, expect, test } from "bun:test";
import { AvoidLib } from "libavoid-js";
import { buildBms01 } from "../bench/bms01";
import { cellHalfFor } from "./blocks";
import { checkProject } from "./checks";
import { addInterlockCondition, removeInterlockCondition, setPlantDesign, systemGroups, toDraw, updateDesignPoint, updateInterlock } from "./design";
import { describeInterlock, interlockExpectations, interlockStatus, proveInterlocks, provingJob } from "./interlocks";
import { parseSupplies, parseSupply } from "./supplies";
import { refreshConductors } from "./conductors";
import { newProject } from "./model";
import { moduleTitle, viewsOf } from "./modules";
import { addElement, deletePlant, moveElements, placePlantView, addGaDim, addGaItem, addGaPage, addPlatesForDoors, joinDoorBelow, setPlateBehind, setBoundary, setGaSettings, splitDoor, updateElement } from "./ops";
import { earthConductors, isFieldWire, numberByDefault } from "./wires";
import { pointsSchedule } from "./schedules";
import { ENCL, PLATE_MARGIN, gaCandidates, dimLayout, doorPanes, plateDoor, platesOf, drawnGaItems, gaFrame, paneOf, paneRef, sheetPanes } from "./ga";
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

describe("step 2: supplies (M11, F2, F1)", () => {
  test("M11: supply types parse and print; a load fed from a supply it can't take is a warning", () => {
    expect(parseSupply("24VDC")).toEqual({ v: 24, ac: false });
    expect(parseSupplies("24 V AC/DC")).toEqual([{ v: 24, ac: true }, { v: 24, ac: false }]);
    expect(parseSupply("about 24")).toBeUndefined();
    const { project: p } = fresh();
    // Clean as built: the dampers take either, the controller's PSU 24 V DC.
    const before = checkProject(p);
    expect(before.filter((f) => /takes .*; it's fed from/.test(f.message))).toEqual([]);
    expect(before.some((f) => /\d+ loads don't say what supply they take/.test(f.message))).toBe(true);
    // A coil that takes 24 V AC, on the 24 V DC rails: the warning names both.
    const k = p.pages[1]!.elements.find((e) => e.symbol === "coil")!;
    updateElement(p, p.pages[1]!.id, k.id, { params: { accepts: "24 V AC" } });
    const w = checkProject(p).filter((f) => /takes 24 V AC; it's fed from PSU-01 24V out, 24 V DC/.test(f.message));
    expect(w.map((f) => f.ids)).toEqual([[k.id]]);
  });

  test("M11: a point's gives and accepts are set in Design and round-trip", () => {
    const { project: p, plant } = fresh();
    updateDesignPoint(p, plant.BAT!.id, "Charge", { accepts: "24 V DC" });
    expect(plant.BAT!.points![0]!.accepts).toEqual([{ v: 24, ac: false }]);
    expect(() => updateDesignPoint(p, plant.BAT!.id, "Charge", { accepts: "lots" })).toThrow();
    const back = parseProject(JSON.parse(JSON.stringify(p)));
    expect(back.plant.find((x) => x.id === plant.PSU!.id)!.points![1]!.gives).toEqual({ v: 24, ac: false });
  });

  test("F2 and F1: with its power supply deleted, 24DC feeds parts and nothing supplies it; every interlock is never on", () => {
    const { project: p, plant } = fresh();
    expect(checkProject(p).some((f) => /nothing supplies it/.test(f.message))).toBe(false);
    deletePlant(p, plant.PSU!.id);
    refreshConductors(p);
    const f2 = checkProject(p).filter((f) => /nothing supplies it/.test(f.message)).map((f) => f.message);
    expect(f2.some((m) => /^24DC feeds \d+ parts and nothing supplies it$/.test(m))).toBe(true);
    const proofs = proveInterlocks(p);
    expect(Object.values(proofs.results)).toEqual(["never-on", "never-on"]);
    const st = interlockStatus(p, proofs);
    expect([...st.values()].map((x) => x.kind)).toEqual(["never-on", "never-on"]);
    expect(checkProject(p, { proofs }).filter((f) => /never on: is it powered\?/.test(f.message)).length).toBe(2);
  });

  test("F2: the legacy rule stays quiet: no Incoming supply part, rails named for a supply feed it", () => {
    const { project: p } = fresh();
    for (const pg of p.pages) pg.elements = pg.elements.filter((e) => e.symbol !== "supply");
    refreshConductors(p);
    expect(checkProject(p).some((f) => /nothing supplies it/.test(f.message))).toBe(false);
  });
});

describe("step 3: interlocks (T1, T11)", () => {
  test("T1: all of: one expectation, point on and every condition; any of: one per condition", () => {
    const { project: p, plant } = fresh();
    const il = plant.SFD!.interlocks![0]!;
    expect(describeInterlock(p, plant.SFD!, il)).toBe("AHU-01-SF-01-VSD Enable never on while FA-IF-01 Healthy off and FOS-01 Override off");
    const ex = interlockExpectations(plant.SFD!, il);
    expect(ex.map((e) => e.id)).toEqual([`x_${il.id}_0`]);
    expect(ex[0]!.when.length).toBe(3);
    expect(proveInterlocks(p, [il.id]).results[il.id]).toBe("proved");
    // Any of: the override no longer excuses it, so it fails.
    updateInterlock(p, plant.SFD!.id, il.id, { join: "or" });
    expect(interlockExpectations(plant.SFD!, il).map((e) => e.id)).toEqual([`x_${il.id}_0`, `x_${il.id}_1`]);
    expect(describeInterlock(p, plant.SFD!, il)).toMatch(/Healthy off or FOS-01 Override off$/);
    expect(proveInterlocks(p, [il.id]).results[il.id]).toBe("fails");
    expect(p.expectations.filter((e) => e.interlock === il.id).length).toBe(2);
    // Back to one condition: join goes.
    removeInterlockCondition(p, plant.SFD!.id, il.id, 1);
    expect(il.join).toBeUndefined();
    const back = parseProject(JSON.parse(JSON.stringify(p)));
    expect(back.plant.find((x) => x.id === plant.SFD!.id)!.interlocks![0]!.when.length).toBe(1);
  });

  test("T1: an interlock of three conditions survives a save", () => {
    const { project: p, plant } = fresh();
    const il = plant.SFD!.interlocks![0]!;
    addInterlockCondition(p, plant.SFD!.id, il.id, { ref: `plant:${plant.DMP1!.id}:Open`, on: false });
    const back = parseProject(JSON.parse(JSON.stringify(p)));
    const b = back.plant.find((x) => x.id === plant.SFD!.id)!.interlocks![0]!;
    expect([b.when.length, b.join]).toEqual([3, "and"]);
  });

  test("T11: proving runs one interlock at a time, each a step of its own", () => {
    const { project: p } = fresh();
    const job = provingJob(p);
    expect(job.steps.length).toBe(2);
    expect(job.steps.map((s) => s.run())).toEqual(["proved", "proved"]);
    expect(job.key).toBe(proveInterlocks(p).key);
  });
});

describe("step 4: panel wiring and panel devices (F7, T3)", () => {
  test("F7: plant on a sheet with no boundary is panel wiring: solid and numbered; below a boundary, field", () => {
    const { project: p, plant } = fresh();
    const sheet1 = p.pages[0]!;
    const psu = sheet1.elements.find((e) => e.symbol === "plant-view" && e.params.plant === plant.PSU!.id)!;
    expect(psu.zone).toBe("internal");
    const toPsu = sheet1.segments.filter((s) => s.from[0] === psu.id || s.to[0] === psu.id);
    expect(toPsu.length).toBeGreaterThan(0);
    const earth = earthConductors(p);
    for (const s of toPsu) {
      expect(isFieldWire(sheet1, s)).toBe(false);
      expect(numberByDefault(sheet1, s, earth)).toBe(true);
    }
    // Below a boundary: field wiring, as before.
    const di = p.pages.find((pg) => pg.title === "Controller: digital inputs")!;
    const dps = di.elements.find((e) => e.symbol === "plant-view" && e.params.plant === plant.DPS1!.id)!;
    expect(dps.zone).toBe("external");
    // Set by hand still wins.
    toPsu[0]!.field = true;
    expect(isFieldWire(sheet1, toPsu[0]!)).toBe(true);
  });

  test("F7: an old file's plant view marked external on a sheet with no boundary opens as panel wiring", () => {
    const { project: p, plant } = fresh();
    const file = JSON.parse(JSON.stringify(p));
    const v = file.pages[0].elements.find((e: { params: { plant?: string } }) => e.params.plant === plant.PSU!.id);
    v.zone = "external";
    const back = parseProject(file);
    expect(back.pages[0]!.elements.find((e) => e.id === v.id)!.zone).toBe("internal");
  });

  test("T3: panel devices: their own group first, counted apart in To draw, out of the points schedule, on the GA", () => {
    const { project: p, plant } = fresh();
    const g = systemGroups(p);
    expect(g[0]!.panel).toBe(true);
    expect(g[0]!.plant.map((x) => x.tag)).toEqual(["PSU-01", "BAT-01"]);
    expect(g.slice(1).some((x) => x.plant.some((y) => y.inPanel))).toBe(false);
    const td = toDraw(p);
    expect(td.panel.map((x) => [x.item.tag, x.sheets])).toEqual([["PSU-01", [1]], ["BAT-01", [1]]]);
    expect(td.plant.some((x) => x.item.inPanel)).toBe(false);
    expect(pointsSchedule(p).some((r) => r.tag === "PSU-01" || r.tag === "BAT-01")).toBe(false);
    const ga = gaCandidates(p, () => "").filter((c) => c.modules?.some((m) => m.id === plant.PSU!.id));
    expect(ga.length).toBe(1);
    expect(ga[0]!.w).toBe(50);
  });

  test("T3: placed only above the boundary; Check warns if one is below", () => {
    const { project: p, plant } = fresh();
    const pg = p.pages.find((x) => x.boundaryY !== null)!;
    expect(() => placePlantView(p, pg.id, plant.BAT!.id, [120, 80])).toThrow(/in the panel: place it above the boundary/);
    const v = placePlantView(p, pg.id, plant.BAT!.id, [120, 40]);
    moveElements(p, pg.id, [v.id], [0, 40]);
    expect(checkProject(p).some((f) => /BAT-01 is in the panel but drawn below the boundary/.test(f.message))).toBe(true);
    // And marking plant drawn below as in the panel is refused.
    expect(() => setPlantDesign(p, plant.DPS1!.id, { inPanel: true })).toThrow(/below the panel boundary/);
  });
});
