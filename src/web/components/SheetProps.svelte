<script lang="ts">
  import { columnOf } from "../../core/geometry";
  import { cloudsOn, deleteClouds, renamePage, setBoundary, setPageType } from "../../core/ops";
  import type { Editor } from "../editor.svelte";
  import FieldInput from "./FieldInput.svelte";

  /** Settings for the current sheet: title, panel boundary, spare, its revision clouds. */
  let { editor }: { editor: Editor } = $props();
  const page = $derived(editor.page);
  const clouds = $derived(cloudsOn(editor.project, page.id));
</script>

<div class="props">
  <h3>Sheet {page.number} of {editor.project.pages.length}</h3>
  <label>
    Sheet title
    <FieldInput
      {editor}
      value={page.title}
      placeholder="e.g. Controls section: supplies"
      onchange={(v) => editor.apply((p) => renamePage(p, editor.pageId, v))}
    />
  </label>
  <!-- Sheet type (note 12): an empty sheet can become a GA. -->
  <label>
    Sheet type
    <select
      value={page.ga ? "ga" : page.spare ? "spare" : "schematic"}
      onchange={(e) => {
        const type = e.currentTarget.value as "schematic" | "spare" | "ga";
        if (!editor.apply((p) => setPageType(p, editor.pageId, type))) e.currentTarget.value = page.ga ? "ga" : page.spare ? "spare" : "schematic";
        else if (type === "ga") editor.mode = "ga";
      }}
    >
      <option value="schematic">Schematic</option>
      <option value="spare">Spare (annotations only)</option>
      <option value="ga">GA (general arrangement)</option>
    </select>
  </label>
  {#if !page.spare && !page.ga}
    <label class="check">
      <input
        type="checkbox"
        checked={page.boundaryY !== null}
        onchange={(e) => {
          const y = e.currentTarget.checked ? 88 : null;
          editor.apply((p) => setBoundary(p, editor.pageId, y));
        }}
      />
      Panel boundary (field equipment below it)
    </label>
    {#if page.boundaryY !== null}
      <p class="hint">The boundary is a terminal block: terminals placed on it become its cells. Drag the block (between terminals) to move it; its terminals go with it. Wires crossing it must go through a terminal.</p>
    {/if}
  {/if}
  {#if clouds.length}
    <div class="sub">Revision {clouds[0]!.rev} clouds on this sheet</div>
    {#each clouds as c, i (c.id)}
      <div class="row">
        Cloud {i + 1}, columns {columnOf(c.rect[0])}–{columnOf(c.rect[0] + c.rect[2])}
        <button class="danger small" onclick={() => editor.apply((p) => deleteClouds(p, [c.id]))}>Remove</button>
      </div>
    {/each}
  {/if}
</div>

<style>
  .props {
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  h3 {
    margin: 0;
    font-size: 14px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
    color: #445;
  }
  label.check {
    flex-direction: row;
    align-items: center;
    gap: 6px;
  }
  .sub {
    font-size: 12px;
    font-weight: 600;
    color: #334;
  }
  .row {
    font-size: 12px;
    color: #445;
  }
  button.small {
    font-size: 11px;
    padding: 1px 6px;
    margin-left: 6px;
  }
  .hint {
    font-size: 12px;
    color: #556;
    line-height: 1.5;
    margin: 0;
  }
</style>
