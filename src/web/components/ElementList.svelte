<script lang="ts">
  import { columnOf } from "../../core/geometry";
  import { resolveFields } from "../../core/fields";
  import { requireSymbol } from "../../core/symbols";
  import { displayTag } from "../../core/tags";
  import type { Editor } from "../editor.svelte";

  /** Everything on the current sheet, synced with the canvas selection (DESIGN.md §11). */
  let { editor }: { editor: Editor } = $props();

  let filter = $state("");
  let list: HTMLDivElement | undefined = $state();

  type Row = { id: string; tag: string; type: string; label: string; col: number; y: number };

  const rows = $derived.by((): Row[] => {
    const page = editor.page;
    const out: Row[] = page.elements
      .filter((e) => e.symbol !== "junction")
      .map((e) => ({
        id: e.id,
        tag: displayTag(e, editor.project),
        type: requireSymbol(e.symbol).name,
        label: resolveFields(e.label, editor.project) || (e.symbol === "rail" || e.symbol === "busbar" ? String(e.params.name ?? "") : ""),
        col: columnOf(e.pos[0]),
        y: e.pos[1],
      }));
    for (const s of page.sections) {
      out.push({ id: s.id, tag: "", type: "Section box", label: resolveFields(s.label, editor.project), col: columnOf(s.rect[0]), y: s.rect[1] });
    }
    out.sort((a, b) => a.col - b.col || a.y - b.y);
    const f = filter.trim().toLowerCase();
    return f ? out.filter((r) => `${r.tag} ${r.type} ${r.label}`.toLowerCase().includes(f)) : out;
  });

  const selected = $derived(new Set(editor.selection));

  // Keep the selected row in view when it's selected on the canvas.
  $effect(() => {
    const first = editor.selection[0];
    if (!first || !list) return;
    list.querySelector(`[data-id="${first}"]`)?.scrollIntoView({ block: "nearest" });
  });

  function pick(e: MouseEvent, id: string) {
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      editor.selection = selected.has(id) ? editor.selection.filter((x) => x !== id) : [...editor.selection, id];
    } else {
      editor.selection = [id];
    }
    editor.tool = "select";
    editor.placeSymbol = null;
  }
</script>

<div class="elist">
  <div class="head">
    <span>On this sheet ({rows.length})</span>
    <input bind:value={filter} placeholder="Filter" />
  </div>
  <div class="rows" bind:this={list}>
    {#each rows as r (r.id)}
      <button class="row" class:sel={selected.has(r.id)} data-id={r.id} onclick={(e) => pick(e, r.id)} title="Column {r.col}">
        <span class="tag">{r.tag || "–"}</span>
        <span class="type">{r.label || r.type}</span>
        <span class="col">{r.col}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .elist {
    display: flex;
    flex-direction: column;
    min-height: 0;
    max-height: 38vh;
    border-bottom: 1px solid #cfd4d8;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px 4px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #667;
  }
  .head input {
    flex: 1;
    min-width: 0;
    font-size: 12px;
    padding: 2px 6px;
    text-transform: none;
  }
  .rows {
    overflow-y: auto;
    padding: 0 6px 6px;
  }
  .row {
    width: 100%;
    display: grid;
    grid-template-columns: 5.5em 1fr 2em;
    gap: 6px;
    text-align: left;
    border: 1px solid transparent;
    background: none;
    padding: 2px 4px;
    font-size: 12px;
    justify-items: start;
  }
  .row span {
    text-align: left;
    width: 100%;
  }
  .row:hover {
    background: #f0f2f4;
  }
  .row.sel {
    background: #e8f0fd;
    border-color: #1e6ee6;
  }
  .tag {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .type {
    color: #445;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .col {
    color: #889;
    text-align: right;
  }
</style>
