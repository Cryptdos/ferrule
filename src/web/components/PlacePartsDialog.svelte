<script lang="ts">
  import { gaCandidates, type GaCandidate } from "../../core/ga";
  import { displayTag } from "../../core/tags";
  import type { Editor } from "../editor.svelte";
  import Modal from "./Modal.svelte";

  /**
   * Place parts… (design-v0.2 §8): every panel part from the schematic not
   * yet on a GA, with search. Pick one, then click on the GA sheet to place
   * it. Door devices go on a door front; the rest on the backplate (or a
   * door back).
   */
  let { editor, onclose }: { editor: Editor; onclose: () => void } = $props();

  let q = $state("");
  const page = $derived(editor.page);
  const all = $derived(gaCandidates(editor.project, (el) => displayTag(el, editor.project)));
  const view = $derived(page.ga?.view);
  const fits = (c: GaCandidate) => !!view && (view === "door-front" ? c.door : !c.door) && !(view === "door-front" && page.ga?.of);
  const shown = $derived.by(() => {
    const s = q.trim().toLowerCase();
    const list = s ? all.filter((c) => `${c.label} ${c.sheet}`.toLowerCase().includes(s)) : all;
    return list.filter(fits);
  });
  /** Parts that go on the other kind of sheet: counted, not listed. */
  const elsewhere = $derived(all.filter((c) => !fits(c)));
  const doorElsewhere = $derived(elsewhere.filter((c) => c.door).length);
  const key = (c: Pick<GaCandidate, "refs" | "part" | "modules">) => (c.modules ? c.modules.map((m) => m.id).join(",") : c.refs.join(",")) + (c.part ? `#${c.part}` : "");
  const picked = $derived(editor.gaPlace ? key(editor.gaPlace) : "");

  function pick(c: GaCandidate) {
    if (!fits(c)) return;
    editor.tool = "select";
    editor.gaPlace = picked === key(c) ? null : { refs: c.refs, w: c.w, h: c.h, label: c.label, ...(c.part ? { part: c.part } : {}), ...(c.modules ? { modules: c.modules } : {}) };
    if (editor.gaPlace) editor.flash(`Click on the sheet to place ${c.label}. Devices snap onto a DIN rail.`);
  }
</script>

<Modal title="Place parts" store="place-parts" width={360} {onclose}>
  <input class="search" type="search" placeholder="Find a part…" bind:value={q} />
  {#if !page.ga}
    <p class="hint">Open a GA sheet to place parts on it.</p>
  {:else if view === "door-front" && page.ga.of}
    <p class="hint">This sheet shows a door laid out on another sheet: place its devices there.</p>
  {/if}
  <div class="list">
    {#each shown as c (key(c))}
      <button class="cand" class:active={picked === key(c)} disabled={!fits(c)} onclick={() => pick(c)} title={fits(c) ? `${c.w} × ${c.h} mm` : c.door ? "Goes on a door front" : "Goes on the backplate or a door back"}>
        <span>{c.label}</span><span class="dim">{c.door ? "door · " : ""}sh {c.sheet} · {c.w}×{c.h}</span>
      </button>
    {:else}
      <p class="hint">{q ? `Nothing to place here matches “${q}”.` : "Nothing more from the schematic goes on this sheet."}</p>
    {/each}
  </div>
  {#if elsewhere.length}
    <p class="hint">
      {#if doorElsewhere}{doorElsewhere} door device{doorElsewhere === 1 ? "" : "s"} go{doorElsewhere === 1 ? "es" : ""} on a door front.{/if}
      {#if elsewhere.length - doorElsewhere}{elsewhere.length - doorElsewhere} part{elsewhere.length - doorElsewhere === 1 ? "" : "s"} go on the backplate (or a door back).{/if}
    </p>
  {/if}
  <p class="hint">Sizes are generic until you pick a real device for a part from the device table (in its properties).</p>
</Modal>

<style>
  .search {
    width: 100%;
    box-sizing: border-box;
    margin-bottom: 6px;
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 50vh;
    overflow: auto;
  }
  .cand {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    text-align: left;
    font-size: 12px;
    padding: 3px 6px;
  }
  .cand.active {
    border-color: #1e6ee6;
    background: #e8f0fd;
  }
  .cand:disabled {
    opacity: 0.5;
  }
  .dim {
    color: #889;
    white-space: nowrap;
  }
  .hint {
    font-size: 12px;
    color: #667;
    margin: 4px 0;
  }
</style>
