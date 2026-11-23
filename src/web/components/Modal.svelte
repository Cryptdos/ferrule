<script lang="ts" module>
  /** Windows stack in the order they were last clicked. */
  let topZ = 40;
  /** How many are open: a new one opens a little down and right of the last, so none hides another. */
  let openCount = 0;
  /** Open windows, to close the topmost with Esc wherever the focus is. */
  const stack = new Set<{ z: () => number; close: () => void }>();
  /** Close the window on top (the one clicked last). False if none is open. */
  export function closeTopmost(): boolean {
    let top: { z: () => number; close: () => void } | null = null;
    for (const w of stack) if (!top || w.z() > top.z()) top = w;
    top?.close();
    return !!top;
  }
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import Icon from "./Icon.svelte";

  /**
   * A floating window (design-v0.2 §10): a title bar with minimise and close,
   * in the interface's greys. It can be dragged by its title bar, doesn't
   * block the drawing behind it, and remembers where it was put (per
   * `store`, the title by default). Esc closes it while it has the focus.
   */
  let {
    title,
    onclose,
    wide = false,
    width,
    store,
    children,
  }: { title: string; onclose: () => void; wide?: boolean; width?: number; store?: string; children: Snippet } = $props();

  const KEY = `ferrule.win.${store ?? title}`;
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
  let z = $state(++topZ);
  const cascade = openCount++ * 28;
  $effect(() => {
    const me = { z: () => z, close: () => onclose() };
    stack.add(me);
    return () => {
      stack.delete(me);
      openCount = Math.max(0, openCount - 1);
    };
  });
  let win: HTMLDivElement | undefined = $state();
  let drag: { cx: number; cy: number; x: number; y: number } | null = null;
  const w = $derived(width ?? (wide ? 1100 : 720));

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...(pos ?? {}), min }));
    } catch {
      /* storage may be unavailable */
    }
  }
  function clamp(p: { x: number; y: number }): { x: number; y: number } {
    const ww = win?.offsetWidth ?? w;
    return { x: Math.max(-ww + 120, Math.min(window.innerWidth - 120, p.x)), y: Math.max(0, Math.min(window.innerHeight - 34, p.y)) };
  }
  // Keep it reachable when the browser window shrinks.
  $effect(() => {
    const fit = () => {
      if (pos) pos = clamp(pos);
    };
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  });

  function raise() {
    if (z !== topZ) z = ++topZ;
  }
  function down(e: PointerEvent) {
    if ((e.target as HTMLElement).closest("button") || !win) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag = { cx: e.clientX, cy: e.clientY, x: win.offsetLeft, y: win.offsetTop };
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
  function toggleMin() {
    min = !min;
    save();
  }
</script>

<div
  class="window"
  bind:this={win}
  role="dialog"
  aria-label={title}
  tabindex="-1"
  style:z-index={z}
  style:width="min({w}px, 96vw)"
  style:left={pos ? `${pos.x}px` : `calc(50% - min(${w}px, 96vw) / 2 + ${cascade}px)`}
  style:top={pos ? `${pos.y}px` : `${90 + cascade}px`}
  onpointerdowncapture={raise}
  onkeydown={(e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onclose();
    }
  }}
>
  <div class="bar" role="toolbar" tabindex="-1" aria-label={title} onpointerdown={down} onpointermove={move} onpointerup={up} ondblclick={toggleMin}>
    <span class="title">{title}</span>
    <button class="icon" title={min ? "Restore" : "Minimise"} onclick={toggleMin}><Icon name={min ? "restore" : "minimise"} size={14} /></button>
    <button class="icon" title="Close (Esc)" onclick={onclose}><Icon name="close" size={14} /></button>
  </div>
  {#if !min}
    <div class="body">{@render children()}</div>
  {/if}
</div>

<style>
  .window {
    position: fixed;
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - 100px);
    background: var(--panel, #fff);
    color: var(--ink, #1b2230);
    border: 1px solid var(--line, #c4c9d0);
    border-radius: 6px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
    outline: none;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px 4px 4px 12px;
    background: var(--chrome, #eef0f2);
    border-bottom: 1px solid var(--line, #c4c9d0);
    border-radius: 6px 6px 0 0;
    cursor: grab;
    user-select: none;
    flex: none;
  }
  .bar:active {
    cursor: grabbing;
  }
  .title {
    flex: 1;
    font-size: 13px;
    font-weight: 600;
    color: var(--muted, #445);
    text-align: center;
    padding-left: 44px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  button.icon {
    border: none;
    background: none;
    padding: 4px;
    color: var(--muted, #445);
    border-radius: 3px;
  }
  button.icon:hover {
    background: rgba(0, 0, 0, 0.08);
  }
  .body {
    overflow-y: auto;
    min-height: 0;
    padding: 10px 18px 16px;
  }
</style>
