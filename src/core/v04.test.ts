/**
 * v0.4 (docs/design-v0.4.md): the Design model.
 */
import { describe, expect, test } from "bun:test";
import { AvoidLib } from "libavoid-js";
import { buildLsp01 } from "../bench/lsp01";
import { checkProject } from "./checks";
import { addController, addModule, deleteController, generateModule } from "./controllers";
import { acceptSuggestion, suggestAllocation, addInterlock, deleteInterlock, updateInterlock, needsPins, suggestPins, toDraw, channelLabel, channelsFor, noChannelReason, unallocated, designTemplateOf, duplicatePlant, insertDesignTemplate, stepTag, tagPlan, templateCounts, addDesignPlant, addDesignPoint, addSystem, allocate, channelsOf, deleteDesignPoint, deleteSystem, moveSystem, movePlant, needsLine, pointOnChannel, pointType, renameSystem, setPlantDesign, systemGroups, updateDesignPoint } from "./design";
import { newProject, type IoPoint, type Project } from "./model";
import { defaultPattern } from "./modules";
import { addElement, addPage, addPlant, connect, deletePlant, linkContact, placePlantView, setQuickEntry, updatePin, updatePlant, updatePoint } from "./ops";
import { refreshConductors } from "./conductors";
import { elementTexts } from "./tags";
import { localGeometry } from "./symbols";
import { confirmWiring, wiringOf } from "./wiring";
import { placeNetworkSheet, addNetwork, deleteNetwork, devicesOn, moveOnNetwork, networkData, networkDiagram, putOnNetwork, updateNetwork } from "./network";
import { circuitKey, describeInterlock, interlockStatus, proveInterlocks } from "./interlocks";
import { setExpectation, deleteExpectation } from "./ops";
import { designChecks } from "./checks";
import { POINTS_COLS, ioSchedule, pointsSchedule, toCsv } from "./schedules";
import { saveSheetTemplate } from "./templates";
import { parseDesignTemplate, parseProject } from "./validate";

const roundTrip = (p: Project) => parseProject(JSON.parse(JSON.stringify(p)));

await AvoidLib.load();

/** A panel with one controller: a DI-4, a DO-2 and a UIO-2 module. */
function panel() {
  const p = newProject("t");
  const c = addController(p, "Panel controller");
  const di = addModule(p, c.id, { type: "di", channels: 4 });
  const dout = addModule(p, c.id, { type: "do", channels: 2 });
  const uio = addModule(p, c.id, { type: "uio", channels: 2 });
  return { p, c, di, dout, uio };
}

/** Field plant with pinless points, as Design makes it. */
function pump(p: Project, tag: string, points: Partial<IoPoint>[]) {
  return addPlant(p, tag, "Pump", [], { points: points.map((q) => ({ name: "", form: "contact", pins: [], ...q }) as IoPoint) });
}

describe("old files open unchanged (design-v0.4 §8)", () => {
  test("the example project parses to exactly itself", () => {
    const { project } = buildLsp01(AvoidLib.getInstance());
    const once = roundTrip(project);
    expect(roundTrip(once)).toEqual(once);
    expect(once.plant).toEqual(project.plant);
    expect(once.expectations).toEqual(project.expectations);
    expect(once.systems).toBeUndefined();
    expect(once.networks).toBeUndefined();
  });
  test("a v0.3 file with no Design fields gains none", () => {
    const { p } = panel();
    addPlant(p, "SF-01", "Supply fan", ["1", "2"], { points: [{ name: "Run", form: "contact", pins: ["1", "2"] }] });
    const back = roundTrip(p);
    const sf = back.plant.find((x) => x.tag === "SF-01")!;
    expect(Object.keys(sf).sort()).toEqual(["description", "id", "locked", "points", "prefix", "tag", "terminals"]);
    expect(Object.keys(sf.points![0]!).sort()).toEqual(["form", "name", "pins"]);
  });
});

describe("the Design fields round-trip (§2, §4, §6, §7)", () => {
  test("plant: system, connects-by, protocol, network, enabled-by, source, interlocks", () => {
    const p = newProject("t");
    p.networks = [{ id: "n1", name: "BMS LAN", protocol: "BACnet IP", kind: "lan" }];
    const ef = pump(p, "EF1", [{ name: "Enable", form: "dry-in", signal: "volt-free", goesTo: "relay" }, { name: "Fault", form: "contact" }]);
    Object.assign(ef, {
      system: "Ventilation",
      connects: "both",
      protocol: "BACnet IP",
      network: "n1",
      enabledBy: "ventilation time zone",
      source: "Section 4.2",
      interlocks: [{ id: "il1", point: "Enable", when: [{ ref: `plant:${ef.id}:Fault`, on: true }] }],
    });
    p.expectations.push({ id: "x1", kind: "never", when: [{ ref: `plant:${ef.id}:Enable`, on: true }, { ref: `plant:${ef.id}:Fault`, on: true }], join: "and", interlock: "il1" });
    const back = roundTrip(p);
    const b = back.plant[0]!;
    expect(b.system).toBe("Ventilation");
    expect(b.connects).toBe("both");
    expect(b.protocol).toBe("BACnet IP");
    expect(b.network).toBe("n1");
    expect(b.enabledBy).toBe("ventilation time zone");
    expect(b.source).toBe("Section 4.2");
    expect(b.interlocks).toEqual(ef.interlocks);
    expect(b.points!.map((q) => [q.name, q.pins, q.signal, q.goesTo])).toEqual([
      ["Enable", [], "volt-free", "relay"],
      ["Fault", [], undefined, undefined],
    ]);
    expect(back.systems).toEqual(["Ventilation"]);
    expect(back.networks).toEqual(p.networks);
    expect(back.expectations[0]!.interlock).toBe("il1");
  });
  test("systems keep their order, and an empty one stays listed", () => {
    const p = newProject("t");
    p.systems = ["Chilled water", "Ventilation"];
    pump(p, "P1", []).system = "Heating";
    expect(roundTrip(p).systems).toEqual(["Chilled water", "Ventilation", "Heating"]);
  });
  test("references to what's gone are let go, never guessed", () => {
    const p = newProject("t");
    const ef = pump(p, "EF1", [{ name: "Enable", form: "dry-in", channel: { module: "nope", point: "DO1" } }]);
    ef.network = "missing";
    ef.interlocks = [{ id: "il1", point: "Gone", when: [{ ref: "x", on: true }] }];
    p.expectations.push({ id: "x1", kind: "never", when: [{ ref: "x", on: true }], interlock: "il1" });
    const back = roundTrip(p);
    expect(back.plant[0]!.network).toBeUndefined();
    expect(back.plant[0]!.points![0]!.channel).toBeUndefined();
    expect(back.plant[0]!.interlocks).toBeUndefined();
    // A generated expectation goes with its interlock (step 8: it follows it).
    expect(back.expectations).toHaveLength(0);
  });
});

describe("points without pins (§2)", () => {
  test("a point made with no pins is kept through edits; one that loses its pins goes, as before", () => {
    const p = newProject("t");
    const it = addPlant(p, "P1", "Pump", ["1", "2", "3"], {
      points: [
        { name: "Run", form: "contact", pins: ["1", "2"] },
        { name: "Fault", form: "contact", pins: [] },
      ],
    });
    expect(it.points!.map((q) => q.name)).toEqual(["Run", "Fault"]);
    updatePlant(p, it.id, { description: "Primary pump" });
    expect(it.points!.map((q) => q.name)).toEqual(["Run", "Fault"]);
    // Moving Run's pins to another point: Run goes, Fault (never pinned) stays.
    updatePin(p, it.id, "1", { point: "Trip" });
    updatePin(p, it.id, "2", { point: "Trip" });
    expect(it.points!.map((q) => [q.name, q.pins])).toEqual([
      ["Fault", []],
      ["Trip", ["1", "2"]],
    ]);
    // Pins taken off the device: Trip goes with them; Fault stays.
    updatePlant(p, it.id, { terminals: ["3"] });
    expect(it.points!.map((q) => q.name)).toEqual(["Fault"]);
  });
  test("Check doesn't call a point with no pins unwired: it isn't drawn yet", () => {
    const p = newProject("t");
    pump(p, "P1", [{ name: "Enable", form: "dry-in" }]);
    expect(checkProject(p).filter((f) => /Enable/.test(f.message))).toEqual([]);
  });
});

describe("type, Needs and allocation (§2, §4)", () => {
  test("the type is what the controller needs, from the plant's side", () => {
    expect(pointType("contact")).toBe("DI");
    expect(pointType("dry-in")).toBe("DO");
    expect(pointType("powered-in")).toBe("DO");
    expect(pointType("analogue-out")).toBe("AI");
    expect(pointType("analogue-in")).toBe("AO");
    expect(pointType("supply-in")).toBeUndefined();
    expect(pointType("comms")).toBeUndefined();
  });
  test("Needs counts points that go to a channel; Have the channels; universal channels cover a shortfall", () => {
    const { p } = panel();
    pump(p, "P1", [
      { name: "Run", form: "contact" },
      { name: "Fault", form: "contact", goesTo: "relay" },
      { name: "Trip", form: "contact", goesTo: "panel" },
      { name: "Enable", form: "dry-in" },
      { name: "Speed", form: "analogue-in" },
      { name: "Mains", form: "supply-in" },
    ]);
    const n = needsLine(p);
    expect(n.needs).toEqual({ DI: 2, DO: 1, AI: 0, AO: 1, UIO: 0 });
    expect(n.have).toEqual({ DI: 4, DO: 2, AI: 0, AO: 0, UIO: 2 });
    expect(n.spare).toEqual({ DI: 2, DO: 1, AI: 0, AO: 0, UIO: 1 });
    // Before a controller exists, Needs alone answers how many modules.
    const q = newProject("u");
    pump(q, "P1", Array.from({ length: 3 }, (_, i) => ({ name: `F${i}`, form: "contact" as const })));
    expect(needsLine(q).spare.DI).toBe(-3);
  });
  test("a channel takes only a point it can serve, one at a time; panel-only takes none", () => {
    const { p, di, dout, uio } = panel();
    const pu = pump(p, "P1", [
      { name: "Fault", form: "contact" },
      { name: "Run", form: "contact" },
      { name: "Enable", form: "dry-in" },
      { name: "Trip", form: "contact", goesTo: "panel" },
    ]);
    allocate(p, pu.id, "Fault", { module: di.id, point: "DI1" });
    expect(pu.points![0]!.channel).toEqual({ module: di.id, point: "DI1" });
    expect(pointOnChannel(p, { module: di.id, point: "DI1" })?.point.name).toBe("Fault");
    expect(() => allocate(p, pu.id, "Run", { module: di.id, point: "DI1" })).toThrow(/already has Fault/);
    expect(() => allocate(p, pu.id, "Enable", { module: di.id, point: "DI2" })).toThrow(/needs a DO/);
    expect(() => allocate(p, pu.id, "Trip", { module: di.id, point: "DI2" })).toThrow(/panel only/);
    allocate(p, pu.id, "Enable", { module: dout.id, point: "DO1" });
    allocate(p, pu.id, "Run", { module: uio.id, point: "IO1" });
    // Moving a point is allocating it again; null takes it off.
    allocate(p, pu.id, "Fault", { module: di.id, point: "DI2" });
    expect(pointOnChannel(p, { module: di.id, point: "DI1" })).toBeUndefined();
    allocate(p, pu.id, "Fault", null);
    expect(pu.points![0]!.channel).toBeUndefined();
    expect(channelsOf(p)).toHaveLength(8);
    expect(roundTrip(p).plant.find((x) => x.tag === "P1")!.points!.map((q) => q.channel?.point)).toEqual([undefined, "IO1", "DO1", undefined]);
  });
  test("allocations follow a channel renamed, and go with a channel, module or controller that goes", () => {
    const { p, c, di } = panel();
    const pu = pump(p, "P1", [{ name: "Fault", form: "contact" }, { name: "Run", form: "contact" }]);
    allocate(p, pu.id, "Fault", { module: di.id, point: "DI1" });
    allocate(p, pu.id, "Run", { module: di.id, point: "DI4" });
    // Renamed by editing the module's points: same pins, new name.
    updatePlant(p, di.id, { points: di.points!.map((q) => (q.name === "DI1" ? { ...q, name: "In1" } : q)) });
    expect(pu.points![0]!.channel).toEqual({ module: di.id, point: "In1" });
    // Regenerated with two channels: DI4 has gone.
    generateModule(p, di.id, { ...defaultPattern("di", 2) });
    expect(pu.points![1]!.channel).toBeUndefined();
    allocate(p, pu.id, "Run", { module: di.id, point: "DI2" });
    deletePlant(p, di.id);
    expect(pu.points!.every((q) => !q.channel)).toBe(true);
    const { p: p2, c: c2, dout } = panel();
    const pu2 = pump(p2, "P1", [{ name: "Enable", form: "dry-in" }]);
    allocate(p2, pu2.id, "Enable", { module: dout.id, point: "DO1" });
    deleteController(p2, c2.id);
    expect(pu2.points![0]!.channel).toBeUndefined();
    expect(c.slots.length).toBeGreaterThan(0);
  });
  test("a Draft template carries plant but no allocation", () => {
    const { p, di } = panel();
    const pu = pump(p, "P1", [{ name: "Fault", form: "contact" }]);
    allocate(p, pu.id, "Fault", { module: di.id, point: "DI1" });
    pu.terminals = ["1", "2"];
    pu.points![0]!.pins = ["1", "2"];
    const { placePlantView } = require("./ops") as typeof import("./ops");
    placePlantView(p, p.pages[0]!.id, pu.id, [20, 40]);
    const t = saveSheetTemplate(p, p.pages[0]!.id, "Pump sheet");
    expect(t.plant.find((x) => x.id === pu.id)!.points![0]!.channel).toBeUndefined();
    expect(pu.points![0]!.channel).toBeDefined();
  });
});

describe("the Design table (§2, §3)", () => {
  test("systems: added with a free name, renamed with their plant, moved, and removed leaving their plant", () => {
    const p = newProject("t");
    expect(addSystem(p)).toBe("System 1");
    expect(addSystem(p, "Ventilation")).toBe("Ventilation");
    expect(() => addSystem(p, "Ventilation")).toThrow(/already/);
    const a = addDesignPlant(p, "System 1");
    renameSystem(p, "System 1", "Chilled water");
    expect(a.system).toBe("Chilled water");
    moveSystem(p, "Ventilation", -1);
    expect(p.systems).toEqual(["Ventilation", "Chilled water"]);
    deleteSystem(p, "Chilled water");
    expect(a.system).toBeUndefined();
    expect(p.plant).toContain(a);
    // Plant with no system sits in the unnamed group, after the systems.
    expect(systemGroups(p).map((g) => [g.name, g.plant.length])).toEqual([["Ventilation", 0], ["", 1]]);
  });
  test("+ Plant goes after the picked plant, or at the end of its system; modules aren't table rows", () => {
    const { p } = panel();
    addSystem(p, "A");
    addSystem(p, "B");
    const a1 = addDesignPlant(p, "A");
    const b1 = addDesignPlant(p, "B");
    const a2 = addDesignPlant(p, "A");
    const a3 = addDesignPlant(p, "A", a1.id);
    expect(systemGroups(p).map((g) => g.plant.map((x) => x.id))).toEqual([[a1.id, a3.id, a2.id], [b1.id]]);
    movePlant(p, a2.id, b1.id);
    expect(a2.system).toBe("B");
    expect(systemGroups(p)[1]!.plant.map((x) => x.id)).toEqual([b1.id, a2.id]);
    expect(() => addDesignPlant(p, "C")).toThrow(/No system/);
  });
  test("+ Point: a form, a name and a signal, no pins; names stay unique", () => {
    const p = newProject("t");
    const it = addDesignPlant(p);
    expect(addDesignPoint(p, it.id, { name: "fault", form: "contact", signal: "volt-free" })).toEqual({ name: "fault", form: "contact", pins: [], signal: "volt-free" });
    expect(addDesignPoint(p, it.id, { form: "dry-in" }).name).toBe("Point 2");
    expect(() => addDesignPoint(p, it.id, { name: "fault", form: "contact" })).toThrow(/already has/);
  });
  test("a point renamed carries its references; a form or goes-to its channel can't serve lets the channel go", () => {
    const { p, di } = panel();
    const it = addDesignPlant(p);
    addDesignPoint(p, it.id, { name: "fault", form: "contact" });
    allocate(p, it.id, "fault", { module: di.id, point: "DI1" });
    p.expectations.push({ id: "x", kind: "never", when: [{ ref: `plant:${it.id}:fault`, on: true }] });
    updateDesignPoint(p, it.id, "fault", { name: "trip", signal: "volt-free" });
    expect(p.expectations[0]!.when[0]!.ref).toBe(`plant:${it.id}:trip`);
    expect(it.points![0]!.channel?.point).toBe("DI1");
    updateDesignPoint(p, it.id, "trip", { goesTo: "relay" });
    expect(it.points![0]!.channel?.point).toBe("DI1");
    updateDesignPoint(p, it.id, "trip", { form: "dry-in" });
    expect(it.points![0]!.channel).toBeUndefined();
    allocate(p, it.id, "trip", { module: p.plant.find((x) => x.module?.type === "do")!.id, point: "DO1" });
    updateDesignPoint(p, it.id, "trip", { goesTo: "panel" });
    expect(it.points![0]!.channel).toBeUndefined();
    deleteDesignPoint(p, it.id, "trip");
    expect(it.points).toBeUndefined();
  });
  test("plant fields set and cleared; a network must exist", () => {
    const p = newProject("t");
    const it = addDesignPlant(p);
    setPlantDesign(p, it.id, { connects: "comms", protocol: "Modbus RTU", enabledBy: "time zone", source: "4.2" });
    expect([it.connects, it.protocol, it.enabledBy, it.source]).toEqual(["comms", "Modbus RTU", "time zone", "4.2"]);
    setPlantDesign(p, it.id, { connects: "hardwired", source: "" });
    expect(it.connects).toBeUndefined();
    expect(it.source).toBeUndefined();
    expect(() => setPlantDesign(p, it.id, { network: "n9" })).toThrow(/network/);
  });
});

describe("Duplicate ×n and Design templates (§3)", () => {
  function pumps() {
    const { p, di } = panel();
    addSystem(p, "Chilled water");
    const p1 = addDesignPlant(p, "Chilled water");
    p1.tag = "P1";
    addDesignPoint(p, p1.id, { name: "enable", form: "powered-in", signal: "24 V" });
    addDesignPoint(p, p1.id, { name: "fault", form: "contact" });
    const f1 = addDesignPlant(p, "Chilled water");
    f1.tag = "FS1";
    addDesignPoint(p, f1.id, { name: "flow", form: "contact" });
    // A link within the group (the pump's enable follows the flow switch) and one outside it.
    p1.points![0]!.follows = [{ ref: `plant:${f1.id}:flow`, on: true }, { ref: "plant:elsewhere:x", on: true }];
    f1.interlocks = [{ id: "il1", point: "flow", when: [{ ref: `plant:${p1.id}:fault`, on: true }] }];
    allocate(p, p1.id, "fault", { module: di.id, point: "DI1" });
    return { p, p1, f1 };
  }
  test("tags step on their last number, keeping zeros; no number, no tag", () => {
    expect(stepTag("P1", 1)).toBe("P2");
    expect(stepTag("AHU-01", 3)).toBe("AHU-04");
    expect(stepTag("FCU1-2", 1)).toBe("FCU1-3");
    expect(stepTag("FA", 1)).toBe("");
    expect(stepTag("", 1)).toBe("");
  });
  test("one item: n copies after it, tags stepping, points with it but not its channel", () => {
    const { p, p1 } = pumps();
    const r = duplicatePlant(p, [p1.id], 3, 1);
    expect(r.plant.map((x) => x.tag)).toEqual(["P2", "P3", "P4"]);
    expect(systemGroups(p)[0]!.plant.map((x) => x.tag)).toEqual(["P1", "P2", "P3", "P4", "FS1"]);
    expect(r.plant[0]!.system).toBe("Chilled water");
    expect(r.plant[0]!.points!.map((q) => [q.name, q.signal, q.channel])).toEqual([["enable", "24 V", undefined], ["fault", undefined, undefined]]);
    expect(p1.points![1]!.channel).toBeDefined();
  });
  test("a group: copies follow each other, not the originals; links outside the group stay", () => {
    const { p, p1, f1 } = pumps();
    const r = duplicatePlant(p, [p1.id, f1.id], 1, 1);
    const [p2, f2] = r.plant;
    expect([p2!.tag, f2!.tag]).toEqual(["P2", "FS2"]);
    expect(p2!.points![0]!.follows).toEqual([{ ref: `plant:${f2!.id}:flow`, on: true }, { ref: "plant:elsewhere:x", on: true }]);
    expect(f2!.interlocks![0]!.when[0]!.ref).toBe(`plant:${p2!.id}:fault`);
    expect(f2!.interlocks![0]!.id).not.toBe("il1");
  });
  test("a taken tag is left empty, and counted", () => {
    const { p, p1 } = pumps();
    const p3 = addDesignPlant(p, "Chilled water");
    p3.tag = "P3";
    expect(tagPlan(p, ["P1"], 3, 1, 1).map((c) => c[0])).toEqual([{ tag: "P2", taken: false }, { tag: "P3", taken: true }, { tag: "P4", taken: false }]);
    const r = duplicatePlant(p, [p1.id], 3, 1);
    expect(r.plant.map((x) => x.tag)).toEqual(["P2", "", "P4"]);
    expect(r.untagged).toBe(1);
  });
  test("a template keeps rows without channel, module or system; inserting makes ordinary rows in the system chosen", () => {
    const { p, p1, f1 } = pumps();
    const t = designTemplateOf(p, [f1.id, p1.id], "Pump, flow proved");
    expect(t.plant.map((x) => x.tag)).toEqual(["P1", "FS1"]);
    expect(t.plant.every((x) => !x.system && !x.module && (x.points ?? []).every((q) => !q.channel))).toBe(true);
    expect(templateCounts(t).total).toEqual({ DI: 2, DO: 1, AI: 0, AO: 0, UIO: 0 });
    // Into another project: the first copy has the template's tags, the next steps on.
    const q = newProject("u");
    addSystem(q, "Secondary");
    const r = insertDesignTemplate(q, parseDesignTemplate(JSON.parse(JSON.stringify(t))), { system: "Secondary", copies: 2, step: 1 });
    expect(r.plant.map((x) => x.tag)).toEqual(["P1", "FS1", "P2", "FS2"]);
    expect(r.plant.every((x) => x.system === "Secondary")).toBe(true);
    // Nothing links back: editing the template afterwards changes nothing inserted.
    t.plant[0]!.description = "changed";
    expect(r.plant[0]!.description).not.toBe("changed");
    expect(() => insertDesignTemplate(q, t, { system: "Nope" })).toThrow(/No system/);
  });
});

describe("the Controller view's lists (§4)", () => {
  test("unallocated: points that go to a channel and have none; channels offered: the right type, free, in rail order", () => {
    const { p, di, uio } = panel();
    const pu = pump(p, "P1", [
      { name: "fault", form: "contact" },
      { name: "trip", form: "contact", goesTo: "panel" },
      { name: "speed", form: "analogue-in" },
      { name: "flow", form: "contact", goesTo: "relay" },
    ]);
    expect(unallocated(p).map((u) => u.point.name)).toEqual(["fault", "speed", "flow"]);
    const fault = pu.points![0]!;
    expect(channelsFor(p, fault).map((c) => `${c.module.id === di.id ? "di" : "uio"} ${c.channel.name}`)).toEqual(["di DI1", "di DI2", "di DI3", "di DI4", "uio IO1", "uio IO2"]);
    allocate(p, pu.id, "fault", { module: di.id, point: "DI1" });
    allocate(p, pu.id, "flow", { module: di.id, point: "DI2" });
    expect(unallocated(p).map((u) => u.point.name)).toEqual(["speed"]);
    // Its own channel is still offered; another's isn't.
    expect(channelsFor(p, fault)[0]!.channel.name).toBe("DI1");
    expect(channelsFor(p, pu.points![3]!).map((c) => c.channel.name)).not.toContain("DI1");
    // An AO only a universal channel can take.
    expect(channelsFor(p, pu.points![2]!).map((c) => c.module.id)).toEqual([uio.id, uio.id]);
    expect(noChannelReason(p, pu.points![2]!)).toBeUndefined();
    expect(channelsFor(p, pu.points![1]!)).toEqual([]);
  });
  test("why a point can't go anywhere: no channels of its type, or every one taken", () => {
    const p = newProject("t");
    const c = addController(p, "Panel controller");
    const di = addModule(p, c.id, { type: "di", channels: 1 });
    const pu = pump(p, "P1", [{ name: "a", form: "contact" }, { name: "b", form: "contact" }, { name: "speed", form: "analogue-in" }]);
    expect(noChannelReason(p, pu.points![2]!)).toBe("the panel has no analogue outputs");
    allocate(p, pu.id, "a", { module: di.id, point: "DI1" });
    expect(noChannelReason(p, pu.points![1]!)).toBe("every DI channel is taken");
  });
});

describe("labels follow points (§4)", () => {
  test("a channel's label is its point's tag and name; with no point, a typed label is kept; drawn views and the IO schedule agree", () => {
    const { p, di } = panel();
    placePlantView(p, p.pages[0]!.id, di.id, [10, 4]);
    updatePoint(p, di.id, "DI2", { label: "Spare, typed" });
    const pu = pump(p, "DPS1", [{ name: "flow", form: "contact" }]);
    pu.tag = "DPS1";
    allocate(p, pu.id, "flow", { module: di.id, point: "DI1" });
    const ch = (n: string) => di.points!.find((q) => q.name === n)!;
    expect(channelLabel(p, di, ch("DI1"))).toBe("DPS1 flow");
    expect(channelLabel(p, di, ch("DI2"))).toBe("Spare, typed");
    const view = p.pages[0]!.elements.find((e) => e.symbol === "plant-view")!;
    const label = (pin: string) => (JSON.parse(String(view.params.ppins)) as string[][]).find((r) => r[0] === pin)!.at(-1);
    expect(label(ch("DI1").pins[0]!)).toBe("DPS1 flow");
    expect(ioSchedule(p).find((r) => r.point.endsWith("DI1"))!.label).toBe("DPS1 flow");
    // The plant renamed: the label follows. Taken off: back to what was typed (nothing here).
    updatePlant(p, pu.id, { tag: "FS1" });
    expect(label(ch("DI1").pins[0]!)).toBe("FS1 flow");
    updateDesignPoint(p, pu.id, "flow", { name: "proved" });
    expect(label(ch("DI1").pins[0]!)).toBe("FS1 proved");
    allocate(p, pu.id, "proved", null);
    expect(label(ch("DI1").pins[0]!)).toBe("");
    expect(label(ch("DI2").pins[0]!)).toBe("Spare, typed");
  });
});

describe("To draw (§8)", () => {
  test("lists field plant and modules with where they're drawn; nothing drawn yet is what's left", () => {
    const { p, di, dout } = panel();
    addSystem(p, "A");
    const a = addDesignPlant(p, "A");
    const b = addDesignPlant(p);
    b.terminals = ["1", "2"];
    placePlantView(p, p.pages[0]!.id, b.id, [20, 50]);
    placePlantView(p, p.pages[0]!.id, dout.id, [10, 4]);
    const t = toDraw(p);
    expect(t.plant.map((x) => [x.item.id, x.sheets])).toEqual([[a.id, []], [b.id, [1]]]);
    expect(t.modules.map((x) => [x.item.id, x.sheets.length])).toEqual([[di.id, 0], [dout.id, 1], [p.plant.find((x) => x.module?.type === "uio")!.id, 0]]);
  });
  test("pins for a point with none are suggested, numbered on from its highest; given, the plant keeps its Design data", () => {
    const { p, di } = panel();
    const it = addPlant(p, "P1", "Pump", ["L", "N", "E", "7"], { points: [{ name: "Mains", form: "supply-in", pins: ["L", "N", "E"] }] });
    addDesignPoint(p, it.id, { name: "enable", form: "powered-in", signal: "24 V" });
    addDesignPoint(p, it.id, { name: "fault", form: "contact", signal: "volt-free" });
    allocate(p, it.id, "fault", { module: di.id, point: "DI1" });
    expect(needsPins(it)).toBe(true);
    expect(suggestPins(it)).toBe("Mains: L N E | 7 | enable: 8 9 | fault: 10 11");
    setQuickEntry(p, it.id, "Mains: L N E | enable: 8 9 | fault: 11 14");
    expect(needsPins(it)).toBe(false);
    expect(it.points!.map((q) => [q.name, q.form, q.pins, q.signal, q.channel?.point])).toEqual([
      ["Mains", "supply-in", ["L", "N", "E"], undefined, undefined],
      ["enable", "powered-in", ["8", "9"], "24 V", undefined],
      ["fault", "contact", ["11", "14"], "volt-free", "DI1"],
    ]);
  });
  test("a quick-entry edit in Draft keeps points that have no pins yet", () => {
    const p = newProject("t");
    const it = addPlant(p, "P1", "Pump", ["1", "2"], { points: [{ name: "run", form: "contact", pins: ["1", "2"] }] });
    addDesignPoint(p, it.id, { name: "fault", form: "contact" });
    setQuickEntry(p, it.id, "run: 1 2 3");
    expect(it.points!.map((q) => [q.name, q.pins])).toEqual([["run", ["1", "2", "3"]], ["fault", []]]);
    expect(needsPins(addDesignPlant(p))).toBe(true);
  });
});

describe("checks: a point wired to its channel (§5)", () => {
  /** A flow switch and a DI module drawn on one sheet; DI1 is pins 1 (I) and 2 (C, shared with DI2). */
  function rig() {
    const { p, di } = panel();
    const fs = addPlant(p, "FS1", "Flow switch", ["C", "NO"], { points: [{ name: "flow", form: "contact", pins: ["C", "NO"] }] });
    allocate(p, fs.id, "flow", { module: di.id, point: "DI1" });
    const pg = p.pages[0]!.id;
    const mv = placePlantView(p, pg, di.id, [60, 4]);
    const fv = placePlantView(p, pg, fs.id, [20, 70]);
    const wire = (a: [string, string], b: [string, string]) => {
      connect(p, pg, a, b);
      refreshConductors(p);
    };
    return { p, di, fs, pg, mv, fv, wire, point: () => fs.points![0]! };
  }
  test("direct: the point's wire reaches the channel's own pin", () => {
    const { p, fs, mv, fv, wire, point } = rig();
    expect(wiringOf(p, fs, point()).kind).toBe("review");
    wire([fv.id, "NO"], [mv.id, "1"]);
    expect(wiringOf(p, fs, point()).kind).toBe("direct");
  });
  test("a shared common doesn't count as reaching", () => {
    const { p, fs, mv, fv, wire, point } = rig();
    wire([fv.id, "C"], [mv.id, "2"]);
    expect(wiringOf(p, fs, point()).kind).toBe("review");
  });
  test("not drawn until it and its channel are on a sheet", () => {
    const { p, di } = panel();
    const fs = addPlant(p, "FS1", "Flow switch", ["C", "NO"], { points: [{ name: "flow", form: "contact", pins: ["C", "NO"] }] });
    allocate(p, fs.id, "flow", { module: di.id, point: "DI1" });
    expect(wiringOf(p, fs, fs.points![0]!).kind).toBe("not-drawn");
  });
  test("confirmed by hand holds while the wiring at both ends is unchanged, and drops back when it changes", () => {
    const { p, fs, mv, fv, pg, wire, point } = rig();
    // Through a link arrow pair would be direct; through a switch it's to review.
    const sw = addElement(p, pg, "contact-no", [40, 40]);
    wire([fv.id, "NO"], [sw.id, "13"]);
    wire([sw.id, "14"], [mv.id, "1"]);
    expect(wiringOf(p, fs, point()).kind).toBe("review");
    confirmWiring(p, fs.id, "flow");
    expect(wiringOf(p, fs, point()).kind).toBe("confirmed");
    // Something elsewhere changes: still confirmed.
    const lamp = addElement(p, pg, "lamp", [120, 40]);
    const other = addElement(p, pg, "contact-no", [130, 40]);
    wire([other.id, "14"], [lamp.id, "+V"]);
    expect(wiringOf(p, fs, point()).kind).toBe("confirmed");
    // A wire added at the point's end: back to review.
    wire([fv.id, "NO"], [other.id, "13"]);
    expect(wiringOf(p, fs, point()).kind).toBe("review");
    // A confirmation goes with its channel.
    confirmWiring(p, fs.id, "flow");
    allocate(p, fs.id, "flow", null);
    expect(point().confirmed).toBeUndefined();
  });
  test("Check lists what's to review with Confirm by hand, a point with no channel, and plant not drawn", () => {
    const { p, fs, di } = rig();
    const pu = pump(p, "P1", [{ name: "fault", form: "contact" }]);
    const f = designChecks(p);
    expect(f.find((x) => x.confirm?.plant === fs.id)?.message).toMatch(/isn't wired straight to its channel A\? DI1/);
    expect(f.find((x) => x.design?.point === "fault")?.message).toBe("P1 fault goes to a channel and has none");
    expect(f.find((x) => x.design?.plant === pu.id && !x.design.point)?.message).toMatch(/not drawn yet/);
    expect(di.module).toBeDefined();
  });
  test("equipment drawn in the field that isn't plant is named; older projects without Design get none of these", () => {
    const { p, pg } = rig();
    p.pages[0]!.boundaryY = 60;
    const k = addElement(p, pg, "coil", [100, 80]);
    k.zone = "external";
    expect(designChecks(p).some((x) => x.ids.includes(k.id))).toBe(true);
    const q = newProject("q");
    addPlant(q, "P1", "Pump", ["1", "2"], { points: [{ name: "run", form: "contact", pins: ["1", "2"] }] });
    expect(designChecks(q)).toEqual([]);
  });
});

describe("v0.3 fix: an undrawn module is reported once", () => {
  test("no \"Plant : terminal … not shown\" for a module that isn't drawn; a part-drawn one is named", () => {
    const { p, di } = panel();
    const msgs = () => checkProject(p).map((f) => f.message);
    expect(msgs().filter((m) => /terminal .* not shown/.test(m))).toEqual([]);
    expect(msgs().some((m) => /Module A\? \(DI-4\).*isn't drawn/.test(m))).toBe(true);
    const v = placePlantView(p, p.pages[0]!.id, di.id, [60, 4]);
    v.params.show = di.terminals.slice(0, 2).join(",");
    expect(msgs().some((m) => m.startsWith("Module A?: terminal") && m.endsWith("not shown on any sheet"))).toBe(true);
  });
});

describe("one hop, proved on the example project (§5)", () => {
  /**
   * LSP-01 with a DI module added: DPS-SF-01's airflow contact drives coil
   * K8-37 (through terminal 8-35), so a K8-37 contact wired to DI1 is one hop.
   */
  function example() {
    const { project: p } = buildLsp01(AvoidLib.getInstance());
    const c = addController(p, "Panel controller");
    const di = addModule(p, c.id, { type: "di", channels: 4 });
    const dps = p.plant.find((x) => x.tag === "DPS-SF-01")!;
    // On the airflow switch's own sheet (8): wires don't cross sheets.
    const sheet = p.pages.find((pg) => pg.elements.some((e) => e.symbol === "plant-view" && e.params.plant === dps.id))!;
    const mv = placePlantView(p, sheet.id, di.id, [60, 4]);
    allocate(p, dps.id, "Airflow proven", { module: di.id, point: "DI1" });
    const coil = (tag: string) => p.pages.flatMap((pg) => pg.elements).find((e) => e.tag === tag && (e.symbol === "coil" || e.symbol === "timer-coil"))!;
    const contactOf = (tag: string, at: [number, number]) => {
      const k = addElement(p, sheet.id, "contact-no", at);
      linkContact(p, k.id, coil(tag).id);
      return k;
    };
    const wire = (a: [string, string], b: [string, string]) => {
      connect(p, sheet.id, a, b);
      refreshConductors(p);
    };
    return { p, dps, mv, sheet, coil, contactOf, wire, kind: () => wiringOf(p, dps, dps.points![0]!) };
  }
  test("the airflow switch to DI1 through a contact of the relay it drives: via K8-37", () => {
    const { mv, contactOf, wire, kind } = example();
    expect(kind().kind).toBe("review");
    const k = contactOf("K8-37", [62, 40]);
    wire([k.id, "14"], [mv.id, "1"]);
    expect(kind()).toMatchObject({ kind: "via", relay: "K8-37" });
  });
  test("a contact of a relay the switch doesn't drive is to review", () => {
    const { p, mv, contactOf, wire, kind } = example();
    const other = p.pages.flatMap((pg) => pg.elements).find((e) => e.symbol === "coil" && e.tag && e.tag !== "K8-37")!;
    const k = contactOf(other.tag, [62, 40]);
    wire([k.id, "14"], [mv.id, "1"]);
    expect(kind().kind).toBe("review");
  });
  test("two relays between are to review: one hop only", () => {
    const { p, mv, sheet, contactOf, wire, kind } = example();
    // K8-37's contact drives a new relay KX; KX's contact goes to DI1.
    const kx = addElement(p, sheet.id, "coil", [90, 60]);
    kx.tag = "KX1";
    const a = contactOf("K8-37", [80, 40]);
    wire([a.id, "14"], [kx.id, "A1"]);
    const b = addElement(p, sheet.id, "contact-no", [62, 40]);
    linkContact(p, b.id, kx.id);
    wire([b.id, "14"], [mv.id, "1"]);
    expect(kind().kind).toBe("review");
  });
  test("a switch or timer between is to review; confirming it by hand still works", () => {
    const { p, dps, mv, sheet, wire, kind } = example();
    const sw = addElement(p, sheet.id, "contact-no", [62, 40]);
    const views = p.pages.flatMap((pg) => pg.elements.filter((e) => e.symbol === "plant-view" && e.params.plant === dps.id));
    wire([views[0]!.id, "NO"], [sw.id, "13"]);
    wire([sw.id, "14"], [mv.id, "1"]);
    expect(kind().kind).toBe("review");
    confirmWiring(p, dps.id, "Airflow proven");
    expect(kind().kind).toBe("confirmed");
  });
  test("the reverse, for an output: the channel drives a relay whose contact switches the plant's input", () => {
    const { p, sheet } = example();
    const dout = addModule(p, p.controllers![0]!.id, { type: "do", channels: 2 });
    const dv = placePlantView(p, sheet.id, dout.id, [100, 4]);
    const ef = addPlant(p, "EF3", "Extract fan 3 enable", ["1", "2"], { points: [{ name: "enable", form: "dry-in", pins: ["1", "2"] }] });
    const ev = placePlantView(p, sheet.id, ef.id, [130, 70]);
    allocate(p, ef.id, "enable", { module: dout.id, point: "DO1" });
    const ky = addElement(p, sheet.id, "coil", [110, 50]);
    ky.tag = "KY1";
    const k = addElement(p, sheet.id, "contact-no", [130, 40]);
    linkContact(p, k.id, ky.id);
    connect(p, sheet.id, [dv.id, dout.points![0]!.pins[1]!], [ky.id, "A1"]);
    connect(p, sheet.id, [k.id, "14"], [ev.id, "1"]);
    refreshConductors(p);
    expect(wiringOf(p, ef, ef.points![0]!)).toMatchObject({ kind: "via", relay: "KY1" });
  });
});

describe("interlocks (§6)", () => {
  function two() {
    const p = newProject("t");
    const p1 = pump(p, "P1", [{ name: "enable", form: "dry-in" }, { name: "speed", form: "analogue-in" }]);
    const pu = pump(p, "PU1", [{ name: "fault", form: "contact" }]);
    return { p, p1, pu };
  }
  test("an interlock makes a never expectation, marked with it; it follows edits and goes with it; hand-written ones are untouched", () => {
    const { p, p1, pu } = two();
    p.expectations.push({ id: "mine", kind: "never", when: [{ ref: `plant:${pu.id}:fault`, on: true }] });
    const il = addInterlock(p, p1.id, "enable", { ref: `plant:${pu.id}:fault`, on: true });
    expect(describeInterlock(p, p1, il)).toBe("P1 enable never on while PU1 fault");
    const gen = () => p.expectations.filter((e) => e.interlock === il.id);
    expect(gen()).toEqual([{ id: `x_${il.id}_0`, kind: "never", when: [{ ref: `plant:${p1.id}:enable`, on: true }, { ref: `plant:${pu.id}:fault`, on: true }], join: "and", interlock: il.id }]);
    updateInterlock(p, p1.id, il.id, { when: { ref: `plant:${pu.id}:fault`, on: false } });
    expect(gen()[0]!.when[1]).toEqual({ ref: `plant:${pu.id}:fault`, on: false });
    // Renamed points follow.
    updateDesignPoint(p, pu.id, "fault", { name: "trip" });
    expect(gen()[0]!.when[1]!.ref).toBe(`plant:${pu.id}:trip`);
    // Not editable as an expectation.
    expect(() => setExpectation(p, { ...gen()[0]! })).toThrow(/interlock/);
    expect(() => deleteExpectation(p, gen()[0]!.id)).toThrow(/interlock/);
    deleteInterlock(p, p1.id, il.id);
    expect(p.expectations.map((e) => e.id)).toEqual(["mine"]);
  });
  test("only points that can be on or off; not against itself; a point turned analogue loses its interlocks", () => {
    const { p, p1, pu } = two();
    expect(() => addInterlock(p, p1.id, "speed", { ref: `plant:${pu.id}:fault`, on: true })).toThrow();
    expect(() => addInterlock(p, p1.id, "enable", { ref: `plant:${p1.id}:enable`, on: true })).toThrow(/itself/);
    addInterlock(p, p1.id, "enable", { ref: `plant:${pu.id}:fault`, on: true });
    updateDesignPoint(p, pu.id, "fault", { form: "analogue-out" });
    expect(p1.interlocks).toBeUndefined();
    expect(p.expectations).toEqual([]);
  });
  test("copies keep their interlocks, each with its own expectation", () => {
    const { p, p1, pu } = two();
    addInterlock(p, p1.id, "enable", { ref: `plant:${pu.id}:fault`, on: true });
    const r = duplicatePlant(p, [p1.id], 2, 1);
    expect(r.plant.every((x) => x.interlocks?.length === 1)).toBe(true);
    expect(p.expectations.filter((e) => e.interlock)).toHaveLength(3);
  });
  test("not proved until drawn; then proved, on the example, by Check logic's search, for that drawing only", () => {
    const { p: q, p1, pu } = two();
    const il0 = addInterlock(q, p1.id, "enable", { ref: `plant:${pu.id}:fault`, on: true });
    expect(interlockStatus(q).get(il0.id)).toEqual({ kind: "not-drawn", what: "P1 enable" });
    const { project: p } = buildLsp01(AvoidLib.getInstance());
    const fasf = p.plant.find((x) => x.tag === "FA-SF")!;
    // Duty and standby never run together: the example's interlocking proves it.
    const ok = addInterlock(p, fasf.id, "SF-01 running", { ref: `plant:${fasf.id}:SF-02 running`, on: true });
    const fa = p.plant.find((x) => x.tag === "FA")!;
    const bad = addInterlock(p, fasf.id, "SF-01 running", { ref: `plant:${fa.id}:Fire alarm`, on: false });
    expect(interlockStatus(p).get(ok.id)).toEqual({ kind: "unchecked" });
    const proofs = proveInterlocks(p);
    expect(interlockStatus(p, proofs).get(ok.id)).toEqual({ kind: "proved" });
    expect(interlockStatus(p, proofs).get(bad.id)).toEqual({ kind: "fails" });
    expect(designChecks(p, { proofs }).some((f) => /SF-01 running never on while FA Fire alarm off fails/.test(f.message))).toBe(true);
    // A change to the drawing: unchecked again until proved again.
    const key = circuitKey(p);
    p.pages[1]!.elements[0]!.pos = [p.pages[1]!.elements[0]!.pos[0] + 2, p.pages[1]!.elements[0]!.pos[1]];
    expect(circuitKey(p)).not.toBe(key);
    expect(interlockStatus(p, proofs).get(ok.id)).toEqual({ kind: "unchecked" });
  });
});

describe("networks (§7)", () => {
  test("Place as sheet: a spare sheet with the diagram, redrawn from the data", () => {
    const { p, lan } = riser();
    const pg = placeNetworkSheet(p);
    expect([pg.title, pg.spare, pg.number]).toEqual(["Network diagram", true, p.pages.length]);
    const el = pg.elements[0]!;
    const drawn = () => localGeometry(el, elementTexts(el, p)).prims.flatMap((x) => (x.t === "text" ? [x.text] : []));
    expect(drawn()).toContain("LAN 1 · BACnet IP · 19 devices");
    updateNetwork(p, lan.id, { name: "Riser LAN" });
    expect(drawn()).toContain("Riser LAN · BACnet IP · 19 devices");
    const g = localGeometry(el, elementTexts(el, p));
    expect(g.bbox.w).toBeLessThanOrEqual(150);
    expect(g.bbox.h).toBeLessThanOrEqual(90);
    expect(roundTrip(p).pages.at(-1)!.elements[0]!.symbol).toBe("netmap");
  });
  function riser() {
    const { p } = panel();
    const lan = addNetwork(p, "lan");
    const bus = addNetwork(p, "bus");
    const f = addDesignPlant(p);
    f.tag = "FCU-01";
    const fcus = [f, ...duplicatePlant(p, [f.id], 18, 1).plant];
    putOnNetwork(p, fcus.map((x) => x.id), lan.id);
    const m = addDesignPlant(p);
    m.tag = "MTR-1";
    const mtrs = [m, ...duplicatePlant(p, [m.id], 2, 1).plant];
    putOnNetwork(p, mtrs.map((x) => x.id), bus.id);
    return { p, lan, bus, fcus, mtrs };
  }
  test("named in turn with a protocol; devices are comms plant on it, in row order", () => {
    const { p, lan, bus, fcus } = riser();
    expect([lan.name, lan.protocol, bus.name, bus.protocol]).toEqual(["LAN 1", "BACnet IP", "Bus 1", "Modbus RTU"]);
    expect(addNetwork(p, "lan").name).toBe("LAN 2");
    expect(devicesOn(p, lan.id).map((x) => x.tag)).toEqual(fcus.map((x) => x.tag));
    expect(fcus.every((x) => x.connects === "comms" && x.protocol === "BACnet IP")).toBe(true);
    expect(() => updateNetwork(p, lan.id, { name: "Bus 1" })).toThrow(/already/);
  });
  test("order along a bus is the row order: moving a device moves its row", () => {
    const { p, bus, mtrs } = riser();
    moveOnNetwork(p, mtrs[2]!.id, -1);
    expect(devicesOn(p, bus.id).map((x) => x.tag)).toEqual(["MTR-1", "MTR-3", "MTR-2"]);
    expect(p.plant.indexOf(mtrs[2]!)).toBeLessThan(p.plant.indexOf(mtrs[1]!));
    expect(roundTrip(p).plant.filter((x) => x.network === bus.id).map((x) => x.tag)).toEqual(["MTR-1", "MTR-3", "MTR-2"]);
  });
  test("deleting a network leaves its devices on none", () => {
    const { p, bus, mtrs } = riser();
    deleteNetwork(p, bus.id);
    expect(mtrs.every((x) => !x.network)).toBe(true);
    expect(p.networks!.map((n) => n.name)).toEqual(["LAN 1"]);
  });
  test("the drawing: controller, switch, each network with its devices, long runs shortened with a count", () => {
    const { p } = riser();
    const d = networkData(p);
    expect(d.lans[0]!.devices).toHaveLength(19);
    const texts = networkDiagram(d).prims.flatMap((x) => (x.t === "text" ? [x.text] : []));
    expect(texts).toContain("Switch");
    expect(texts).toContain("LAN 1 · BACnet IP · 19 devices");
    expect(texts).toContain("FCU-16");
    expect(texts).not.toContain("FCU-17");
    expect(texts).toContain("… FCU-17 to FCU-19 (3 more)");
    expect(texts).toContain("Bus 1 · Modbus RTU · 3 devices");
    expect(texts).toContain("MTR-3");
    // No LANs, no switch.
    const q = newProject("q");
    expect(networkDiagram(networkData(q)).prims.some((x) => x.t === "text" && x.text === "Switch")).toBe(false);
  });
});

describe("points schedule (§9)", () => {
  test("every point by system, with type, goes to, controller, module, channel, via and wired; unallocated listed with no channel", () => {
    const { project: p } = buildLsp01(AvoidLib.getInstance());
    addSystem(p, "Supply air");
    const c = addController(p, "Panel controller");
    const di = addModule(p, c.id, { type: "di", channels: 4 });
    const dps = p.plant.find((x) => x.tag === "DPS-SF-01")!;
    setPlantDesign(p, dps.id, { system: "Supply air" });
    updateDesignPoint(p, dps.id, "Airflow proven", { signal: "volt-free", goesTo: "relay" });
    allocate(p, dps.id, "Airflow proven", { module: di.id, point: "DI1" });
    const sheet = p.pages.find((pg) => pg.elements.some((e) => e.symbol === "plant-view" && e.params.plant === dps.id))!;
    const mv = placePlantView(p, sheet.id, di.id, [60, 4]);
    const k = addElement(p, sheet.id, "contact-no", [62, 40]);
    linkContact(p, k.id, p.pages.flatMap((pg) => pg.elements).find((e) => e.tag === "K8-37" && e.symbol === "coil")!.id);
    connect(p, sheet.id, [k.id, "14"], [mv.id, "1"]);
    refreshConductors(p);
    const rows = pointsSchedule(p);
    expect(rows[0]).toEqual({
      system: "Supply air", tag: "DPS-SF-01", description: "Supply airflow proving, SF-01", point: "Airflow proven", form: "contact", signal: "volt-free",
      type: "DI", goesTo: "via relay", controller: rows[0]!.controller, module: "A?", channel: "DI1", via: "K8-37", wired: "via",
    });
    expect(rows[0]!.controller).toMatch(/Panel controller/);
    const other = rows.find((r) => r.tag === "DPS-SF-02")!;
    expect([other.system, other.type, other.goesTo, other.channel, other.wired]).toEqual(["", "DI", "channel", "", ""]);
    // Motors with no points are a row each; CSV has the design's columns.
    expect(rows.some((r) => r.tag === "SF-01" && r.point === "")).toBe(true);
    expect(toCsv(rows, POINTS_COLS).split("\n")[0]).toBe("System,Tag,Description,Point,Form,Signal,Type,Goes to,Controller,Module,Channel,Via,Wired");
  });
});

describe("Suggest (§4)", () => {
  test("proposes, never allocates; own-type modules before universal; what's taken is left; no room is said", () => {
    const { p, di, dout, uio } = panel();
    const a = pump(p, "P1", [
      { name: "fault", form: "contact" },
      { name: "run", form: "contact" },
      { name: "enable", form: "dry-in" },
      { name: "speed", form: "analogue-in" },
      { name: "trip", form: "contact", goesTo: "panel" },
    ]);
    allocate(p, a.id, "run", { module: di.id, point: "DI1" });
    const before = JSON.stringify(p);
    const s = suggestAllocation(p);
    expect(JSON.stringify(p)).toBe(before);
    expect(s.map((l) => [l.point, l.channel && `${l.channel.module === di.id ? "di" : l.channel.module === dout.id ? "do" : l.channel.module === uio.id ? "uio" : "?"} ${l.channel.point}`])).toEqual([
      ["fault", "di DI2"],
      ["enable", "do DO1"],
      ["speed", "uio IO1"],
    ]);
    // Accepting what's kept is allocating by hand.
    expect(acceptSuggestion(p, s.slice(0, 2))).toBe(2);
    expect(a.points!.find((q) => q.name === "fault")!.channel?.point).toBe("DI2");
    expect(a.points!.find((q) => q.name === "speed")!.channel).toBeUndefined();
    // No room: said, not forced.
    const q = newProject("q");
    const c = addController(q, "Panel controller");
    addModule(q, c.id, { type: "di", channels: 1 });
    pump(q, "P1", [{ name: "a", form: "contact" }, { name: "b", form: "contact" }]);
    expect(suggestAllocation(q).map((l) => !!l.channel)).toEqual([true, false]);
  });
});
