/**
 * Project data model (DESIGN.md §4). Store the meaning, not the drawing:
 * graphics are rebuilt from this data by the symbol library.
 */
import type { Rotation, Vec } from "./geometry";

export const FORMAT = "ferrule";
export const FORMAT_VERSION = 1;

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
  /** Wire number; empty until numbered (milestone 4). */
  number: string;
  terminals: TerminalRef[];
}

export interface Page {
  id: string;
  /** Sheet number. Always index + 1; kept in step by the page operations. */
  number: number;
  title: string;
  elements: Element[];
  segments: Segment[];
}

export interface Revision {
  rev: string;
  date: string;
  drawnBy: string;
  description: string;
}

export interface Project {
  format: typeof FORMAT;
  version: number;
  id: string;
  project: ProjectInfo;
  designation: { standard: string; overrides: Record<string, string> };
  titleBlock: string;
  plant: unknown[];
  pages: Page[];
  conductors: Conductor[];
  revisions: Revision[];
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
  return { id: newId("pg"), number, title, elements: [], segments: [] };
}

export function newProject(id: string, title = "Untitled project"): Project {
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    id,
    project: emptyInfo(title),
    designation: { standard: "iec-81346-2-2019", overrides: {} },
    titleBlock: "default-a4",
    plant: [],
    pages: [newPage(1, "Sheet 1")],
    conductors: [],
    revisions: [{ rev: "A", date: "", drawnBy: "", description: "First issue" }],
  };
}
