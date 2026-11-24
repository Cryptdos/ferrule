/**
 * v0.4 (docs/design-v0.4.md): the Design model.
 */
import { describe, expect, test } from "bun:test";
import { AvoidLib } from "libavoid-js";
import { buildLsp01 } from "../bench/lsp01";
import { checkProject } from "./checks";
import { addController, addModule, deleteController, generateModule } from "./controllers";
import { addDesignPlant, addDesignPoint, addSystem, allocate, channelsOf, deleteDesignPoint, deleteSystem, moveSystem, movePlant, needsLine, pointOnChannel, pointType, renameSystem, setPlantDesign, systemGroups, updateDesignPoint } from "./design";
import { newProject, type IoPoint, type Project } from "./model";
import { defaultPattern } from "./modules";
import { addPlant, deletePlant, updatePin, updatePlant } from "./ops";
import { saveSheetTemplate } from "./templates";
import { parseProject } from "./validate";

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
    // The expectation stays, as a hand-written one.
    expect(back.expectations).toHaveLength(1);
    expect(back.expectations[0]!.interlock).toBeUndefined();
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
