<script lang="ts">
  import { addPlant, deletePlant, updatePlant } from "../../core/ops";
  import type { Editor } from "../editor.svelte";
  import Modal from "./Modal.svelte";

  let { editor, onclose }: { editor: Editor; onclose: () => void } = $props();

  let tag = $state("");
  let description = $state("");
  let terminals = $state("");

  const split = (s: string) => s.split(/[,\s]+/).filter(Boolean);

  function add(e: SubmitEvent) {
    e.preventDefault();
    const t = tag;
    const d = description;
    const terms = split(terminals);
    if (editor.apply((p) => addPlant(p, t, d, terms))) {
      tag = "";
      description = "";
      terminals = "";
    }
  }

  function place(id: string) {
    const item = editor.project.plant.find((p) => p.id === id)!;
    editor.tool = "place";
    editor.placeSymbol = "plant-view";
    editor.placeParams = {
      plant: id,
      show: item.terminals.join(","),
      terms: item.terminals.join(","),
      pdesc: item.description,
    };
    onclose();
  }

  const usedOn = (id: string) =>
    editor.project.pages.filter((pg) => pg.elements.some((e) => e.symbol === "plant-view" && e.params.plant === id)).map((pg) => pg.number);
</script>

<Modal title="Plant" {onclose} wide>
  <p class="hint">
    Field equipment, defined once with all its terminals. Place a view of it on any sheet and tick the terminals that sheet
    shows. In labels, <code>{"{plant:SF-01.tag}"}</code> fills in the tag.
  </p>
  <table>
    <thead><tr><th>Tag</th><th>Description</th><th>Terminals (comma-separated)</th><th>Sheets</th><th></th></tr></thead>
    <tbody>
      {#each editor.project.plant as item (item.id)}
        <tr>
          <td><input value={item.tag} onchange={(e) => { const v = e.currentTarget.value; editor.apply((p) => updatePlant(p, item.id, { tag: v })); }} /></td>
          <td><input value={item.description} onchange={(e) => { const v = e.currentTarget.value; editor.apply((p) => updatePlant(p, item.id, { description: v })); }} /></td>
          <td><input value={item.terminals.join(", ")} onchange={(e) => { const v = split(e.currentTarget.value); editor.apply((p) => updatePlant(p, item.id, { terminals: v })); }} /></td>
          <td class="sheets">{usedOn(item.id).join(", ") || "–"}</td>
          <td class="actions">
            <button onclick={() => place(item.id)} title="Place a view of this on the current sheet">Place view</button>
            <button
              class="danger"
              title="Delete this plant item and all its views"
              onclick={() => {
                if (confirm(`Delete ${item.tag} and every view of it?`)) editor.apply((p) => deletePlant(p, item.id));
              }}>✕</button
            >
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
  <form onsubmit={add}>
    <input bind:value={tag} placeholder="Tag, e.g. SF-01" required />
    <input bind:value={description} placeholder="Description, e.g. Supply fan 1" />
    <input bind:value={terminals} placeholder="Terminals, e.g. U V W PE 1 2" />
    <button type="submit">Add plant</button>
  </form>
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
  td input {
    width: 100%;
  }
  td.sheets {
    font-size: 12px;
    color: #556;
    white-space: nowrap;
  }
  td.actions {
    white-space: nowrap;
  }
  form {
    display: grid;
    grid-template-columns: 1fr 1.5fr 1.5fr auto;
    gap: 6px;
  }
  .hint {
    font-size: 12px;
    color: #667;
    margin: 0 0 10px;
  }
</style>
