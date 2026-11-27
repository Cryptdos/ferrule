/**
 * Is a point wired to its channel? (design-v0.4 §5) Decided, never guessed:
 *
 *  - direct: the point's wire reaches the channel's own pin;
 *  - via one relay: the point's wire reaches a relay coil, and a contact of
 *    that relay reaches the channel's own pin (or the other way round, for
 *    an output switching a plant input);
 *  - anything else is to review, and confirmed by hand.
 *
 * "Reaches" uses the conductors Ferrule already works out (wires, terminals
 * passed straight through, link ends) and plant views joined to their
 * device's pins. Supply rails (busbars and distributions) don't count, and
 * nor does a pin shared with another point (an input's common), so a point
 * isn't passed because it shares 0 V with its channel. It may ask for a
 * confirmation that wasn't needed; it must not pass something wrong.
 *
 * A confirmation by hand is kept against the wiring at both ends as it was:
 * change either and it drops back to review by itself.
 */
import type { Element, IoPoint, PlantItem, Project } from "./model";
import { isMaster, slavesOf } from "./xref";
import { terminalNames } from "./symbols";
import { OpError } from "./ops";

export type Wired =
  | { kind: "direct" }
  | { kind: "via"; relay: string; coil: string }
  | { kind: "confirmed" }
  | { kind: "review" }
  | { kind: "not-drawn" }
  | { kind: "no-channel" };

/** A point's own pins: those it doesn't share with another point of its device (a common). */
export function ownPins(item: PlantItem, point: IoPoint): string[] {
  const own = point.pins.filter((t) => !(item.points ?? []).some((q) => q !== point && q.pins.includes(t)));
  return own.length ? own : point.pins;
}

/** The plain wiring: what each terminal and device pin is joined to, through wire alone. */
export class Nets {
  private parent = new Map<string, string>();
  private conductorOf = new Map<string, string>();
  readonly byId = new Map<string, Element>();

  constructor(readonly project: Project) {
    for (const c of project.conductors) for (const [id, t] of c.terminals) this.conductorOf.set(`${id}\u0000${t}`, c.id);
    for (const pg of project.pages) {
      for (const el of pg.elements) {
        this.byId.set(el.id, el);
        if (el.symbol !== "plant-view") continue;
        for (const t of String(el.params.show ?? "").split(",").filter(Boolean)) this.union(this.term(el.id, t), Nets.pin(String(el.params.plant), t));
      }
    }
    // A module's commons linked inside it (v0.4.x M6): a return reaching any of them reaches them all.
    for (const item of project.plant) for (const list of item.module?.commons ?? []) for (const t of list.slice(1)) this.union(Nets.pin(item.id, list[0]!), Nets.pin(item.id, t));
  }

  static pin(plant: string, pin: string): string {
    return `pin\u0000${plant}\u0000${pin}`;
  }

  /** A drawn terminal's node: its conductor, or itself when it's wired to nothing. */
  term(el: string, t: string): string {
    return this.conductorOf.get(`${el}\u0000${t}`) ?? `t\u0000${el}\u0000${t}`;
  }

  find(x: string): string {
    let r = x;
    while (this.parent.has(r) && this.parent.get(r) !== r) r = this.parent.get(r)!;
    return r;
  }

  private union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }

  /** The nets a device's pins are on. */
  netsOf(plant: string, pins: string[]): Set<string> {
    return new Set(pins.map((p) => this.find(Nets.pin(plant, p))));
  }

  /** Is the pin on any sheet? */
  drawn(plant: string, pin: string): boolean {
    return this.project.pages.some((pg) =>
      pg.elements.some((e) => e.symbol === "plant-view" && e.params.plant === plant && String(e.params.show ?? "").split(",").includes(pin)),
    );
  }
}

/** Do two sets of nets share one, and is that net more than a lone terminal (actually wired)? */
const meet = (a: Set<string>, b: Set<string>) => [...a].some((x) => b.has(x));

/**
 * The one-hop trace: a coil on one side and a contact of the same relay on
 * the other, exactly. A relay is a coil (or timer coil) with its contacts.
 */
function viaOneRelay(nets: Nets, from: Set<string>, to: Set<string>): { relay: string; coil: string } | undefined {
  for (const pg of nets.project.pages) {
    for (const coil of pg.elements) {
      if (!isMaster(coil) || coil.symbol !== "coil") continue;
      const coilNets = new Set(terminalNames(coil).map((t) => nets.find(nets.term(coil.id, t))));
      for (const [a, b] of [
        [from, to],
        [to, from],
      ] as const) {
        if (!meet(coilNets, a)) continue;
        for (const s of slavesOf(nets.project, coil)) {
          const cNets = new Set(terminalNames(s.el).map((t) => nets.find(nets.term(s.el.id, t))));
          if (meet(cNets, b)) return { relay: coil.tag || "the relay", coil: coil.id };
        }
      }
    }
  }
  return undefined;
}

/** Whether a point is wired to its channel, by the rules above. */
export function wiringOf(project: Project, plant: PlantItem, point: IoPoint, nets = new Nets(project), oneHop = true): Wired {
  if (!point.channel) return { kind: "no-channel" };
  const module = project.plant.find((p) => p.id === point.channel!.module);
  const ch = module?.points?.find((q) => q.name === point.channel!.point);
  if (!module || !ch) return { kind: "no-channel" };
  const mine = ownPins(plant, point);
  const theirs = ownPins(module, ch);
  if (!mine.length || !mine.some((t) => nets.drawn(plant.id, t)) || !theirs.some((t) => nets.drawn(module.id, t))) return { kind: "not-drawn" };
  const a = nets.netsOf(plant.id, mine);
  const b = nets.netsOf(module.id, theirs);
  if (meet(a, b)) return { kind: "direct" };
  if (oneHop) {
    const via = viaOneRelay(nets, a, b);
    if (via) return { kind: "via", ...via };
  }
  if (point.confirmed && point.confirmed === wiringSignature(project, plant, point, nets)) return { kind: "confirmed" };
  return { kind: "review" };
}

/**
 * The wiring at both ends as it is now: every terminal on the nets of the
 * point's own pins and of its channel's own pins. A confirmation stores
 * this; any change to either end changes it.
 */
export function wiringSignature(project: Project, plant: PlantItem, point: IoPoint, nets = new Nets(project)): string {
  if (!point.channel) return "";
  const module = project.plant.find((p) => p.id === point.channel!.module);
  const ch = module?.points?.find((q) => q.name === point.channel!.point);
  if (!module || !ch) return "";
  const ends = [...nets.netsOf(plant.id, ownPins(plant, point)), ...nets.netsOf(module.id, ownPins(module, ch))];
  const members: string[] = [];
  for (const c of project.conductors) if (ends.includes(nets.find(c.id))) members.push(c.terminals.map(([id, t]) => `${id}:${t}`).sort().join(","));
  return hash(`${point.channel.module}:${point.channel.point}|${members.sort().join("|")}`);
}

/** FNV-1a, 32 bits, as hex: short enough to keep in the file. */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Confirm by hand that a point is wired to its channel, as the wiring stands now; or take that back. */
export function confirmWiring(project: Project, plantId: string, pointName: string, on = true): void {
  const plant = project.plant.find((p) => p.id === plantId);
  const point = plant?.points?.find((q) => q.name === pointName);
  if (!plant || !point) throw new OpError("No such point");
  if (!on) {
    delete point.confirmed;
    return;
  }
  if (!point.channel) throw new OpError(`${point.name} isn't on a channel`);
  point.confirmed = wiringSignature(project, plant, point);
}
