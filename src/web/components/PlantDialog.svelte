<script lang="ts">
  import { addPlant, deletePlant, formatTerminalSpec, parseTerminalSpec, updatePlant } from "../../core/ops";
  import type { Editor } from "../editor.svelte";
  import Modal from "./Modal.svelte";

  let { editor, onclose }: { editor: Editor; onclose: () => void } = $props();

  let tag = $state("");
  let description = $state("");
  let terminals = $state("");
  let info = $state("");

  function add(e: SubmitEvent) {
    e.preventDefault();
    const t = tag;
    const d = description;
    const spec = parseTerminalSpec(terminals);
    const i = info;
    if (editor.apply((p) => addPlant(p, t, d, spec.terminals, { groups: spec.groups, info: i }))) {
      tag = "";
      description = "";
      terminals = "";
      info = "";
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
      pinfo: item.info ?? "",
      pgroups: (item.groups ?? []).map((g) => `${g.name}=${g.terminals.join(",")}`).join(";"),
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
  <p class="hint">
    Group terminals by function with <code>|</code> and a name: <code>L N E | ENABLE: 1 2 | 0-10V: 3 4 | FAULT: 5 6</code>.
    Group names print in bold inside the box; the tag, description and information print under it.
  </p>
  <table>
    <thead><tr><th>Tag</th><th>Description</th><th>Terminals and groups</th><th>Information (under the box)</th><th>Sheets</th><th></th></tr></thead>
    <tbody>
      {#each editor.project.plant as item (item.id)}
        <tr>
          <td><input value={item.tag} onchange={(e) => { const v = e.currentTarget.value; editor.apply((p) => updatePlant(p, item.id, { tag: v })); }} /></td>
          <td><input value={item.description} onchange={(e) => { const v = e.currentTarget.value; editor.apply((p) => updatePlant(p, item.id, { description: v })); }} /></td>
          <td><input value={formatTerminalSpec(item)} onchange={(e) => { const v = parseTerminalSpec(e.currentTarget.value); editor.apply((p) => updatePlant(p, item.id, { terminals: v.terminals, groups: v.groups })); }} /></td>
          <td><textarea rows="2" value={item.info ?? ""} onchange={(e) => { const v = e.currentTarget.value; editor.apply((p) => updatePlant(p, item.id, { info: v })); }}></textarea></td>
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
    <input bind:value={terminals} placeholder="Terminals, e.g. L N E | ENABLE: 1 2" />
    <textarea bind:value={info} rows="1" placeholder="Information, e.g. model, rating"></textarea>
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
  td input,
  td textarea {
    width: 100%;
  }
  textarea {
    font: inherit;
    font-size: 13px;
    resize: vertical;
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
    grid-template-columns: 1fr 1.5fr 2fr 1.5fr auto;
    gap: 6px;
  }
  .hint {
    font-size: 12px;
    color: #667;
    margin: 0 0 10px;
  }
</style>
