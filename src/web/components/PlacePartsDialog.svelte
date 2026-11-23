<script lang="ts">
  import { allDetails, CAPTION_MM, detailSpace, fitZoom, frameOf, gaCandidates, zoomText, type GaCandidate } from "../../core/ga";
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

  // On a detail sheet: the details not shown yet (design-v0.3 §6). Each is shown in one frame only.
  const details = $derived(
    view === "detail" ? allDetails(editor.project).filter((d) => !frameOf(editor.project, d.it.id) && `${d.it.letter} ${d.it.text ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())) : [],
  );
  function pickDetail(d: (typeof details)[number]) {
    editor.tool = "select";
    const k = fitZoom(d.it.w, d.it.h);
    editor.gaPlace =
      editor.gaPlace?.detail === d.it.id ? null : { refs: [], detail: d.it.id, w: d.it.w * k, h: d.it.h * k, label: `detail ${d.it.letter}` };
    const sp = detailSpace();
    const fits = d.it.w * k <= sp.w - 10 && d.it.h * k + CAPTION_MM <= sp.h - 10;
    if (editor.gaPlace)
      editor.flash(
        fits
          ? `Click on the sheet to place detail ${d.it.letter} at ${zoomText(k)}; change the scale in its properties.`
          : `Detail ${d.it.letter} is too big for a sheet even at ${zoomText(k)}: draw a smaller detail, or place it and let it run over.`,
      );
  }

  function pick(c: GaCandidate) {
    if (!fits(c)) return;
    editor.tool = "select";
    editor.gaPlace = picked === key(c) ? null : { refs: c.refs, w: c.w, h: c.h, label: c.label, ...(c.part ? { part: c.part } : {}), ...(c.modules ? { modules: c.modules } : {}) };
    if (editor.gaPlace) editor.flash(`Click on the sheet to place ${c.label}. Devices snap onto a DIN rail.`);
  }
</script>

<Modal title={view === "detail" ? "Place detail" : "Place parts"} store="place-parts" width={360} {onclose}>
  <input class="search" type="search" placeholder={view === "detail" ? "Find a detail…" : "Find a part…"} bind:value={q} />
  {#if view === "detail"}
    <div class="list">
      {#each details as d (d.it.id)}
        <button class="cand" class:active={editor.gaPlace?.detail === d.it.id} onclick={() => pickDetail(d)} title="{d.it.w} × {d.it.h} mm on sheet {d.page.number}">
          <span>Detail {d.it.letter}{d.it.text ? `: ${d.it.text}` : ""}</span><span class="dim">sh {d.page.number} · {d.it.w}×{d.it.h}</span>
        </button>
      {:else}
        <p class="hint">Every detail is shown. Draw one with the Detail tool on a backplate or door sheet.</p>
      {/each}
    </div>
  {:else if !page.ga}
    <p class="hint">Open a GA sheet to place parts on it.</p>
  {:else if view === "door-front" && page.ga.of}
    <p class="hint">This sheet shows a door laid out on another sheet: place its devices there.</p>
  {/if}
  {#if view !== "detail"}
  <div class="list">
    {#each shown as c (key(c))}
      <button class="cand" class:active={picked === key(c)} disabled={!fits(c)} onclick={() => pick(c)} title={fits(c) ? `${c.w} × ${c.h} mm` : c.door ? "Goes on a door front" : "Goes on the backplate or a door back"}>
        <span>{c.label}</span><span class="dim">{c.door ? "door · " : ""}sh {c.sheet} · {c.w}×{c.h}</span>
      </button>
    {:else}
      <p class="hint">{q ? `Nothing to place here matches “${q}”.` : "Nothing more from the schematic goes on this sheet."}</p>
    {/each}
  </div>
  {/if}
  {#if elsewhere.length && view !== "detail"}
    <p class="hint">
      {#if doorElsewhere}{doorElsewhere} door device{doorElsewhere === 1 ? "" : "s"} go{doorElsewhere === 1 ? "es" : ""} on a door front.{/if}
      {#if elsewhere.length - doorElsewhere}{elsewhere.length - doorElsewhere} part{elsewhere.length - doorElsewhere === 1 ? "" : "s"} go on the backplate (or a door back).{/if}
    </p>
  {/if}
  {#if view !== "detail"}<p class="hint">Sizes are generic until you pick a real device for a part from the device table (in its properties).</p>{/if}
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
