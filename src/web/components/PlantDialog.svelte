<script lang="ts">
  import { plantLabel, setQuickEntry } from "../../core/ops";
  import { formatQuickEntry } from "../../core/points";
  import { startPlacing } from "../placing";
  import type { Editor } from "../editor.svelte";
  import Modal from "./Modal.svelte";
  import PointsDialog from "./PointsDialog.svelte";

  let { editor, onclose, onexpectations }: { editor: Editor; onclose: () => void; onexpectations?: () => void } = $props();

  /** Draft draws what Design lists (design-v0.4 §8): place a view, with its pins. */
  function place(id: string) {
    const item = editor.project.plant.find((p) => p.id === id);
    if (item && startPlacing(editor, item)) onclose();
  }

  const usedOn = (id: string) =>
    editor.project.pages.filter((pg) => pg.elements.some((e) => e.symbol === "plant-view" && e.params.plant === id)).map((pg) => pg.number);
  /** Controllers' modules are listed under Controllers. */
  const plantOnly = $derived(editor.project.plant.filter((p) => !p.module));
  /** The device whose pins and points window is open. */
  let open = $state<string | null>(null);
</script>

<Modal title="Plant" {onclose} wide>
  <p class="hint">
    Plant is made and edited in <strong>Design</strong>; here it's drawn. Give it its pins (from the datasheet) and place a view
    of it on any sheet, ticking the terminals that sheet shows. Its tag is its prefix and where its first view is (SEF-3-13),
    given by Renumber unless typed in Design. In labels, <code>{"{plant:SF-01.tag}"}</code> fills in the tag.
  </p>
  {#if !plantOnly.length}
    <p class="hint">No plant yet: add it in Design (<em>+ Plant</em>).</p>
  {:else}
  <table>
    <thead>
      <tr>
        <th>Tag</th><th>Description</th><th title="Quick entry: Mains: L N E | Run: 1 2 | Running: C NO NC. Pins and points… for the full table">Pins and points</th>
        <th>Sheets</th><th></th>
      </tr>
    </thead>
    <tbody>
      {#each plantOnly as item (item.id)}
        <tr>
          <td class="tagro">{plantLabel(item)}</td>
          <td class="ro">{item.description}</td>
          <td>
            <input
              value={formatQuickEntry(item)}
              placeholder={item.points?.some((q) => !q.pins.length) ? "Points with no pins yet: give them pins" : ""}
              onchange={(e) => {
                const v = e.currentTarget.value;
                editor.apply((p) => setQuickEntry(p, item.id, v));
              }}
            />
          </td>
          <td class="sheets">{usedOn(item.id).join(", ") || "–"}</td>
          <td class="actions">
            <button onclick={() => place(item.id)} disabled={!item.terminals.length} title={item.terminals.length ? "Place a view of this on the current sheet" : "Give it pins first"}>Place view</button>
            <button class:active={open === item.id} onclick={() => (open = open === item.id ? null : item.id)} title="Its pins (number, id, group) and points: what each signal is and how it simulates">
              Pins and points…
            </button>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
  {/if}
</Modal>

{#if open}
  <PointsDialog {editor} plantId={open} onclose={() => (open = null)} {onexpectations} />
{/if}



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
  td input {
    width: 100%;
  }
  td.tagro {
    font-weight: 600;
    white-space: nowrap;
  }
  td.ro {
    color: #445;
  }
  button.active {
    border-color: #1e6ee6;
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
