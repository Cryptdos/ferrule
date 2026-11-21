/**
 * Simulation workbench (DESIGN.md §9, §10): basic digital relay logic.
 *
 * Every conductor is a node. Contacts, push buttons, selectors, isolators
 * and field plant contacts are switched links between nodes; coils, timer
 * coils and lamps are loads. A load is energised when one side reaches a
 * supply rail (CCT, CCT1…) and the other a return rail (0V) through closed
 * links. Contacts follow their coils, so the circuit is solved again until
 * nothing changes. Timers run on a simulation clock.
 *
 * No motors, analogue or power flow. Fuses and breakers always conduct.
 */
import type { Element, LogicRule, Project } from "./model";
import { isolatorAux } from "./symbols";
import { masterOf } from "./xref";
import { displayTag } from "./tags";

// ---------------------------------------------------------------------------
// Compiled circuit

type Kind = "coil" | "timer" | "lamp";

interface Link {
  a: string;
  b: string;
  /** Element this link belongs to. */
  el: string;
  /** What decides it: the coil or timer driving it, or the element itself if it's operated by hand. */
  src: string;
  closed: (s: SimState) => boolean;
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
  /** Setting at the start: isolators and breakers start on (1), everything else off (0). */
  initial: 0 | 1;
}

export interface Circuit {
  links: Link[];
  loads: Load[];
  supply: Set<string>;
  ret: Set<string>;
  inputs: Input[];
  /** Timer settings by element id: delay in seconds and mode. */
  timers: Map<string, { delay: number; mode: TimerMode }>;
  names: Map<string, string>;
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
  /** Conductor ids connected to a supply. */
  live: string[];
  /** Supply shorted straight to return through closed contacts. */
  short: boolean;
  /** The circuit didn't settle (it oscillates). */
  unstable: boolean;
}

/** Rails that feed the control circuit, and the rail it returns to. */
const SUPPLY = /^(CCT\d*|\+?24V(AC|DC)?)$/i;
const RETURN = /^0V$/i;

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
          if (el.symbol === "timer-contact") return !!s.timed[master.id];
          return !!s.energised[master.id];
        }
        return (s.inputs[el.id] ?? 0) === 1;
      };
      const manual = !master;
      switch (el.symbol) {
        case "rail":
        case "busbar": {
          const name = String(el.params.name ?? "");
          const conds = project.conductors.filter((c) => c.terminals.some(([id]) => id === el.id)).map((c) => c.id);
          if (SUPPLY.test(name)) conds.forEach((c) => supply.add(c));
          if (RETURN.test(name)) conds.forEach((c) => ret.add(c));
          break;
        }
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
        case "timer-contact": {
          const nc = el.params.contact === "nc";
          if (nc) link(el, "15", "16", (s) => !operated(s));
          else link(el, "17", "18", operated);
          if (manual) inputs.push({ el: el.id, kind: "toggle", label: "Timer contact (no timer)", initial: 0 });
          break;
        }
        case "pb-no":
          link(el, "13", "14", (s) => (s.inputs[el.id] ?? 0) === 1);
          inputs.push({ el: el.id, kind: "press", label: el.label || "Push button", initial: 0 });
          break;
        case "pb-nc":
          link(el, "21", "22", (s) => (s.inputs[el.id] ?? 0) !== 1);
          inputs.push({ el: el.id, kind: "press", label: el.label || "Push button", initial: 0 });
          break;
        case "selector":
          if (el.params.contact === "co") {
            link(el, "11", "12", (s) => (s.inputs[el.id] ?? 0) === 0);
            link(el, "11", "14", (s) => (s.inputs[el.id] ?? 0) === 1);
          } else {
            link(el, "13", "14", (s) => (s.inputs[el.id] ?? 0) === 1);
          }
          inputs.push({ el: el.id, kind: "select", label: el.label || "Selector", initial: 0 });
          break;
        case "isolator": {
          const poles = typeof el.params.poles === "number" ? el.params.poles : 3;
          const coilDriven = el.params.function === "contactor" && !!master;
          // Isolators and breakers start closed (on); toggling opens them.
          const closed = coilDriven ? operated : (s: SimState) => (s.inputs[el.id] ?? 1) === 1;
          for (let i = 0; i < poles; i++) link(el, String(2 * i + 1), String(2 * i + 2), closed);
          for (const a of isolatorAux(el)) link(el, a.a, a.b, a.nc ? (s) => !closed(s) : closed);
          if (!coilDriven) inputs.push({ el: el.id, kind: "toggle", label: el.label || "Isolator / breaker", initial: 1 });
          break;
        }
        case "fuse": {
          const poles = typeof el.params.poles === "number" ? el.params.poles : 1;
          for (let i = 0; i < poles; i++) link(el, String(2 * i + 1), String(2 * i + 2), () => true);
          break;
        }
        case "plant-view": {
          // Field plant as a volt-free contact: when "closed", its shown terminals are joined.
          const shown = String(el.params.show ?? "").split(",").filter(Boolean);
          if (shown.length >= 2 && !shown.includes("U")) {
            for (let i = 1; i < shown.length; i++) link(el, shown[0]!, shown[i]!, (s) => (s.inputs[el.id] ?? 0) === 1);
            const item = project.plant.find((p) => p.id === el.params.plant);
            names.set(el.id, item?.tag ?? "plant");
            inputs.push({ el: el.id, kind: "toggle", label: item ? `${item.tag} contact (field)` : "Field contact", initial: 0 });
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
            a: n(el, "V+"),
            b: n(el, "V-"),
            ...(el.params.testPin === true ? { test: n(el, "T") } : {}),
          });
          break;
      }
    }
  }
  return { links, loads, supply, ret, inputs, timers, names };
}

// ---------------------------------------------------------------------------
// Solving

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

/** Everything off (isolators and breakers on), at time zero, solved. */
export function initialState(c: Circuit): SimState {
  return settle(c, { t: 0, inputs: {}, energised: {}, timed: {}, since: {}, lamps: {}, live: [], short: false, unstable: false });
}

/** One pass: which loads are energised with the contacts as they are. */
function pass(c: Circuit, s: SimState) {
  const uf = new UF();
  const S = "§supply";
  const R = "§return";
  for (const x of c.supply) uf.union(x, S);
  for (const x of c.ret) uf.union(x, R);
  for (const l of c.links) if (l.closed(s)) uf.union(l.a, l.b);
  const fs = uf.find(S);
  const fr = uf.find(R);
  const across = (x: string, y: string) => {
    const a = uf.find(x);
    const b = uf.find(y);
    return (a === fs && b === fr) || (a === fr && b === fs);
  };
  const on = (l: Load) => across(l.a, l.b) || (!!l.test && across(l.test, l.b));
  return { uf, fs, short: fs === fr && c.supply.size > 0 && c.ret.size > 0, on };
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
      next.lamps = Object.fromEntries(c.loads.filter((l) => l.kind === "lamp").map((l) => [l.el, r.on(l)]));
      next.short = r.short;
      const live = new Set<string>();
      for (const l of [...c.links, ...c.loads]) {
        for (const x of [l.a, l.b]) if (r.uf.find(x) === r.fs) live.add(x);
      }
      for (const x of c.supply) live.add(x);
      next.live = [...live];
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
  return settle(c, { ...s, inputs: { ...s.inputs, [el]: cur === 1 ? 0 : 1 } });
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
// Rule search (DESIGN.md §10)

export type Rule = LogicRule;

export type Action = { do: "toggle"; el: string } | { do: "press"; el: string } | { do: "wait"; seconds: number };

export interface Violation {
  rule: Rule;
  /** Shortest sequence of actions from the start that breaks it. */
  path: Action[];
}

const isOn = (s: SimState, id: string) => !!s.energised[id] || !!s.lamps[id];

export function breaks(rule: Rule, s: SimState): boolean {
  if (rule.kind === "never") return isOn(s, rule.a);
  return isOn(s, rule.a) && !!rule.b && isOn(s, rule.b);
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
 * wait for the timers), breadth first, from the given start. Reports the
 * shortest sequence that breaks each rule, plus any that short the supply
 * or don't settle.
 */
export interface SearchOptions {
  limit?: number;
  /**
   * Also try opening isolators and breakers. Off by default: they only take
   * power away, and leaving them closed keeps the search small enough to finish.
   */
  includeIsolators?: boolean;
}

export function search(c: Circuit, start: SimState, rules: Rule[], opts: SearchOptions | number = {}): SearchResult {
  const o = typeof opts === "number" ? { limit: opts } : opts;
  const limit = o.limit ?? 20000;
  const relevant = rules.length ? influences(c, rules.flatMap((r) => (r.b ? [r.a, r.b] : [r.a]))) : null;
  const inputs = c.inputs.filter((i) => (o.includeIsolators || i.initial !== 1) && (!relevant || relevant.has(i.el)));
  const first = settle(c, start);
  const seen = new Set<string>([key(first)]);
  const queue: { s: SimState; path: Action[] }[] = [{ s: first, path: [] }];
  const violations = new Map<string, Violation>();
  const faults: SearchResult["faults"] = [];
  const faultSeen = new Set<string>();
  const check = (s: SimState, path: Action[]) => {
    for (const r of rules) if (!violations.has(r.id) && breaks(r, s)) violations.set(r.id, { rule: r, path });
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
 * The inputs that can affect the given coils or lamps: those on their
 * circuits, and on the circuits of the coils that drive their contacts,
 * and so on. Supply and return rails don't count as joining circuits.
 */
export function influences(c: Circuit, loads: string[]): Set<string> {
  const uf = new UF();
  const rails = new Set([...c.supply, ...c.ret]);
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
  const out = new Set<string>();
  const seen = new Set<string>();
  const queue = [...loads];
  while (queue.length) {
    const id = queue.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const load = loadById.get(id);
    if (!load) continue;
    for (const x of [load.a, load.b]) {
      if (rails.has(x)) continue;
      for (const l of linksByComp.get(uf.find(x)) ?? []) {
        if (inputIds.has(l.src)) out.add(l.src);
        else if (loadById.has(l.src)) queue.push(l.src);
      }
    }
  }
  return out;
}

/** Describe an action for people. */
export function describeAction(c: Circuit, a: Action, inputLabel = true): string {
  if (a.do === "wait") return `wait ${a.seconds} s`;
  const name = c.names.get(a.el) ?? a.el;
  const input = c.inputs.find((i) => i.el === a.el);
  const what = inputLabel && input?.label ? ` (${input.label})` : "";
  return a.do === "press" ? `press ${name}${what}` : `operate ${name}${what}`;
}
