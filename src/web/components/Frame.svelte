<script lang="ts">
  import { AREA_MM, AREA_H_MM, COLUMNS, LINE_MM, SIDE_TICK_UNITS, TEXT_MM, UNIT_MM, AREA_UNITS, UNITS_PER_COLUMN } from "../../core/geometry";

  const colW = UNIT_MM * UNITS_PER_COLUMN;
  const ticks = Array.from({ length: Math.floor((COLUMNS - 1) / 5) }, (_, i) => (i + 1) * 5);
  const labels = Array.from({ length: Math.floor((COLUMNS - 1) / 10) }, (_, i) => (i + 1) * 10);
  const sideTicks = Array.from(
    { length: Math.floor(AREA_UNITS.h / SIDE_TICK_UNITS) - 1 },
    (_, i) => (i + 1) * SIDE_TICK_UNITS * UNIT_MM,
  );
  const x0 = AREA_MM.x;
  const y0 = AREA_MM.y;
  const y1 = AREA_MM.y + AREA_H_MM;
  const x1 = AREA_MM.x + AREA_MM.w;
</script>

<g class="frame">
  <rect x={x0} y={y0} width={AREA_MM.w} height={AREA_H_MM} stroke-width={LINE_MM.frame} />
  {#each ticks as c (c)}
    {@const x = x0 + c * colW}
    <line x1={x} y1={y1} x2={x} y2={y1 - (c % 10 === 0 ? 2 : 1.2)} />
    <line x1={x} y1={y0} x2={x} y2={y0 + (c % 10 === 0 ? 2 : 1.2)} />
  {/each}
  {#each labels as c (c)}
    <text x={x0 + c * colW} y={y1 + 3.6} text-anchor="middle" font-size={TEXT_MM.tag}>{c}</text>
  {/each}
  {#each sideTicks as dy (dy)}
    <line x1={x0} y1={y0 + dy} x2={x0 + 1.2} y2={y0 + dy} />
    <line x1={x1} y1={y0 + dy} x2={x1 - 1.2} y2={y0 + dy} />
  {/each}
</g>

<style>
  rect,
  line {
    fill: none;
    stroke: #000;
  }
  line {
    stroke-width: 0.25;
  }
  text {
    font-family: var(--drawing-font);
    fill: #000;
  }
</style>
