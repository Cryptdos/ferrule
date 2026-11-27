<script lang="ts">
  import { displayTag } from "../../core/tags";
  import { resolveFields } from "../../core/fields";
  import { isMaster } from "../../core/xref";
  import { describeExpectation, formLabel, isInputForm, parsePointRef, pointRef, things } from "../../core/points";
  import type { Element } from "../../core/model";
  import type { Editor } from "../editor.svelte";
  import type { Simulator } from "../sim.svelte";
  import { loadText, supplyLoads, usesLoads } from "../../core/supplyload";

  let { editor, sim, onexpectations }: { editor: Editor; sim: Simulator; onexpectations?: () => void } = $props();

  const all = $derived(editor.project.pages.flatMap((pg) => pg.elements.map((el) => ({ el, page: pg }))));
  const byId = $derived(new Map(all.map((x) => [x.el.id, x])));
  const name = (el: Element) => {
    const t = displayTag(el, editor.project);
    const l = resolveFields(el.label, editor.project);
    return [t, l].filter(Boolean).join(" ") || el.symbol;
  };
  const loads = $derived(all.filter(({ el }) => isMaster(el) || el.symbol === "lamp"));
  /** A point (plant:<id>:<point>) lives on its device's first view that shows one of its pins. */
  const viewOf = (ref: string) => {
    const m = parsePointRef(ref);
    if (!m) return undefined;
    const item = editor.project.plant.find((p) => p.id === m.plant);
    const pins = item?.points?.find((p) => p.name === m.point)?.pins ?? [];
    const views = all.filter(({ el }) => el.symbol === "plant-view" && el.params.plant === m.plant);
    return views.find(({ el }) => String(el.params.show ?? "").split(",").some((t) => pins.includes(t))) ?? views[0];
  };
  const s = $derived(sim.state);
  const on = (id: string) => !!s.energised[id] || !!s.lamps[id];
  const list = $derived(things(editor.project));
  const exps = $derived(editor.project.expectations);
  const judged = $derived.by(() => {
    void s;
    return sim.judged(exps);
  });
  /** Every device's points with their live state; red inputs first. */
  const devices = $derived.by(() => {
    void s;
    const rank = (c: string | null) => (c === "bad" ? 0 : c === "wait" ? 1 : 2);
    return editor.project.plant
      .filter((item) => item.points?.length)
      .map((item) => {
        const points = (item.points ?? []).map((pt) => {
          const ref = pointRef(item.id, pt.name);
          const colour = isInputForm(pt.form) ? sim.inputColour(ref, exps, judged) : null;
          return { pt, ref, colour, on: sim.isOn(ref), clicked: sim.isInput(ref) };
        });
        points.sort((a, b) => rank(a.colour) - rank(b.colour));
        return { item, points, worst: Math.min(...points.map((p) => rank(p.colour))) };
      })
      .sort((a, b) => a.worst - b.worst);
  });
  /** Each supply's load (v0.4.x M12): live and worst case, red over its rating. */
  const loadsOn = $derived(usesLoads(editor.project) ? supplyLoads(editor.project, sim.circuit, s) : null);
  const supplyAt = (id: string) => byId.get(id) ?? viewOf(id);
  const neverBroken = $derived(exps.filter((e) => e.kind === "never" && judged.get(e.id) === "bad"));
</script>

<div class="sim">
  <div class="clock">
    <strong>{s.t.toFixed(1)} s</strong>
    <button onclick={() => (sim.running = !sim.running)}>{sim.running ? "Pause" : "Run"}</button>
    <select bind:value={sim.speed} title="Clock speed">
      <option value={1}>1×</option>
      <option value={10}>10×</option>
      <option value={60}>60×</option>
    </select>
    <button onclick={() => sim.waitForTimer()} title="Jump to when the next timer finishes">Next timer</button>
    <button onclick={() => sim.reset()}>Reset</button>
  </div>
  {#if s.short}<div class="fault">Short circuit: the supply is shorted to 0V through closed contacts.</div>{/if}
  {#if s.unstable}<div class="fault">The circuit doesn't settle: relays chatter.</div>{/if}
  {#each neverBroken as e (e.id)}<div class="fault">{describeExpectation(editor.project, e, list)}: it's happened.</div>{/each}
  <p class="hint">
    Click switches, selectors and plant outputs on the drawing (outlined in orange). A push button is held while the mouse is
    down (Shift+click holds it until clicked again). Plant inputs turn green when they see what's expected, red when they
    don't. Double-click a contact or link end to follow it.
  </p>

  {#if loadsOn}
    <div class="sub">Supplies <span class="where">live / worst case</span></div>
    {#each loadsOn.supplies as x (x.id)}
      {@const at = supplyAt(x.id)}
      <div class="row">
        <button class="go" onclick={() => at && editor.goTo(at.el.id)} title={x.ratingVa ? `Rated ${x.ratingVa} VA` : "No rating set"}>{x.name}</button>
        <span class="load" class:over={!!x.ratingVa && (x.liveVa ?? 0) > x.ratingVa}>{loadText(x.liveVa ?? 0, x.gives)}</span>
        <span class="where">/</span>
        <span class="load" class:over={!!x.ratingVa && x.worstVa > x.ratingVa}>{loadText(x.worstVa, x.gives)}</span>
        {#if x.ratingVa}<span class="where">of {loadText(x.ratingVa, x.gives)}</span>{/if}
      </div>
    {/each}
    {#if loadsOn.undrawn}<p class="hint">{loadsOn.undrawn} part{loadsOn.undrawn === 1 ? " has" : "s have"} no draw set, so count{loadsOn.undrawn === 1 ? "s" : ""} as nothing.</p>{/if}
  {/if}

  {#if devices.length}
    <div class="sub">Plant points</div>
    {#each devices as d (d.item.id)}
      <div class="dev">{d.item.tag || `${d.item.prefix || "U"}?`} <span class="where">{d.item.description}</span></div>
      {#each d.points as p (p.ref)}
        {@const v = viewOf(p.ref)}
        <div class="row">
          <span class="box" class:on={p.on} class:ok={p.colour === "ok"} class:bad={p.colour === "bad"} class:wait={p.colour === "wait"}></span>
          <button class="go" onclick={() => v && editor.goTo(v.el.id)} title={formLabel(p.pt.form)}>{p.pt.name}</button>
          <span class="where">{formLabel(p.pt.form)}{v ? ` · sh ${v.page.number}` : ""}</span>
          {#if p.clicked}
            <button class="op" class:on={sim.value(p.ref) === 1} onclick={() => sim.operate(p.ref)}>{sim.value(p.ref) ? "On" : "Off"}</button>
          {/if}
        </div>
      {/each}
    {/each}
  {/if}

  <div class="sub">Inputs</div>
  {#each sim.circuit.inputs.filter((i) => byId.has(i.el)) as i (i.el)}
    {@const x = byId.get(i.el)!}
    <div class="row">
      <button class="go" onclick={() => editor.goTo(x.el.id)} title="Show on the drawing">{name(x.el)}</button>
      <span class="where">sh {x.page.number}</span>
      {#if i.kind === "press"}
        <button
          class="op"
          class:on={sim.value(i.el) === 1}
          title="Held while the mouse button is down; Shift+click to hold it on"
          onpointerdown={(e) => sim.hold(i.el, e.shiftKey ? sim.value(i.el) !== 1 : true)}
          onpointerup={(e) => !e.shiftKey && sim.hold(i.el, false)}
          onpointerleave={(e) => e.buttons && !e.shiftKey && sim.hold(i.el, false)}
        >
          {sim.value(i.el) === 1 ? "Held" : "Press"}
        </button>
      {:else}
        <button class="op" class:on={sim.value(i.el) === 1} onclick={() => sim.operate(i.el)}>
          {i.kind === "select" ? (i.positions?.[sim.value(i.el)] ?? `Pos ${sim.value(i.el) + 1}`) : sim.value(i.el) ? "On" : "Off"}
        </button>
      {/if}
    </div>
  {/each}

  <div class="sub">Coils and lamps</div>
  {#each loads as { el, page } (el.id)}
    {@const timer = sim.circuit.timers.get(el.id)}
    {@const since = s.since[el.id]}
    <div class="row">
      <span class="dot" class:on={on(el.id)}></span>
      <button class="go" onclick={() => editor.goTo(el.id)}>{name(el)}</button>
      <span class="where">
        sh {page.number}
        {#if timer && since !== undefined}· {Math.max(0, timer.delay - (s.t - since)).toFixed(1)} s{/if}
        {#if timer && s.timed[el.id]}· timed out{/if}
      </span>
    </div>
  {/each}

  <div class="sub">Expectations</div>
  <p class="hint">What the drawing should do. <em>Check logic</em> tries every sequence of operations, plant outputs and timers to find one that breaks an expectation.</p>
  {#each exps as e (e.id)}
    {@const j = judged.get(e.id)}
    <div class="row rule">
      <span class="box" class:ok={j === "ok"} class:bad={j === "bad"} class:wait={j === "wait"}></span>
      <span>{describeExpectation(editor.project, e, list)}</span>
    </div>
  {/each}
  {#if onexpectations}<button class="small" onclick={onexpectations}>Expectations…</button>{/if}
  <label class="inc"><input type="checkbox" bind:checked={sim.includeIsolators} /> Also try opening isolators and breakers</label>
  <button onclick={async () => {
    await sim.check(editor.project);
    if (sim.proofs) editor.proofs = sim.proofs;
  }} disabled={sim.searching}>
    {sim.searching ? "Searching…" : "Check logic"}
  </button>
  {#if sim.result}
    {@const r = sim.result}
    <div class="result">
      <div>
        Explored {r.states} states{r.truncated ? " (stopped at the limit; not every sequence was tried)" : ""}.
      </div>
      {#if r.violations.length === 0 && r.faults.length === 0}
        <div class="ok">{exps.length ? "Every expectation held" : "No expectations to check"}{r.truncated ? " in the sequences tried" : ""}, no shorts, no chatter.</div>
      {/if}
      {#each r.violations as v (v.rule.id)}
        <div class="bad">
          {v.rule.kind === "never" ? "Happens" : "Fails"}: {describeExpectation(editor.project, v.rule, list)}, after:
          <ol>{#each v.path as act, i (i)}<li>{sim.describe(act)}</li>{/each}</ol>
          {#if !v.path.length}<div>(from the start)</div>{/if}
          <button class="small" onclick={() => sim.replay(v.path)}>Replay</button>
        </div>
      {/each}
      {#each r.faults as f, i (i)}
        <div class="bad">
          {f.kind === "short" ? "Short circuit" : "Relays chatter"} after:
          <ol>{#each f.path as act, j (j)}<li>{sim.describe(act)}</li>{/each}</ol>
          <button class="small" onclick={() => sim.replay(f.path)}>Replay</button>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .sim {
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
  }
  .clock {
    display: flex;
    gap: 4px;
    align-items: center;
    flex-wrap: wrap;
  }
  .clock strong {
    min-width: 4.5em;
  }
  .sub {
    font-weight: 600;
    font-size: 12px;
    margin-top: 8px;
    color: #334;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .go {
    border: none;
    background: none;
    padding: 0;
    text-align: left;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
  }
  .where {
    font-size: 11px;
    color: #778;
    white-space: nowrap;
  }
  .op {
    min-width: 54px;
    font-size: 12px;
    padding: 1px 6px;
  }
  .op.on {
    background: #e3f5e6;
    border-color: #1a8f3a;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1px solid #889;
    flex: none;
  }
  .box {
    width: 10px;
    height: 10px;
    border: 1px solid #889;
    flex: none;
  }
  .box.on {
    background: #8a94a6;
  }
  .box.ok {
    border-color: #1a8f3a;
    background: #bfe6c8;
  }
  .box.ok.on {
    background: #1a8f3a;
  }
  .box.bad {
    border-color: #c62828;
    background: #f5c2c2;
  }
  .box.bad.on {
    background: #c62828;
  }
  .box.wait {
    border-style: dashed;
  }
  .dev {
    font-size: 12px;
    font-weight: 600;
    margin-top: 2px;
  }
  .dot.on {
    background: #1a8f3a;
    border-color: #1a8f3a;
  }
  .fault,
  .bad {
    background: #fdecec;
    border: 1px solid #e3a5a5;
    padding: 6px 8px;
    border-radius: 4px;
    font-size: 12px;
  }
  .ok {
    color: #1a6f2e;
  }
  .result {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 12px;
  }
  ol {
    margin: 4px 0;
    padding-left: 20px;
  }
  .add {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .hint {
    font-size: 12px;
    color: #667;
    margin: 0;
  }
  button.small {
    font-size: 11px;
    padding: 1px 6px;
  }
  .inc {
    font-size: 12px;
    display: flex;
    gap: 4px;
    align-items: center;
  }
  .rule {
    font-size: 12px;
    align-items: flex-start;
  }
  .rule .box {
    margin-top: 2px;
  }
  .load {
    font-variant-numeric: tabular-nums;
    font-size: 12px;
  }
  .load.over {
    color: #c00;
    font-weight: 600;
  }
</style>
