/**
 * Loading project files. Checks the shape (files can be hand-edited or
 * written over MCP) and rejects anything that isn't a Ferrule project of
 * this format. There's no backwards compatibility before release (v0.5 A30):
 * a file of any other format is refused, naming the Ferrule it needs, rather
 * than half-opened. A build that changes what a file must hold moves
 * FORMAT_VERSION on.
 */
import { spreadBlock } from "./blocks";
import { PLANT_VIEW_KEYS, labelWidthFor } from "./ops";
import { parseProjectDevices } from "./devices";
import { AREA_UNITS } from "./geometry";
import { tidyDesign } from "./design";
import { RELEASES_URL, VERSION } from "./version";
import { MAX_CONDITIONS } from "./interlocks";
import { PLANT_MARKS, TEXT_PLACES, type TextPlace, DISTRIBUTION_KINDS, type DistributionKind, POINT_FORMS, type Condition, type Controller, type ControllerSlot, type DesignTemplate, type ModuleInfo, type ModuleType, type PlantItem, type Expectation, type IoPoint, type Interlock, type Network, type PinInfo, type PointForm, FORMAT, FORMAT_VERSION, type GaDim, type GaDimPoint, type GaItem, type Page, type Project, emptyInfo } from "./model";
import { canRotate, defaultParams, getSymbol } from "./symbols";
import { gaToSheet } from "./ga";
import { MODULE_TYPES } from "./modules";
import { colourCode, lampColour } from "./wirecolours";

export class ProjectFormatError extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isVec = (v: unknown): v is [number, number] =>
  Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number" && Number.isFinite(n));
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strOr = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);

/**
 * Why a file of another format isn't opened (v0.5 A30). Since v0.4.x every
 * save writes the Ferrule that made it (`savedBy`), so the message names the
 * build to open it in; old builds stay on the releases page for that.
 */
export function notOpened(version: number, savedBy: unknown): string {
  const by = typeof savedBy === "string" ? savedBy.trim() : "";
  if (by) return `Not opened. This file needs Ferrule ${by}${version > FORMAT_VERSION ? " or later" : ""}. Builds: ${RELEASES_URL}`;
  return version > FORMAT_VERSION
    ? "Not opened. This file is from a newer Ferrule."
    : "Not opened. This file is from an older Ferrule and can't be opened in this one.";
}

export function parseProject(input: unknown): Project {
  if (!isObj(input)) throw new ProjectFormatError("Not a project: expected a JSON object");
  if (input.format !== FORMAT) throw new ProjectFormatError('Not a Ferrule project (missing format: "ferrule")');
  const version = typeof input.version === "number" ? input.version : 0;
  if (version !== FORMAT_VERSION) throw new ProjectFormatError(notOpened(version, input.savedBy));
  if (typeof input.id !== "string" || !input.id) throw new ProjectFormatError("Project has no id");

  const info = isObj(input.project) ? input.project : {};
  const base = emptyInfo();
  const project: Project = {
    format: FORMAT,
    version: FORMAT_VERSION,
    id: input.id,
    project: Object.fromEntries(
      Object.keys(base).map((k) => [k, strOr(info[k], base[k as keyof typeof base])]),
    ) as unknown as Project["project"],
    designation: {
      standard: isObj(input.designation) ? strOr(input.designation.standard, "iec-81346-2-2019") : "iec-81346-2-2019",
      overrides:
        isObj(input.designation) && isObj(input.designation.overrides)
          ? (Object.fromEntries(
              Object.entries(input.designation.overrides).filter(([, v]) => typeof v === "string"),
            ) as Record<string, string>)
          : {},
    },
    titleBlock: strOr(input.titleBlock, "default-a4"),
    assets: {},
    plant: parsePlant(input.plant),
    distributions: parseDistributions(input.distributions),
    pages: [],
    conductors: [],
    revisions: arr(input.revisions)
      .filter(isObj)
      .map((r) => ({
        rev: strOr(r.rev),
        date: strOr(r.date),
        drawnBy: strOr(r.drawnBy),
        description: strOr(r.description),
        clouds: arr(r.clouds)
          .filter(isObj)
          .filter((c) => typeof c.pageId === "string" && Array.isArray(c.rect) && c.rect.length === 4)
          .map((c) => ({ id: typeof c.id === "string" ? c.id : `cl_${Math.random().toString(36).slice(2, 9)}`, pageId: c.pageId as string, rect: c.rect as [number, number, number, number] })),
      })),
    templates: [],
    expectations: [],
  };

  arr(input.pages).forEach((pg, i) => {
    if (!isObj(pg) || typeof pg.id !== "string") throw new ProjectFormatError(`Page ${i + 1} is malformed`);
    project.pages.push(parsePage(pg, i));
  });

  project.templates = arr(input.templates)
    .filter(isObj)
    .filter((t) => typeof t.id === "string")
    .map((t, i) => parseTemplate(t, i));

  project.expectations = parseExpectations(input.expectations);
  const controllers = parseControllers(input.controllers, project.plant);
  if (controllers) project.controllers = controllers;
  const networks = parseNetworks(input.networks);
  if (networks.length) project.networks = networks;
  const systems = arr(input.systems).filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean);
  if (systems.length) project.systems = [...new Set(systems)];
  tidyDesign(project);
  project.assets = parseAssets(input.assets);
  for (const pg of project.pages) {
    for (const el of pg.elements) {
      // Plant view settings belong to plant views only.
      if (el.symbol !== "plant-view") for (const k of PLANT_VIEW_KEYS) delete el.params[k];
      // Every lamp has a colour: none and clear are white (v0.2.1 note 4).
      if (el.symbol === "lamp") el.params.colour = lampColour(String(el.params.colour ?? ""));
      // Labels are one line, wrapped by their width (note 18); Text keeps its lines.
      if (el.symbol !== "text" && el.label.includes("\n")) {
        if (!(typeof el.params.labelWidth === "number" && el.params.labelWidth > 0)) el.params.labelWidth = labelWidthFor(el.label, project);
        el.label = el.label.replace(/\s*\n\s*/g, " ");
      }
      // A part is outside the panel only below a boundary (v0.4.x F7): plant on a sheet with none is panel wiring.
      if (pg.boundaryY === null) el.zone = "internal";
      // A socket from before v0.4.x T17 had its earth out of its side: now it's at the top. A wire
      // routed by hand to it is flagged once in Check, until the wire is re-routed.
      if (el.symbol === "socket" && el.params.etop !== true) {
        el.params.etop = true;
        if (pg.segments.some((sg) => sg.route === "manual" && ((sg.from[0] === el.id && sg.from[1] === "E") || (sg.to[0] === el.id && sg.to[1] === "E")))) el.params.eMoved = true;
      }
      // Terminals on a panel boundary are cells of its terminal block.
      if (el.symbol !== "terminal") continue;
      if (pg.boundaryY !== null && el.pos[1] === pg.boundaryY && (el.rot === 0 || el.rot === 180)) el.params.onBlock = true;
      else delete el.params.onBlock;
    }
    // A column each (v0.3 §2): terminals 1 unit apart in files move apart, keeping their order.
    spreadBlock(pg);
  }
  if (isObj(input.gaSizes)) {
    project.gaSizes = {};
    for (const [k, v] of Object.entries(input.gaSizes)) {
      if (!isObj(v)) continue;
      project.gaSizes[k] = {
        ...(typeof v.w === "number" && v.w > 0 ? { w: v.w } : {}),
        ...(typeof v.h === "number" && v.h > 0 ? { h: v.h } : {}),
      };
    }
  }
  if (typeof input.logo === "string" && project.assets[input.logo]) project.logo = input.logo;
  const devices = parseProjectDevices(input.devices);
  if (devices.length) project.devices = devices;
  if (input.useDeviceLibrary === false) project.useDeviceLibrary = false;
  project.conductors = parseConductors(input.conductors);
  if (isObj(input.wireColours)) {
    const wc: Record<string, string> = {};
    for (const [k, v] of Object.entries(input.wireColours)) if (k.trim() && typeof v === "string" && v.trim()) wc[k.trim()] = colourCode(v);
    if (Object.keys(wc).length) project.wireColours = wc;
  }
  return project;
}

/** A Design template (design-v0.4 §3), from a library file: rows only, no modules, channels or system. */
export function parseDesignTemplate(v: unknown): DesignTemplate {
  if (!isObj(v)) throw new ProjectFormatError("Not a Design template");
  const plant = parsePlant(v.plant).map(({ module: _m, system: _s, ...p }) => {
    for (const pt of p.points ?? []) delete pt.channel;
    return p as PlantItem;
  });
  return { name: strOr(v.name, "Template").trim() || "Template", plant };
}

/** A template, from a project file or a library file. */
export function parseTemplate(t: Record<string, unknown>, i = 0): Project["templates"][number] {
  if (typeof t.id !== "string") throw new ProjectFormatError("Template has no id");
  const body = parsePage(t, i);
  return {
    id: t.id,
    name: strOr(t.name, "Template"),
    kind: t.kind === "section" ? "section" : "sheet",
    plant: parsePlant(t.plant),
    ...(Array.isArray(t.distributions) ? { distributions: parseDistributions(t.distributions) } : {}),
    title: strOr(t.title),
    boundaryY: body.boundaryY,
    sections: body.sections,
    elements: body.elements,
    segments: body.segments,
    size:
      Array.isArray(t.size) && t.size.length === 2 && t.size.every((n) => typeof n === "number")
        ? (t.size as [number, number])
        : [AREA_UNITS.w, AREA_UNITS.h - 8],
  };
}

/** Images: data URLs of the kinds a browser draws, nothing else. */
function parseAssets(v: unknown): Project["assets"] {
  const out: Project["assets"] = {};
  if (!isObj(v)) return out;
  for (const [id, a] of Object.entries(v)) {
    if (!isObj(a) || typeof a.data !== "string" || !/^data:image\/(png|jpeg|svg\+xml|webp|gif);base64,/.test(a.data)) continue;
    out[id] = {
      data: a.data,
      w: typeof a.w === "number" && a.w > 0 ? a.w : 100,
      h: typeof a.h === "number" && a.h > 0 ? a.h : 100,
      ...(typeof a.name === "string" ? { name: a.name } : {}),
    };
  }
  return out;
}

export function parseDistributions(v: unknown): Project["distributions"] {
  const kinds = new Set(DISTRIBUTION_KINDS.map((k) => k.value));
  return arr(v)
    .filter(isObj)
    .filter((d) => typeof d.id === "string" && d.id)
    .map((d) => ({
      id: d.id as string,
      name: strOr(d.name),
      kind: kinds.has(d.kind as DistributionKind) ? (d.kind as DistributionKind) : "line",
      voltage: strOr(d.voltage),
      ...(typeof d.colour === "string" && d.colour ? { colour: colourCode(d.colour) } : {}),
      ...(typeof d.function === "string" && d.function ? { function: d.function } : {}),
      ...(typeof d.tag === "number" && Number.isInteger(d.tag) && d.tag >= 0 ? { tag: d.tag } : {}),
    }));
}

export function parsePlant(v: unknown): Project["plant"] {
  return arr(v)
    .filter(isObj)
    .filter((pl) => typeof pl.id === "string")
    .map((pl) => ({
      id: pl.id as string,
      tag: strOr(pl.tag),
      prefix: strOr(pl.prefix) || "U",
      ...(pl.locked === true ? { locked: true } : {}),
      ...(pl.powerByOthers === true ? { powerByOthers: true } : {}),
      ...(pl.inPanel === true ? { inPanel: true } : {}),
      ...(typeof pl.mark === "string" && PLANT_MARKS.some((m) => m.value === pl.mark) ? { mark: pl.mark as PlantItem["mark"] } : {}),
      description: strOr(pl.description),
      terminals: arr(pl.terminals).filter((t): t is string => typeof t === "string"),
      ...parsePoints(pl.points, pl.pins),
      ...(typeof pl.info === "string" && pl.info ? { info: pl.info } : {}),
      ...parseModule(pl.module),
      ...parsePlantDesign(pl),
    }));
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** A plant item's Design fields (design-v0.4 §2), each only when set. */
function parsePlantDesign(pl: Record<string, unknown>): Partial<PlantItem> {
  const out: Partial<PlantItem> = {};
  for (const k of ["system", "protocol", "network", "enabledBy", "source"] as const) {
    const v = text(pl[k]);
    if (v) out[k] = v;
  }
  if (pl.connects === "comms" || pl.connects === "both") out.connects = pl.connects;
  const interlocks: Interlock[] = [];
  for (const x of arr(pl.interlocks).filter(isObj)) {
    if (typeof x.id !== "string" || !x.id || interlocks.some((y) => y.id === x.id)) continue;
    const point = text(x.point);
    // An interlock takes several conditions (v0.4.x T1).
    const when = parseConditions(x.when, MAX_CONDITIONS);
    if (!point || !when.length) continue;
    interlocks.push({ id: x.id, point, when, ...(when.length > 1 && (x.join === "or" || x.join === "and") ? { join: x.join } : {}) });
  }
  if (interlocks.length) out.interlocks = interlocks;
  return out;
}

export function parseNetworks(v: unknown): Network[] {
  const out: Network[] = [];
  for (const n of arr(v).filter(isObj)) {
    if (typeof n.id !== "string" || !n.id || out.some((x) => x.id === n.id)) continue;
    const port = isObj(n.port) && text(n.port.plant) && text(n.port.group) ? { port: { plant: text(n.port.plant), group: text(n.port.group) } } : {};
    out.push({ id: n.id, name: text(n.name), protocol: text(n.protocol), kind: n.kind === "lan" ? "lan" : "bus", ...port });
  }
  return out;
}


const MODULE_TYPE_SET = new Set<string>(MODULE_TYPES.map((t) => t.value));

function parseModule(v: unknown): { module?: ModuleInfo } {
  if (!isObj(v) || typeof v.controller !== "string" || !v.controller) return {};
  const type = (MODULE_TYPE_SET.has(v.type as string) ? v.type : "host") as ModuleType;
  const whole = (x: unknown, max: number) => (typeof x === "number" && Number.isFinite(x) && x >= 1 ? Math.min(max, Math.floor(x)) : undefined);
  const channels = whole(v.channels, 64);
  const address = whole(v.address, 255);
  const commons = arr(v.commons)
    .map((l) => arr(l).filter((t): t is string => typeof t === "string"))
    .filter((l) => l.length > 1);
  return {
    module: {
      controller: v.controller,
      type,
      ...(channels ? { channels } : {}),
      ...(typeof v.maker === "string" && v.maker ? { maker: v.maker } : {}),
      ...(typeof v.model === "string" && v.model ? { model: v.model } : {}),
      ...(address ? { address } : {}),
      ...(typeof v.device === "string" && v.device ? { device: v.device } : {}),
      ...(commons.length ? { commons } : {}),
      ...(typeof v.va === "number" && Number.isFinite(v.va) && v.va > 0 ? { va: v.va } : {}),
    },
  };
}

/** Controllers, kept in step with the modules that name them. */
function parseControllers(v: unknown, plant: PlantItem[]): Controller[] | undefined {
  const out: Controller[] = [];
  for (const c of arr(v).filter(isObj)) {
    if (typeof c.id !== "string" || !c.id || out.some((x) => x.id === c.id)) continue;
    const id = c.id;
    const slots: ControllerSlot[] = [];
    for (const s of arr(c.slots).filter(isObj)) {
      if (s.spare === true) {
        slots.push({ spare: true, ...(typeof s.address === "number" && s.address >= 1 ? { address: Math.floor(s.address) } : {}) });
        continue;
      }
      const it = typeof s.module === "string" ? plant.find((p) => p.id === s.module) : undefined;
      if (it?.module?.controller === id && !slots.some((x) => x.module === it.id)) slots.push({ module: it.id });
    }
    // A module its controller doesn't list goes on the end of its rail.
    for (const it of plant) if (it.module?.controller === id && !slots.some((x) => x.module === it.id)) slots.push({ module: it.id });
    out.push({ id, description: strOr(c.description), prefix: strOr(c.prefix) || "A", slots });
  }
  // A module whose controller has gone is plain plant.
  for (const it of plant) if (it.module && !out.some((c) => c.id === it.module!.controller)) delete it.module;
  return out.length ? out : undefined;
}

const isSupplyType = (v: unknown): v is { v: number; ac: boolean } => isObj(v) && typeof v.v === "number" && v.v > 0 && typeof v.ac === "boolean";

const FORMS = new Set(POINT_FORMS.map((f) => f.value));

function parseConditions(v: unknown, max = 2): Condition[] {
  return arr(v)
    .filter(isObj)
    .filter((c) => typeof c.ref === "string" && c.ref)
    .slice(0, max)
    .map((c) => ({ ref: c.ref as string, on: c.on !== false }));
}

function parsePoints(points: unknown, pins: unknown): { points?: IoPoint[]; pins?: Record<string, PinInfo> } {
  const out: { points?: IoPoint[]; pins?: Record<string, PinInfo> } = {};
  const list = arr(points)
    .filter(isObj)
    .filter((p) => typeof p.name === "string" && p.name)
    .map((p) => {
      const follows = parseConditions(p.follows);
      const q: IoPoint = {
        name: p.name as string,
        form: FORMS.has(p.form as PointForm) ? (p.form as PointForm) : "contact",
        pins: arr(p.pins).filter((t): t is string => typeof t === "string"),
        ...(follows.length ? { follows } : {}),
        ...(follows.length > 1 && (p.join === "or" || p.join === "and") ? { join: p.join } : {}),
        ...(typeof p.delay === "number" && p.delay > 0 ? { delay: p.delay } : {}),
        ...(typeof p.label === "string" && p.label.trim() ? { label: p.label.trim() } : {}),
        ...(text(p.signal) ? { signal: text(p.signal) } : {}),
        ...(isSupplyType(p.gives) ? { gives: { v: p.gives.v, ac: p.gives.ac } } : {}),
        ...(arr(p.accepts).filter(isSupplyType).length ? { accepts: arr(p.accepts).filter(isSupplyType).map((x) => ({ v: x.v, ac: x.ac })) } : {}),
        ...(typeof p.va === "number" && Number.isFinite(p.va) && p.va > 0 ? { va: p.va } : {}),
        ...(typeof p.ratingVa === "number" && Number.isFinite(p.ratingVa) && p.ratingVa > 0 ? { ratingVa: p.ratingVa } : {}),
        ...(typeof p.efficiency === "number" && p.efficiency > 0 && p.efficiency <= 1 ? { efficiency: p.efficiency } : {}),
        ...(p.goesTo === "relay" || p.goesTo === "panel" ? { goesTo: p.goesTo } : {}),
        ...(isObj(p.channel) && text(p.channel.module) && text(p.channel.point) ? { channel: { module: text(p.channel.module), point: text(p.channel.point) } } : {}),
        ...(text(p.confirmed) ? { confirmed: text(p.confirmed) } : {}),
      };
      return q;
    })
    // A point may have no pins yet (design-v0.4 §2); names are unique on a device.
    .filter((p, i, all) => all.findIndex((q) => q.name === p.name) === i);
  if (list.length) out.points = list;
  if (isObj(pins)) {
    const m: Record<string, PinInfo> = {};
    for (const [k, v] of Object.entries(pins)) {
      if (!isObj(v)) continue;
      const id = strOr(v.id);
      const group = strOr(v.group);
      if (id || group) m[k] = { ...(id ? { id } : {}), ...(group ? { group } : {}), ...(group && v.port === true ? { port: true as const } : {}) };
    }
    if (Object.keys(m).length) out.pins = m;
  }
  return out;
}

export function parseExpectations(v: unknown): Expectation[] {
  return arr(v)
    .filter(isObj)
    .filter((e) => typeof e.id === "string")
    .map((e) => {
      const when = parseConditions(e.when);
      const kind = e.kind === "never" ? ("never" as const) : ("should" as const);
      const x: Expectation = {
        id: e.id as string,
        kind,
        ...(kind === "should" && typeof e.point === "string" ? { point: e.point } : {}),
        ...(kind === "should" && e.on === false ? { on: false } : {}),
        when,
        ...(when.length > 1 && (e.join === "or" || e.join === "and") ? { join: e.join } : {}),
        ...(typeof e.note === "string" && e.note ? { note: e.note } : {}),
        ...(typeof e.interlock === "string" && e.interlock ? { interlock: e.interlock } : {}),
      };
      return x;
    })
    .filter((e) => e.when.length && (e.kind === "never" || e.point));
}

function parsePage(pg: Record<string, unknown>, i: number): Project["pages"][number] {
  const elements = arr(pg.elements).map((e, j) => {
    if (!isObj(e) || typeof e.id !== "string" || typeof e.symbol !== "string" || !isVec(e.pos)) {
      throw new ProjectFormatError(`Element ${j + 1} on page ${i + 1} is malformed`);
    }
    if (!getSymbol(e.symbol)) throw new ProjectFormatError(`Unknown symbol "${e.symbol}" on page ${i + 1}`);
    // Busbars split in two (v0.3 §1): a control busbar is a control rail, the rest distribution blocks.
    if (e.symbol === "busbar" && isObj(e.params)) {
      if (e.params.style === "control") e.symbol = "rail";
      delete e.params.style;
    }
    // A part that doesn't turn is always upright (A39).
    const rot = [0, 90, 180, 270].includes(e.rot as number) && canRotate({ symbol: String(e.symbol) }) ? (e.rot as 0 | 90 | 180 | 270) : 0;
    return {
      id: e.id,
      symbol: e.symbol as string,
      tag: strOr(e.tag),
      label: strOr(e.label),
      pos: e.pos,
      rot,
      ...(e.flip === true ? { flip: true } : {}),
      ...(isVec(e.labelAt) && (e.labelAt[0] || e.labelAt[1]) ? { labelAt: [e.labelAt[0], e.labelAt[1]] as [number, number] } : {}),
      zone: e.zone === "external" ? ("external" as const) : ("internal" as const),
      params: isObj(e.params)
        ? (Object.fromEntries(
            Object.entries(e.params).filter(([, v]) => ["string", "number", "boolean"].includes(typeof v)),
          ) as Record<string, string | number | boolean>)
        : {},
      links: arr(e.links).filter((l): l is string => typeof l === "string"),
    };
  });
  const segments = arr(pg.segments)
    .filter(isObj)
    .map((s, j) => {
      const ref = (v: unknown) =>
        Array.isArray(v) && v.length === 2 && typeof v[0] === "string" && typeof v[1] === "string";
      if (typeof s.id !== "string" || !ref(s.from) || !ref(s.to)) {
        throw new ProjectFormatError(`Wire ${j + 1} on page ${i + 1} is malformed`);
      }
      return {
        id: s.id,
        conductor: strOr(s.conductor),
        from: s.from as [string, string],
        to: s.to as [string, string],
        route: s.route === "manual" ? ("manual" as const) : ("auto" as const),
        points: arr(s.points).filter(isVec),
        ...(typeof s.field === "boolean" ? { field: s.field } : {}),
        ...(typeof s.showNumber === "boolean" ? { showNumber: s.showNumber } : {}),
        ...(s.showColour === false ? { showColour: false } : {}),
        ...(typeof s.numberAt === "number" && s.numberAt >= 0 && s.numberAt <= 1 ? { numberAt: s.numberAt } : {}),
        ...(typeof s.colourAt === "number" && s.colourAt >= 0 && s.colourAt <= 1 ? { colourAt: s.colourAt } : {}),
      };
    });
  const sections = arr(pg.sections)
    .filter(isObj)
    .filter(
      (sc) =>
        typeof sc.id === "string" &&
        Array.isArray(sc.rect) &&
        sc.rect.length === 4 &&
        sc.rect.every((n) => typeof n === "number"),
    )
    .map((sc) => ({ id: sc.id as string, label: strOr(sc.label), rect: sc.rect as [number, number, number, number] }));
  // A GA sheet: settings and its items in real mm.
  let ga: Page["ga"];
  if (isObj(pg.ga) && isObj(pg.ga.enclosure)) {
    const e = pg.ga.enclosure;
    const v = pg.ga.view;
    ga = {
      scale: typeof pg.ga.scale === "number" && pg.ga.scale > 0 ? pg.ga.scale : 5,
      enclosure: { w: typeof e.w === "number" && e.w > 0 ? e.w : 600, h: typeof e.h === "number" && e.h > 0 ? e.h : 800 },
      // "door" from the 0.2 test builds is the door front.
      view: v === "door" || v === "door-front" ? "door-front" : v === "door-back" ? "door-back" : v === "detail" ? "detail" : "backplate",
    };
    const leaves = arr(pg.ga.leaves)
      .filter(isObj)
      .filter((l) => typeof l.w === "number" && l.w > 0)
      .slice(0, 2)
      .map((l) => ({ w: l.w as number, hinge: l.hinge === "right" ? ("right" as const) : ("left" as const) }));
    if (ga.view === "door-front" && leaves.length) ga.leaves = leaves;
    // A modular door's columns of stacked doors (v0.4.x M13).
    const hinge = (v: unknown) => (v === "right" ? ("right" as const) : ("left" as const));
    const columns = arr(pg.ga.columns)
      .filter(isObj)
      .filter((c) => typeof c.w === "number" && c.w > 0)
      .slice(0, 6)
      .map((c) => ({
        w: c.w as number,
        doors: arr(c.doors)
          .filter(isObj)
          .filter((d) => typeof d.h === "number" && d.h > 0)
          .slice(0, 8)
          .map((d) => ({ h: d.h as number, hinge: hinge(d.hinge), ...(typeof d.name === "string" && d.name.trim() ? { name: d.name.trim() } : {}) })),
      }))
      .filter((c) => c.doors.length);
    if (ga.view === "door-front" && columns.length) ga.columns = columns;
    const pane = arr(pg.ga.pane);
    if (ga.view === "backplate" && isObj(pg.ga.behind) && typeof pg.ga.behind.sheet === "string" && pg.ga.behind.sheet) {
      const bp = arr(pg.ga.behind.pane);
      ga.behind = { sheet: pg.ga.behind.sheet, pane: bp.length === 2 && bp.every((n) => typeof n === "number" && Number.isInteger(n) && n >= 0) ? [bp[0] as number, bp[1] as number] : null };
    }
    if (ga.view !== "backplate" && pane.length === 2 && pane.every((n) => typeof n === "number" && Number.isInteger(n) && n >= 0)) ga.pane = [pane[0] as number, pane[1] as number];
    if (ga.view !== "backplate" && (pg.ga.leaf === 0 || pg.ga.leaf === 1)) ga.leaf = pg.ga.leaf;
    if (ga.view !== "backplate" && typeof pg.ga.of === "string" && pg.ga.of) ga.of = pg.ga.of;
  }
  // GA notes are gone (note 46): one from a test build becomes a Text annotation where it was.
  for (const it of arr(pg.gaItems).filter(isObj)) {
    if (it.kind !== "note" || !ga || typeof it.id !== "string") continue;
    const at = gaToSheet(ga, [typeof it.x === "number" ? it.x : 0, typeof it.y === "number" ? it.y : 0]);
    elements.push({
      id: it.id,
      symbol: "text",
      tag: "",
      label: strOr(it.text) || "Note",
      pos: [Math.round(at[0]), Math.round(at[1])],
      rot: 0,
      zone: "internal",
      params: defaultParams("text"),
      links: [],
    });
  }
  const gaItems = arr(pg.gaItems)
    .filter(isObj)
    .filter((it) => typeof it.id === "string" && ["rail", "trunking", "device", "label", "dim", "detail", "frame"].includes(String(it.kind)))
    .map((it): GaItem => ({
      id: it.id as string,
      kind: it.kind as GaItem["kind"],
      x: typeof it.x === "number" ? it.x : 0,
      y: typeof it.y === "number" ? it.y : 0,
      w: typeof it.w === "number" && it.w > 0 ? it.w : 20,
      h: typeof it.h === "number" && it.h > 0 ? it.h : 20,
      ...(Array.isArray(it.refs) ? { refs: it.refs.filter((r): r is string => typeof r === "string") } : {}),
      ...(typeof it.module === "string" && it.module ? { module: it.module } : {}),
      ...(it.part === "handle" ? { part: "handle" as const } : {}),
      ...(typeof it.text === "string" ? { text: it.text } : {}),
      ...(typeof it.tag === "string" && it.tag.trim() ? { tag: it.tag.trim() } : {}),
      ...(typeof it.device === "string" && it.device ? { device: it.device } : {}),
      ...(typeof it.strip === "string" && it.strip ? { strip: it.strip } : {}),
      ...(Array.isArray(it.seen) ? { seen: it.seen.filter((r): r is string => typeof r === "string") } : {}),
      ...(typeof it.cutout === "string" && it.cutout.trim() ? { cutout: it.cutout.trim() } : {}),
      ...(typeof it.textMm === "number" && it.textMm > 0 ? { textMm: it.textMm } : {}),
      ...(it.kind === "label" && (TEXT_PLACES as readonly unknown[]).includes(it.textAt) ? { textAt: it.textAt as TextPlace } : {}),
      ...(it.kind === "detail" && typeof it.letter === "string" && it.letter.trim() ? { letter: it.letter.trim() } : {}),
      ...(it.kind === "frame" && typeof it.detail === "string" ? { detail: it.detail } : {}),
      ...(it.kind === "frame" && typeof it.zoom === "number" && it.zoom > 0 ? { zoom: it.zoom } : {}),
      ...(it.kind === "dim" && typeof it.frame === "string" && it.frame ? { frame: it.frame } : {}),
      ...(it.kind === "dim" ? { dim: parseDim(it.dim) } : {}),
    }))
    .filter((it) => it.kind !== "dim" || it.dim!.points.length >= 2);
  const boundaryY = typeof pg.boundaryY === "number" && Number.isFinite(pg.boundaryY) ? pg.boundaryY : null;
  return {
    id: pg.id as string,
    number: i + 1,
    title: strOr(pg.title),
    boundaryY,
    sections,
    elements,
    segments,
    ...(ga ? { ga, gaItems } : {}),
    ...(pg.spare === true && !ga ? { spare: true } : {}),
  };
}

function parseDim(v: unknown): GaDim {
  const o = isObj(v) ? v : {};
  const points = arr(o.points)
    .filter(isObj)
    .filter((p) => typeof p.v === "number" && Number.isFinite(p.v))
    .map((p): GaDimPoint => ({
      v: p.v as number,
      ...(typeof p.item === "string" && p.item ? { item: p.item } : {}),
      ...(p.edge === "start" || p.edge === "mid" || p.edge === "end" ? { edge: p.edge } : {}),
    }));
  return {
    axis: o.axis === "v" ? "v" : "h",
    style: o.style === "baseline" ? "baseline" : "chain",
    points,
    at: typeof o.at === "number" && Number.isFinite(o.at) ? o.at : 0,
  };
}

function parseConductors(v: unknown): Project["conductors"] {
  return arr(v)
    .filter(isObj)
    .filter((c) => typeof c.id === "string")
    .map((c) => ({
      id: c.id as string,
      number: strOr(c.number),
      ...(c.locked === true ? { locked: true } : {}),
      ...(typeof c.colour === "string" && c.colour ? { colour: colourCode(c.colour) } : {}),
      ...(typeof c.function === "string" && c.function ? { function: c.function } : {}),
      terminals: arr(c.terminals).filter(
        (t): t is [string, string] => Array.isArray(t) && t.length === 2 && t.every((x) => typeof x === "string"),
      ),
    }));
}
