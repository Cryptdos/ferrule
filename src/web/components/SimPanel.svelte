<script lang="ts">
  import { addRule, deleteRule } from "../../core/ops";
  import { displayTag } from "../../core/tags";
  import { resolveFields } from "../../core/fields";
  import { isMaster } from "../../core/xref";
  import type { Element } from "../../core/model";
  import type { Editor } from "../editor.svelte";
  import type { Simulator } from "../sim.svelte";

  let { editor, sim }: { editor: Editor; sim: Simulator } = $props();

  const all = $derived(editor.project.pages.flatMap((pg) => pg.elements.map((el) => ({ el, page: pg }))));
  const byId = $derived(new Map(all.map((x) => [x.el.id, x])));
  const name = (el: Element) => {
    const t = displayTag(el, editor.project);
    const l = resolveFields(el.label, editor.project);
    return [t, l].filter(Boolean).join(" ") || el.symbol;
  };
  const loads = $derived(all.filter(({ el }) => isMaster(el) || el.symbol === "lamp"));
  /** A plant group's input (plant:<id>:<group>) lives on the plant's first view. */
  const plantViewOf = (inputId: string) => {
    const m = /^plant:([^:]+):/.exec(inputId);
    return m ? all.find(({ el }) => el.symbol === "plant-view" && el.params.plant === m[1]) : undefined;
  };
  const s = $derived(sim.state);
  const on = (id: string) => !!s.energised[id] || !!s.lamps[id];

  let ruleA = $state("");
  let ruleB = $state("");
  let ruleKind: "never-both" | "never" = $state("never-both");
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
  <p class="hint">
    Click switches, selectors and field contacts on the drawing (outlined in orange). A push button is held while the mouse
    is down (Shift+click holds it until clicked again). Double-click a contact or link arrow to follow it.
  </p>

  <div class="sub">Inputs</div>
  {#each sim.circuit.inputs as i (i.el)}
    {@const x = byId.get(i.el) ?? plantViewOf(i.el)}
    {#if x}
      <div class="row">
        <button class="go" onclick={() => editor.goTo(x.el.id)} title="Show on the drawing">{byId.has(i.el) ? name(x.el) : (sim.circuit.names.get(i.el) ?? i.label)}</button>
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
    {/if}
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

  <div class="sub">Rules</div>
  <p class="hint">Ferrule tries every sequence of operations (and waiting for timers) to find one that breaks a rule.</p>
  {#each editor.project.rules as r (r.id)}
    {@const a = byId.get(r.a)}
    {@const b = r.b ? byId.get(r.b) : undefined}
    <div class="row rule">
      <span>{r.kind === "never" ? "Never" : "Never both"}: {a ? name(a.el) : "?"}{b ? ` + ${name(b.el)}` : ""}</span>
      <button class="danger small" onclick={() => editor.apply((p) => deleteRule(p, r.id))}>✕</button>
    </div>
  {/each}
  <div class="add">
    <select bind:value={ruleKind}>
      <option value="never-both">Never both on</option>
      <option value="never">Never on</option>
    </select>
    <select bind:value={ruleA}>
      <option value="">…</option>
      {#each loads as { el } (el.id)}<option value={el.id}>{name(el)}</option>{/each}
    </select>
    {#if ruleKind === "never-both"}
      <select bind:value={ruleB}>
        <option value="">…</option>
        {#each loads as { el } (el.id)}<option value={el.id}>{name(el)}</option>{/each}
      </select>
    {/if}
    <button
      onclick={() => {
        const [k, a, b] = [ruleKind, ruleA, ruleB];
        if (editor.apply((p) => addRule(p, k, a, k === "never-both" ? b : undefined))) {
          ruleA = "";
          ruleB = "";
        }
      }}>Add</button
    >
  </div>
  <label class="inc"><input type="checkbox" bind:checked={sim.includeIsolators} /> Also try opening isolators and breakers</label>
  <button onclick={() => sim.check(editor.project)} disabled={sim.searching}>
    {sim.searching ? "Searching…" : "Check logic"}
  </button>
  {#if sim.result}
    {@const r = sim.result}
    <div class="result">
      <div>
        Explored {r.states} states{r.truncated ? " (stopped at the limit; not every sequence was tried)" : ""}.
      </div>
      {#if r.violations.length === 0 && r.faults.length === 0}
        <div class="ok">No rule broken{r.truncated ? " in the sequences tried" : ""}, no shorts, no chatter.</div>
      {/if}
      {#each r.violations as v (v.rule.id)}
        {@const a = byId.get(v.rule.a)}
        {@const b = v.rule.b ? byId.get(v.rule.b) : undefined}
        <div class="bad">
          Broken: {a ? name(a.el) : "?"}{b ? ` and ${name(b.el)}` : ""} on together after:
          <ol>{#each v.path as act, i (i)}<li>{sim.describe(act)}</li>{/each}</ol>
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
  }
</style>
