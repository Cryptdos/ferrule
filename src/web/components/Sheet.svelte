<script lang="ts">
  import type { Snippet } from "svelte";
  import { AREA_MM, AREA_UNITS, SHEET_MM, UNIT_MM } from "../../core/geometry";
  import type { Page, Project } from "../../core/model";
  import type { Vec } from "../../core/geometry";
  import { BLOCK_HALF, blockLabels, connectionDots, isFieldWire, routeOf, wireTexts } from "../../core/wires";
  import { resolveFields } from "../../core/fields";
  import { cloudsOn } from "../../core/ops";
  import { cloudPath } from "../../core/titleblock";
  import ElementView from "./ElementView.svelte";
  import GaLayer from "./GaLayer.svelte";
  import type { GaItem } from "../../core/model";
  import Frame from "./Frame.svelte";
  import TitleBlock from "./TitleBlock.svelte";

  let {
    project,
    page,
    grid = false,
    offset,
    routes,
    sectionRects = null,
    boundary,
    live = null,
    ops = null,
    gaPreview = null,
    under,
    over,
  }: {
    project: Project;
    page: Page;
    grid?: boolean;
    /** Temporary drag offset for an element, in grid units. */
    offset?: (id: string) => [number, number] | null;
    /** Temporary routes while dragging, by wire id. */
    routes?: Map<string, Vec[]> | null;
    /** Temporary section rectangles while dragging, by id. */
    sectionRects?: Map<string, [number, number, number, number]> | null;
    /** Temporary boundary height while dragging. */
    boundary?: number | null;
    /** Simulation: conductors connected to the supply. */
    live?: Set<string> | null;
    /** Simulation: elements drawn operated (contacts closed or opened, buttons pressed). */
    ops?: Record<string, boolean> | null;
    /** GA items being dragged or sized: where they'd go. */
    gaPreview?: Map<string, GaItem> | null;
    /** Extra drawing in grid units, under the elements (selection boxes). */
    under?: Snippet;
    /** Extra drawing in grid units, over the elements (ghosts, handles). */
    over?: Snippet;
  } = $props();

  const dots = $derived(routes ? [] : connectionDots(page));
  const clouds = $derived(cloudsOn(project, page.id));
  const boundaryY = $derived(boundary !== undefined && boundary !== null ? boundary : page.boundaryY);

  /** Field wires (out to plant) are drawn dashed and don't print their number unless asked to. */
  const field = $derived(new Set(page.segments.filter((s) => isFieldWire(page, s)).map((s) => s.id)));

  /** Conductors on a named rail: the rail's name says what they are, so no number. */
  const railConds = $derived.by(() => {
    const railIds = new Set(page.elements.filter((e) => e.symbol === "rail" || e.symbol === "busbar").map((e) => e.id));
    return new Set(project.conductors.filter((c) => c.terminals.some(([id]) => railIds.has(id))).map((c) => c.id));
  });
  const condById = $derived(new Map(project.conductors.map((c) => [c.id, c])));
  /** Ends that land on a symbol's terminal (not a rail, busbar or junction) get the wire's function. */
  const terminalEnd = (ref: [string, string]) => {
    const el = page.elements.find((e) => e.id === ref[0]);
    return !!el && el.symbol !== "rail" && el.symbol !== "busbar" && el.symbol !== "junction";
  };
</script>

<rect class="paper" x="0" y="0" width={SHEET_MM.w} height={SHEET_MM.h} />
<Frame />
<TitleBlock {project} {page} />
<g transform="translate({AREA_MM.x} {AREA_MM.y}) scale({UNIT_MM})">
  {#if grid}
    <rect class="grid" x="0" y="0" width={AREA_UNITS.w} height={AREA_UNITS.h} fill="url(#ferrule-grid)" />
  {/if}
  {#each page.sections as sec (sec.id)}
    {@const r = sectionRects?.get(sec.id) ?? sec.rect}
    <g class="section">
      <rect x={r[0]} y={r[1]} width={r[2]} height={r[3]} />
      {#if sec.label}
        <text x={r[0] + 0.8} y={r[1] + 2}>{resolveFields(sec.label, project)}</text>
      {/if}
    </g>
  {/each}
  {#if boundaryY !== null}
    <!-- Panel boundary: the terminal block, full width; its terminals are cells in it. -->
    <rect class="block" x="0" y={boundaryY - BLOCK_HALF} width={AREA_UNITS.w} height={BLOCK_HALF * 2} />
    {#each blockLabels(page) as l (l.x)}
      <text class="strip" x={l.x} y={boundaryY + 0.37} text-anchor={l.anchor}>{l.text}</text>
    {/each}
  {/if}
  {@render under?.()}
  <g class="wires">
    {#each page.segments as seg (seg.id)}
      {@const pts = routes?.get(seg.id) ?? routeOf(page, seg)}
      <polyline class:field={field.has(seg.id)} class:live={!!live?.has(seg.conductor)} points={pts.map((p) => p.join(",")).join(" ")} />
      {@const c = condById.get(seg.conductor)}
      {#if c}
        {#each wireTexts(pts, {
          number: railConds.has(c.id) || (field.has(seg.id) && !seg.showNumber) ? "" : c.number,
          colour: c.colour,
          func: c.function,
          labelFrom: terminalEnd(seg.from),
          labelTo: terminalEnd(seg.to),
        }) as t, i (i)}
          <text
            class="wirenum"
            x={t.at[0]}
            y={t.at[1]}
            text-anchor={t.anchor}
            transform={t.vertical ? `rotate(-90 ${t.at[0]} ${t.at[1]})` : undefined}>{t.text}</text
          >
        {/each}
      {/if}
    {/each}
    {#each dots as d, i (i)}
      <circle cx={d[0]} cy={d[1]} r="0.35" />
    {/each}
  </g>
  {#if page.ga}<GaLayer {project} {page} preview={gaPreview} />{/if}
  {#each page.elements as el (el.id)}
    {@const o = offset?.(el.id)}
    <ElementView el={ops?.[el.id] ? { ...el, params: { ...el.params, __op: true } } : el} {project} dx={o?.[0] ?? 0} dy={o?.[1] ?? 0} />
  {/each}
  {#each clouds as c (c.id)}
    {@const [x, y, w] = c.rect}
    <g class="cloud">
      <path d={cloudPath(c.rect)} />
      <polygon points="{x + w + 0.2},{y - 3.2} {x + w + 2.2},{y - 0.2} {x + w - 1.8},{y - 0.2}" />
      <text x={x + w + 0.2} y={y - 0.75} text-anchor="middle">{c.rev}</text>
    </g>
  {/each}
  {@render over?.()}
</g>

<style>
  .paper {
    fill: #fff;
  }
  .wires polyline {
    fill: none;
    stroke: #000;
    stroke-width: 0.18;
    stroke-linejoin: miter;
    stroke-linecap: square;
  }
  .wires polyline.live {
    stroke: #d42020;
    stroke-width: 0.35;
  }
  .wires polyline.field {
    stroke-dasharray: 0.9 0.5;
  }
  .section rect {
    fill: none;
    stroke: #000;
    stroke-width: 0.15;
    stroke-dasharray: 1.2 0.6;
  }
  .section text {
    font-family: var(--drawing-font);
    font-size: 1.5px;
    fill: #000;
  }
  .cloud path,
  .cloud polygon {
    fill: none;
    stroke: #000;
    stroke-width: 0.18;
  }
  .cloud text {
    font-family: var(--drawing-font);
    font-size: 1.5px;
    fill: #000;
  }
  /* Panel boundary: the terminal block. */
  .block {
    fill: none;
    stroke: #000;
    stroke-width: 0.25;
  }
  .strip {
    font-family: var(--drawing-font);
    font-size: 1px;
    fill: #000;
  }
  .wires circle {
    fill: #000;
  }
  .wirenum {
    font-family: var(--drawing-font);
    font-size: 1.05px;
    fill: #000;
  }
</style>
