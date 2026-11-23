<script lang="ts">
  import { SHEET_MM } from "../../core/geometry";
  import { resolveFields } from "../../core/fields";
  import type { Editor } from "../editor.svelte";
  import Atlas from "./Atlas.svelte";
  import Sheet from "./Sheet.svelte";

  /**
   * The other half of the split view (DESIGN.md §11): another sheet, shown
   * for reference. It zooms (scroll) and pans (drag) on its own, with its own
   * overview (design-v0.2 §10, note 14). Double-click it, or Edit this sheet,
   * to work on it; the two halves swap.
   */
  let { editor }: { editor: Editor } = $props();

  const page = $derived(editor.project.pages.find((p) => p.id === editor.splitPageId) ?? null);
  const pageNo = $derived(page ? editor.project.pages.indexOf(page) + 1 : 0);

  let box: HTMLDivElement | undefined = $state();
  let size = $state({ w: 400, h: 300 });
  let view = $state({ x: -3, y: -3, w: SHEET_MM.w + 6 });
  const viewH = $derived((view.w * size.h) / Math.max(1, size.w));
  let svg: SVGSVGElement | undefined = $state();
  let drag: { cx: number; cy: number; x: number; y: number } | null = null;

  $effect(() => {
    if (!box) return;
    const ro = new ResizeObserver(() => {
      size = { w: box!.clientWidth, h: box!.clientHeight };
    });
    ro.observe(box);
    return () => ro.disconnect();
  });

  /** The whole sheet in view. */
  function fit() {
    const k = Math.max((SHEET_MM.w + 6) / size.w, (SHEET_MM.h + 6) / size.h);
    const w = size.w * k;
    view = { x: SHEET_MM.w / 2 - w / 2, y: SHEET_MM.h / 2 - (size.h * k) / 2, w };
  }
  // Fit when the sheet changes or the pane is first sized.
  let fitted = "";
  $effect(() => {
    const key = `${page?.id}:${size.w > 0}`;
    if (key !== fitted && size.w > 0) {
      fitted = key;
      fit();
    }
  });

  function toMm(e: { clientX: number; clientY: number }): [number, number] {
    const r = svg!.getBoundingClientRect();
    return [view.x + ((e.clientX - r.left) / r.width) * view.w, view.y + ((e.clientY - r.top) / r.height) * viewH];
  }
  function wheel(e: WheelEvent) {
    e.preventDefault();
    const [mx, my] = toMm(e);
    const factor = Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
    const w = Math.min(SHEET_MM.w * 4, Math.max(20, view.w * factor));
    const k = w / view.w;
    view = { x: mx - (mx - view.x) * k, y: my - (my - view.y) * k, w };
  }
  function down(e: PointerEvent) {
    if (e.button !== 0 && e.button !== 1) return;
    svg!.setPointerCapture(e.pointerId);
    drag = { cx: e.clientX, cy: e.clientY, x: view.x, y: view.y };
  }
  function move(e: PointerEvent) {
    if (!drag || !svg) return;
    const k = view.w / svg.getBoundingClientRect().width;
    view = { ...view, x: drag.x - (e.clientX - drag.cx) * k, y: drag.y - (e.clientY - drag.cy) * k };
  }
  function up() {
    drag = null;
  }
</script>

<div class="split">
  <div class="bar">
    <select value={editor.splitPageId ?? ""} onchange={(e) => (editor.splitPageId = e.currentTarget.value || null)}>
      {#each editor.project.pages as p (p.id)}
        <option value={p.id}>{p.number} {resolveFields(p.title, editor.project)}</option>
      {/each}
    </select>
    <button onclick={fit} title="Fit the sheet">Fit</button>
    <button onclick={() => editor.swapSplit()} title="Work on this sheet (or double-click it)">Edit this sheet</button>
    <button onclick={() => (editor.splitPageId = null)} title="Close the split view">✕</button>
  </div>
  <div class="view" bind:this={box}>
    {#if page}
      <svg
        bind:this={svg}
        viewBox="{view.x} {view.y} {view.w} {viewH}"
        role="application"
        aria-label="Sheet {page.number}: scroll to zoom, drag to pan, double-click to work on it"
        onwheel={wheel}
        onpointerdown={down}
        onpointermove={move}
        onpointerup={up}
        ondblclick={() => editor.swapSplit()}
      >
        <Sheet project={editor.project} {page} />
      </svg>
      <Atlas
        project={editor.project}
        {page}
        {view}
        {viewH}
        sheet="{pageNo} / {editor.project.pages.length}"
        store="ferrule.atlas.split"
        onmove={(x, y) => (view = { ...view, x, y })}
      />
    {/if}
  </div>
</div>

<style>
  .split {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--desk, #d8dcdf);
  }
  .bar {
    display: flex;
    gap: 6px;
    padding: 4px 6px;
    background: var(--chrome, #f4f5f6);
    border-bottom: 1px solid #cfd4d8;
  }
  .bar select {
    flex: 1;
    min-width: 0;
  }
  .view {
    flex: 1;
    position: relative;
    min-height: 0;
    overflow: hidden;
  }
  .view svg {
    width: 100%;
    height: 100%;
    display: block;
    cursor: grab;
    --paper: #faf8f3;
  }
  .view svg:active {
    cursor: grabbing;
  }
</style>
