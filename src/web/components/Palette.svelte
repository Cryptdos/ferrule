<script lang="ts">
  import { listSymbols } from "../../core/symbols";
  import type { Editor } from "../editor.svelte";
  import Icon from "./Icon.svelte";
  import type { IconName } from "../icons";
  import SymbolIcon from "./SymbolIcon.svelte";

  let { editor }: { editor: Editor } = $props();

  let filter = $state("");

  /** One entry in the list: a part to place, or (in Annotate) a drawing tool. */
  interface Item {
    key: string;
    name: string;
    group: string;
    symbol?: string;
    icon?: IconName;
    params?: Record<string, string>;
    tool?: "section" | "cloud" | "polygon";
  }

  /**
   * Each workbench shows only its own parts: electrics in Draft; in Annotate,
   * text, boxes and plates with the section, cloud, picture and logo (T2).
   */
  const all = $derived.by((): Item[] => {
    const annotate = editor.mode === "annotate";
    const parts: Item[] = listSymbols()
      .filter((s) => s.palette && (s.bench ?? "draft") === (annotate ? "annotate" : "draft"))
      .map((s): Item =>
        // A polygon is drawn corner by corner with its own tool, not placed in one click.
        s.id === "polygon"
          ? { key: "tool:polygon", name: s.name, group: s.group, symbol: s.id, tool: "polygon" }
          : { key: s.id, name: s.name, group: s.group, symbol: s.id, icon: s.id === "image" ? "picture" : undefined },
      );
    if (!annotate) return parts;
    return [
      { key: "tool:section", name: "Section", group: "Drawing", icon: "section", tool: "section" },
      { key: "tool:cloud", name: "Revision cloud", group: "Drawing", icon: "cloud", tool: "cloud" },
      ...parts,
    ];
  });
  /** Shown by name first: the name says what a part is; the small picture is a reminder. */
  const groups = $derived.by(() => {
    const q = filter.trim().toLowerCase();
    const out = new Map<string, Item[]>();
    for (const s of all) {
      if (q && !`${s.name} ${s.group} ${s.key}`.toLowerCase().includes(q)) continue;
      out.set(s.group, [...(out.get(s.group) ?? []), s]);
    }
    return [...out];
  });

  function isActive(it: Item): boolean {
    if (it.tool) return editor.tool === it.tool;
    return editor.tool === "place" && editor.placeSymbol === it.symbol;
  }

  function pick(it: Item) {
    if (isActive(it)) {
      editor.tool = "select";
      editor.placeSymbol = null;
    } else if (it.tool) {
      editor.tool = it.tool;
      editor.placeSymbol = null;
      if (it.tool === "polygon") editor.flash("Click each corner. Click the first corner again, double-click or press Enter to close it.");
    } else {
      editor.tool = "place";
      editor.placeSymbol = it.symbol!;
      // Start clean: nothing carried over from the last thing placed (e.g. a plant view).
      editor.placeParams = { ...(it.params ?? {}) };
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
        if (first) pick(first);
      } else if (e.key === "Escape") {
        filter = "";
        e.currentTarget.blur();
      }
    }}
  />
  {#each groups as [group, symbols] (group)}
    <div class="title">{group}</div>
    {#each symbols as s (s.key)}
      <button class="sym" class:active={isActive(s)} title={s.tool ? `Draw: ${s.name}` : `Place: ${s.name}`} onclick={() => pick(s)}>
        <span class="icon">{#if s.icon}<Icon name={s.icon} size={16} />{:else}<SymbolIcon symbol={s.symbol!} size={18} />{/if}</span>
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
