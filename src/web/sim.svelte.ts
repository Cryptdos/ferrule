/**
 * The Simulate workbench (DESIGN.md §9): the same sheets, but clicking a
 * switch operates it, coils pull in, lamps light and timers run.
 */
import type { Project } from "../core/model";
import {
  advance,
  compile,
  describeAction,
  initialState,
  inputValue,
  nextTimer,
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

  async check(project: Project): Promise<void> {
    this.searching = true;
    // Let the panel show "Searching…" first.
    await new Promise((r) => setTimeout(r, 20));
    this.result = search(this.circuit, initialState(this.circuit), project.rules, {
      limit: 20000,
      includeIsolators: this.includeIsolators,
    });
    this.searching = false;
  }

  describe(a: Action): string {
    return describeAction(this.circuit, a);
  }
}
