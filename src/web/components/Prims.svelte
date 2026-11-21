<script lang="ts">
  import type { Prim } from "../../core/symbols";

  let { prims, x = 0, y = 0 }: { prims: Prim[]; x?: number; y?: number } = $props();

  const pts = (p: [number, number][]) => p.map(([a, b]) => `${a},${b}`).join(" ");
</script>

<g transform="translate({x} {y})">
  {#each prims as p, i (i)}
    {#if p.t === "line"}
      <polyline
        points={pts(p.pts)}
        stroke-width={p.w ?? 0.18}
        stroke-dasharray={p.dash ? "0.6 0.4" : undefined}
      />
    {:else if p.t === "poly"}
      <polygon points={pts(p.pts)} class:filled={p.fill} />
    {:else if p.t === "circle"}
      <circle cx={p.c[0]} cy={p.c[1]} r={p.r} class:filled={p.fill} />
    {:else if p.t === "ellipse"}
      <ellipse cx={p.c[0]} cy={p.c[1]} rx={p.rx} ry={p.ry} stroke-dasharray={p.dash ? "0.6 0.4" : undefined} />
    {:else if p.t === "arc"}
      <path d="M {p.from[0]} {p.from[1]} A {p.r} {p.r} 0 0 {p.sweep} {p.to[0]} {p.to[1]}" />
    {:else if p.t === "text" && p.text}
      <text
        x={p.at[0]}
        y={p.at[1]}
        font-size={p.size}
        text-anchor={p.anchor}
        class={p.role}
        class:bold={p.bold}
        transform={p.vertical ? `rotate(-90 ${p.at[0]} ${p.at[1]})` : undefined}>{p.text}</text
      >
    {/if}
  {/each}
</g>

<style>
  polyline,
  polygon,
  circle,
  ellipse,
  path {
    fill: none;
    stroke: #000;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  polygon,
  circle,
  ellipse,
  path {
    stroke-width: 0.18;
  }
  .filled {
    fill: #000;
  }
  text {
    fill: #000;
    stroke: none;
    font-family: var(--drawing-font);
  }
  /* osifont has one weight: a thin outline in the text colour makes it read bold. */
  text.bold {
    stroke: #000;
    stroke-width: 0.07;
    paint-order: stroke;
  }
</style>
