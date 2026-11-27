/** v0.5 step 8: the Design workbench (design-design-workbench.md). */
import { describe, expect, test } from "bun:test";
import { newProject } from "./model";
import { addDesignPlant, addDesignPoint, needsChannel, pointType, updateDesignPoint } from "./design";
import { parseProject } from "./validate";
import { compile } from "./sim";

describe("step 8a: pick a thing, and Properties shows that thing (A69)", () => {
  test("+ Point adds an empty point with no form yet: it needs no channel and doesn't simulate until a form is set", () => {
    const p = newProject("t");
    const it = addDesignPlant(p);
    const pt = addDesignPoint(p, it.id);
    expect([pt.name, pt.form, pt.pins]).toEqual(["Point 1", "none", []]);
    expect(pointType(pt.form)).toBeUndefined();
    expect(needsChannel(pt)).toBe(false);
    expect(() => compile(p)).not.toThrow();
    // Kept as it is through a save.
    expect(parseProject(JSON.parse(JSON.stringify(p))).plant[0]!.points![0]!.form).toBe("none");
    updateDesignPoint(p, it.id, "Point 1", { form: "contact", name: "Fault" });
    expect([it.points![0]!.name, it.points![0]!.form, needsChannel(it.points![0]!)]).toEqual(["Fault", "contact", true]);
  });

  test("Enabled by and Source are gone from plant", () => {
    const p = newProject("t");
    const it = addDesignPlant(p);
    const raw = JSON.parse(JSON.stringify(p));
    raw.plant[0].enabledBy = "time zone";
    raw.plant[0].source = "4.2";
    const back = parseProject(raw).plant[0] as unknown as Record<string, unknown>;
    expect(back.enabledBy).toBeUndefined();
    expect(back.source).toBeUndefined();
    void it;
  });
});

describe("step 8b: the Terminals window (A67)", () => {
  test("Add terminal numbers one on from the highest; delete and reorder leave every number alone", async () => {
    const { addPlant, addPin, deletePin, movePin, nextPinNumber, updatePin } = await import("./ops");
    const p = newProject("t");
    const it = addPlant(p, "", "Fan", ["1", "2", "11", "14"]);
    expect(nextPinNumber(it)).toBe("15");
    addPin(p, it.id, nextPinNumber(it));
    deletePin(p, it.id, "2");
    expect(it.terminals).toEqual(["1", "11", "14", "15"]);
    movePin(p, it.id, "15", 0);
    expect(it.terminals).toEqual(["15", "1", "11", "14"]);
    // A point name not used yet makes a point with no form yet.
    updatePin(p, it.id, "11", { point: "Run" });
    expect(it.points!.find((q) => q.name === "Run")!.form).toBe("none");
  });

  test("Generate says what it makes first, and a dash uses up a number without making a terminal", async () => {
    const { generatePins, patternSummary } = await import("./modules");
    const di = { channels: 16, ids: "I C", first: 1, group: "DI#", form: "dry-in" as const, shared: "C", shareBy: 4 };
    expect(patternSummary(di)).toBe("Makes 16 channels and 4 shared terminals, numbered 1 to 20");
    const gap = generatePins({ channels: 2, ids: "I - C", first: 1, group: "DI#", form: "dry-in" });
    expect(gap.terminals).toEqual(["1", "3", "4", "6"]);
    expect(gap.points.map((q) => q.pins)).toEqual([["1", "3"], ["4", "6"]]);
  });
});

describe("step 8c: adapters and marks (A68, A66)", () => {
  test("an adapter is a module with no channels, added empty, its terminals entered by hand", async () => {
    const { addModule, addController } = await import("./controllers");
    const { addPin, updatePin } = await import("./ops");
    const { channelsOf } = await import("./design");
    const { moduleTypeName } = await import("./modules");
    const { moduleGaSize } = await import("./ga");
    const p = newProject("t");
    const c = addController(p);
    const a = addModule(p, c.id, { type: "adapter", pattern: null });
    expect(a.terminals).toEqual([]);
    expect(moduleTypeName(a.module!)).toBe("Adapter");
    for (const t of ["1", "2", "3", "4"]) addPin(p, a.id, t);
    updatePin(p, a.id, "1", { point: "Supply in" });
    updatePin(p, a.id, "3", { point: "Supply out" });
    expect(a.points!.map((q) => q.form)).toEqual(["none", "none"]);
    // Whatever a point's form, a module with no channels has none.
    updateDesignPoint(p, a.id, "Supply out", { form: "contact" });
    expect(channelsOf(p).some((ch) => ch.module.id === a.id)).toBe(false);
    expect(moduleGaSize(p, a)).toEqual({ w: 22.5, h: 90 });
    const back = parseProject(JSON.parse(JSON.stringify(p)));
    expect(back.plant.find((x) => x.id === a.id)!.module!.type).toBe("adapter");
  });

  test("a mark is a picture, or Other with up to four letters: a circle for two, a lozenge for three or four", async () => {
    const { setPlantDesign } = await import("./design");
    const { addPlant } = await import("./ops");
    const { markPrims, markWidth } = await import("./symbols");
    const p = newProject("t");
    const it = addPlant(p, "", "CO2 sensor", ["1", "2"]);
    setPlantDesign(p, it.id, { mark: "other", markText: "  CO2x9 " });
    expect(it.markText).toBe("CO2x");
    setPlantDesign(p, it.id, { markText: "CO2" });
    expect(it.markText).toBe("CO2");
    // Two letters: a circle 4 mm across; three: wider, the same height.
    expect(markWidth("other", "RH")).toBeCloseTo(2.2);
    expect(markWidth("other", "CO2")).toBeGreaterThan(2.2);
    expect(markPrims("other", 0, 0, "RH").some((x) => x.t === "circle")).toBe(true);
    expect(markPrims("other", 0, 0, "IAQ").filter((x) => x.t === "arc")).toHaveLength(2);
    expect(markPrims("other", 0, 0, "")).toEqual([]);
    // A picture clears the letters.
    setPlantDesign(p, it.id, { mark: "fan" });
    expect(it.markText).toBeUndefined();
    expect(markPrims("fan", 0, 0).filter((x) => x.t === "ellipse")).toHaveLength(2);
    expect(markPrims("pump", 0, 0).some((x) => x.t === "line")).toBe(true);
    // The letter-only marks are gone: a file with one opens without it.
    const json = JSON.parse(JSON.stringify(p));
    json.plant.find((x: { id: string }) => x.id === it.id).mark = "temperature";
    expect(parseProject(json).plant.find((x) => x.id === it.id)!.mark).toBeUndefined();
  });
});

describe("step 8d1: devices are picked in Design (A70)", () => {
  test("the Devices view has a row for each drawn part, each strip, each module and each plant item, grouped", async () => {
    const { buildBms01 } = await import("../bench/bms01");
    const { deviceRows, DEVICE_GROUPS } = await import("./devicerows");
    const { project: p } = buildBms01(null);
    const rows = deviceRows(p);
    const groups = [...new Set(rows.map((r) => r.group))];
    // In the groups' order.
    expect(groups).toEqual(DEVICE_GROUPS.map((g) => g.key).filter((g) => groups.includes(g)));
    expect(rows.filter((r) => r.group === "strips").map((r) => r.tag)).toContain("X1");
    // A relay's coil is a row; its contacts aren't.
    const coils = rows.filter((r) => r.group === "coils");
    expect(coils.length).toBeGreaterThan(0);
    expect(coils.every((r) => r.what.startsWith("Coil"))).toBe(true);
    const contacts = p.pages.flatMap((pg) => pg.elements).filter((e) => e.symbol === "contact");
    expect(rows.some((r) => contacts.some((c) => r.key === `el:${c.id}`))).toBe(false);
    // Modules in rail order; field plant as well as panel plant.
    const mods = rows.filter((r) => r.group === "controller").map((r) => r.what);
    expect(mods[0]).toBe("Host");
    expect(rows.find((r) => r.tag === "AHU-01-TT-01")!.what).toMatch(/field$/);
    expect(rows.every((r) => !r.device)).toBe(true);
  });

  test("a device is given to rows that it suits; what's placed takes its size; deleting it leaves them with none", async () => {
    const { addElement, addGaItem, addGaPage, addProjectDevice, removeProjectDevice, setDevices } = await import("./ops");
    const { gaItemDevice, gaCandidates, deviceSize, stripSize } = await import("./ga");
    const { billOfMaterials } = await import("./schedules");
    const p = newProject("t");
    const pg = p.pages[0]!.id;
    const k1 = addElement(p, pg, "coil", [20, 20]);
    const k2 = addElement(p, pg, "coil", [30, 20]);
    const lamp = addElement(p, pg, "lamp", [40, 20]);
    const t1 = addElement(p, pg, "terminal", [20, 60], { params: { strip: "X1" } });
    const t2 = addElement(p, pg, "terminal", [24, 60], { params: { strip: "X1" } });
    const relay = addProjectDevice(p, { name: "Relay 2CO", maker: "Maker", part: "R2", kind: "relay", w: 16, h: 80, d: 70 });
    const term = addProjectDevice(p, { name: "Feed-through", maker: "", part: "", kind: "terminal", w: 5.2, h: 60, d: 40 });
    const ga = addGaPage(p, "", { scale: 5, enclosure: { w: 600, h: 800 }, view: "backplate" });
    const a = addGaItem(p, ga.id, { kind: "device", x: 100, y: 100, w: 12, h: 60, refs: [k1.id] });
    const strip = addGaItem(p, ga.id, { kind: "device", x: 200, y: 100, w: 10, h: 40, refs: [t1.id, t2.id], strip: "X1" });
    // A relay doesn't suit a lamp: refused, and nothing changes.
    expect(() => setDevices(p, [`el:${k1.id}`, `el:${lamp.id}`], relay.id)).toThrow(/doesn't suit/);
    expect(k1.device).toBeUndefined();
    setDevices(p, [`el:${k1.id}`, `el:${k2.id}`], relay.id);
    expect([k1.device, k2.device]).toEqual([relay.id, relay.id]);
    expect([a.w, a.h]).toEqual([16, 80]);
    expect(gaItemDevice(p, a)?.id).toBe(relay.id);
    // Not placed yet: it's placed at its device's size.
    expect(gaCandidates(p, () => "").find((c) => c.refs[0] === k2.id)).toMatchObject({ w: 16, h: 80 });
    // A strip: each terminal is its device.
    setDevices(p, ["strip:X1"], term.id);
    expect(p.stripDevices).toEqual({ X1: term.id });
    expect(stripSize(p, [t1.id, t2.id])).toEqual({ w: 10.4, h: 60 });
    expect([strip.w, strip.h]).toEqual([10.4, 60]);
    expect(billOfMaterials(p).find((r) => r.item === "Relay 2CO")).toMatchObject({ maker: "Maker", part: "R2", quantity: 1 });
    // Round trip.
    const back = parseProject(JSON.parse(JSON.stringify(p)));
    expect(back.stripDevices).toEqual({ X1: term.id });
    expect(back.pages[0]!.elements.find((e) => e.id === k1.id)!.device).toBe(relay.id);
    // Deleted: what had it has none; placed parts keep their size.
    removeProjectDevice(p, relay.id);
    expect(k1.device).toBeUndefined();
    expect([a.w, a.h]).toEqual([16, 80]);
    // And with none it's back to its generic size when set to none.
    setDevices(p, ["strip:X1"], null);
    expect(p.stripDevices).toBeUndefined();
    expect(strip.w).toBe(stripSize(p, [t1.id, t2.id]).w);
    void deviceSize;
  });

  test("a plant item's and a module's device is on the plant item; + Device starts suited and sized", async () => {
    const { addController, addModule } = await import("./controllers");
    const { addPlant, addProjectDevice, setDevices } = await import("./ops");
    const { newDeviceFor } = await import("./devicerows");
    const p = newProject("t");
    const c = addController(p);
    const m = addModule(p, c.id, { type: "di", channels: 8 });
    const vsd = addPlant(p, "", "Supply fan drive", ["L", "N"]);
    expect(newDeviceFor(p, `plant:${m.id}`).kind).toBe("module");
    expect(newDeviceFor(p, `plant:${vsd.id}`).kind).toBe("plant");
    const drive = addProjectDevice(p, { name: "Drive 4 kW", maker: "", part: "", ...newDeviceFor(p, `plant:${vsd.id}`), d: 0 });
    setDevices(p, [`plant:${vsd.id}`], drive.id);
    expect(vsd.device).toBe(drive.id);
    expect(() => setDevices(p, [`plant:${m.id}`], drive.id)).toThrow(/doesn't suit/);
  });
});
