<script lang="ts">
  /**
   * Draft's Plant window (v0.5 A67, design-design-workbench §9, §11): the
   * plant made in Design, to pick it and place a view. Its terminals are set
   * in Design's Terminals window.
   */
  import { plantLabel } from "../../core/ops";
  import { startPlacing } from "../placing";
  import type { Editor } from "../editor.svelte";
  import Modal from "./Modal.svelte";

  let { editor, onclose }: { editor: Editor; onclose: () => void } = $props();

  /** Draft draws what Design lists (design-v0.4 §8): place a view, with its pins. */
  function place(id: string) {
    const item = editor.project.plant.find((p) => p.id === id);
    if (item && startPlacing(editor, item)) onclose();
  }

  const usedOn = (id: string) =>
    editor.project.pages.filter((pg) => pg.elements.some((e) => e.symbol === "plant-view" && e.params.plant === id)).map((pg) => pg.number);
  /** Controllers' modules are listed under Controllers. */
  const plantOnly = $derived(editor.project.plant.filter((p) => !p.module));
</script>

<Modal title="Plant" {onclose} wide>
  <p class="hint">
    Plant is made and edited in <strong>Design</strong>, its terminals in its <em>Terminals…</em> there; here it's drawn. Place
    a view of it on any sheet, ticking the terminals that sheet shows. Its tag is its prefix and where its first view is (SEF-3-13),
    given by Renumber unless typed in Design. In labels, <code>{"{plant:SF-01.tag}"}</code> fills in the tag.
  </p>
  {#if !plantOnly.length}
    <p class="hint">No plant yet: add it in Design (<em>+ Plant</em>).</p>
  {:else}
  <table>
    <thead>
      <tr>
        <th>Tag</th><th>Description</th><th>Sheets</th><th></th>
      </tr>
    </thead>
    <tbody>
      {#each plantOnly as item (item.id)}
        <tr>
          <td class="tagro">{plantLabel(item)}</td>
          <td class="ro">{item.description}</td>
          <td class="sheets">{usedOn(item.id).join(", ") || "–"}</td>
          <td class="actions">
            <button onclick={() => place(item.id)} disabled={!item.terminals.length} title={item.terminals.length ? "Place a view of this on the current sheet" : "Give it terminals first, in Design"}>Place view</button>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
  {/if}
</Modal>




<style>
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 10px;
  }
  th {
    text-align: left;
    font-size: 12px;
    font-weight: normal;
    color: #445;
  }
  td {
    padding: 2px 4px;
  }
  td.tagro {
    font-weight: 600;
    white-space: nowrap;
  }
  td.ro {
    color: #445;
  }
  td.sheets {
    font-size: 12px;
    color: #556;
    white-space: nowrap;
  }
  td.actions {
    white-space: nowrap;
  }
  .hint {
    font-size: 12px;
    color: #667;
    margin: 0 0 10px;
  }
</style>
