<script lang="ts">
  /**
   * The main area's tiles (design-v0.3 §7): a split is two tiles side by side
   * or one above the other with a divider to drag; a leaf is a sheet view
   * with a small bar (its name, split right, split down, close). Every sheet
   * tile is a full, live canvas; the active one (outlined) is the one the
   * browser, Properties and the tools work on.
   */
  import type { Snippet } from "svelte";
  import type { Editor } from "../editor.svelte";
  import type { Simulator } from "../sim.svelte";
  import { setRatio, type TileNode } from "../tiles";
  import { canvases } from "../canvases";
  import { resolveFields } from "../../core/fields";
  import { floatNextAt } from "./Modal.svelte";
  import { isDockable, WINDOW_TITLES } from "../docking.svelte";
  import Canvas from "./Canvas.svelte";
  import Icon from "./Icon.svelte";
  import Tiles from "./Tiles.svelte";

  let {
    editor,
    node,
    sim = null,
    insetLeft = 0,
    window: windowBody,
  }: {
    editor: Editor;
    node: TileNode;
    sim?: Simulator | null;
    insetLeft?: number;
    /** What a window tile shows, by window name. */
    window?: Snippet<[string, string]>;
  } = $props();

  let box: HTMLDivElement | undefined = $state();
  let dragging = false;
  let tileEl: HTMLDivElement | undefined = $state();
  /** A window's tile being dragged out by its bar. */
  let pulling = $state(false);

  let canvas: Canvas | undefined = $state();
  $effect(() => {
    if (node.kind !== "leaf" || !canvas) return;
    const id = node.id;
    canvases.set(id, canvas);
    return () => {
      if (canvases.get(id) === canvas) canvases.delete(id);
    };
  });

  const sheetCount = $derived(editor.tiles.kind === "leaf" ? 1 : countSheets(editor.tiles));
  function countSheets(n: TileNode): number {
    return n.kind === "leaf" ? (n.content.type === "sheet" ? 1 : 0) : countSheets(n.a) + countSheets(n.b);
  }

  const name = $derived.by(() => {
    if (node.kind !== "leaf") return "";
    if (node.content.type === "window") return isDockable(node.content.name) ? WINDOW_TITLES[node.content.name] : node.content.name;
    const id = editor.tilePage(node.id);
    const i = editor.project.pages.findIndex((p) => p.id === id);
    const pg = editor.project.pages[i];
    return pg ? `${i + 1}  ${resolveFields(pg.title, editor.project) || "Untitled sheet"}` : "";
  });
</script>

{#if node.kind === "split"}
  <div class="split" class:col={node.dir === "col"} bind:this={box}>
    <div class="part" style:flex-basis="{node.ratio * 100}%">
      <Tiles {editor} node={node.a} {sim} {insetLeft} window={windowBody} />
    </div>
    <div
      class="divider"
      role="separator"
      aria-orientation={node.dir === "row" ? "vertical" : "horizontal"}
      aria-label="Drag to share the space between the tiles"
      onpointerdown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        dragging = true;
      }}
      onpointermove={(e) => {
        if (!dragging || !box || node.kind !== "split") return;
        const r = box.getBoundingClientRect();
        const f = node.dir === "row" ? (e.clientX - r.left) / r.width : (e.clientY - r.top) / r.height;
        editor.setTiles(setRatio(editor.tiles, node.id, f));
      }}
      onpointerup={() => (dragging = false)}
    ></div>
    <div class="part grow">
      <Tiles {editor} node={node.b} {sim} {insetLeft} window={windowBody} />
    </div>
  </div>
{:else}
  {@const active = node.content.type === "sheet" && editor.activeTile === node.id}
  {@const isWindow = node.content.type === "window"}
  <div class="tile" class:active class:outlined={active && sheetCount > 1} data-tile={node.id} bind:this={tileEl}>
    <div
      class="bar"
      class:grab={isWindow}
      class:pulling
      role="toolbar"
      tabindex="-1"
      aria-label="Tile {name}"
      title={isWindow ? "Drag out of the tile to float this window again" : undefined}
      onpointerdown={(e) => {
        if (node.kind !== "leaf") return;
        if (node.content.type === "sheet") editor.activateTile(node.id);
        else if (!(e.target as HTMLElement).closest("button")) {
          e.currentTarget.setPointerCapture(e.pointerId);
          pulling = true;
        }
      }}
      onpointerup={(e) => {
        if (!pulling || node.kind !== "leaf") return;
        pulling = false;
        const r = tileEl?.getBoundingClientRect();
        const outside = r && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom);
        if (outside) {
          floatNextAt(Math.max(0, e.clientX - 120), Math.max(0, e.clientY - 14));
          editor.undockWindow(node.id);
        }
      }}
    >
      <span class="name" title={name}>{name}</span>
      <button class="icon" title="Split right: the new tile shows the same sheet" onclick={() => editor.splitTile(node.id, "row")}><Icon name="splitRight" size={16} /></button>
      <button class="icon" title="Split down: the new tile shows the same sheet" onclick={() => editor.splitTile(node.id, "col")}><Icon name="splitDown" size={16} /></button>
      <button
        class="icon"
        title={node.content.type === "sheet" && sheetCount <= 1 ? "The last sheet tile stays open" : "Close this tile"}
        disabled={node.content.type === "sheet" && sheetCount <= 1}
        onclick={() => editor.closeTile(node.id)}><Icon name="close" size={16} /></button
      >
    </div>
    <div class="body">
      {#if node.content.type === "sheet"}
        <Canvas bind:this={canvas} {editor} {sim} {insetLeft} atlas tile={node.id} />
      {:else if windowBody}
        {@render windowBody(node.content.name, node.id)}
      {/if}
    </div>
  </div>
{/if}

<style>
  .split {
    display: flex;
    flex-direction: row;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }
  .split.col {
    flex-direction: column;
  }
  .part {
    flex: none;
    position: relative;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
  .part.grow {
    flex: 1;
  }
  .divider {
    flex: none;
    width: 6px;
    cursor: col-resize;
    background: var(--chrome, #e4e7ea);
    border-left: 1px solid #b9c0c6;
    border-right: 1px solid #b9c0c6;
    touch-action: none;
  }
  .split.col > .divider {
    width: auto;
    height: 6px;
    cursor: row-resize;
    border: none;
    border-top: 1px solid #b9c0c6;
    border-bottom: 1px solid #b9c0c6;
  }
  .divider:hover {
    background: #c9d3e0;
  }
  .tile {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    position: relative;
  }
  .tile.outlined::after {
    content: "";
    position: absolute;
    inset: 0;
    border: 2px solid #1e6ee6;
    pointer-events: none;
    z-index: 5;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 2px;
    height: 24px;
    padding: 0 4px 0 8px;
    background: #eef0f2;
    border-bottom: 1px solid #d5d9dd;
    font-size: 12px;
    color: #445;
    user-select: none;
  }
  .bar.grab {
    cursor: grab;
  }
  .bar.pulling {
    cursor: grabbing;
  }
  .tile.active .bar {
    background: #e2ecfc;
    color: #1550b0;
  }
  .name {
    flex: 1;
    text-align: right;
    padding-right: 6px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .icon {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2px;
    border: none;
    background: none;
    border-radius: 3px;
    color: inherit;
  }
  .icon:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.08);
  }
  .icon:disabled {
    opacity: 0.3;
  }
  .body {
    position: relative;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
</style>
