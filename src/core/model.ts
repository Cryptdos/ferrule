/**
 * Project data model (DESIGN.md §4). Store the meaning, not the drawing:
 * graphics are rebuilt from this data by the symbol library.
 */
import type { Rotation, Vec } from "./geometry";
import type { ProjectDevice } from "./devices";

export const FORMAT = "ferrule";
export const FORMAT_VERSION = 3;

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
  /**
   * A field wire (out to plant) rather than panel wiring. Unset: decided by
   * whether it has an end outside the panel boundary.
   */
  field?: boolean;
  /** Print the wire number on this field wire too (field wires don't, by default). */
  showNumber?: boolean;
}

export interface Conductor {
  id: string;
  /** Wire number; empty until numbered. */
  number: string;
  /** Keep this number when renumbering. */
  locked?: boolean;
  /** Core colour, as an IEC 60757 code written "Bu", "GnYe"… */
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
  /** A general arrangement sheet: the panel laid out at true scale (no schematic on it). */
  ga?: GaSettings;
  gaItems?: GaItem[];
  /** A spare sheet: kept for spacing and organisation, only annotations on it (no drafting). */
  spare?: boolean;
}

export interface GaSettings {
  /** Drawn at 1:scale. */
  scale: number;
  /** Inside of the enclosure (or the door), mm. */
  enclosure: { w: number; h: number };
  view: "backplate" | "door";
}

/** Something on a GA sheet, in real mm from the enclosure's top-left corner. */
export interface GaItem {
  id: string;
  kind: "rail" | "trunking" | "device" | "note";
  x: number;
  y: number;
  w: number;
  h: number;
  /** Schematic elements this is (a device, or every terminal of a strip). */
  refs?: string[];
  /** A note's text, or a label for a device that isn't on the schematic. */
  text?: string;
  /** The device from the project's device table it is (its size came from there). */
  device?: string;
}

/** A piece of field equipment, defined once with all its terminals (DESIGN.md §6). */
export interface PlantItem {
  id: string;
  /**
   * Prefix + sheet-column of its first view, like every other tag
   * (SEF-3-13, U3-13), set by Renumber unless locked. Empty until then.
   */
  tag: string;
  /** Letters its tag starts with, e.g. SEF for a safety extract fan. */
  prefix?: string;
  /** Keep the tag as typed when renumbering. */
  locked?: boolean;
  description: string;
  /**
   * Terminal ids. Usually just the name (L, 1, NO); where two groups use the
   * same name (R1: C NO NC | R2: C NO NC) the id is group.name (R2.C).
   */
  terminals: string[];
  /** Its power supply isn't on these drawings: a break on the left, marked POWER BY OTHERS. */
  powerByOthers?: boolean;
  /** Named groups of terminals, e.g. ENABLE: 1 2. Shown inside the box under their terminals. */
  groups?: PlantGroup[];
  /** More information shown under the box (model, rating, supply…). May have several lines. */
  info?: string;
}

export interface PlantGroup {
  name: string;
  terminals: string[];
  /**
   * What it does when simulating. Unset: worked out from its terminals and
   * name (C/NO/NC: a relay output; ENABLE, START…: an input; other pairs: a
   * volt-free output).
   */
  role?: "input" | "output" | "none";
  /** An output that follows one of the plant's input groups (e.g. RUNNING follows ENABLE). */
  follows?: string;
  /** Seconds it takes to follow. */
  delay?: number;
  /** Follows the opposite way (e.g. FAULT opens when ENABLE is on). */
  invert?: boolean;
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
  /** Distributions referred to, as they were when the template was saved. */
  distributions?: Distribution[];
}

/**
 * A supply the project distributes (design-v0.2 §2): busbars, link arrows
 * and the incoming supply pick one by identity. Busbars on the same
 * distribution are one net on every sheet.
 */
export interface Distribution {
  id: string;
  /** As printed beside a busbar: "L1", "N (grid)", "CCT", "0V". */
  name: string;
  kind: DistributionKind;
  /** As written, e.g. "230 V", "24 V DC". */
  voltage: string;
  /** Core colour code (Bn, Bu, Wh…), for busbars on it unless they say otherwise. */
  colour?: string;
  /** Function (L, N, +24V, 0V…), likewise. */
  function?: string;
}

/** What a distribution is: a line or neutral, a DC + or 0 V, or earth. */
export type DistributionKind = "line" | "neutral" | "dc+" | "dc0" | "earth";

export const DISTRIBUTION_KINDS: { value: DistributionKind; label: string }[] = [
  { value: "line", label: "AC line" },
  { value: "neutral", label: "AC neutral" },
  { value: "dc+", label: "DC +" },
  { value: "dc0", label: "DC 0 V" },
  { value: "earth", label: "Earth" },
];

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
  /** Supplies busbars, link arrows and the incoming supply pick from. Starts empty. */
  distributions: Distribution[];
  pages: Page[];
  conductors: Conductor[];
  revisions: Revision[];
  templates: Template[];
  /** Logic rules the simulator checks, e.g. two contactors never on together (DESIGN.md §10). */
  rules: LogicRule[];
  /** Pictures kept in the project file: pasted or dropped images, the title block logo. */
  assets: Record<string, Asset>;
  /** The title block's logo, an asset id. */
  logo?: string;
  /** GA device sizes changed from the generic ones (ga.ts GA_SIZES), mm. */
  gaSizes?: Record<string, { w?: number; h?: number }>;
  /** Devices from the device table this project uses (copies of library entries, or its own). */
  devices?: ProjectDevice[];
  /** Offer the shared device library in this project. Off: only the project's own devices. */
  useDeviceLibrary?: boolean;
}

/** An image kept inside the project file. */
export interface Asset {
  /** A data: URL (image/png, image/jpeg or image/svg+xml). */
  data: string;
  /** Pixel size, for its shape. */
  w: number;
  h: number;
  name?: string;
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
    distributions: [],
    pages: [newPage(1, "Sheet 1")],
    conductors: [],
    revisions: [{ rev: "A", date: "", drawnBy: "", description: "First issue", clouds: [] }],
    templates: [],
    rules: [],
    assets: {},
  };
}
