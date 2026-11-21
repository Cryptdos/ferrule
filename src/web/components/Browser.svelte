<script lang="ts">
  import type { Editor } from "../editor.svelte";
  import GaPanel from "./GaPanel.svelte";
  import Icon from "./Icon.svelte";
  import Palette from "./Palette.svelte";
  import SheetTree from "./SheetTree.svelte";

  /**
   * The floating browser over the left of the drawing: sheets (each folding
   * open to what's on it) and the workbench's parts. Folds away to a tab.
   */
  let { editor, width = $bindable(0) }: { editor: Editor; width?: number } = $props();

  const KEY = "ferrule.browser";
  type State = { shown: boolean; sheets: boolean; parts: boolean };
  function load(): State {
    try {
      return { shown: true, sheets: true, parts: true, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
    } catch {
      return { shown: true, sheets: true, parts: true };
    }
  }
  let st: State = $state(load());
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(st));
    } catch {
      /* storage may be unavailable */
    }
  }
  let el: HTMLDivElement | undefined = $state();
  $effect(() => {
    if (!el) return;
    const ro = new ResizeObserver(() => (width = st.shown && el ? el.offsetWidth + 8 : 0));
    ro.observe(el);
    return () => ro.disconnect();
  });
  $effect(() => {
    if (!st.shown) width = 0;
  });

  const partsTitle = $derived(editor.mode === "ga" ? "To place" : editor.mode === "annotate" ? "Annotations" : "Parts");
  const hasParts = $derived(editor.mode !== "simulate");
</script>

{#if st.shown}
  <div class="browser" bind:this={el}>
    <div class="head">
      <span>Browser</span>
      <button class="icon" title="Fold the browser away" onclick={() => ((st.shown = false), save())}><Icon name="collapse" size={14} /></button>
    </div>
    <section class:grow={!hasParts || !st.parts} class:open={st.sheets}>
      <button class="sec" onclick={() => ((st.sheets = !st.sheets), save())}>{st.sheets ? "▾" : "▸"} Sheets</button>
      {#if st.sheets}<SheetTree {editor} />{/if}
    </section>
    {#if hasParts}
      <section class="grow" class:open={st.parts}>
        <button class="sec" onclick={() => ((st.parts = !st.parts), save())}>{st.parts ? "▾" : "▸"} {partsTitle}</button>
        {#if st.parts}
          <div class="scroll">
            {#if editor.mode === "ga"}<GaPanel {editor} />{:else}<Palette {editor} />{/if}
          </div>
        {/if}
      </section>
    {/if}
  </div>
{:else}
  <button class="tab" title="Show the browser: sheets and parts" onclick={() => ((st.shown = true), save())}>
    <Icon name="expand" size={14} /> Browser
  </button>
{/if}

<style>
  .browser {
    position: absolute;
    top: 8px;
    left: 8px;
    bottom: 8px;
    width: 236px;
    z-index: 18;
    display: flex;
    flex-direction: column;
    background: rgba(248, 249, 250, 0.9);
    backdrop-filter: blur(6px);
    border: 1px solid rgba(40, 50, 60, 0.18);
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(20, 30, 40, 0.14);
    pointer-events: auto;
    min-height: 0;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 4px 4px 10px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #556;
    border-bottom: 1px solid rgba(40, 50, 60, 0.1);
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
  section {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 0 1 auto;
    max-height: 55%;
    border-bottom: 1px solid rgba(40, 50, 60, 0.08);
  }
  section.grow.open {
    flex: 1 1 auto;
    max-height: none;
  }
  .sec {
    border: none;
    background: none;
    text-align: left;
    padding: 5px 8px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #556;
    flex: none;
  }
  .sec:hover {
    background: rgba(0, 0, 0, 0.04);
  }
  .scroll {
    overflow-y: auto;
    min-height: 0;
  }
  .scroll :global(.palette) {
    background: transparent;
  }
  .tab {
    position: absolute;
    top: 8px;
    left: 8px;
    z-index: 18;
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #556;
    background: rgba(248, 249, 250, 0.92);
    border: 1px solid rgba(40, 50, 60, 0.2);
    border-radius: 5px;
    padding: 5px 9px;
    box-shadow: 0 3px 10px rgba(20, 30, 40, 0.12);
  }
</style>
