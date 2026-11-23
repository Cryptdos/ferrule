import { describe, expect, test } from "bun:test";
import { newProject } from "./model";
import {
  addElement,
  addPage,
  addPlant,
  addSection,
  connect,
  deletePlant,
  linkContact,
  placePlantView,
  setBoundary,
  setPlantViewTerminals,
  updatePlant,
  updateSection,
} from "./ops";
import { checkProject } from "./checks";
import { resolveFields } from "./fields";
import { cableSchedule, terminalSchedule, toCsv } from "./schedules";
import { renumber } from "./renumber";
import { elementTexts } from "./tags";
import { localGeometry } from "./symbols";

function fan() {
  const p = newProject("t");
  const pg = p.pages[0]!.id;
  const sf = addPlant(p, "SF-01", "Supply fan 1", ["U", "V", "W", "PE", "1", "2"]);
  return { p, pg, sf };
}

describe("plant", () => {
  test("a view shows the ticked terminals, with a break line when some are hidden", () => {
    const { p, pg, sf } = fan();
    const v = placePlantView(p, pg, sf.id, [40, 90], ["U", "V", "W", "PE"]);
    const g = localGeometry(v, elementTexts(v, p));
    expect(g.terminals.map((t) => t.name)).toEqual(["U", "V", "W", "PE"]);
    expect(elementTexts(v, p).tag).toBe("SF-01");
    const all = placePlantView(p, pg, sf.id, [100, 90]);
    const zigzag = (el: typeof v) => localGeometry(el, "").prims.filter((x) => x.t === "line" && x.pts.length > 4).length;
    expect(zigzag(v)).toBe(1);
    expect(zigzag(all)).toBe(0);
  });

  test("renaming the plant renames every view and label field", () => {
    const { p, pg, sf } = fan();
    const v = placePlantView(p, pg, sf.id, [40, 90]);
    const sec = addSection(p, pg, `{plant:${sf.id}.tag} SECTION`, [0, 0, 100, 60]);
    updatePlant(p, sf.id, { tag: "SF-1A" });
    expect(elementTexts(v, p).tag).toBe("SF-1A");
    expect(resolveFields(sec.label, p)).toBe("SF-1A SECTION");
    expect(resolveFields("{plant:SF-1A.description}", p)).toBe("Supply fan 1");
  });

  test("hiding or removing a terminal drops its wires", () => {
    const { p, pg, sf } = fan();
    const v = placePlantView(p, pg, sf.id, [40, 90]);
    const x = addElement(p, pg, "terminal", [40, 80]);
    connect(p, pg, [x.id, "2"], [v.id, "U"]);
    setPlantViewTerminals(p, pg, v.id, ["V", "W"]);
    expect(p.pages[0]!.segments).toHaveLength(0);
    connect(p, pg, [x.id, "2"], [v.id, "V"]);
    updatePlant(p, sf.id, { terminals: ["U", "W"] });
    expect(p.pages[0]!.segments).toHaveLength(0);
    deletePlant(p, sf.id);
    expect(p.pages[0]!.elements.some((e) => e.symbol === "plant-view")).toBe(false);
  });

  test("plant tags must be unique", () => {
    const { p } = fan();
    expect(() => addPlant(p, "SF-01")).toThrow();
  });
});

describe("panel boundary and checks", () => {
  test("elements below the boundary are external; crossings need a terminal", () => {
    const { p, pg, sf } = fan();
    setBoundary(p, pg, 80);
    const k = addElement(p, pg, "contact-no", [40, 60]);
    const v = placePlantView(p, pg, sf.id, [40, 95], ["1", "2"]);
    expect(k.zone).toBe("internal");
    expect(v.zone).toBe("external");
    connect(p, pg, [k.id, "14"], [v.id, "1"]);
    const f = checkProject(p);
    expect(f.some((x) => x.level === "error" && x.message.includes("crosses the panel boundary"))).toBe(true);
    // Through a terminal on the boundary is fine.
    const p2 = fan();
    setBoundary(p2.p, p2.pg, 80);
    const k2 = addElement(p2.p, p2.pg, "contact-no", [40, 60]);
    const x = addElement(p2.p, p2.pg, "terminal", [40, 80]);
    const v2 = placePlantView(p2.p, p2.pg, p2.sf.id, [40, 95], ["1", "2"]);
    connect(p2.p, p2.pg, [k2.id, "14"], [x.id, "1"]);
    connect(p2.p, p2.pg, [x.id, "2"], [v2.id, "1"]);
    expect(checkProject(p2.p).some((x) => x.message.includes("crosses"))).toBe(false);
  });

  test("plant terminals not shown, or shown twice, are flagged", () => {
    const { p, pg, sf } = fan();
    const pg2 = addPage(p, "Controls").id;
    placePlantView(p, pg, sf.id, [40, 95], ["U", "V", "W", "PE", "1"]);
    placePlantView(p, pg2, sf.id, [40, 95], ["1"]);
    const msgs = checkProject(p).map((f) => f.message);
    expect(msgs).toContain("Plant SF-01: terminal 2 not shown on any sheet");
    expect(msgs.some((m) => m.includes("terminal 1 is shown on more than one sheet"))).toBe(true);
  });

  test("coils without contacts, loose contacts and duplicate tags are flagged", () => {
    const { p, pg } = fan();
    const k = addElement(p, pg, "coil", [20, 20], { tag: "K1" });
    const c = addElement(p, pg, "contact-no", [40, 20]);
    addElement(p, pg, "lamp", [60, 20], { tag: "K1" });
    let msgs = checkProject(p).map((f) => f.message);
    expect(msgs.some((m) => m.includes("coil K1 has no contacts"))).toBe(true);
    expect(msgs.some((m) => m.includes("isn't driven by a coil"))).toBe(true);
    expect(msgs.some((m) => m.startsWith("Tag K1 is used 2 times"))).toBe(true);
    linkContact(p, c.id, k.id);
    msgs = checkProject(p).map((f) => f.message);
    expect(msgs.some((m) => m.includes("has no contacts"))).toBe(false);
  });
});

describe("sections and schedules", () => {
  test("sections stay on the page and keep a minimum size", () => {
    const { p, pg } = fan();
    const s = addSection(p, pg, "MAIN", [140, 80, 30, 30]);
    expect(s.rect).toEqual([120, 60, 30, 30]);
    updateSection(p, pg, s.id, { rect: [10, 10, 1, 1] });
    expect(s.rect).toEqual([10, 10, 4, 4]);
  });

  test("terminal and cable schedules", () => {
    const { p, pg, sf } = fan();
    setBoundary(p, pg, 80);
    const k = addElement(p, pg, "contact-no", [40, 60]);
    const x = addElement(p, pg, "terminal", [40, 80]);
    const v = placePlantView(p, pg, sf.id, [40, 95], ["1", "2"]);
    connect(p, pg, [k.id, "14"], [x.id, "1"]);
    connect(p, pg, [x.id, "2"], [v.id, "1"]);
    renumber(p);
    const t = terminalSchedule(p);
    expect(t).toEqual([{ strip: "X1", terminal: "1-21", where: "1-21", wire: "1-21", internal: "K1-21:14", external: "SF-01:1" }]);
    const c = cableSchedule(p);
    expect(c).toEqual([{ plant: "SF-01", description: "Supply fan 1", plantTerminal: "1", wire: "1-21", panelTerminal: "X1:1-21", where: "1-21" }]);
    expect(toCsv(c, [["plant", "Plant"], ["wire", "Wire"]])).toBe("Plant,Wire\nSF-01,1-21\n");
  });
});
