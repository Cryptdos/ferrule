<script lang="ts">
  /**
   * Duplicate ×n (design-v0.4 §3): the picked rows, one item or a group,
   * copied n times, each copy's tags stepping on. A tag that's taken is
   * shown in red and left empty, for typing or Renumber.
   */
  import { duplicatePlant, tagPlan } from "../../core/design";
  import { plantLabel } from "../../core/ops";
  import type { Editor } from "../editor.svelte";
  import Modal from "./Modal.svelte";

  let { editor, onclose }: { editor: Editor; onclose: () => void } = $props();

  let copies = $state(1);
  let step = $state(1);
  const rows = $derived(editor.project.plant.filter((p) => !p.module && editor.designPick.plant.includes(p.id)));
  const plan = $derived(tagPlan(editor.project, rows.map((p) => p.tag), Math.max(1, Math.min(200, Math.floor(copies) || 1)), Math.floor(step) || 0, 1));

  function go() {
    let ids: string[] = [];
    let untagged = 0;
    const ok = editor.apply((p) => {
      const r = duplicatePlant(p, rows.map((x) => x.id), copies, step);
      ids = r.plant.map((x) => x.id);
      untagged = r.untagged;
    });
    if (!ok) return;
    editor.designPick = { plant: ids };
    if (untagged) editor.flash(`${untagged} tag${untagged === 1 ? " was" : "s were"} taken: left empty for you to type, or for Renumber`);
    onclose();
  }
</script>

<Modal title="Duplicate ×n" store="design-duplicate" {onclose}>
  <div class="body">
    {#if !rows.length}
      <p class="hint">Pick one or more plant rows in the table first (Ctrl+click for a group).</p>
    {:else}
      <p class="hint">Copies of {rows.map(plantLabel).join(", ")}, after the last of them, with their points. Copies aren't on any channel, and aren't drawn.</p>
      <div class="fields">
        <label>Copies <input type="number" min="1" max="200" bind:value={copies} /></label>
        <label>Tags step by <input type="number" min="0" bind:value={step} /></label>
      </div>
      <div class="plan">
        {#each plan.slice(0, 12) as copy, k (k)}
          <div class="copy">
            <span class="n">{k + 1}</span>
            {#each copy as t, i (i)}<span class:taken={t.taken} class:none={!t.tag} title={t.taken ? "Taken: this copy's tag is left empty" : ""}>{t.tag || (rows[i]?.tag ? "—" : "?")}</span>{/each}
          </div>
        {/each}
        {#if plan.length > 12}<div class="hint">…and {plan.length - 12} more</div>{/if}
      </div>
      <div class="buttons"><button onclick={onclose}>Cancel</button><button class="primary" onclick={go}>Duplicate</button></div>
    {/if}
  </div>
</Modal>

<style>
  .body {
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 360px;
  }
  .fields {
    display: flex;
    gap: 12px;
  }
  label {
    display: flex;
    flex-direction: column;
    font-size: 12px;
    color: #556;
    gap: 2px;
  }
  label input {
    width: 8em;
  }
  .plan {
    font-size: 13px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 260px;
    overflow: auto;
  }
  .copy {
    display: flex;
    gap: 10px;
  }
  .n {
    color: #889;
    width: 2em;
  }
  .taken {
    color: #b00;
    text-decoration: line-through;
  }
  .none {
    color: #99a;
  }
  .hint {
    font-size: 12px;
    color: #667;
    margin: 0;
  }
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
  }
  .primary {
    background: #1e6ee6;
    border-color: #1e6ee6;
    color: #fff;
  }
</style>
