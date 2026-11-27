<script lang="ts">
  import { allDetails, frameOf, gaCandidates, sheetTakes } from "../../core/ga";
  import type { GaItem } from "../../core/model";
  import { displayTag } from "../../core/tags";
  import type { Editor } from "../editor.svelte";
  import Icon from "./Icon.svelte";

  /**
   * Layout workbench, the browser's lower section: the GA tools (DIN rail,
   * trunking, dimension, label plate). Layout only works on a GA sheet
   * (v0.5 A35); a new one is added from the sheets' ▾ menu (A33). Parts
   * from the schematic are placed from *Place parts…*.
   */
  let { editor, onplace }: { editor: Editor; onplace?: () => void } = $props();

  const page = $derived(editor.page);
  const left = $derived(gaCandidates(editor.project, (el) => displayTag(el, editor.project)).length);
  const unshown = $derived(allDetails(editor.project).filter((d) => !frameOf(editor.project, d.it.id)).length);

  type ToolKey = "ga-rail" | "ga-trunking" | "ga-dim" | "ga-label" | "ga-detail" | "ga-device";
  const TOOLS: { tool: ToolKey; kind: GaItem["kind"]; name: string; icon: "rail" | "trunking" | "dimension" | "plate" | "detail"; how: string }[] = [
    { tool: "ga-rail", kind: "rail", name: "DIN rail", icon: "rail", how: "Drag along where it goes (35 mm)." },
    { tool: "ga-trunking", kind: "trunking", name: "Trunking", icon: "trunking", how: "Drag out its size." },
    { tool: "ga-dim", kind: "dim", name: "Dimension", icon: "dimension", how: "Click each point (it snaps to edges and middles), then double-click where the line goes." },
    { tool: "ga-label", kind: "label", name: "Label plate", icon: "plate", how: "Click where it goes on the door; set its text and size in its properties." },
    { tool: "ga-device", kind: "device", name: "Device (no schematic part)", icon: "plate", how: "Click where it goes: an operator screen and the like, on no schematic. Set its name, tag, size and cut-out in its properties." },
    { tool: "ga-detail", kind: "detail", name: "Detail", icon: "detail", how: "Drag a box round an area to show it larger on a detail sheet; give it a title in its properties." },
  ];
  const active = $derived(TOOLS.find((t) => t.tool === editor.tool));

</script>

<div class="ga-panel">
  {#if page.ga}
    {#each TOOLS as t (t.tool)}
      {@const ok = sheetTakes(editor.project, page, t.kind)}
      <button
        class="tool"
        class:active={editor.tool === t.tool}
        disabled={!ok}
        title={ok ? t.how : page.ga?.view === "detail" ? "A detail sheet holds frames: Place detail…" : t.kind === "label" ? "Label plates go on a door front" : t.kind === "dim" ? "" : "Rail and trunking go on the backplate or the door back"}
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
    {#if page.ga.view === "detail"}
      <div class="title">Details</div>
      <p class="hint">
        {#if unshown}{unshown} detail{unshown === 1 ? "" : "s"} not shown yet.{:else}Every detail is shown.{/if}
        <button class="link-btn" onclick={() => onplace?.()}>Place detail…</button>
      </p>
    {:else}
    <div class="title">From the schematic</div>
    <p class="hint">
      {#if left}{left} part{left === 1 ? "" : "s"} not on a GA yet.{:else}Everything from the schematic is on a GA.{/if}
      <button class="link-btn" onclick={() => onplace?.()}>Place parts…</button>
    </p>
    {/if}
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
