<script lang="ts">
  import { addPlant, deletePlant, plantLabel, plantPinsParam, setQuickEntry, updatePlant } from "../../core/ops";
  import { formatQuickEntry, parseQuickEntry } from "../../core/points";
  import type { Editor } from "../editor.svelte";
  import Modal from "./Modal.svelte";
  import PointsDialog from "./PointsDialog.svelte";

  let { editor, onclose, onexpectations }: { editor: Editor; onclose: () => void; onexpectations?: () => void } = $props();

  let prefix = $state("");
  let description = $state("");
  let terminals = $state("");
  let info = $state("");
  let pbo = $state(false);
  /** New plant… opens its own window to fill in (note 52). */
  let adding = $state(false);

  function add(e: SubmitEvent) {
    e.preventDefault();
    const pre = prefix;
    const d = description;
    const spec = parseQuickEntry(terminals);
    const i = info;
    const power = pbo;
    if (editor.apply((p) => addPlant(p, "", d, spec.terminals, { points: spec.points, info: i, prefix: pre, powerByOthers: power }))) {
      prefix = "";
      description = "";
      terminals = "";
      info = "";
      pbo = false;
      adding = false;
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
      ppins: plantPinsParam(item),
      pbo: item.powerByOthers === true,
    };
    onclose();
  }

  const usedOn = (id: string) =>
    editor.project.pages.filter((pg) => pg.elements.some((e) => e.symbol === "plant-view" && e.params.plant === id)).map((pg) => pg.number);
  const update = (id: string, patch: Parameters<typeof updatePlant>[2]) => editor.apply((p) => updatePlant(p, id, patch));
  /** Controllers' modules are listed under Controllers. */
  const plantOnly = $derived(editor.project.plant.filter((p) => !p.module));
  /** The device whose pins and points window is open. */
  let open = $state<string | null>(null);
</script>

<Modal title="Plant" {onclose} wide>
  <p class="hint">
    Field equipment, defined once with all its terminals. Place a view of it on any sheet and tick the terminals that sheet
    shows. Its tag is its prefix and where its first view is (SEF-3-13, U3-13), given by Renumber like every other tag;
    type a tag yourself to fix it. In labels, <code>{"{plant:SF-01.tag}"}</code> fills in the tag.
  </p>
  <div class="top"><button onclick={() => (adding = true)}>New plant…</button></div>
  {#if !plantOnly.length}
    <p class="hint">No plant yet. <em>New plant…</em> adds one.</p>
  {:else}
  <table>
    <thead>
      <tr>
        <th>Prefix</th><th>Tag</th><th>Description</th><th title="Quick entry: Mains: L N E | Run: 1 2 | Running: C NO NC. Pins and points… for the full table">Pins and points</th><th>Information (under the box)</th>
        <th title="Its power isn't on these drawings: a break on the left of the box, marked POWER BY OTHERS">Power by others</th>
        <th>Sheets</th><th></th>
      </tr>
    </thead>
    <tbody>
      {#each plantOnly as item (item.id)}
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
              value={formatQuickEntry(item)}
              onchange={(e) => {
                const v = e.currentTarget.value;
                editor.apply((p) => setQuickEntry(p, item.id, v));
              }}
            />
          </td>
          <td><textarea rows="2" value={item.info ?? ""} onchange={(e) => update(item.id, { info: e.currentTarget.value })}></textarea></td>
          <td class="check"><input type="checkbox" checked={item.powerByOthers === true} onchange={(e) => update(item.id, { powerByOthers: e.currentTarget.checked })} /></td>
          <td class="sheets">{usedOn(item.id).join(", ") || "–"}</td>
          <td class="actions">
            <button onclick={() => place(item.id)} title="Place a view of this on the current sheet">Place view</button>
            <button class:active={open === item.id} onclick={() => (open = open === item.id ? null : item.id)} title="Its pins (number, id, group) and points: what each signal is and how it simulates">
              Pins and points…
            </button>
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
  {/if}
</Modal>

{#if open}
  <PointsDialog {editor} plantId={open} onclose={() => (open = null)} {onexpectations} />
{/if}

{#if adding}
  <Modal title="New plant" store="new-plant" width={520} onclose={() => (adding = false)}>
    <form onsubmit={add}>
      <label>Prefix <input bind:value={prefix} placeholder="e.g. SEF" required /></label>
      <label>Description <input bind:value={description} placeholder="e.g. Safety extract fan" /></label>
      <label>
        Pins and points
        <input bind:value={terminals} placeholder="e.g. Mains: L N E | Run: 1 2 | Running: C NO NC" />
      </label>
      <p class="hint">
        Pin numbers, split into points (one signal each) with <code>|</code> and a name:
        <code>Mains: L N E | Run: 1 2 | R1: C NO NC | R2: C NO NC</code>. The same numbers can be used in different points.
        Each point's form is guessed (C/NO/NC a contact, L/N a supply in, RUN/ENABLE a powered input); change it, and how it
        simulates, in <em>Pins and points…</em>.
      </p>
      <label>Information (under the box) <textarea bind:value={info} rows="2" placeholder="e.g. model, 400V 7.5kW"></textarea></label>
      <label class="pbo"><input type="checkbox" bind:checked={pbo} /> Power by others (its power isn't on these drawings)</label>
      <div class="buttons">
        <button type="submit">Add plant</button>
        <button type="button" onclick={() => (adding = false)}>Cancel</button>
      </div>
    </form>
  </Modal>
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
  td input,
  td textarea {
    width: 100%;
  }
  textarea {
    font: inherit;
    font-size: 13px;
    resize: vertical;
  }
  button.active {
    border-color: #1e6ee6;
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
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  form label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
    color: #445;
  }
  form label.pbo {
    flex-direction: row;
  }
  .buttons {
    display: flex;
    gap: 6px;
  }
  .top {
    margin-bottom: 8px;
  }
  .hint {
    font-size: 12px;
    color: #667;
    margin: 0 0 10px;
  }
</style>
