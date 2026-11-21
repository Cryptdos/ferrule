<script lang="ts">
  import { SHEET_MM } from "../../core/geometry";
  import type { Page, Project } from "../../core/model";
  import Sheet from "./Sheet.svelte";

  /**
   * The whole sheet in miniature with the part in view outlined. Drag the
   * outline (or click anywhere) to move the view about the sheet.
   */
  let {
    project,
    page,
    view,
    viewH,
    onmove,
  }: {
    project: Project;
    page: Page;
    view: { x: number; y: number; w: number };
    viewH: number;
    onmove: (x: number, y: number) => void;
  } = $props();

  const W = 190;
  const KEY = "ferrule.atlas";
  let shown = $state(load());
  function load(): boolean {
    try {
      return localStorage.getItem(KEY) !== "off";
    } catch {
      return true;
    }
  }
  function toggle() {
    shown = !shown;
    try {
      localStorage.setItem(KEY, shown ? "on" : "off");
    } catch {
      /* storage may be unavailable */
    }
  }

  let svg: SVGSVGElement | undefined = $state();
  let grab: [number, number] | null = null;

  function toMm(e: PointerEvent): [number, number] {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg!.getScreenCTM()!.inverse());
    return [p.x, p.y];
  }
  function down(e: PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    svg!.setPointerCapture(e.pointerId);
    const [x, y] = toMm(e);
    const inside = x >= view.x && x <= view.x + view.w && y >= view.y && y <= view.y + viewH;
    if (!inside) onmove(x - view.w / 2, y - viewH / 2);
    grab = inside ? [x - view.x, y - view.y] : [view.w / 2, viewH / 2];
  }
  function move(e: PointerEvent) {
    if (!grab) return;
    const [x, y] = toMm(e);
    onmove(x - grab[0], y - grab[1]);
  }
  function up() {
    grab = null;
  }
  // The whole sheet is in view: the outline would just be the sheet's edge.
  const all = $derived(view.x <= 0 && view.y <= 0 && view.x + view.w >= SHEET_MM.w && view.y + viewH >= SHEET_MM.h);
</script>

<div class="atlas" class:folded={!shown}>
  {#if shown}
    <svg
      bind:this={svg}
      width={W}
      height={(W * SHEET_MM.h) / SHEET_MM.w}
      viewBox="0 0 {SHEET_MM.w} {SHEET_MM.h}"
      role="application"
      aria-label="Sheet overview: drag the outline to move the view"
      onpointerdown={down}
      onpointermove={move}
      onpointerup={up}
    >
      <g class="mini"><Sheet {project} {page} /></g>
      {#if !all}
        <rect class="shade" x="-1000" y="-1000" width="3000" height="3000" mask="url(#atlas-hole)" />
        <mask id="atlas-hole">
          <rect x="-1000" y="-1000" width="3000" height="3000" fill="#fff" />
          <rect x={view.x} y={view.y} width={view.w} height={viewH} fill="#000" />
        </mask>
        <rect class="port" x={view.x} y={view.y} width={view.w} height={viewH} />
      {/if}
    </svg>
  {/if}
  <button class="fold" onclick={toggle} title={shown ? "Hide the sheet overview" : "Show the sheet overview"}>{shown ? "–" : "Overview"}</button>
</div>

<style>
  .atlas {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 15;
    background: rgba(250, 251, 252, 0.9);
    border: 1px solid rgba(40, 50, 60, 0.2);
    border-radius: 5px;
    box-shadow: 0 3px 12px rgba(20, 30, 40, 0.15);
    padding: 4px;
    line-height: 0;
  }
  .atlas.folded {
    padding: 0;
  }
  svg {
    display: block;
    cursor: pointer;
    background: #fff;
    overflow: hidden;
  }
  .mini {
    pointer-events: none;
  }
  .shade {
    fill: rgba(40, 50, 70, 0.18);
    pointer-events: none;
  }
  .port {
    fill: none;
    stroke: #1e6ee6;
    stroke-width: 2;
    cursor: move;
  }
  .fold {
    position: absolute;
    top: 2px;
    right: 2px;
    border: none;
    background: rgba(255, 255, 255, 0.8);
    font-size: 11px;
    line-height: 1;
    padding: 2px 5px;
    border-radius: 3px;
    color: #556;
  }
  .folded .fold {
    position: static;
    padding: 5px 8px;
  }
</style>
