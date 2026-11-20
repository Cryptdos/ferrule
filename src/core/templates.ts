/**
 * Templates (DESIGN.md §2, §4): draw a sheet or a section once, then stamp
 * it out again for other plant, with fresh tags.
 *
 * A template is a copy, so later edits to the original drawing never change
 * it, and stamping copies again, so later edits to the template never
 * change what was stamped. Plant is re-pointed when stamping: each plant
 * item the template refers to is mapped to an existing item or a new one.
 */
import { refreshConductors } from "./conductors";
import { fieldPlantRefs, remapFields } from "./fields";
import { type Vec, pointInRect } from "./geometry";
import {
  type Element,
  type Page,
  type PlantItem,
  type Project,
  type Section,
  type Segment,
  type Template,
  newId,
} from "./model";
import { OpError, addPage, addPlant, getPage, syncPlantViews, updateZones } from "./ops";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** Plant ids an area of drawing refers to: plant views and {plant:…} fields. */
function plantRefs(elements: Element[], sections: Section[]): Set<string> {
  const ids = new Set<string>();
  for (const el of elements) {
    if (el.symbol === "plant-view" && typeof el.params.plant === "string") ids.add(el.params.plant);
    for (const r of fieldPlantRefs(el.label)) ids.add(r);
  }
  for (const s of sections) for (const r of fieldPlantRefs(s.label)) ids.add(r);
  return ids;
}

function capture(
  project: Project,
  name: string,
  kind: Template["kind"],
  page: Page,
  elements: Element[],
  sections: Section[],
  offset: Vec,
  size: [number, number],
): Template {
  const keep = new Set(elements.map((e) => e.id));
  const segments = page.segments.filter((s) => keep.has(s.from[0]) && keep.has(s.to[0]));
  const shift = (v: Vec): Vec => [v[0] - offset[0], v[1] - offset[1]];
  const els = clone(elements).map((e) => ({ ...e, pos: shift(e.pos), links: e.links.filter((l) => keep.has(l)) }));
  const segs = clone(segments).map((s) => ({ ...s, conductor: "", points: s.points.map(shift) }));
  const secs = clone(sections).map((s) => ({ ...s, rect: [s.rect[0] - offset[0], s.rect[1] - offset[1], s.rect[2], s.rect[3]] as Section["rect"] }));
  const refs = plantRefs(els, secs);
  // Plant named in fields by tag (rather than id) is captured too.
  const plant = project.plant.filter((p) => refs.has(p.id) || refs.has(p.tag));
  return {
    id: newId("tpl"),
    name: name.trim() || page.title || "Template",
    kind,
    plant: clone(plant),
    title: page.title,
    boundaryY: kind === "sheet" ? page.boundaryY : null,
    sections: secs,
    elements: els,
    segments: segs,
    size,
  };
}

/** Save a whole sheet as a template. */
export function saveSheetTemplate(project: Project, pageId: string, name: string): Template {
  const page = getPage(project, pageId);
  const t = capture(project, name, "sheet", page, page.elements, page.sections, [0, 0], [200, 112]);
  project.templates.push(t);
  return t;
}

/** Save what's inside a section box (the box included) as a template. */
export function saveSectionTemplate(project: Project, pageId: string, sectionId: string, name: string): Template {
  const page = getPage(project, pageId);
  const sec = page.sections.find((s) => s.id === sectionId);
  if (!sec) throw new OpError("Pick a section box to save");
  const [x, y, w, h] = sec.rect;
  const r = { x, y, w, h };
  const inside = page.elements.filter((e) => pointInRect(e.pos, r));
  const t = capture(project, name || sec.label, "section", page, inside, [sec], [x, y], [w, h]);
  project.templates.push(t);
  return t;
}

export function renameTemplate(project: Project, id: string, name: string): void {
  const t = project.templates.find((x) => x.id === id);
  if (!t) throw new OpError(`No template "${id}"`);
  t.name = name.trim() || t.name;
}

export function deleteTemplate(project: Project, id: string): void {
  project.templates = project.templates.filter((t) => t.id !== id);
}

/** Bring a template (e.g. from the library) into the project as a copy. */
export function importTemplate(project: Project, template: Template): Template {
  const t = { ...clone(template), id: newId("tpl") };
  project.templates.push(t);
  return t;
}

/** Where each of the template's plant items goes: an existing plant id, or a new item with this tag. */
export type PlantMapping = Record<string, { plant: string } | { newTag: string; description?: string }>;

export interface StampOptions {
  /** Sheet templates: insert the new sheet after this one (default: at the end). */
  afterPageId?: string;
  /** Section templates: the sheet to stamp onto, and the top-left corner. */
  pageId?: string;
  at?: Vec;
  plant?: PlantMapping;
  /** Title for a new sheet; defaults to the template's, with plant fields allowed. */
  title?: string;
}

export interface StampResult {
  page: Page;
  elementIds: string[];
}

/**
 * Stamp a template. Every element gets a new id and loses its tag (Renumber
 * gives it a new one); links inside the stamp are kept, links out of it
 * are dropped. Plant is re-pointed per the mapping; plant with no mapping
 * keeps pointing at the same item if it exists in this project, or is
 * added to the project as it was saved.
 */
export function stampTemplate(project: Project, templateId: string, opts: StampOptions = {}): StampResult {
  const t = project.templates.find((x) => x.id === templateId);
  if (!t) throw new OpError(`No template "${templateId}"`);

  // Resolve plant.
  const plantMap = new Map<string, string>();
  for (const item of t.plant) {
    const m = opts.plant?.[item.id];
    let target: PlantItem | undefined;
    if (m && "plant" in m) {
      target = project.plant.find((p) => p.id === m.plant);
      if (!target) throw new OpError(`No plant item "${m.plant}"`);
    } else if (m && "newTag" in m) {
      target = addPlant(project, m.newTag, m.description ?? item.description, item.terminals);
    } else {
      target = project.plant.find((p) => p.id === item.id) ?? project.plant.find((p) => p.tag === item.tag);
      if (!target) {
        target = { ...clone(item) };
        project.plant.push(target);
      }
    }
    plantMap.set(item.id, target.id);
    plantMap.set(item.tag, target.id);
  }

  let page: Page;
  let offset: Vec = [0, 0];
  if (t.kind === "sheet") {
    page = addPage(project, remapFields(opts.title ?? t.title, plantMap), opts.afterPageId);
    page.boundaryY = t.boundaryY;
  } else {
    if (!opts.pageId) throw new OpError("Pick the sheet to stamp the section onto");
    page = getPage(project, opts.pageId);
    offset = [Math.round(opts.at?.[0] ?? 0), Math.round(opts.at?.[1] ?? 0)];
  }
  const shift = (v: Vec): Vec => [v[0] + offset[0], v[1] + offset[1]];

  const ids = new Map<string, string>();
  for (const el of t.elements) ids.set(el.id, newId("e"));
  const elements: Element[] = t.elements.map((src) => {
    const el = clone(src);
    el.id = ids.get(src.id)!;
    el.pos = shift(src.pos);
    el.tag = "";
    delete el.params.locked;
    delete el.params.pole;
    el.links = src.links.map((l) => ids.get(l)).filter((l): l is string => !!l);
    el.label = remapFields(el.label, plantMap);
    if (el.symbol === "plant-view" && typeof el.params.plant === "string") {
      el.params.plant = plantMap.get(el.params.plant) ?? el.params.plant;
    }
    return el;
  });
  const segments: Segment[] = t.segments
    .filter((s) => ids.has(s.from[0]) && ids.has(s.to[0]))
    .map((src) => ({
      ...clone(src),
      id: newId("w"),
      conductor: "",
      from: [ids.get(src.from[0])!, src.from[1]],
      to: [ids.get(src.to[0])!, src.to[1]],
      points: src.points.map(shift),
    }));
  const sections: Section[] = t.sections.map((s) => ({
    id: newId("sec"),
    label: remapFields(s.label, plantMap),
    rect: [s.rect[0] + offset[0], s.rect[1] + offset[1], s.rect[2], s.rect[3]],
  }));

  page.elements.push(...elements);
  page.segments.push(...segments);
  page.sections.push(...sections);
  updateZones(page);
  syncPlantViews(project);
  refreshConductors(project);
  return { page, elementIds: elements.map((e) => e.id) };
}

/** A template as a library file. */
export function templateFile(t: Template): { format: "ferrule-template"; version: 1; template: Template } {
  return { format: "ferrule-template", version: 1, template: clone(t) };
}
