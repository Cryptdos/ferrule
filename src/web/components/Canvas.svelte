<script lang="ts">
  import { AREA_MM, SHEET_MM, UNIT_MM, type Vec, pointInRect, rectsIntersect, offsetRect, snapVec, clampToArea } from "../../core/geometry";
  import { addElement, moveElements } from "../../core/ops";
  import { localGeometry, type Geometry } from "../../core/symbols";
  import { displayTag } from "../../core/tags";
  import { defaultParams } from "../../core/symbols";
  import type { Element } from "../../core/model";
  import type { Editor } from "../editor.svelte";
  import Sheet from "./Sheet.svelte";
  import ElementView from "./ElementView.svelte";

  let { editor }: { editor: Editor } = $props();

  let svg: SVGSVGElement | undefined = $state();
  let box = $state({ w: 1200, h: 800 });

  // View box in sheet millimetres.
  let view = $state({ x: -5, y: -5, w: SHEET_MM.w + 10 });
  const viewH = $derived(view.w * (box.h / Math.max(1, box.w)));

  type Gesture =
    | { kind: "pan"; client: Vec; start: { x: number; y: number } }
    | { kind: "drag"; start: Vec; delta: Vec; ids: string[] }
    | { kind: "band"; start: Vec; cur: Vec; add: boolean }
    | null;
  let gesture = $state<Gesture>(null);
  let pointer: Vec | null = $state(null);
  let spaceDown = $state(false);

  const page = $derived(editor.page);
  const geoms = $derived(
    new Map<string, Geometry>(page.elements.map((e) => [e.id, localGeometry(e, displayTag(e, editor.project))])),
  );
  const selected = $derived(new Set(editor.selection));

  export function fit(): void {
    const aspect = box.h / Math.max(1, box.w);
    const w = Math.max(SHEET_MM.w + 10, (SHEET_MM.h + 10) / aspect);
    view = { x: SHEET_MM.w / 2 - w / 2, y: SHEET_MM.h / 2 - (w * aspect) / 2, w };
  }

  $effect(() => {
    if (!svg) return;
    const ro = new ResizeObserver(([entry]) => {
      const first = box.w === 1200 && box.h === 800;
      box = { w: entry!.contentRect.width, h: entry!.contentRect.height };
      if (first) fit();
    });
    ro.observe(svg);
    return () => ro.disconnect();
  });

  function toMm(e: { clientX: number; clientY: number }): Vec {
    const ctm = svg!.getScreenCTM()!.inverse();
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm);
    return [p.x, p.y];
  }
  function toUnits(e: { clientX: number; clientY: number }): Vec {
    const [x, y] = toMm(e);
    return [(x - AREA_MM.x) / UNIT_MM, (y - AREA_MM.y) / UNIT_MM];
  }

  function hitElement(pt: Vec): Element | null {
    const els = page.elements;
    for (let i = els.length - 1; i >= 0; i--) {
      const el = els[i]!;
      const g = geoms.get(el.id);
      if (g && pointInRect([pt[0] - el.pos[0], pt[1] - el.pos[1]], g.bbox, 0.5)) return el;
    }
    return null;
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const [mx, my] = toMm(e);
    const factor = Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
    const w = Math.min(SHEET_MM.w * 4, Math.max(20, view.w * factor));
    const k = w / view.w;
    view = { x: mx - (mx - view.x) * k, y: my - (my - view.y) * k, w };
  }

  function onPointerDown(e: PointerEvent) {
    svg!.setPointerCapture(e.pointerId);
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      gesture = { kind: "pan", client: [e.clientX, e.clientY], start: { x: view.x, y: view.y } };
      return;
    }
    if (e.button !== 0) return;
    const pt = toUnits(e);

    if (editor.tool === "place" && editor.placeSymbol) {
      const symbol = editor.placeSymbol;
      let id = "";
      editor.apply((p) => {
        id = addElement(p, editor.pageId, symbol, clampToArea(snapVec(pt))).id;
      });
      if (id) editor.selection = [id];
      return;
    }

    const hit = hitElement(pt);
    if (hit) {
      if (e.shiftKey || e.ctrlKey) {
        editor.selection = selected.has(hit.id)
          ? editor.selection.filter((s) => s !== hit.id)
          : [...editor.selection, hit.id];
        if (!selected.has(hit.id)) return;
      } else if (!selected.has(hit.id)) {
        editor.selection = [hit.id];
      }
      gesture = { kind: "drag", start: pt, delta: [0, 0], ids: [...editor.selection] };
    } else {
      gesture = { kind: "band", start: pt, cur: pt, add: e.shiftKey || e.ctrlKey };
      if (!gesture.add) editor.selection = [];
    }
  }

  function onPointerMove(e: PointerEvent) {
    pointer = toUnits(e);
    const g = gesture;
    if (!g) return;
    if (g.kind === "pan") {
      const k = view.w / box.w;
      view = { ...view, x: g.start.x - (e.clientX - g.client[0]) * k, y: g.start.y - (e.clientY - g.client[1]) * k };
    } else if (g.kind === "drag") {
      g.delta = snapVec([pointer[0] - g.start[0], pointer[1] - g.start[1]]);
    } else if (g.kind === "band") {
      g.cur = pointer;
    }
  }

  function onPointerUp() {
    const g = gesture;
    gesture = null;
    if (!g) return;
    if (g.kind === "drag" && (g.delta[0] || g.delta[1])) {
      editor.apply((p) => moveElements(p, editor.pageId, g.ids, g.delta));
    } else if (g.kind === "band") {
      const r = bandRect(g.start, g.cur);
      if (r.w < 0.2 && r.h < 0.2) return;
      const hits = page.elements
        .filter((el) => {
          const gm = geoms.get(el.id);
          return gm && rectsIntersect(r, offsetRect(gm.bbox, el.pos));
        })
        .map((el) => el.id);
      editor.selection = g.add ? [...new Set([...editor.selection, ...hits])] : hits;
    }
  }

  function bandRect(a: Vec, b: Vec) {
    return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]), h: Math.abs(a[1] - b[1]) };
  }

  function offset(id: string): Vec | null {
    const g = gesture;
    return g?.kind === "drag" && g.ids.includes(id) ? g.delta : null;
  }

  const ghost = $derived.by((): Element | null => {
    if (editor.tool !== "place" || !editor.placeSymbol || !pointer) return null;
    return {
      id: "ghost",
      symbol: editor.placeSymbol,
      tag: "",
      label: "",
      pos: clampToArea(snapVec(pointer)),
      rot: 0,
      zone: "internal",
      params: defaultParams(editor.placeSymbol),
      links: [],
    };
  });

  const band = $derived.by(() => {
    const g = gesture as Gesture;
    return g?.kind === "band" ? g : null;
  });

  const cursorClass = $derived(
    gesture?.kind === "pan" || spaceDown ? "grab" : editor.tool === "place" ? "crosshair" : "default",
  );
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.code === "Space" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)) {
      spaceDown = true;
      e.preventDefault();
    }
  }}
  onkeyup={(e) => {
    if (e.code === "Space") spaceDown = false;
  }}
/>

<svg
  bind:this={svg}
  class="canvas {cursorClass}"
  viewBox="{view.x} {view.y} {view.w} {viewH}"
  onwheel={onWheel}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointerleave={() => (pointer = null)}
  role="application"
  aria-label="Drawing canvas"
>
  <defs>
    <pattern id="ferrule-grid" width="2" height="2" patternUnits="userSpaceOnUse">
      <circle cx="0" cy="0" r="0.09" fill="#9aa" />
      <circle cx="1" cy="0" r="0.05" fill="#cdd" />
      <circle cx="0" cy="1" r="0.05" fill="#cdd" />
      <circle cx="1" cy="1" r="0.05" fill="#cdd" />
    </pattern>
  </defs>
  <rect class="desk" x={view.x - 1000} y={view.y - 1000} width={view.w + 2000} height={viewH + 2000} />
  <Sheet project={editor.project} {page} grid {offset}>
    {#snippet under()}
      {#each page.elements as el (el.id)}
        {#if selected.has(el.id)}
          {@const g = geoms.get(el.id)}
          {@const o = offset(el.id) ?? [0, 0]}
          {#if g}
            <rect
              class="sel"
              x={el.pos[0] + o[0] + g.bbox.x - 0.5}
              y={el.pos[1] + o[1] + g.bbox.y - 0.5}
              width={g.bbox.w + 1}
              height={g.bbox.h + 1}
            />
          {/if}
        {/if}
      {/each}
    {/snippet}
    {#snippet over()}
      {#if ghost}
        <g class="ghost"><ElementView el={ghost} project={editor.project} /></g>
      {/if}
      {#if band}
        {@const r = bandRect(band.start, band.cur)}
        <rect class="band" x={r.x} y={r.y} width={r.w} height={r.h} />
      {/if}
    {/snippet}
  </Sheet>
</svg>

<style>
  .canvas {
    width: 100%;
    height: 100%;
    display: block;
    touch-action: none;
    user-select: none;
  }
  .canvas.crosshair {
    cursor: crosshair;
  }
  .canvas.grab {
    cursor: grab;
  }
  .desk {
    fill: #d8dcdf;
  }
  .sel {
    fill: rgba(30, 110, 230, 0.08);
    stroke: #1e6ee6;
    stroke-width: 0.12;
    stroke-dasharray: 0.5 0.3;
  }
  .band {
    fill: rgba(30, 110, 230, 0.06);
    stroke: #1e6ee6;
    stroke-width: 0.1;
  }
  .ghost {
    opacity: 0.45;
    pointer-events: none;
  }
</style>
