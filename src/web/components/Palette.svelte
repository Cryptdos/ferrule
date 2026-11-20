<script lang="ts">
  import { listSymbols } from "../../core/symbols";
  import type { Editor } from "../editor.svelte";
  import SymbolIcon from "./SymbolIcon.svelte";

  let { editor }: { editor: Editor } = $props();

  const groups = (() => {
    const out = new Map<string, ReturnType<typeof listSymbols>>();
    for (const s of listSymbols()) {
      if (!s.palette) continue;
      out.set(s.group, [...(out.get(s.group) ?? []), s]);
    }
    return [...out];
  })();

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
  {#each groups as [group, symbols] (group)}
    <div class="group">
      <div class="title">{group}</div>
      <div class="items">
        {#each symbols as s (s.id)}
          <button
            class="sym"
            class:active={editor.tool === "place" && editor.placeSymbol === s.id}
            title={s.name}
            onclick={() => pick(s.id)}
          >
            <SymbolIcon symbol={s.id} />
          </button>
        {/each}
      </div>
    </div>
  {/each}
</div>

<style>
  .palette {
    padding: 6px 8px;
  }
  .title {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #667;
    margin: 6px 0 3px;
  }
  .items {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }
  .sym {
    width: 38px;
    height: 38px;
    padding: 3px;
    display: grid;
    place-items: center;
    background: #fff;
    border: 1px solid #cfd4d8;
    border-radius: 4px;
    cursor: pointer;
  }
  .sym:hover {
    border-color: #889;
  }
  .sym.active {
    border-color: #1e6ee6;
    background: #e8f0fd;
    box-shadow: 0 0 0 1px #1e6ee6;
  }
</style>
