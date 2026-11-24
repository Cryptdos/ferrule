/**
 * Interlocks (design-v0.4 §6): "this point is never on while that condition
 * holds", on a plant item. A hardwired interlock is a contact in an enable
 * circuit, and that's an expectation Ferrule already has: each interlock
 * generates a "never" expectation, marked with the interlock's id so it
 * follows the interlock when that's edited or removed. Hand-written
 * expectations are never touched. Simulate proves them as it proves any
 * expectation.
 */
import { newId, type Condition, type Expectation, type Interlock, type PlantItem, type Project } from "./model";
import { type Circuit, compile, initialState, search, type SimState } from "./sim";

/** The point's ref, as conditions name it. */
const ref = (plant: PlantItem, point: string) => `plant:${plant.id}:${point}`;

/** An interlock's conditions, at most. */
export const MAX_CONDITIONS = 6;

/**
 * The generated expectations for one interlock (v0.4.x T1): with `or` (or
 * unset), one "never" per condition, *point on and that condition*; with
 * `and`, one, *point on and every condition holds*: "never enabled while the
 * fire alarm isn't healthy and the override is off".
 */
export function interlockExpectations(plant: PlantItem, il: Interlock): Expectation[] {
  if (il.join === "and" && il.when.length > 1)
    return [{ id: `x_${il.id}_0`, kind: "never" as const, when: [{ ref: ref(plant, il.point), on: true }, ...il.when.map((c) => ({ ref: c.ref, on: c.on }))], join: "and" as const, interlock: il.id }];
  return il.when.map((c, i) => ({
    id: `x_${il.id}_${i}`,
    kind: "never" as const,
    when: [{ ref: ref(plant, il.point), on: true }, { ref: c.ref, on: c.on }],
    join: "and" as const,
    interlock: il.id,
  }));
}

/**
 * Generated expectations made to match the interlocks: new ones added,
 * changed ones rewritten in place, those whose interlock has gone removed.
 * Hand-written expectations are left as they are, in their order.
 */
export function syncInterlocks(project: Project): void {
  const want = new Map<string, Expectation>();
  for (const plant of project.plant) for (const il of plant.interlocks ?? []) for (const e of interlockExpectations(plant, il)) want.set(e.id, e);
  const out: Expectation[] = [];
  for (const e of project.expectations) {
    if (!e.interlock) out.push(e);
    else if (want.has(e.id)) {
      out.push(want.get(e.id)!);
      want.delete(e.id);
    }
  }
  out.push(...want.values());
  project.expectations = out;
}

/** "P1 enable never on while PU1 fault on". */
export function describeInterlock(project: Project, plant: PlantItem, il: Interlock): string {
  const tag = (p: PlantItem) => p.tag || `${p.prefix || "U"}?`;
  const name = (c: Condition) => {
    const m = /^plant:([^:]+):(.+)$/.exec(c.ref);
    const other = m && project.plant.find((p) => p.id === m[1]);
    const what = other ? `${tag(other)} ${m![2]}` : "(missing)";
    return c.on ? what : `${what} off`;
  };
  return `${tag(plant)} ${il.point} never on while ${il.when.map(name).join(il.join === "and" ? " and " : " or ")}`;
}

export type Proved =
  | { kind: "proved" }
  /** Proved only because its point can never be on (v0.4.x F1): is it powered? */
  | { kind: "never-on" }
  | { kind: "fails" }
  | { kind: "not-drawn"; what: string }
  /** Too many sequences to try them all. */
  | { kind: "unknown" }
  /** Not tried on the drawing as it is now. */
  | { kind: "unchecked" };

/** Proofs, from Check logic or Prove: each interlock's result, and the drawing they were for. */
export interface Proofs {
  key: string;
  results: Record<string, "proved" | "fails" | "unknown" | "never-on">;
}

/** A point is drawn when one of its pins is on a sheet. */
function pointDrawn(project: Project, c: string): string | undefined {
  const m = /^plant:([^:]+):(.+)$/.exec(c);
  const plant = m && project.plant.find((p) => p.id === m[1]);
  const point = plant?.points?.find((q) => q.name === m![2]);
  if (!plant || !point) return "(missing)";
  const shown = project.pages.some((pg) =>
    pg.elements.some((e) => e.symbol === "plant-view" && e.params.plant === plant.id && point.pins.some((t) => String(e.params.show ?? "").split(",").includes(t))),
  );
  return shown ? undefined : `${plant.tag || `${plant.prefix || "U"}?`} ${point.name}`;
}

/**
 * The drawing as Simulate sees it, as a short key: proofs are for one
 * drawing, and any change to it means proving again.
 */
export function circuitKey(project: Project): string {
  const s = JSON.stringify([project.pages.map((pg) => [pg.elements, pg.segments]), project.plant.map((p) => [p.id, p.terminals, p.points, p.interlocks]), project.conductors, project.distributions]);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${s.length.toString(36)}-${h.toString(16)}`;
}

/** Interlocks whose points are all drawn: those that can be proved. */
function provable(project: Project, only?: string[]): { il: Interlock; rules: Expectation[] }[] {
  const out: { il: Interlock; rules: Expectation[] }[] = [];
  for (const plant of project.plant) {
    for (const il of plant.interlocks ?? []) {
      if (only && !only.includes(il.id)) continue;
      const rules = interlockExpectations(plant, il);
      if (![...new Set(rules.flatMap((r) => r.when.map((c) => c.ref)))].some((r) => pointDrawn(project, r))) out.push({ il, rules });
    }
  }
  return out;
}

/**
 * Prove interlocks (design-v0.4 §6) with Check logic's search, over what
 * can affect each: proved if no sequence breaks it, fails if one does,
 * unknown if there were too many sequences to try them all. This can take
 * seconds on a big drawing, so it's run when asked, not on every edit.
 */
export function proveInterlocks(project: Project, only?: string[], limit = 20000): Proofs {
  const job = provingJob(project, only, limit);
  const results: Proofs["results"] = {};
  for (const st of job.steps) results[st.id] = st.run();
  return { key: job.key, results };
}

/**
 * Proving one interlock at a time (v0.4.x T11): the drawing's key and a step
 * per interlock, each run when the caller is ready, so the interface can
 * show each result as it lands, say how far it's got, and stop.
 */
export function provingJob(project: Project, only?: string[], limit = 20000): { key: string; steps: { id: string; run: () => Proofs["results"][string] }[] } {
  const todo = provable(project, only);
  let c: Circuit | null = null;
  let start: SimState | null = null;
  const steps = todo.map(({ il, rules }) => ({
    id: il.id,
    run: (): Proofs["results"][string] => {
      c ??= compile(project);
      start ??= initialState(c);
      // First: can its point ever be on? A rule about a point that never is, is true for nothing (F1).
      if (neverOn(c, start, rules[0]!.when[0]!.ref, limit)) return "never-on";
      const r = search(c, start, rules, { limit });
      return r.violations.length ? "fails" : r.truncated ? "unknown" : "proved";
    },
  }));
  return { key: circuitKey(project), steps };
}

/** True when no sequence turns this point on: one search for *point on* (v0.4.x F1). Unknown (too many sequences) isn't never. */
export function neverOn(c: Circuit, start: SimState, ref: string, limit = 20000): boolean {
  const r = search(c, start, [{ id: "on?", kind: "never", when: [{ ref, on: true }] }], { limit });
  return !r.violations.length && !r.truncated;
}

/** Proofs from a Check logic run: each interlock fails if any of its expectations was broken. */
export function proofsFromSearch(project: Project, broken: string[], truncated: boolean): Proofs {
  const results: Proofs["results"] = {};
  let c: Circuit | null = null;
  let start: SimState | null = null;
  for (const plant of project.plant) {
    for (const il of plant.interlocks ?? []) {
      const ids = interlockExpectations(plant, il).map((e) => e.id);
      results[il.id] = ids.some((id) => broken.includes(id)) ? "fails" : truncated ? "unknown" : "proved";
      // Proved: but could its point ever be on (F1)?
      if (results[il.id] === "proved") {
        c ??= compile(project);
        start ??= initialState(c);
        if (neverOn(c, start, ref(plant, il.point))) results[il.id] = "never-on";
      }
    }
  }
  return { key: circuitKey(project), results };
}

/**
 * Each interlock's standing, cheaply: not drawn if a point it names isn't
 * on a sheet; otherwise what the proofs say, if they were for this drawing;
 * else unchecked.
 */
export function interlockStatus(project: Project, proofs?: Proofs | null, only?: string[]): Map<string, Proved> {
  const out = new Map<string, Proved>();
  const fresh = proofs && proofs.key === circuitKey(project) ? proofs.results : null;
  for (const plant of project.plant) {
    for (const il of plant.interlocks ?? []) {
      if (only && !only.includes(il.id)) continue;
      const missing = [...new Set(interlockExpectations(plant, il).flatMap((r) => r.when.map((c) => c.ref)))].map((r) => pointDrawn(project, r)).find(Boolean);
      if (missing) out.set(il.id, { kind: "not-drawn", what: missing });
      else {
        const r = fresh?.[il.id];
        out.set(il.id, r ? { kind: r } : { kind: "unchecked" });
      }
    }
  }
  return out;
}

/** Proofs put together: the newer one's results over the older's, when they're for the same drawing. */
export function mergeProofs(old: Proofs | null, next: Proofs): Proofs {
  return old && old.key === next.key ? { key: next.key, results: { ...old.results, ...next.results } } : next;
}

/** Add an interlock: the plant's own point, never on while a condition holds. */
export function newInterlock(point: string, when: Condition): Interlock {
  return { id: newId("il"), point, when: [when] };
}
