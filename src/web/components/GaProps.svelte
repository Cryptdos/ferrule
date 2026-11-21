<script lang="ts">
  import { deleteGaItems, rotateGaItems, setGaSettings, setGaSize, updateGaItem } from "../../core/ops";
  import { GA_SCALES, gaSizes } from "../../core/ga";
  import { displayTag } from "../../core/tags";
  import type { Editor } from "../editor.svelte";

  /** GA workbench, right side: the selected item, or the sheet's enclosure and the size library. */
  let { editor }: { editor: Editor } = $props();

  const page = $derived(editor.page);
  const items = $derived((page.gaItems ?? []).filter((i) => editor.selection.includes(i.id)));
  const one = $derived(items.length === 1 ? items[0]! : null);
  const byId = $derived(new Map(editor.project.pages.flatMap((pg) => pg.elements.map((e) => [e.id, { e, pg }]))));
  const sizes = $derived(gaSizes(editor.project));
  let showSizes = $state(false);
  const num = (v: string) => Number(v);
</script>

<div class="props">
  {#if !page.ga}
    <h3>GA workbench</h3>
    <p class="hint">Pick a GA sheet from the list, or add one on the left.</p>
  {:else if one}
    <h3>{one.kind === "rail" ? "DIN rail" : one.kind === "trunking" ? "Trunking" : one.kind === "note" ? "Note" : "Device"}</h3>
    {#if one.kind === "device" && one.refs?.length}
      <div class="refs">
        {#each one.refs.slice(0, 12) as r (r)}
          {@const x = byId.get(r)}
          {#if x}
            <button class="link-btn" onclick={() => editor.goTo(r)} title="Show it on the schematic">
              {displayTag(x.e, editor.project) || x.e.symbol} (sheet {x.pg.number}) →
            </button>
          {:else}<span class="hint">{r}: no longer on the schematic</span>{/if}
        {/each}
        {#if one.refs.length > 12}<span class="hint">and {one.refs.length - 12} more</span>{/if}
      </div>
    {/if}
    {#if one.kind === "note" || one.kind === "device"}
      <label>
        {one.kind === "note" ? "Text" : "Label (instead of its tag)"}
        <input value={one.text ?? ""} onchange={(e) => editor.apply((p) => updateGaItem(p, editor.pageId, one.id, { text: e.currentTarget.value }))} />
      </label>
    {/if}
    <div class="grid">
      <label>X (mm)<input type="number" step="5" value={one.x} onchange={(e) => editor.apply((p) => updateGaItem(p, editor.pageId, one.id, { x: num(e.currentTarget.value) }))} /></label>
      <label>Y (mm)<input type="number" step="5" value={one.y} onchange={(e) => editor.apply((p) => updateGaItem(p, editor.pageId, one.id, { y: num(e.currentTarget.value) }))} /></label>
      <label>Width (mm)<input type="number" step="5" value={one.w} onchange={(e) => editor.apply((p) => updateGaItem(p, editor.pageId, one.id, { w: num(e.currentTarget.value) }))} /></label>
      <label>Height (mm)<input type="number" step="5" value={one.h} onchange={(e) => editor.apply((p) => updateGaItem(p, editor.pageId, one.id, { h: num(e.currentTarget.value) }))} /></label>
    </div>
    <div class="buttons">
      <button onclick={() => editor.apply((p) => rotateGaItems(p, editor.pageId, [one.id]))} title="R">Rotate</button>
      <button
        class="danger"
        onclick={() => {
          editor.apply((p) => deleteGaItems(p, editor.pageId, [one.id]));
          editor.selection = [];
        }}>Delete</button
      >
    </div>
    <p class="hint">Drag to move (5 mm steps, Shift for 1 mm); drag the corner square to size it.</p>
  {:else if items.length > 1}
    <h3>{items.length} items</h3>
    <div class="buttons">
      <button
        class="danger"
        onclick={() => {
          const ids = items.map((i) => i.id);
          editor.apply((p) => deleteGaItems(p, editor.pageId, ids));
          editor.selection = [];
        }}>Delete</button
      >
    </div>
  {:else}
    <h3>{page.ga.view === "door" ? "Door" : "Backplate"}</h3>
    <div class="grid">
      <label>Width (mm)<input type="number" step="10" value={page.ga.enclosure.w} onchange={(e) => editor.apply((p) => setGaSettings(p, editor.pageId, { enclosure: { w: num(e.currentTarget.value), h: page.ga!.enclosure.h } }))} /></label>
      <label>Height (mm)<input type="number" step="10" value={page.ga.enclosure.h} onchange={(e) => editor.apply((p) => setGaSettings(p, editor.pageId, { enclosure: { w: page.ga!.enclosure.w, h: num(e.currentTarget.value) } }))} /></label>
      <label>
        Scale
        <select value={page.ga.scale} onchange={(e) => editor.apply((p) => setGaSettings(p, editor.pageId, { scale: num(e.currentTarget.value) }))}>
          {#each GA_SCALES as s (s)}<option value={s}>1:{s}</option>{/each}
        </select>
      </label>
      <label>
        View
        <select value={page.ga.view} onchange={(e) => editor.apply((p) => setGaSettings(p, editor.pageId, { view: e.currentTarget.value as "backplate" | "door" }))}>
          <option value="backplate">Backplate</option>
          <option value="door">Door</option>
        </select>
      </label>
    </div>
    <p class="hint">
      DIN rail: drag along where it goes (35 mm). Trunking: drag out its size. Devices: pick from the list on the left.
      Positions are measured from the enclosure's top-left corner.
    </p>
    <button onclick={() => (showSizes = !showSizes)}>{showSizes ? "Hide" : "Device sizes…"}</button>
    {#if showSizes}
      <table class="sizes">
        <thead><tr><th>Part</th><th>W</th><th>H</th></tr></thead>
        <tbody>
          {#each Object.entries(sizes) as [k, v] (k)}
            <tr>
              <td title={k}>{v.label}</td>
              <td><input type="number" step="0.5" value={v.w} onchange={(e) => editor.apply((p) => setGaSize(p, k, { w: num(e.currentTarget.value) }))} /></td>
              <td><input type="number" step="0.5" value={v.h} onchange={(e) => editor.apply((p) => setGaSize(p, k, { h: num(e.currentTarget.value) }))} /></td>
            </tr>
          {/each}
        </tbody>
      </table>
      <p class="hint">Sizes for this project, in mm. Devices already placed keep their size; place them again to pick up a change.</p>
    {/if}
  {/if}
</div>

<style>
  .props {
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 13px;
  }
  h3 {
    margin: 0;
    font-size: 14px;
  }
  .hint {
    font-size: 12px;
    color: #667;
    margin: 0;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
  }
  label input,
  label select {
    width: 100%;
    box-sizing: border-box;
    min-width: 0;
  }
  .grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 6px;
  }
  .buttons {
    display: flex;
    gap: 6px;
  }
  .danger {
    color: #a22;
  }
  .refs {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .link-btn {
    text-align: left;
    border: none;
    background: none;
    color: #1e6ee6;
    padding: 0;
    cursor: pointer;
  }
  .sizes {
    font-size: 12px;
    border-collapse: collapse;
  }
  .sizes input {
    width: 4.5em;
  }
  .sizes td {
    padding: 1px 3px;
  }
</style>
