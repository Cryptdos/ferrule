/**
 * Conductors (potentials), DESIGN.md §4: every terminal joined by wire
 * without passing through a component is one conductor with one number.
 * Wires join terminals; terminal blocks carry the conductor straight
 * through. Coils, contacts and other components don't.
 *
 * A busbar is a joint, like a distribution block (design-v0.2 §2): each wire
 * leaving it is its own conductor with its own number. Electrically the
 * busbar still joins them, and busbars on the same distribution are joined
 * on every sheet: `netJoins` lists those joins for simulation and checks.
 *
 * Conductors are derived from the wiring. Recomputing keeps the id and
 * number of each conductor that still exists (matched by the terminals it
 * shares with its old self), so numbers don't jump about while drawing.
 */
import { type Conductor, type Project, type TerminalRef, newId } from "./model";
import { isBar, requireSymbol, terminalPoint } from "./symbols";

const key = (r: TerminalRef) => `${r[0]}\u0000${r[1]}`;
const unkey = (k: string): TerminalRef => k.split("\u0000") as TerminalRef;

class UnionFind {
  private parent = new Map<string, string>();
  has(x: string) {
    return this.parent.has(x);
  }
  add(x: string) {
    if (!this.parent.has(x)) this.parent.set(x, x);
  }
  find(x: string): string {
    let r = x;
    while (this.parent.get(r) !== r) r = this.parent.get(r)!;
    let c = x;
    while (c !== r) {
      const n = this.parent.get(c)!;
      this.parent.set(c, r);
      c = n;
    }
    return r;
  }
  union(a: string, b: string) {
    this.add(a);
    this.add(b);
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
  groups(): string[][] {
    const out = new Map<string, string[]>();
    for (const x of this.parent.keys()) {
      const r = this.find(x);
      out.set(r, [...(out.get(r) ?? []), x]);
    }
    return [...out.values()];
  }
}

export function refreshConductors(project: Project): void {
  const uf = new UnionFind();
  /** Segment id → a terminal key on it, to label the segment afterwards. */
  const segKey = new Map<string, string>();

  for (const page of project.pages) {
    const byId = new Map(page.elements.map((e) => [e.id, e]));
    const wired = new Map<string, Set<string>>(); // element id → wired terminal names
    for (const seg of page.segments) {
      const a = key(seg.from);
      const b = key(seg.to);
      uf.union(a, b);
      segKey.set(seg.id, a);
      for (const r of [seg.from, seg.to]) {
        if (!wired.has(r[0])) wired.set(r[0], new Set());
        wired.get(r[0])!.add(r[1]);
      }
    }
    // Pass the potential through terminal blocks, rails and busbars.
    for (const [elId, names] of wired) {
      const el = byId.get(elId);
      if (!el) continue;
      const bridged = requireSymbol(el.symbol).bridged?.(el) ?? [];
      for (const group of bridged) {
        const present = group.filter((n) => names.has(n));
        for (let i = 1; i < present.length; i++) uf.union(key([elId, present[0]!]), key([elId, present[i]!]));
      }
    }
  }

  // An arrow dropped straight onto a part's pin, with no wire between, is on that pin's conductor (v0.3 §2, 32).
  for (const page of project.pages) {
    const arrows = page.elements.filter((e) => e.symbol === "offpage");
    if (!arrows.length) continue;
    const at = new Map<string, TerminalRef[]>();
    for (const el of page.elements) {
      if (el.symbol === "offpage") continue;
      for (const t of requireSymbol(el.symbol).draw(el).terminals) {
        const pt = terminalPoint(el, t.name);
        if (pt) at.set(`${pt[0]},${pt[1]}`, [...(at.get(`${pt[0]},${pt[1]}`) ?? []), [el.id, t.name]]);
      }
    }
    for (const a of arrows) {
      const pt = terminalPoint(a, "1");
      const pins = pt ? at.get(`${pt[0]},${pt[1]}`) : undefined;
      for (const pin of pins ?? []) uf.union(key([a.id, "1"]), key(pin));
    }
  }

  // Linked off-page arrows carry the conductor onto the other page.
  for (const page of project.pages) {
    for (const el of page.elements) {
      if (el.symbol !== "offpage") continue;
      for (const other of el.links) {
        const a = key([el.id, "1"]);
        const b = key([other, "1"]);
        if (uf.has(a) && uf.has(b)) uf.union(a, b);
      }
    }
  }

  const old = project.conductors;
  const oldOf = new Map<string, Conductor>();
  for (const c of old) for (const t of c.terminals) oldOf.set(key(t), c);

  const used = new Set<string>();
  const next: Conductor[] = [];
  const groups = uf.groups().sort((a, b) => a[0]!.localeCompare(b[0]!));
  const groupOf = new Map<string, Conductor>();
  for (const group of groups) {
    // Reuse the old conductor this group shares most terminals with.
    const votes = new Map<Conductor, number>();
    for (const k of group) {
      const c = oldOf.get(k);
      if (c && !used.has(c.id)) votes.set(c, (votes.get(c) ?? 0) + 1);
    }
    let best: Conductor | null = null;
    for (const [c, n] of votes) if (!best || n > votes.get(best)!) best = c;
    const conductor: Conductor = {
      id: best?.id ?? newId("c"),
      number: best?.number ?? "",
      ...(best?.locked ? { locked: true } : {}),
      ...(best?.colour ? { colour: best.colour } : {}),
      ...(best?.function ? { function: best.function } : {}),
      terminals: group.map(unkey),
    };
    used.add(conductor.id);
    next.push(conductor);
    for (const k of group) groupOf.set(k, conductor);
  }
  project.conductors = next;

  for (const page of project.pages) {
    for (const seg of page.segments) {
      const k = segKey.get(seg.id);
      seg.conductor = (k && groupOf.get(k)?.id) || "";
    }
  }
}

/**
 * Joins beyond the conductors (design-v0.2 §2): every wire on a busbar is on
 * the same net, and so is everything on the same distribution (busbars,
 * link arrows and incoming supply terminals that pick it). Each join is two
 * terminal refs and the element that makes it.
 */
export function netJoins(project: Project): { a: TerminalRef; b: TerminalRef; el: string }[] {
  const out: { a: TerminalRef; b: TerminalRef; el: string }[] = [];
  const firstOn = new Map<string, TerminalRef>(); // distribution id → a terminal on it
  const onDist = (dist: unknown, ref: TerminalRef, el: string) => {
    if (typeof dist !== "string" || !dist || !project.distributions.some((d) => d.id === dist)) return;
    const first = firstOn.get(dist);
    if (first) out.push({ a: first, b: ref, el });
    else firstOn.set(dist, ref);
  };
  for (const page of project.pages) {
    for (const el of page.elements) {
      if (isBar(el)) {
        // The wired taps, in order along the bar.
        const taps = [...new Set(page.segments.flatMap((s) => [s.from, s.to]).filter((r) => r[0] === el.id).map((r) => r[1]))].sort(
          (x, y) => Number(x) - Number(y),
        );
        for (let i = 1; i < taps.length; i++) out.push({ a: [el.id, taps[0]!], b: [el.id, taps[i]!], el: el.id });
        if (taps.length) onDist(el.params.dist, [el.id, taps[0]!], el.id);
      } else if (el.symbol === "offpage") {
        onDist(el.params.dist, [el.id, "1"], el.id);
      } else if (el.symbol === "supply") {
        for (const [k, v] of Object.entries(el.params)) if (k.startsWith("dist_")) onDist(v, [el.id, k.slice(5)], el.id);
      }
    }
  }
  // A plant supply out feeds its distributions from the device's own pin (sim.ts pinNode), drawn or not.
  for (const item of project.plant) {
    for (const p of item.points ?? []) {
      if (p.form !== "supply-out") continue;
      for (const [pin, d] of Object.entries(p.dists ?? {})) onDist(d, [`pin:${item.id}`, pin], `plant:${item.id}`);
    }
  }
  return out;
}
