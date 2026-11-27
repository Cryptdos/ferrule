/**
 * What a supply gives and what a load takes (v0.4.x M11), and the checks
 * built on it: a load fed from a supply it can't take (M11), a distribution
 * with loads and nothing supplying it (F2).
 *
 * Gives (one value): the Incoming supply part (params `gives`, a voltage,
 * and `givesKind`, AC or DC), and the device of a transformer or of a plant
 * item with a supply out or powered out (v0.5 A38). Takes (24 V AC or DC is
 * two): the device of a coil, timer coil or lamp, or of a plant item with a
 * supply in or powered in, a controller's power supply module included.
 * Unset means not stated.
 * A distribution's voltage is its printed label: only its band is read from it
 * (voltageBand, model.ts), for how heavy a power rail is drawn.
 */
import type { Element, PlantItem, Project, SupplyType } from "./model";
import { takesList } from "./devices";
import { compile, type Circuit } from "./sim";

/** The short list offered; any other can be typed. */
export const SUPPLY_CHOICES = ["24 V AC", "24 V DC", "230 V AC", "400 V AC", "12 V DC"];

/** "24 V DC", "24VDC", "230 V AC", "24vac" → a supply type; anything else → undefined. */
export function parseSupply(text: string): SupplyType | undefined {
  const m = /^\s*(\d+(?:\.\d+)?)\s*v?\s*(ac|dc)\s*$/i.exec(text.replace(/\s+/g, " "));
  if (!m) return undefined;
  const v = Number(m[1]);
  return v > 0 ? { v, ac: m[2]!.toLowerCase() === "ac" } : undefined;
}

/** A list typed as "24 V AC, 24 V DC" or "24 V AC/DC". */
export function parseSupplies(text: string): SupplyType[] {
  const out: SupplyType[] = [];
  for (const part of text.split(/[,;]/)) {
    const both = /^\s*(\d+(?:\.\d+)?)\s*v?\s*ac\s*\/\s*dc\s*$/i.exec(part);
    const got = both ? [{ v: Number(both[1]), ac: true }, { v: Number(both[1]), ac: false }] : [parseSupply(part)].filter((x): x is SupplyType => !!x);
    for (const g of got) if (!out.some((o) => o.v === g.v && o.ac === g.ac)) out.push(g);
  }
  return out;
}

export const formatSupply = (s: SupplyType) => `${s.v} V ${s.ac ? "AC" : "DC"}`;
export const formatSupplies = (s: SupplyType[]) => s.map(formatSupply).join(", ");
const same = (a: SupplyType, b: SupplyType) => a.v === b.v && a.ac === b.ac;

/** Parts whose device says what they take (v0.5 A38). */
const TAKERS = new Set(["coil", "lamp"]);

const deviceOf = (project: Project, id: string | undefined) => (id ? project.devices?.find((d) => d.id === id) : undefined);

/** What a placed part gives, if it's a supply and says: an incoming supply its own, a transformer its device's. */
export function elementGives(project: Project, el: Element): SupplyType | undefined {
  if (el.symbol === "supply") {
    const v = typeof el.params.gives === "number" ? el.params.gives : 0;
    return v > 0 ? { v, ac: el.params.givesKind !== "dc" } : undefined;
  }
  if (el.symbol === "transformer") return deviceOf(project, el.device)?.gives;
  return undefined;
}

/** What a placed part takes, if it's a load and its device says. */
export function elementAccepts(project: Project, el: Element): SupplyType[] {
  return TAKERS.has(el.symbol) ? takesList(deviceOf(project, el.device)?.takes) : [];
}

/** What a plant item's supply out gives: its device's (v0.5 A38). */
export const plantGives = (project: Project, item: PlantItem | undefined): SupplyType | undefined => (item ? deviceOf(project, item.device)?.gives : undefined);

/** What a plant item's supply in takes: its device's (v0.5 A38). */
export const plantTakes = (project: Project, item: PlantItem | undefined): SupplyType[] => (item ? takesList(deviceOf(project, item.device)?.takes) : []);

export interface SupplyFinding {
  level: "warning" | "info";
  message: string;
  ids: string[];
}

class UF {
  private p = new Map<string, string>();
  find(x: string): string {
    let r = x;
    while (this.p.has(r) && this.p.get(r) !== r) r = this.p.get(r)!;
    return r;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.p.set(ra, rb);
  }
}

interface Reach {
  c: Circuit;
  uf: UF;
  /** Each supply: what it is, its name, what it gives, the component of each phase. */
  supplies: { el: string; name: string; gives?: SupplyType; phases: Set<string>; rets: Set<string> }[];
}

/**
 * What can reach what through any closed path: every switch closed, every
 * join made, loads cutting the circuit. A load is reached by a supply when
 * either of its ends shares a component with one of the supply's phases.
 */
function reach(project: Project, c = compile(project)): Reach {
  const uf = new UF();
  for (const l of c.links) uf.union(l.a, l.b);
  const els = new Map(project.pages.flatMap((pg) => pg.elements.map((e) => [e.id, e] as const)));
  const supplies = c.supplies.map((s) => {
    let gives: SupplyType | undefined;
    const el = els.get(s.el);
    if (el) gives = elementGives(project, el);
    else {
      const m = /^plant:([^:]+):(.+)$/.exec(s.el);
      if (m) gives = plantGives(project, project.plant.find((p) => p.id === m[1]));
    }
    return {
      el: s.el,
      name: s.el === "rails" ? "the power rails" : (c.names.get(s.el) ?? s.el),
      ...(gives ? { gives } : {}),
      phases: new Set(s.phases.map((n) => uf.find(n))),
      rets: new Set(s.ret.map((n) => uf.find(n))),
    };
  });
  return { c, uf, supplies };
}

/** What a load takes, by the circuit's load id (an element, or a plant point's ref). */
function loadAccepts(project: Project, id: string): SupplyType[] | null {
  const m = /^plant:([^:]+):(.+)$/.exec(id);
  if (m) {
    const item = project.plant.find((p) => p.id === m[1]);
    const pt = item?.points?.find((q) => q.name === m[2]);
    if (!pt || (pt.form !== "supply-in" && pt.form !== "powered-in")) return null;
    return plantTakes(project, item);
  }
  const el = project.pages.flatMap((pg) => pg.elements).find((e) => e.id === id);
  if (!el || !TAKERS.has(el.symbol)) return null;
  return elementAccepts(project, el);
}

/**
 * M11: a load that says what it accepts, fed from a supply that gives
 * something else (*K3 takes 24 V AC; it's fed from G1, 24 V DC*), and one
 * line counting the loads that don't say. Loads no supply reaches are F2's.
 */
export function supplyChecks(project: Project, c = compile(project)): SupplyFinding[] {
  const out: SupplyFinding[] = [];
  const r = reach(project, c);
  let unstated = 0;
  for (const l of c.loads) {
    if (l.kind === "transformer" || l.kind === "dry") continue;
    const takes = loadAccepts(project, l.el);
    if (takes === null) continue;
    const ends = [r.uf.find(l.a), r.uf.find(l.b)];
    const from = r.supplies.filter((s) => ends.some((e) => s.phases.has(e)));
    if (!from.length) continue;
    if (!takes.length) {
      unstated++;
      continue;
    }
    for (const s of from) {
      if (!s.gives || takes.some((t) => same(t, s.gives!))) continue;
      const who = c.names.get(l.el) ?? l.el;
      const ids = /^plant:/.test(l.el) ? [] : [l.el];
      out.push({ level: "warning", message: `${who} takes ${formatSupplies(takes)}; it's fed from ${s.name}, ${formatSupply(s.gives)}`, ids });
    }
  }
  // Only once the project says what something gives or takes: a drawing that never uses it isn't told about every coil.
  const uses = r.supplies.some((x) => x.gives) || c.loads.some((l) => (loadAccepts(project, l.el) ?? []).length);
  if (unstated && uses) out.push({ level: "info", message: `${unstated} load${unstated === 1 ? " doesn't" : "s don't"} say what supply ${unstated === 1 ? "it takes" : "they take"} (a coil, lamp or plant supply in with no device, or a device that doesn't say): Check can't compare ${unstated === 1 ? "it" : "them"} with what feeds ${unstated === 1 ? "it" : "them"}`, ids: [] });
  return out;
}

/**
 * F2: a distribution whose conductors carry loads that nothing supplies:
 * *24DC feeds 14 parts and nothing supplies it.* A return (N, 0 V) is
 * supplied when a supply's return is on it. A drawing with no Incoming
 * supply part is fed by its rails, as Simulate has it, so it's quiet.
 */
export function distributionChecks(project: Project, c = compile(project)): SupplyFinding[] {
  const out: SupplyFinding[] = [];
  const r = reach(project, c);
  const fed = new Set(r.supplies.flatMap((s) => [...s.phases, ...s.rets]));
  for (const d of project.distributions) {
    // Its conductors: those on a busbar, rail or arrow on it.
    const comps = new Set<string>();
    for (const pg of project.pages)
      for (const el of pg.elements) {
        if (el.params.dist !== d.id) continue;
        for (const cd of project.conductors) if (cd.terminals.some(([id]) => id === el.id)) comps.add(r.uf.find(cd.id));
      }
    if (!comps.size || [...comps].some((x) => fed.has(x))) continue;
    const loads = new Set(c.loads.filter((l) => comps.has(r.uf.find(l.a)) || comps.has(r.uf.find(l.b))).map((l) => l.el));
    if (!loads.size) continue;
    out.push({ level: "warning", message: `${d.name} feeds ${loads.size} part${loads.size === 1 ? "" : "s"} and nothing supplies it`, ids: [...loads].filter((x) => !/^plant:/.test(x)) });
  }
  return out;
}
