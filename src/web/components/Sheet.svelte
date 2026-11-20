<script lang="ts">
  import type { Snippet } from "svelte";
  import { AREA_MM, AREA_UNITS, SHEET_MM, UNIT_MM } from "../../core/geometry";
  import type { Page, Project } from "../../core/model";
  import ElementView from "./ElementView.svelte";
  import Frame from "./Frame.svelte";

  let {
    project,
    page,
    grid = false,
    offset,
    under,
    over,
  }: {
    project: Project;
    page: Page;
    grid?: boolean;
    /** Temporary drag offset for an element, in grid units. */
    offset?: (id: string) => [number, number] | null;
    /** Extra drawing in grid units, under the elements (selection boxes). */
    under?: Snippet;
    /** Extra drawing in grid units, over the elements (ghosts, handles). */
    over?: Snippet;
  } = $props();
</script>

<rect class="paper" x="0" y="0" width={SHEET_MM.w} height={SHEET_MM.h} />
<Frame />
<g transform="translate({AREA_MM.x} {AREA_MM.y}) scale({UNIT_MM})">
  {#if grid}
    <rect class="grid" x="0" y="0" width={AREA_UNITS.w} height={AREA_UNITS.h} fill="url(#ferrule-grid)" />
  {/if}
  {@render under?.()}
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
</style>
