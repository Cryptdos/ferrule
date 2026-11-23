<script lang="ts">
  import { addPlant, deletePlant, formatTerminalSpec, parseTerminalSpec, plantLabel, updatePlant, updatePlantGroup } from "../../core/ops";
  import { plantGroupRole } from "../../core/sim";
  import type { Editor } from "../editor.svelte";
  import Modal from "./Modal.svelte";

  let { editor, onclose }: { editor: Editor; onclose: () => void } = $props();

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
    const spec = parseTerminalSpec(terminals);
    const i = info;
    const power = pbo;
    if (editor.apply((p) => addPlant(p, "", d, spec.terminals, { groups: spec.groups, info: i, prefix: pre, powerByOthers: power }))) {
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
      pgroups: (item.groups ?? []).map((g) => `${g.name}=${g.terminals.join(",")}`).join(";"),
      pbo: item.powerByOthers === true,
    };
    onclose();
  }

  const usedOn = (id: string) =>
    editor.project.pages.filter((pg) => pg.elements.some((e) => e.symbol === "plant-view" && e.params.plant === id)).map((pg) => pg.number);
  const update = (id: string, patch: Parameters<typeof updatePlant>[2]) => editor.apply((p) => updatePlant(p, id, patch));
  const updateGroup = (id: string, group: string, patch: Parameters<typeof updatePlantGroup>[3]) =>
    editor.apply((p) => updatePlantGroup(p, id, group, patch));
  let open = $state<string | null>(null);
</script>

<Modal title="Plant" {onclose} wide>
  <p class="hint">
    Field equipment, defined once with all its terminals. Place a view of it on any sheet and tick the terminals that sheet
    shows. Its tag is its prefix and where its first view is (SEF-3-13, U3-13), given by Renumber like every other tag;
    type a tag yourself to fix it. In labels, <code>{"{plant:SF-01.tag}"}</code> fills in the tag.
  </p>
  <div class="top"><button onclick={() => (adding = true)}>New plant…</button></div>
  {#if !editor.project.plant.length}
    <p class="hint">No plant yet. <em>New plant…</em> adds one.</p>
  {:else}
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
            {#if item.groups?.length}
              <button class:active={open === item.id} onclick={() => (open = open === item.id ? null : item.id)} title="How its groups behave when simulating">
                Simulation
              </button>
            {/if}
            <button
              class="danger"
              title="Delete this plant item and all its views"
              onclick={() => {
                if (confirm(`Delete ${plantLabel(item)} and every view of it?`)) editor.apply((p) => deletePlant(p, item.id));
              }}>✕</button
            >
          </td>
        </tr>
        {#if open === item.id && item.groups?.length}
          <tr class="groups">
            <td colspan="8">
              <p class="hint">
                In Simulate, an <strong>output</strong> (a relay C/NO/NC, or a volt-free pair like RUNNING or FAULT) is
                switched by clicking it, or follows one of the plant's <strong>inputs</strong> (a pair the panel drives,
                like ENABLE) after a delay. NO and NC work as they should: C–NO closes when operated, C–NC opens.
              </p>
              <table class="inner">
                <thead><tr><th>Group</th><th>Role</th><th>Follows</th><th>Delay (s)</th><th>Inverted</th></tr></thead>
                <tbody>
                  {#each item.groups as g (g.name)}
                    {@const role = plantGroupRole(g)}
                    <tr>
                      <td><strong>{g.name}</strong> <span class="terms">{g.terminals.map((t) => t.split(".").pop()).join(" ")}</span></td>
                      <td>
                        <select
                          value={g.role ?? ""}
                          onchange={(e) => updateGroup(item.id, g.name, { role: (e.currentTarget.value || null) as "input" | "output" | "none" | null })}
                        >
                          <option value="">Automatic ({plantGroupRole({ ...g, role: undefined })})</option>
                          <option value="output">Output (contacts the plant switches)</option>
                          <option value="input">Input (the panel drives it)</option>
                          <option value="none">Neither (supply, signal)</option>
                        </select>
                      </td>
                      <td>
                        {#if role === "output"}
                          <select value={g.follows ?? ""} onchange={(e) => updateGroup(item.id, g.name, { follows: e.currentTarget.value || null })}>
                            <option value="">Nothing: click it</option>
                            {#each item.groups.filter((x) => x.name !== g.name && plantGroupRole(x) === "input") as x (x.name)}
                              <option value={x.name}>{x.name}</option>
                            {/each}
                          </select>
                        {:else}–{/if}
                      </td>
                      <td>
                        {#if role === "output" && g.follows}
                          <input type="number" min="0" step="0.5" value={g.delay ?? 0} onchange={(e) => updateGroup(item.id, g.name, { delay: Number(e.currentTarget.value) || 0 })} />
                        {:else}–{/if}
                      </td>
                      <td>
                        {#if role === "output" && g.follows}
                          <input type="checkbox" checked={g.invert === true} onchange={(e) => updateGroup(item.id, g.name, { invert: e.currentTarget.checked })} />
                        {:else}–{/if}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </td>
          </tr>
        {/if}
      {/each}
    </tbody>
  </table>
  {/if}
</Modal>

{#if adding}
  <Modal title="New plant" store="new-plant" width={520} onclose={() => (adding = false)}>
    <form onsubmit={add}>
      <label>Prefix <input bind:value={prefix} placeholder="e.g. SEF" required /></label>
      <label>Description <input bind:value={description} placeholder="e.g. Safety extract fan" /></label>
      <label>
        Terminals and groups
        <input bind:value={terminals} placeholder="e.g. L N E | ENABLE: 1 2" />
      </label>
      <p class="hint">
        Group terminals by function with <code>|</code> and a name: <code>L N E | ENABLE: 1 2 | R1: C NO NC | R2: C NO NC</code>.
        The same terminal names can be used in different groups.
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
  tr.groups td {
    background: #f6f8fb;
    padding: 6px 10px;
  }
  table.inner {
    width: auto;
  }
  table.inner td {
    padding: 2px 8px 2px 0;
  }
  .terms {
    color: #778;
    font-size: 12px;
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
