/**
 * What a supply gives and what a load takes (v0.4.x M11), and the checks
 * built on it: a load fed from a supply it can't take (M11), a distribution
 * with loads and nothing supplying it (F2).
 *
 * Gives (one value): the Incoming supply part and a transformer (param
 * `gives`), a plant point of form supply out or powered out (`gives`).
 * Accepts (a list: *24 V AC/DC* is two): coils, timer coils and lamps (param
 * `accepts`), a plant point of form supply in or powered in (`accepts`), a
 * controller's power supply module through its supply-in point. On parts
 * they're text, "24 V DC" or "24 V AC, 24 V DC"; unset means not stated.
 * A distribution's voltage stays its printed label and isn't parsed.
 */
import type { Element, Project, SupplyType } from "./model";
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

/** Parts whose param `gives` is what they give. */
const GIVERS = new Set(["supply", "transformer"]);
/** Parts whose param `accepts` is what they take. */
const TAKERS = new Set(["coil", "timer-coil", "lamp"]);

/** What a placed part gives, if it's a supply and says. */
export function elementGives(el: Element): SupplyType | undefined {
  return GIVERS.has(el.symbol) && typeof el.params.gives === "string" ? parseSupply(el.params.gives) : undefined;
}

/** What a placed part takes, if it's a load and says. */
export function elementAccepts(el: Element): SupplyType[] {
  return TAKERS.has(el.symbol) && typeof el.params.accepts === "string" ? parseSupplies(el.params.accepts) : [];
}

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
    if (el) gives = elementGives(el);
    else {
      const m = /^plant:([^:]+):(.+)$/.exec(s.el);
      const pt = m ? project.plant.find((p) => p.id === m[1])?.points?.find((q) => q.name === m[2]) : undefined;
      gives = pt?.gives;
    }
    return {
      el: s.el,
      name: s.el === "rails" ? "the control rails" : (c.names.get(s.el) ?? s.el),
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
    const pt = project.plant.find((p) => p.id === m[1])?.points?.find((q) => q.name === m[2]);
    if (!pt || (pt.form !== "supply-in" && pt.form !== "powered-in")) return null;
    return pt.accepts ?? [];
  }
  const el = project.pages.flatMap((pg) => pg.elements).find((e) => e.id === id);
  if (!el || !TAKERS.has(el.symbol)) return null;
  return elementAccepts(el);
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
  if (unstated && uses) out.push({ level: "info", message: `${unstated} load${unstated === 1 ? " doesn't" : "s don't"} say what supply ${unstated === 1 ? "it takes" : "they take"} (coils, lamps, plant supply in): Check can't compare ${unstated === 1 ? "it" : "them"} with what feeds ${unstated === 1 ? "it" : "them"}`, ids: [] });
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
