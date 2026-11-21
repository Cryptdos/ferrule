/**
 * Loading project files. Checks the shape, fills in fields added since
 * the file was written, and rejects anything that isn't a Ferrule project.
 */
import { FORMAT, FORMAT_VERSION, type Project, emptyInfo } from "./model";
import { getSymbol } from "./symbols";
import { colourCode } from "./wirecolours";

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
      `Project was saved by a newer Ferrule (format ${version}); this build reads up to ${FORMAT_VERSION}`,
    );
  }
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
    plant: parsePlant(input.plant),
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
  project.conductors = parseConductors(input.conductors);
  const lamps = new Set(project.pages.flatMap((pg) => pg.elements.filter((e) => e.symbol === "lamp").map((e) => e.id)));
  for (const c of project.conductors) c.terminals = c.terminals.map((t) => upgradeRef(t, lamps));
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
    title: strOr(t.title),
    boundaryY: body.boundaryY,
    sections: body.sections,
    elements: body.elements,
    segments: body.segments,
    size:
      Array.isArray(t.size) && t.size.length === 2 && t.size.every((n) => typeof n === "number")
        ? (t.size as [number, number])
        : [200, 112],
  };
}

export function parsePlant(v: unknown): Project["plant"] {
  return arr(v)
    .filter(isObj)
    .filter((pl) => typeof pl.id === "string")
    .map((pl) => ({
      id: pl.id as string,
      tag: strOr(pl.tag),
      description: strOr(pl.description),
      terminals: arr(pl.terminals).filter((t): t is string => typeof t === "string"),
      ...(Array.isArray(pl.groups)
        ? {
            groups: arr(pl.groups)
              .filter(isObj)
              .map((g) => ({ name: strOr(g.name), terminals: arr(g.terminals).filter((t): t is string => typeof t === "string") }))
              .filter((g) => g.name && g.terminals.length),
          }
        : {}),
      ...(typeof pl.info === "string" && pl.info ? { info: pl.info } : {}),
    }));
}

// ---------------------------------------------------------------------------
// Older files

/** Lamp colours were single letters before the IEC 60757 two-letter codes. */
const OLD_LAMP_COLOURS: Record<string, string> = { A: "Am", G: "Gn", R: "Rd", W: "Wh", B: "Bu", Y: "Ye" };
/** Lamp terminals were L and N before V+ and V- (they're often 24 V DC). */
const OLD_LAMP_TERMINALS: Record<string, string> = { L: "V+", N: "V-" };

function upgradeRef(ref: [string, string], lamps: Set<string>): [string, string] {
  return lamps.has(ref[0]) && OLD_LAMP_TERMINALS[ref[1]] ? [ref[0], OLD_LAMP_TERMINALS[ref[1]]!] : ref;
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
  const lamps = new Set(elements.filter((e) => e.symbol === "lamp").map((e) => e.id));
  for (const e of elements) {
    if (e.symbol === "lamp" && typeof e.params.colour === "string") {
      e.params.colour = OLD_LAMP_COLOURS[e.params.colour] ?? colourCode(e.params.colour);
    }
  }
  for (const s of segments) {
    s.from = upgradeRef(s.from, lamps);
    s.to = upgradeRef(s.to, lamps);
  }
  const boundaryY = typeof pg.boundaryY === "number" && Number.isFinite(pg.boundaryY) ? pg.boundaryY : null;
  return { id: pg.id as string, number: i + 1, title: strOr(pg.title), boundaryY, sections, elements, segments };
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
