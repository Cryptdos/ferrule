/**
 * Loading project files. Checks the shape (files can be hand-edited or
 * written over MCP) and rejects anything that isn't a Ferrule project of
 * this format. There's no upgrading before 1.0: an older file is refused
 * with a plain message rather than half-opened.
 */
import { PLANT_VIEW_KEYS } from "./ops";
import { parseProjectDevices } from "./devices";
import { AREA_UNITS } from "./geometry";
import { DISTRIBUTION_KINDS, type DistributionKind, FORMAT, FORMAT_VERSION, type GaItem, type Page, type Project, emptyInfo } from "./model";
import { getSymbol } from "./symbols";
import { colourCode, knownColour } from "./wirecolours";

export class ProjectFormatError extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isVec = (v: unknown): v is [number, number] =>
  Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number" && Number.isFinite(n));
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strOr = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);

export function parseProject(input: unknown): Project {
  if (!isObj(input)) throw new ProjectFormatError("Not a project: expected a JSON object");
  if (input.format !== FORMAT) throw new ProjectFormatError('Not a Ferrule project (missing format: "ferrule")');
  const version = typeof input.version === "number" ? input.version : 0;
  if (version > FORMAT_VERSION) {
    throw new ProjectFormatError(
      `Project was saved by a newer Ferrule (format ${version}); this build reads format ${FORMAT_VERSION}`,
    );
  }
  if (version < FORMAT_VERSION) {
    throw new ProjectFormatError("This project was made with Ferrule 0.1; this version can't open it. Projects from 0.1 need redrawing.");
  }
  if (typeof input.id !== "string" || !input.id) throw new ProjectFormatError("Project has no id");
  preRelease(input);

  const info = isObj(input.project) ? input.project : {};
  const base = emptyInfo();
  const project: Project = {
    format: FORMAT,
    version: FORMAT_VERSION,
    id: input.id,
    project: Object.fromEntries(
      Object.keys(base).map((k) => [k, strOr(info[k], base[k as keyof typeof base])]),
    ) as unknown as Project["project"],
    numbering: {
      scheme: isObj(input.numbering) && input.numbering.scheme === "sequential" ? "sequential" : "position",
    },
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
    rules: [],
  };

  arr(input.pages).forEach((pg, i) => {
    if (!isObj(pg) || typeof pg.id !== "string") throw new ProjectFormatError(`Page ${i + 1} is malformed`);
    project.pages.push(parsePage(pg, i));
  });

  project.templates = arr(input.templates)
    .filter(isObj)
    .filter((t) => typeof t.id === "string")
    .map((t, i) => parseTemplate(t, i));

  project.rules = arr(input.rules)
    .filter(isObj)
    .filter((r) => typeof r.id === "string" && typeof r.a === "string")
    .map((r) => ({
      id: r.id as string,
      kind: r.kind === "never" ? ("never" as const) : ("never-both" as const),
      a: r.a as string,
      ...(typeof r.b === "string" ? { b: r.b } : {}),
      ...(typeof r.note === "string" ? { note: r.note } : {}),
    }));
  project.assets = parseAssets(input.assets);
  for (const pg of project.pages) {
    for (const el of pg.elements) {
      // Plant view settings belong to plant views only.
      if (el.symbol !== "plant-view") for (const k of PLANT_VIEW_KEYS) delete el.params[k];
      // Terminals on a panel boundary are cells of its terminal block.
      if (el.symbol !== "terminal") continue;
      if (pg.boundaryY !== null && el.pos[1] === pg.boundaryY && (el.rot === 0 || el.rot === 180)) el.params.onBlock = true;
      else delete el.params.onBlock;
    }
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
  return project;
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
      description: strOr(pl.description),
      terminals: arr(pl.terminals).filter((t): t is string => typeof t === "string"),
      ...(Array.isArray(pl.groups)
        ? {
            groups: arr(pl.groups)
              .filter(isObj)
              .map((g) => ({
                name: strOr(g.name),
                terminals: arr(g.terminals).filter((t): t is string => typeof t === "string"),
                ...(g.role === "input" || g.role === "output" || g.role === "none" ? { role: g.role as "input" | "output" | "none" } : {}),
                ...(typeof g.follows === "string" && g.follows ? { follows: g.follows } : {}),
                ...(typeof g.delay === "number" && g.delay > 0 ? { delay: g.delay } : {}),
                ...(g.invert === true ? { invert: true } : {}),
              }))
              .filter((g) => g.name && g.terminals.length),
          }
        : {}),
      ...(typeof pl.info === "string" && pl.info ? { info: pl.info } : {}),
    }));
}

function parsePage(pg: Record<string, unknown>, i: number): Project["pages"][number] {
  const elements = arr(pg.elements).map((e, j) => {
    if (!isObj(e) || typeof e.id !== "string" || typeof e.symbol !== "string" || !isVec(e.pos)) {
      throw new ProjectFormatError(`Element ${j + 1} on page ${i + 1} is malformed`);
    }
    if (!getSymbol(e.symbol)) throw new ProjectFormatError(`Unknown symbol "${e.symbol}" on page ${i + 1}`);
    const rot = [0, 90, 180, 270].includes(e.rot as number) ? (e.rot as 0 | 90 | 180 | 270) : 0;
    return {
      id: e.id,
      symbol: e.symbol,
      tag: strOr(e.tag),
      label: strOr(e.label),
      pos: e.pos,
      rot,
      ...(e.flip === true ? { flip: true } : {}),
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
    ga = {
      scale: typeof pg.ga.scale === "number" && pg.ga.scale > 0 ? pg.ga.scale : 5,
      enclosure: { w: typeof e.w === "number" && e.w > 0 ? e.w : 600, h: typeof e.h === "number" && e.h > 0 ? e.h : 800 },
      view: pg.ga.view === "door" ? "door" : "backplate",
    };
  }
  const gaItems = arr(pg.gaItems)
    .filter(isObj)
    .filter((it) => typeof it.id === "string" && ["rail", "trunking", "device", "note"].includes(String(it.kind)))
    .map((it) => ({
      id: it.id as string,
      kind: it.kind as GaItem["kind"],
      x: typeof it.x === "number" ? it.x : 0,
      y: typeof it.y === "number" ? it.y : 0,
      w: typeof it.w === "number" && it.w > 0 ? it.w : 20,
      h: typeof it.h === "number" && it.h > 0 ? it.h : 20,
      ...(Array.isArray(it.refs) ? { refs: it.refs.filter((r): r is string => typeof r === "string") } : {}),
      ...(typeof it.text === "string" ? { text: it.text } : {}),
      ...(typeof it.device === "string" && it.device ? { device: it.device } : {}),
    }));
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

/**
 * Drawings made with the 0.2 test builds (format 3, before the parts audit)
 * open with the parts and terminals renamed in the audit. For the test
 * period only: remove when 0.2.0 is released.
 */
function preRelease(input: Record<string, unknown>): void {
  const terms = new Map<string, Record<string, string>>(); // element id → old terminal → new
  for (const pg of arr(input.pages).filter(isObj)) {
    for (const e of arr(pg.elements).filter(isObj)) {
      const params = (isObj(e.params) ? e.params : (e.params = {})) as Record<string, unknown>;
      const id = String(e.id ?? "");
      if (e.symbol === "timer-contact") {
        const nc = params.contact === "nc";
        e.symbol = nc ? "contact-nc" : "contact-no";
        delete params.contact;
        delete params.mode;
        terms.set(id, nc ? { "15": "21", "16": "22" } : { "17": "13", "18": "14" });
      } else if (e.symbol === "pb-no" || e.symbol === "pb-nc") {
        params.contact = e.symbol === "pb-nc" ? "nc" : "no";
        e.symbol = "pushbutton";
      } else if (e.symbol === "notes") {
        e.symbol = "text";
      } else if (e.symbol === "selector" && params.contact === "co") {
        params.pole1 = "co";
        delete params.contact;
      } else if (e.symbol === "lamp") {
        terms.set(id, { "V+": "+V", "V-": "-V", T: "LT" });
      } else if (e.symbol === "supply") {
        terms.set(id, { "+": "+V", "-": "-V" });
      }
      if (e.symbol === "isolator" && params.operator === "push") params.operator = "turn";
      // Busbar colours were free text in the test builds; now one of the wire colours (T4).
      if (e.symbol === "busbar" && typeof params.colour === "string") params.colour = knownColour(params.colour);
    }
  }
  if (!terms.size) return;
  const fix = (r: unknown) => {
    if (!Array.isArray(r) || typeof r[0] !== "string") return;
    const to = terms.get(r[0])?.[String(r[1])];
    if (to) r[1] = to;
  };
  for (const pg of arr(input.pages).filter(isObj)) for (const sg of arr(pg.segments).filter(isObj)) [sg.from, sg.to].forEach(fix);
  for (const c of arr(input.conductors).filter(isObj)) arr(c.terminals).forEach(fix);
}
