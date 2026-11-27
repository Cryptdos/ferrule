/**
 * The GA device table: real devices with their sizes (from a datasheet), kept
 * in a shared library beside the projects and copied into each project that
 * uses one, so a project file always has the sizes it needs.
 */

import type { IoPoint, ModuleType, PinInfo, SupplyType } from "./model";
import { clone } from "./model";
import { MODULE_TYPES as TYPES } from "./modules";

/**
 * A controller module's model as entered from its datasheet (controller.md
 * §4): its type, channels and pins table, so the next one takes seconds.
 */
export interface ModuleTemplate {
  type: ModuleType;
  channels?: number;
  terminals: string[];
  pins?: Record<string, PinInfo>;
  /** Its points: name, form, pins (what they follow and job labels belong to the job, not the model). */
  points?: IoPoint[];
}

const MODULE_TYPES = new Set<string>(TYPES.map((t) => t.value));
const FORM_SET = new Set(["contact", "powered-out", "dry-in", "powered-in", "analogue-in", "analogue-out", "supply-in", "supply-out", "comms"]);

export function parseModuleTemplate(v: unknown): ModuleTemplate | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const o = v as Record<string, unknown>;
  if (!MODULE_TYPES.has(o.type as string)) return undefined;
  const strs = (x: unknown) => (Array.isArray(x) ? x.filter((t): t is string => typeof t === "string") : []);
  const terminals = strs(o.terminals);
  const out: ModuleTemplate = { type: o.type as ModuleType, terminals };
  if (typeof o.channels === "number" && o.channels >= 1) out.channels = Math.min(64, Math.floor(o.channels));
  if (typeof o.pins === "object" && o.pins !== null) {
    const pins: Record<string, PinInfo> = {};
    for (const [k, p] of Object.entries(o.pins as Record<string, unknown>)) {
      if (!terminals.includes(k) || typeof p !== "object" || p === null) continue;
      const q = p as Record<string, unknown>;
      const id = typeof q.id === "string" ? q.id : "";
      const group = typeof q.group === "string" ? q.group : "";
      if (id || group) pins[k] = { ...(id ? { id } : {}), ...(group ? { group } : {}) };
    }
    if (Object.keys(pins).length) out.pins = pins;
  }
  if (Array.isArray(o.points)) {
    const points = o.points
      .filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null && typeof (p as Record<string, unknown>).name === "string")
      .map((p) => ({ name: p.name as string, form: (FORM_SET.has(p.form as string) ? p.form : "dry-in") as IoPoint["form"], pins: strs(p.pins).filter((t) => terminals.includes(t)) }))
      .filter((p) => p.name && p.pins.length);
    if (points.length) out.points = points;
  }
  return out;
}

/** "door" (all door devices) from before "suits" listed schematic parts: now any part. */
const suitsFrom = (k: unknown) => {
  const v = typeof k === "string" ? k : "";
  return v === "door" ? "" : v;
};

export interface DeviceFile {
  /** File name as stored, e.g. "relay-datasheet.pdf". */
  name: string;
  type: "datasheet" | "picture";
  bytes: number;
}

/** A device in the shared library. */
export interface DeviceEntry {
  id: string;
  /** What it's called on a GA and in the list, e.g. "Relay 4CO 24V DC with base". */
  name: string;
  maker: string;
  part: string;
  /** Which kind of schematic part it suits (ga.ts SUITS: relay, contactor, lamp…), or "" for any. */
  kind: string;
  /** Width × height as seen on the backplate, and depth, in mm. */
  w: number;
  h: number;
  d: number;
  notes: string;
  files: DeviceFile[];
  /** A controller module's model: its pins as entered from the datasheet. */
  module?: ModuleTemplate;
  /** Its expected draw, VA (v0.4.x M12). */
  va?: number;
  /** What it takes (v0.5 A38): a voltage, and AC, DC or either. */
  takes?: Takes;
  /** A supply's: what it gives, its rating (VA) and its efficiency (0 to 1). */
  gives?: SupplyType;
  ratingVa?: number;
  efficiency?: number;
  /** A relay's or contactor's poles (v0.5 A70): Check warns when its contacts use more. */
  poles?: number;
  /** A distribution block's ways (v0.5 A23): Check warns when a block needs more. */
  ways?: number;
}

/** What a device takes (v0.5 A38): *24 V AC*, *24 V DC*, or *24 V AC or DC* (both). */
export interface Takes {
  v: number;
  kind: "ac" | "dc" | "both";
}

/** The supplies a device can take, as supply types: both is two. */
export function takesList(t: Takes | undefined): SupplyType[] {
  if (!t) return [];
  return t.kind === "both" ? [{ v: t.v, ac: true }, { v: t.v, ac: false }] : [{ v: t.v, ac: t.kind === "ac" }];
}

/** A device a project uses: a copy of the library entry's details (or the project's own). */
export interface ProjectDevice {
  id: string;
  name: string;
  maker: string;
  part: string;
  kind: string;
  w: number;
  h: number;
  d: number;
  /** Came from the shared library (true) or was made in this project only. */
  library: boolean;
  /** A controller module's model: its pins as entered from the datasheet. */
  module?: ModuleTemplate;
  /** Its expected draw, VA (v0.4.x M12). */
  va?: number;
  /** What it takes, gives, its rating and efficiency, its poles (v0.5 A38, A70). */
  takes?: Takes;
  gives?: SupplyType;
  ratingVa?: number;
  efficiency?: number;
  poles?: number;
  /** A distribution block's ways (v0.5 A23). */
  ways?: number;
}

/** What a device says about its supply and load, as read from a file or the library (v0.5 A38). */
function electrics(o: Record<string, unknown>): Pick<ProjectDevice, "va" | "takes" | "gives" | "ratingVa" | "efficiency" | "poles" | "ways"> {
  const pos = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v > 0;
  const t = o.takes as Record<string, unknown> | undefined;
  const g = o.gives as Record<string, unknown> | undefined;
  return {
    ...(pos(o.va) ? { va: o.va as number } : {}),
    ...(t && typeof t === "object" && pos(t.v) && (t.kind === "ac" || t.kind === "dc" || t.kind === "both") ? { takes: { v: t.v as number, kind: t.kind } } : {}),
    ...(g && typeof g === "object" && pos(g.v) && typeof g.ac === "boolean" ? { gives: { v: g.v as number, ac: g.ac } } : {}),
    ...(pos(o.ratingVa) ? { ratingVa: o.ratingVa as number } : {}),
    ...(pos(o.efficiency) && (o.efficiency as number) <= 1 ? { efficiency: o.efficiency as number } : {}),
    ...(pos(o.poles) ? { poles: Math.min(24, Math.floor(o.poles as number)) } : {}),
    ...(typeof o.ways === "number" && Number.isFinite(o.ways) && o.ways >= 1 ? { ways: Math.min(999, Math.floor(o.ways)) } : {}),
  };
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const mm = (v: unknown, dflt: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v * 10) / 10 : dflt);

export function parseDeviceFile(v: unknown): DeviceFile | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  const name = str(o.name);
  if (!name) return null;
  return { name, type: o.type === "picture" ? "picture" : "datasheet", bytes: typeof o.bytes === "number" ? o.bytes : 0 };
}

export function parseDeviceEntry(v: unknown, id?: string): DeviceEntry {
  const o = (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;
  const name = str(o.name);
  if (!name) throw new Error("A device needs a name");
  return {
    id: id ?? (str(o.id) || ""),
    name,
    maker: str(o.maker),
    part: str(o.part),
    kind: suitsFrom(o.kind),
    w: mm(o.w, 18),
    h: mm(o.h, 90),
    d: typeof o.d === "number" && o.d > 0 ? mm(o.d, 0) : 0,
    notes: typeof o.notes === "string" ? o.notes : "",
    files: Array.isArray(o.files) ? o.files.map(parseDeviceFile).filter((f): f is DeviceFile => !!f) : [],
    ...withModule(o.module),
    ...electrics(o),
  };
}

const withModule = (v: unknown): { module?: ModuleTemplate } => {
  const m = parseModuleTemplate(v);
  return m ? { module: m } : {};
};

export function parseProjectDevices(v: unknown): ProjectDevice[] {
  if (!Array.isArray(v)) return [];
  const out: ProjectDevice[] = [];
  for (const x of v) {
    if (typeof x !== "object" || x === null) continue;
    const o = x as Record<string, unknown>;
    const id = str(o.id);
    const name = str(o.name);
    if (!id || !name || out.some((d) => d.id === id)) continue;
    out.push({
      id,
      name,
      maker: str(o.maker),
      part: str(o.part),
      kind: suitsFrom(o.kind),
      w: mm(o.w, 18),
      h: mm(o.h, 90),
      d: typeof o.d === "number" && o.d > 0 ? mm(o.d, 0) : 0,
      library: o.library === true,
      ...withModule(o.module),
      ...electrics(o),
    });
  }
  return out;
}

/** The project's copy of a library entry. */
export function projectCopy(e: DeviceEntry): ProjectDevice {
  return { id: e.id, name: e.name, maker: e.maker, part: e.part, kind: e.kind, w: e.w, h: e.h, d: e.d, library: true, ...(e.module ? { module: clone(e.module) } : {}), ...electrics(e as unknown as Record<string, unknown>) };
}

/** "Relay 4CO (Maker 1234…) 30.6 × 101.8" for lists. */
export function deviceLabel(d: Pick<ProjectDevice, "name" | "maker" | "part" | "w" | "h">): string {
  const who = [d.maker, d.part].filter(Boolean).join(" ");
  return `${d.name}${who ? ` (${who})` : ""} · ${d.w} × ${d.h}`;
}

/**
 * What a device says, by what it suits (v0.5 A38, A70): a load what it takes
 * and draws, a supply what it gives with its rating and efficiency, a relay
 * its poles, a block its ways. A device for anything says all of it.
 */
export function deviceSays(kind: string): { takes: boolean; gives: boolean; poles: boolean; ways: boolean } {
  const any = !kind;
  return {
    takes: any || ["relay", "contactor", "timer", "lamp", "transformer", "module", "plant"].includes(kind),
    gives: any || ["transformer", "module", "plant"].includes(kind),
    poles: any || ["relay", "contactor", "timer"].includes(kind),
    ways: any || kind === "block",
  };
}

/** "24 V AC", "24 V DC", "24 V AC or DC". */
export const formatTakes = (t: Takes) => `${t.v} V ${t.kind === "both" ? "AC or DC" : t.kind.toUpperCase()}`;
