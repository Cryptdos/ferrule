<script lang="ts">
  import type { Element, Project } from "../../core/model";
  import { localGeometry } from "../../core/symbols";
  import { elementTexts } from "../../core/tags";
  import { contactTable, contactTableAt, contactTablePrims, isMaster } from "../../core/xref";
  import Prims from "./Prims.svelte";

  let {
    el,
    project,
    dx = 0,
    dy = 0,
  }: { el: Element; project: Project; dx?: number; dy?: number } = $props();

  const geom = $derived(localGeometry(el, elementTexts(el, project)));
  const table = $derived.by(() => {
    if (!isMaster(el)) return [];
    const rows = contactTable(project, el);
    return contactTablePrims(rows, contactTableAt(el, geom.body, rows.length));
  });
  // "@logo" shows the project's title block logo, wherever it's wanted (a cover sheet).
  const asset = $derived.by(() => {
    if (el.symbol !== "image") return undefined;
    const id = String(el.params.asset ?? "");
    return project.assets?.[id === "@logo" ? (project.logo ?? "") : id];
  });
</script>

{#if el.symbol === "image"}
  {#if asset}
    <image
      href={asset.data}
      x={el.pos[0] + dx}
      y={el.pos[1] + dy}
      width={geom.body.w}
      height={geom.body.h}
      preserveAspectRatio="xMidYMid meet"
    />
  {:else}
    <rect class="missing" x={el.pos[0] + dx} y={el.pos[1] + dy} width={geom.body.w} height={geom.body.h} />
    <text class="missing-text" x={el.pos[0] + dx + geom.body.w / 2} y={el.pos[1] + dy + geom.body.h / 2} text-anchor="middle"
      >{el.params.asset === "@logo" ? "Logo: add one under Project…" : "Picture missing"}</text
    >
  {/if}
{:else}
  <Prims prims={table.length ? [...geom.prims, ...table] : geom.prims} x={el.pos[0] + dx} y={el.pos[1] + dy} />
{/if}

<style>
  .missing-text {
    font-size: 1.4px;
    fill: #99a;
    font-family: var(--drawing-font);
  }
  .missing {
    fill: #f4f4f6;
    stroke: #aab;
    stroke-width: 0.15;
    stroke-dasharray: 0.6 0.4;
  }
</style>
