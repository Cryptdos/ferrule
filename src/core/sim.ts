/**
 * Simulation workbench (DESIGN.md §9, §10): basic digital relay logic.
 *
 * Every conductor is a node. Contacts, push buttons, selectors, isolators
 * and field plant contacts are switched links between nodes; coils, timer
 * coils, lamps, transformer primaries and plant inputs are loads.
 *
 * Power comes from supplies: an Incoming supply part (its phases against
 * its neutral, or + against -), and a transformer's secondary once its
 * primary is energised. A drawing with no Incoming supply part is fed, as
 * before, by rails named CCT or 24V against a rail named 0V. A load is
 * energised when its ends reach a phase and the return of the same supply
 * (or two different phases) through closed links. Contacts follow their
 * coils, so the circuit is solved again until nothing changes. Timers run
 * on a simulation clock.
 *
 * Plant is simulated by its IO points (controller.md §6): outputs are
 * clicked or follow up to two conditions; inputs sense their pins, and
 * expectations say whether they see what they should.
 *
 * No motors, analogue or power flow.
 */
import type { Condition, Element, Expectation, Project } from "./model";
import { contactPins, isAnalogueForm, pointRef, signalPins } from "./points";
import { pointLabel, viewsOf } from "./modules";
import { changeoverTerms, isolatorAux, pushPoles, selectorPoles } from "./symbols";
import { masterOf } from "./xref";
import { netJoins } from "./conductors";
import { displayTag } from "./tags";

// ---------------------------------------------------------------------------
// Compiled circuit

type Kind = "coil" | "timer" | "lamp" | "transformer" | "plant" | "dry";

export interface Link {
  a: string;
  b: string;
  /** Element this link belongs to. */
  el: string;
  /** What decides it: the coil or timer driving it, or the element itself if it's operated by hand. */
  src: string;
  closed: (s: SimState) => boolean;
  /** Always closed: a plain join (a plant view to its device's pin, a busbar, a distribution), not a switch. */
  fixed?: true;
}

interface Load {
  el: string;
  kind: Kind;
  a: string;
  b: string;
  /** A lamp's test terminal: lights it too, against the same return. */
  test?: string;
}

/** Timer functions the simulator knows (symbols.ts TIMER_FUNCTIONS). */
export type TimerMode = "on" | "off" | "on-off" | "interval" | "flash-on" | "flash-off";
const TIMER_MODES: TimerMode[] = ["on", "off", "on-off", "interval", "flash-on", "flash-off"];

export interface Input {
  el: string;
  /** "toggle": a switch you leave; "press": a momentary push button; "select": 2 positions. */
  kind: "toggle" | "press" | "select";
  label: string;
  /** A selector's positions, in the order it steps through them. */
  positions?: string[];
  /** Setting at the start: isolators and breakers start on (1), everything else off (0). */
  initial: 0 | 1;
}

/** A source of power: phases (or +) against a return (N or -). */
export interface Supply {
  /** The element it comes from: an Incoming supply, a transformer, or "rails". */
  el: string;
  phases: string[];
  ret: string[];
  /** Only a source while this is on: a transformer's primary, a plant output. */
  when?: string;
  /** The distribution it feeds, if any: two sources on the same distribution aren't a short. */
  dist?: string;
  /**
   * A transformer's primary ends (P1, P2). The secondary's live side follows
   * the primary's: P1 on the phase makes S1 live, P2 on the phase makes S2 live.
   */
  primary?: [string, string];
}

/** A plant output that follows up to two conditions, after a delay: "proven 5 s after SF-01 runs". */
export interface Follower {
  /** The output point's ref; its timer is `${id}:f`. */
  id: string;
  when: Condition[];
  join: "and" | "or";
}

export interface Circuit {
  links: Link[];
  supplies: Supply[];
  followers: Follower[];
  /** Conductors on rails and busbars: where the rule search cuts the circuit into independent parts. */
  railNodes: Set<string>;
  /** For drawing: is each switching element operated (contact closed/opened, button pressed)? */
  ops: Map<string, (s: SimState) => boolean>;
  loads: Load[];
  supply: Set<string>;
  ret: Set<string>;
  inputs: Input[];
  /** Timer settings by element id: delay in seconds and mode. */
  timers: Map<string, { delay: number; mode: TimerMode }>;
  names: Map<string, string>;
  /** Output points (contacts, powered outputs, supply out) by ref: what's on decides them. */
  outputs: Map<string, (s: SimState) => boolean>;
  /** Every point by ref: its form, for the panel and expectations. */
  points: Map<string, { form: string; plant: string; name: string }>;
  /** Whether each thing a condition can name is on, by ref. */
  states: Map<string, (s: SimState) => boolean>;
}

export interface SimState {
  t: number;
  /** Toggle and selector settings (0/1), and push buttons held down (1). */
  inputs: Record<string, number>;
  /** Coils and timer coils energised. */
  energised: Record<string, boolean>;
  /** Timer contacts operated. */
  timed: Record<string, boolean>;
  /** When each timer started timing (simulation seconds). */
  since: Record<string, number>;
  lamps: Record<string, boolean>;
  /** Conductor ids connected to a supply's phase (or +). */
  live: string[];
  /** Conductor ids connected to a live supply's return (N, 0 V), so the current's path reads both ways. */
  returns: string[];
  /** Supply shorted straight to return through closed contacts. */
  short: boolean;
  /** The circuit didn't settle (it oscillates). */
  unstable: boolean;
}

/** Delay in seconds from text like "10s", "500ms", "2m", "10". */
export function parseDelay(text: unknown): number {
  const m = /^\s*([\d.]+)\s*(ms|s|m|min)?\s*$/i.exec(String(text ?? ""));
  if (!m) return 0;
  const n = Number(m[1]);
  const unit = (m[2] ?? "s").toLowerCase();
  return unit === "ms" ? n / 1000 : unit === "m" || unit === "min" ? n * 60 : n;
}

export function compile(project: Project): Circuit {
  const node = new Map<string, string>();
  for (const c of project.conductors) for (const [id, t] of c.terminals) node.set(`${id}:${t}`, c.id);
  const n = (el: Element, t: string) => node.get(`${el.id}:${t}`) ?? `${el.id}:${t}`;

  const links: Link[] = [];
  const loads: Load[] = [];
  const inputs: Input[] = [];
  const timers = new Map<string, { delay: number; mode: TimerMode }>();
  const names = new Map<string, string>();
  const supply = new Set<string>();
  const ret = new Set<string>();
  const supplies: Supply[] = [];
  const followers: Follower[] = [];
  const ops = new Map<string, (s: SimState) => boolean>();
  const railNodes = new Set<string>();
  const outputs = new Map<string, (s: SimState) => boolean>();
  const points = new Map<string, { form: string; plant: string; name: string }>();
  const states = new Map<string, (s: SimState) => boolean>();
  /** Distributions already standing in as the supply (no Incoming supply part). */
  const fallback = new Set<string>();
  const hasIncoming = project.pages.some((pg) => pg.elements.some((e) => e.symbol === "supply"));
  // Distributions a plant supply out feeds aren't stood in for by their busbars: the plant is their source.
  for (const item of project.plant) for (const pt of item.points ?? []) for (const d of Object.values(pt.dists ?? {})) fallback.add(d);

  const byId = new Map<string, Element>();
  for (const pg of project.pages) for (const el of pg.elements) byId.set(el.id, el);

  const link = (el: Element, a: string, b: string, closed: (s: SimState) => boolean) =>
    links.push({ a: n(el, a), b: n(el, b), el: el.id, src: masterOf(project, el)?.el.id ?? el.id, closed });

  for (const pg of project.pages) {
    for (const el of pg.elements) {
      names.set(el.id, displayTag(el, project) || el.symbol);
      const master = masterOf(project, el)?.el;
      /** Is this contact operated? Coil-driven, or a manual input. */
      const operated = (s: SimState): boolean => {
        if (master) {
          // A contact on a timer coil follows the timer's function, unless it's one of its plain contacts.
          if (master.symbol === "timer-coil" && el.params.instant !== true) return !!s.timed[master.id];
          return !!s.energised[master.id];
        }
        return (s.inputs[el.id] ?? 0) === 1;
      };
      const manual = !master;
      const press = (s: SimState) => (s.inputs[el.id] ?? 0) === 1;
      if (["contact-no", "contact-nc", "contact-co"].includes(el.symbol)) ops.set(el.id, operated);
      if (el.symbol === "pushbutton") ops.set(el.id, press);
      // A selector is drawn turned whenever it's out of position 0.
      if (el.symbol === "selector") ops.set(el.id, (s) => (s.inputs[el.id] ?? 0) !== 0);
      switch (el.symbol) {
        case "busbar":
        case "rail": {
          const conds = project.conductors.filter((c) => c.terminals.some(([id]) => id === el.id)).map((c) => c.id);
          conds.forEach((c) => railNodes.add(c));
          // Without an Incoming supply part, busbars on a line or DC + distribution are the
          // supply, and those on a neutral or DC 0 V distribution the return, as drawn.
          // One node per distribution is enough: the rest are joined to it.
          const d = project.distributions.find((x) => x.id === el.params.dist);
          const first = conds[0];
          if (!hasIncoming && d && first && !fallback.has(d.id)) {
            if (d.kind === "line" || d.kind === "dc+") supply.add(first);
            if (d.kind === "neutral" || d.kind === "dc0") ret.add(first);
            fallback.add(d.id);
          }
          break;
        }
        case "supply": {
          const sys = supplySystem(el);
          supplies.push({ el: el.id, phases: sys.phases.map((t) => n(el, t)), ret: sys.ret ? [n(el, sys.ret)] : [] });
          names.set(el.id, el.label || "Supply");
          break;
        }
        case "transformer":
          // The primary is a load; the secondary a supply while the primary is on.
          loads.push({ el: el.id, kind: "transformer", a: n(el, "P1"), b: n(el, "P2") });
          supplies.push({ el: el.id, phases: [n(el, "S1")], ret: [n(el, "S2")], when: el.id, primary: [n(el, "P1"), n(el, "P2")] });
          break;
        case "contact-no":
          link(el, "13", "14", operated);
          if (manual) inputs.push({ el: el.id, kind: "toggle", label: "Contact (no coil)", initial: 0 });
          break;
        case "contact-nc":
          link(el, "21", "22", (s) => !operated(s));
          if (manual) inputs.push({ el: el.id, kind: "toggle", label: "Contact (no coil)", initial: 0 });
          break;
        case "contact-co":
          link(el, "11", "14", operated);
          link(el, "11", "12", (s) => !operated(s));
          if (manual) inputs.push({ el: el.id, kind: "toggle", label: "Contact (no coil)", initial: 0 });
          break;
        case "pushbutton": {
          pushPoles(el).forEach((nc, i) => {
            const k = i + 1;
            if (nc) link(el, `${k}1`, `${k}2`, (s) => !press(s));
            else link(el, `${k}3`, `${k}4`, press);
          });
          inputs.push({ el: el.id, kind: "press", label: el.label || "Push button", initial: 0 });
          break;
        }
        case "selector": {
          // Position 0, I (1) or II (2); each pole closed in the positions it's set to.
          const at = (s: SimState) => s.inputs[el.id] ?? 0;
          selectorPoles(el).forEach((p, i) => {
            const k = i + 1;
            if (p.kind === "co") {
              const t = changeoverTerms(k, el.params.positions === "3");
              link(el, t.com, t.second, (s) => p.closed.includes(at(s)));
              link(el, t.com, t.first, (s) => (p.closed12 ?? []).includes(at(s)));
            } else if (p.kind === "nc") {
              link(el, `${k}1`, `${k}2`, (s) => p.closed.includes(at(s)));
            } else {
              link(el, `${k}3`, `${k}4`, (s) => p.closed.includes(at(s)));
            }
          });
          const three = el.params.positions === "3";
          inputs.push({ el: el.id, kind: "select", label: el.label || "Selector", initial: 0, positions: three ? ["0", "I", "II"] : ["0", "I"] });
          break;
        }
        case "isolator": {
          const poles = typeof el.params.poles === "number" ? el.params.poles : 3;
          const coilDriven = el.params.function === "contactor" && !!master;
          // Isolators and breakers start closed (on); toggling opens them.
          const closed = coilDriven ? operated : (s: SimState) => (s.inputs[el.id] ?? 1) === 1;
          for (let i = 0; i < poles; i++) link(el, String(2 * i + 1), String(2 * i + 2), closed);
          ops.set(el.id, closed);
          for (const a of isolatorAux(el)) link(el, a.a, a.b, a.nc ? (s) => !closed(s) : closed);
          if (!coilDriven) inputs.push({ el: el.id, kind: "toggle", label: el.label || "Isolator / breaker", initial: 1 });
          break;
        }
        case "fuse": {
          // Click to blow it, again to replace it (note 49). Drawn broken while blown.
          const poles = typeof el.params.poles === "number" ? el.params.poles : 1;
          const intact = (s: SimState) => (s.inputs[el.id] ?? 1) === 1;
          for (let i = 0; i < poles; i++) link(el, String(2 * i + 1), String(2 * i + 2), intact);
          ops.set(el.id, (s) => !intact(s));
          inputs.push({ el: el.id, kind: "toggle", label: el.label || "Fuse (click to blow)", initial: 1 });
          break;
        }
        case "plant-view": {
          // Each shown pin is the device's own pin, the same on every view of it (simulated once, below).
          const item = project.plant.find((p) => p.id === el.params.plant);
          names.set(el.id, item ? item.tag || `${item.prefix || "U"}?` : "plant");
          if (!item) break;
          for (const t of String(el.params.show ?? "").split(",").filter(Boolean)) {
            links.push({ a: n(el, t), b: pinNode(item.id, t), el: el.id, src: el.id, closed: () => true, fixed: true });
          }
          break;
        }
        case "coil":
          loads.push({ el: el.id, kind: "coil", a: n(el, "A1"), b: n(el, "A2") });
          break;
        case "timer-coil":
          loads.push({ el: el.id, kind: "timer", a: n(el, "A1"), b: n(el, "A2") });
          timers.set(el.id, {
            delay: parseDelay(el.params.time),
            mode: TIMER_MODES.includes(el.params.mode as TimerMode) ? (el.params.mode as TimerMode) : "on",
          });
          break;
        case "lamp":
          loads.push({
            el: el.id,
            kind: "lamp",
            a: n(el, "+V"),
            b: n(el, "-V"),
            ...(el.params.testPin === true ? { test: n(el, "LT") } : {}),
          });
          break;
      }
    }
  }
  // Plant points (controller.md §6), once per device, on its own pins.
  for (const item of project.plant) {
    const tag = item.tag || `${item.prefix || "U"}?`;
    const pn = (t: string) => pinNode(item.id, t);
    const views = viewsOf(project, item.id);
    for (const pt of item.points ?? []) {
      const key = pointRef(item.id, pt.name);
      const said = pointLabel(project, item, pt, views);
      names.set(key, said);
      points.set(key, { form: pt.form, plant: item.id, name: pt.name });
      if (isAnalogueForm(pt.form) || pt.form === "comms") continue;
      if (pt.form === "dry-in" || pt.form === "powered-in" || pt.form === "supply-in") {
        // Sensed: a dry input when its loop is closed, the others when there's a voltage across them.
        const { sig, com } = signalPins(pt);
        if (sig && com) loads.push({ el: key, kind: pt.form === "dry-in" ? "dry" : "plant", a: pn(sig), b: pn(com) });
        states.set(key, (s) => !!s.energised[key]);
        continue;
      }
      // Outputs: clicked, or following their conditions (through a timer for the delay).
      const on: (s: SimState) => boolean = pt.follows?.length ? (s) => !!s.timed[`${key}:f`] : (s) => (s.inputs[key] ?? 0) === 1;
      outputs.set(key, on);
      states.set(key, on);
      if (pt.follows?.length) {
        followers.push({ id: key, when: pt.follows, join: pt.join ?? "and" });
        timers.set(`${key}:f`, { delay: pt.delay ?? 0, mode: "on-off" });
      } else {
        inputs.push({ el: key, kind: "toggle", label: said, initial: 0 });
      }
      if (pt.form === "contact") {
        const { c, no, nc } = contactPins(pt, item.pins);
        if (c && no) links.push({ a: pn(c), b: pn(no), el: key, src: key, closed: on });
        if (c && nc) links.push({ a: pn(c), b: pn(nc), el: key, src: key, closed: (s) => !on(s) });
      } else {
        // A powered output or supply out is a source while it's on: its first pin against its second.
        const { sig, com } = signalPins(pt);
        if (sig) supplies.push({ el: key, phases: [pn(sig)], ret: com ? [pn(com)] : [], when: key, ...(pt.dists?.[sig] ? { dist: pt.dists[sig] } : {}) });
      }
    }
  }
  // A module's commons linked inside it (v0.4.x M6) are one node.
  for (const item of project.plant) {
    for (const list of item.module?.commons ?? []) {
      for (let i = 1; i < list.length; i++) links.push({ a: pinNode(item.id, list[0]!), b: pinNode(item.id, list[i]!), el: item.id, src: item.id, closed: () => true, fixed: true });
    }
  }
  // Busbars and distributions join their wires electrically (each wire still has its own number).
  for (const j of netJoins(project)) links.push({ a: node.get(`${j.a[0]}:${j.a[1]}`) ?? `${j.a[0]}:${j.a[1]}`, b: node.get(`${j.b[0]}:${j.b[1]}`) ?? `${j.b[0]}:${j.b[1]}`, el: j.el, src: j.el, closed: () => true, fixed: true });
  if (supply.size && ret.size) supplies.push({ el: "rails", phases: [...supply], ret: [...ret] });
  // What each part's "on" is, for conditions: energised, lit, closed, operated.
  for (const [id, fn] of ops) {
    const el = byId.get(id);
    if (!el) continue;
    if (el.symbol === "contact-nc") states.set(id, (s) => !fn(s));
    else states.set(id, fn);
  }
  for (const l of loads) {
    if (l.kind === "lamp") states.set(l.el, (s) => !!s.lamps[l.el]);
    else if (!states.has(l.el)) states.set(l.el, (s) => !!s.energised[l.el]);
  }
  for (const i of inputs) if (!states.has(i.el)) states.set(i.el, (s) => (s.inputs[i.el] ?? i.initial) !== 0);
  return { links, loads, supply, ret, supplies, followers, railNodes, ops, inputs, timers, names, outputs, points, states };
}

/** A device's own pin, whichever views show it. */
export function pinNode(plantId: string, pin: string): string {
  return `pin:${plantId}:${pin}`;
}

/** Is a condition met? */
export function conditionMet(c: Circuit, s: SimState, cond: Condition): boolean {
  const fn = c.states.get(cond.ref);
  return (fn ? fn(s) : false) === cond.on;
}

/** One or two conditions, joined. */
export function conditionsMet(c: Circuit, s: SimState, when: Condition[], join: "and" | "or" = "and"): boolean {
  if (!when.length) return false;
  return join === "or" ? when.some((x) => conditionMet(c, s, x)) : when.every((x) => conditionMet(c, s, x));
}

// ---------------------------------------------------------------------------
// Solving

class UF {
  private p = new Map<string, string>();
  find(x: string): string {
    let r = x;
    while (this.p.has(r) && this.p.get(r) !== r) r = this.p.get(r)!;
    // Path compression: the next find is one step.
    let y = x;
    while (y !== r) {
      const next = this.p.get(y)!;
      this.p.set(y, r);
      y = next;
    }
    return r;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.p.set(ra, rb);
  }
}

/** Everything off (isolators and breakers on), at time zero, solved. */
export function initialState(c: Circuit): SimState {
  return settle(c, { t: 0, inputs: {}, energised: {}, timed: {}, since: {}, lamps: {}, live: [], returns: [], short: false, unstable: false });
}

/** One pass: which loads are energised with the contacts as they are. */
function pass(c: Circuit, s: SimState) {
  const uf = new UF();
  for (const l of c.links) if (l.closed(s)) uf.union(l.a, l.b);
  // Each live supply: its phases (kept apart) and its return.
  const live = liveSupplies(c, s, uf);
  const doms = live.map((x) => ({
    phases: new Set(x.phases.map((p) => uf.find(p))),
    ret: new Set(x.ret.map((r) => uf.find(r))),
  }));
  const phaseRoots = new Set(doms.flatMap((d) => [...d.phases]));
  const retRoots = new Set(doms.flatMap((d) => [...d.ret]));
  const across = (x: string, y: string) => {
    const a = uf.find(x);
    const b = uf.find(y);
    if (a === b) return false;
    return doms.some(
      (d) => (d.phases.has(a) && d.ret.has(b)) || (d.phases.has(b) && d.ret.has(a)) || (d.phases.has(a) && d.phases.has(b)),
    );
  };
  const on = (l: Load) =>
    l.kind === "dry" ? uf.find(l.a) === uf.find(l.b) : across(l.a, l.b) || (!!l.test && across(l.test, l.b));
  // A short: a phase joined straight to its return, two phases of one supply
  // joined, or two different supplies feeding one conductor.
  const fedBy = new Map<string, number>();
  const short =
    live.some((x) => {
      const ph = x.phases.map((p) => uf.find(p));
      return ph.some((p) => x.ret.some((r) => uf.find(r) === p)) || new Set(ph).size < ph.length;
    }) ||
    // (The stand-in supply drawn from busbars isn't a real source: a transformer feeding them isn't a short.)
    live.some((x, i) =>
      x.el !== "rails" &&
      x.phases.some((p) => {
        const r = uf.find(p);
        const other = fedBy.get(r);
        fedBy.set(r, i);
        // Two sources on the same distribution (a battery and the UPS output it backs) feed it together.
        return other !== undefined && other !== i && !(x.dist && live[other]!.dist === x.dist);
      }),
    );
  return { uf, phaseRoots, retRoots, short, on, live };
}

/**
 * The supplies that are live: every Incoming supply, and each transformer
 * whose primary is energised, with its secondary turned the way its primary
 * is fed. (A transformer fed from another transformer is worked out after it.)
 */
function liveSupplies(c: Circuit, s: SimState, uf: UF): Supply[] {
  const out: Supply[] = c.supplies.filter((x) => !x.when);
  const pending = c.supplies.filter((x) => x.when && s.energised[x.when]);
  for (let round = 0; pending.length && round < 8; round++) {
    for (let i = 0; i < pending.length; i++) {
      const x = pending[i]!;
      if (!x.primary) {
        out.push(x);
        pending.splice(i--, 1);
        continue;
      }
      const p1 = uf.find(x.primary[0]);
      const p2 = uf.find(x.primary[1]);
      const fed = out.find((d) => d.phases.some((p) => uf.find(p) === p2) && d.ret.some((r) => uf.find(r) === p1));
      const straight = out.some((d) => d.phases.some((p) => uf.find(p) === p1));
      if (!fed && !straight && round < 7) continue;
      // P2 on the phase and P1 on the return: the secondary's live side is S2.
      out.push(fed && !straight ? { ...x, phases: x.ret, ret: x.phases } : x);
      pending.splice(i--, 1);
    }
  }
  return out;
}

/** Solve until stable at the current time. */
export function settle(c: Circuit, s: SimState): SimState {
  const next: SimState = { ...s, inputs: { ...s.inputs }, energised: { ...s.energised }, timed: { ...s.timed }, since: { ...s.since } };
  next.unstable = false;
  for (let i = 0; i < 64; i++) {
    const r = pass(c, next);
    let changed = false;
    for (const l of c.loads) {
      if (l.kind === "lamp") continue;
      const v = r.on(l);
      if (!!next.energised[l.el] !== v) {
        next.energised[l.el] = v;
        changed = true;
      }
    }
    // Plant outputs that follow conditions: the conditions drive a timer (for the delay), and the timer the output.
    for (const f of c.followers) {
      const v = conditionsMet(c, next, f.when, f.join);
      if (!!next.energised[`${f.id}:f`] !== v) {
        next.energised[`${f.id}:f`] = v;
        changed = true;
      }
    }
    // Outputs' own state, so sources (a powered output, a supply out) switch with them.
    for (const [id, fn] of c.outputs) {
      const v = fn(next);
      if (!!next.energised[id] !== v) {
        next.energised[id] = v;
        changed = true;
      }
    }
    // Timers.
    for (const [id, t] of c.timers) {
      const r = stepTimer(t.mode, t.delay, !!next.energised[id], !!next.timed[id], next.since[id], next.t);
      const done = r.done;
      if (r.since === undefined) delete next.since[id];
      else next.since[id] = r.since;
      if (done !== !!next.timed[id]) {
        next.timed[id] = done;
        changed = true;
      }
    }
    if (!changed) {
      for (const l of c.loads) if (l.kind !== "lamp") next.energised[l.el] = !!next.energised[l.el];
      for (const f of c.followers) next.energised[`${f.id}:f`] = !!next.energised[`${f.id}:f`];
      next.lamps = Object.fromEntries(c.loads.filter((l) => l.kind === "lamp").map((l) => [l.el, r.on(l)]));
      next.short = r.short;
      const live = new Set<string>();
      for (const l of [...c.links, ...c.loads]) {
        for (const x of [l.a, l.b]) if (r.phaseRoots.has(r.uf.find(x))) live.add(x);
      }
      for (const sup of r.live) for (const x of sup.phases) live.add(x);
      next.live = [...live];
      const returns = new Set<string>();
      for (const l of [...c.links, ...c.loads]) {
        for (const x of [l.a, l.b]) if (!live.has(x) && r.retRoots.has(r.uf.find(x))) returns.add(x);
      }
      for (const sup of r.live) for (const x of sup.ret) if (!live.has(x)) returns.add(x);
      next.returns = [...returns];
      return next;
    }
  }
  next.unstable = true;
  return next;
}

// ---------------------------------------------------------------------------
// Timers

const EPS = 1e-9;

/**
 * One timer at time t. `since` is when its current timing phase started
 * (undefined when it isn't timing). Returns whether its contacts are
 * operated and the new `since`.
 */
export function stepTimer(
  mode: TimerMode,
  delay: number,
  energised: boolean,
  done: boolean,
  since: number | undefined,
  t: number,
): { done: boolean; since: number | undefined } {
  const el = (from: number) => t - from + EPS;
  switch (mode) {
    case "on":
      if (!energised) return { done: false, since: undefined };
      since ??= t;
      return { done: el(since) >= delay, since };
    case "off":
      if (energised) return { done: true, since: undefined };
      if (!done) return { done: false, since: undefined };
      since ??= t;
      return el(since) < delay ? { done: true, since } : { done: false, since: undefined };
    case "on-off":
      if (energised) {
        if (done) return { done: true, since: undefined };
        since ??= t;
        return el(since) >= delay ? { done: true, since: undefined } : { done: false, since };
      }
      if (!done) return { done: false, since: undefined };
      since ??= t;
      return el(since) < delay ? { done: true, since } : { done: false, since: undefined };
    case "interval":
      // On as soon as it's energised, off again after the time (or when de-energised).
      if (!energised) return { done: false, since: undefined };
      since ??= t;
      return { done: el(since) < delay, since };
    case "flash-on":
    case "flash-off": {
      if (!energised) return { done: false, since: undefined };
      since ??= t;
      if (delay <= 0) return { done: mode === "flash-on", since };
      const phase = Math.floor(el(since) / delay) % 2 === 0;
      return { done: mode === "flash-on" ? phase : !phase, since };
    }
  }
}

/** When a timer will next change, or null if it won't by itself. */
export function timerEvent(mode: TimerMode, delay: number, since: number | undefined, t: number): number | null {
  if (since === undefined) return null;
  if (mode === "flash-on" || mode === "flash-off") {
    if (delay <= 0) return null;
    return since + (Math.floor((t - since + EPS) / delay) + 1) * delay;
  }
  // Already past (an on-delay that has timed out stays timed out).
  return since + delay > t + EPS ? since + delay : null;
}

/** Flip a switch, selector, isolator or field contact; or hold/release a push button. */
export function toggle(c: Circuit, s: SimState, el: string): SimState {
  const input = c.inputs.find((i) => i.el === el);
  if (!input) return s;
  const cur = s.inputs[el] ?? input.initial;
  // A selector steps to its next position; anything else turns over.
  const next = input.positions ? (cur + 1) % input.positions.length : cur === 1 ? 0 : 1;
  return settle(c, { ...s, inputs: { ...s.inputs, [el]: next } });
}

/** An input's current setting. */
export function inputValue(c: Circuit, s: SimState, el: string): number {
  return s.inputs[el] ?? c.inputs.find((i) => i.el === el)?.initial ?? 0;
}

/** Press and release a push button. */
export function press(c: Circuit, s: SimState, el: string): SimState {
  const down = settle(c, { ...s, inputs: { ...s.inputs, [el]: 1 } });
  return settle(c, { ...down, inputs: { ...down.inputs, [el]: 0 } });
}

/** Let time pass, stopping at each timer as it completes. */
export function advance(c: Circuit, s: SimState, seconds: number): SimState {
  let cur = settle(c, s);
  const end = cur.t + seconds;
  for (let guard = 0; guard < 5000; guard++) {
    let nextEvent = end;
    for (const [id, t] of c.timers) {
      const at = timerEvent(t.mode, t.delay, cur.since[id], cur.t);
      if (at !== null) nextEvent = Math.min(nextEvent, Math.max(cur.t, at));
    }
    cur = settle(c, { ...cur, t: nextEvent });
    if (nextEvent >= end) break;
  }
  return cur;
}

/** Seconds until the next running timer completes, or null if none is running. */
export function nextTimer(c: Circuit, s: SimState): number | null {
  let best: number | null = null;
  for (const [id, t] of c.timers) {
    const at = timerEvent(t.mode, t.delay, s.since[id], s.t);
    if (at === null) continue;
    const left = Math.max(0, at - s.t);
    best = best === null ? left : Math.min(best, left);
  }
  return best;
}

// ---------------------------------------------------------------------------
// Expectations and Check logic (controller.md §6)

export type Action = { do: "toggle"; el: string } | { do: "press"; el: string } | { do: "wait"; seconds: number };

export interface Violation {
  rule: Expectation;
  /** Shortest sequence of actions from the start that breaks it. */
  path: Action[];
}

/**
 * Nothing is part-way through timing (a flasher doesn't count: it never
 * stops). "Should be … when …" is only judged at rest, so an input that
 * follows a few seconds behind isn't red while it catches up.
 */
export function atRest(c: Circuit, s: SimState, only?: Set<string>): boolean {
  for (const [id, t] of c.timers) {
    if (t.mode === "flash-on" || t.mode === "flash-off") continue;
    if (only && !only.has(id)) continue;
    if (timerEvent(t.mode, t.delay, s.since[id], s.t) !== null) return false;
  }
  return true;
}

/**
 * How an expectation stands now: "ok" (green), "bad" (red, or a never
 * statement come true), or "wait" while something is still timing.
 */
export function judge(c: Circuit, s: SimState, e: Expectation): "ok" | "bad" | "wait" {
  const met = conditionsMet(c, s, e.when, e.join);
  if (e.kind === "never") return met ? "bad" : "ok";
  // Only timers this expectation depends on hold it: a fail timer elsewhere doesn't.
  if (!atRest(c, s, timersFor(c, e))) return "wait";
  const want = met ? e.on !== false : e.on === false;
  const is = c.states.get(e.point ?? "")?.(s) ?? false;
  return is === want ? "ok" : "bad";
}

const timerCache = new WeakMap<Circuit, Map<string, Set<string>>>();

/**
 * The timers between an input and its conditions: those one side depends on
 * and the other doesn't (a plant output's delay, a timer relay in the path).
 * A timer upstream of both moves them together, so it doesn't hold the
 * expectation.
 */
function timersFor(c: Circuit, e: Expectation): Set<string> {
  let cache = timerCache.get(c);
  if (!cache) timerCache.set(c, (cache = new Map()));
  const k = [e.point ?? "", ...e.when.map((w) => w.ref)].join("|");
  let out = cache.get(k);
  if (!out) {
    const timersOf = (refs: string[]) => {
      const seen = trace(c, refs).seen;
      return new Set([...c.timers.keys()].filter((id) => seen.has(id) || (id.endsWith(":f") && seen.has(id.slice(0, -2)))));
    };
    const a = timersOf(e.point ? [e.point] : []);
    const b = timersOf(e.when.map((w) => w.ref));
    out = new Set([...a, ...b].filter((id) => a.has(id) !== b.has(id)));
    cache.set(k, out);
  }
  return out;
}

export function breaks(c: Circuit, e: Expectation, s: SimState): boolean {
  return judge(c, s, e) === "bad";
}

function key(s: SimState): string {
  const parts = [
    Object.entries(s.inputs).map(([k, v]) => `${k}=${v}`).sort().join(","),
    Object.entries(s.energised).filter(([, v]) => v).map(([k]) => k).sort().join(","),
    Object.entries(s.timed).filter(([, v]) => v).map(([k]) => k).sort().join(","),
    Object.keys(s.since).sort().join(","),
  ];
  return parts.join("|");
}

export interface SearchResult {
  violations: Violation[];
  /** States explored. */
  states: number;
  /** True if the search stopped at its limit before exploring everything. */
  truncated: boolean;
  /** Sequences that short the supply or never settle. */
  faults: { kind: "short" | "unstable"; path: Action[] }[];
}

/**
 * Try every sequence of operator actions (flip a switch, press a button,
 * click a plant output, wait for the timers), breadth first, from the given
 * start. Reports the shortest sequence that breaks each expectation, plus
 * any that short the supply or don't settle.
 */
export interface SearchOptions {
  limit?: number;
  /**
   * Also try opening isolators and breakers. Off by default: they only take
   * power away, and leaving them closed keeps the search small enough to finish.
   */
  includeIsolators?: boolean;
}

export function search(c: Circuit, start: SimState, rules: Expectation[], opts: SearchOptions | number = {}): SearchResult {
  const o = typeof opts === "number" ? { limit: opts } : opts;
  // Each expectation is searched over only the inputs that can affect it
  // (those with the same inputs together): whether it can fail depends on
  // nothing else, and one sheet's fans don't multiply the sequences tried
  // for another's.
  const refsOf = (r: Expectation) => [...(r.point ? [r.point] : []), ...r.when.map((w) => w.ref)];
  const groups: { rules: Expectation[]; inputs: Set<string> }[] = [];
  for (const r of rules) {
    const inputs = influences(c, refsOf(r));
    const same = groups.find((g) => g.inputs.size === inputs.size && [...inputs].every((x) => g.inputs.has(x)));
    if (same) same.rules.push(r);
    else groups.push({ rules: [r], inputs });
  }
  if (groups.length <= 1) return searchGroup(c, start, rules, o);
  const out: SearchResult = { violations: [], states: 0, truncated: false, faults: [] };
  for (const g of groups) {
    const r = searchGroup(c, start, g.rules, o);
    out.violations.push(...r.violations);
    out.states += r.states;
    out.truncated ||= r.truncated;
    for (const f of r.faults) if (!out.faults.some((x) => x.kind === f.kind)) out.faults.push(f);
  }
  // In the order the expectations are listed.
  out.violations.sort((a, b) => rules.indexOf(a.rule) - rules.indexOf(b.rule));
  return out;
}

function searchGroup(c: Circuit, start: SimState, rules: Expectation[], o: SearchOptions): SearchResult {
  const limit = o.limit ?? 20000;
  const relevant = rules.length ? influences(c, rules.flatMap((r) => [...(r.point ? [r.point] : []), ...r.when.map((w) => w.ref)])) : null;
  const inputs = c.inputs.filter((i) => (o.includeIsolators || i.initial !== 1) && (!relevant || relevant.has(i.el)));
  const first = settle(c, start);
  const seen = new Set<string>([key(first)]);
  const queue: { s: SimState; path: Action[] }[] = [{ s: first, path: [] }];
  const violations = new Map<string, Violation>();
  const faults: SearchResult["faults"] = [];
  const faultSeen = new Set<string>();
  const check = (s: SimState, path: Action[]) => {
    for (const r of rules) if (!violations.has(r.id) && breaks(c, r, s)) violations.set(r.id, { rule: r, path });
    for (const kind of ["short", "unstable"] as const) {
      if (s[kind] && !faultSeen.has(kind)) {
        faultSeen.add(kind);
        faults.push({ kind, path });
      }
    }
  };
  check(first, []);
  let states = 1;
  while (queue.length && states < limit && violations.size < rules.length) {
    const { s, path } = queue.shift()!;
    const moves: { a: Action; next: SimState }[] = [];
    for (const i of inputs) {
      if (i.kind === "press") moves.push({ a: { do: "press", el: i.el }, next: press(c, s, i.el) });
      else moves.push({ a: { do: "toggle", el: i.el }, next: toggle(c, s, i.el) });
    }
    const wait = nextTimer(c, s);
    if (wait !== null) moves.push({ a: { do: "wait", seconds: Math.ceil(wait) }, next: advance(c, s, Math.ceil(wait)) });
    for (const m of moves) {
      // Time itself isn't part of the state, so the same position reached later counts as seen.
      const k = key(m.next);
      if (seen.has(k)) continue;
      seen.add(k);
      states++;
      const p = [...path, m.a];
      check(m.next, p);
      queue.push({ s: m.next, path: p });
    }
  }
  return { violations: [...violations.values()], states, truncated: queue.length > 0 && states >= limit, faults };
}

/**
 * The inputs that can affect the given things (coils, lamps, contacts,
 * points): those on their circuits, and on the circuits of the coils that
 * drive their contacts, and what plant outputs follow, and so on. Supply
 * and return rails don't count as joining circuits, so plant outputs that
 * are sources (a powered output, a supply out) are always included.
 */
export function influences(c: Circuit, refs: string[]): Set<string> {
  return trace(c, refs).inputs;
}

/** What the given things depend on: the inputs that can change them, and every load, output and part passed on the way. */
function trace(c: Circuit, refs: string[]): { inputs: Set<string>; seen: Set<string> } {
  const uf = new UF();
  const rails = new Set([...c.supplies.flatMap((x) => [...x.phases, ...x.ret]), ...c.railNodes]);
  for (const l of c.links) if (!rails.has(l.a) && !rails.has(l.b)) uf.union(l.a, l.b);
  const linksByComp = new Map<string, Link[]>();
  for (const l of c.links) {
    for (const x of [l.a, l.b]) {
      if (rails.has(x)) continue;
      const k = uf.find(x);
      if (!linksByComp.has(k)) linksByComp.set(k, []);
      linksByComp.get(k)!.push(l);
    }
  }
  const loadById = new Map(c.loads.map((l) => [l.el, l]));
  const inputIds = new Set(c.inputs.map((i) => i.el));
  const followerOf = new Map(c.followers.map((f) => [f.id, f]));
  const out = new Set<string>();
  for (const x of c.supplies) if (x.when && inputIds.has(x.when)) out.add(x.when);
  const seen = new Set<string>();
  const queue = [...refs];
  while (queue.length) {
    const id = queue.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    if (inputIds.has(id)) out.add(id);
    const f = followerOf.get(id);
    if (f) queue.push(...f.when.map((w) => w.ref));
    // A contact (or other switched part) named directly: what drives it.
    for (const l of c.links) if (l.el === id && l.src !== id) queue.push(l.src);
    const load = loadById.get(id);
    if (!load) continue;
    for (const x of [load.a, load.b]) {
      if (rails.has(x)) continue;
      for (const l of linksByComp.get(uf.find(x)) ?? []) {
        if (inputIds.has(l.src)) out.add(l.src);
        else queue.push(l.src);
      }
    }
  }
  return { inputs: out, seen };
}

/** Describe an action for people. */
export function describeAction(c: Circuit, a: Action, inputLabel = true): string {
  if (a.do === "wait") return `wait ${a.seconds} s`;
  const name = c.names.get(a.el) ?? a.el;
  const input = c.inputs.find((i) => i.el === a.el);
  const what = inputLabel && input?.label ? ` (${input.label})` : "";
  return a.do === "press" ? `press ${name}${what}` : `operate ${name}${what}`;
}

// ---------------------------------------------------------------------------
// Helpers for supplies and plant

/** Terminals of an Incoming supply part, by its system. */
export function supplySystem(el: Element): { phases: string[]; ret: string | null } {
  switch (String(el.params.system ?? "3ph-n")) {
    case "1ph-n":
      return { phases: ["L"], ret: "N" };
    case "3ph":
      return { phases: ["L1", "L2", "L3"], ret: null };
    case "dc":
      return { phases: ["+V"], ret: "-V" };
    default:
      return { phases: ["L1", "L2", "L3"], ret: "N" };
  }
}

/** Kept for callers of the old name: a point's ref. */
export const plantInputId = pointRef;

/** For drawing: which elements are operated just now (contacts in their operated position). */
export function operatedNow(c: Circuit, s: SimState): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [id, fn] of c.ops) out[id] = fn(s);
  return out;
}

/** Hold a push button down (true) or let it go (false). */
export function hold(c: Circuit, s: SimState, el: string, down: boolean): SimState {
  if (!c.inputs.some((i) => i.el === el)) return s;
  return settle(c, { ...s, inputs: { ...s.inputs, [el]: down ? 1 : 0 } });
}

/** Seconds left before a timer next changes, while it's timing. */
export function timerRemaining(c: Circuit, s: SimState, id: string): number | null {
  const t = c.timers.get(id);
  if (!t) return null;
  const at = timerEvent(t.mode, t.delay, s.since[id], s.t);
  return at === null ? null : Math.max(0, at - s.t);
}
