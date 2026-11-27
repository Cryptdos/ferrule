/**
 * Templates (DESIGN.md §2, §4): draw a sheet or a section once, then stamp
 * it out again for other plant, with fresh tags.
 *
 * A template is a copy, so later edits to the original drawing never change
 * it, and stamping copies again, so later edits to the template never
 * change what was stamped. Plant is re-pointed when stamping: each plant
 * item the template refers to is mapped to an existing item or a new one.
 */
import { fitBlock, spreadBlock } from "./blocks";
import { tidyDesign } from "./design";
import { refreshConductors } from "./conductors";
import { fieldPlantRefs, remapFields } from "./fields";
import { AREA_UNITS, type Vec, pointInRect } from "./geometry";
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
import type { ProjectDevice } from "./devices";
import { OpError, addPage, addPlant, distParamKeys, getPage, prefixOf, syncPlantViews, updateZones } from "./ops";
import { isMaster, isSlave, locate } from "./xref";

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
  // A controller's module views stay with their controller: a template carries plant, not controllers.
  const isModuleView = (e: Element) => e.symbol === "plant-view" && !!project.plant.find((p) => p.id === e.params.plant)?.module;
  elements = elements.filter((e) => !isModuleView(e));
  const keep = new Set(elements.map((e) => e.id));
  const segments = page.segments.filter((s) => keep.has(s.from[0]) && keep.has(s.to[0]));
  const shift = (v: Vec): Vec => [v[0] - offset[0], v[1] - offset[1]];
  // A contact keeps its link out to a coil that isn't in the template (v0.4.x T6): a shared relay. Arrows' links out go.
  const coilOut = (e: Element, l: string) => isSlave(e) && !keep.has(l) && (() => {
    const m = locate(project, l);
    return !!m && isMaster(m.el);
  })();
  const els = clone(elements).map((e) => ({ ...e, pos: shift(e.pos), links: e.links.filter((l) => keep.has(l) || coilOut(e, l)) }));
  const segs = clone(segments).map((s) => ({ ...s, conductor: "", points: s.points.map(shift) }));
  const secs = clone(sections).map((s) => ({ ...s, rect: [s.rect[0] - offset[0], s.rect[1] - offset[1], s.rect[2], s.rect[3]] as Section["rect"] }));
  const refs = plantRefs(els, secs);
  // Plant named in fields by tag (rather than id) is captured too.
  const plant = project.plant.filter((p) => refs.has(p.id) || refs.has(p.tag));
  const distIds = new Set(els.flatMap((e) => distParamKeys(e).map((k) => e.params[k])));
  const distributions = project.distributions.filter((d) => distIds.has(d.id));
  return {
    id: newId("tpl"),
    name: name.trim() || page.title || "Template",
    kind,
    // Plant, not controllers: no module, and no channels (allocation belongs to the project it's in).
    plant: clone(plant).map(({ module: _m, ...p }) => ({ ...p, ...(p.points ? { points: p.points.map(({ channel: _c, ...q }) => q) } : {}) })),
    title: page.title,
    boundaryY: kind === "sheet" ? page.boundaryY : null,
    sections: secs,
    elements: els,
    segments: segs,
    size,
    ...(distributions.length ? { distributions: clone(distributions) } : {}),
    ...devicesFor(project, [...els.map((e) => e.device), ...plant.map((p) => p.device)]),
  };
}

/** The devices a template's parts and plant are, to bring with it (v0.5 A70). */
export function devicesFor(project: Project, ids: (string | undefined)[]): { devices?: ProjectDevice[] } {
  const want = new Set(ids.filter((x): x is string => !!x));
  const devices = (project.devices ?? []).filter((d) => want.has(d.id));
  return devices.length ? { devices: clone(devices) } : {};
}

/** A template's devices the project hasn't got: they come in with it, as a library device does. */
export function bringDevices(project: Project, devices: ProjectDevice[] | undefined): void {
  for (const d of devices ?? []) if (!project.devices?.some((x) => x.id === d.id)) (project.devices ??= []).push(clone(d));
}

/** Save a whole sheet as a template. */
export function saveSheetTemplate(project: Project, pageId: string, name: string): Template {
  const page = getPage(project, pageId);
  const t = capture(project, name, "sheet", page, page.elements, page.sections, [0, 0], [AREA_UNITS.w, AREA_UNITS.h]);
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
  /** Contacts that kept their link to a coil outside the stamp (v0.4.x T6). */
  kept: { contact: string; coil: string }[];
  /** Stamped arrows with no partner, and contacts whose coil isn't in this project: to link by hand. */
  relink: string[];
}

/**
 * Stamp a template. Every element gets a new id and loses its tag (Renumber
 * gives it a new one); links inside the stamp are kept. Links out of it:
 * a contact's to a coil that's in this project is kept (a shared relay),
 * an arrow's is dropped (arrows pair one to one), and the result lists
 * both, to check and to link again. Plant is re-pointed per the mapping; plant with no mapping
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
      // Letters only (SF): a prefix, and Renumber gives the tag. A full tag (SF-02) is kept as typed.
      const typed = /\d/.test(m.newTag) ? m.newTag : "";
      // Its points follow its own points by ref: those move to the new item.
      const own = `plant:${item.id}:`;
      // A copy isn't on its original's channels: allocation is by hand (design-v0.4 §4).
      const points = clone(item.points ?? []).map(({ channel: _c, ...pt }) => ({
        ...pt,
        ...(pt.follows ? { follows: pt.follows.map((c) => (c.ref.startsWith(own) ? { ...c, ref: `plant:@new:${c.ref.slice(own.length)}` } : c)) } : {}),
      }));
      target = addPlant(project, typed, m.description ?? item.description, item.terminals, {
        points,
        pins: item.pins,
        info: item.info,
        prefix: prefixOf(m.newTag) || item.prefix || "U",
        powerByOthers: item.powerByOthers,
      });
      if (typed) target.locked = true;
      for (const pt of target.points ?? []) for (const c of pt.follows ?? []) if (c.ref.startsWith("plant:@new:")) c.ref = `plant:${target.id}:${c.ref.slice(11)}`;
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

  bringDevices(project, t.devices);
  // Resolve distributions: the same one if it's in this project, else one of the same name, else a copy.
  const distMap = new Map<string, string>();
  for (const d of t.distributions ?? []) {
    let target = project.distributions.find((x) => x.id === d.id) ?? project.distributions.find((x) => x.name === d.name);
    if (!target) {
      target = clone(d);
      project.distributions.push(target);
    }
    distMap.set(d.id, target.id);
  }

  // Coils outside the stamp that its contacts are on (v0.4.x T6), found before
  // the new sheet is made: walking the sheets after would read the new one
  // through the editor's state before its parts are on it.
  const coils = new Map<string, Element>();
  for (const src of t.elements) {
    if (!isSlave(src)) continue;
    for (const l of src.links) {
      if (t.elements.some((e) => e.id === l)) continue;
      const m = locate(project, l);
      if (m && isMaster(m.el)) coils.set(l, m.el);
    }
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
  const kept: StampResult["kept"] = [];
  const relink: string[] = [];
  const elements: Element[] = t.elements.map((src) => {
    const el = clone(src);
    el.id = ids.get(src.id)!;
    el.pos = shift(src.pos);
    el.tag = "";
    delete el.params.locked;
    delete el.params.pole;
    el.links = src.links.map((l) => ids.get(l)).filter((l): l is string => !!l);
    // A contact's coil outside the stamp, still in this project: linked on both sides.
    if (isSlave(src)) {
      for (const l of src.links) {
        if (ids.has(l)) continue;
        const coil = coils.get(l);
        if (coil) {
          el.links.push(l);
          coil.links.push(el.id);
          kept.push({ contact: el.id, coil: l });
        } else relink.push(el.id);
      }
    }
    if (el.symbol === "link" && !el.links.length) relink.push(el.id);
    el.label = remapFields(el.label, plantMap);
    if (el.symbol === "plant-view" && typeof el.params.plant === "string") {
      el.params.plant = plantMap.get(el.params.plant) ?? el.params.plant;
    }
    for (const k of distParamKeys(el)) {
      const v = el.params[k];
      if (typeof v === "string" && distMap.has(v)) el.params[k] = distMap.get(v)!;
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
  spreadBlock(page);
  fitBlock(page);
  syncPlantViews(project);
  refreshConductors(project);
  tidyDesign(project);
  return { page, elementIds: elements.map((e) => e.id), kept, relink };
}

/** A template as a library file. */
export function templateFile(t: Template): { format: "ferrule-template"; version: 1; template: Template } {
  return { format: "ferrule-template", version: 1, template: clone(t) };
}
