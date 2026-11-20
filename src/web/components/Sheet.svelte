<script lang="ts">
  import type { Snippet } from "svelte";
  import { AREA_MM, AREA_UNITS, SHEET_MM, UNIT_MM } from "../../core/geometry";
  import type { Page, Project } from "../../core/model";
  import type { Vec } from "../../core/geometry";
  import { connectionDots, routeOf, wireLabelSpot } from "../../core/wires";
  import ElementView from "./ElementView.svelte";
  import Frame from "./Frame.svelte";
  import TitleBlock from "./TitleBlock.svelte";

  let {
    project,
    page,
    grid = false,
    offset,
    routes,
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
    /** Extra drawing in grid units, under the elements (selection boxes). */
    under?: Snippet;
    /** Extra drawing in grid units, over the elements (ghosts, handles). */
    over?: Snippet;
  } = $props();

  const dots = $derived(routes ? [] : connectionDots(page));

  /** Wire numbers, by conductor. Wires on rails aren't labelled: the rail is. */
  const numbers = $derived.by(() => {
    const railIds = new Set(page.elements.filter((e) => e.symbol === "rail" || e.symbol === "busbar").map((e) => e.id));
    const out = new Map<string, string>();
    for (const c of project.conductors) {
      if (c.number && !c.terminals.some(([id]) => railIds.has(id))) out.set(c.id, c.number);
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
  {@render under?.()}
  <g class="wires">
    {#each page.segments as seg (seg.id)}
      {@const pts = routes?.get(seg.id) ?? routeOf(page, seg)}
      <polyline points={pts.map((p) => p.join(",")).join(" ")} />
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
  .wires circle {
    fill: #000;
  }
  .wirenum {
    font-family: var(--drawing-font);
    font-size: 1.05px;
    fill: #000;
  }
</style>
