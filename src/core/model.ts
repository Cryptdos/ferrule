/**
 * Project data model (DESIGN.md §4). Store the meaning, not the drawing:
 * graphics are rebuilt from this data by the symbol library.
 */
import type { Rotation, Vec } from "./geometry";

export const FORMAT = "ferrule";
export const FORMAT_VERSION = 2;

export type ParamValue = string | number | boolean;

export interface ProjectInfo {
  title: string;
  panelName: string;
  client: string;
  jobNo: string;
  drawingNo: string;
  drawnBy: string;
  drawnDate: string;
  checkedBy: string;
  checkedDate: string;
}

export interface Element {
  id: string;
  /** Symbol id from the symbol library. */
  symbol: string;
  /** Component tag. Empty until numbered or typed; shown as `prefix?`. */
  tag: string;
  /** Free text shown under the tag, e.g. "POWER ON". */
  label: string;
  /** Origin in grid units. */
  pos: Vec;
  rot: Rotation;
  zone: "internal" | "external";
  /** Symbol-specific settings (lamp colour, rail label, pole count…). */
  params: Record<string, ParamValue>;
  /** Linked elements (coil ↔ contacts). Filled in by milestone 4. */
  links: string[];
}

/** A terminal on an element: [element id, terminal name]. */
export type TerminalRef = [string, string];

export interface Segment {
  id: string;
  /** Conductor (potential) this wire belongs to. Derived. */
  conductor: string;
  from: TerminalRef;
  to: TerminalRef;
  /** "auto" routes are recomputed by the router; "manual" keep their points. */
  route: "auto" | "manual";
  /** Polyline in grid units, first and last points on the terminals. */
  points: Vec[];
}

export interface Conductor {
  id: string;
  /** Wire number; empty until numbered. */
  number: string;
  /** Keep this number when renumbering. */
  locked?: boolean;
  /** Core colour, as an IEC 60757 code (e.g. "BU", "GNYE"). */
  colour?: string;
  /** What it carries, e.g. "0V", "24V AC", "L1". */
  function?: string;
  terminals: TerminalRef[];
}

/** A named dashed box around a functional area (DESIGN.md §2, benchmark). */
export interface Section {
  id: string;
  /** May contain fields, e.g. "{plant:p1.tag} SECTION". */
  label: string;
  /** x, y, w, h in grid units. */
  rect: [number, number, number, number];
}

export interface Page {
  id: string;
  /** Sheet number. Always index + 1; kept in step by the page operations. */
  number: number;
  title: string;
  /** Panel boundary (DESIGN.md §7): internal above, field below. Null: no boundary on this sheet. */
  boundaryY: number | null;
  sections: Section[];
  elements: Element[];
  segments: Segment[];
}

/** A piece of field equipment, defined once with all its terminals (DESIGN.md §6). */
export interface PlantItem {
  id: string;
  tag: string;
  description: string;
  terminals: string[];
  /** Named groups of terminals, e.g. ENABLE: 1 2. Shown inside the box under their terminals. */
  groups?: PlantGroup[];
  /** More information shown under the box (model, rating, supply…). May have several lines. */
  info?: string;
}

export interface PlantGroup {
  name: string;
  terminals: string[];
}

/** A revision cloud around what changed, on one sheet. */
export interface Cloud {
  id: string;
  pageId: string;
  /** x, y, w, h in grid units. */
  rect: [number, number, number, number];
}

export interface Revision {
  rev: string;
  date: string;
  drawnBy: string;
  description: string;
  /** Clouds marking this revision's changes. Only the latest revision's clouds are drawn. */
  clouds: Cloud[];
}

/**
 * A template (DESIGN.md §2, §4): a sheet or a section drawn once and stamped
 * out again with new plant and new tags. It carries copies of the plant
 * items it refers to, so it can go into another project.
 */
export interface Template {
  id: string;
  name: string;
  /** "sheet": becomes a new sheet. "section": stamped onto the current sheet. */
  kind: "sheet" | "section";
  /** Plant items referred to, as they were when the template was saved. */
  plant: PlantItem[];
  title: string;
  boundaryY: number | null;
  sections: Section[];
  elements: Element[];
  segments: Segment[];
  /** Size of the stamped area, for section templates. */
  size: [number, number];
}

export type NumberingScheme = "position" | "sequential";

export interface Project {
  format: typeof FORMAT;
  version: number;
  id: string;
  project: ProjectInfo;
  /** How renumbering assigns tags and wire numbers (DESIGN.md §8). */
  numbering: { scheme: NumberingScheme };
  designation: { standard: string; overrides: Record<string, string> };
  titleBlock: string;
  plant: PlantItem[];
  pages: Page[];
  conductors: Conductor[];
  revisions: Revision[];
  templates: Template[];
  /** Logic rules the simulator checks, e.g. two contactors never on together (DESIGN.md §10). */
  rules: LogicRule[];
}

export interface LogicRule {
  id: string;
  /** "never-both": a and b are never energised/lit together. "never": a never is. */
  kind: "never-both" | "never";
  a: string;
  b?: string;
  note?: string;
}

export function emptyInfo(title = "Untitled project"): ProjectInfo {
  return {
    title,
    panelName: "",
    client: "",
    jobNo: "",
    drawingNo: "",
    drawnBy: "",
    drawnDate: "",
    checkedBy: "",
    checkedDate: "",
  };
}

let counter = 0;
/** Short unique id with a type prefix, e.g. `e_k3j9x2a`. */
export function newId(prefix: string): string {
  counter = (counter + 1) % 1296;
  const rand = Math.floor(Math.random() * 36 ** 5)
    .toString(36)
    .padStart(5, "0");
  return `${prefix}_${rand}${counter.toString(36).padStart(2, "0")}`;
}

export function newPage(number: number, title = ""): Page {
  return { id: newId("pg"), number, title, boundaryY: null, sections: [], elements: [], segments: [] };
}

export function newProject(id: string, title = "Untitled project"): Project {
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    id,
    project: emptyInfo(title),
    numbering: { scheme: "position" },
    designation: { standard: "iec-81346-2-2019", overrides: {} },
    titleBlock: "default-a4",
    plant: [],
    pages: [newPage(1, "Sheet 1")],
    conductors: [],
    revisions: [{ rev: "A", date: "", drawnBy: "", description: "First issue", clouds: [] }],
    templates: [],
    rules: [],
  };
}
