<script lang="ts">
  import { addGaPage } from "../../core/ops";
  import { doorLeaves, fitScale, gaCandidates, GA_SCALES, sheetTakes, VIEW_NAMES } from "../../core/ga";
  import type { GaItem, GaSettings, GaView } from "../../core/model";
  import { displayTag } from "../../core/tags";
  import type { Editor } from "../editor.svelte";
  import Icon from "./Icon.svelte";

  /**
   * GA workbench, the browser's lower section: on a GA sheet, the GA tools
   * (DIN rail, trunking, dimension, label plate); on any other sheet, a new
   * GA sheet. Parts from the schematic are placed from *Place parts…*.
   */
  let { editor, onplace }: { editor: Editor; onplace?: () => void } = $props();

  const page = $derived(editor.page);
  const left = $derived(gaCandidates(editor.project, (el) => displayTag(el, editor.project)).length);

  type ToolKey = "ga-rail" | "ga-trunking" | "ga-dim" | "ga-label";
  const TOOLS: { tool: ToolKey; kind: GaItem["kind"]; name: string; icon: "rail" | "trunking" | "dimension" | "plate"; how: string }[] = [
    { tool: "ga-rail", kind: "rail", name: "DIN rail", icon: "rail", how: "Drag along where it goes (35 mm)." },
    { tool: "ga-trunking", kind: "trunking", name: "Trunking", icon: "trunking", how: "Drag out its size." },
    { tool: "ga-dim", kind: "dim", name: "Dimension", icon: "dimension", how: "Click each point (it snaps to edges and middles), then double-click where the line goes." },
    { tool: "ga-label", kind: "label", name: "Label plate", icon: "plate", how: "Click where it goes on the door; set its text and size in its properties." },
  ];
  const active = $derived(TOOLS.find((t) => t.tool === editor.tool));

  // A new GA sheet.
  const doorFronts = $derived(editor.project.pages.filter((p) => p.ga?.view === "door-front" && !p.ga.of));
  let w = $state(600);
  let h = $state(800);
  let view: GaView = $state("backplate");
  /** Door views: their own door, or one drawn on another sheet. */
  let of = $state("");
  let leaves = $state<1 | 2>(1);
  let leaf: "" | "0" | "1" = $state("");
  let scale: number | null = $state(null);
  const owner = $derived(of ? doorFronts.find((p) => p.id === of) : undefined);
  const ownerLeaves = $derived(owner ? doorLeaves(owner) : []);
  const size = $derived(owner ? owner.ga!.enclosure : { w, h });
  const shownW = $derived(leaf !== "" && ownerLeaves.length > 1 ? ownerLeaves[Number(leaf)]!.w : leaf !== "" && leaves === 2 && !owner ? w / 2 : size.w);
  const autoScale = $derived(fitScale(shownW, size.h));
  $effect(() => {
    // A door back is always of a door front: start with the one before this sheet.
    if (view === "door-back" && !of) of = [...doorFronts].reverse().find((p) => p.number <= page.number)?.id ?? doorFronts[0]?.id ?? "";
    if (view === "backplate") of = "";
  });

  function create(e: SubmitEvent) {
    e.preventDefault();
    let id = "";
    const settings: GaSettings = { scale: scale || autoScale, enclosure: { ...size }, view };
    if (view !== "backplate" && of) settings.of = of;
    if (view === "door-front" && !of && leaves === 2)
      settings.leaves = [
        { w: w / 2, hinge: "left" },
        { w: w / 2, hinge: "right" },
      ];
    if (view !== "backplate" && leaf !== "") settings.leaf = Number(leaf) as 0 | 1;
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
      <label>
        View
        <select bind:value={view}>
          {#each Object.entries(VIEW_NAMES) as [v, name] (v)}<option value={v}>{name}</option>{/each}
        </select>
      </label>
      {#if view !== "backplate"}
        <label>
          Door
          <select bind:value={of}>
            {#if view === "door-front"}<option value="">A new door, laid out on this sheet</option>{/if}
            {#each doorFronts as d (d.id)}<option value={d.id}>The door on sheet {d.number}{d.title ? `: ${d.title}` : ""}</option>{/each}
          </select>
        </label>
        {#if view === "door-back" && !doorFronts.length}<p class="hint warn">Add the door front first: the back is drawn from it.</p>{/if}
      {/if}
      {#if !owner}
        <label>Width (mm) <input type="number" min="50" step="10" bind:value={w} /></label>
        <label>Height (mm) <input type="number" min="50" step="10" bind:value={h} /></label>
      {/if}
      {#if view === "door-front" && !owner}
        <label>
          Leaves
          <select bind:value={leaves}>
            <option value={1}>One door</option>
            <option value={2}>Two doors (split down the middle; set each in Sheet)</option>
          </select>
        </label>
      {/if}
      {#if view !== "backplate" && (ownerLeaves.length > 1 || (!owner && leaves === 2))}
        <label>
          Shows
          <select bind:value={leaf}>
            <option value="">Both leaves, side by side</option>
            <option value="0">The left leaf (from the front)</option>
            <option value="1">The right leaf (from the front)</option>
          </select>
        </label>
      {/if}
      <label>
        Scale 1: (empty: the largest that fits, 1:{autoScale})
        <input type="number" min="0.5" step="0.5" list="ferrule-new-ga-scales" placeholder={String(autoScale)} bind:value={scale} />
        <datalist id="ferrule-new-ga-scales">{#each GA_SCALES as s (s)}<option value={s}></option>{/each}</datalist>
      </label>
      <button type="submit" disabled={view === "door-back" && !of}>Add GA sheet after this one</button>
    </form>
  {:else}
    {#each TOOLS as t (t.tool)}
      {@const ok = sheetTakes(editor.project, page, t.kind)}
      <button
        class="tool"
        class:active={editor.tool === t.tool}
        disabled={!ok}
        title={ok ? t.how : t.kind === "label" ? "Label plates go on a door front" : t.kind === "dim" ? "" : "Rail and trunking go on the backplate or the door back"}
        onclick={() => {
          editor.gaPlace = null;
          editor.tool = editor.tool === t.tool ? "select" : t.tool;
        }}
      >
        <Icon name={t.icon} size={16} /> <span>{t.name}</span>
      </button>
      {#if t.tool === "ga-dim" && editor.tool === "ga-dim"}
        <div class="styles" role="group" aria-label="Dimension style">
          <button class:active={editor.gaDimStyle === "chain"} onclick={() => (editor.gaDimStyle = "chain")} title="The gaps along a run">Chain</button>
          <button class:active={editor.gaDimStyle === "baseline"} onclick={() => (editor.gaDimStyle = "baseline")} title="Each distance from the first point, stacked">Baseline</button>
        </div>
      {/if}
    {/each}
    {#if active}<p class="hint">{active.how} Esc stops.</p>{/if}
    <div class="title">From the schematic</div>
    <p class="hint">
      {#if left}{left} part{left === 1 ? "" : "s"} not on a GA yet.{:else}Everything from the schematic is on a GA.{/if}
      <button class="link-btn" onclick={() => onplace?.()}>Place parts…</button>
    </p>
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
  .warn {
    color: #a60;
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
  .tool {
    display: flex;
    align-items: center;
    gap: 6px;
    text-align: left;
    font-size: 12px;
    padding: 2px 6px;
    background: none;
    border: 1px solid transparent;
    border-radius: 3px;
  }
  .tool:hover:not(:disabled) {
    background: #fff;
    border-color: #cfd4d8;
  }
  .tool.active {
    border-color: #1e6ee6;
    background: #e8f0fd;
  }
  .tool:disabled {
    opacity: 0.45;
  }
  .styles {
    display: flex;
    gap: 4px;
    margin: 0 0 2px 24px;
  }
  .styles button {
    font-size: 11px;
    padding: 1px 6px;
  }
  .styles button.active {
    border-color: #1e6ee6;
    background: #e8f0fd;
  }
  .link-btn {
    border: none;
    background: none;
    color: #1e6ee6;
    padding: 0;
    cursor: pointer;
    font-size: 12px;
  }
</style>
