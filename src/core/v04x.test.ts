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
import { newProject, type Element, type Project } from "./model";
import { labelBlockRect, localGeometry, moduleViewLayout, plantViewLayout, terminalPoint, wrapTag, wrapTitle } from "./symbols";
import { elementTexts } from "./tags";
import { textWidth } from "./textwidth";
import { AREA_UNITS, textUnits } from "./geometry";
import { moduleTitle, viewsOf } from "./modules";
import { addElement, addPlant, deletePlant, linkContact, setGroupSide, setViewSide, setViewSpan, setWireTextAt, moveElements, placePlantView, addGaDim, addGaItem, addGaPage, addPlatesForDoors, joinDoorBelow, setPlateBehind, setBoundary, setGaSettings, splitDoor, updateElement } from "./ops";
import { earthConductors, fractionAlong, isFieldWire, numberByDefault, pointAlong, wireTexts } from "./wires";
import { routePage } from "./routing";
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
    const c = addElement(p, pg, "contact-no", [40, 30]);
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

  test("T13: a wire's number slides along its own wire, and the fraction survives a re-route", () => {
    const pts: [number, number][] = [[0, 0], [0, 10], [20, 10]];
    expect(pointAlong(pts, 0.5).at).toEqual([5, 10]);
    expect(fractionAlong(pts, [5, 12])).toBeCloseTo(0.5);
    const t = wireTexts(pts, { number: "3-12", numberAt: 0.25 });
    expect(t.length).toBe(1);
    // On the first leg, vertical, centred at y 7.5 beside it.
    expect(t[0]!.vertical).toBe(true);
    expect(t[0]!.at[1]).toBeCloseTo(7.5);
    const { project: p } = fresh();
    const pg = p.pages[1]!;
    const seg = pg.segments[0]!;
    setWireTextAt(p, pg.id, seg.id, { numberAt: 0.8, colourAt: 2 });
    expect([seg.numberAt, seg.colourAt]).toEqual([0.8, 1]);
    routePage(AvoidLib.getInstance(), pg);
    expect(seg.numberAt).toBe(0.8);
    const back = parseProject(JSON.parse(JSON.stringify(p)));
    expect(back.pages[1]!.segments[0]!.numberAt).toBe(0.8);
    setWireTextAt(p, pg.id, seg.id, { numberAt: null, colourAt: null });
    expect(seg.numberAt).toBeUndefined();
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
