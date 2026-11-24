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
  /** Flipped top to bottom (before rotating): a contact drawn upside down still reads right. */
  flip?: boolean;
  zone: "internal" | "external";
  /** Its label block (tag, label, rating; a plant view's text under its box) moved by this much from its place (v0.4.x T14). */
  labelAt?: Vec;
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
  /**
   * Print the wire number here. Unset: the usual rule (printed, except on
   * field wires). The drafter can turn it off to cut clutter, or on for a
   * field wire.
   */
  showNumber?: boolean;
  /** Print the core colour here. Unset: printed when the conductor has one. */
  showColour?: boolean;
  /** Where its number sits along it, 0–1 of its drawn length (v0.4.x T13). Unset: the usual place. */
  numberAt?: number;
  /** Where its colour (and function) sits along it, 0–1 (v0.4.x T13). */
  colourAt?: number;
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
  /** Inside of the enclosure, or the door, mm. A door view of another sheet's door takes that door's size. */
  enclosure: { w: number; h: number };
  /**
   * What the sheet shows: the backplate, the door from the front (what the
   * operator sees) or the door from inside (mirrored: what's mounted through
   * it, and any rail or trunking on the door).
   */
  view: GaView;
  /** Door front: its leaves, left to right as seen from the front (one or two). Unset: one leaf, hinged on the left. */
  leaves?: DoorLeaf[];
  /** Door front: a modular door, columns of stacked doors (v0.4.x M13). Set, it takes the place of `leaves`. */
  columns?: DoorColumn[];
  /** A door view showing one door of a modular door: its column and row (from the front, from 0). */
  pane?: [number, number];
  /**
   * A backplate behind one door (v0.4.x M13): a compartment's own mounting
   * plate. The door-front sheet and the door on it; `pane` null once that
   * door is joined to another or gone (Check says so). Unset: the panel's
   * one backplate.
   */
  behind?: { sheet: string; pane: [number, number] | null };
  /** Door views: the leaf this sheet shows (0: the left one from the front, 1: the right one). Unset: the whole door. */
  leaf?: 0 | 1;
  /**
   * A door view of the door drawn on another sheet: that door-front sheet's id.
   * Always set on a door back; on a door front it shows one leaf of a door
   * laid out elsewhere. The door's devices and label plates come from there.
   */
  of?: string;
}

/** "detail": a sheet of frames, each showing an area of another GA sheet at a larger scale (design-v0.3 §6). */
export type GaView = "backplate" | "door-front" | "door-back" | "detail";

export interface DoorLeaf {
  /** Width, mm. The leaves add up to the door's width. */
  w: number;
  hinge: "left" | "right";
}

/**
 * A modular door's column (v0.4.x M13): stacked doors, top to bottom, each
 * its own piece of steel with its own hinge. Columns run left to right from
 * the front; their widths add up to the door's, the last taking what's left.
 */
export interface DoorColumn {
  /** Width, mm. */
  w: number;
  doors: DoorPane[];
}

/** One door in a column: its height (the last in a column takes what's left), hinge and name. */
export interface DoorPane {
  h: number;
  hinge: "left" | "right";
  name?: string;
}

/** Something on a GA sheet, in real mm from the enclosure's (or door's) top-left corner, as the sheet sees it. */
export interface GaItem {
  id: string;
  /**
   * "detail": an area of this sheet shown on a detail sheet (a dashed box,
   * lettered). "frame": on a detail sheet, what's inside one detail, at the
   * frame's own scale (design-v0.3 §6).
   */
  kind: "rail" | "trunking" | "device" | "label" | "dim" | "detail" | "frame";
  x: number;
  y: number;
  w: number;
  h: number;
  /** Schematic elements this is (a device, or every terminal of a strip). */
  refs?: string[];
  /** A controller's module (a plant item's id) rather than a schematic element. */
  module?: string;
  /** Which part of the device: its door handle (an isolator worked through the door) rather than its body. */
  part?: "handle";
  /** A label for a device, instead of its tag; a label plate's engraving. */
  text?: string;
  /** A door device with no schematic part (v0.4.x M5): its tag, printed on it and on the bill of materials. */
  tag?: string;
  /** The device from the project's device table it is (its size came from there). */
  device?: string;
  /** A terminal strip: its name. The strip keeps up with the schematic (refs and length follow it). */
  strip?: string;
  /** A strip's terminals when its GA sheet was last open: Check reports a strip that has changed since. */
  seen?: string[];
  /** A door device's cut-out, as written: "22.3" (a round hole, mm) or "92 x 92". Shown on the door back. */
  cutout?: string;
  /** A detail: its letter, unique across the project (A, B, C…). Its title is `text`. */
  letter?: string;
  /** A frame: the detail it shows (that item's id, on another GA sheet). */
  detail?: string;
  /** A dimension added in a frame: that frame's id. It measures the source sheet (its mm) and shows only in the frame. */
  frame?: string;
  /** A frame: its scale, paper mm per real mm (2 for 2:1, 0.5 for 1:2). Its w and h follow its detail × this. */
  zoom?: number;
  /** A label plate's engraved text height, mm. */
  textMm?: number;
  /** A dimension: what it measures and where its line is (x, y, w and h are its extent, worked out). */
  dim?: GaDim;
}

/** A horizontal or vertical dimension on a GA, in mm from the GA's own scale. */
export interface GaDim {
  axis: "h" | "v";
  /** Chain: the gaps along a run. Baseline: each point's distance from the first. */
  style: "chain" | "baseline";
  /** The points measured, in order along the axis. */
  points: GaDimPoint[];
  /** Where the (first) dimension line is, across the axis, mm. */
  at: number;
}

/**
 * A point a dimension measures to: an edge or the middle of an item (so the
 * dimension follows it when it moves), or the enclosure's edge ("@encl").
 * `v` is the position along the axis, kept for a point on nothing or an
 * item that has gone.
 */
export interface GaDimPoint {
  v: number;
  item?: string;
  edge?: "start" | "mid" | "end";
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
   * Pin numbers, in order: what's wired. Usually as printed (L, 1, NO);
   * where two points use the same one (R1: C NO NC | R2: C NO NC) it's kept
   * apart as point.number (R2.C), printed C.
   */
  terminals: string[];
  /** Its power supply isn't on these drawings: a break on the left, marked POWER BY OTHERS. */
  powerByOthers?: boolean;
  /** A small picture inside its view's box (v0.4.x M1): what kind of device it is. The picture only. */
  mark?: PlantMark;
  /**
   * In the panel (v0.4.x T3): a power supply, UPS or battery. Still plant
   * (points, pins, a view), but listed under *Panel* in Design, drawn above
   * the boundary, sized on the GA, and not field plant.
   */
  inPanel?: boolean;
  /** A pin's other labels, by its number: its id (C, Y1, VO) and its group (IO1, AO1). */
  pins?: Record<string, PinInfo>;
  /** Its signals, each made of pins (controller.md §3): what's drawn under the boxes, and how it simulates. */
  points?: IoPoint[];
  /** More information shown under the box (model, rating, supply…). May have several lines. */
  info?: string;
  /**
   * A controller's module (controller.md §4) rather than plant: drawn at the
   * top of the sheet with its terminals underneath. Its controller lists it
   * in rail order.
   */
  module?: ModuleInfo;
  // Design (design-v0.4 §2). All optional: plant from earlier files has none.
  /** The system it's grouped under ("Chilled water"): a name, listed in `Project.systems`. Unset: the unnamed group. */
  system?: string;
  /** How it connects to the controller. Unset: hardwired. */
  connects?: "comms" | "both";
  /** For comms: the protocol, free text ("BACnet IP", "Modbus RTU"). */
  protocol?: string;
  /** For comms: the network it's on (a `Network` id). */
  network?: string;
  /** Free text: what enables it ("ventilation time zone"). */
  enabledBy?: string;
  /** Free text: where in the client's document it came from. */
  source?: string;
  /** Hardwired interlocks (design-v0.4 §6): each becomes a generated expectation. */
  interlocks?: Interlock[];
}

/** How a plant item connects to the controller (design-v0.4 §2). */
export const CONNECTS: { value: "hardwired" | "comms" | "both"; label: string }[] = [
  { value: "hardwired", label: "Hardwired" },
  { value: "comms", label: "Comms" },
  { value: "both", label: "Hardwired and comms" },
];

/**
 * "This point is never on while that condition holds" (design-v0.4 §6):
 * one of the plant's own points against one or two conditions in the
 * language expectations use. It generates an expectation that names it.
 */
export interface Interlock {
  id: string;
  /** The plant's own point that must stay off. */
  point: string;
  when: Condition[];
  join?: "and" | "or";
}

/**
 * A Design template (design-v0.4 §3): plant rows someone saved, with their
 * points and interlocks. A list of its own, apart from Draft's templates
 * (drawing fragments). Nothing is built in, and nothing links back: what's
 * inserted is ordinary plant.
 */
export interface DesignTemplate {
  name: string;
  /** Copies of the rows: no module, no channels, no system (the system is picked when inserting). */
  plant: PlantItem[];
}

/** A network comms plant is on (design-v0.4 §7): a LAN off a switch, or a bus off the controller. */
export interface Network {
  id: string;
  name: string;
  /** Free text: "BACnet IP", "Modbus RTU". */
  protocol: string;
  kind: "lan" | "bus";
}

/** The generic module types Ferrule ships (controller.md §4). */
export type ModuleType = "psu" | "host" | "di" | "do" | "uio" | "ai" | "ao";

/** What makes a plant item a controller's module. */
export interface ModuleInfo {
  /** The controller it's part of. */
  controller: string;
  type: ModuleType;
  /** Channels, like a contactor's poles: a DI module with 8 is a DI-8. Unset on a power supply or host. */
  channels?: number;
  maker?: string;
  model?: string;
  /** Its position on the controller's bus, set by hand to match its DIP switches. Unset: from rail order. */
  address?: number;
  /** The model it is from the device table (its size on the GA, its pins as entered from the datasheet). */
  device?: string;
}

/**
 * A BMS outstation or PLC (controller.md §4): its modules together, in rail
 * order, with any spare slots. Identified by its host module's tag.
 */
export interface Controller {
  id: string;
  /** e.g. "AHU-1 outstation". */
  description: string;
  /** Letters its modules' tags start with: A unless the project says otherwise. */
  prefix: string;
  slots: ControllerSlot[];
}

/** A place on the controller's rail: a module (a plant item's id) or a spare slot. */
export interface ControllerSlot {
  module?: string;
  /** A spare slot: drawn dashed on the controller map (Spare I/O). */
  spare?: boolean;
  /** A spare slot's bus address set by hand. */
  address?: number;
}

/** A pin's labels beyond its number (controller.md §3): both optional, shown when present. */
export interface PinInfo {
  id?: string;
  group?: string;
}

/**
 * How a point works (controller.md §3), always from the device's side: an
 * output is something the device switches, an input something it senses.
 */
export type PointForm =
  | "contact"
  | "powered-out"
  | "dry-in"
  | "powered-in"
  | "analogue-in"
  | "analogue-out"
  | "supply-in"
  | "supply-out"
  | "comms";

export const POINT_FORMS: { value: PointForm; label: string; hint: string }[] = [
  { value: "contact", label: "Contact", hint: "C + NO, C + NC, or C + NO + NC: the device switches it" },
  { value: "powered-out", label: "Powered output", hint: "Output + common: the device puts out a voltage" },
  { value: "dry-in", label: "Dry input", hint: "Input + common: on when the loop between them is closed" },
  { value: "powered-in", label: "Powered input", hint: "Input + common: on when there's a voltage across them" },
  { value: "analogue-in", label: "Analogue input", hint: "Signal + common: drawn and scheduled, not simulated" },
  { value: "analogue-out", label: "Analogue output", hint: "Signal + common: drawn and scheduled, not simulated" },
  { value: "supply-in", label: "Supply in", hint: "Power to the device: on when it's powered" },
  { value: "supply-out", label: "Supply out", hint: "Power from the device: a source, on its distributions" },
  { value: "comms", label: "Comms", hint: "RS485, Modbus…: drawn and scheduled, not simulated" },
];

/** Forms the device senses. */
export const INPUT_FORMS: PointForm[] = ["dry-in", "powered-in", "supply-in"];
/** Forms the device switches: clicked in simulation, or following something. */
export const OUTPUT_FORMS: PointForm[] = ["contact", "powered-out", "supply-out"];
export const ANALOGUE_FORMS: PointForm[] = ["analogue-in", "analogue-out"];

/** Field device marks drawn inside a plant view (v0.4.x M1). */
export type PlantMark = "temperature" | "pressure" | "humidity" | "dp-switch" | "valve" | "damper" | "meter" | "power-supply" | "battery";
export const PLANT_MARKS: { value: PlantMark; label: string }[] = [
  { value: "temperature", label: "Temperature" },
  { value: "pressure", label: "Pressure" },
  { value: "humidity", label: "Humidity" },
  { value: "dp-switch", label: "ΔP switch" },
  { value: "valve", label: "Valve" },
  { value: "damper", label: "Damper" },
  { value: "meter", label: "Meter" },
  { value: "power-supply", label: "Power supply" },
  { value: "battery", label: "Battery" },
];

/** What a supply gives or a load takes (v0.4.x M11): 24 V DC, 230 V AC… */
export interface SupplyType {
  v: number;
  ac: boolean;
}

/** One signal made of pins, e.g. `Airflow proven` (C, NO) or `Mains` (L, N, PE). */
export interface IoPoint {
  /** Unique on its device. */
  name: string;
  form: PointForm;
  /** Pin numbers, in the device's order. */
  pins: string[];
  /** Outputs: what it follows (up to two conditions). Unset: clicked by hand in simulation. */
  follows?: Condition[];
  /** How two conditions join. */
  join?: "and" | "or";
  /** Seconds it takes to follow. */
  delay?: number;
  /** Supply out: the distribution each pin feeds, by pin number. */
  dists?: Record<string, string>;
  /** Supply out or powered out: what it gives (v0.4.x M11). Unset: not stated. */
  gives?: SupplyType;
  /** Supply in or powered in: what it accepts, any of these (v0.4.x M11). Unset: not stated. */
  accepts?: SupplyType[];
  /** What it does on this job, printed along its wire under a module's terminals: "SF-01 RUNNING". */
  label?: string;
  // Design (design-v0.4 §2, §4). A point made in Design may have no pins yet.
  /** Free text with suggestions: volt-free, 24 V, 0–10 V, thermistor, pulse. */
  signal?: string;
  /** Where it goes (§4). Unset: straight to a controller channel. */
  goesTo?: "relay" | "panel";
  /** The module channel it's allocated to: a module (plant id) and its point. Unset until allocated. */
  channel?: ChannelRef;
  /**
   * Wired to its channel, confirmed by hand (design-v0.4 §5): the wiring at
   * both ends as it was when confirmed. Any change there, and it's to review again.
   */
  confirmed?: string;
}

/** A module's channel: the module (a plant item with `module` set) and the point that is the channel. */
export interface ChannelRef {
  module: string;
  point: string;
}

/** Where a point goes (design-v0.4 §4). */
export const GOES_TO: { value: "channel" | "relay" | "panel"; label: string; hint: string }[] = [
  { value: "channel", label: "Channel", hint: "Wired straight to a controller channel" },
  { value: "relay", label: "Channel, via relay", hint: "The plant switches a relay; its contact switches the channel (or the reverse for outputs)" },
  { value: "panel", label: "Panel only", hint: "Used in the panel's own circuits; never reaches the controller" },
];

/** Signals offered as suggestions (free text). */
export const SIGNAL_SUGGESTIONS = ["volt-free", "24 V", "230 V", "0–10 V", "4–20 mA", "thermistor", "pulse"];

/**
 * A plain condition (controller.md §6): a thing and a state. `ref` is an
 * element id (a coil energised, a contact closed, a lamp lit, a switch on)
 * or a point, `plant:<plant id>:<point name>`.
 */
export interface Condition {
  ref: string;
  on: boolean;
}

/**
 * A statement about how the drawing should behave (controller.md §6),
 * checked live in Simulate and exhaustively by Check logic:
 *  - "should": an input point should be on (or off) when the conditions
 *    hold, and the other way when they don't;
 *  - "never": the conditions should never hold.
 */
export interface Expectation {
  id: string;
  kind: "should" | "never";
  /** "should": the input point, `plant:<id>:<point>`. */
  point?: string;
  /** "should": the state it should be in when the conditions hold (on unless set). */
  on?: boolean;
  /** One or two conditions. */
  when: Condition[];
  join?: "and" | "or";
  note?: string;
  /** Generated by this interlock (its id): follows it when edited or removed (design-v0.4 §6). */
  interlock?: string;
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
  /** Controllers (controller.md §4): their modules are plant items with `module` set. */
  controllers?: Controller[];
  /** Systems in Design (design-v0.4 §2): names, in order. Plant names one in `system`. */
  systems?: string[];
  /** Networks comms plant is on (design-v0.4 §7). */
  networks?: Network[];
  /** Supplies busbars, link arrows and the incoming supply pick from. Starts empty. */
  distributions: Distribution[];
  pages: Page[];
  conductors: Conductor[];
  revisions: Revision[];
  templates: Template[];
  /** What the drawing should do, checked by simulation (controller.md §6). */
  expectations: Expectation[];
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
    expectations: [],
    assets: {},
  };
}
