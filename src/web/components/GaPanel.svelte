<script lang="ts">
  import { addGaPage } from "../../core/ops";
  import { fitScale, gaCandidates, GA_SCALES } from "../../core/ga";
  import { displayTag } from "../../core/tags";
  import type { Editor } from "../editor.svelte";

  /** GA workbench, left side: a new GA sheet, or the schematic's devices still to place. */
  let { editor }: { editor: Editor } = $props();

  const page = $derived(editor.page);
  const candidates = $derived(gaCandidates(editor.project, (el) => displayTag(el, editor.project)));
  const forView = $derived(candidates.filter((c) => (page.ga?.view === "door") === c.door));
  const others = $derived(candidates.length - forView.length);

  let w = $state(600);
  let h = $state(800);
  let view: "backplate" | "door" = $state("backplate");
  let scale = $state(0);
  const autoScale = $derived(fitScale(w, h));

  function create(e: SubmitEvent) {
    e.preventDefault();
    let id = "";
    const settings = { scale: scale || autoScale, enclosure: { w, h }, view };
    if (editor.apply((p) => (id = addGaPage(p, "", settings, editor.pageId).id))) {
      editor.setPage(id);
      editor.mode = "ga";
    }
  }
</script>

<div class="ga-panel">
  {#if !page.ga}
    <div class="title">New GA sheet</div>
    <p class="hint">A general arrangement: the panel's backplate or door at true scale, with the devices from the schematic.</p>
    <form onsubmit={create}>
      <label>Width (mm) <input type="number" min="50" step="10" bind:value={w} /></label>
      <label>Height (mm) <input type="number" min="50" step="10" bind:value={h} /></label>
      <label>
        View
        <select bind:value={view}>
          <option value="backplate">Backplate</option>
          <option value="door">Door</option>
        </select>
      </label>
      <label>
        Scale
        <select bind:value={scale}>
          <option value={0}>Fit (1:{autoScale})</option>
          {#each GA_SCALES as s (s)}<option value={s}>1:{s}</option>{/each}
        </select>
      </label>
      <button type="submit">Add GA sheet after this one</button>
    </form>
  {:else}
    <div class="title">To place ({forView.length})</div>
    <p class="hint">
      Click one, then click on the {page.ga.view}. Devices snap onto a DIN rail. Sizes are generic until you pick a real device for a part from the device table (in its properties).
      {#if others}{others} more go on the {page.ga.view === "door" ? "backplate" : "door"}.{/if}
    </p>
    {#each forView as c (c.refs.join(","))}
      <button
        class="cand"
        class:active={editor.gaPlace?.refs.join(",") === c.refs.join(",")}
        onclick={() => {
          editor.tool = "select";
          editor.gaPlace = editor.gaPlace?.refs.join(",") === c.refs.join(",") ? null : { refs: c.refs, w: c.w, h: c.h, label: c.label };
        }}
        title="{c.w} × {c.h} mm"
      >
        <span>{c.label}</span><span class="dim">sh {c.sheet} · {c.w}×{c.h}</span>
      </button>
    {:else}
      <p class="hint">Everything from the schematic for the {page.ga.view} is on a GA.</p>
    {/each}
  {/if}
</div>

<style>
  .ga-panel {
    padding: 6px 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .title {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #778;
    margin: 6px 0 2px;
  }
  .hint {
    font-size: 12px;
    color: #667;
    margin: 0 0 6px;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 12px;
  }
  form label {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .cand {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    text-align: left;
    font-size: 12px;
    padding: 3px 6px;
  }
  .cand.active {
    border-color: #1e6ee6;
    background: #e8f0fd;
  }
  .dim {
    color: #889;
    white-space: nowrap;
  }
</style>
