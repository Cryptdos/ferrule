/**
 * Supply load (v0.4.x M12), built on M11's supplies. What a thing draws, and
 * what a supply is rated for, is its device's (v0.5 A38): a coil's, timer
 * coil's or lamp's; a plant item's, drawn through its first supply in or
 * powered in; a controller's modules', drawn through the module with a
 * supply-in point (the controller's power supply). A transformer's and a
 * plant supply out's rating and efficiency are their device's; an Incoming
 * supply is the site's, with no rating (v0.5 A72).
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
import { elementGives, plantGives } from "./supplies";

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

const deviceOf = (project: Project, id: string | undefined) => (id ? project.devices?.find((d) => d.id === id) : undefined);

/** A part's draw: its device's. */
function elementVa(project: Project, el: Element): number | undefined {
  return positive(deviceOf(project, el.device)?.va);
}

/** A plant item's or module's draw: its device's. */
function plantVa(project: Project, m: PlantItem): number | undefined {
  return positive(deviceOf(project, m.device)?.va);
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
    // A controller's power supply module carries the whole controller's draw, its own with it.
    if (p.item.module) {
      if (p.pt.form !== "supply-in") return undefined;
      const ctrl = (project.controllers ?? []).find((x) => x.slots.some((s) => s.module === p.item.id));
      const mods = ctrl ? project.plant.filter((x) => x.module && ctrl.slots.some((s) => s.module === x.id)) : [p.item];
      const sum = mods.reduce((a, m) => a + (plantVa(project, m) ?? 0), 0);
      return sum || undefined;
    }
    // A plant item draws through its first supply in or powered in.
    const first = (p.item.points ?? []).find((q) => q.form === "supply-in" || q.form === "powered-in");
    return first?.name === p.pt.name ? plantVa(project, p.item) : undefined;
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
    const e = positive(deviceOf(project, p.item.device)?.efficiency);
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
    const gives = el ? elementGives(project, el) : plantGives(project, p?.item);
    // An Incoming supply is the site's: it has no rating (v0.5 A72).
    const ratingVa = el ? (el.symbol === "transformer" ? positive(deviceOf(project, el.device)?.ratingVa) : undefined) : positive(deviceOf(project, p?.item.device)?.ratingVa);
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
  return !!project.devices?.some((d) => positive(d.va) || positive(d.ratingVa));
}
