<script lang="ts">
  import { SHEET_MM } from "../../core/geometry";
  import type { Editor } from "../editor.svelte";
  import Sheet from "./Sheet.svelte";

  /**
   * The other half of the split view (DESIGN.md §11): another sheet, shown
   * for reference. Click it to work on it; the two halves swap.
   */
  let { editor }: { editor: Editor } = $props();

  const page = $derived(editor.project.pages.find((p) => p.id === editor.splitPageId) ?? null);
</script>

<div class="split">
  <div class="bar">
    <select
      value={editor.splitPageId ?? ""}
      onchange={(e) => (editor.splitPageId = e.currentTarget.value || null)}
    >
      {#each editor.project.pages as p (p.id)}
        <option value={p.id}>{p.number} {p.title}</option>
      {/each}
    </select>
    <button onclick={() => editor.swapSplit()} title="Work on this sheet">Edit this sheet</button>
    <button onclick={() => (editor.splitPageId = null)} title="Close the split view">✕</button>
  </div>
  {#if page}
    <button class="view" onclick={() => editor.swapSplit()} title="Click to work on this sheet">
      <svg viewBox="-3 -3 {SHEET_MM.w + 6} {SHEET_MM.h + 6}" preserveAspectRatio="xMidYMid meet">
        <Sheet project={editor.project} {page} />
      </svg>
    </button>
  {/if}
</div>

<style>
  .split {
    display: flex;
    flex-direction: column;
    height: 100%;
    border-left: 2px solid #b9c0c6;
    background: #d8dcdf;
  }
  .bar {
    display: flex;
    gap: 6px;
    padding: 4px 6px;
    background: #f4f5f6;
    border-bottom: 1px solid #cfd4d8;
  }
  .bar select {
    flex: 1;
    min-width: 0;
  }
  .view {
    flex: 1;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    min-height: 0;
  }
  .view svg {
    width: 100%;
    height: 100%;
    display: block;
  }
</style>
