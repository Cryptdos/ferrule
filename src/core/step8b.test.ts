/**
 * Step 8b (controller.md phase 3): controllers, their modules and references.
 */
import { describe, expect, test } from "bun:test";
import { checkProject } from "./checks";
import { addController, addModule, addSpareSlot, deleteController, generateModule, moveSlot, removeSlot, updateController, updateModule } from "./controllers";
import { newProject, type Project } from "./model";
import { defaultPattern, generatePins, moduleTitle, moduleTypeName, slotAddress, controllerTag } from "./modules";
import { addElement, addPlant, connect, addPage, linkContact, placePlantView, setExpectation, updatePoint } from "./ops";
import { describeExpectation, findThing, pointRef, things } from "./points";
import { renumber } from "./renumber";
import { compile, initialState, judge, toggle } from "./sim";
import { localGeometry, moduleViewLayout } from "./symbols";
import { elementTexts } from "./tags";
import { saveSheetTemplate } from "./templates";
import { controlBusbars } from "./testing";
import { parseProject } from "./validate";

const roundTrip = (p: Project) => parseProject(JSON.parse(JSON.stringify(p)));

function project() {
  const p = newProject("t");
  return { p, pg: p.pages[0]!.id };
}

describe("module types and the generator", () => {
  test("a pattern makes pins numbered on from the first, grouped by channel, with a shared common", () => {
    const g = generatePins({ channels: 4, ids: "Y ⊥", first: 31, group: "DO#", form: "contact", shared: "⊥", shareBy: 2 });
    expect(g.terminals).toEqual(["31", "32", "33", "34", "35", "36"]);
    expect(g.points.map((p) => [p.name, p.pins])).toEqual([
      ["DO1", ["31", "32"]],
      ["DO2", ["33", "32"]],
      ["DO3", ["34", "35"]],
      ["DO4", ["36", "35"]],
    ]);
    expect(g.pins["32"]).toEqual({ id: "⊥", group: "DO1" });
    // Numbering per controller: the first channel can be later than 1.
    const ao = generatePins({ channels: 2, ids: "VO RET CO", first: 1, group: "AO#", start: 5, form: "analogue-out" });
    expect(ao.points.map((p) => p.name)).toEqual(["AO5", "AO6"]);
    expect(ao.terminals).toHaveLength(6);
  });

  test("the channel count is a setting, like a contactor's poles", () => {
    expect(moduleTypeName({ type: "di", channels: 16 })).toBe("DI-16");
    expect(moduleTypeName({ type: "host" })).toBe("Host");
    expect(defaultPattern("ao", 4).channels).toBe(4);
  });
});

describe("controllers and modules", () => {
  test("a controller's modules are tagged by where their first view is, prefix A", () => {
    const { p, pg } = project();
    addPage(p, "Sheet 2");
    addPage(p, "Sheet 3");
    const c = addController(p, "AHU-1 outstation");
    const host = addModule(p, c.id, { type: "host", pattern: null });
    const di = addModule(p, c.id, { type: "di", channels: 8 });
    placePlantView(p, pg, host.id, [8, 20]);
    placePlantView(p, p.pages[2]!.id, di.id, [44, 20]);
    renumber(p);
    expect(host.tag).toBe("A1-5");
    expect(di.tag).toBe("A3-23");
    expect(controllerTag(p, c)).toBe("A1-5");
    // Plant in the same column keeps its plain address: addresses are per prefix.
    const fan = addPlant(p, "", "Fan", ["1", "2"], { prefix: "SF" });
    placePlantView(p, p.pages[2]!.id, fan.id, [44, 80]);
    renumber(p);
    expect(fan.tag).toBe("SF-3-23");
    expect(di.tag).toBe("A3-23");
    expect(di.points!.map((x) => x.name).slice(0, 2)).toEqual(["DI1", "DI2"]);
    // DI1 and DI2 share their common.
    expect(di.points![1]!.pins[1]).toBe(di.points![0]!.pins[1]);
    // The title row: tag, type, the controller it's part of.
    const v = p.pages[2]!.elements[0]!;
    expect(moduleTitle(p, v)).toBe("A3-23 · DI-8 · part of A1-5, AHU-1 outstation");
    expect(elementTexts(v, p).xref).toBe(moduleTitle(p, v));
    // A prefix is the project's to change.
    updateController(p, c.id, { prefix: "ac" });
    renumber(p);
    expect(di.tag).toBe("AC-3-23");
  });

  test("a module view sits above its terminals: they're along the bottom, wires leave downwards", () => {
    const { p, pg } = project();
    const c = addController(p, "Outstation");
    const ao = addModule(p, c.id, { type: "ao", channels: 2, maker: "Maker", model: "AO-2X", pattern: { ids: "VO RET CO" } });
    const v = placePlantView(p, pg, ao.id, [20, 30]);
    updatePoint(p, ao.id, "AO1", { label: "SF-01 speed" });
    renumber(p);
    const g = localGeometry(v, elementTexts(v, p));
    expect(g.terminals).toHaveLength(6);
    expect(g.terminals.every((t) => t.dir === "down" && t.at[1] === 0)).toBe(true);
    expect(g.body.y + g.body.h).toBe(0);
    const texts = g.prims.flatMap((x) => (x.t === "text" ? [x.text] : []));
    expect(texts).toContain("ANALOGUE OUTPUTS");
    expect(texts).toContain("AO1");
    expect(texts).toContain("RET");
    expect(texts).toContain("SF-01 SPEED");
    expect(texts.find((t) => t.startsWith("A1-11 · AO-2 · Maker AO-2X"))).toBeTruthy();
    // The job label runs down from under the terminals, beside its first wire.
    const lay = moduleViewLayout(v);
    expect(lay.labels).toEqual([{ x: -0.55, text: "SF-01 SPEED" }]);
    expect(v.zone).toBe("internal");
  });

  test("a module split across sheets keeps one tag; references land where the point is", () => {
    const { p, pg } = project();
    const pg4 = addPage(p, "Sheet 2").id;
    const c = addController(p, "AHU-1 outstation");
    const dout = addModule(p, c.id, { type: "do", channels: 8 });
    const half = (from: number, to: number) => dout.points!.slice(from, to).flatMap((x) => x.pins);
    const a = placePlantView(p, pg, dout.id, [44, 20], half(0, 4));
    const b = placePlantView(p, pg4, dout.id, [18, 20], half(4, 8));
    renumber(p);
    expect(dout.tag).toBe("A1-23");
    expect(moduleTitle(p, b)).toBe("A1-23 · DO-8 · DO5–8, continued from 1-23");
    expect(moduleViewLayout(a).cutRight).toBe(true);
    expect(moduleViewLayout(b).cutLeft).toBe(true);
    const list = things(p);
    expect(list.find((t) => t.ref === pointRef(dout.id, "DO2"))!.name).toBe("A1-23:DO2");
    expect(list.find((t) => t.ref === pointRef(dout.id, "DO5"))!.name).toBe("A1-23:DO5 (2-10)");
    expect(list.find((t) => t.ref === pointRef(dout.id, "DO5"))!.page).toBe(2);
    // Found as people write it, with or without where it's drawn.
    expect(findThing(p, "A1-23:DO5")?.ref).toBe(pointRef(dout.id, "DO5"));
    expect(findThing(p, "a1-23 do5 (2-10)")?.ref).toBe(pointRef(dout.id, "DO5"));
  });

  test("a DI senses a panel contact wired round from the controller's 24 V; its expectation goes green", () => {
    const { p, pg } = project();
    const { cct, ov } = controlBusbars(p, pg, 60, 85);
    const c = addController(p, "Outstation");
    const di = addModule(p, c.id, { type: "di", channels: 2 });
    const v = placePlantView(p, pg, di.id, [60, 30]);
    const k = addElement(p, pg, "coil", [20, 70]);
    const sw = addElement(p, pg, "contact-no", [20, 62]);
    connect(p, pg, [cct.id, "20"], [sw.id, "13"]);
    connect(p, pg, [sw.id, "14"], [k.id, "A1"]);
    connect(p, pg, [k.id, "A2"], [ov.id, "20"]);
    const kc = addElement(p, pg, "contact-no", [60, 45]);
    linkContact(p, kc.id, k.id);
    const [sig, com] = di.points![0]!.pins;
    connect(p, pg, [v.id, sig!], [kc.id, "13"]);
    connect(p, pg, [kc.id, "14"], [v.id, com!]);
    renumber(p);
    setExpectation(p, { kind: "should", point: pointRef(di.id, "DI1"), when: [{ ref: k.id, on: true }] });
    const e = p.expectations[0]!;
    expect(describeExpectation(p, e)).toBe(`A1-31:DI1 should be on when ${k.tag} energised`);
    const cc = compile(p);
    let s = initialState(cc);
    expect(judge(cc, s, e)).toBe("ok");
    s = toggle(cc, s, sw.id);
    expect(cc.states.get(pointRef(di.id, "DI1"))!(s)).toBe(true);
    expect(judge(cc, s, e)).toBe("ok");
    // DI2 isn't wired: a warning, worded for a module.
    expect(checkProject(p).some((f) => f.message === "Module A1-31: input DI2 isn't wired to anything")).toBe(true);
  });

  test("rail order, spare slots and bus addresses", () => {
    const { p } = project();
    const c = addController(p, "Outstation");
    const host = addModule(p, c.id, { type: "host", pattern: null });
    addSpareSlot(p, c.id);
    const di = addModule(p, c.id, { type: "di" });
    expect(c.slots.map((s) => (s.spare ? "spare" : s.module))).toEqual([host.id, "spare", di.id]);
    expect([0, 1, 2].map((i) => slotAddress(p, c, i))).toEqual([1, 2, 3]);
    updateModule(p, di.id, { address: 7 });
    expect(slotAddress(p, c, 2)).toBe(7);
    // A new module can fill a spare slot.
    const dout = addModule(p, c.id, { type: "do", at: 1 });
    expect(c.slots.map((s) => s.module)).toEqual([host.id, dout.id, di.id]);
    moveSlot(p, c.id, 2, 0);
    expect(c.slots[0]!.module).toBe(di.id);
    removeSlot(p, c.id, 0);
    expect(p.plant.some((x) => x.id === di.id)).toBe(false);
    // Regenerating keeps what named points had.
    updatePoint(p, dout.id, "DO1", { label: "Fan enable" });
    generateModule(p, dout.id, { ...defaultPattern("do", 4), ids: "NO C" });
    expect(dout.points!.find((x) => x.name === "DO1")!.label).toBe("Fan enable");
    expect(dout.module!.channels).toBe(4);
    deleteController(p, c.id);
    expect(p.plant).toEqual([]);
    expect(p.controllers).toBeUndefined();
  });

  test("controllers and modules survive saving; a module whose controller has gone is plant", () => {
    const { p, pg } = project();
    const c = addController(p, "Outstation");
    const di = addModule(p, c.id, { type: "di", channels: 4, maker: "M", model: "X" });
    addSpareSlot(p, c.id);
    updatePoint(p, di.id, "DI1", { label: "Filter dirty" });
    placePlantView(p, pg, di.id, [20, 20]);
    const back = roundTrip(p);
    expect(back.controllers).toEqual(p.controllers);
    expect(back.plant[0]!.module).toEqual(di.module);
    expect(back.plant[0]!.points![0]!.label).toBe("Filter dirty");
    const raw = JSON.parse(JSON.stringify(p));
    raw.controllers = [];
    expect(parseProject(raw).plant[0]!.module).toBeUndefined();
  });

  test("a sheet template leaves module views with their controller", () => {
    const { p, pg } = project();
    const c = addController(p, "Outstation");
    const di = addModule(p, c.id, { type: "di", channels: 2 });
    placePlantView(p, pg, di.id, [20, 20]);
    addElement(p, pg, "coil", [60, 40]);
    const t = saveSheetTemplate(p, pg, "T");
    expect(t.elements.map((e) => e.symbol)).toEqual(["coil"]);
    expect(t.plant).toEqual([]);
  });
});
