/**
 * The v0.4.x revision sprint (docs/design-v0.4.x.md): each step's rules,
 * mostly on the BMS-01 fixture.
 */
import { describe, expect, test } from "bun:test";
import { AvoidLib } from "libavoid-js";
import { buildBms01 } from "../bench/bms01";
import { blockHalf, cellHalfFor } from "./blocks";
import { checkProject } from "./checks";
import { designTemplateOf, insertDesignTemplate, addInterlockCondition, removeInterlockCondition, setPlantDesign, systemGroups, toDraw, updateDesignPoint, updateInterlock } from "./design";
import { describeInterlock, interlockExpectations, interlockStatus, proveInterlocks, provingJob } from "./interlocks";
import { parseSupplies, parseSupply } from "./supplies";
import { refreshConductors } from "./conductors";
import { newProject, type Element, type Project } from "./model";
import { labelBlockRect, terminalNames, localGeometry, moduleViewLayout, plantViewLayout, terminalPoint, wrapTag, wrapTitle } from "./symbols";
import { elementTexts } from "./tags";
import { textWidth } from "./textwidth";
import { AREA_UNITS, textUnits } from "./geometry";
import { moduleTitle, viewsOf } from "./modules";
import { addElement, addGaDevice, addPlant, connect, portGroups, setGroupPort, resetRoute, rotateElements, deletePlant, linkContact, setGroupSide, setViewSide, setViewSpan, setWireLabelAt, moveElements, placePlantView, addGaDim, addGaItem, addGaPage, addPlatesForDoors, joinDoorBelow, setPlateBehind, setBoundary, setGaSettings, splitDoor, updateElement } from "./ops";
import { earthConductors, removeLoops, fractionAlong, isFieldWire, numberByDefault, pointAlong, wireTexts } from "./wires";
import { routePage } from "./routing";
import { billOfMaterials, coresPerDevice, groupMarkers, pointsSchedule, wireMarkers } from "./schedules";
import { compile, initialState, toggle } from "./sim";
import { addController, addModule, setModuleCommons } from "./controllers";
import { pointRef } from "./points";
import { Nets } from "./wiring";
import { moveOnNetwork, networkChain, networkData, putOnNetwork, updateNetwork } from "./network";
import { designChecks } from "./checks";
import { networkDiagram } from "./networkdraw";
import { ENCL, PLATE_MARGIN, gaCandidates, sizeKey, dimLayout, doorPanes, plateDoor, platesOf, drawnGaItems, gaFrame, paneOf, paneRef, sheetPanes } from "./ga";
import { renumber } from "./renumber";
import { deleteGaItems, deleteElements, splitGaStrip, updateGaItem, updateSection } from "./ops";
import { itemStrip, plateTextLayout, stripLabel, stripParts, syncGaStrips } from "./ga";
import { importTemplate, saveSheetTemplate, stampTemplate } from "./templates";
import { duplicatePlant, stepTag } from "./design";
import { masterOf } from "./xref";
import { loadText, supplyLoads } from "./supplyload";
import { setModuleVa } from "./controllers";
import { conductorLooks, distributionFunction, functionRows } from "./wirecolours";
import { formatRelayPins, parseRelayPins } from "./devices";
import { contactTable, relayPinMarks, slavesOf } from "./xref";
import { setFunctionColour } from "./ops";
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
    expect(() => parseProject(newer)).toThrow("Not opened. This file needs Ferrule 0.9.1 or later. Builds: https://github.com/Cryptdos/ferrule/releases");
    const { savedBy: _, ...old } = newer;
    expect(() => parseProject(old)).toThrow("Not opened. This file is from a newer Ferrule.");
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

describe("step 5: view text wraps (F4, F5)", () => {
  const textsOf = (p: Project, el: Element) => localGeometry(el, elementTexts(el, p)).prims.flatMap((x) => (x.t === "text" ? [x] : []));

  test("F4: tag, description and information wrap to the box plus 1.5 each side (12 at least), at 2.5 mm, centred", () => {
    const { project: p, plant } = fresh();
    const di = p.pages.find((pg) => pg.title === "Controller: digital inputs")!;
    for (const v of di.elements.filter((e) => e.symbol === "plant-view")) {
      const g = localGeometry(v, elementTexts(v, p));
      const lay = plantViewLayout(v);
      const limit = Math.max(lay.right - lay.left + 3, 12);
      for (const t of g.prims) {
        if (t.t !== "text" || t.at[1] < lay.h) continue;
        expect(textWidth(t.text, t.size)).toBeLessThanOrEqual(limit + 1e-6);
        expect(t.anchor).toBe("middle");
      }
    }
    const v = di.elements.find((e) => e.params.plant === plant.SFD!.id)!;
    const under = textsOf(p, v).filter((t) => t.at[1] > plantViewLayout(v).h);
    expect(under.filter((t) => t.role === "note").every((t) => Math.abs(t.size - textUnits("tag")) < 1e-9)).toBe(true);
    expect(under.map((t) => t.text).join(" ")).toBe("AHU-01-SF-01-VSD Supply fan variable speed drive");
  });

  test("F4: a tag breaks only at a hyphen, only when it's wider than the limit", () => {
    expect(wrapTag("AHU-01-DPS-25-44", 2, 100)).toEqual(["AHU-01-DPS-25-44"]);
    const parts = wrapTag("AHU-01-DPS-25-44", 2, 9);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join("")).toBe("AHU-01-DPS-25-44");
    expect(parts.slice(0, -1).every((x) => x.endsWith("-"))).toBe(true);
    expect(wrapTag("NOHYPHENSHERE", 2, 5)).toEqual(["NOHYPHENSHERE"]);
  });

  test("F4: a group's name wraps to its group plus a unit each side (8 at least), and groups sit closer", () => {
    const p = newProject("g");
    const it = addPlant(p, "FA-1", "Fire alarm", ["1", "2", "3", "4"], { pins: { "1": { group: "Fire alarm healthy" }, "2": { group: "Fire alarm healthy" }, "3": { group: "Fire alarm stage two" }, "4": { group: "Fire alarm stage two" } } });
    const v = placePlantView(p, p.pages[0]!.id, it.id, [20, 40]);
    const lay = plantViewLayout(v);
    for (const g of lay.groups) for (const l of g.lines) expect(textWidth(l, textUnits("tag"))).toBeLessThanOrEqual(Math.max(g.x1 - g.x0 + 2, 8) + 1e-6);
    expect(lay.groups[0]!.lines.length).toBeGreaterThan(1);
    // The second group starts well within what a one-line name would have pushed it to.
    expect(lay.groups[1]!.x0 - lay.groups[0]!.x1).toBeLessThan(textWidth("FIRE ALARM HEALTHY", textUnits("tag")));
  });

  test("F5: a module view's title wraps at its separators to the view's width", () => {
    expect(wrapTitle("A9-5 · Module 6 · DO-8 · Generic DO-8X", 2, 20)).toEqual(["A9-5 · Module 6 ·", "DO-8 · Generic DO-8X"]);
    const { project: p, modules } = fresh();
    const v = viewsOf(p, modules.ao.id)[0]!.el;
    const lay = moduleViewLayout(v);
    const title = textsOf(p, v).filter((t) => t.role === "tag");
    for (const t of title) expect(textWidth(t.text, t.size)).toBeLessThanOrEqual(lay.right - lay.left + 1e-6);
  });
});

describe("step 6: movable labels (T14, T7, T13)", () => {
  test("T14: a part's label block moves as one; the contact table keeps its place; it round-trips and goes back", () => {
    const p = newProject("l");
    const pg = p.pages[0]!.id;
    const k = addElement(p, pg, "coil", [20, 30], { label: "PUMP RUN" });
    const c = addElement(p, pg, "contact", [40, 30]);
    linkContact(p, c.id, k.id);
    renumber(p);
    const before = localGeometry(k, elementTexts(k, p)).prims.filter((x) => x.t === "text");
    updateElement(p, pg, k.id, { labelAt: [3, -2] });
    const after = localGeometry(k, elementTexts(k, p)).prims.filter((x) => x.t === "text");
    before.forEach((b, i) => {
      const a = after[i]!;
      if (b.t !== "text" || a.t !== "text") return;
      const moved = b.role === "tag" || b.role === "label" || b.block;
      expect(a.at).toEqual(moved ? [b.at[0] + 3, b.at[1] - 2] : b.at);
    });
    const back = parseProject(JSON.parse(JSON.stringify(p)));
    expect(back.pages[0]!.elements.find((e) => e.id === k.id)!.labelAt).toEqual([3, -2]);
    updateElement(p, pg, k.id, { labelAt: null });
    expect(k.labelAt).toBeUndefined();
  });

  test("T14: a plant view's tag, description and information move together", () => {
    const { project: p, plant } = fresh();
    const pg = p.pages.find((x) => x.title === "Controller: digital inputs")!;
    const v = pg.elements.find((e) => e.params.plant === plant.DPS1!.id)!;
    const r0 = labelBlockRect(v, localGeometry(v, elementTexts(v, p)))!;
    updateElement(p, pg.id, v.id, { labelAt: [5, 0] });
    const r1 = labelBlockRect(v, localGeometry(v, elementTexts(v, p)))!;
    expect(r1.x - r0.x).toBeCloseTo(5);
    expect(r1.y - r0.y).toBeCloseTo(0);
    expect(r1.w).toBeCloseTo(r0.w);
  });

  test("T7: Check hints when a label overlaps another part, and not once it's moved clear", () => {
    const p = newProject("o");
    const pg = p.pages[0]!.id;
    const a = addElement(p, pg, "coil", [20, 30], { label: "A VERY LONG LABEL HERE" });
    addElement(p, pg, "coil", [10, 30], { label: "B" });
    const hints = () => checkProject(p).filter((f) => /label overlaps/.test(f.message));
    expect(hints().length).toBeGreaterThan(0);
    updateElement(p, pg, a.id, { labelAt: [0, 25] });
    expect(hints().length).toBe(0);
  });

  test("T13, A26: a wire's label slides along its own wire as one, and the fraction survives a re-route", () => {
    const pts: [number, number][] = [[0, 0], [0, 10], [20, 10]];
    expect(pointAlong(pts, 0.5).at).toEqual([5, 10]);
    expect(fractionAlong(pts, [5, 12])).toBeCloseTo(0.5);
    const t = wireTexts(pts, { number: "3-12", labelAt: 0.25 });
    expect(t.length).toBe(1);
    // On the first leg, vertical, centred at y 7.5 beside it.
    expect(t[0]!.vertical).toBe(true);
    expect(t[0]!.at[1]).toBeCloseTo(7.5);
    // Number and colour go together.
    const both = wireTexts(pts, { number: "3-12", colour: "Bn", labelAt: 0.75 });
    expect(both.map((x) => x.role)).toEqual(["number", "colour"]);
    expect(both.every((x) => !x.vertical && x.at[1] === 9.65)).toBe(true);
    const { project: p } = fresh();
    const pg = p.pages[1]!;
    const seg = pg.segments[0]!;
    setWireLabelAt(p, pg.id, seg.id, 2);
    expect(seg.labelAt).toBe(1);
    setWireLabelAt(p, pg.id, seg.id, 0.8);
    routePage(AvoidLib.getInstance(), pg);
    expect(seg.labelAt).toBe(0.8);
    const back = parseProject(JSON.parse(JSON.stringify(p)));
    expect(back.pages[1]!.segments[0]!.labelAt).toBe(0.8);
    setWireLabelAt(p, pg.id, seg.id, null);
    expect(seg.labelAt).toBeUndefined();
  });
});

describe("step 7a: a view spans a width (T2)", () => {
  test("an eight-channel module view at span 130 spreads its channel groups at least 14 apart; unset, it's as before", () => {
    const { project: p, modules } = fresh();
    const v = viewsOf(p, modules.ao.id)[0]!.el;
    const before = plantViewLayout(v);
    const pg = p.pages.find((x) => x.elements.includes(v))!;
    setViewSpan(p, pg.id, v.id, 130);
    const lay = plantViewLayout(v);
    expect(lay.right - lay.left).toBe(130);
    expect(lay.groups.length).toBe(8);
    for (let i = 1; i < lay.groups.length; i++) expect(lay.groups[i]!.x0 - lay.groups[i - 1]!.x0).toBeGreaterThanOrEqual(14);
    // Within a group the pitch stays 2.
    for (const g of lay.groups) expect(g.x1 - g.x0).toBe(before.groups[0]!.x1 - before.groups[0]!.x0);
    // Equal gaps, the first and last a margin in from the ends.
    const gaps = lay.groups.slice(1).map((g, i) => g.x0 - lay.groups[i]!.x1);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(1);
    setViewSpan(p, pg.id, v.id, null);
    expect(plantViewLayout(v)).toEqual(before);
    // Narrower than it needs: no change.
    setViewSpan(p, pg.id, v.id, 5);
    expect(v.params.span).toBeUndefined();
  });

  test("Fit to sheet: as wide as the usable sheet from where it stands; wires follow its pins", () => {
    const { project: p, modules } = fresh();
    const v = viewsOf(p, modules.di.id)[0]!.el;
    const pg = p.pages.find((x) => x.elements.includes(v))!;
    setViewSpan(p, pg.id, v.id, "fit");
    const lay = plantViewLayout(v);
    expect(v.pos[0] + lay.right).toBeLessThanOrEqual(AREA_UNITS.w - 2 + 1e-9);
    expect(v.pos[0] + lay.right).toBeGreaterThan(AREA_UNITS.w - 3);
    routePage(AvoidLib.getInstance(), pg);
    for (const s of pg.segments.filter((x) => x.from[0] === v.id || x.to[0] === v.id)) {
      const end = s.from[0] === v.id ? s.points[0]! : s.points[s.points.length - 1]!;
      const t = terminalPoint(v, s.from[0] === v.id ? s.from[1] : s.to[1])!;
      expect(end).toEqual(t);
    }
  });
});

describe("step 7b: terminal groups on any side (T15)", () => {
  const drive = () => {
    const p = newProject("s");
    const it = addPlant(p, "VSD-1", "Drive", ["L", "N", "U", "V", "W", "DI1", "DCOM"], {
      pins: { L: { group: "Mains" }, N: { group: "Mains" }, U: { group: "Motor" }, V: { group: "Motor" }, W: { group: "Motor" }, DI1: { group: "Control" }, DCOM: { group: "Control" } },
    });
    const v = placePlantView(p, p.pages[0]!.id, it.id, [40, 30]);
    return { p, it, v, pg: p.pages[0]!.id };
  };

  test("whole view: terminals along the chosen edge facing out; left and right stack down the side and the box grows", () => {
    const { p, v, pg } = drive();
    const before = localGeometry(v, elementTexts(v, p));
    for (const [side, dir] of [["bottom", "down"], ["left", "left"], ["right", "right"]] as const) {
      setViewSide(p, pg, v.id, side);
      const g = localGeometry(v, elementTexts(v, p));
      expect(new Set(g.terminals.map((t) => t.dir))).toEqual(new Set([dir]));
      const edge = side === "bottom" ? g.body.y + g.body.h : side === "left" ? g.body.x : g.body.x + g.body.w;
      for (const t of g.terminals) expect(side === "bottom" ? t.at[1] : t.at[0]).toBe(edge);
      if (side !== "bottom") {
        // Stacked 2 apart down the side, numbers reading across.
        const ys = g.terminals.map((t) => t.at[1]);
        expect(ys[1]! - ys[0]!).toBe(2);
        expect(g.body.h).toBeGreaterThanOrEqual(ys[ys.length - 1]! - ys[0]!);
        expect(g.prims.some((x) => x.t === "text" && x.role === "term" && !x.vertical)).toBe(true);
      }
      // The text block: above for a bottom side, below for the others.
      const tag = g.prims.find((x) => x.t === "text" && x.text === "VSD-1")!;
      if (tag.t === "text") expect(side === "bottom" ? tag.at[1] < g.body.y : tag.at[1] > g.body.y + g.body.h).toBe(true);
    }
    setViewSide(p, pg, v.id, "top");
    expect(v.params.side).toBeUndefined();
    expect(localGeometry(v, elementTexts(v, p))).toEqual(before);
  });

  test("a module's default is the bottom; on top, its terminals face up", () => {
    const { project: p, modules } = fresh();
    const v = viewsOf(p, modules.ao.id)[0]!;
    setViewSide(p, v.page.id, v.el.id, "top");
    const g = localGeometry(v.el, elementTexts(v.el, p));
    expect(new Set(g.terminals.map((t) => t.dir))).toEqual(new Set(["up"]));
    setViewSide(p, v.page.id, v.el.id, "bottom");
    expect(v.el.params.side).toBeUndefined();
  });
});

describe("step 7b: sides per group, and routing with them (T15)", () => {
  const crossesBody = (pts: [number, number][], r: { x: number; y: number; w: number; h: number }) =>
    pts.slice(1).some((b, i) => {
      const a = pts[i]!;
      const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
      const [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
      const e = 0.05;
      return x1 > r.x + e && x0 < r.x + r.w - e && y1 > r.y + e && y0 < r.y + r.h - e;
    });

  test("a drive with its power on top and its control on the bottom: no wire crosses its body", () => {
    const p = newProject("d");
    const pg = p.pages[0]!;
    setBoundary(p, pg.id, 70);
    const it = addPlant(p, "VSD-1", "Drive", ["L", "N", "DI1", "DCOM"], { pins: { L: { group: "Mains" }, N: { group: "Mains" }, DI1: { group: "Control" }, DCOM: { group: "Control" } } });
    const v = placePlantView(p, pg.id, it.id, [40, 40]);
    setGroupSide(p, pg.id, v.id, "Control", "bottom");
    expect(JSON.parse(String(v.params.sides))).toEqual({ Control: "bottom" });
    const mcb = addElement(p, pg.id, "isolator", [42, 15], { params: { function: "breaker", poles: 2, operator: "none" } });
    connect(p, pg.id, [mcb.id, "2"], [v.id, "L"]);
    connect(p, pg.id, [mcb.id, "4"], [v.id, "N"]);
    const t1 = addElement(p, pg.id, "terminal", [42, 70]);
    const t2 = addElement(p, pg.id, "terminal", [44, 70]);
    connect(p, pg.id, [v.id, "DI1"], [t1.id, "1"]);
    connect(p, pg.id, [v.id, "DCOM"], [t2.id, "1"]);
    routePage(AvoidLib.getInstance(), pg);
    const g = localGeometry(v, elementTexts(v, p));
    const body = { x: v.pos[0] + g.body.x, y: v.pos[1] + g.body.y, w: g.body.w, h: g.body.h };
    for (const s of pg.segments) expect(crossesBody(s.points as [number, number][], body)).toBe(false);
    const dirs = Object.fromEntries(g.terminals.map((t) => [t.name, t.dir]));
    expect(dirs).toEqual({ L: "up", N: "up", DI1: "down", DCOM: "down" });
  });

  test("on the fixture: field devices below with terminals on top, modules above with terminals on the bottom, route with no loops", () => {
    const { project: p } = fresh();
    for (const pg of p.pages.filter((x) => x.title.startsWith("Controller:"))) {
      routePage(AvoidLib.getInstance(), pg);
      for (const s of pg.segments) expect(removeLoops(s.points)).toEqual(s.points);
    }
  });
});

describe("step 8: routing clear of strips and pin rows (F6)", () => {
  /** Length of horizontal runs lying within a unit outside an edge at y, over x0..x1 (stubs are vertical, so none count). */
  const alongEdge = (pts: [number, number][], y: number, side: -1 | 1, x0: number, x1: number) => {
    let n = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      if (a[1] !== b[1]) continue;
      const d = (a[1] - y) * side;
      if (d < 0 || d >= 1) continue;
      n += Math.max(0, Math.min(Math.max(a[0], b[0]), x1) - Math.max(Math.min(a[0], b[0]), x0));
    }
    return n;
  };
  test("on the fixture's module and damper sheets: nothing runs along the block or a pin row, and no wire passes under a view", () => {
    const { project: p } = fresh();
    const sheets = p.pages.filter((x) => x.title.startsWith("Controller:") || /drives and dampers|proven open/.test(x.title));
    expect(sheets.length).toBeGreaterThanOrEqual(6);
    for (const pg of sheets) {
      routePage(AvoidLib.getInstance(), pg);
      const segs = pg.segments.map((s) => s.points as [number, number][]);
      if (pg.boundaryY !== null) {
        const half = blockHalf(pg);
        for (const pts of segs) {
          expect(alongEdge(pts, pg.boundaryY - half, -1, 0, 150)).toBe(0);
          expect(alongEdge(pts, pg.boundaryY + half, 1, 0, 150)).toBe(0);
        }
      }
      for (const v of pg.elements.filter((e) => e.symbol === "plant-view")) {
        const g = localGeometry(v, elementTexts(v, p));
        const b = { x: v.pos[0] + g.body.x, y: v.pos[1] + g.body.y, w: g.body.w, h: g.body.h };
        const topRow = g.terminals.some((t) => Math.abs(t.at[1] - g.body.y) < 0.01);
        const bottomRow = g.terminals.some((t) => Math.abs(t.at[1] - (g.body.y + g.body.h)) < 0.01);
        for (const pts of segs) {
          if (topRow) expect(alongEdge(pts, b.y, -1, b.x, b.x + b.w)).toBe(0);
          if (bottomRow) expect(alongEdge(pts, b.y + b.h, 1, b.x, b.x + b.w)).toBe(0);
          // Never under (through) the view to a pin on its far side.
          for (let i = 0; i < pts.length - 1; i++) {
            const [a, c] = [pts[i]!, pts[i + 1]!];
            const through = Math.max(a[0], c[0]) > b.x + 0.05 && Math.min(a[0], c[0]) < b.x + b.w - 0.05 && Math.max(a[1], c[1]) > b.y + 0.05 && Math.min(a[1], c[1]) < b.y + b.h - 0.05;
            expect(through).toBe(false);
          }
        }
      }
    }
  });
});

describe("step 9a: connector block, socket, motors (M9, T17, M8)", () => {
  test("M9: a connector block of n terminals is one potential, in line pairs, growing taller, tagged X, sized on the GA by its count", () => {
    const p = newProject("c");
    const pg = p.pages[0]!.id;
    const b = addElement(p, pg, "connector-block", [40, 30], { label: "EARTH BLOCK", params: { terminals: 6 } });
    const g = localGeometry(b, elementTexts(b, p));
    const at = (n: string) => g.terminals.find((t) => t.name === n)!;
    expect(g.terminals.map((t) => t.name)).toEqual(["1", "2", "3", "4", "5", "6", "E1", "E2"]);
    // A pair in line: in on one side, out on the other.
    expect(at("1").at[1]).toBe(at("2").at[1]);
    expect([at("1").dir, at("2").dir]).toEqual(["left", "right"]);
    expect(at("3").at[1] - at("1").at[1]).toBe(2);
    const g2 = localGeometry(addElement(p, pg, "connector-block", [60, 30], { params: { terminals: 2 } }), "");
    expect(g.body.h).toBeGreaterThan(g2.body.h);
    // It doesn't turn (v0.5 A39): a block is drawn the way the sheet runs.
    expect(() => rotateElements(p, pg, [b.id])).toThrow("doesn't turn");
    expect(b.rot).toBe(0);
    // One conductor through every terminal.
    const k = addElement(p, pg, "coil", [20, 20]);
    const e = addElement(p, pg, "earth", [80, 40]);
    connect(p, pg, [k.id, "A2"], [b.id, "1"]);
    connect(p, pg, [b.id, "4"], [e.id, "E"]);
    refreshConductors(p);
    expect(p.conductors.find((c) => c.terminals.some(([id, t]) => id === k.id && t === "A2"))!.terminals.some(([id]) => id === e.id)).toBe(true);
    renumber(p);
    expect(b.tag.startsWith("X")).toBe(true);
    expect(sizeKey(p, b)).toEqual({ key: "connBlock", poles: 3 });
  });

  test("T17: an old socket's earth moves to the top; a hand-routed earth wire is flagged until it's re-routed", () => {
    const p = newProject("s");
    const pg = p.pages[0]!.id;
    const sk = addElement(p, pg, "socket", [20, 30]);
    const pe = addElement(p, pg, "earth", [30, 20]);
    const w = connect(p, pg, [sk.id, "E"], [pe.id, "E"]);
    w.route = "manual";
    const file = JSON.parse(JSON.stringify(p));
    delete file.pages[0].elements.find((e: { id: string }) => e.id === sk.id).params.etop;
    const back = parseProject(file);
    const flagged = () => checkProject(back).filter((f) => /earth now enters from the top/.test(f.message));
    expect(flagged().length).toBe(1);
    resetRoute(back, back.pages[0]!.id, [w.id]);
    expect(flagged().length).toBe(0);
    // A new socket isn't flagged.
    expect(checkProject(p).some((f) => /earth now enters from the top/.test(f.message))).toBe(false);
  });

  test("M8: a single-phase motor has L and N; fan and pump change the picture (its Type, v0.5 A56)", () => {
    const p = newProject("m");
    const pg = p.pages[0]!.id;
    const m3 = addElement(p, pg, "motor", [20, 30]);
    const m1 = addElement(p, pg, "motor", [40, 30], { params: { phases: "1" } });
    expect(terminalNames(m3)).toEqual(["U", "V", "W"]);
    expect(terminalNames(m1)).toEqual(["L", "N"]);
    const pics = ["motor", "fan", "pump"].map((type) => localGeometry(addElement(p, pg, "motor", [60, 30], { params: { type } }), ""));
    expect(new Set(pics.map((g) => JSON.stringify(g.prims))).size).toBe(3);
    expect(new Set(pics.map((g) => JSON.stringify(g.terminals))).size).toBe(1);
  });
});

describe("step 9b: RCD, connector, plant marks (M1); door devices with no schematic part (M5)", () => {
  test("M1: the fixture's power supply as a Design template, inserted into an empty project, supplies 24 V with nothing more set", () => {
    const { project: src, plant } = fresh();
    const t = designTemplateOf(src, [plant.PSU!.id], "24 V power supply");
    const p = newProject("e");
    const pg = p.pages[0]!.id;
    const [psu] = insertDesignTemplate(p, t).plant;
    expect(psu!.inPanel).toBe(true);
    expect(psu!.points!.find((q) => q.form === "supply-out")!.gives).toEqual({ v: 24, ac: false });
    // Its 24 V follows its own mains in the copy, not the original's.
    expect(psu!.points!.find((q) => q.form === "supply-out")!.follows![0]!.ref).toBe(`plant:${psu!.id}:Mains`);
    const inc = addElement(p, pg, "supply", [10, 5], { params: { system: "1ph-n" } });
    const v = placePlantView(p, pg, psu!.id, [10, 30]);
    const lamp = addElement(p, pg, "lamp", [30, 50]);
    connect(p, pg, [inc.id, "L"], [v.id, "L"]);
    connect(p, pg, [inc.id, "N"], [v.id, "N"]);
    connect(p, pg, [v.id, "+"], [lamp.id, "+V"]);
    connect(p, pg, [lamp.id, "-V"], [v.id, "-"]);
    refreshConductors(p);
    const c = compile(p);
    expect(initialState(c).lamps[lamp.id]).toBe(true);
  });

  test("M1: RCD is a breaker with the residual current mark; tagged and simulated as one", () => {
    const p = newProject("r");
    const pg = p.pages[0]!.id;
    const b = addElement(p, pg, "isolator", [20, 20], { params: { function: "breaker", poles: 2, operator: "none" } });
    const r = addElement(p, pg, "isolator", [40, 20], { params: { function: "rcd", poles: 2, operator: "none" } });
    const gb = localGeometry(b, "");
    const gr = localGeometry(r, "");
    expect(gr.prims.some((x) => x.t === "ellipse")).toBe(true);
    expect(gb.prims.some((x) => x.t === "ellipse")).toBe(false);
    expect(gr.terminals).toEqual(gb.terminals);
    renumber(p);
    expect(r.tag[0]).toBe(b.tag[0]);
    expect(sizeKey(p, r)?.key).toBe("mcb");
    expect(compile(p).inputs.some((i) => i.el === r.id && i.initial === 1)).toBe(true);
  });

  test("M1: a plug and socket connector of n ways passes each way straight through", () => {
    const p = newProject("c");
    const pg = p.pages[0]!.id;
    const x = addElement(p, pg, "plug-socket", [20, 20], { params: { ways: 3 } });
    expect(terminalNames(x)).toEqual(["S1", "P1", "S2", "P2", "S3", "P3"]);
    const k = addElement(p, pg, "coil", [20, 40]);
    connect(p, pg, [x.id, "P1"], [k.id, "A1"]);
    const sw = addElement(p, pg, "contact", [20, 5]);
    connect(p, pg, [sw.id, "14"], [x.id, "S1"]);
    refreshConductors(p);
    const cond = p.conductors.find((cd) => cd.terminals.some(([id]) => id === k.id))!;
    expect(cond.terminals.some(([id]) => id === sw.id)).toBe(true);
  });

  test("M1: a plant item's mark is drawn inside its view; nothing else depends on it", () => {
    const { project: p, plant } = fresh();
    const v = viewsOf(p, plant.TT1!.id)[0]!.el;
    const before = localGeometry(v, elementTexts(v, p));
    setPlantDesign(p, plant.TT1!.id, { mark: "other", markText: "T" });
    expect(v.params.pmark).toBe("other");
    const after = localGeometry(v, elementTexts(v, p));
    expect(after.prims.some((x) => x.t === "text" && x.text === "T")).toBe(true);
    expect(after.terminals).toEqual(before.terminals);
    const back = parseProject(JSON.parse(JSON.stringify(p)));
    expect(back.plant.find((x) => x.id === plant.TT1!.id)!.mark).toBe("other");
    expect(back.plant.find((x) => x.id === plant.TT1!.id)!.markText).toBe("T");
  });

  test("M5: a door device with no schematic part prints its tag and is on the bill of materials", () => {
    const { project: p } = fresh();
    const door = p.pages.find((x) => x.ga?.view === "door-front")!;
    const d = addGaDevice(p, door.id, { name: "Operator touch screen", tag: "HMI1", x: 300, y: 600, w: 190, h: 140, cutout: "186 x 138" });
    expect(d.tag).toBe("HMI1");
    const bom = billOfMaterials(p);
    expect(JSON.stringify(bom)).toContain("Operator touch screen");
    expect(JSON.stringify(bom)).toContain("HMI1");
    const back = parseProject(JSON.parse(JSON.stringify(p)));
    expect(back.pages.find((x) => x.id === door.id)!.gaItems!.find((i) => i.id === d.id)).toMatchObject({ tag: "HMI1", text: "Operator touch screen", cutout: "186 x 138" });
  });
});

describe("step 10a: module commons and tags (M6, T9)", () => {
  const rig = (linked: boolean) => {
    const p = newProject("m");
    const pg = p.pages[0]!.id;
    const c = addController(p, "Controller");
    const di = addModule(p, c.id, { type: "di", channels: 4 });
    if (!linked) setModuleCommons(p, di.id, false);
    const sw = addPlant(p, "S1", "Switch", ["C", "NO"], { points: [{ name: "Closed", form: "contact", pins: ["C", "NO"] }] });
    const mv = placePlantView(p, pg, di.id, [10, 20]);
    const sv = placePlantView(p, pg, sw.id, [10, 60]);
    const pt = (n: string) => di.points!.find((q) => q.name === n)!;
    const [sig] = pt("DI1").pins;
    const com3 = pt("DI3").pins[1]!;
    connect(p, pg, [mv.id, sig!], [sv.id, "C"]);
    connect(p, pg, [sv.id, "NO"], [mv.id, com3]);
    refreshConductors(p);
    return { p, di, sw, mv };
  };

  test("M6: a new module's commons are linked; one return to any of them works in Simulate; off, it doesn't", () => {
    for (const linked of [true, false]) {
      const { p, di, sw } = rig(linked);
      expect(!!di.module!.commons?.length).toBe(linked);
      if (linked) expect(di.module!.commons![0]!.length).toBe(2);
      const c = compile(p);
      const s = toggle(c, initialState(c), pointRef(sw.id, "Closed"));
      expect(!!s.energised[pointRef(di.id, "DI1")]).toBe(linked);
    }
  });

  test("M6: the module view shows the link; old files open with commons off", () => {
    const { p, di, mv } = rig(true);
    const g = localGeometry(mv, elementTexts(mv, p));
    expect(g.prims.filter((x) => x.t === "circle" && x.fill).length).toBeGreaterThanOrEqual(2);
    const file = JSON.parse(JSON.stringify(p));
    delete file.plant.find((x: { id: string }) => x.id === di.id).module.commons;
    expect(parseProject(file).plant.find((x) => x.id === di.id)!.module!.commons).toBeUndefined();
    expect(parseProject(JSON.parse(JSON.stringify(p))).plant.find((x) => x.id === di.id)!.module!.commons).toEqual(di.module!.commons!);
  });

  test("M6: the wiring check accepts a return that reaches any linked common", () => {
    const { p, di, sw } = rig(true);
    const nets = new Nets(p);
    const list = di.module!.commons![0]!;
    expect(nets.find(Nets.pin(di.id, list[0]!))).toBe(nets.find(Nets.pin(di.id, list[1]!)));
    void sw;
  });

  test("T9: with a controller map, modules take their tags from their place on it; without, from their first view", () => {
    const { project: p, modules } = fresh();
    const mapSheet = p.pages.find((pg) => pg.elements.some((e) => e.symbol === "ctrlmap"))!;
    for (const m of Object.values(modules)) expect(m.tag).toMatch(new RegExp(`^A${mapSheet.number}-\\d+`));
    expect(new Set(Object.values(modules).map((m) => m.tag)).size).toBe(6);
    mapSheet.elements = mapSheet.elements.filter((e) => e.symbol !== "ctrlmap");
    renumber(p);
    expect(modules.di.tag).toBe(`A${viewsOf(p, modules.di.id)[0]!.page.number}-${viewsOf(p, modules.di.id)[0]!.address.split("-")[1]}`);
  });
});

describe("step 10b: serial ports (M7, T5)", () => {
  test("a group of pins is a serial port; a network names its port; the network sheet prints it at the controller end", () => {
    const { project: p, modules, plant } = fresh();
    expect(portGroups(modules.host)).toEqual(["COM A", "COM B"]);
    expect(portGroups(plant.SFD!)).toEqual(["Modbus"]);
    const bus = p.networks!.find((n) => n.name === "Drives bus")!;
    expect(bus.port).toEqual({ plant: modules.host.id, group: "COM A" });
    const d = networkData(p);
    expect(d.buses.map((b) => b.port)).toEqual(["COM A", "COM B"]);
    const texts = networkDiagram(d).prims.flatMap((x) => (x.t === "text" ? [x.text] : []));
    expect(texts.some((t) => t.startsWith("COM A: Drives bus"))).toBe(true);
    // Untick the port: the network loses it.
    setGroupPort(p, modules.host.id, "COM A", false);
    expect(bus.port).toBeUndefined();
    expect(() => updateNetwork(p, bus.id, { port: { plant: modules.host.id, group: "COM A" } })).toThrow(/serial port/);
    // Saved and read back.
    const back = parseProject(JSON.parse(JSON.stringify(p)));
    expect(back.networks!.find((n) => n.name === "Meters bus")!.port).toEqual({ plant: modules.host.id, group: "COM B" });
    expect(back.plant.find((x) => x.id === modules.host.id)!.pins!["4"]!.port).toBe(true);
  });

  test("a wired port gives the network its devices and order from the drawing; Check flags where Design and the wiring differ", () => {
    const { project: p, plant } = fresh();
    const SFD = plant.SFD!;
    const EFD = plant.EFD!;
    const drives = p.networks!.find((n) => n.name === "Drives bus")!;
    const meters = p.networks!.find((n) => n.name === "Meters bus")!;
    // Drives: daisy-chained from COM A through the boundary terminals, SFD then EFD.
    expect(networkChain(p, drives)).toEqual({ drawn: true, devices: [SFD, EFD] });
    // Meters: COM B has no wires, so the order is Design's.
    expect(networkChain(p, meters).drawn).toBe(false);
    const msgs = () => designChecks(p).map((f) => f.message).filter((m) => /bus/.test(m));
    expect(msgs()).toEqual([]);
    // The rows the other way round: the drawing still decides, and the order can't be moved by hand.
    const a = p.plant.indexOf(SFD);
    const b = p.plant.indexOf(EFD);
    p.plant[a] = EFD;
    p.plant[b] = SFD;
    expect(networkData(p).buses[0]!.devices).toEqual([SFD.tag, EFD.tag]);
    expect(() => moveOnNetwork(p, SFD.id, 1)).toThrow(/from the drawing/);
    expect(() => moveOnNetwork(p, plant.M1!.id, 1)).not.toThrow();
    // Chain the extract drive first: the drawing's order follows.
    const page = p.pages.find((pg) => pg.title.startsWith("Controller: map"))!;
    const comms = page.elements.filter((e) => e.symbol === "plant-view" && String(e.params.show) === "A+,B-");
    expect(comms.map((e) => e.params.plant)).toEqual([SFD.id, EFD.id]);
    comms[0]!.params.plant = EFD.id;
    comms[1]!.params.plant = SFD.id;
    expect(networkChain(p, drives).devices).toEqual([EFD, SFD]);
    expect(networkData(p).buses[0]!.devices).toEqual([EFD.tag, SFD.tag]);
    // Cut the link on to the second drive: Check says the chain doesn't reach it.
    page.segments = page.segments.filter((s) => !(s.from[0] === comms[0]!.id && s.to[0] === comms[1]!.id) && !(s.to[0] === comms[0]!.id && s.from[0] === comms[1]!.id));
    expect(networkChain(p, drives).devices).toEqual([EFD]);
    expect(msgs()).toEqual([`${SFD.tag} is on Drives bus in Design, but the wiring from COM A doesn't reach it (at a pin of a serial port)`]);
    // A device wired on the bus but not on the network in Design.
    putOnNetwork(p, [EFD.id], "");
    expect(msgs()).toContain(`${EFD.tag} is wired on Drives bus from COM A, but isn't on it in Design`);
    // A device whose comms pins aren't a serial port ends the trail: not reached.
    for (const t of ["A+", "B-"]) delete EFD.pins![t]!.port;
    expect(networkChain(p, drives)).toEqual({ drawn: true, devices: [] });
  });
});

describe("step 11: terminal strips (T4; follow on since v0.5 A51)", () => {
  const stripsOf = (p: Project) => p.pages.filter((pg) => !pg.ga).map((pg) => [...new Set(pg.elements.filter((e) => e.symbol === "terminal").map((e) => String(e.params.strip ?? "X1")))].join(","));

  test("a terminal is on the strip of the one before it, by sheet then left to right, until a strip is typed; Renumber follows on", () => {
    const { project: p } = fresh();
    renumber(p);
    // Nothing typed: everything is X1.
    expect(new Set(stripsOf(p).filter(Boolean))).toEqual(new Set(["X1"]));
    // Type X2 on the first terminal of a sheet: it and every terminal after it are X2.
    const di = p.pages.find((pg) => pg.title === "Controller: digital inputs")!;
    const terms = di.elements.filter((e) => e.symbol === "terminal").sort((a, b) => a.pos[0] - b.pos[0] || a.pos[1] - b.pos[1]);
    updateElement(p, di.id, terms[0]!.id, { params: { strip: "X2" } });
    // Not until Renumber (ruled 26 Nov 2026).
    expect(terms[1]!.params.strip).toBe("X1");
    renumber(p);
    const before = p.pages.filter((pg) => !pg.ga && pg.number < di.number);
    const after = p.pages.filter((pg) => !pg.ga && pg.number >= di.number);
    expect(new Set(before.flatMap((pg) => pg.elements.filter((e) => e.symbol === "terminal").map((e) => e.params.strip)))).toEqual(new Set(["X1"]));
    expect(new Set(after.flatMap((pg) => pg.elements.filter((e) => e.symbol === "terminal").map((e) => e.params.strip)))).toEqual(new Set(["X2"]));
    // Type X3 on the next sheet's first: X3 from there on.
    const next = after.find((pg) => pg.number > di.number && pg.elements.some((e) => e.symbol === "terminal"))!;
    const n0 = next.elements.filter((e) => e.symbol === "terminal").sort((a, b) => a.pos[0] - b.pos[0] || a.pos[1] - b.pos[1])[0]!;
    updateElement(p, next.id, n0.id, { params: { strip: "X3" } });
    renumber(p);
    expect(di.elements.filter((e) => e.symbol === "terminal").every((e) => e.params.strip === "X2")).toBe(true);
    expect(next.elements.filter((e) => e.symbol === "terminal").every((e) => e.params.strip === "X3")).toBe(true);
    // Renumbering again changes nothing.
    const once = stripsOf(p);
    renumber(p);
    expect(stripsOf(p)).toEqual(once);
  });

  test("a strip on the GA splits at a terminal onto the next rail; each part prints its range and keeps up with the schematic", () => {
    const { project: p } = fresh();
    const ga = p.pages.find((pg) => pg.ga?.view === "backplate")!;
    const x1 = ga.gaItems!.find((it) => itemStrip(p, it) === "X1")!;
    const all = [...x1.refs!];
    const w = x1.w;
    expect(stripLabel(p, x1)).toBe("X1");
    expect(() => splitGaStrip(p, ga.id, x1.id, all[0]!)).toThrow(/after the first/);
    const part = splitGaStrip(p, ga.id, x1.id, all[30]!);
    expect(x1.refs).toEqual(all.slice(0, 30));
    expect(part.refs).toEqual(all.slice(30));
    expect(Math.abs(x1.w + part.w - w)).toBeLessThan(0.5);
    // On the next rail down, from its left end.
    const rails = ga.gaItems!.filter((r) => r.kind === "rail").sort((a, b) => a.y - b.y);
    const next = rails.find((r) => r.y > x1.y + x1.h / 2)!;
    expect(part.x).toBe(next.x);
    expect(part.y + part.h / 2).toBeCloseTo(next.y + next.h / 2, 0);
    const els = new Map(p.pages.flatMap((pg) => pg.elements.map((e) => [e.id, e] as const)));
    const tag = (id: string) => els.get(id)!.tag;
    expect(stripLabel(p, x1)).toBe(`X1: ${tag(all[0]!)}\u2013${tag(all[29]!)}`);
    expect(stripLabel(p, part)).toBe(`X1: ${tag(all[30]!)}\u2013${tag(all[all.length - 1]!)}`);
    expect(stripParts(p, "X1")).toHaveLength(2);
    // Sync keeps the split where it is.
    syncGaStrips(p);
    expect(x1.refs).toEqual(all.slice(0, 30));
    expect(part.refs).toEqual(all.slice(30));
    // A terminal deleted from the first part leaves it; the second part is untouched.
    const pg5 = p.pages.find((pg) => pg.elements.some((e) => e.id === all[3]))!;
    deleteElements(p, pg5.id, [all[3]!]);
    syncGaStrips(p);
    expect(x1.refs).toEqual(all.slice(0, 30).filter((_, i) => i !== 3));
    expect(part.refs).toEqual(all.slice(30));
    // The BOM counts both parts as one strip.
    const bom = billOfMaterials(p).filter((r) => r.tags === "X1");
    expect(bom.reduce((a, r) => a + r.quantity, 0)).toBe(all.length - 1);
    // Delete the second part: its terminals go back to the first.
    deleteGaItems(p, ga.id, [part.id]);
    syncGaStrips(p);
    expect(x1.refs).toEqual(all.filter((_, i) => i !== 3));
    expect(stripLabel(p, x1)).toBe("X1");
  });
});

describe("step 12: cores per device, markers, enclosure fit (T18, M10, T20)", () => {
  test("cores per field device: its wired terminals, earth included, in its own pin order", () => {
    const { project: p, plant } = fresh();
    const rows = coresPerDevice(p);
    const row = (it: { tag: string }) => rows.find((r) => r.plant === it.tag);
    expect(row(plant.DPS1!)).toMatchObject({ cores: 2, terminals: "C NO" });
    expect(row(plant.SF!)).toMatchObject({ cores: 4, terminals: "U V W PE" });
    expect(row(plant.VLV!)!.cores).toBe(3);
    // Not a controller's module, and not comms-only plant with nothing drawn.
    expect(rows.some((r) => r.plant.startsWith("A5-"))).toBe(false);
    expect(row(plant.M1!)).toBeUndefined();
  });

  test("markers: two a wire; a terminal's number at a terminal, the device's tag at a core's field end; grouped counts", () => {
    const { project: p, plant } = fresh();
    const m = wireMarkers(p);
    const ends = p.pages.reduce((a, pg) => a + pg.segments.length * 2, 0);
    const junctionEnds = p.pages.reduce((a, pg) => a + pg.segments.flatMap((s) => [s.from, s.to]).filter(([id]) => pg.elements.find((e) => e.id === id)?.symbol === "junction").length, 0);
    expect(m.length).toBe(ends - junctionEnds);
    // The supply fan's airflow switch: a core from its terminal to the switch.
    const di = p.pages.find((pg) => pg.title === "Controller: digital inputs")!;
    const view = di.elements.find((e) => e.symbol === "plant-view" && e.params.plant === plant.DPS1!.id)!;
    const core = di.segments.find((s) => s.to[0] === view.id || s.from[0] === view.id)!;
    const term = di.elements.find((e) => e.id === (core.to[0] === view.id ? core.from[0] : core.to[0]))!;
    expect(term.symbol).toBe("terminal");
    const mine = m.filter((r) => r.what.startsWith("core") && (r.text === term.tag || r.text === plant.DPS1!.tag) && r.where.startsWith(`${di.number}-`));
    expect(mine.map((r) => r.what)).toContain("core, field end");
    expect(m).toContainEqual(expect.objectContaining({ text: plant.DPS1!.tag, what: "core, field end" }));
    expect(m).toContainEqual(expect.objectContaining({ text: term.tag, what: "core, panel end" }));
    // A wire numbered by hand still gets its terminal's number, and Check says so.
    const c = p.conductors.find((x) => x.id === core.conductor)!;
    c.number = "999";
    expect(wireMarkers(p)).toContainEqual(expect.objectContaining({ text: term.tag, what: "core, panel end", wire: "999" }));
    expect(checkProject(p).map((f) => f.message)).toContain(`Sheet ${di.number}: wire 999 lands on terminal ${term.params.strip ?? "X1"}:${term.tag}, so its markers say ${term.tag}: Renumber to match`);
    renumber(p);
    expect(checkProject(p).some((f) => /so its markers say/.test(f.message))).toBe(false);
    // Grouped: each text and kind once, the counts adding up.
    const g = groupMarkers(wireMarkers(p));
    expect(g.reduce((a, x) => a + x.count, 0)).toBe(m.length);
    expect(g.find((x) => x.text === plant.DPS1!.tag && x.what === "core, field end")!.count).toBe(2);
  });

  test("Check: GA items outside the backplate or the door, or across a door's two leaves; schematic parts not on a layout sheet", () => {
    const { project: p } = fresh();
    const msgs = () => checkProject(p).map((f) => f.message);
    expect(msgs().filter((m) => /lies outside|across both leaves/.test(m))).toEqual([]);
    expect(msgs()).toContain("3 schematic parts aren't on a layout sheet, so aren't on the bill of materials (see the Layout workbench)");
    const back = p.pages.find((pg) => pg.ga?.view === "backplate")!;
    const rail = back.gaItems!.find((it) => it.kind === "rail")!;
    rail.w = 760;
    expect(msgs()).toContain(`Sheet ${back.number}: a DIN rail lies outside the backplate (800 × 1200 mm)`);
    rail.w = 640;
    const door = p.pages.find((pg) => pg.ga?.view === "door-front")!;
    door.ga!.leaves = [{ w: 400, hinge: "left" }, { w: 400, hinge: "right" }];
    const plateText = door.gaItems!.find((it) => it.kind === "label")!;
    plateText.x = 300;
    expect(msgs()).toContain(`Sheet ${door.number}: a label plate lies across both leaves of the door`);
    plateText.y = 1180;
    expect(msgs()).toContain(`Sheet ${door.number}: a label plate lies outside the door (800 × 1200 mm)`);
  });
});

describe("step 13: stamp links, Duplicate's step, label plate text (T6, T8, T12)", () => {
  test("stamping keeps a contact's link to a coil outside the template, and lists the arrows and contacts to link again", () => {
    const { project: p } = fresh();
    const src = p.pages.find((pg) => pg.title.includes("drives and dampers"))!;
    const outside = src.elements.filter((e) => masterOf(p, e) && !src.elements.some((x) => x.id === masterOf(p, e)!.el.id));
    expect(outside.length).toBe(5);
    const t = saveSheetTemplate(p, src.id, "Drives");
    const r = stampTemplate(p, t.id, {});
    expect(r.kept).toHaveLength(5);
    for (const k of r.kept) {
      const c = r.page.elements.find((e) => e.id === k.contact)!;
      expect(masterOf(p, c)!.el.id).toBe(k.coil);
      // Linked on both sides: the coil lists its new contact.
      expect(masterOf(p, c)!.el.links).toContain(c.id);
    }
    expect(r.kept.map((k) => k.coil).sort()).toEqual(outside.map((e) => masterOf(p, e)!.el.id).sort());
    // Into another project, where the coils aren't: the contacts are to link again.
    const q = newProject("Other");
    const r2 = stampTemplate(q, importTemplate(q, t).id, {});
    expect(r2.kept).toEqual([]);
    expect(r2.relink).toHaveLength(5);
    // An arrow with no partner in the stamp is listed too.
    const arrow = addElement(p, src.id, "link", [140, 30]);
    const r3 = stampTemplate(p, saveSheetTemplate(p, src.id, "Drives 2").id, {});
    expect(r3.relink).toHaveLength(1);
    expect(r3.page.elements.find((e) => e.id === r3.relink[0])!.symbol).toBe("link");
    expect(arrow.symbol).toBe("link");
  });

  test("Duplicate steps the last number, the first, or leaves tags blank for Renumber", () => {
    expect(stepTag("P1-12", 1)).toBe("P1-13");
    expect(stepTag("P1-12", 1, "first")).toBe("P2-12");
    expect(stepTag("AHU-01-SF-01", 1, "first")).toBe("AHU-02-SF-01");
    expect(stepTag("P1-12", 1, "blank")).toBe("");
    const { project: p, plant } = fresh();
    const first = duplicatePlant(p, [plant.TT1!.id], 1, 1, "first");
    expect(first.plant[0]!.tag).toBe("AHU-02-TT-01");
    const blank = duplicatePlant(p, [plant.TT1!.id], 2, 1, "blank");
    expect(blank.plant.map((x) => x.tag)).toEqual(["", ""]);
    expect(blank.untagged).toBe(0);
    expect(blank.plant.every((x) => !x.locked && x.prefix === plant.TT1!.prefix)).toBe(true);
  });

  test("a label plate's text sits at any of nine places; middle as before", () => {
    const box = { x: 10, y: 20, w: 100, h: 30 };
    expect(plateTextLayout(undefined, box, 5, 1, 2)).toEqual({ x: 60, anchor: "middle", ys: [35] });
    expect(plateTextLayout("top-left", box, 5, 1, 2)).toEqual({ x: 12, anchor: "start", ys: [24.5] });
    expect(plateTextLayout("bottom-right", box, 5, 2, 2)).toEqual({ x: 108, anchor: "end", ys: [39.25, 45.5] });
    expect(plateTextLayout("right", box, 5, 2, 2).ys).toEqual([31.875, 38.125]);
    const { project: p } = fresh();
    const door = p.pages.find((pg) => pg.ga?.view === "door-front")!;
    const plate = door.gaItems!.find((it) => it.kind === "label")!;
    updateGaItem(p, door.id, plate.id, { textAt: "top-left" });
    expect(plate.textAt).toBe("top-left");
    expect(parseProject(JSON.parse(JSON.stringify(p))).pages.find((pg) => pg.id === door.id)!.gaItems!.find((it) => it.id === plate.id)!.textAt).toBe("top-left");
    updateGaItem(p, door.id, plate.id, { textAt: undefined });
    expect(plate.textAt).toBeUndefined();
  });
});

describe("step 14: supply load in Simulate (M12)", () => {
  const setup = () => {
    const f = fresh();
    const { project: p } = f;
    const loads = p.pages.flatMap((pg) => pg.elements.filter((e) => e.symbol === "coil" || e.symbol === "lamp"));
    for (const e of loads) e.params.va = 1.5;
    return { ...f, loads };
  };
  const fig = (p: Project, state?: ReturnType<typeof initialState>) => {
    const c = compile(p);
    const r = supplyLoads(p, c, state ?? initialState(c));
    return { ...r, by: (name: RegExp) => r.supplies.find((x) => name.test(x.name))! };
  };

  test("worst case is everything a supply reaches; live is what's energised; a power supply's load passes up divided by its efficiency", () => {
    const { project: p, loads, modules } = setup();
    const r = fig(p);
    const psu = r.by(/24V out/);
    const mains = r.by(/SUPPLY/);
    // Every coil and lamp is on the 24 V DC side.
    expect(psu.worstVa).toBeCloseTo(loads.length * 1.5, 6);
    expect(mains.worstVa).toBeCloseTo(psu.worstVa / 0.85, 6);
    expect(psu.liveVa!).toBeLessThan(psu.worstVa);
    // The modules are carried by the controller's power supply module.
    for (const m of Object.values(modules)) setModuleVa(p, m.id, 3);
    expect(fig(p).by(/24V out/).worstVa).toBeCloseTo(loads.length * 1.5 + 6 * 3, 6);
    // A set efficiency.
    const out = p.plant.flatMap((x) => x.points ?? []).find((q) => q.name === "24V out")!;
    out.efficiency = 0.9;
    const r2 = fig(p);
    expect(r2.by(/SUPPLY/).worstVa).toBeCloseTo(r2.by(/24V out/).worstVa / 0.9, 6);
    // Amps at the supply's own voltage.
    expect(loadText(48, { v: 24, ac: false })).toBe("2.00 A");
    expect(loadText(12)).toBe("12 VA");
  });

  test("live follows the simulation; a device's draw is the default for parts that use it", () => {
    const { project: p, loads } = setup();
    const c = compile(p);
    const s = initialState(c);
    const before = supplyLoads(p, c, s).supplies.find((x) => /24V out/.test(x.name))!.liveVa!;
    // Switch something on: live goes up by what it energises, never past worst case.
    const changes = c.inputs.filter((i) => i.kind !== "press").map((i) => supplyLoads(p, c, toggle(c, s, i.el)).supplies.find((x) => /24V out/.test(x.name))!);
    expect(changes.some((x) => x.liveVa !== before)).toBe(true);
    for (const x of changes) expect(x.liveVa!).toBeLessThanOrEqual(x.worstVa + 1e-9);
    // A coil with no draw of its own takes its device's.
    const coil = loads.find((e) => e.symbol === "coil")!;
    p.devices = [{ id: "dev1", name: "Relay", maker: "", part: "", kind: "", w: 16, h: 80, d: 0, library: false, va: 0.6 }];
    coil.device = "dev1";
    const w0 = fig(p).by(/24V out/).worstVa;
    coil.params.va = 0;
    expect(fig(p).by(/24V out/).worstVa).toBeCloseTo(w0 - 1.5 + 0.6, 6);
  });

  test("a rating, red when over; parts with no draw counted in one line; old files have none of it", () => {
    const { project: p } = setup();
    const supply = p.pages.flatMap((pg) => pg.elements).find((e) => e.symbol === "supply")!;
    const msgs = () => checkProject(p).map((f) => f.message);
    expect(msgs()).toContain("7 parts have no draw set (coils, lamps, plant supply in, modules), so count as nothing in a supply's load");
    supply.params.ratingVa = 10;
    expect(fig(p).by(/SUPPLY/).ratingVa).toBe(10);
    expect(msgs().some((m) => /SUPPLY: worst case .* is over its rating/.test(m))).toBe(true);
    supply.params.ratingVa = 1000;
    expect(msgs().some((m) => /over its rating/.test(m))).toBe(false);
    // Point draws, ratings and efficiency, and a module's draw, are saved and read back.
    const out = p.plant.flatMap((x) => x.points ?? []).find((q) => q.name === "24V out")!;
    Object.assign(out, { ratingVa: 120, efficiency: 0.88 });
    const back = parseProject(JSON.parse(JSON.stringify(p)));
    expect(back.plant.flatMap((x) => x.points ?? []).find((q) => q.name === "24V out")).toMatchObject({ ratingVa: 120, efficiency: 0.88 });
    // A fresh fixture says no draws: no lines at all.
    const { project: q } = fresh();
    expect(checkProject(q).some((f) => /no draw set|over its rating/.test(f.message))).toBe(false);
  });
});

describe("step 15: wire colour by function, relay pins from the part (M3, M4)", () => {
  test("a wire with no colour takes its function's from the project's table; its function from its distribution, or set on the wire", () => {
    const { project: p } = fresh();
    // Empty table: every wire as before.
    const before = conductorLooks(p);
    for (const c of p.conductors) expect(before.get(c.id)?.colour).toBe(c.colour);
    expect(p.distributions.map(distributionFunction)).toEqual(["phase", "neutral", "24 V +", "0 V"]);
    expect(functionRows(p).slice(0, 8)).toEqual(["phase", "neutral", "earth", "24 V +", "0 V", "DC signal", "AC signal", "external supply"]);
    // 0 V by function: a wire on the 0V distribution with no colour of its own takes it.
    const zero = p.distributions.find((d) => d.kind === "dc0")!;
    const onZero = p.conductors.filter((c) => p.pages.some((pg) => pg.elements.some((e) => e.params.dist === zero.id && c.terminals.some(([id]) => id === e.id))));
    expect(onZero.length).toBeGreaterThan(0);
    const bare = onZero.find((c) => !c.colour) ?? onZero[0]!;
    delete bare.colour;
    setFunctionColour(p, "0 V", "bk");
    expect(p.wireColours).toEqual({ "0 V": "Bk" });
    expect(conductorLooks(p).get(bare.id)).toEqual({ func: "0 V", colour: "Bk", fromTable: true });
    // Its own colour wins.
    bare.colour = "Wh";
    expect(conductorLooks(p).get(bare.id)!.colour).toBe("Wh");
    // A function set on a wire that's on no distribution, matched without regard to case or spaces.
    const loose = p.conductors.find((c) => !onZero.includes(c) && !p.pages.some((pg) => pg.elements.some((e) => typeof e.params.dist === "string" && c.terminals.some(([id]) => id === e.id))))!;
    delete loose.colour;
    loose.function = "dc signal";
    setFunctionColour(p, "DC signal", "Og");
    expect(conductorLooks(p).get(loose.id)).toMatchObject({ func: "dc signal", colour: "Og", fromTable: true });
    // Saved and read back; cleared.
    expect(parseProject(JSON.parse(JSON.stringify(p))).wireColours).toEqual({ "0 V": "Bk", "DC signal": "Og" });
    setFunctionColour(p, "0 v", "");
    setFunctionColour(p, "DC signal", "");
    expect(p.wireColours).toBeUndefined();
  });

  test("a relay whose device has a pin map prints its own numbers on its coil, its contacts and its contact table", () => {
    const { project: p } = fresh();
    const coil = p.pages.flatMap((pg) => pg.elements).find((e) => e.symbol === "coil" && slavesOf(p, e).length === 4)!;
    const iec = contactTable(p, coil).map((r) => r[1]);
    expect(iec).toEqual(["13-14", "23-24", "33-34", "43-44"]);
    expect(relayPinMarks(p, coil)).toBeUndefined();
    const pins = parseRelayPins("13 14 | 9 1 5 | 10 2 6 | 11 3 7 | 12 4 8")!;
    expect(formatRelayPins(pins)).toBe("13 14 | 9 1 5 | 10 2 6 | 11 3 7 | 12 4 8");
    expect(() => parseRelayPins("A1 | 11 12 14")).toThrow(/coil/);
    p.devices = [{ id: "rly", name: "Relay 4CO", maker: "", part: "", kind: "relay", w: 27, h: 80, d: 0, library: false, relayPins: pins }];
    coil.device = "rly";
    expect(elementTexts(coil, p).pins).toEqual({ A1: "13", A2: "14" });
    expect(contactTable(p, coil).map((r) => r[1])).toEqual(["9-5", "10-6", "11-7", "12-8"]);
    // Drawn on the coil and the contact in place of A1/A2 and 13/14; terminal names unchanged.
    const texts = (e: Element) => localGeometry(e, elementTexts(e, p)).prims.flatMap((x) => (x.t === "text" ? [x.text] : []));
    expect(texts(coil)).toEqual(expect.arrayContaining(["13", "14"]));
    expect(texts(coil)).not.toContain("A1");
    const contact = slavesOf(p, coil).find((s) => s.el.params.pole === 2)!.el;
    expect(texts(contact)).toEqual(expect.arrayContaining(["10", "6"]));
    expect(terminalNames(contact)).toEqual(["13", "14"]);
    // Saved and read back.
    expect(parseProject(JSON.parse(JSON.stringify(p))).devices![0]!.relayPins).toEqual(pins);
    // No map: IEC as before.
    coil.device = undefined;
    expect(contactTable(p, coil).map((r) => r[1])).toEqual(iec);
  });
});

describe("§13 tests to add: timed contacts", () => {
  test("NC and changeover contacts on a timer print 15-16 and 15-16/18 with the delay mark, the coil's table matching; unlinked they're plain again", () => {
    const p = newProject("t");
    const pg = p.pages[0]!.id;
    const t = addElement(p, pg, "coil", [20, 70], { params: { type: "timer", mode: "off", time: "5s" } });
    const nc = addElement(p, pg, "contact", [40, 30], { params: { contact: "nc" } });
    const co = addElement(p, pg, "contact", [60, 30], { params: { contact: "co" } });
    linkContact(p, nc.id, t.id);
    linkContact(p, co.id, t.id);
    const marks = (el: Element) => localGeometry(el, elementTexts(el, p)).prims.flatMap((x) => (x.t === "text" ? [x.text] : []));
    const arcs = (el: Element) => localGeometry(el, elementTexts(el, p)).prims.filter((x) => x.t === "arc").length;
    expect(contactTable(p, t).map((r) => r[1])).toEqual(["15-16", "15-16/18"]);
    expect(marks(nc)).toEqual(expect.arrayContaining(["15", "16"]));
    expect(marks(co)).toEqual(expect.arrayContaining(["15", "16", "18"]));
    expect([arcs(nc), arcs(co)]).toEqual([1, 1]);
    // An off-delay's arc faces the other way from an on-delay's: the drawing follows the function.
    const off = localGeometry(nc, elementTexts(nc, p)).prims.find((x) => x.t === "arc");
    t.params.mode = "on";
    const on = localGeometry(nc, elementTexts(nc, p)).prims.find((x) => x.t === "arc");
    expect(JSON.stringify(on)).not.toBe(JSON.stringify(off));
    // Unlinked: a plain contact, IEC marks, no delay mark.
    linkContact(p, nc.id, null);
    expect(arcs(nc)).toBe(0);
    expect(marks(nc)).toEqual(expect.arrayContaining(["21", "22"]));
    expect(contactTable(p, t).map((r) => r[1])).toEqual(["15-16/18"]);
  });
});
