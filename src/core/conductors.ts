/**
 * Conductors (potentials), DESIGN.md §4: every terminal joined by wire
 * without passing through a component is one conductor with one number.
 * Wires join terminals; terminal blocks, rails and busbars carry the
 * potential straight through. Coils, contacts and other components don't.
 *
 * Conductors are derived from the wiring. Recomputing keeps the id and
 * number of each conductor that still exists (matched by the terminals it
 * shares with its old self), so numbers don't jump about while drawing.
 */
import { type Conductor, type Project, type TerminalRef, newId } from "./model";
import { requireSymbol } from "./symbols";

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

  // Control rails of the same name are one rail, continued across sheets.
  const railByName = new Map<string, string>();
  for (const page of project.pages) {
    for (const el of page.elements) {
      if (el.symbol !== "rail" || typeof el.params.name !== "string" || !el.params.name) continue;
      const tapped = page.segments.flatMap((s) => [s.from, s.to]).find((r) => r[0] === el.id);
      if (!tapped) continue;
      const k = key(tapped);
      const first = railByName.get(el.params.name);
      if (first) uf.union(first, k);
      else railByName.set(el.params.name, k);
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
