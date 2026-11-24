/**
 * Controller modules (controller.md §4, §5): the generic module types, the
 * generator that fills a module's pins table from a pattern, and where a
 * module and its points are drawn, for references like `A3-23:DI2` that
 * always land where the point is.
 *
 * A module is a plant item with `module` set, so it's wired, scheduled and
 * simulated like any plant; its controller lists it in rail order.
 */
import { columnOf } from "./geometry";
import { POINT_FORMS } from "./model";
import type { Controller, Element, IoPoint, ModuleInfo, ModuleType, Page, PinInfo, PlantItem, PointForm, Project } from "./model";

export const MODULE_TYPES: {
  value: ModuleType;
  label: string;
  /** Short name, with the channel count after it: DI-8. */
  short: string;
  /** Heading over its channels on the drawing. */
  heading: string;
  /** Has a channel count. */
  channels: boolean;
}[] = [
  { value: "psu", label: "Power supply", short: "PSU", heading: "Power supply", channels: false },
  { value: "host", label: "Host", short: "Host", heading: "Host", channels: false },
  { value: "di", label: "Digital inputs", short: "DI", heading: "Digital inputs", channels: true },
  { value: "do", label: "Digital outputs", short: "DO", heading: "Digital outputs", channels: true },
  { value: "uio", label: "Universal IO", short: "UIO", heading: "Universal IO", channels: true },
  { value: "ai", label: "Analogue inputs", short: "AI", heading: "Analogue inputs", channels: true },
  { value: "ao", label: "Analogue outputs", short: "AO", heading: "Analogue outputs", channels: true },
];

export const moduleType = (t: ModuleType) => MODULE_TYPES.find((m) => m.value === t) ?? MODULE_TYPES[1]!;

/** The module's type as written: DI-8, UIO-16, Host, PSU. */
export function moduleTypeName(m: Pick<ModuleInfo, "type" | "channels">): string {
  const t = moduleType(m.type);
  return t.channels && m.channels ? `${t.short}-${m.channels}` : t.short;
}

// ---------------------------------------------------------------------------
// The generator

/**
 * A pattern for a module's pins (controller.md §4): so many channels, each
 * with the same pin ids, numbered on from the first pin number, grouped by
 * a name pattern (`AO#` → AO1, AO2…). A shared pin (a common `⊥` or `C`)
 * is one pin for every `shareBy` channels.
 */
export interface ModulePattern {
  channels: number;
  /** Pin ids per channel, in order: "VO RET CO", "IO C", "Y ⊥". */
  ids: string;
  /** The first pin number. */
  first: number;
  /** Group and point name, # for the channel: "DI#" → DI1, DI2… */
  group: string;
  /** The first channel's number (numbering per controller can start later on later modules). */
  start?: number;
  /** Ids of pins shared by several channels, e.g. "⊥". */
  shared?: string;
  /** How many channels share each shared pin (2: channels 1–2 share one, 3–4 the next…). */
  shareBy?: number;
  /** Each channel's form. */
  form: PointForm;
}

/** What a type usually looks like, as a starting point: always edited to match the datasheet. */
export function defaultPattern(type: ModuleType, channels = 8): ModulePattern {
  switch (type) {
    case "di":
      return { channels, ids: "I C", first: 1, group: "DI#", form: "dry-in", shared: "C", shareBy: 2 };
    case "do":
      return { channels, ids: "C NO", first: 1, group: "DO#", form: "contact" };
    case "uio":
      return { channels, ids: "IO C", first: 1, group: "IO#", form: "dry-in", shared: "C", shareBy: 2 };
    case "ai":
      return { channels, ids: "I C", first: 1, group: "AI#", form: "analogue-in", shared: "C", shareBy: 2 };
    case "ao":
      return { channels, ids: "VO RET", first: 1, group: "AO#", form: "analogue-out" };
    case "psu":
      return { channels: 0, ids: "L N", first: 1, group: "", form: "supply-in" };
    default:
      return { channels: 0, ids: "", first: 1, group: "", form: "dry-in" };
  }
}

/** The pins and points a pattern makes. */
export function generatePins(p: ModulePattern): { terminals: string[]; pins: Record<string, PinInfo>; points: IoPoint[] } {
  const ids = p.ids.split(/\s+/).filter(Boolean);
  const shared = new Set((p.shared ?? "").split(/\s+/).filter(Boolean));
  const by = Math.max(1, Math.floor(p.shareBy ?? 1));
  const n = Math.max(0, Math.min(64, Math.floor(p.channels)));
  const start = Math.floor(p.start ?? 1);
  const terminals: string[] = [];
  const pins: Record<string, PinInfo> = {};
  const points: IoPoint[] = [];
  let next = Math.max(0, Math.floor(p.first));
  const sharedPin = new Map<string, string>();
  for (let i = 0; i < n; i++) {
    const ch = start + i;
    const group = p.group.includes("#") ? p.group.replace("#", String(ch)) : `${p.group}${ch}`;
    const mine: string[] = [];
    for (const id of ids) {
      if (shared.has(id) && i % by !== 0 && sharedPin.has(id)) {
        mine.push(sharedPin.get(id)!);
        continue;
      }
      const num = String(next++);
      terminals.push(num);
      pins[num] = { ...(id ? { id } : {}), ...(group ? { group } : {}) };
      if (shared.has(id)) sharedPin.set(id, num);
      mine.push(num);
    }
    if (mine.length) points.push({ name: group || `Ch${ch}`, form: p.form, pins: mine });
  }
  // No channels (a power supply or host): one point of the ids, if any.
  if (!n && ids.length) {
    const mine = ids.map((id) => {
      const num = String(next++);
      terminals.push(num);
      pins[num] = { id };
      return num;
    });
    points.push({ name: p.group || POINT_FORMS.find((f) => f.value === p.form)?.label || "Pins", form: p.form, pins: mine });
  }
  return { terminals, pins, points };
}

// ---------------------------------------------------------------------------
// Controllers and where things are drawn

export const isModule = (item: PlantItem | undefined): item is PlantItem & { module: ModuleInfo } => !!item?.module;

export function controllerById(project: Project, id: string | undefined): Controller | undefined {
  return id ? project.controllers?.find((c) => c.id === id) : undefined;
}

export function controllerOfModule(project: Project, item: PlantItem): Controller | undefined {
  return controllerById(project, item.module?.controller);
}

/** A controller's modules, in rail order (spare slots left out). */
export function modulesOf(project: Project, ctrl: Controller): (PlantItem & { module: ModuleInfo })[] {
  return ctrl.slots.flatMap((s) => {
    const it = s.module ? project.plant.find((p) => p.id === s.module) : undefined;
    return isModule(it) ? [it] : [];
  });
}

/** The module a controller is known by: its host, else its first module. */
export function controllerHead(project: Project, ctrl: Controller): PlantItem | undefined {
  const mods = modulesOf(project, ctrl);
  return mods.find((m) => m.module.type === "host") ?? mods[0];
}

/** A controller's tag: its host module's (A2-5), or its prefix and "?" until numbered. */
export function controllerTag(project: Project, ctrl: Controller): string {
  const h = controllerHead(project, ctrl);
  return h?.tag || `${ctrl.prefix || "A"}?`;
}

/** "A2-5 AHU-1 outstation". */
export function controllerName(project: Project, ctrl: Controller): string {
  return [controllerTag(project, ctrl), ctrl.description].filter(Boolean).join(" ");
}

/** Each slot's bus address: set by hand, else its place in rail order (1, 2, 3…). */
export function slotAddress(project: Project, ctrl: Controller, i: number): number {
  const s = ctrl.slots[i];
  if (!s) return i + 1;
  if (s.module) {
    const it = project.plant.find((p) => p.id === s.module);
    if (it?.module?.address) return it.module.address;
  } else if (s.address) return s.address;
  return i + 1;
}

export interface ViewAt {
  el: Element;
  page: Page;
  /** Sheet-column, e.g. 3-23. */
  address: string;
}

/** Every view of a plant item, first first: by sheet, column, height (as Renumber orders them). */
export function viewsOf(project: Project, plantId: string): ViewAt[] {
  const out: ViewAt[] = [];
  for (const page of project.pages) {
    for (const el of page.elements) {
      if (el.symbol === "plant-view" && el.params.plant === plantId) out.push({ el, page, address: `${page.number}-${columnOf(el.pos[0])}` });
    }
  }
  return out.sort(
    (a, b) =>
      a.page.number - b.page.number ||
      columnOf(a.el.pos[0]) - columnOf(b.el.pos[0]) ||
      a.el.pos[1] - b.el.pos[1] ||
      a.el.pos[0] - b.el.pos[0] ||
      a.el.id.localeCompare(b.el.id),
  );
}

const shownPins = (el: Element) => String(el.params.show ?? "").split(",").filter(Boolean);

/** Where a point is drawn: the first view that shows its first pin (else any of its pins). */
export function pointView(project: Project, item: PlantItem, point: IoPoint, views = viewsOf(project, item.id)): ViewAt | undefined {
  const first = point.pins[0];
  return views.find((v) => first && shownPins(v.el).includes(first)) ?? views.find((v) => point.pins.some((t) => shownPins(v.el).includes(t)));
}

/**
 * A point as people say it. A module's: `A3-23:DI2`, adding where it's drawn
 * when that isn't the module's first view, `A3-23:DO5 (4-10)`, so a
 * reference always lands where the point is (controller.md §4). Plant's:
 * `SF-01 Running`.
 */
export function pointLabel(project: Project, item: PlantItem, point: IoPoint, views?: ViewAt[]): string {
  const tag = item.tag || `${item.prefix || "U"}?`;
  if (!item.module) return `${tag} ${point.name}`;
  const vs = views ?? viewsOf(project, item.id);
  const at = pointView(project, item, point, vs);
  const away = at && vs[0] && at.el.id !== vs[0].el.id ? ` (${at.address})` : "";
  return `${tag}:${point.name}${away}`;
}

/** "DO5–8" (or "DO5–IO2"): the first and last points a view shows. */
function pointsRange(item: PlantItem, el: Element): string {
  const show = new Set(shownPins(el));
  const names = (item.points ?? []).filter((p) => p.pins.some((t) => show.has(t))).map((p) => p.name);
  if (!names.length) return "";
  const a = names[0]!;
  const b = names[names.length - 1]!;
  if (a === b) return a;
  const ma = /^(.*?)(\d+)$/.exec(a);
  const mb = /^(.*?)(\d+)$/.exec(b);
  return ma && mb && ma[1] === mb[1] ? `${a}–${mb[2]}` : `${a}–${b}`;
}

/**
 * A module view's title row (controller.md §5): its tag, its number on the
 * rail (the controller map's circled number, v0.4.x T16), type, maker and
 * model, and the controller it's part of, `A3-23 · Module 3 · DI-8 · part
 * of A2-5, AHU-1 outstation`. A continuation says where it carries on from:
 * `A3-23 · DO-8 · DO5–8, continued from 3-23`.
 */
export function moduleTitle(project: Project, el: Element): string {
  const item = project.plant.find((p) => p.id === el.params.plant);
  if (!isModule(item)) return "";
  const tag = item.tag || `${item.prefix || "A"}?`;
  const parts = [tag];
  // Its number on the rail, as circled on the controller map (v0.4.x T16).
  const ctrlOf = controllerOfModule(project, item);
  const slot = ctrlOf ? ctrlOf.slots.findIndex((s) => s.module === item.id) : -1;
  if (ctrlOf && slot >= 0) parts.push(`Module ${slotAddress(project, ctrlOf, slot)}`);
  parts.push(moduleTypeName(item.module));
  const who = [item.module.maker, item.module.model].filter(Boolean).join(" ");
  if (who) parts.push(who);
  const views = viewsOf(project, item.id);
  const first = views[0];
  if (first && first.el.id !== el.id) {
    const range = pointsRange(item, el);
    parts.push(`${range ? `${range}, ` : ""}continued from ${first.address}`);
  } else {
    const ctrl = controllerOfModule(project, item);
    if (ctrl) {
      const head = controllerHead(project, ctrl);
      if (head && head.id !== item.id) parts.push(`part of ${[controllerTag(project, ctrl), ctrl.description].filter(Boolean).join(", ")}`);
      else if (ctrl.description) parts.push(ctrl.description);
    }
  }
  return parts.join(" · ");
}

/** Controllers with their modules, in the order they're listed. */
export function controllersInOrder(project: Project): { ctrl: Controller; modules: (PlantItem & { module: ModuleInfo })[] }[] {
  return (project.controllers ?? []).map((ctrl) => ({ ctrl, modules: modulesOf(project, ctrl) }));
}

/** A controller map's boxes (controller.md §5): its rail, the first controller's when none is named. */
export function controllerMapEntries(project: Project, ctrlId: string): import("./symbols").MapEntry[] {
  const ctrl = controllerById(project, ctrlId) ?? project.controllers?.[0];
  if (!ctrl) return [];
  return ctrl.slots.map((s, i) => {
    const address = slotAddress(project, ctrl, i);
    const it = s.module ? project.plant.find((p) => p.id === s.module) : undefined;
    if (!isModule(it)) return { tag: "", address, maker: "", model: "", type: "", where: "", spare: true };
    return {
      tag: it.tag || `${it.prefix || "A"}?`,
      address,
      maker: it.module.maker ?? "",
      model: it.module.model ?? "",
      type: moduleTypeName(it.module),
      where: viewsOf(project, it.id).map((v) => v.address).join(", "),
    };
  });
}
