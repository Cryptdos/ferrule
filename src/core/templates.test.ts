import { describe, expect, test } from "bun:test";
import { newProject } from "./model";
import { addCloud, addElement, addPlant, addRevision, addSection, cloudsOn, connect, linkContact, placePlantView, setBoundary } from "./ops";
import { renumber } from "./renumber";
import { resolveFields } from "./fields";
import { elementTexts } from "./tags";
import { importTemplate, saveSectionTemplate, saveSheetTemplate, stampTemplate, templateFile } from "./templates";
import { parseProject, parseTemplate } from "./validate";
import { checkProject } from "./checks";

/** A fan starter sheet for SF-01, the way benchmark sheets 3–6 look. */
function starter() {
  const p = newProject("t");
  const pg = p.pages[0]!;
  pg.title = "{plant:SF-01.tag} starter";
  const sf = addPlant(p, "SF-01", "Supply fan 1", ["U", "V", "W", "PE"]);
  setBoundary(p, pg.id, 90);
  addSection(p, pg.id, `{plant:${sf.id}.tag} SECTION`, [2, 2, 100, 84]);
  const k = addElement(p, pg.id, "coil", [60, 60]);
  const km = addElement(p, pg.id, "isolator", [20, 50], { params: { function: "contactor" } });
  linkContact(p, km.id, k.id);
  const x = addElement(p, pg.id, "terminal", [20, 90]);
  const v = placePlantView(p, pg.id, sf.id, [20, 100]);
  connect(p, pg.id, [km.id, "2"], [x.id, "1"]);
  connect(p, pg.id, [x.id, "2"], [v.id, "U"]);
  const h = addElement(p, pg.id, "lamp", [40, 60], { label: `{plant:${sf.id}.tag} RUNNING` });
  return { p, pg, sf, k, km, h };
}

describe("sheet templates", () => {
  test("stamp a starter for another fan: new plant, fresh tags, links kept, labels follow", () => {
    const { p, pg } = starter();
    const t = saveSheetTemplate(p, pg.id, "Fan starter");
    expect(t.plant.map((x) => x.tag)).toEqual(["SF-01"]);
    const { page } = stampTemplate(p, t.id, { plant: { [t.plant[0]!.id]: { newTag: "SF-02", description: "Supply fan 2" } } });
    expect(page.number).toBe(2);
    expect(page.title).toBe("{plant:" + p.plant[1]!.id + ".tag} starter");
    expect(resolveFields(page.title, p)).toBe("SF-02 starter");
    expect(page.boundaryY).toBe(90);
    expect(resolveFields(page.sections[0]!.label, p)).toBe("SF-02 SECTION");
    const view = page.elements.find((e) => e.symbol === "plant-view")!;
    expect(elementTexts(view, p).tag).toBe("SF-02");
    const lamp = page.elements.find((e) => e.symbol === "lamp")!;
    expect(elementTexts(lamp, p).label).toBe("SF-02 RUNNING");
    // The contactor still follows its own (new) coil.
    const coil = page.elements.find((e) => e.symbol === "coil")!;
    const main = page.elements.find((e) => e.symbol === "isolator")!;
    expect(main.links).toEqual([coil.id]);
    expect(page.segments).toHaveLength(2);
    renumber(p);
    expect(coil.tag).toBe("K2-31");
    expect(checkProject(p).filter((f) => f.level === "error")).toEqual([]);
  });

  test("a stamp is a copy: editing the template's source later changes nothing", () => {
    const { p, pg, h } = starter();
    const t = saveSheetTemplate(p, pg.id, "Fan starter");
    h.label = "CHANGED";
    expect(t.elements.find((e) => e.symbol === "lamp")!.label).toContain("RUNNING");
  });

  test("map to existing plant, or leave unmapped to keep pointing at the same plant", () => {
    const { p, pg, sf } = starter();
    const ef = addPlant(p, "EF-01", "Extract fan 1", ["U", "V", "W", "PE"]);
    const t = saveSheetTemplate(p, pg.id, "Fan starter");
    const a = stampTemplate(p, t.id, { plant: { [sf.id]: { plant: ef.id } } });
    expect(a.page.elements.find((e) => e.symbol === "plant-view")!.params.plant).toBe(ef.id);
    const b = stampTemplate(p, t.id);
    expect(b.page.elements.find((e) => e.symbol === "plant-view")!.params.plant).toBe(sf.id);
  });
});

describe("section templates", () => {
  test("save what's in a section box and stamp it elsewhere on a sheet", () => {
    const { p, pg } = starter();
    const sec = pg.sections[0]!;
    const t = saveSectionTemplate(p, pg.id, sec.id, "");
    expect(t.kind).toBe("section");
    expect(t.size).toEqual([100, 84]);
    // Plant view at y 100 is outside the box.
    expect(t.elements.some((e) => e.symbol === "plant-view")).toBe(false);
    const before = pg.elements.length;
    const r = stampTemplate(p, t.id, { pageId: pg.id, at: [100, 2] });
    expect(pg.elements.length).toBe(before + r.elementIds.length);
    const coil = pg.elements.find((e) => e.id === r.elementIds.find((id) => pg.elements.find((x) => x.id === id)?.symbol === "coil"));
    expect(coil!.pos).toEqual([158, 60]);
    expect(pg.sections).toHaveLength(2);
  });
});

describe("library files and clouds", () => {
  test("templates survive save/load and library export/import", () => {
    const { p, pg } = starter();
    const t = saveSheetTemplate(p, pg.id, "Fan starter");
    const back = parseProject(JSON.parse(JSON.stringify(p)));
    expect(back.templates[0]!.elements.length).toBe(t.elements.length);
    const file = JSON.parse(JSON.stringify(templateFile(t)));
    const q = newProject("other");
    const imported = importTemplate(q, parseTemplate(file.template));
    const { page } = stampTemplate(q, imported.id);
    expect(q.plant.map((x) => x.tag)).toEqual(["SF-01"]);
    expect(page.elements.length).toBe(t.elements.length);
  });

  test("clouds belong to the latest revision; older ones aren't drawn", () => {
    const { p, pg } = starter();
    addCloud(p, pg.id, [10, 10, 20, 10]);
    expect(cloudsOn(p, pg.id)).toHaveLength(1);
    expect(cloudsOn(p, pg.id)[0]!.rev).toBe("A");
    addRevision(p);
    expect(cloudsOn(p, pg.id)).toHaveLength(0);
    addCloud(p, pg.id, [40, 40, -10, -10]);
    expect(cloudsOn(p, pg.id)[0]!.rect).toEqual([30, 30, 10, 10]);
  });
});
