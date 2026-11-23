<script lang="ts">
  import { LINE_MM, TEXT_MM, TITLE_BLOCK_MM } from "../../core/geometry";
  import type { Page, Project } from "../../core/model";
  import { REVISION_ROWS, titleBlock } from "../../core/titleblock";

  let { project, page }: { project: Project; page: Page } = $props();

  const tb = $derived(titleBlock(project, page));

  /** Squeeze text that would overrun its box (osifont averages ~0.45 em per character). */
  function fit(text: string, size: number, room: number): number | undefined {
    return text.length * size * 0.5 > room ? room : undefined;
  }
</script>

<g class="tb" transform="translate({TITLE_BLOCK_MM.x} {TITLE_BLOCK_MM.y})" style="--detail: {TEXT_MM.detail}px; --tag: {TEXT_MM.tag}px; --thin: {LINE_MM.thin}; --frame: {LINE_MM.frame}">
  <rect class="outer" x="0" y="0" width={tb.w} height={tb.h} />
  <rect x={tb.logo.x} y={tb.logo.y} width={tb.logo.w} height={tb.logo.h} />
  {#if project.logo && project.assets?.[project.logo]}
    <!-- The company logo, fitted inside its cell with a small margin. -->
    <image
      href={project.assets[project.logo]!.data}
      x={tb.logo.x + 1.5}
      y={tb.logo.y + 1.5}
      width={tb.logo.w - 3}
      height={tb.logo.h - 3}
      preserveAspectRatio="xMidYMid meet"
    />
  {/if}
  {#each tb.cells as c (c.label)}
    {@const size = c.big ? TEXT_MM.heading : TEXT_MM.tag}
    <rect x={c.x} y={c.y} width={c.w} height={c.h} />
    <text class="label" x={c.x + 0.8} y={c.y + 1.8}>{c.label}</text>
    {#if c.value}
      <text
        class="value"
        class:big={c.big}
        x={c.x + 1.5}
        y={c.y + c.h - 1.2}
        font-size={size}
        textLength={fit(c.value, size, c.w - 3)}
        lengthAdjust="spacingAndGlyphs">{c.value}</text
      >
    {/if}
  {/each}
  {#each Array.from({ length: REVISION_ROWS + 1 }) as _, i (i)}
    {@const y = tb.revisions.y + i * tb.revisions.rowH}
    <line x1={tb.revisions.x} y1={y} x2={tb.w} y2={y} />
  {/each}
  {#each tb.revisions.cols as col, i (col.label)}
    {@const x = tb.revisions.x + tb.revisions.cols.slice(0, i).reduce((s, c) => s + c.w, 0)}
    <line x1={x} y1="0" x2={x} y2={tb.h} />
    <text class="label" x={x + 0.8} y={tb.revisions.rowH - 1.3}>{col.label}</text>
    {#each tb.revisions.rows as row, r (r)}
      <text class="rev" x={x + 1} y={tb.revisions.rowH * (r + 2) - 1.1 + (REVISION_ROWS - tb.revisions.rows.length) * tb.revisions.rowH}
        >{row[i]}</text
      >
    {/each}
  {/each}
</g>

<style>
  rect,
  line {
    fill: none;
    stroke: #000;
    stroke-width: var(--thin);
  }
  rect.outer {
    stroke-width: var(--frame);
  }
  text {
    font-family: var(--drawing-font);
    fill: #000;
  }
  .label {
    font-size: var(--detail);
  }
  .rev {
    font-size: var(--tag);
  }
</style>
