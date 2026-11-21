<script lang="ts">
  import type { Snippet } from "svelte";
  import { AREA_MM, AREA_UNITS, SHEET_MM, UNIT_MM } from "../../core/geometry";
  import type { Page, Project } from "../../core/model";
  import type { Vec } from "../../core/geometry";
  import { connectionDots, routeOf, wireLabelSpot } from "../../core/wires";
  import { resolveFields } from "../../core/fields";
  import { cloudsOn } from "../../core/ops";
  import { cloudPath } from "../../core/titleblock";
  import ElementView from "./ElementView.svelte";
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
    /** Extra drawing in grid units, under the elements (selection boxes). */
    under?: Snippet;
    /** Extra drawing in grid units, over the elements (ghosts, handles). */
    over?: Snippet;
  } = $props();

  const dots = $derived(routes ? [] : connectionDots(page));
  const clouds = $derived(cloudsOn(project, page.id));
  const boundaryY = $derived(boundary !== undefined && boundary !== null ? boundary : page.boundaryY);

  /** Field cables (a wire with an end out in the field) are drawn dashed. */
  const field = $derived.by(() => {
    const ext = new Set(page.elements.filter((e) => e.zone === "external").map((e) => e.id));
    return new Set(page.segments.filter((s) => ext.has(s.from[0]) || ext.has(s.to[0])).map((s) => s.id));
  });

  /** Wire labels, by conductor. Wires on rails aren't labelled: the rail is. */
  const numbers = $derived.by(() => {
    const railIds = new Set(page.elements.filter((e) => e.symbol === "rail" || e.symbol === "busbar").map((e) => e.id));
    const out = new Map<string, string>();
    for (const c of project.conductors) {
      // Number, then core colour and what it carries: "1-66 BU 0V".
      const text = [c.number, c.colour, c.function].filter(Boolean).join(" ");
      if (text && !c.terminals.some(([id]) => railIds.has(id))) out.set(c.id, text);
    }
    return out;
  });
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
    <line class="boundary" x1="0" y1={boundaryY} x2={AREA_UNITS.w} y2={boundaryY} />
  {/if}
  {@render under?.()}
  <g class="wires">
    {#each page.segments as seg (seg.id)}
      {@const pts = routes?.get(seg.id) ?? routeOf(page, seg)}
      <polyline class:field={field.has(seg.id)} class:live={!!live?.has(seg.conductor)} points={pts.map((p) => p.join(",")).join(" ")} />
      {@const num = numbers.get(seg.conductor)}
      {@const spot = num ? wireLabelSpot(pts) : null}
      {#if num && spot}
        <text
          class="wirenum"
          x={spot.at[0]}
          y={spot.at[1]}
          text-anchor="middle"
          transform={spot.vertical ? `rotate(-90 ${spot.at[0]} ${spot.at[1]})` : undefined}>{num}</text
        >
      {/if}
    {/each}
    {#each dots as d, i (i)}
      <circle cx={d[0]} cy={d[1]} r="0.35" />
    {/each}
  </g>
  {#each page.elements as el (el.id)}
    {@const o = offset?.(el.id)}
    <ElementView {el} {project} dx={o?.[0] ?? 0} dy={o?.[1] ?? 0} />
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
  .boundary {
    stroke: #000;
    stroke-width: 0.22;
    stroke-dasharray: 3 0.8 0.6 0.8;
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
