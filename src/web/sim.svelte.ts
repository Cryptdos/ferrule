/**
 * The Simulate workbench (DESIGN.md §9): the same sheets, but clicking a
 * switch operates it, coils pull in, lamps light and timers run.
 */
import type { Expectation, Project } from "../core/model";
import { proofsFromSearch } from "../core/interlocks";
import {
  advance,
  compile,
  describeAction,
  initialState,
  inputValue,
  nextTimer,
  operatedNow,
  hold,
  judge,
  timerRemaining,
  press,
  search,
  toggle,
  type Action,
  type Circuit,
  type SearchResult,
  type SimState,
} from "../core/sim";

export class Simulator {
  circuit: Circuit;
  state: SimState = $state()!;
  running = $state(true);
  speed = $state(1);
  /** What was done since reset, for replaying and reporting. */
  log: Action[] = $state([]);
  result: SearchResult | null = $state(null);
  searching = $state(false);
  includeIsolators = $state(false);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(project: Project) {
    this.circuit = compile(project);
    this.state = initialState(this.circuit);
    this.timer = setInterval(() => this.tick(0.1), 100);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private tick(dt: number) {
    if (!this.running || nextTimer(this.circuit, this.state) === null) return;
    this.state = advance(this.circuit, this.state, dt * this.speed);
  }

  /** Elements to draw operated just now. */
  get ops(): Record<string, boolean> {
    return operatedNow(this.circuit, this.state);
  }

  /** Seconds left on a timer that's timing, or null. */
  remaining(id: string): number | null {
    return timerRemaining(this.circuit, this.state, id);
  }

  /** Is this input a push button (held while the mouse is down)? */
  isPress(id: string): boolean {
    return this.circuit.inputs.find((i) => i.el === id)?.kind === "press";
  }

  /** Hold a push button down, or let it go. */
  hold(id: string, down: boolean): void {
    this.state = hold(this.circuit, this.state, id, down);
    if (down) this.log = [...this.log, { do: "press", el: id }];
  }

  isInput(id: string): boolean {
    return this.circuit.inputs.some((i) => i.el === id);
  }

  value(id: string): number {
    return inputValue(this.circuit, this.state, id);
  }

  /** Click on an input: flip it, or press and release a push button. */
  operate(id: string): void {
    const input = this.circuit.inputs.find((i) => i.el === id);
    if (!input) return;
    if (input.kind === "press") {
      this.state = press(this.circuit, this.state, id);
      this.log = [...this.log, { do: "press", el: id }];
    } else {
      this.state = toggle(this.circuit, this.state, id);
      this.log = [...this.log, { do: "toggle", el: id }];
    }
  }

  wait(seconds: number): void {
    this.state = advance(this.circuit, this.state, seconds);
    this.log = [...this.log, { do: "wait", seconds }];
  }

  /** Jump to when the next timer finishes. */
  waitForTimer(): void {
    const t = nextTimer(this.circuit, this.state);
    if (t !== null) this.wait(Math.max(0.1, Math.ceil(t * 10) / 10));
  }

  reset(): void {
    this.state = initialState(this.circuit);
    this.log = [];
  }

  replay(path: Action[]): void {
    this.reset();
    for (const a of path) {
      if (a.do === "wait") this.wait(a.seconds);
      else this.operate(a.el);
    }
  }

  /** What the last Check logic run says about interlocks. */
  proofs: import("../core/interlocks").Proofs | null = $state(null);

  async check(project: Project): Promise<void> {
    this.searching = true;
    // Let the panel show "Searching…" first.
    await new Promise((r) => setTimeout(r, 20));
    this.result = search(this.circuit, initialState(this.circuit), project.expectations, {
      limit: 20000,
      includeIsolators: this.includeIsolators,
    });
    // Interlocks are proved by the same search (design-v0.4 §6): Design and Check show it.
    this.proofs = proofsFromSearch(project, this.result.violations.map((v) => v.rule.id), this.result.truncated);
    this.searching = false;
  }

  /** Is a part or point on just now (energised, lit, closed; a point sensed or switched on)? */
  isOn(ref: string): boolean {
    return this.circuit.states.get(ref)?.(this.state) ?? false;
  }

  /** How each expectation stands now: ok (green), bad (red), or wait while something is timing. */
  judged(list: Expectation[]): Map<string, "ok" | "bad" | "wait"> {
    return new Map(list.map((e) => [e.id, judge(this.circuit, this.state, e)]));
  }

  /** An input point's colour: green or red by its expectations (red wins), grey with none. */
  inputColour(ref: string, list: Expectation[], judged = this.judged(list)): "ok" | "bad" | "wait" | null {
    const mine = list.filter((e) => e.kind === "should" && e.point === ref).map((e) => judged.get(e.id));
    if (!mine.length) return null;
    if (mine.includes("bad")) return "bad";
    if (mine.includes("wait")) return "wait";
    return "ok";
  }

  describe(a: Action): string {
    return describeAction(this.circuit, a);
  }
}
