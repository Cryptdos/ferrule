<script lang="ts">
  import { moduleTypeName } from "../../core/modules";
  import type { Element, GaItem, Page, Project } from "../../core/model";
  import {
    GA_ORIGIN,
    cutoutText,
    dimLayout,
    doorOwner,
    drawnGaItems,
    gaFrame,
    gaSize,
    detailLabel,
    frameCaption,
    frameView,
    isDoorView,
    mmToUnits,
    parseCutout,
    scaleText,
    paneName,
    plateDoor,
    platesOf,
    sheetLeaves,
    sheetPanes,
    shownPane,
    type DrawnGaItem,
  } from "../../core/ga";
  import { textUnits } from "../../core/geometry";
  import { displayTag } from "../../core/tags";
  import { resolveFields } from "../../core/fields";
  import { lampGlow } from "../lamps";
  import GaLayer from "./GaLayer.svelte";

  /** A GA sheet's enclosure (or door) and items, drawn at its scale (grid units, like the rest of the sheet). */
  let {
    project,
    page: sheet,
    preview = null,
    lit = null,
    zoomScale,
    frameDims = [],
  }: {
    project: Project;
    page: Page;
    /**
     * Drawn inside a detail frame (design-v0.3 §6): the sheet at this scale
     * instead of its own, without its title, size, dimensions or detail boxes.
     */
    zoomScale?: number;
    /** In a frame: the dimensions that belong to it, measuring this sheet (its mm). */
    frameDims?: GaItem[];
    /** Items being dragged or sized: their temporary place, by id. */
    preview?: Map<string, GaItem> | null;
    /**
     * Simulate: schematic lamps that are lit (design-v0.3 §4). Their door
     * lamps glow in their colour; for seeing only, nothing here is clicked.
     */
    lit?: Set<string> | null;
  } = $props();

  const inFrame = $derived(zoomScale !== undefined);
  const page = $derived(zoomScale !== undefined ? { ...sheet, ga: { ...sheet.ga!, scale: zoomScale } } : sheet);
  const ga = $derived(page.ga!);
  const detailView = $derived(ga.view === "detail");
  const frame = $derived(gaFrame(project, page));
  const size = $derived(gaSize(project, page));
  const u = (mm: number) => mmToUnits(frame, mm);
  const X = (mm: number) => GA_ORIGIN[0] + u(mm - frame.x0);
  const Y = (mm: number) => GA_ORIGIN[1] + u(mm - (frame.y0 ?? 0));
  const W = $derived(u(frame.w));
  const H = $derived(u(frame.h));
  const byId = $derived(new Map(project.pages.flatMap((pg) => pg.elements.map((e) => [e.id, e]))));
  const drawn = $derived(
    drawnGaItems(project, page).map((d): DrawnGaItem => (d.own && preview?.get(d.it.id) ? { ...d, it: preview.get(d.it.id)! } : d)),
  );
  const door = $derived(isDoorView(ga.view));
  const owner = $derived(doorOwner(project, page));
  // Each door (a leaf, or one door of a modular door) the sheet shows, as it sees it (v0.4.x M13).
  const fy0 = $derived(frame.y0 ?? 0);
  const panes = $derived(
    sheetPanes(project, page).filter((p) => p.x + p.w > frame.x0 + 0.01 && p.x < frame.x0 + frame.w - 0.01 && p.y + p.h > fy0 + 0.01 && p.y < fy0 + frame.h - 0.01),
  );
  const modular = $derived(!!owner?.ga?.columns?.length);
  // Plates behind the doors, so each door says where its plate is.
  const plates = $derived(owner ? platesOf(project, owner) : new Map<string, Page>());

  /** What a device says: its tag(s), or its own text. */
  function label(it: GaItem): string {
    if (it.text) return it.text;
    // A controller's module: its tag and type.
    if (it.module) {
      const m = project.plant.find((p) => p.id === it.module);
      if (m && !m.module) return m.tag || `${m.prefix || "U"}?`; // plant in the panel (v0.4.x T3)
      return m?.module ? `${m.tag || `${m.prefix || "A"}?`} ${moduleTypeName(m.module)}` : "(deleted)";
    }
    const els = (it.refs ?? []).map((r) => byId.get(r)).filter((e) => !!e);
    if (!els.length) return it.refs?.length ? "(deleted)" : "";
    if (els[0]!.symbol === "terminal") return String(els[0]!.params.strip ?? "X1");
    return displayTag(els[0]!, project);
  }
  /** The schematic part a door device is drawn from, if it's one. */
  function doorPart(it: GaItem): { el: Element; kind: "lamp" | "pushbutton" | "selector" | "handle" } | null {
    const el = it.refs?.length === 1 ? byId.get(it.refs[0]!) : undefined;
    if (!el) return null;
    if (it.part === "handle") return { el, kind: "handle" };
    return el.symbol === "lamp" || el.symbol === "pushbutton" || el.symbol === "selector" ? { el, kind: el.symbol } : null;
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
  function fitLabel(text: string, w: number, h: number, best = BEST): { size: number; vertical: boolean; halo: boolean } {
    const n = Math.max(1, text.length);
    const fits = (len: number, across: number) => Math.min(best, (len * 0.9) / (n * CHAR), across * 1.15);
    const flat = fits(w, h);
    const up = fits(h, w);
    const vertical = up > flat + 0.05;
    const size = vertical ? up : flat;
    return { size: Math.max(SMALLEST, size), vertical, halo: size < SMALLEST };
  }
  const LENS: Record<string, string> = { Rd: "#e03131", Ye: "#fcc419", Gn: "#2f9e44", Bu: "#1c7ed6", Wh: "#ffffff", Cl: "#f1f3f5" };
  const title = $derived.by(() => {
    const what = ga.view === "door-front" ? "DOOR FRONT" : ga.view === "door-back" ? "DOOR BACK, FROM INSIDE" : "BACKPLATE";
    const one = shownPane(project, page);
    const leaf = modular && one ? ` · ${paneName(one).toUpperCase()}` : ga.leaf !== undefined && sheetLeaves(project, page).length > 1 ? (ga.leaf === 0 ? " · LEFT LEAF" : " · RIGHT LEAF") : "";
    const of = owner && owner !== page ? ` · DOOR ON SHEET ${owner.number}` : "";
    // A compartment's plate names its door (v0.4.x M13).
    const pd = ga.view === "backplate" ? plateDoor(project, page) : null;
    if (pd) return `BACKPLATE BEHIND ${paneName(pd.pane).toUpperCase()}, DOOR ON SHEET ${pd.front.number}: ${frame.w} W × ${frame.h} H mm · SCALE ${scaleText(ga.scale)}`;
    return `${what}${leaf}${of}: ${frame.w} W × ${frame.h} H mm · SCALE ${scaleText(ga.scale)}`;
  });
</script>

<defs>
  <!-- Green-yellow stripes, for earth terminals. -->
  <pattern id="ga-gnye" width="1.2" height="1.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <rect width="1.2" height="1.2" fill="#f2d21b" />
    <rect width="0.6" height="1.2" fill="#2f9e44" />
  </pattern>
</defs>
<g class="ga">
  {#if !inFrame && !detailView}
  <!-- The enclosure (or door), with its size. -->
  <rect class="encl" x={GA_ORIGIN[0]} y={GA_ORIGIN[1]} width={W} height={H} />
  <text class="title" x={GA_ORIGIN[0]} y={GA_ORIGIN[1] - 5.5}>{title}</text>
  <line class="dim" x1={GA_ORIGIN[0]} y1={GA_ORIGIN[1] - 2} x2={GA_ORIGIN[0] + W} y2={GA_ORIGIN[1] - 2} />
  <line class="tick" x1={GA_ORIGIN[0]} y1={GA_ORIGIN[1] - 3} x2={GA_ORIGIN[0]} y2={GA_ORIGIN[1] - 1} />
  <line class="tick" x1={GA_ORIGIN[0] + W} y1={GA_ORIGIN[1] - 3} x2={GA_ORIGIN[0] + W} y2={GA_ORIGIN[1] - 1} />
  <text class="dimtext" x={GA_ORIGIN[0] + W / 2} y={GA_ORIGIN[1] - 2.5} text-anchor="middle">{frame.w}</text>
  <line class="dim" x1={GA_ORIGIN[0] - 2} y1={GA_ORIGIN[1]} x2={GA_ORIGIN[0] - 2} y2={GA_ORIGIN[1] + H} />
  <line class="tick" x1={GA_ORIGIN[0] - 3} y1={GA_ORIGIN[1]} x2={GA_ORIGIN[0] - 1} y2={GA_ORIGIN[1]} />
  <line class="tick" x1={GA_ORIGIN[0] - 3} y1={GA_ORIGIN[1] + H} x2={GA_ORIGIN[0] - 1} y2={GA_ORIGIN[1] + H} />
  <text class="dimtext" transform="rotate(-90 {GA_ORIGIN[0] - 2.5} {GA_ORIGIN[1] + H / 2})" x={GA_ORIGIN[0] - 2.5} y={GA_ORIGIN[1] + H / 2} text-anchor="middle"
    >{frame.h}</text
  >
  {/if}

  {#if door}
    <!-- Each door: its outline where it meets another, and the hinge side shown by the usual converging swing lines. -->
    {#each panes as l (l.col + ":" + l.row)}
      {@const x0 = X(Math.max(l.x, frame.x0))}
      {@const top = Math.max(l.y, fy0)}
      {@const hingeX = l.hinge === "left" ? X(l.x) : X(l.x + l.w)}
      {@const openX = l.hinge === "left" ? X(l.x + l.w) : X(l.x)}
      <polyline class="swing" points="{openX},{Y(l.y)} {hingeX},{Y(l.y + l.h / 2)} {openX},{Y(l.y + l.h)}" />
      {#each !modular || l.h > 300 ? [0.15, 0.85] : [0.25, 0.75] as f (f)}
        <rect class="hinge" x={hingeX - 0.35} y={Y(l.y + l.h * f) - 1.2} width="0.7" height="2.4" />
      {/each}
      {#if l.x > 0.01 && l.x > frame.x0 + 0.01}
        <line class="split" x1={x0} y1={Y(top)} x2={x0} y2={Y(Math.min(l.y + l.h, fy0 + frame.h))} />
      {/if}
      {#if l.y > 0.01 && l.y > fy0 + 0.01}
        <line class="split" x1={X(Math.max(l.x, frame.x0))} y1={Y(l.y)} x2={X(Math.min(l.x + l.w, frame.x0 + frame.w))} y2={Y(l.y)} />
      {/if}
      {#if modular && l.name}<text class="panename" x={X(Math.max(l.x, frame.x0)) + 0.8} y={Y(top) + SMALLEST * 1.6} font-size={SMALLEST}>{l.name}</text>{/if}
      {#if plates.get(`${l.col}:${l.row}`)}<text class="panename" x={X(Math.max(l.x, frame.x0)) + 0.8} y={Y(Math.min(l.y + l.h, fy0 + frame.h)) - SMALLEST * 0.8} font-size={SMALLEST}>BACKPLATE: SHEET {plates.get(`${l.col}:${l.row}`)!.number}</text>{/if}
    {/each}
  {/if}

  {#each drawn.filter((d) => (!inFrame || (d.it.kind !== "dim" && d.it.kind !== "detail")) && !(d.it.kind === "dim" && d.it.frame)) as d (d.it.id + (d.own ? "" : "~"))}
    {@const it = d.it}
    {@const x = X(it.x)}
    {@const y = Y(it.y)}
    {@const w = u(it.w)}
    {@const h = u(it.h)}
    {#if it.kind === "detail"}
      <!-- An area shown on a detail sheet: dashed, with its letter and where it's shown, A (12). -->
      <rect class="detailbox" {x} {y} width={w} height={h} />
      <text class="detaillabel halo" x={x} y={y - 0.6}>{detailLabel(project, it)}</text>
    {:else if it.kind === "frame"}
      <!-- What's inside the detail, at the frame's scale, cut off at its edge (design-v0.3 §6). -->
      {@const fv = frameView(project, it)}
      {#if fv}
        <clipPath id="frame-clip-{it.id}"><rect {x} {y} width={w} height={h} /></clipPath>
        <g clip-path="url(#frame-clip-{it.id})">
          <g transform="translate({fv.dx} {fv.dy})">
            <!-- Edits made through the frame show while they're dragged; its own dimensions are drawn with it. -->
            <GaLayer {project} page={fv.page} zoomScale={1 / fv.k} {lit} {preview} frameDims={(page.gaItems ?? []).filter((x) => x.kind === "dim" && x.frame === it.id).map((x) => preview?.get(x.id) ?? x)} />
          </g>
        </g>
      {/if}
      <rect class="frame" {x} {y} width={w} height={h} />
      <text class="caption" x={x + w / 2} y={y + h + 3.2} text-anchor="middle">{frameCaption(project, it)}</text>
    {:else if it.kind === "dim"}
      {@const lay = dimLayout(project, page, it, drawn)}
      <g class="dimension">
        {#each lay.lines as l, i (i)}<line x1={l[0]} y1={l[1]} x2={l[2]} y2={l[3]} />{/each}
        {#each lay.texts as t, i (i)}
          <text
            class="dimtext"
            x={t.at[0]}
            y={t.at[1]}
            text-anchor="middle"
            transform={t.vertical ? `rotate(-90 ${t.at[0]} ${t.at[1]})` : undefined}>{t.text}</text
          >
        {/each}
      </g>
    {:else if it.kind === "rail"}
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
    {:else if it.kind === "label"}
      {#if !d.back}
        <!-- A label plate at true size: its engraving, as large as it really is where that reads. -->
        {@const text = it.text || "LABEL"}
        {@const lines = text.split("\n")}
        {@const fit = fitLabel(lines.reduce((a, b) => (a.length >= b.length ? a : b), ""), w * 0.92, h / lines.length, Math.max(SMALLEST, u(it.textMm ?? 5)))}
        <rect class="plate" {x} {y} width={w} height={h} />
        <rect class="plate-in" x={x + Math.min(0.3, w * 0.05)} y={y + Math.min(0.3, h * 0.08)} width={Math.max(0, w - 2 * Math.min(0.3, w * 0.05))} height={Math.max(0, h - 2 * Math.min(0.3, h * 0.08))} />
        {#each lines as line, i (i)}
          <text class="tag" class:halo={fit.halo} x={x + w / 2} y={y + h / 2 + (i - (lines.length - 1) / 2) * fit.size * 1.25} font-size={fit.size} text-anchor="middle" dominant-baseline="central"
            >{line}</text
          >
        {/each}
      {/if}
    {:else if it.kind === "device"}
      {@const text = label(it)}
      {@const dp = door && !d.back && ga.view === "door-front" ? doorPart(it) : null}
      {@const bp = d.back ? doorPart(it) : null}
      {#if dp}
        <!-- A door device drawn from its schematic part: bezel, then the lens, button, knob or handle; its legend below. -->
        {@const plateH = dp.kind === "handle" ? 0 : Math.min(h * 0.3, Math.max(h - w, h * 0.22))}
        {@const top = h - plateH}
        {@const r = (Math.min(w, top) / 2) * 0.9}
        {@const cx = x + w / 2}
        {@const cy = y + top / 2}
        {@const legend = dp.el.label?.trim() ? resolveFields(dp.el.label, project).replace(/\n/g, " ") : text}
        {@const lf = fitLabel(legend, w * 0.94, plateH)}
        <!-- Too small at this scale for its legend to read: just its tag, under it. -->
        {@const small = lf.halo || w < SMALLEST * 3}
        {#if dp.kind === "handle"}
          <rect class="device" {x} {y} width={w} height={h} />
          <circle class="bezel" {cx} {cy} r={r * 0.85} />
          <rect class="knob" x={cx - r * 0.12} y={cy - r * 0.75} width={r * 0.24} height={r * 1.5} rx={r * 0.08} />
          <text class="mark" x={cx} y={cy - r * 0.95} font-size={SMALLEST} text-anchor="middle">0</text>
          <text class="mark" x={cx + r * 0.95} y={cy + SMALLEST * 0.35} font-size={SMALLEST}>I</text>
          <text class="tag halo" x={cx} y={y + h + SMALLEST * 1.05} font-size={SMALLEST} text-anchor="middle">{text}</text>
        {:else}
          <rect class="legend" {x} y={y + top} width={w} height={plateH} />
          <circle class="bezel" {cx} {cy} {r} />
          {#if dp.kind === "lamp" && lit?.has(dp.el.id)}
            <!-- Lit in Simulate: it glows in its colour, as the schematic lamp does. -->
            <circle class="glow" {cx} {cy} r={r * 1.9} style:fill={lampGlow(dp.el.params.colour)} />
            <circle class="lens lit" {cx} {cy} r={r * 0.72} style:fill={lampGlow(dp.el.params.colour)} />
          {:else if dp.kind === "lamp"}
            <!-- In Simulate an unlit lamp is drawn dim, so the lit ones stand out. -->
            <circle class="lens" class:off={!!lit} {cx} {cy} r={r * 0.72} style:fill={LENS[String(dp.el.params.colour)] ?? "#ffffff"} />
          {:else if dp.kind === "pushbutton"}
            <circle class="button" {cx} {cy} r={r * 0.72} />
            <circle class="button-in" {cx} {cy} r={r * 0.55} />
          {:else}
            <circle class="button" {cx} {cy} r={r * 0.72} />
            {#if dp.el.params.key}
              <rect class="knob" x={cx - r * 0.08} y={cy - r * 0.35} width={r * 0.16} height={r * 0.7} />
            {:else}
              <rect class="knob" x={cx - r * 0.14} y={cy - r * 0.68} width={r * 0.28} height={r * 1.36} rx={r * 0.1} />
            {/if}
          {/if}
          {#if small}
            <text class="tag halo" x={cx} y={y + h + SMALLEST * 1.05} font-size={SMALLEST} text-anchor="middle">{text}</text>
          {:else}
            {#if legend !== text}
              <!-- The tag on the device when the legend says what it does. -->
              {@const tf = fitLabel(text, r * 1.4, r * 0.7)}
              <text class="tag halo" x={cx} y={cy} font-size={tf.size} text-anchor="middle" dominant-baseline="central">{text}</text>
            {/if}
            <text class="tag" x={cx} y={y + top + plateH / 2} font-size={lf.size} text-anchor="middle" dominant-baseline="central">{legend}</text>
          {/if}
        {/if}
      {:else if d.back}
        <!-- Seen from inside: what's mounted through the door (dashed), and its cut-out. -->
        {@const c = parseCutout(it.cutout)}
        {@const top = bp && bp.kind !== "handle" ? h * 0.7 : h}
        {@const cx = x + w / 2}
        {@const cy = y + top / 2}
        <rect class="behind" {x} {y} width={w} height={h} />
        {#if c && "d" in c}
          <circle class="cutout" {cx} {cy} r={u(c.d) / 2} />
        {:else if c}
          <rect class="cutout" x={cx - u(c.w) / 2} y={cy - u(c.h) / 2} width={u(c.w)} height={u(c.h)} />
        {/if}
        {#if bp?.kind === "lamp" && lit?.has(bp.el.id)}
          <!-- Lit in Simulate: the glow shows from inside too. -->
          <circle class="glow" {cx} {cy} r={Math.min(w, top) * 0.45} style:fill={lampGlow(bp.el.params.colour)} />
        {/if}
        <text class="tag halo" x={cx} y={y + h + SMALLEST * 1.05} font-size={SMALLEST} text-anchor="middle">{text}</text>
        {#if c}
          <text class="dimtext halo" x={cx} y={y + h + SMALLEST * 2.3} text-anchor="middle">{cutoutText(it.cutout)}</text>
        {/if}
      {:else}
        {@const n = it.refs?.length ?? 0}
        {@const fit = fitLabel(text, w, h)}
        <rect class="device" {x} {y} width={w} height={h} />
        <!-- Earth terminals are green-yellow, in their place in the strip (9). -->
        {#each (it.refs ?? []).map((r) => byId.get(r)) as t, i (i)}
          {#if t?.symbol === "terminal" && t.params.function === "earth"}
            {#if w >= h}
              <rect class="earth" x={x + (w / n) * i} {y} width={w / n} height={h} />
            {:else}
              <rect class="earth" {x} y={y + (h / n) * i} width={w} height={h / n} />
            {/if}
          {/if}
        {/each}
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
      {/if}
    {/if}
  {/each}
  {#each frameDims as it (it.id)}
    {@const lay = dimLayout(project, page, it, drawn)}
    <g class="dimension">
      {#each lay.lines as l, i (i)}<line x1={l[0]} y1={l[1]} x2={l[2]} y2={l[3]} />{/each}
      {#each lay.texts as t, i (i)}
        <text class="dimtext" x={t.at[0]} y={t.at[1]} text-anchor="middle" transform={t.vertical ? `rotate(-90 ${t.at[0]} ${t.at[1]})` : undefined}>{t.text}</text>
      {/each}
    </g>
  {/each}
</g>

<style>
  .ga .earth {
    fill: url(#ga-gnye);
    stroke: none;
    opacity: 0.85;
  }
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
  .tick,
  .dimension line {
    stroke: #000;
    stroke-width: 0.1;
  }
  .dimtext {
    font-size: var(--detail);
  }
  .swing {
    fill: none;
    stroke: #000;
    stroke-width: 0.07;
    stroke-dasharray: 1.2 0.5 0.2 0.5;
  }
  .panename {
    fill: #333;
  }
  .hinge {
    fill: #000;
  }
  .split {
    stroke: #000;
    stroke-width: 0.3;
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
  .device,
  .legend,
  .plate {
    fill: #fff;
    stroke: #000;
    stroke-width: 0.15;
  }
  .plate-in {
    fill: none;
    stroke: #000;
    stroke-width: 0.06;
  }
  .bezel,
  .button,
  .button-in {
    fill: #fff;
    stroke: #000;
    stroke-width: 0.12;
  }
  .button-in {
    stroke-width: 0.07;
  }
  .detailbox {
    fill: none;
    stroke: #000;
    stroke-width: var(--thin, 0.14);
    stroke-dasharray: 1.2 0.6;
  }
  .detaillabel {
    font-family: var(--drawing-font);
    font-size: var(--tag, 1.35px);
  }
  .frame {
    fill: none;
    stroke: #000;
    stroke-width: var(--thick, 0.27);
  }
  .caption {
    font-family: var(--drawing-font);
    font-size: var(--tag, 1.35px);
  }
  .lens {
    stroke: #000;
    stroke-width: 0.1;
  }
  /* A lamp lit in Simulate (design-v0.3 §4). */
  .glow {
    opacity: 0.6;
    filter: blur(0.5px);
  }
  .lens.off {
    fill-opacity: 0.25;
  }
  .knob {
    fill: #444;
    stroke: #000;
    stroke-width: 0.06;
  }
  .behind {
    fill: none;
    stroke: #000;
    stroke-width: 0.1;
    stroke-dasharray: 0.6 0.4;
  }
  .cutout {
    fill: #fff;
    stroke: #000;
    stroke-width: 0.18;
  }
  .slice {
    stroke: #000;
    stroke-width: 0.06;
  }
  .tag,
  .halo {
    /* A thin white edge keeps it clean where it crosses a terminal's slice line. */
    paint-order: stroke;
    stroke: #fff;
    stroke-width: 0.12;
    stroke-linejoin: round;
  }
  .halo {
    stroke-width: 0.35;
  }
  .mark {
    font-size: var(--detail);
  }
</style>
