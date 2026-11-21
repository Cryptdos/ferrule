<script lang="ts">
  import { listSymbols } from "../../core/symbols";
  import type { Editor } from "../editor.svelte";
  import SymbolIcon from "./SymbolIcon.svelte";

  let { editor }: { editor: Editor } = $props();

  let filter = $state("");

  /** Each workbench shows only its own parts: electrics in Draft, text and boxes in Annotate. */
  const all = $derived(listSymbols().filter((s) => s.palette && (s.bench ?? "draft") === (editor.mode === "annotate" ? "annotate" : "draft")));
  /** Shown by name first: the name says what a part is; the small picture is a reminder. */
  const groups = $derived.by(() => {
    const q = filter.trim().toLowerCase();
    const out = new Map<string, ReturnType<typeof listSymbols>>();
    for (const s of all) {
      if (q && !`${s.name} ${s.group} ${s.id}`.toLowerCase().includes(q)) continue;
      out.set(s.group, [...(out.get(s.group) ?? []), s]);
    }
    return [...out];
  });

  function pick(id: string) {
    if (editor.tool === "place" && editor.placeSymbol === id) {
      editor.tool = "select";
      editor.placeSymbol = null;
    } else {
      editor.tool = "place";
      editor.placeSymbol = id;
    }
  }
</script>

<div class="palette">
  <input
    class="filter"
    type="search"
    placeholder="Find a part…"
    bind:value={filter}
    onkeydown={(e) => {
      if (e.key === "Enter") {
        const first = groups[0]?.[1][0];
        if (first) pick(first.id);
      } else if (e.key === "Escape") {
        filter = "";
        e.currentTarget.blur();
      }
    }}
  />
  {#each groups as [group, symbols] (group)}
    <div class="title">{group}</div>
    {#each symbols as s (s.id)}
      <button
        class="sym"
        class:active={editor.tool === "place" && editor.placeSymbol === s.id}
        title="Place: {s.name}"
        onclick={() => pick(s.id)}
      >
        <span class="icon"><SymbolIcon symbol={s.id} size={18} /></span>
        <span class="name">{s.name}</span>
      </button>
    {/each}
  {/each}
  {#if !groups.length}<p class="none">No part matches “{filter}”.</p>{/if}
</div>

<style>
  .palette {
    padding: 6px 6px 10px;
    display: flex;
    flex-direction: column;
  }
  .filter {
    margin: 0 0 4px;
    font-size: 12px;
    padding: 3px 6px;
  }
  .title {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #778;
    margin: 6px 2px 1px;
  }
  .sym {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 1px 4px;
    min-height: 22px;
    background: none;
    border: 1px solid transparent;
    border-radius: 3px;
    cursor: pointer;
    text-align: left;
  }
  .sym:hover {
    background: #fff;
    border-color: #cfd4d8;
  }
  .sym.active {
    border-color: #1e6ee6;
    background: #e8f0fd;
  }
  .icon {
    flex: none;
    width: 18px;
    height: 18px;
    display: grid;
    place-items: center;
  }
  .name {
    font-size: 12px;
    line-height: 1.2;
    color: #223;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .none {
    font-size: 12px;
    color: #778;
  }
</style>
