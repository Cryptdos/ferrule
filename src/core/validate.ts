/**
 * Loading project files. Checks the shape, fills in fields added since
 * the file was written, and rejects anything that isn't a Ferrule project.
 */
import { FORMAT, FORMAT_VERSION, type Project, emptyInfo } from "./model";
import { getSymbol } from "./symbols";

export class ProjectFormatError extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isVec = (v: unknown): v is [number, number] =>
  Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number" && Number.isFinite(n));
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strOr = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);

export function parseProject(input: unknown): Project {
  if (!isObj(input)) throw new ProjectFormatError("Not a project: expected a JSON object");
  if (input.format !== FORMAT) throw new ProjectFormatError("Not a Ferrule project (missing format: \"ferrule\")");
  const version = typeof input.version === "number" ? input.version : 0;
  if (version > FORMAT_VERSION) {
    throw new ProjectFormatError(`Project was saved by a newer Ferrule (format ${version}); this build reads up to ${FORMAT_VERSION}`);
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
    plant: arr(input.plant),
    pages: [],
    conductors: [],
    revisions: arr(input.revisions)
      .filter(isObj)
      .map((r) => ({
        rev: strOr(r.rev),
        date: strOr(r.date),
        drawnBy: strOr(r.drawnBy),
        description: strOr(r.description),
      })),
  };

  arr(input.pages).forEach((pg, i) => {
    if (!isObj(pg) || typeof pg.id !== "string") throw new ProjectFormatError(`Page ${i + 1} is malformed`);
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
    project.pages.push({ id: pg.id, number: i + 1, title: strOr(pg.title), elements, segments });
  });

  project.conductors = arr(input.conductors)
    .filter(isObj)
    .filter((c) => typeof c.id === "string")
    .map((c) => ({
      id: c.id as string,
      number: strOr(c.number),
      ...(c.locked === true ? { locked: true } : {}),
      terminals: arr(c.terminals).filter(
        (t): t is [string, string] => Array.isArray(t) && t.length === 2 && t.every((x) => typeof x === "string"),
      ),
    }));

  return project;
}
