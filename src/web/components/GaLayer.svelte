<script lang="ts">
  import type { GaItem, Page, Project } from "../../core/model";
  import { GA_ORIGIN, mmToUnits } from "../../core/ga";
  import { textUnits } from "../../core/geometry";
  import { displayTag } from "../../core/tags";

  /** A GA sheet's enclosure and items, drawn at its scale (grid units, like the rest of the sheet). */
  let {
    project,
    page,
    preview = null,
  }: {
    project: Project;
    page: Page;
    /** Items being dragged or sized: their temporary place, by id. */
    preview?: Map<string, GaItem> | null;
  } = $props();

  const ga = $derived(page.ga!);
  const u = (mm: number) => mmToUnits(ga, mm);
  const W = $derived(u(ga.enclosure.w));
  const H = $derived(u(ga.enclosure.h));
  const byId = $derived(new Map(project.pages.flatMap((pg) => pg.elements.map((e) => [e.id, e]))));

  /** What a device says: its tag(s), or its own text. */
  function label(it: GaItem): string {
    if (it.text) return it.text;
    const els = (it.refs ?? []).map((r) => byId.get(r)).filter((e) => !!e);
    if (!els.length) return it.refs?.length ? "(deleted)" : "";
    if (els[0]!.symbol === "terminal") return String(els[0]!.params.strip ?? "X1");
    return displayTag(els[0]!, project);
  }
  /**
   * How a device's label fits: centred, across the longer side if it won't fit
   * across the box. Small boxes get smaller text so no line runs through it,
   * down to a smallest size still readable on an A4 print; below that it stays
   * at that size and knocks the lines behind it out instead.
   */
  const CHAR = 0.62;
  const BEST = textUnits("tag");
  const SMALLEST = textUnits("detail");
  function fitLabel(text: string, w: number, h: number): { size: number; vertical: boolean; halo: boolean } {
    const n = Math.max(1, text.length);
    const fits = (len: number, across: number) => Math.min(BEST, (len * 0.9) / (n * CHAR), across * 1.15);
    const flat = fits(w, h);
    const up = fits(h, w);
    const vertical = up > flat + 0.05;
    const size = vertical ? up : flat;
    return { size: Math.max(SMALLEST, size), vertical, halo: size < SMALLEST };
  }
  const scaleText = $derived(Number.isInteger(ga.scale) ? `1:${ga.scale}` : `1:${ga.scale}`);
</script>

<g class="ga">
  <!-- The enclosure (or door), with its size. -->
  <rect class="encl" x={GA_ORIGIN[0]} y={GA_ORIGIN[1]} width={W} height={H} />
  <text class="title" x={GA_ORIGIN[0]} y={GA_ORIGIN[1] - 5.5}
    >{ga.view === "door" ? "DOOR" : "BACKPLATE"}: {ga.enclosure.w} W × {ga.enclosure.h} H mm · SCALE {scaleText}</text
  >
  <line class="dim" x1={GA_ORIGIN[0]} y1={GA_ORIGIN[1] - 2} x2={GA_ORIGIN[0] + W} y2={GA_ORIGIN[1] - 2} />
  <line class="tick" x1={GA_ORIGIN[0]} y1={GA_ORIGIN[1] - 3} x2={GA_ORIGIN[0]} y2={GA_ORIGIN[1] - 1} />
  <line class="tick" x1={GA_ORIGIN[0] + W} y1={GA_ORIGIN[1] - 3} x2={GA_ORIGIN[0] + W} y2={GA_ORIGIN[1] - 1} />
  <text class="dimtext" x={GA_ORIGIN[0] + W / 2} y={GA_ORIGIN[1] - 2.5} text-anchor="middle">{ga.enclosure.w}</text>
  <line class="dim" x1={GA_ORIGIN[0] - 2} y1={GA_ORIGIN[1]} x2={GA_ORIGIN[0] - 2} y2={GA_ORIGIN[1] + H} />
  <line class="tick" x1={GA_ORIGIN[0] - 3} y1={GA_ORIGIN[1]} x2={GA_ORIGIN[0] - 1} y2={GA_ORIGIN[1]} />
  <line class="tick" x1={GA_ORIGIN[0] - 3} y1={GA_ORIGIN[1] + H} x2={GA_ORIGIN[0] - 1} y2={GA_ORIGIN[1] + H} />
  <text class="dimtext" transform="rotate(-90 {GA_ORIGIN[0] - 2.5} {GA_ORIGIN[1] + H / 2})" x={GA_ORIGIN[0] - 2.5} y={GA_ORIGIN[1] + H / 2} text-anchor="middle"
    >{ga.enclosure.h}</text
  >

  {#each page.gaItems ?? [] as base (base.id)}
    {@const it = preview?.get(base.id) ?? base}
    {@const x = GA_ORIGIN[0] + u(it.x)}
    {@const y = GA_ORIGIN[1] + u(it.y)}
    {@const w = u(it.w)}
    {@const h = u(it.h)}
    {#if it.kind === "rail"}
      <!-- DIN rail: the rail with its slots' centre line. -->
      <rect class="rail" {x} {y} width={w} height={h} />
      {#if w >= h}
        <line class="slots" x1={x} y1={y + h / 2} x2={x + w} y2={y + h / 2} />
      {:else}
        <line class="slots" x1={x + w / 2} y1={y} x2={x + w / 2} y2={y + h} />
      {/if}
    {:else if it.kind === "trunking"}
      <rect class="trunking" {x} {y} width={w} height={h} />
      <rect class="trunking-in" x={x + Math.min(w, h) * 0.15} y={y + Math.min(w, h) * 0.15} width={Math.max(0, w - Math.min(w, h) * 0.3)} height={Math.max(0, h - Math.min(w, h) * 0.3)} />
    {:else if it.kind === "device"}
      {@const text = label(it)}
      {@const n = it.refs?.length ?? 0}
      {@const fit = fitLabel(text, w, h)}
      <rect class="device" {x} {y} width={w} height={h} />
      {#if n > 1}
        <!-- A terminal strip: each terminal. -->
        {#each Array.from({ length: n - 1 }, (_, i) => i + 1) as i (i)}
          {#if w >= h}
            <line class="slice" x1={x + (w / n) * i} y1={y} x2={x + (w / n) * i} y2={y + h} />
          {:else}
            <line class="slice" x1={x} y1={y + (h / n) * i} x2={x + w} y2={y + (h / n) * i} />
          {/if}
        {/each}
      {/if}
      <text
        class="tag"
        class:halo={fit.halo}
        x={x + w / 2}
        y={y + h / 2}
        font-size={fit.size}
        text-anchor="middle"
        dominant-baseline="central"
        transform={fit.vertical ? `rotate(-90 ${x + w / 2} ${y + h / 2})` : undefined}>{text}</text
      >
    {:else if it.kind === "note"}
      <text class="note" {x} y={y + h * 0.8}>{it.text ?? ""}</text>
    {/if}
  {/each}
</g>

<style>
  .ga text {
    font-family: var(--drawing-font);
    fill: #000;
  }
  .encl {
    fill: none;
    stroke: #000;
    stroke-width: 0.35;
  }
  .title {
    font-size: var(--tag);
  }
  .dim,
  .tick {
    stroke: #000;
    stroke-width: 0.1;
  }
  .dimtext {
    font-size: var(--detail);
  }
  .rail {
    fill: #eef0f2;
    stroke: #000;
    stroke-width: 0.12;
  }
  .slots {
    stroke: #000;
    stroke-width: 0.08;
    stroke-dasharray: 0.5 0.35;
  }
  .trunking {
    fill: #f7f7f7;
    stroke: #000;
    stroke-width: 0.15;
  }
  .trunking-in {
    fill: none;
    stroke: #888;
    stroke-width: 0.08;
  }
  .device {
    fill: #fff;
    stroke: #000;
    stroke-width: 0.15;
  }
  .slice {
    stroke: #000;
    stroke-width: 0.06;
  }
  .tag {
    /* A thin white edge keeps it clean where it crosses a terminal's slice line. */
    paint-order: stroke;
    stroke: #fff;
    stroke-width: 0.12;
    stroke-linejoin: round;
  }
  .tag.halo {
    stroke-width: 0.35;
  }
  .note {
    font-size: var(--detail);
  }
</style>
