<script lang="ts">
  import { addGaPage } from "../../core/ops";
  import { doorLeaves, fitScale, GA_SCALES, VIEW_NAMES } from "../../core/ga";
  import type { GaSettings, GaView } from "../../core/model";
  import type { Editor } from "../editor.svelte";
  import Modal from "./Modal.svelte";

  /**
   * A new GA sheet (v0.5 A33): a prompt from the sheets' ▾ menu, beside Sheet
   * and Spare sheet, so every kind of sheet is made from the one place. It
   * asks the view, the enclosure's width and height and the scale, and the
   * sheet lands after the one that's open.
   */
  let { editor, onclose }: { editor: Editor; onclose: () => void } = $props();
  const page = $derived(editor.page);
  const doorFronts = $derived(editor.project.pages.filter((p) => p.ga?.view === "door-front" && !p.ga.of));
  let w = $state(600);
  let h = $state(800);
  let view: GaView = $state("backplate");
  /** Door views: their own door, or one drawn on another sheet. */
  let of = $state("");
  let leaves = $state<1 | 2>(1);
  let leaf: "" | "0" | "1" = $state("");
  let scale: number | null = $state(null);
  const owner = $derived(of ? doorFronts.find((p) => p.id === of) : undefined);
  const ownerLeaves = $derived(owner ? doorLeaves(owner) : []);
  const size = $derived(owner ? owner.ga!.enclosure : { w, h });
  const shownW = $derived(leaf !== "" && ownerLeaves.length > 1 ? ownerLeaves[Number(leaf)]!.w : leaf !== "" && leaves === 2 && !owner ? w / 2 : size.w);
  const autoScale = $derived(fitScale(shownW, size.h));
  $effect(() => {
    // A door back is always of a door front: start with the one before this sheet.
    if (view === "door-back" && !of) of = [...doorFronts].reverse().find((p) => p.number <= page.number)?.id ?? doorFronts[0]?.id ?? "";
    if (view === "backplate") of = "";
  });

  function create(e: SubmitEvent) {
    e.preventDefault();
    let id = "";
    const settings: GaSettings = { scale: view === "detail" ? 1 : scale || autoScale, enclosure: { ...size }, view };
    if (view !== "backplate" && of) settings.of = of;
    if (view === "door-front" && !of && leaves === 2)
      settings.leaves = [
        { w: w / 2, hinge: "left" },
        { w: w / 2, hinge: "right" },
      ];
    if (view !== "backplate" && leaf !== "") settings.leaf = Number(leaf) as 0 | 1;
    if (editor.apply((p) => (id = addGaPage(p, "", settings, editor.pageId).id))) {
      editor.setPage(id);
      editor.mode = "ga";
      onclose();
    }
  }
</script>

<Modal title="New GA sheet" store="new-ga" width={360} {onclose}>
  <p class="hint">A general arrangement: the panel's backplate or door at true scale, with the devices from the schematic.</p>
  <form onsubmit={create}>
    <label>
      View
      <select bind:value={view}>
        {#each Object.entries(VIEW_NAMES) as [v, name] (v)}<option value={v}>{name}</option>{/each}
      </select>
    </label>
    {#if view === "detail"}
      <p class="hint">Frames showing details drawn on other GA sheets, each at its own scale. No enclosure and no scale of its own.</p>
    {:else if view !== "backplate"}
      <label>
        Door
        <select bind:value={of}>
          {#if view === "door-front"}<option value="">A new door, laid out on this sheet</option>{/if}
          {#each doorFronts as d (d.id)}<option value={d.id}>The door on sheet {d.number}{d.title ? `: ${d.title}` : ""}</option>{/each}
        </select>
      </label>
      {#if view === "door-back" && !doorFronts.length}<p class="hint warn">Add the door front first: the back is drawn from it.</p>{/if}
    {/if}
    {#if !owner && view !== "detail"}
      <label>Width (mm) <input type="number" min="50" step="10" bind:value={w} /></label>
      <label>Height (mm) <input type="number" min="50" step="10" bind:value={h} /></label>
    {/if}
    {#if view === "door-front" && !owner}
      <label>
        Leaves
        <select bind:value={leaves}>
          <option value={1}>One door</option>
          <option value={2}>Two doors (split down the middle; set each in Sheet)</option>
        </select>
      </label>
    {/if}
    {#if view !== "backplate" && (ownerLeaves.length > 1 || (!owner && leaves === 2))}
      <label>
        Shows
        <select bind:value={leaf}>
          <option value="">Both leaves, side by side</option>
          <option value="0">The left leaf (from the front)</option>
          <option value="1">The right leaf (from the front)</option>
        </select>
      </label>
    {/if}
    {#if view !== "detail"}
    <label>
      Scale 1: (empty: the largest that fits, 1:{autoScale})
      <input type="number" min="0.5" step="0.5" list="ferrule-new-ga-scales" placeholder={String(autoScale)} bind:value={scale} />
      <datalist id="ferrule-new-ga-scales">{#each GA_SCALES as s (s)}<option value={s}></option>{/each}</datalist>
    </label>
    {/if}
    <div class="buttons">
      <button type="submit" class="primary" disabled={view === "door-back" && !of}>Add GA sheet after this one</button>
      <button type="button" onclick={onclose}>Cancel</button>
    </div>
  </form>
</Modal>

<style>
  .hint {
    font-size: 12px;
    color: #667;
    margin: 0 0 6px;
  }
  .warn {
    color: #a60;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 12px;
  }
  form label {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .buttons {
    display: flex;
    gap: 6px;
    margin-top: 4px;
  }
</style>
