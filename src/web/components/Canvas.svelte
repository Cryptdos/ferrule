<script lang="ts">
  import {
    AREA_MM,
    SHEET_MM,
    UNIT_MM,
    type Vec,
    pointInRect,
    rectsIntersect,
    offsetRect,
    snapVec,
    clampToArea,
  } from "../../core/geometry";
  import {
    addElement,
    addSection,
    moveElements,
    placePlantView,
    setBoundary,
    setManualRoute,
    updateSection,
    wire,
    type WireEnd,
  } from "../../core/ops";
  import { localGeometry, defaultParams, type Geometry } from "../../core/symbols";
  import { elementTexts } from "../../core/tags";
  import { routePage } from "../../core/routing";
  import { distanceToRoute, dragLeg, nearestPointOnRoute, routeOf, simpleRoute, simplifyRoute } from "../../core/wires";
  import type { Element, Page, Segment } from "../../core/model";
  import type { Editor } from "../editor.svelte";
  import { getAvoid } from "../avoid";
  import { isTyping } from "../typing";
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
    | { kind: "leg"; seg: string; leg: number; start: Vec; original: Vec[]; points: Vec[] }
    | { kind: "band"; start: Vec; cur: Vec; add: boolean }
    | { kind: "secnew"; start: Vec; cur: Vec }
    | { kind: "secmove"; id: string; start: Vec; rect: Rect4; delta: Vec }
    | { kind: "secsize"; id: string; start: Vec; rect: Rect4; delta: Vec }
    | { kind: "boundary"; y: number }
    | null;
  type Rect4 = [number, number, number, number];
  let gesture = $state<Gesture>(null);
  let pointer: Vec | null = $state(null);
  let spaceDown = $state(false);

  /** A wire being drawn: where it starts. */
  type Pending = { end: WireEnd; at: Vec };
  let pending: Pending | null = $state(null);

  const page = $derived(editor.page);
  const geoms = $derived(
    new Map<string, Geometry>(page.elements.map((e) => [e.id, localGeometry(e, elementTexts(e, editor.project))])),
  );
  const selected = $derived(new Set(editor.selection));

  $effect(() => {
    // Drop a half-drawn wire when the tool or page changes.
    void editor.tool;
    void editor.pageId;
    pending = null;
  });

  export function fit(): void {
    const aspect = box.h / Math.max(1, box.w);
    const w = Math.max(SHEET_MM.w + 10, (SHEET_MM.h + 10) / aspect);
    view = { x: SHEET_MM.w / 2 - w / 2, y: SHEET_MM.h / 2 - (w * aspect) / 2, w };
  }

  /** Cancel a wire in progress or a drag. Returns true if there was one. */
  export function cancel(): boolean {
    if (pending || gesture) {
      pending = null;
      gesture = null;
      return true;
    }
    return false;
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

  // -------------------------------------------------------------------------
  // Hit testing

  function hitElement(pt: Vec): Element | null {
    const els = page.elements;
    for (let i = els.length - 1; i >= 0; i--) {
      const el = els[i]!;
      if (el.symbol === "junction") continue;
      const g = geoms.get(el.id);
      if (g && pointInRect([pt[0] - el.pos[0], pt[1] - el.pos[1]], g.bbox, 0.5)) return el;
    }
    return null;
  }

  function hitWire(pt: Vec, tolerance = 0.6): { seg: Segment; leg: number } | null {
    let best: { seg: Segment; leg: number; dist: number } | null = null;
    for (const seg of page.segments) {
      const { dist, leg } = distanceToRoute(pt, routeOf(page, seg));
      if (dist < tolerance && (!best || dist < best.dist)) best = { seg, leg, dist };
    }
    return best;
  }

  /** A section's resize handle (bottom-right corner) or its border/label. */
  function hitSection(pt: Vec): { id: string; part: "move" | "size" } | null {
    for (let i = page.sections.length - 1; i >= 0; i--) {
      const sec = page.sections[i]!;
      const [x, y, w, h] = sec.rect;
      if (Math.hypot(pt[0] - (x + w), pt[1] - (y + h)) < 1) return { id: sec.id, part: "size" };
      const nearV = (Math.abs(pt[0] - x) < 0.6 || Math.abs(pt[0] - (x + w)) < 0.6) && pt[1] > y - 0.6 && pt[1] < y + h + 0.6;
      const nearH = (Math.abs(pt[1] - y) < 0.6 || Math.abs(pt[1] - (y + h)) < 0.6) && pt[0] > x - 0.6 && pt[0] < x + w + 0.6;
      const onLabel = pt[0] > x && pt[0] < x + 20 && pt[1] > y && pt[1] < y + 2.6;
      if (nearV || nearH || onLabel) return { id: sec.id, part: "move" };
    }
    return null;
  }

  /** The nearest terminal within reach, for wiring. Rails snap to the nearest tap. */
  function hitTerminal(pt: Vec, reach = 1.2): { ref: [string, string]; at: Vec } | null {
    let best: { ref: [string, string]; at: Vec; d: number } | null = null;
    for (const el of page.elements) {
      const g = geoms.get(el.id);
      if (!g) continue;
      for (const t of g.terminals) {
        const at: Vec = [el.pos[0] + t.at[0], el.pos[1] + t.at[1]];
        const d = Math.hypot(at[0] - pt[0], at[1] - pt[1]);
        if (d < reach && (!best || d < best.d)) best = { ref: [el.id, t.name], at, d };
      }
    }
    return best;
  }

  /** What the wire tool would connect to at this point. */
  function wireTarget(pt: Vec): Pending | null {
    const t = hitTerminal(pt);
    if (t) return { end: { terminal: t.ref }, at: t.at };
    const w = hitWire(pt, 0.8);
    if (w) {
      const at = nearestPointOnRoute(pt, routeOf(page, w.seg));
      if (at) return { end: { wire: w.seg.id, at }, at };
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Pointer handling

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
    if (e.button === 2) {
      pending = null;
      return;
    }
    if (e.button !== 0) return;
    const pt = toUnits(e);

    if (editor.tool === "place" && editor.placeSymbol) {
      const symbol = editor.placeSymbol;
      const params = { ...editor.placeParams };
      let id = "";
      editor.apply((p) => {
        const at = clampToArea(snapVec(pt));
        id =
          symbol === "plant-view"
            ? placePlantView(p, editor.pageId, String(params.plant), at, String(params.show ?? "").split(",").filter(Boolean)).id
            : addElement(p, editor.pageId, symbol, at, { params }).id;
      });
      if (id) editor.selection = [id];
      // A plant view is placed once; other symbols can be placed again and again.
      if (symbol === "plant-view") {
        editor.tool = "select";
        editor.placeSymbol = null;
      }
      return;
    }

    if (editor.tool === "section") {
      gesture = { kind: "secnew", start: snapVec(pt), cur: snapVec(pt) };
      return;
    }

    if (editor.tool === "wire") {
      const target = wireTarget(pt);
      if (!target) {
        pending = null;
        return;
      }
      if (!pending) {
        pending = target;
        return;
      }
      const start = pending;
      let segId = "";
      const ok = editor.apply((p) => {
        segId = wire(p, editor.pageId, start.end, target.end).id;
      });
      pending = null;
      if (ok) editor.selection = [segId];
      return;
    }

    // Select tool.
    const hit = hitElement(pt);
    const wireHit = hit ? null : hitWire(pt);
    const secHit = hit || wireHit ? null : hitSection(pt);
    if (secHit) {
      const sec = page.sections.find((x) => x.id === secHit.id)!;
      editor.selection = [sec.id];
      gesture = { kind: secHit.part === "size" ? "secsize" : "secmove", id: sec.id, start: pt, rect: [...sec.rect], delta: [0, 0] };
      return;
    }
    if (!hit && !wireHit && page.boundaryY !== null && Math.abs(pt[1] - page.boundaryY) < 0.6) {
      gesture = { kind: "boundary", y: page.boundaryY };
      return;
    }
    const id = hit?.id ?? wireHit?.seg.id;
    if (id) {
      if (e.shiftKey || e.ctrlKey) {
        editor.selection = selected.has(id) ? editor.selection.filter((s) => s !== id) : [...editor.selection, id];
        if (!selected.has(id)) return;
      } else if (!selected.has(id)) {
        editor.selection = [id];
      }
      if (hit) {
        const ids = editor.selectedElements.map((el) => el.id);
        gesture = { kind: "drag", start: pt, delta: [0, 0], ids };
      } else if (wireHit && editor.selection.length === 1) {
        const pts = routeOf(page, wireHit.seg);
        gesture = { kind: "leg", seg: wireHit.seg.id, leg: wireHit.leg, start: pt, original: pts, points: pts };
      }
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
      const d = snapVec([pointer[0] - g.start[0], pointer[1] - g.start[1]]);
      if (d[0] !== g.delta[0] || d[1] !== g.delta[1]) g.delta = d;
    } else if (g.kind === "leg") {
      const d = snapVec([pointer[0] - g.start[0], pointer[1] - g.start[1]]);
      g.points = dragLeg(g.original, g.leg, d);
    } else if (g.kind === "band") {
      g.cur = pointer;
    } else if (g.kind === "secnew") {
      g.cur = snapVec(pointer);
    } else if (g.kind === "secmove" || g.kind === "secsize") {
      g.delta = snapVec([pointer[0] - g.start[0], pointer[1] - g.start[1]]);
    } else if (g.kind === "boundary") {
      g.y = Math.round(Math.max(0, Math.min(112, pointer[1])));
    }
  }

  function onPointerUp() {
    const g = gesture;
    gesture = null;
    if (!g) return;
    if (g.kind === "drag" && (g.delta[0] || g.delta[1])) {
      editor.apply((p) => moveElements(p, editor.pageId, g.ids, g.delta));
    } else if (g.kind === "leg") {
      const pts = simplifyRoute(g.points);
      if (JSON.stringify(pts) !== JSON.stringify(simplifyRoute(g.original))) {
        editor.apply((p) => setManualRoute(p, editor.pageId, g.seg, pts));
      }
    } else if (g.kind === "secnew") {
      const r = bandRect(g.start, g.cur);
      if (r.w < 4 || r.h < 4) return;
      let id = "";
      editor.apply((p) => {
        id = addSection(p, editor.pageId, "", [r.x, r.y, r.w, r.h]).id;
      });
      editor.tool = "select";
      if (id) editor.selection = [id];
    } else if ((g.kind === "secmove" || g.kind === "secsize") && (g.delta[0] || g.delta[1])) {
      const rect = sectionPreview(g);
      editor.apply((p) => updateSection(p, editor.pageId, g.id, { rect }));
    } else if (g.kind === "boundary" && g.y !== page.boundaryY) {
      const y = g.y;
      editor.apply((p) => setBoundary(p, editor.pageId, y));
    } else if (g.kind === "band") {
      const r = bandRect(g.start, g.cur);
      if (r.w < 0.2 && r.h < 0.2) return;
      const hitEls = page.elements
        .filter((el) => {
          if (el.symbol === "junction") return false;
          const gm = geoms.get(el.id);
          return gm && rectsIntersect(r, offsetRect(gm.bbox, el.pos));
        })
        .map((el) => el.id);
      // Wires are boxed only when they lie wholly inside.
      const hitSegs = page.segments.filter((s) => routeOf(page, s).every((p) => pointInRect(p, r))).map((s) => s.id);
      const hits = [...hitEls, ...hitSegs];
      editor.selection = g.add ? [...new Set([...editor.selection, ...hits])] : hits;
    }
  }

  function bandRect(a: Vec, b: Vec) {
    return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]), h: Math.abs(a[1] - b[1]) };
  }

  function sectionPreview(g: { kind: string; rect: Rect4; delta: Vec }): Rect4 {
    const [x, y, w, h] = g.rect;
    return g.kind === "secsize" ? [x, y, Math.max(4, w + g.delta[0]), Math.max(4, h + g.delta[1])] : [x + g.delta[0], y + g.delta[1], w, h];
  }

  const sectionRects = $derived.by(() => {
    const g = gesture as Gesture;
    if (g?.kind !== "secmove" && g?.kind !== "secsize") return null;
    return new Map([[g.id, sectionPreview(g)]]);
  });
  const boundaryPreview = $derived.by(() => {
    const g = gesture as Gesture;
    return g?.kind === "boundary" ? g.y : null;
  });
  const newSection = $derived.by(() => {
    const g = gesture as Gesture;
    return g?.kind === "secnew" ? bandRect(g.start, g.cur) : null;
  });

  function offset(id: string): Vec | null {
    const g = gesture;
    return g?.kind === "drag" && g.ids.includes(id) ? g.delta : null;
  }

  /** Live routes while something is being dragged. */
  const previewRoutes = $derived.by((): Map<string, Vec[]> | null => {
    const g = gesture as Gesture;
    if (g?.kind === "leg") return new Map([[g.seg, g.points]]);
    if (g?.kind !== "drag" || (!g.delta[0] && !g.delta[1])) return null;
    const moved = new Set(g.ids);
    const tmp: Page = JSON.parse(JSON.stringify($state.snapshot(page)));
    const touched = tmp.segments.filter((s) => moved.has(s.from[0]) || moved.has(s.to[0]));
    if (!touched.length) return null;
    for (const el of tmp.elements) {
      if (moved.has(el.id)) el.pos = clampToArea([el.pos[0] + g.delta[0], el.pos[1] + g.delta[1]]);
    }
    routePage(getAvoid(), tmp, { only: new Set(touched.map((s) => s.id)) });
    return new Map(tmp.segments.map((s) => [s.id, s.points]));
  });

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
      params: { ...defaultParams(editor.placeSymbol), ...editor.placeParams },
      links: [],
    };
  });

  const hover = $derived(editor.tool === "wire" && pointer ? wireTarget(pointer) : null);
  const rubber = $derived.by((): Vec[] | null => {
    if (!pending || !pointer) return null;
    const to = hover?.at ?? snapVec(pointer);
    return simpleRoute(pending.at, to);
  });

  const band = $derived.by(() => {
    const g = gesture as Gesture;
    return g?.kind === "band" ? g : null;
  });

  const cursorClass = $derived(
    gesture?.kind === "pan" || spaceDown
      ? "grab"
      : editor.tool === "place" || editor.tool === "wire" || editor.tool === "section"
        ? "crosshair"
        : "default",
  );
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.code === "Space" && !isTyping(e.target)) {
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
  oncontextmenu={(e) => e.preventDefault()}
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
  <Sheet project={editor.project} {page} grid {offset} routes={previewRoutes} {sectionRects} boundary={boundaryPreview}>
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
      {#each page.sections as sec (sec.id)}
        {#if selected.has(sec.id)}
          {@const r = sectionRects?.get(sec.id) ?? sec.rect}
          <rect class="sel" x={r[0] - 0.3} y={r[1] - 0.3} width={r[2] + 0.6} height={r[3] + 0.6} />
          <rect class="handle" x={r[0] + r[2] - 0.6} y={r[1] + r[3] - 0.6} width="1.2" height="1.2" />
        {/if}
      {/each}
      {#each page.segments as seg (seg.id)}
        {#if selected.has(seg.id)}
          {@const pts = previewRoutes?.get(seg.id) ?? routeOf(page, seg)}
          <polyline class="sel-wire" points={pts.map((p) => p.join(",")).join(" ")} />
        {/if}
      {/each}
    {/snippet}
    {#snippet over()}
      {#if ghost}
        <g class="ghost"><ElementView el={ghost} project={editor.project} /></g>
      {/if}
      {#if editor.tool === "wire"}
        {#each page.elements as el (el.id)}
          {@const g = geoms.get(el.id)}
          {#if g && el.symbol !== "rail" && el.symbol !== "busbar"}
            {#each g.terminals as t (t.name)}
              <circle class="term" cx={el.pos[0] + t.at[0]} cy={el.pos[1] + t.at[1]} r="0.3" />
            {/each}
          {/if}
        {/each}
        {#if rubber}
          <polyline class="rubber" points={rubber.map((p) => p.join(",")).join(" ")} />
        {/if}
        {#if hover}
          <circle class="hover" cx={hover.at[0]} cy={hover.at[1]} r="0.6" />
        {/if}
        {#if pending}
          <circle class="hover start" cx={pending.at[0]} cy={pending.at[1]} r="0.6" />
        {/if}
      {/if}
      {#if newSection}
        <rect class="band" x={newSection.x} y={newSection.y} width={newSection.w} height={newSection.h} />
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
  .sel-wire {
    fill: none;
    stroke: rgba(30, 110, 230, 0.35);
    stroke-width: 0.9;
    stroke-linejoin: round;
  }
  .handle {
    fill: #fff;
    stroke: #1e6ee6;
    stroke-width: 0.15;
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
  .term {
    fill: none;
    stroke: #1e6ee6;
    stroke-width: 0.08;
  }
  .hover {
    fill: rgba(230, 110, 30, 0.25);
    stroke: #e66e1e;
    stroke-width: 0.12;
  }
  .hover.start {
    fill: rgba(30, 160, 60, 0.3);
    stroke: #1a8f3a;
  }
  .rubber {
    fill: none;
    stroke: #e66e1e;
    stroke-width: 0.15;
    stroke-dasharray: 0.6 0.4;
  }
</style>
