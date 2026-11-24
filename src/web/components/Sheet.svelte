<script lang="ts">
  import type { Snippet } from "svelte";
  import { AREA_MM, AREA_UNITS, SHEET_MM, UNIT_MM, lineUnits, textUnits } from "../../core/geometry";
  import type { Page, Project, Segment } from "../../core/model";
  import type { Vec } from "../../core/geometry";
  import { blockHalf } from "../../core/blocks";
  import { BLOCK_INSET, blockLabels, connectionDots, earthConductors, isFieldWire, isScreenWire, numberedSegments, routeOf, wireTexts } from "../../core/wires";
  import { resolveFields } from "../../core/fields";
  import { cloudsOn } from "../../core/ops";
  import { conductorLooks, coreCss } from "../../core/wirecolours";
  import { cloudPath } from "../../core/titleblock";
  import ElementView from "./ElementView.svelte";
  import { benchOf, isBar } from "../../core/symbols";
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
    positions = null,
    colourCheck = false,
    gaPreview = null,
    under,
    over,
    focus = null,
    litLamps = null,
    textAt,
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
    /** Simulate: the position each selector is in, to box its name in the legend. */
    positions?: Record<string, number> | null;
    /** Colour check: every wire and busbar drawn in its core colour (v0.2.1 note 31). */
    colourCheck?: boolean;
    /** GA items being dragged or sized: where they'd go. */
    gaPreview?: Map<string, GaItem> | null;
    /** Extra drawing in grid units, under the elements (selection boxes). */
    under?: Snippet;
    /** Extra drawing in grid units, over the elements (ghosts, handles). */
    over?: Snippet;
    /**
     * On screen, the workbench being worked in: what can't be picked in it is
     * drawn grey (note 8). Unset for print and previews.
     */
    focus?: "draft" | "annotate" | null;
    /** Simulate: lamps lit, by schematic id, drawn lit on a door GA (design-v0.3 §4). */
    litLamps?: Set<string> | null;
    /** A wire's number or colour being slid along it (v0.4.x T13): where it shows while dragged. */
    textAt?: (seg: Segment) => { numberAt?: number; colourAt?: number } | null;
  } = $props();
  const dimDraft = $derived(focus === "annotate");
  const dimAnnotate = $derived(focus === "draft");

  // Line weights and text sizes, in grid units, for the styles below.
  const STYLE_VARS = [
    `--thin: ${lineUnits("thin")}`,
    `--thick: ${lineUnits("thick")}`,
    `--detail: ${textUnits("detail")}px`,
    `--tag: ${textUnits("tag")}px`,
    `--heading: ${textUnits("heading")}px`,
  ].join("; ");
  const dots = $derived(routes ? [] : connectionDots(page));
  const clouds = $derived(cloudsOn(project, page.id));
  const boundaryY = $derived(boundary !== undefined && boundary !== null ? boundary : page.boundaryY);

  /** Field wires (out to plant) are drawn dashed and don't print their number unless asked to. */
  const field = $derived(new Set(page.segments.filter((s) => isFieldWire(page, s)).map((s) => s.id)));

  const onBusbar = (ref: [string, string]) => isBar(page.elements.find((e) => e.id === ref[0]));
  /** Wires from a cable screen are dashed like the screen (26). */
  const screen = $derived(new Set(page.segments.filter((s) => isScreenWire(page, s)).map((s) => s.id)));

  const condById = $derived(new Map(project.conductors.map((c) => [c.id, c])));
  /** Each wire's colour: its own, else its function's from the project's table (v0.4.x M3). */
  const looks = $derived(conductorLooks(project));
  /** Which wires print their number: once per conductor per sheet, none on field or earth wires by default (15, 24). */
  const numbered = $derived(numberedSegments(page, earthConductors(project), (s) => routes?.get(s.id) ?? routeOf(page, s)));
  /** Terminal strip lines are drawn over the terminals they cross (v0.2.1 note 1). */
  const drawOrder = $derived([...page.elements.filter((e) => e.symbol !== "strip-line"), ...page.elements.filter((e) => e.symbol === "strip-line")]);
</script>

<rect class="paper" x="0" y="0" width={SHEET_MM.w} height={SHEET_MM.h} />
<Frame />
<TitleBlock {project} {page} />
<g transform="translate({AREA_MM.x} {AREA_MM.y}) scale({UNIT_MM})" style={STYLE_VARS}>
  {#if grid}
    <rect class="grid" x="0" y="0" width={AREA_UNITS.w} height={AREA_UNITS.h} fill="url(#ferrule-grid)" />
  {/if}
  {#each page.sections as sec (sec.id)}
    {@const r = sectionRects?.get(sec.id) ?? sec.rect}
    <g class="section" class:dim={dimAnnotate}>
      <rect x={r[0]} y={r[1]} width={r[2]} height={r[3]} />
      {#if sec.label}
        <text x={r[0] + 0.8} y={r[1] + 2}>{resolveFields(sec.label, project)}</text>
      {/if}
    </g>
  {/each}
  {#if boundaryY !== null}
    <!-- Panel boundary: the terminal block, full width; its terminals are cells in it. -->
    <rect class="block" class:dim={dimDraft} x={BLOCK_INSET} y={boundaryY - blockHalf(page)} width={AREA_UNITS.w - BLOCK_INSET * 2} height={blockHalf(page) * 2} />
    {#each blockLabels(page) as l (l.x)}
      <text class="strip" class:dim={dimDraft} x={l.x} y={boundaryY + 0.42} text-anchor={l.anchor}>{l.text}</text>
    {/each}
  {/if}
  {@render under?.()}
  {#if colourCheck}
    <!-- Busbars in their colour: their own, else their distribution's. -->
    {#each page.elements.filter((e) => isBar(e)) as el (el.id)}
      {@const len = Number(el.params.length) || 0}
      {@const v = el.rot === 90 ? [0, 1] : el.rot === 180 ? [-1, 0] : el.rot === 270 ? [0, -1] : [1, 0]}
      {@const own = String(el.params.colour ?? "")}
      {@const dist = project.distributions.find((d) => d.id === el.params.dist)}
      {@const css = coreCss(own || dist?.colour)}
      {@const line = `${el.pos[0]},${el.pos[1]} ${el.pos[0] + v[0]! * len},${el.pos[1] + v[1]! * len}`}
      {#if !css.length}
        <polyline class="cc-none bar" points={line} />
      {:else}
        <polyline class="cc-edge bar" points={line} />
        <polyline class="cc bar" points={line} style:stroke={css[0]} />
        {#if css[1]}<polyline class="cc cc-second bar" points={line} style:stroke={css[1]} />{/if}
      {/if}
    {/each}
  {/if}
  <g class="wires" class:dim={dimDraft}>
    {#each page.segments as seg (seg.id)}
      {@const pts = routes?.get(seg.id) ?? routeOf(page, seg)}
      {@const c = condById.get(seg.conductor)}
      <!-- Live wires are red, whatever their core colour: a black or grey core would hide it. -->
      <polyline class:field={field.has(seg.id)} class:screen={screen.has(seg.id)} class:live={!!live?.has(seg.conductor)} points={pts.map((p) => p.join(",")).join(" ")} />
      {#if colourCheck}
        {@const css = coreCss(c ? looks.get(c.id)?.colour : undefined)}
        {@const line = pts.map((p) => p.join(",")).join(" ")}
        {#if !css.length}
          <!-- No colour set: drawn hatched grey, so it stands out. -->
          <polyline class="cc-none" points={line} />
        {:else}
          <polyline class="cc-edge" points={line} />
          <polyline class="cc" points={line} style:stroke={css[0]} />
          {#if css[1]}<polyline class="cc cc-second" points={line} style:stroke={css[1]} />{/if}
        {/if}
      {/if}
      {#if c}
        {#each wireTexts(pts, {
          // Shown by the usual rules, unless the wire says otherwise.
          number: numbered.has(seg.id) ? c.number : "",
          colour: seg.showColour === false ? undefined : looks.get(c.id)?.colour,
          func: c.function,
          railFrom: onBusbar(seg.from),
          railTo: onBusbar(seg.to),
          ...(textAt?.(seg) ?? { numberAt: seg.numberAt, colourAt: seg.colourAt }),
        }) as t, i (i)}
          <text
            class="wirenum"
            data-wiretext={seg.id}
            data-role={t.role}
            class:tagsize={t.size === "tag"}
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
  {#if page.ga}<GaLayer {project} {page} preview={gaPreview} lit={litLamps} />{/if}
  {#each drawOrder as el (el.id)}
    {@const o = offset?.(el.id)}
    <g class:dim={focus && benchOf(el) !== focus}>
      <ElementView
        el={ops?.[el.id] || positions?.[el.id] !== undefined
          ? { ...el, params: { ...el.params, ...(ops?.[el.id] ? { __op: true } : {}), ...(positions?.[el.id] !== undefined ? { __pos: positions[el.id]! } : {}) } }
          : el}
        {project}
        dx={o?.[0] ?? 0}
        dy={o?.[1] ?? 0}
      />
    </g>
  {/each}
  {#each clouds as c (c.id)}
    {@const [x, y, w] = c.rect}
    <g class="cloud" class:dim={dimAnnotate}>
      <path d={cloudPath(c.rect)} />
      <polygon points="{x + w + 0.2},{y - 3.2} {x + w + 2.2},{y - 0.2} {x + w - 1.8},{y - 0.2}" />
      <text x={x + w + 0.2} y={y - 0.75} text-anchor="middle">{c.rev}</text>
    </g>
  {/each}
  {@render over?.()}
</g>

<style>
  /* Colour check (v0.2.1 note 31): cores drawn in their colours, a dark edge so white shows. */
  polyline.cc-edge {
    fill: none;
    stroke: #333;
    stroke-width: 0.62;
    stroke-linecap: round;
  }
  polyline.cc {
    fill: none;
    stroke-width: 0.45;
    stroke-linecap: round;
  }
  polyline.cc-second {
    stroke-dasharray: 1 1;
    stroke-linecap: butt;
  }
  polyline.cc-none {
    fill: none;
    stroke: #b0b0b0;
    stroke-width: 0.45;
    stroke-dasharray: 0.4 0.4;
  }
  polyline.bar {
    stroke-width: 0.8;
  }
  polyline.cc-edge.bar {
    stroke-width: 1;
  }

  .paper {
    fill: var(--paper, #fff);
  }
  /* Not pickable in this workbench: grey, about 55% black, still easy to read. */
  .dim {
    opacity: 0.55;
  }
  .wires polyline {
    fill: none;
    stroke: #000;
    stroke-width: var(--thin);
    stroke-linejoin: miter;
    stroke-linecap: square;
  }
  .wires polyline.live {
    stroke: #d42020;
    stroke-width: var(--thick);
  }
  .wires polyline.field {
    stroke-dasharray: 0.9 0.5;
  }
  .wires polyline.screen {
    stroke-dasharray: 0.6 0.4;
  }
  .section rect {
    fill: none;
    stroke: #000;
    stroke-width: var(--thin);
    stroke-dasharray: 1.2 0.6;
  }
  .section text {
    font-family: var(--drawing-font);
    font-size: var(--heading);
    fill: #000;
  }
  .cloud path,
  .cloud polygon {
    fill: none;
    stroke: #000;
    stroke-width: var(--thin);
  }
  .cloud text {
    font-family: var(--drawing-font);
    font-size: var(--tag);
    fill: #000;
  }
  /* Panel boundary: the terminal block. */
  .block {
    fill: none;
    stroke: #000;
    stroke-width: var(--thick);
  }
  .strip {
    font-family: var(--drawing-font);
    font-size: var(--tag);
    fill: #000;
  }
  .wires circle {
    fill: #000;
  }
  .wirenum {
    font-family: var(--drawing-font);
    font-size: var(--detail);
    fill: #000;
  }
  .wirenum.tagsize {
    font-size: var(--tag);
  }
</style>
