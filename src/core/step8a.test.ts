/**
 * Step 8a (controller.md phase 1): IO points for plant, and expectations.
 */
import { describe, expect, test } from "bun:test";
import { checkProject } from "./checks";
import { newProject, type Project } from "./model";
import {
  addDistribution,
  addElement,
  addPlant,
  connect,
  deleteExpectation,
  linkContact,
  placePlantView,
  setExpectation,
  setQuickEntry,
  updatePin,
  updatePoint,
} from "./ops";
import { describeExpectation, formatQuickEntry, parseQuickEntry, pointRef } from "./points";
import { advance, compile, initialState, judge, search, toggle } from "./sim";
import { localGeometry, plantViewLayout } from "./symbols";
import { controlBusbars } from "./testing";
import { parseProject } from "./validate";

function project() {
  const p = newProject("t");
  const pg = p.pages[0]!.id;
  return { p, pg };
}

const roundTrip = (p: Project) => parseProject(JSON.parse(JSON.stringify(p)));

describe("pins and points", () => {
  test("quick entry guesses each point's form; editing it keeps what unchanged points had", () => {
    const q = parseQuickEntry("Mains: L N PE | Run: 1 2 | Running: C NO NC | Speed 0-10V: 3 4");
    expect(q.points.map((x) => [x.name, x.form])).toEqual([
      ["Mains", "supply-in"],
      ["Run", "powered-in"],
      ["Running", "contact"],
      ["Speed 0-10V", "analogue-in"],
    ]);
    const { p } = project();
    const item = addPlant(p, "SF-01", "Fan", q.terminals, { points: q.points });
    updatePoint(p, item.id, "Running", { form: "contact", follows: [{ ref: pointRef(item.id, "Run"), on: true }], delay: 5 });
    setQuickEntry(p, item.id, "Mains: L N PE | Run: 1 2 | Running: C NO NC | Fault: 5 6");
    const running = item.points!.find((x) => x.name === "Running")!;
    expect(running.follows).toEqual([{ ref: pointRef(item.id, "Run"), on: true }]);
    expect(running.delay).toBe(5);
    expect(item.points!.map((x) => x.name)).toEqual(["Mains", "Run", "Running", "Fault"]);
    expect(formatQuickEntry(item)).toBe("Mains: L N PE | Run: 1 2 | Running: C NO NC | Fault: 5 6");
  });

  test("a pin's id and group are drawn when present: ids in a row of boxes under the numbers", () => {
    const { p, pg } = project();
    const item = addPlant(p, "", "Relay module", ["61", "62", "64"], { prefix: "U", points: [{ name: "Fault", form: "contact", pins: ["61", "62", "64"] }] });
    updatePin(p, item.id, "61", { id: "C", group: "R1" });
    updatePin(p, item.id, "62", { id: "NC", group: "R1" });
    updatePin(p, item.id, "64", { id: "NO", group: "R1" });
    const v = placePlantView(p, pg, item.id, [20, 90]);
    const lay = plantViewLayout(v);
    expect(lay.idH).toBeGreaterThan(0);
    expect(lay.terms.map((t) => [t.name, t.pinId])).toEqual([
      ["61", "C"],
      ["62", "NC"],
      ["64", "NO"],
    ]);
    // The run is labelled by its group, else its point.
    expect(lay.groups.map((g) => g.name)).toEqual(["R1"]);
    const texts = localGeometry(v, "U?").prims.filter((x) => x.t === "text").map((x) => (x.t === "text" ? x.text : ""));
    expect(texts).toEqual(expect.arrayContaining(["61", "C", "NO", "R1"]));
    // C, NO and NC by id: the contact closes 61–64 when operated.
    const pt = item.points![0]!;
    expect(pt.pins).toEqual(["61", "62", "64"]);
  });

  test("renumbering a pin carries its wire, point and labels with it", () => {
    const { p, pg } = project();
    const { cct } = controlBusbars(p, pg);
    const item = addPlant(p, "", "DPS", ["C", "NO"], { prefix: "DPS", points: [{ name: "Proven", form: "contact", pins: ["C", "NO"] }] });
    const v = placePlantView(p, pg, item.id, [20, 90]);
    connect(p, pg, [cct.id, "20"], [v.id, "C"]);
    updatePin(p, item.id, "C", { number: "11", id: "C" });
    expect(item.terminals).toEqual(["11", "NO"]);
    expect(item.points![0]!.pins).toEqual(["11", "NO"]);
    expect(p.pages[0]!.segments.some((s) => s.to[0] === v.id && s.to[1] === "11")).toBe(true);
    expect(String(v.params.show)).toBe("11,NO");
  });

  test("points, pins and expectations survive saving and loading", () => {
    const { p, pg } = project();
    const item = addPlant(p, "", "DPS", ["C", "NO"], { prefix: "DPS", points: [{ name: "Proven", form: "contact", pins: ["C", "NO"] }], pins: { C: { id: "COM" } } });
    const k = addElement(p, pg, "coil", [40, 40]);
    setExpectation(p, { kind: "never", when: [{ ref: k.id, on: true }, { ref: pointRef(item.id, "Proven"), on: true }], join: "or" });
    const back = roundTrip(p);
    expect(back.plant[0]!.points).toEqual(item.points);
    expect(back.plant[0]!.pins).toEqual({ C: { id: "COM" } });
    expect(back.expectations).toEqual(p.expectations);
  });

});

describe("simulating points", () => {
  test("a dry input is on when its loop is closed; a powered input when there's a voltage across it", () => {
    const { p, pg } = project();
    const { cct, ov } = controlBusbars(p, pg);
    const item = addPlant(p, "", "Fire alarm", ["1", "2", "3", "4"], {
      prefix: "FA",
      points: [
        { name: "Fan running", form: "dry-in", pins: ["1", "2"] },
        { name: "Fan enable", form: "powered-in", pins: ["3", "4"] },
      ],
    });
    const v = placePlantView(p, pg, item.id, [60, 90]);
    // A volt-free contact across the dry input, and a switched 24 V across the powered one.
    const k = addElement(p, pg, "contact", [60, 40]);
    connect(p, pg, [v.id, "1"], [k.id, "13"]);
    connect(p, pg, [k.id, "14"], [v.id, "2"]);
    const sw = addElement(p, pg, "contact", [80, 30]);
    connect(p, pg, [cct.id, "80"], [sw.id, "13"]);
    connect(p, pg, [sw.id, "14"], [v.id, "3"]);
    connect(p, pg, [v.id, "4"], [ov.id, "82"]);
    const c = compile(p);
    const dry = pointRef(item.id, "Fan running");
    const powered = pointRef(item.id, "Fan enable");
    let s = initialState(c);
    expect([c.states.get(dry)!(s), c.states.get(powered)!(s)]).toEqual([false, false]);
    s = toggle(c, s, k.id);
    expect(c.states.get(dry)!(s)).toBe(true);
    s = toggle(c, s, sw.id);
    expect(c.states.get(powered)!(s)).toBe(true);
  });

  test("an expectation turns an input green or red, and waits while its plant is catching up", () => {
    const { p, pg } = project();
    const { cct, ov } = controlBusbars(p, pg);
    // A fan: run input from the panel; its airflow switch is proven 5 s after it runs.
    const fan = addPlant(p, "", "Fan", ["1", "2"], { prefix: "SF", points: [{ name: "Run", form: "powered-in", pins: ["1", "2"] }] });
    const dps = addPlant(p, "", "DPS", ["C", "NO"], { prefix: "DPS", points: [{ name: "Proven", form: "contact", pins: ["C", "NO"] }] });
    updatePoint(p, dps.id, "Proven", { follows: [{ ref: pointRef(fan.id, "Run"), on: true }], delay: 5 });
    const fv = placePlantView(p, pg, fan.id, [40, 90]);
    const dv = placePlantView(p, pg, dps.id, [80, 90]);
    const k = addElement(p, pg, "coil", [20, 60]);
    const sw = addElement(p, pg, "contact", [20, 30]);
    connect(p, pg, [cct.id, "20"], [sw.id, "13"]);
    connect(p, pg, [sw.id, "14"], [k.id, "A1"]);
    connect(p, pg, [k.id, "A2"], [ov.id, "20"]);
    const kc = addElement(p, pg, "contact", [40, 30]);
    linkContact(p, kc.id, k.id);
    connect(p, pg, [cct.id, "40"], [kc.id, "13"]);
    connect(p, pg, [kc.id, "14"], [fv.id, "1"]);
    connect(p, pg, [fv.id, "2"], [ov.id, "42"]);
    // A proving relay from the DPS.
    const pr = addElement(p, pg, "coil", [80, 60]);
    connect(p, pg, [cct.id, "80"], [dv.id, "C"]);
    connect(p, pg, [dv.id, "NO"], [pr.id, "A1"]);
    connect(p, pg, [pr.id, "A2"], [ov.id, "80"]);
    setExpectation(p, { kind: "should", point: pointRef(fan.id, "Run"), when: [{ ref: k.id, on: true }] });
    const e = p.expectations[0]!;
    expect(describeExpectation(p, e)).toMatch(/^SF\? Run should be on when K.* energised$/);
    const c = compile(p);
    let s = initialState(c);
    expect(judge(c, s, e)).toBe("ok");
    // One that depends on the DPS: it waits while the DPS catches up.
    setExpectation(p, { kind: "should", point: pointRef(fan.id, "Run"), when: [{ ref: pr.id, on: true }] });
    const e2 = p.expectations[1]!;
    const c1 = compile(p);
    s = toggle(c1, initialState(c1), sw.id);
    expect(c1.states.get(pointRef(fan.id, "Run"))!(s)).toBe(true);
    // The run input is judged at once (the DPS timing doesn't touch it)…
    expect(judge(c1, s, e)).toBe("ok");
    // …but the one about the proving relay waits until the DPS settles.
    expect(judge(c1, s, e2)).toBe("wait");
    expect(s.energised[pr.id]).toBe(false);
    s = advance(c1, s, 5);
    expect(s.energised[pr.id]).toBe(true);
    expect(judge(c1, s, e2)).toBe("ok");
    deleteExpectation(p, e2.id);
    // Drafted wrong (it says off), so with the coil in the run input is red.
    setExpectation(p, { ...e, on: false });
    const c2 = compile(p);
    expect(judge(c2, s, p.expectations[0]!)).toBe("bad");
    // Check logic finds it straight away: "off when K is in" means on when it isn't, and at rest it isn't.
    const r = search(c2, initialState(c2), p.expectations);
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0]!.path).toEqual([]);
    deleteExpectation(p, e.id);
    expect(p.expectations).toEqual([]);
  });

  test("a DC UPS: its output follows mains or battery; a fuse in BAT+ takes the backup away; battery and UPS share the bus", () => {
    const { p, pg } = project();
    const dc = addDistribution(p, { name: "24V DC", kind: "dc+", voltage: "24 V DC" });
    const ov = addDistribution(p, { name: "0V DC", kind: "dc0", voltage: "0 V" });
    // Mains from an incoming supply through an MCB, so it can be switched off.
    const sup = addElement(p, pg, "supply", [10, 6], { params: { system: "1ph-n" } });
    const q = addElement(p, pg, "isolator", [10, 14], { params: { poles: 2, function: "mcb" } });
    connect(p, pg, [sup.id, "L"], [q.id, "1"]);
    connect(p, pg, [sup.id, "N"], [q.id, "3"]);
    const ups = addPlant(p, "", "DC UPS", ["L", "N", "BAT+", "BAT-", "+V", "-V", "11", "12", "14"], {
      prefix: "G",
      points: [
        { name: "Mains", form: "supply-in", pins: ["L", "N"] },
        { name: "Battery", form: "powered-in", pins: ["BAT+", "BAT-"] },
        { name: "Output", form: "supply-out", pins: ["+V", "-V"], dists: { "+V": dc.id, "-V": ov.id } },
        { name: "AC fail", form: "contact", pins: ["11", "14", "12"] },
      ],
    });
    const bat = addPlant(p, "", "Battery", ["+", "-"], {
      prefix: "GB",
      points: [{ name: "Charge", form: "supply-out", pins: ["+", "-"], dists: { "+": dc.id } }],
    });
    updatePoint(p, ups.id, "Output", { follows: [{ ref: pointRef(ups.id, "Mains"), on: true }, { ref: pointRef(ups.id, "Battery"), on: true }], join: "or" });
    updatePoint(p, ups.id, "AC fail", { follows: [{ ref: pointRef(ups.id, "Mains"), on: false }] });
    const uv = placePlantView(p, pg, ups.id, [40, 90]);
    const bv = placePlantView(p, pg, bat.id, [100, 90]);
    connect(p, pg, [q.id, "2"], [uv.id, "L"]);
    connect(p, pg, [q.id, "4"], [uv.id, "N"]);
    const f = addElement(p, pg, "fuse", [100, 60]);
    connect(p, pg, [bv.id, "+"], [f.id, "1"]);
    connect(p, pg, [f.id, "2"], [uv.id, "BAT+"]);
    connect(p, pg, [bv.id, "-"], [uv.id, "BAT-"]);
    // A load on the 24 V DC bus, drawn as busbars on the UPS's distributions.
    const plus = addElement(p, pg, "rail", [0, 30], { params: { dist: dc.id, length: 60 } });
    const minus = addElement(p, pg, "rail", [0, 70], { params: { dist: ov.id, length: 60 } });
    const h = addElement(p, pg, "lamp", [30, 50]);
    connect(p, pg, [plus.id, "30"], [h.id, "+V"]);
    connect(p, pg, [h.id, "-V"], [minus.id, "30"]);
    const c = compile(p);
    const charge = pointRef(bat.id, "Charge");
    let s = initialState(c);
    // Mains on: the UPS output feeds the bus; AC fail is off.
    expect(s.lamps[h.id]).toBe(true);
    expect(c.states.get(pointRef(ups.id, "AC fail"))!(s)).toBe(false);
    // Battery charged too: feeding the same bus from both isn't a short.
    s = toggle(c, s, charge);
    expect(s.short).toBe(false);
    // Mains off: AC fail, and the battery holds the output up.
    s = toggle(c, s, q.id);
    expect(c.states.get(pointRef(ups.id, "AC fail"))!(s)).toBe(true);
    expect(s.lamps[h.id]).toBe(true);
    // Blow the BAT+ fuse: the backup is gone.
    s = toggle(c, s, f.id);
    expect(c.states.get(pointRef(ups.id, "Battery"))!(s)).toBe(false);
    expect(s.lamps[h.id]).toBe(false);
  });

  test("a never statement comes true", () => {
    const { p, pg } = project();
    const { cct, ov } = controlBusbars(p, pg);
    const coil = (x: number) => {
      const sw = addElement(p, pg, "contact", [x, 30]);
      const k = addElement(p, pg, "coil", [x, 60]);
      connect(p, pg, [cct.id, String(x)], [sw.id, "13"]);
      connect(p, pg, [sw.id, "14"], [k.id, "A1"]);
      connect(p, pg, [k.id, "A2"], [ov.id, String(x)]);
      return { sw, k };
    };
    const a = coil(20);
    const b = coil(40);
    setExpectation(p, { kind: "never", when: [{ ref: a.k.id, on: true }, { ref: b.k.id, on: true }], join: "and" });
    const c = compile(p);
    const e = p.expectations[0]!;
    let s = toggle(c, initialState(c), a.sw.id);
    expect(judge(c, s, e)).toBe("ok");
    s = toggle(c, s, b.sw.id);
    expect(judge(c, s, e)).toBe("bad");
  });

  test("should be … when … is only for inputs", () => {
    const { p, pg } = project();
    const item = addPlant(p, "", "DPS", ["C", "NO"], { prefix: "DPS", points: [{ name: "Proven", form: "contact", pins: ["C", "NO"] }] });
    const k = addElement(p, pg, "coil", [40, 40]);
    expect(() => setExpectation(p, { kind: "should", point: pointRef(item.id, "Proven"), when: [{ ref: k.id, on: true }] })).toThrow(/isn't an input/);
  });
});

describe("checks", () => {
  test("a dry input on a live conductor is an error; unwired inputs warn; unwired outputs are spare", () => {
    const { p, pg } = project();
    const { cct, ov } = controlBusbars(p, pg);
    const h = addElement(p, pg, "lamp", [20, 50]);
    connect(p, pg, [cct.id, "20"], [h.id, "+V"]);
    connect(p, pg, [h.id, "-V"], [ov.id, "20"]);
    const item = addPlant(p, "", "Fire alarm", ["1", "2", "3", "4", "5", "6"], {
      prefix: "FA",
      points: [
        { name: "Fan running", form: "dry-in", pins: ["1", "2"] },
        { name: "Damper shut", form: "dry-in", pins: ["3", "4"] },
        { name: "Alarm", form: "contact", pins: ["5", "6"] },
      ],
    });
    const v = placePlantView(p, pg, item.id, [60, 90]);
    connect(p, pg, [cct.id, "60"], [v.id, "1"]);
    const k = addElement(p, pg, "coil", [40, 40]);
    setExpectation(p, { kind: "never", when: [{ ref: k.id, on: true }] });
    p.pages[0]!.elements = p.pages[0]!.elements.filter((e) => e.id !== k.id);
    const found = checkProject(p).map((f) => `${f.level}: ${f.message}`);
    expect(found).toContainEqual(expect.stringMatching(/^error: Plant FA\?: dry input Fan running is wired to a live conductor/));
    expect(found).toContainEqual(expect.stringMatching(/^warning: Plant FA\?: input Damper shut isn't wired/));
    expect(found).toContainEqual(expect.stringMatching(/^info: Plant FA\?: output Alarm isn't wired to anything \(spare\)/));
    expect(found).toContainEqual(expect.stringMatching(/^error: Expectation .* names something that isn't on the drawing/));
  });
});
