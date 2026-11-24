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
import { compile, initialState, search } from "./sim";

/** The point's ref, as conditions name it. */
const ref = (plant: PlantItem, point: string) => `plant:${plant.id}:${point}`;

/** The generated expectations for one interlock: one per condition (each is its own "never"). */
export function interlockExpectations(plant: PlantItem, il: Interlock): Expectation[] {
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
  return `${tag(plant)} ${il.point} never on while ${il.when.map(name).join(" or ")}`;
}

export type Proved =
  | { kind: "proved" }
  | { kind: "fails" }
  | { kind: "not-drawn"; what: string }
  /** Too many sequences to try them all. */
  | { kind: "unknown" }
  /** Not tried on the drawing as it is now. */
  | { kind: "unchecked" };

/** Proofs, from Check logic or Prove: each interlock's result, and the drawing they were for. */
export interface Proofs {
  key: string;
  results: Record<string, "proved" | "fails" | "unknown">;
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
  const results: Proofs["results"] = {};
  const todo = provable(project, only);
  if (todo.length) {
    const c = compile(project);
    const start = initialState(c);
    for (const { il, rules } of todo) {
      const r = search(c, start, rules, { limit });
      results[il.id] = r.violations.length ? "fails" : r.truncated ? "unknown" : "proved";
    }
  }
  return { key: circuitKey(project), results };
}

/** Proofs from a Check logic run: each interlock fails if any of its expectations was broken. */
export function proofsFromSearch(project: Project, broken: string[], truncated: boolean): Proofs {
  const results: Proofs["results"] = {};
  for (const plant of project.plant) {
    for (const il of plant.interlocks ?? []) {
      const ids = interlockExpectations(plant, il).map((e) => e.id);
      results[il.id] = ids.some((id) => broken.includes(id)) ? "fails" : truncated ? "unknown" : "proved";
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
