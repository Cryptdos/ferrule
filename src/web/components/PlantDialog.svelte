<script lang="ts">
  import { addPlant, deletePlant, formatTerminalSpec, parseTerminalSpec, plantLabel, updatePlant } from "../../core/ops";
  import type { Editor } from "../editor.svelte";
  import Modal from "./Modal.svelte";

  let { editor, onclose }: { editor: Editor; onclose: () => void } = $props();

  let prefix = $state("");
  let description = $state("");
  let terminals = $state("");
  let info = $state("");
  let pbo = $state(false);

  function add(e: SubmitEvent) {
    e.preventDefault();
    const pre = prefix;
    const d = description;
    const spec = parseTerminalSpec(terminals);
    const i = info;
    const power = pbo;
    if (editor.apply((p) => addPlant(p, "", d, spec.terminals, { groups: spec.groups, info: i, prefix: pre, powerByOthers: power }))) {
      prefix = "";
      description = "";
      terminals = "";
      info = "";
      pbo = false;
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
      pbo: item.powerByOthers === true,
    };
    onclose();
  }

  const usedOn = (id: string) =>
    editor.project.pages.filter((pg) => pg.elements.some((e) => e.symbol === "plant-view" && e.params.plant === id)).map((pg) => pg.number);
  const update = (id: string, patch: Parameters<typeof updatePlant>[2]) => editor.apply((p) => updatePlant(p, id, patch));
</script>

<Modal title="Plant" {onclose} wide>
  <p class="hint">
    Field equipment, defined once with all its terminals. Place a view of it on any sheet and tick the terminals that sheet
    shows. Its tag is its prefix and where its first view is (SEF-3-13, U3-13), given by Renumber like every other tag;
    type a tag yourself to fix it. In labels, <code>{"{plant:SF-01.tag}"}</code> fills in the tag.
  </p>
  <p class="hint">
    Group terminals by function with <code>|</code> and a name: <code>L N E | ENABLE: 1 2 | R1: C NO NC | R2: C NO NC</code>.
    The same terminal names can be used in different groups.
  </p>
  <table>
    <thead>
      <tr>
        <th>Prefix</th><th>Tag</th><th>Description</th><th>Terminals and groups</th><th>Information (under the box)</th>
        <th title="Its power isn't on these drawings: a break on the left of the box, marked POWER BY OTHERS">Power by others</th>
        <th>Sheets</th><th></th>
      </tr>
    </thead>
    <tbody>
      {#each editor.project.plant as item (item.id)}
        <tr>
          <td class="narrow"><input value={item.prefix ?? ""} placeholder="U" onchange={(e) => update(item.id, { prefix: e.currentTarget.value })} /></td>
          <td class="narrow">
            <input
              value={item.locked ? item.tag : ""}
              placeholder={item.tag || `${item.prefix || "U"}? (Renumber)`}
              title={item.locked ? "Typed in: Renumber keeps it. Clear it to let Renumber number it." : "Given by Renumber. Type a tag to fix it."}
              onchange={(e) => update(item.id, { tag: e.currentTarget.value })}
            />
          </td>
          <td><input value={item.description} onchange={(e) => update(item.id, { description: e.currentTarget.value })} /></td>
          <td>
            <input
              value={formatTerminalSpec(item)}
              onchange={(e) => {
                const v = parseTerminalSpec(e.currentTarget.value);
                update(item.id, { terminals: v.terminals, groups: v.groups });
              }}
            />
          </td>
          <td><textarea rows="2" value={item.info ?? ""} onchange={(e) => update(item.id, { info: e.currentTarget.value })}></textarea></td>
          <td class="check"><input type="checkbox" checked={item.powerByOthers === true} onchange={(e) => update(item.id, { powerByOthers: e.currentTarget.checked })} /></td>
          <td class="sheets">{usedOn(item.id).join(", ") || "–"}</td>
          <td class="actions">
            <button onclick={() => place(item.id)} title="Place a view of this on the current sheet">Place view</button>
            <button
              class="danger"
              title="Delete this plant item and all its views"
              onclick={() => {
                if (confirm(`Delete ${plantLabel(item)} and every view of it?`)) editor.apply((p) => deletePlant(p, item.id));
              }}>✕</button
            >
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
  <form onsubmit={add}>
    <input bind:value={prefix} placeholder="Prefix, e.g. SEF" required />
    <input bind:value={description} placeholder="Description, e.g. Safety extract fan" />
    <input bind:value={terminals} placeholder="Terminals, e.g. L N E | ENABLE: 1 2" />
    <textarea bind:value={info} rows="1" placeholder="Information, e.g. Lloret LMV-75, 400V 7.5kW"></textarea>
    <label class="pbo"><input type="checkbox" bind:checked={pbo} /> Power by others</label>
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
  td.narrow {
    width: 80px;
  }
  td.check {
    text-align: center;
  }
  .pbo {
    font-size: 12px;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 4px;
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
    grid-template-columns: 0.6fr 1.5fr 2fr 1.5fr auto auto;
    gap: 6px;
  }
  .hint {
    font-size: 12px;
    color: #667;
    margin: 0 0 10px;
  }
</style>
