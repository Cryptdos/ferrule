/**
 * Controller operations (controller.md §4): a controller is its modules in
 * rail order, with any spare slots. Each module is a plant item with
 * `module` set, so it's tagged by where its first view is (A3-23), wired,
 * scheduled and simulated like plant.
 */
import type { Controller, ModuleInfo, ModuleType, PlantItem, Project } from "./model";
import { newId } from "./model";
import { OpError, addGaItem, addPlant, addProjectDevice, deletePlant, getPlant, syncPlantViews, useLibraryDevice } from "./ops";
import type { DeviceEntry, ModuleTemplate, ProjectDevice } from "./devices";
import { moduleGaSize, snapToRail } from "./ga";
import type { GaItem } from "./model";
import { defaultPattern, generatePins, moduleType, type ModulePattern } from "./modules";
import { cleanPoints } from "./points";

export function getController(project: Project, id: string): Controller {
  const c = project.controllers?.find((x) => x.id === id);
  if (!c) throw new OpError(`No controller "${id}"`);
  return c;
}

const prefixOrA = (p: string | undefined) => (p ?? "").trim().toUpperCase().replace(/[^A-Z]/g, "") || "A";

export function addController(project: Project, description = "", prefix = "A"): Controller {
  const c: Controller = { id: newId("ctl"), description: description.trim(), prefix: prefixOrA(prefix), slots: [] };
  (project.controllers ??= []).push(c);
  return c;
}

export function updateController(project: Project, id: string, patch: { description?: string; prefix?: string }): void {
  const c = getController(project, id);
  if (patch.description !== undefined) c.description = patch.description.trim();
  if (patch.prefix !== undefined) {
    c.prefix = prefixOrA(patch.prefix);
    // Its modules' tags start with it.
    for (const s of c.slots) {
      const it = s.module ? project.plant.find((p) => p.id === s.module) : undefined;
      if (it) it.prefix = c.prefix;
    }
  }
  syncPlantViews(project);
}

/** Remove a controller, its modules and every view of them. */
export function deleteController(project: Project, id: string): void {
  const c = getController(project, id);
  for (const s of [...c.slots]) if (s.module && project.plant.some((p) => p.id === s.module)) deletePlant(project, s.module);
  project.controllers = (project.controllers ?? []).filter((x) => x.id !== id);
  if (!project.controllers.length) delete project.controllers;
}

export interface NewModule {
  type: ModuleType;
  channels?: number;
  maker?: string;
  model?: string;
  /** Pins from a pattern (default: the type's usual one). Pass `null` for a module with no pins yet. */
  pattern?: Partial<ModulePattern> | null;
  /** Where on the rail (slot index); default: the end. */
  at?: number;
}

const channelsOf = (type: ModuleType, n: number | undefined) => (moduleType(type).channels ? Math.max(1, Math.min(64, Math.floor(n ?? 8))) : undefined);

/** Add a module to a controller's rail, with its pins generated from a pattern. */
export function addModule(project: Project, controllerId: string, m: NewModule): PlantItem {
  const c = getController(project, controllerId);
  const channels = channelsOf(m.type, m.channels);
  const item = addPlant(project, "", moduleType(m.type).label, [], { prefix: c.prefix });
  const info: ModuleInfo = { controller: c.id, type: m.type };
  if (channels) info.channels = channels;
  if (m.maker?.trim()) info.maker = m.maker.trim();
  if (m.model?.trim()) info.model = m.model.trim();
  item.module = info;
  const slot = { module: item.id };
  const at = m.at === undefined ? c.slots.length : Math.max(0, Math.min(c.slots.length, Math.floor(m.at)));
  // Filling a spare slot takes its place.
  if (c.slots[at]?.spare) c.slots[at] = slot;
  else c.slots.splice(at, 0, slot);
  if (m.pattern !== null) generateModule(project, item.id, { ...defaultPattern(m.type, channels), ...(m.pattern ?? {}) });
  return item;
}

/** Change a module's type, channel count, maker, model or bus address. */
export function updateModule(
  project: Project,
  plantId: string,
  patch: { type?: ModuleType; channels?: number; maker?: string; model?: string; address?: number | null; description?: string },
): void {
  const item = getPlant(project, plantId);
  const m = item.module;
  if (!m) throw new OpError(`${item.tag || "That"} isn't a controller's module`);
  if (patch.type) m.type = patch.type;
  if (patch.channels !== undefined || patch.type) {
    const n = channelsOf(m.type, patch.channels ?? m.channels);
    if (n) m.channels = n;
    else delete m.channels;
  }
  for (const k of ["maker", "model"] as const) {
    const v = patch[k];
    if (v === undefined) continue;
    if (v.trim()) m[k] = v.trim();
    else delete m[k];
  }
  if (patch.address !== undefined) {
    if (patch.address && patch.address >= 1) m.address = Math.min(255, Math.floor(patch.address));
    else delete m.address;
  }
  if (patch.description !== undefined) item.description = patch.description.trim();
  syncPlantViews(project);
}

/**
 * Fill a module's pins table from a pattern (controller.md §4), replacing
 * what it had. Points that keep their name keep their form, label and
 * what they follow; wires on pins that went away are dropped.
 */
export function generateModule(project: Project, plantId: string, pattern: ModulePattern): void {
  const item = getPlant(project, plantId);
  if (!item.module) throw new OpError(`${item.tag || "That"} isn't a controller's module`);
  const g = generatePins(pattern);
  const before = item.points ?? [];
  const points = g.points.map((p) => {
    const old = before.find((b) => b.name === p.name);
    return old ? { ...old, pins: p.pins, form: old.form } : p;
  });
  // Views that showed every pin go on showing every pin.
  for (const page of project.pages) {
    for (const el of page.elements) {
      if (el.symbol !== "plant-view" || el.params.plant !== item.id) continue;
      const shown = String(el.params.show ?? "").split(",").filter(Boolean);
      if (item.terminals.every((t) => shown.includes(t))) el.params.show = g.terminals.join(",");
    }
  }
  item.terminals = g.terminals;
  item.pins = Object.keys(g.pins).length ? g.pins : undefined;
  if (!item.pins) delete item.pins;
  const clean = cleanPoints(points, item.terminals);
  if (clean.length) item.points = clean;
  else delete item.points;
  if (pattern.channels && moduleType(item.module.type).channels) item.module.channels = pattern.channels;
  syncPlantViews(project);
}

/** Add a spare slot (Spare I/O) to a controller's rail. */
export function addSpareSlot(project: Project, controllerId: string, at?: number): void {
  const c = getController(project, controllerId);
  const i = at === undefined ? c.slots.length : Math.max(0, Math.min(c.slots.length, Math.floor(at)));
  c.slots.splice(i, 0, { spare: true });
}

/** Take a slot off the rail: a spare goes; a module is deleted with its views. */
export function removeSlot(project: Project, controllerId: string, index: number): void {
  const c = getController(project, controllerId);
  const s = c.slots[index];
  if (!s) throw new OpError(`No slot ${index + 1}`);
  if (s.module && project.plant.some((p) => p.id === s.module)) deletePlant(project, s.module);
  else c.slots.splice(index, 1);
}

/** Move a slot along the rail (its bus address follows unless set by hand). */
export function moveSlot(project: Project, controllerId: string, from: number, to: number): void {
  const c = getController(project, controllerId);
  if (!c.slots[from]) throw new OpError(`No slot ${from + 1}`);
  const [s] = c.slots.splice(from, 1);
  c.slots.splice(Math.max(0, Math.min(c.slots.length, to)), 0, s!);
  syncPlantViews(project);
}

/** A spare slot's bus address, set by hand (null: from rail order). */
export function setSlotAddress(project: Project, controllerId: string, index: number, address: number | null): void {
  const c = getController(project, controllerId);
  const s = c.slots[index];
  if (!s) throw new OpError(`No slot ${index + 1}`);
  if (s.module) return updateModule(project, s.module, { address });
  if (address && address >= 1) s.address = Math.min(255, Math.floor(address));
  else delete s.address;
}

// ---------------------------------------------------------------------------
// Library models (controller.md §4) and the GA (§8)

/** A module's model as it stands: type, channels and pins table, for the device table. */
export function moduleTemplate(item: PlantItem): ModuleTemplate {
  const m = item.module;
  if (!m) throw new OpError(`${item.tag || "That"} isn't a controller's module`);
  return {
    type: m.type,
    ...(m.channels ? { channels: m.channels } : {}),
    terminals: [...item.terminals],
    ...(item.pins ? { pins: structuredClone(item.pins) } : {}),
    ...(item.points?.length ? { points: item.points.map((p) => ({ name: p.name, form: p.form, pins: [...p.pins] })) } : {}),
  };
}

/**
 * Save a module as a model in the project's device table (from there it can
 * go to the shared library with its datasheet), named by its maker and
 * model. The module is then that device: its size on the GA comes from it.
 */
export function saveModuleDevice(project: Project, plantId: string, size?: { w: number; h: number }): ProjectDevice {
  const item = getPlant(project, plantId);
  const m = item.module;
  if (!m) throw new OpError(`${item.tag || "That"} isn't a controller's module`);
  const s = size ?? moduleGaSize(project, item);
  const name = [m.maker, m.model].filter(Boolean).join(" ") || `${moduleType(m.type).label} module`;
  const dev = addProjectDevice(project, { name, maker: m.maker ?? "", part: m.model ?? "", kind: "module", w: s.w, h: s.h, d: 0, module: moduleTemplate(item) });
  m.device = dev.id;
  return dev;
}

/**
 * Add a module made from a model in the device table (or the shared
 * library, which brings a copy into the project): its type, channels and
 * pins as entered from the datasheet.
 */
export function addModuleFromDevice(project: Project, controllerId: string, device: ProjectDevice | DeviceEntry, at?: number): PlantItem {
  if (!device.module) throw new OpError(`${device.name} isn't a controller module`);
  const dev = "library" in device ? device : useLibraryDevice(project, device);
  const t = dev.module!;
  const item = addModule(project, controllerId, { type: t.type, channels: t.channels, maker: dev.maker, model: dev.part, at, pattern: null });
  item.terminals = [...t.terminals];
  if (t.pins) item.pins = structuredClone(t.pins);
  if (t.points?.length) item.points = cleanPoints(structuredClone(t.points), item.terminals);
  item.module!.device = dev.id;
  syncPlantViews(project);
  return item;
}

/** Which model from the device table a module is (null: none). */
export function setModuleDevice(project: Project, plantId: string, deviceId: string | null): void {
  const item = getPlant(project, plantId);
  if (!item.module) throw new OpError(`${item.tag || "That"} isn't a controller's module`);
  if (deviceId) {
    if (!project.devices?.some((d) => d.id === deviceId)) throw new OpError(`No device "${deviceId}" in this project`);
    item.module.device = deviceId;
  } else delete item.module.device;
  // On the GA it takes that size.
  const s = moduleGaSize(project, item);
  for (const pg of project.pages)
    for (const it of pg.gaItems ?? []) {
      if (it.module !== item.id) continue;
      it.w = s.w;
      it.h = s.h;
      if (deviceId) it.device = deviceId;
      else delete it.device;
    }
}

/**
 * Place modules on a GA side by side from `at` (their left end, mm), in
 * rail order: a controller as one item (controller.md §8). Snaps onto a DIN
 * rail where they sit across one.
 */
export function placeModulesOnGa(project: Project, pageId: string, moduleIds: string[], at: [number, number]): GaItem[] {
  const items = moduleIds.map((id) => getPlant(project, id));
  const sizes = items.map((it) => moduleGaSize(project, it));
  const h = Math.max(...sizes.map((s) => s.h));
  const page = project.pages.find((p) => p.id === pageId);
  const railY = page ? snapToRail(page, { x: at[0], y: at[1], w: sizes.reduce((a, s) => a + s.w, 0), h }) : null;
  let x = at[0];
  return items.map((it, i) => {
    const s = sizes[i]!;
    // Lined up by their middles on the rail.
    const y = (railY ?? at[1]) + (h - s.h) / 2;
    const g = addGaItem(project, pageId, { kind: "device", x, y, w: s.w, h: s.h, module: it.id, ...(it.module?.device ? { device: it.module.device } : {}) });
    x += s.w;
    return g;
  });
}
