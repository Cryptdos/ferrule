<script lang="ts">
  import { renumber, renumberPreview } from "../../core/renumber";
  import type { Editor } from "../editor.svelte";
  import Modal from "./Modal.svelte";

  let { editor, onclose }: { editor: Editor; onclose: () => void } = $props();

  // Worked out once when the dialog opens: what Renumber would change, and nothing else.
  const preview = renumberPreview($state.snapshot(editor.project) as typeof editor.project);
  const changes = preview.changes;
  const counts = Object.entries(
    changes.reduce<Record<string, number>>((acc, c) => ((acc[c.kind] = (acc[c.kind] ?? 0) + 1), acc), {}),
  );
  let filter = $state("");
  const shown = $derived(
    filter ? changes.filter((c) => `${c.kind} ${c.where} ${c.from} ${c.to}`.toLowerCase().includes(filter.toLowerCase())) : changes,
  );

  function apply() {
    if (editor.apply((p) => renumber(p))) {
      editor.flash(`Renumbered: ${changes.length} change${changes.length === 1 ? "" : "s"}. Undo puts them back.`);
    }
    onclose();
  }
</script>

<Modal title="Renumber" {onclose} wide>
  {#if !changes.length}
    <p>Everything is already numbered as Renumber would number it. Nothing to change.</p>
  {:else}
    <p class="hint">
      Renumber would make these {changes.length} changes ({counts.map(([k, n]) => `${n} ${k.toLowerCase()}${n === 1 ? "" : "s"}`).join(", ")}).
      Locked tags and wire numbers are kept. Nothing changes until you press Apply, and Undo puts it all back.
    </p>
    <input class="filter" type="search" placeholder="Filter…" bind:value={filter} />
    <div class="scroll">
      <table>
        <thead><tr><th>What</th><th>Where</th><th>Now</th><th></th><th>Becomes</th></tr></thead>
        <tbody>
          {#each shown as c, i (i)}
            <tr><td>{c.kind}</td><td>{c.where}</td><td class="old">{c.from}</td><td>→</td><td class="new">{c.to}</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
  <div class="buttons">
    <button onclick={onclose}>Cancel</button>
    <button class="primary" disabled={!changes.length} onclick={apply}>Apply {changes.length} change{changes.length === 1 ? "" : "s"}</button>
  </div>
</Modal>

<style>
  .hint {
    color: #556;
    font-size: 13px;
  }
  .filter {
    margin-bottom: 6px;
    width: 220px;
  }
  .scroll {
    max-height: 55vh;
    overflow: auto;
    border: 1px solid #dde;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 13px;
  }
  th {
    position: sticky;
    top: 0;
    background: #f3f4f6;
    text-align: left;
  }
  th,
  td {
    padding: 3px 8px;
    border-bottom: 1px solid #eee;
  }
  .old {
    color: #a33;
    font-family: var(--drawing-font);
  }
  .new {
    color: #262;
    font-family: var(--drawing-font);
  }
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 12px;
  }
  .primary {
    background: #1e6ee6;
    color: #fff;
    border-color: #1e6ee6;
  }
</style>
