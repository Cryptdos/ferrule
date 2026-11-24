<script lang="ts">
  /**
   * To draw (design-v0.4 §8): what Design has that isn't on a sheet yet,
   * field plant and modules. Pick a line and place it on the open sheet in
   * Draft: its tag, pins and channel labels come from the data. A point
   * with no pins gets them first, from a suggestion you edit.
   */
  import { channelText, needsPins, suggestPins, toDraw, type ToDraw } from "../../core/design";
  import { moduleTypeName } from "../../core/modules";
  import { plantLabel, setQuickEntry } from "../../core/ops";
  import { startPlacing } from "../placing";
  import { describeInterlock, interlockStatus } from "../../core/interlocks";
  import type { Editor } from "../editor.svelte";

  let { editor }: { editor: Editor } = $props();

  const lists = $derived(toDraw(editor.project));
  const plantLeft = $derived(lists.plant.filter((x) => !x.sheets.length));
  const plantDone = $derived(lists.plant.filter((x) => x.sheets.length));
  const modsLeft = $derived(lists.modules.filter((x) => !x.sheets.length));
  const modsDone = $derived(lists.modules.filter((x) => x.sheets.length));
  /** Interlocks, and whether each is proved. */
  const interlocks = $derived.by(() => {
    const st = interlockStatus(editor.project, editor.proofs);
    return editor.project.plant.flatMap((plant) => (plant.interlocks ?? []).map((il) => ({ plant, il, st: st.get(il.id) })));
  });
  const total = $derived(lists.plant.length + lists.modules.length);
  const proveAll = () => void editor.proveInterlocks();
  const left = $derived(plantLeft.length + modsLeft.length);

  /** The plant whose pins are being given, and the line being edited. */
  let pinning: { id: string; spec: string } | null = $state(null);

  const channels = (t: ToDraw) =>
    (t.item.points ?? [])
      .filter((p) => p.channel)
      .map((p) => channelText(editor.project, p.channel))
      .join(", ");
  const unallocated = (t: ToDraw) => (t.item.points ?? []).some((p) => !p.channel && p.goesTo !== "panel" && ["contact", "powered-out", "dry-in", "powered-in", "analogue-in", "analogue-out"].includes(p.form));
  const sheets = (n: number[]) => (n.length === 1 ? `sheet ${n[0]}` : `sheets ${n.join(", ")}`);

  function place(t: ToDraw) {
    if (needsPins(t.item)) {
      pinning = { id: t.item.id, spec: suggestPins(t.item) };
      return;
    }
    startPlacing(editor, t.item);
  }

  function pinAndPlace(e: SubmitEvent) {
    e.preventDefault();
    if (!pinning) return;
    const { id, spec } = pinning;
    if (!editor.apply((p) => setQuickEntry(p, id, spec))) return;
    pinning = null;
    const item = editor.project.plant.find((p) => p.id === id);
    if (!item) return;
    if (needsPins(item)) {
      editor.flash("Every point needs a pin: give the ones left out their pins");
      pinning = { id, spec: suggestPins(item) };
      return;
    }
    startPlacing(editor, item);
  }
</script>

<div class="todraw">
  <div class="head"><span class="title">To draw</span><span class="hint">{left} left of {total}</span></div>
  <div class="scroll">
    <div class="group">Field plant <span class="hint">{plantLeft.length} of {lists.plant.length} left</span></div>
    {#each plantLeft as t (t.item.id)}
      <div class="row">
        <span class="dot" title="Not drawn yet">●</span>
        <strong>{plantLabel(t.item)}</strong>
        <span class="what">{t.item.description || "—"}{#if channels(t)}<span class="dim"> → {channels(t)}</span>{/if}{#if unallocated(t)}<span class="dim"> · not all allocated</span>{/if}</span>
        <button onclick={() => place(t)} title={needsPins(t.item) ? "Give it pins, then place it on a sheet in Draft" : "Place it on the open sheet in Draft"}>Place on sheet</button>
      </div>
      {#if pinning?.id === t.item.id}
        <form class="pins" onsubmit={pinAndPlace}>
          <label>Pins for {plantLabel(t.item)}, from its datasheet
            <!-- svelte-ignore a11y_autofocus -->
            <input bind:value={pinning.spec} autofocus />
          </label>
          <p class="hint">Each point and its pin numbers, <code>|</code> between: <code>enable: 1 2 | fault: 11 14</code>. These are numbered for you only as a start; the same number can be in two points (a shared common).</p>
          <div class="buttons"><button type="submit" class="primary">Give pins, then place</button><button type="button" onclick={() => (pinning = null)}>Cancel</button></div>
        </form>
      {/if}
    {/each}
    {#if plantDone.length}
      <div class="row done">
        <span class="tick">✓</span>
        <span class="tags">{plantDone.map((t) => plantLabel(t.item)).join(", ")}</span>
        <span class="dim">drawn</span>
      </div>
      <details>
        <summary class="hint">Drawn plant, with where: place another view</summary>
        {#each plantDone as t (t.item.id)}
          <div class="row sub">
            <span></span><strong>{plantLabel(t.item)}</strong><span class="dim">{sheets(t.sheets)}</span>
            <button onclick={() => startPlacing(editor, t.item)} title="Another view of it, showing chosen terminals">Place another view</button>
          </div>
        {/each}
      </details>
    {/if}
    {#if !lists.plant.length && !lists.network.length}<p class="hint pad">No field plant in Design yet.</p>{/if}

    {#if lists.network.length}
      <div class="group">On the network <span class="hint">comms only: drawn on the network sheet, not a schematic</span></div>
      {#each lists.network as t (t.item.id)}
        <div class="row">
          {#if t.net}<span class="tick">✓</span>{:else}<span class="amber" title="Not on a network">●</span>{/if}
          <strong>{plantLabel(t.item)}</strong>
          <span class="what">{t.item.description || "—"}<span class={t.net ? "dim" : "amber"}>{` · ${t.net ?? "not on a network"}`}</span></span>
          <button onclick={() => ((editor.designView = "network"), (editor.designPick = { plant: [t.item.id] }))} title="Design's Network view">Show</button>
        </div>
      {/each}
    {/if}

    <div class="group">Modules <span class="hint">{modsLeft.length} of {lists.modules.length} left</span></div>
    {#each modsLeft as t (t.item.id)}
      <div class="row">
        <span class="dot" title="Not drawn yet">●</span>
        <strong>{plantLabel(t.item)}</strong>
        <span class="what">{moduleTypeName(t.item.module!)}{t.item.module?.model ? ` · ${t.item.module.model}` : ""}{!t.item.terminals.length ? " · no pins yet: Controller… → Generate" : ""}</span>
        <button disabled={!t.item.terminals.length} onclick={() => startPlacing(editor, t.item)} title="Place it at the top of a sheet in Draft, terminals underneath">Place on sheet</button>
      </div>
    {/each}
    {#each modsDone as t (t.item.id)}
      <div class="row">
        <span class="tick">✓</span>
        <strong>{plantLabel(t.item)}</strong>
        <span class="what dim">{moduleTypeName(t.item.module!)} · {sheets(t.sheets)}</span>
        <button onclick={() => startPlacing(editor, t.item)} title="Another view of it: tick the channels each view shows, to split it across sheets">Place another view</button>
      </div>
    {/each}
    {#if !lists.modules.length}<p class="hint pad">No controller modules yet.</p>{/if}

    {#if interlocks.length}
      <div class="group il">
        <span>Interlocks <span class="hint">proved in Simulate · {interlocks.filter((x) => x.st?.kind !== "proved").length} not yet</span></span>
        {#if editor.proving}<span class="hint">Proving {editor.proving.done + 1} of {editor.proving.total}…</span> <button onclick={() => editor.cancelProving()}>Cancel</button>{:else if interlocks.some((x) => x.st?.kind === "unchecked")}<button onclick={proveAll}>Prove all</button>{/if}
      </div>
      {#each interlocks as x (x.il.id)}
        <div class="row il">
          {#if x.st?.kind === "proved"}<span class="tick">✓</span>{:else if x.st?.kind === "never-on"}<span class="amber">●</span>{:else}<span class="dot">●</span>{/if}
          <span class="ilname">{describeInterlock(editor.project, x.plant, x.il)}</span>
          <span class="dim">
            {#if x.st?.kind === "proved"}proved
            {:else if x.st?.kind === "fails"}fails: Check logic in Simulate shows how
            {:else if x.st?.kind === "never-on"}<span class="amber">never on: is it powered?</span>
            {:else if x.st?.kind === "not-drawn"}not yet: {x.st.what} isn't drawn
            {:else if x.st?.kind === "unknown"}not proved: too many sequences to try them all
            {:else}not proved yet: Prove all, or Check logic in Simulate{/if}
          </span>
          <button onclick={() => (editor.designView = "table", editor.designPick = { plant: [x.plant.id] })}>Show</button>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .todraw {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: #fff;
    border: 1px solid #dde1e5;
    border-radius: 6px;
  }
  .head {
    display: flex;
    justify-content: space-between;
    padding: 8px 12px;
    border-bottom: 1px solid #e3e6e9;
  }
  .title {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #334;
  }
  .scroll {
    overflow: auto;
    flex: 1;
  }
  .group {
    padding: 6px 12px;
    background: #f1f3f6;
    font-weight: 600;
    font-size: 13px;
    border-bottom: 1px solid #e3e6e9;
  }
  .row {
    display: grid;
    grid-template-columns: 1.5em 9em 1fr auto;
    align-items: center;
    gap: 8px;
    padding: 4px 12px;
    border-bottom: 1px solid #f0f1f3;
    font-size: 13px;
    min-height: 34px;
  }
  .group.il {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .row.il {
    grid-template-columns: 1.5em minmax(14em, 1fr) 1fr auto;
  }
  .ilname {
    font-weight: 600;
  }
  .row.done {
    grid-template-columns: 1.5em 1fr auto;
  }
  .row.sub {
    background: #fafbfc;
  }
  .dot {
    color: #b00;
    font-size: 11px;
  }
  .tick {
    color: #1d6b2c;
  }
  .amber {
    color: #b36b00;
  }
  .tags {
    font-weight: 600;
  }
  .what {
    color: #556;
  }
  .dim {
    color: #889;
  }
  details summary {
    padding: 4px 12px;
    cursor: pointer;
  }
  .pins {
    padding: 8px 12px 10px 3em;
    background: #f7f9fc;
    border-bottom: 1px solid #e3e6e9;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .pins label {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 12px;
    color: #445;
  }
  .pins input {
    font-family: ui-monospace, Consolas, monospace;
  }
  .buttons {
    display: flex;
    gap: 6px;
  }
  .primary {
    background: #1e6ee6;
    border-color: #1e6ee6;
    color: #fff;
  }
  .hint {
    font-size: 12px;
    color: #778;
    font-weight: normal;
    margin: 0;
  }
  .hint.pad {
    padding: 10px 12px;
  }
</style>
