<script lang="ts">
  import type { Snippet } from "svelte";
  import Icon from "./Icon.svelte";

  /**
   * A floating, see-through box over the drawing (properties, simulation).
   * Drag it by its title bar; it remembers where it was put (per `store` key).
   */
  let {
    title,
    store,
    top = 162,
    right = 12,
    width = 320,
    onclose,
    children,
    actions,
  }: {
    title: string;
    store: string;
    top?: number;
    right?: number;
    width?: number;
    onclose?: () => void;
    children: Snippet;
    actions?: Snippet;
  } = $props();

  const KEY = `ferrule.box.${store}`;
  function load(): { x: number; y: number; min?: boolean } | null {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
      return v && typeof v.x === "number" && typeof v.y === "number" ? v : null;
    } catch {
      return null;
    }
  }
  const saved = load();
  let pos: { x: number; y: number } | null = $state(saved ? { x: saved.x, y: saved.y } : null);
  let min = $state(!!saved?.min);
  let box: HTMLDivElement | undefined = $state();
  let drag: { cx: number; cy: number; x: number; y: number } | null = null;

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...(pos ?? {}), min }));
    } catch {
      /* storage may be unavailable */
    }
  }

  function clamp(p: { x: number; y: number }): { x: number; y: number } {
    const parent = box?.offsetParent as HTMLElement | null;
    if (!parent || !box) return p;
    return {
      x: Math.max(0, Math.min(parent.clientWidth - box.offsetWidth, p.x)),
      y: Math.max(0, Math.min(parent.clientHeight - 36, p.y)),
    };
  }

  // Keep it on screen when the window shrinks.
  $effect(() => {
    const parent = box?.offsetParent as HTMLElement | null;
    if (!parent) return;
    const ro = new ResizeObserver(() => {
      if (pos) pos = clamp(pos);
    });
    ro.observe(parent);
    return () => ro.disconnect();
  });

  function down(e: PointerEvent) {
    if ((e.target as HTMLElement).closest("button") || !box) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag = { cx: e.clientX, cy: e.clientY, x: box.offsetLeft, y: box.offsetTop };
  }
  function move(e: PointerEvent) {
    if (!drag) return;
    pos = clamp({ x: drag.x + e.clientX - drag.cx, y: drag.y + e.clientY - drag.cy });
  }
  function up() {
    if (!drag) return;
    drag = null;
    save();
  }
</script>

<div
  class="float"
  bind:this={box}
  style:width="{width}px"
  style:left={pos ? `${pos.x}px` : undefined}
  style:right={pos ? undefined : `${right}px`}
  style:top="{pos ? pos.y : top}px"
  style:max-height="calc(100% - {(pos ? pos.y : top) + 10}px)"
>
  <div class="bar" role="toolbar" tabindex="-1" aria-label={title} onpointerdown={down} onpointermove={move} onpointerup={up} ondblclick={() => ((min = !min), save())}>
    <span class="title">{title}</span>
    {@render actions?.()}
    <button class="icon" title={min ? "Show" : "Fold away"} onclick={() => ((min = !min), save())}>
      <Icon name={min ? "restore" : "minimise"} size={14} />
    </button>
    {#if onclose}
      <button class="icon" title="Close" onclick={onclose}><Icon name="close" size={14} /></button>
    {/if}
  </div>
  {#if !min}
    <div class="body">{@render children()}</div>
  {/if}
</div>

<style>
  .float {
    position: absolute;
    z-index: 20;
    display: flex;
    flex-direction: column;
    background: rgba(250, 251, 252, 0.93);
    backdrop-filter: blur(6px);
    border: 1px solid rgba(40, 50, 60, 0.18);
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(20, 30, 40, 0.16);
    min-height: 0;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px 4px 4px 10px;
    border-bottom: 1px solid rgba(40, 50, 60, 0.1);
    cursor: grab;
    user-select: none;
    flex: none;
  }
  .bar:active {
    cursor: grabbing;
  }
  .title {
    flex: 1;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #556;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  button.icon {
    border: none;
    background: none;
    padding: 3px;
    color: #556;
    border-radius: 3px;
  }
  button.icon:hover {
    background: rgba(0, 0, 0, 0.07);
  }
  .body {
    overflow-y: auto;
    min-height: 0;
  }
</style>
