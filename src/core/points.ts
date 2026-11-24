/**
 * IO points (controller.md §3, §4): a device's pins grouped into signals,
 * each with a form. Shared by the plant editor, the plant view, the
 * simulator, checks and the MCP tools.
 */
import {
  ANALOGUE_FORMS,
  INPUT_FORMS,
  OUTPUT_FORMS,
  POINT_FORMS,
  type Condition,
  type Expectation,
  type IoPoint,
  type PinInfo,
  type PlantItem,
  type PointForm,
  type Project,
} from "./model";
import { displayTag } from "./tags";
import { terminalNames } from "./symbols";
import { pointLabel, viewsOf } from "./modules";

/** The simulator's (and expectations') id for a point: shared by every view of its device. */
export function pointRef(plantId: string, point: string): string {
  return `plant:${plantId}:${point}`;
}

/** The device and point a point ref names, if it is one. */
export function parsePointRef(ref: string): { plant: string; point: string } | null {
  const m = /^plant:([^:]+):(.+)$/.exec(ref);
  return m ? { plant: m[1]!, point: m[2]! } : null;
}

export const isInputForm = (f: PointForm) => INPUT_FORMS.includes(f);
export const isOutputForm = (f: PointForm) => OUTPUT_FORMS.includes(f);
export const isAnalogueForm = (f: PointForm) => ANALOGUE_FORMS.includes(f);
export const formLabel = (f: PointForm) => POINT_FORMS.find((x) => x.value === f)?.label ?? f;

/** A pin number as printed: without the point it was told apart by (R2.C → C). */
export function printedPin(pin: string, point?: string): string {
  return point && pin.startsWith(`${point}.`) ? pin.slice(point.length + 1) : pin;
}

const bare = (pin: string) => pin.split(".").pop()!.toUpperCase();

/**
 * A form guessed from a point's name and pins, for quick entry: C/NO/NC is a
 * contact; L/N/E or +V/-V a supply in; a pair named like a command (ENABLE,
 * START, RUN…) a powered input; any other pair a contact (volt-free, as
 * RUNNING, FAULT, PROVEN usually are). Changed in the pins table as needed.
 */
export function guessForm(name: string, pins: string[]): PointForm {
  const names = pins.map(bare);
  if (names.some((t) => t === "C" || t === "COM") && names.some((t) => t === "NO" || t === "NC")) return "contact";
  if (names.some((t) => t === "L" || t === "+V" || t === "L1") && names.some((t) => t === "N" || t === "-V" || t === "0V")) return "supply-in";
  if (/^RUN$|ENABLE|START|RUN\s*(CMD|COMMAND)|COMMAND|CMD|INPUT|ON\/OFF|DEMAND|CALL|STOP/i.test(name)) return "powered-in";
  if (/0-10\s*V|4-20\s*MA|ANALOGUE|SPEED|SIGNAL/i.test(name)) return "analogue-in";
  if (/RS485|MODBUS|BACNET|COMMS|BUS\b/i.test(name)) return "comms";
  return "contact";
}

/**
 * A contact point's common, NO and NC pins: by name (C, COM, NO, NC; the
 * pin's id where it has one, else its number), else in order C, NO, NC.
 */
export function contactPins(p: IoPoint, pinInfo?: Record<string, PinInfo>): { c?: string; no?: string; nc?: string } {
  const nameOf = (t: string) => (pinInfo?.[t]?.id ? pinInfo[t]!.id!.toUpperCase() : bare(t));
  const find = (...names: string[]) => p.pins.find((t) => names.includes(nameOf(t)));
  const c = find("C", "COM");
  const no = find("NO");
  const nc = find("NC");
  if (c || no || nc) return { c: c ?? p.pins.find((t) => t !== no && t !== nc), no, nc };
  // Two unnamed pins: a volt-free NO pair. Three: C, NO, NC.
  return { c: p.pins[0], no: p.pins[1], nc: p.pins[2] };
}

/** An input's or powered output's signal and common pins (the first two). */
export function signalPins(p: IoPoint): { sig?: string; com?: string } {
  return { sig: p.pins[0], com: p.pins[1] };
}

/**
 * Quick entry (controller.md §4): "L N E | ENABLE: 1 2 | R1: C NO NC".
 * Runs are separated by "|"; a run may start with a point name and a colon.
 * A number used in two points is told apart by its point: R2.C.
 */
export function parseQuickEntry(spec: string): { terminals: string[]; points: IoPoint[] } {
  const clean = (list: string[]) => [...new Set(list.map((t) => t.trim()).filter(Boolean))];
  const runs = spec.split("|").map((run) => {
    const i = run.indexOf(":");
    return { name: i >= 0 ? run.slice(0, i).trim() : "", terms: clean((i >= 0 ? run.slice(i + 1) : run).split(/[,\s]+/)) };
  });
  const count = new Map<string, number>();
  for (const r of runs) for (const t of r.terms) count.set(t, (count.get(t) ?? 0) + 1);
  const terminals: string[] = [];
  const points: IoPoint[] = [];
  for (const r of runs) {
    const ids = r.terms.map((t) => ((count.get(t) ?? 0) > 1 && r.name ? `${r.name}.${t}` : t)).filter((id) => !terminals.includes(id));
    terminals.push(...ids);
    if (!r.name || !ids.length) continue;
    const p = points.find((x) => x.name === r.name);
    if (p) p.pins.push(...ids);
    else points.push({ name: r.name, form: "contact", pins: ids });
  }
  for (const p of points) p.form = guessForm(p.name, p.pins);
  return { terminals, points };
}

/** The other way: a device's pins and points as one line. */
export function formatQuickEntry(item: Pick<PlantItem, "terminals" | "points">): string {
  const pointOf = pointOfPin(item);
  const runs: { name: string; terms: string[] }[] = [];
  for (const t of item.terminals) {
    const name = pointOf.get(t) ?? "";
    const last = runs[runs.length - 1];
    if (last && last.name === name) last.terms.push(printedPin(t, name));
    else runs.push({ name, terms: [printedPin(t, name)] });
  }
  return runs.map((r) => (r.name ? `${r.name}: ${r.terms.join(" ")}` : r.terms.join(" "))).join(" | ");
}

/** Pin number → the point it's in. */
export function pointOfPin(item: Pick<PlantItem, "points">): Map<string, string> {
  const out = new Map<string, string>();
  for (const p of item.points ?? []) for (const t of p.pins) if (!out.has(t)) out.set(t, p.name);
  return out;
}

/**
 * Points edited by quick entry keep what they had (form, what they follow,
 * distributions) where their name is unchanged; new ones take the guess.
 */
export function mergePoints(before: IoPoint[], after: IoPoint[]): IoPoint[] {
  const merged = after.map((p) => {
    const old = before.find((x) => x.name === p.name);
    return old ? { ...old, pins: p.pins } : p;
  });
  // Points with no pins yet (made in Design) aren't in a quick-entry line: they stay.
  return [...merged, ...before.filter((x) => !x.pins.length && !after.some((p) => p.name === x.name))];
}

/**
 * Points that only mention pins the device has, named once each. A point
 * made with no pins (in Design, design-v0.4 §2) is kept; one whose pins
 * have all gone from the device goes with them.
 */
export function cleanPoints(points: IoPoint[], terminals: string[]): IoPoint[] {
  const have = new Set(terminals);
  const seen = new Set<string>();
  const out: IoPoint[] = [];
  for (const p of points) {
    const name = p.name.trim();
    // A pin may be in several points: a shared common (⊥, C1) is one pin, drawn once.
    const pins = [...new Set(p.pins)].filter((t) => have.has(t));
    if (!name || seen.has(name) || (p.pins.length && !pins.length)) continue;
    seen.add(name);
    const q: IoPoint = { ...p, name, pins };
    if (q.label !== undefined) {
      const l = q.label.trim();
      if (l) q.label = l;
      else delete q.label;
    }
    if (!isOutputForm(q.form)) {
      delete q.follows;
      delete q.join;
      delete q.delay;
    }
    if (q.form !== "supply-out") delete q.dists;
    else if (q.dists) q.dists = Object.fromEntries(Object.entries(q.dists).filter(([k, v]) => pins.includes(k) && v));
    if (q.follows && !q.follows.length) delete q.follows;
    if (!q.follows) {
      delete q.join;
      delete q.delay;
    }
    out.push(q);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Things a condition can name

export interface Thing {
  ref: string;
  /** As people say it: K3-12, SF-01 Running, A3-23:DI2. */
  name: string;
  /** What "on" means for it: energised, closed, lit, on. */
  onWord: string;
  offWord: string;
  /** Sheet it's on (its first view, for a point). */
  page?: number;
  /** Points: its form. */
  form?: PointForm;
}

const ELEMENT_WORDS: Record<string, [string, string]> = {
  coil: ["energised", "de-energised"],
  "timer-coil": ["energised", "de-energised"],
  lamp: ["lit", "out"],
  "contact-no": ["closed", "open"],
  "contact-nc": ["closed", "open"],
  "contact-co": ["operated", "released"],
  pushbutton: ["pressed", "released"],
  selector: ["out of 0", "in 0"],
  isolator: ["closed", "open"],
  fuse: ["intact", "blown"],
};

/** Everything a condition or expectation can name, in sheet order: parts first, then points by device. */
export function things(project: Project): Thing[] {
  const out: Thing[] = [];
  for (const pg of project.pages) {
    for (const el of pg.elements) {
      const w = ELEMENT_WORDS[el.symbol];
      if (!w) continue;
      // A contact shares its coil's tag: its terminals tell it apart (K3-12 13-14).
      const tag = displayTag(el, project) || el.label || el.symbol;
      const name = el.symbol.startsWith("contact-") ? `${tag} ${terminalNames(el).join("-")}` : tag;
      out.push({ ref: el.id, name, onWord: w[0], offWord: w[1], page: pg.number });
    }
  }
  for (const item of project.plant) {
    const views = viewsOf(project, item.id);
    for (const p of item.points ?? []) {
      if (isAnalogueForm(p.form) || p.form === "comms") continue;
      const shown = views.find((v) => String(v.el.params.show ?? "").split(",").includes(p.pins[0] ?? "")) ?? views[0];
      out.push({
        ref: pointRef(item.id, p.name),
        // SF-01 Running; a module's A3-23:DI2, or A3-23:DO5 (4-10) when drawn on a continuation.
        name: pointLabel(project, item, p, views),
        onWord: "on",
        offWord: "off",
        page: shown?.page.number,
        form: p.form,
      });
    }
  }
  return out;
}

/** A point by its ref. */
export function pointByRef(project: Project, ref: string): { item: PlantItem; point: IoPoint } | null {
  const r = parsePointRef(ref);
  if (!r) return null;
  const item = project.plant.find((p) => p.id === r.plant);
  const point = item?.points?.find((p) => p.name === r.point);
  return item && point ? { item, point } : null;
}

/** A condition in words: "K3-12 energised". */
export function describeCondition(project: Project, c: Condition, list = things(project)): string {
  const t = list.find((x) => x.ref === c.ref);
  if (!t) return `(missing) ${c.on ? "on" : "off"}`;
  return `${t.name} ${c.on ? t.onWord : t.offWord}`;
}

export function describeConditions(project: Project, cs: Condition[], join: "and" | "or" = "and", list = things(project)): string {
  return cs.map((c) => describeCondition(project, c, list)).join(` ${join} `);
}

/** An expectation in words: "SF-01 Run should be on when K3-34 energised", "Never: K3-23 energised and K3-56 energised". */
export function describeExpectation(project: Project, e: Expectation, list = things(project)): string {
  const when = describeConditions(project, e.when, e.join, list);
  if (e.kind === "never") return `Never: ${when}`;
  const t = list.find((x) => x.ref === e.point);
  return `${t?.name ?? "(missing)"} should be ${e.on === false ? "off" : "on"} when ${when}`;
}

/** Refs an expectation names that don't exist (controller.md §10: an error). */
export function missingRefs(project: Project, e: Expectation, list = things(project)): string[] {
  const have = new Set(list.map((t) => t.ref));
  const refs = [...(e.kind === "should" ? [e.point ?? ""] : []), ...e.when.map((c) => c.ref)];
  return refs.filter((r) => !have.has(r));
}

/**
 * A thing named by tag as people write it ("K3-12", "SF-01 Running",
 * "SF-01:Running", "A3-23:DI2", "A3-23 DI2"), or by its ref. Where a point
 * is drawn, "(4-10)", needn't be given.
 */
export function findThing(project: Project, name: string, list = things(project)): Thing | undefined {
  const key = (s: string) => s.trim().toLowerCase().replace(/\s*\(\d+-\d+\)$/, "").replace(/:/, " ");
  const n = key(name);
  return list.find((t) => t.ref === name) ?? list.find((t) => key(t.name) === n);
}
