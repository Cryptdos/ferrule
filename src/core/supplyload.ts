/**
 * Supply load (v0.4.x M12), built on M11's supplies. Each part has one
 * expected draw in VA: `va` on a coil, timer coil or lamp (or its device's,
 * from the device table, when the part has none), `va` on a plant supply-in
 * or powered-in point, and `ModuleInfo.va` on a controller's modules, drawn
 * through the module with a supply-in point (the controller's power supply).
 *
 * Each supply gets two figures: *live*, what's energised in the simulated
 * state, and *worst case*, everything it can reach with every switch
 * closed. A supply's total passes up to whatever feeds it: a transformer's
 * secondary to its primary, a plant's supply out to its own supply in,
 * divided by its efficiency (85% for a power supply unless set). Sums are
 * in VA; shown as amps at the supply's own voltage when it says what it
 * gives. Parts with no draw count as nothing, and are counted.
 */
import type { Element, IoPoint, PlantItem, Project, SupplyType } from "./model";
import { type Circuit, type SimState } from "./sim";
import { elementGives } from "./supplies";

/** A power supply's efficiency when none is set. */
export const DEFAULT_EFFICIENCY = 0.85;

export interface SupplyLoad {
  /** The circuit's supply id: an element, a plant point's ref, or "rails". */
  id: string;
  name: string;
  gives?: SupplyType;
  ratingVa?: number;
  /** What's energised now; undefined without a simulated state. */
  liveVa?: number;
  worstVa: number;
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

const positive = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined);
const POINT = /^plant:([^:]+):(.+)$/;

/** A part's draw: its own, or its device's from the device table. */
function elementVa(project: Project, el: Element): number | undefined {
  return positive(el.params.va) ?? positive(el.device ? project.devices?.find((x) => x.id === el.device)?.va : undefined);
}

/** A module's draw: its own, or its device's from the device table. */
function moduleVa(project: Project, m: PlantItem): number | undefined {
  return positive(m.module?.va) ?? positive(m.device ? project.devices?.find((d) => d.id === m.device)?.va : undefined);
}

/**
 * Every supply's load. With `state`, the live figure too. `undrawn` counts
 * the loads a supply reaches that have no draw set.
 */
export function supplyLoads(project: Project, c: Circuit, state?: SimState): { supplies: SupplyLoad[]; undrawn: number } {
  const els = new Map(project.pages.flatMap((pg) => pg.elements.map((e) => [e.id, e] as const)));
  const pointOf = (id: string): { item: PlantItem; pt: IoPoint } | undefined => {
    const m = POINT.exec(id);
    const item = m ? project.plant.find((p) => p.id === m[1]) : undefined;
    const pt = item?.points?.find((q) => q.name === m![2]);
    return item && pt ? { item, pt } : undefined;
  };

  /** Draw a load has of its own, before what it feeds. */
  const own = (loadId: string): number | undefined => {
    const el = els.get(loadId);
    if (el) return elementVa(project, el);
    const p = pointOf(loadId);
    if (!p) return undefined;
    let va = positive(p.pt.va);
    // A controller's power supply module carries the whole controller's draw.
    if (p.item.module && p.pt.form === "supply-in") {
      const ctrl = (project.controllers ?? []).find((x) => x.slots.some((s) => s.module === p.item.id));
      const mods = ctrl ? project.plant.filter((x) => x.module && ctrl.slots.some((s) => s.module === x.id)) : [p.item];
      const sum = mods.reduce((a, m) => a + (moduleVa(project, m) ?? 0), 0);
      if (sum) va = (va ?? 0) + sum;
    }
    return va;
  };

  // The supplies each load feeds, and how efficiently.
  const feeds = new Map<string, { supply: string; eff: number }[]>();
  const feedOf = (supplyId: string): string | undefined => {
    if (els.get(supplyId)?.symbol === "transformer") return supplyId;
    const p = pointOf(supplyId);
    if (!p) return undefined;
    const input = (p.item.points ?? []).find((q) => q.form === "supply-in" || q.form === "powered-in");
    return input ? `plant:${p.item.id}:${input.name}` : undefined;
  };
  const effOf = (supplyId: string): number => {
    const p = pointOf(supplyId);
    if (!p) return 1;
    const e = positive(p.pt.efficiency);
    return e && e <= 1 ? e : p.pt.form === "supply-out" ? DEFAULT_EFFICIENCY : 1;
  };
  for (const s of c.supplies) {
    const f = feedOf(s.el);
    if (f && f !== s.el) feeds.set(f, [...(feeds.get(f) ?? []), { supply: s.el, eff: effOf(s.el) }]);
  }

  const solve = (mode: "worst" | "live") => {
    const uf = new UF();
    for (const l of c.links) if (mode === "worst" || l.closed(state!)) uf.union(l.a, l.b);
    const supplies = c.supplies.filter((s) => mode === "worst" || !s.when || !!state!.energised[s.when]);
    // The stand-in drawn from rails last: a real source on them takes their loads.
    const order = [...supplies.filter((s) => s.el !== "rails"), ...supplies.filter((s) => s.el === "rails")].map((s) => ({ s, ph: new Set(s.phases.map((p) => uf.find(p))) }));
    const byLoad = new Map<string, string>();
    const reached: string[] = [];
    for (const l of c.loads) {
      if (l.kind === "dry") continue;
      if (mode === "live" && !(l.kind === "lamp" ? state!.lamps[l.el] : state!.energised[l.el])) continue;
      const ends = [uf.find(l.a), uf.find(l.b)];
      const from = order.find((o) => ends.some((e) => o.ph.has(e)));
      if (!from) continue;
      if (!byLoad.has(l.el)) {
        byLoad.set(l.el, from.s.el);
        reached.push(l.el);
      }
    }
    const totals = new Map<string, number>();
    const busy = new Set<string>();
    const total = (supply: string): number => {
      if (totals.has(supply)) return totals.get(supply)!;
      if (busy.has(supply)) return 0;
      busy.add(supply);
      let sum = 0;
      for (const [load, s] of byLoad) if (s === supply) sum += draw(load);
      busy.delete(supply);
      totals.set(supply, sum);
      return sum;
    };
    const draw = (load: string): number => (own(load) ?? 0) + (feeds.get(load) ?? []).reduce((a, f) => a + total(f.supply) / f.eff, 0);
    for (const s of supplies) total(s.el);
    return { totals, reached };
  };

  const worst = solve("worst");
  const live = state ? solve("live") : undefined;
  const undrawn = worst.reached.filter((l) => !own(l) && !feeds.has(l)).length;
  const seen = new Set<string>();
  const out: SupplyLoad[] = [];
  for (const s of c.supplies) {
    if (seen.has(s.el)) continue;
    seen.add(s.el);
    const el = els.get(s.el);
    const p = pointOf(s.el);
    const gives = el ? elementGives(el) : p?.pt.gives;
    const ratingVa = el ? positive(el.params.ratingVa) : positive(p?.pt.ratingVa);
    out.push({
      id: s.el,
      name: s.el === "rails" ? "the power rails" : (c.names.get(s.el) ?? s.el),
      ...(gives ? { gives } : {}),
      ...(ratingVa ? { ratingVa } : {}),
      ...(live ? { liveVa: live.totals.get(s.el) ?? 0 } : {}),
      worstVa: worst.totals.get(s.el) ?? 0,
    });
  }
  return { supplies: out, undrawn };
}

/** "1.2 A" at a supply's voltage, or "45 VA" when it doesn't say. */
export function loadText(va: number, gives?: SupplyType): string {
  if (!gives) return `${Math.round(va * 10) / 10} VA`;
  const a = va / gives.v;
  return `${a >= 10 ? a.toFixed(1) : a.toFixed(2)} A`;
}

/** Does the project say any draws or ratings at all? */
export function usesLoads(project: Project): boolean {
  if (project.pages.some((pg) => pg.elements.some((e) => positive(e.params.va) || positive(e.params.ratingVa)))) return true;
  return project.plant.some((p) => positive(p.module?.va) || (p.points ?? []).some((q) => positive(q.va) || positive(q.ratingVa))) || !!project.devices?.some((d) => positive(d.va));
}
