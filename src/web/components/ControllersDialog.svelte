<script lang="ts">
  import {
    addController,
    addModule,
    addSpareSlot,
    deleteController,
    generateModule,
    moveSlot,
    removeSlot,
    setSlotAddress,
    updateController,
    updateModule,
  } from "../../core/controllers";
  import { POINT_FORMS, type ModuleType, type PlantItem, type PointForm } from "../../core/model";
  import { MODULE_TYPES, controllerTag, defaultPattern, moduleType, slotAddress, viewsOf, type ModulePattern } from "../../core/modules";
  import { moduleParam, plantLabel, plantPinsParam } from "../../core/ops";
  import type { Editor } from "../editor.svelte";
  import Modal from "./Modal.svelte";
  import PointsDialog from "./PointsDialog.svelte";

  /**
   * Controllers (controller.md §4): each is its modules in rail order, with
   * any spare slots. A module is made from a generic type, its pins filled
   * in by the generator and touched up in its pins table; it's tagged by
   * where its first view is drawn (A3-23), like any part.
   */
  let { editor, onclose, onexpectations }: { editor: Editor; onclose: () => void; onexpectations?: () => void } = $props();

  const controllers = $derived(editor.project.controllers ?? []);
  let newDesc = $state("");
  /** Per controller: the type and channels of the next module to add. */
  let addType = $state<Record<string, ModuleType>>({});
  let addChannels = $state<Record<string, number>>({});
  /** The module whose pins and points window is open. */
  let pointsOf = $state<string | null>(null);
  /** The module whose generator is open, with its pattern. */
  let gen = $state<{ id: string; p: ModulePattern } | null>(null);

  const moduleOf = (id: string | undefined): PlantItem | undefined => (id ? editor.project.plant.find((p) => p.id === id) : undefined);
  const where = (id: string) => viewsOf(editor.project, id).map((v) => v.address).join(", ");

  function place(item: PlantItem) {
    editor.tool = "place";
    editor.placeSymbol = "plant-view";
    editor.placeParams = {
      plant: item.id,
      show: item.terminals.join(","),
      terms: item.terminals.join(","),
      pdesc: item.description,
      pinfo: item.info ?? "",
      ppins: plantPinsParam(item),
      pbo: false,
      pmod: moduleParam(item),
    };
    onclose();
  }

  function openGenerator(item: PlantItem) {
    const m = item.module!;
    // Start from what it has: its channel count, first pin, and the ids of its first channel.
    const p = defaultPattern(m.type, m.channels ?? 8);
    const first = item.points?.[0];
    if (first) {
      p.ids = first.pins.map((t) => item.pins?.[t]?.id ?? "").filter(Boolean).join(" ") || p.ids;
      p.form = first.form;
    }
    const n = Number(item.terminals[0]);
    if (Number.isFinite(n) && item.terminals.length) p.first = n;
    gen = { id: item.id, p };
  }

  function generate() {
    if (!gen) return;
    const g = gen;
    const item = moduleOf(g.id);
    if (item?.terminals.length && !confirm(`Replace ${plantLabel(item)}'s pins with the ${g.p.channels} channels this makes? Wires on pins that go are removed.`)) return;
    if (editor.apply((p) => generateModule(p, g.id, { ...g.p }))) gen = null;
  }
</script>

<Modal title="Controllers" store="controllers" wide {onclose}>
  <p class="hint">
    A controller (an outstation or PLC) is its modules in rail order. Add modules by type; the generator fills in their pins
    (one channel each, ids and numbers from the datasheet), and <em>Pins and points…</em> takes care of any oddities. Each
    module is tagged by where its first view is drawn, prefix A (A3-23), and its points are referred to as
    <code>A3-23:DI2</code>. Its views go at the top of a sheet, terminals underneath.
  </p>
  <form
    class="top"
    onsubmit={(e) => {
      e.preventDefault();
      const d = newDesc;
      if (editor.apply((p) => addController(p, d))) newDesc = "";
    }}
  >
    <input bind:value={newDesc} placeholder="New controller, e.g. AHU-1 outstation" />
    <button type="submit">Add controller</button>
  </form>
  {#if !controllers.length}
    <p class="hint">No controllers yet.</p>
  {/if}
  {#each controllers as c (c.id)}
    <section>
      <div class="head">
        <strong>{controllerTag(editor.project, c)}</strong>
        <input class="desc" value={c.description} placeholder="Description" onchange={(e) => editor.apply((p) => updateController(p, c.id, { description: e.currentTarget.value }))} />
        <label title="The letters its modules' tags start with: A unless the project uses another">
          Prefix <input class="prefix" value={c.prefix} onchange={(e) => editor.apply((p) => updateController(p, c.id, { prefix: e.currentTarget.value }))} />
        </label>
        <button
          class="danger"
          title="Delete this controller, its modules and every view of them"
          onclick={() => {
            if (confirm(`Delete ${controllerTag(editor.project, c)} ${c.description}, its modules and every view of them?`)) editor.apply((p) => deleteController(p, c.id));
          }}>✕</button
        >
      </div>
      <table>
        <thead>
          <tr>
            <th title="Its position on the controller's bus: from rail order unless set to match its DIP switches">Address</th>
            <th>Tag</th><th>Type</th><th>Channels</th><th>Maker</th><th>Model</th><th>Drawn at</th><th></th>
          </tr>
        </thead>
        <tbody>
          {#each c.slots as s, i (s.module ?? `spare-${i}`)}
            {@const item = moduleOf(s.module)}
            <tr class:spare={!item}>
              <td class="narrow">
                <input
                  type="number"
                  min="1"
                  max="255"
                  value={slotAddress(editor.project, c, i)}
                  title={(item?.module?.address ?? s.address) ? "Set by hand: clear it to follow rail order" : "From rail order"}
                  onchange={(e) => {
                    const v = e.currentTarget.value;
                    editor.apply((p) => setSlotAddress(p, c.id, i, v === "" ? null : Number(v)));
                  }}
                />
              </td>
              {#if item?.module}
                {@const m = item.module}
                <td class="tag">{plantLabel(item)}</td>
                <td>
                  <select value={m.type} title={moduleType(m.type).label} onchange={(e) => editor.apply((p) => updateModule(p, item.id, { type: e.currentTarget.value as ModuleType }))}>
                    {#each MODULE_TYPES as t (t.value)}<option value={t.value}>{t.short}: {t.label}</option>{/each}
                  </select>
                </td>
                <td class="narrow">
                  {#if moduleType(m.type).channels}
                    <input type="number" min="1" max="64" value={m.channels ?? 8} title="Set the count, then Generate… to make its pins"
                      onchange={(e) => editor.apply((p) => updateModule(p, item.id, { channels: Number(e.currentTarget.value) }))} />
                  {:else}–{/if}
                </td>
                <td><input value={m.maker ?? ""} onchange={(e) => editor.apply((p) => updateModule(p, item.id, { maker: e.currentTarget.value }))} /></td>
                <td><input value={m.model ?? ""} onchange={(e) => editor.apply((p) => updateModule(p, item.id, { model: e.currentTarget.value }))} /></td>
                <td class="sheets">{where(item.id) || "–"}</td>
                <td class="actions">
                  <button onclick={() => place(item)} title="Place a view of this module on the current sheet, at the top">Place view</button>
                  <button class:active={gen?.id === item.id} onclick={() => (gen?.id === item.id ? (gen = null) : openGenerator(item))} title="Fill in its pins from a pattern">Generate…</button>
                  <button class:active={pointsOf === item.id} onclick={() => (pointsOf = pointsOf === item.id ? null : item.id)} title="Its pins and points, and each point's label">Pins and points…</button>
                  <button disabled={i === 0} title="Move left along the rail" onclick={() => editor.apply((p) => moveSlot(p, c.id, i, i - 1))}>↑</button>
                  <button disabled={i === c.slots.length - 1} title="Move right along the rail" onclick={() => editor.apply((p) => moveSlot(p, c.id, i, i + 1))}>↓</button>
                  <button class="danger" title="Delete this module and its views"
                    onclick={() => {
                      if (confirm(`Delete ${plantLabel(item)} and every view of it?`)) editor.apply((p) => removeSlot(p, c.id, i));
                    }}>✕</button>
                </td>
              {:else}
                <td class="tag" colspan="6"><em>Spare I/O</em></td>
                <td class="actions">
                  <button disabled={i === 0} title="Move left along the rail" onclick={() => editor.apply((p) => moveSlot(p, c.id, i, i - 1))}>↑</button>
                  <button disabled={i === c.slots.length - 1} title="Move right along the rail" onclick={() => editor.apply((p) => moveSlot(p, c.id, i, i + 1))}>↓</button>
                  <button class="danger" title="Remove this spare slot" onclick={() => editor.apply((p) => removeSlot(p, c.id, i))}>✕</button>
                </td>
              {/if}
            </tr>
            {#if gen && item && gen.id === item.id}
              <tr class="gen">
                <td colspan="8">
                  <div class="pattern">
                    <label>Channels <input type="number" min="0" max="64" bind:value={gen.p.channels} /></label>
                    <label title="Each channel's pin ids in order, e.g. VO RET CO, IO C, Y ⊥">Pin ids <input bind:value={gen.p.ids} /></label>
                    <label>First pin number <input type="number" min="0" bind:value={gen.p.first} /></label>
                    <label title="Group and point names, # for the channel number">Names <input bind:value={gen.p.group} placeholder="DI#" /></label>
                    <label title="The first channel's number: later than 1 where the maker numbers channels across the controller">First channel <input type="number" min="0" bind:value={gen.p.start} placeholder="1" /></label>
                    <label title="Ids of pins shared by several channels, e.g. a common ⊥">Shared <input bind:value={gen.p.shared} placeholder="e.g. C" /></label>
                    <label title="How many channels share each shared pin">by <input type="number" min="1" bind:value={gen.p.shareBy} placeholder="1" /></label>
                    <label>
                      Form
                      <select bind:value={gen.p.form}>
                        {#each POINT_FORMS as f (f.value)}<option value={f.value as PointForm}>{f.label}</option>{/each}
                      </select>
                    </label>
                    <button onclick={generate}>Generate</button>
                    <button onclick={() => (gen = null)}>Cancel</button>
                  </div>
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
      <div class="add">
        <select value={addType[c.id] ?? "di"} onchange={(e) => (addType[c.id] = e.currentTarget.value as ModuleType)}>
          {#each MODULE_TYPES as t (t.value)}<option value={t.value}>{t.label}</option>{/each}
        </select>
        {#if moduleType(addType[c.id] ?? "di").channels}
          <label>× <input class="narrowin" type="number" min="1" max="64" value={addChannels[c.id] ?? 8} onchange={(e) => (addChannels[c.id] = Number(e.currentTarget.value))} /></label>
        {/if}
        <button
          onclick={() => {
            const type = addType[c.id] ?? "di";
            const channels = addChannels[c.id] ?? 8;
            editor.apply((p) => addModule(p, c.id, { type, channels, pattern: type === "host" ? null : undefined }));
          }}>Add module</button
        >
        <button onclick={() => editor.apply((p) => addSpareSlot(p, c.id))} title="A slot left for later: drawn dashed on the controller map">Add spare slot</button>
      </div>
    </section>
  {/each}
</Modal>

{#if pointsOf}
  <PointsDialog {editor} plantId={pointsOf} onclose={() => (pointsOf = null)} {onexpectations} />
{/if}

<style>
  section {
    border-top: 1px solid #dde;
    padding: 8px 0;
  }
  .head {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 6px;
  }
  .head .desc {
    flex: 1;
  }
  .head label {
    font-size: 12px;
    color: #445;
  }
  .prefix {
    width: 48px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th {
    text-align: left;
    font-size: 12px;
    font-weight: normal;
    color: #445;
  }
  td input,
  td select {
    width: 100%;
  }
  td.narrow {
    width: 64px;
  }
  td.tag {
    white-space: nowrap;
    font-weight: 600;
  }
  tr.spare td.tag {
    font-weight: normal;
    color: #667;
  }
  td.sheets {
    font-size: 12px;
    color: #556;
    white-space: nowrap;
  }
  td.actions {
    white-space: nowrap;
  }
  button.active {
    border-color: #1e6ee6;
  }
  .pattern {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: end;
    padding: 6px;
    background: #f3f4f8;
  }
  .pattern label {
    display: flex;
    flex-direction: column;
    font-size: 11px;
    color: #445;
  }
  .pattern input {
    width: 90px;
  }
  .add {
    display: flex;
    gap: 6px;
    align-items: center;
    margin-top: 6px;
  }
  .narrowin {
    width: 56px;
  }
  .top {
    display: flex;
    gap: 6px;
    margin-bottom: 8px;
  }
  .top input {
    flex: 1;
  }
  .hint {
    font-size: 12px;
    color: #667;
    margin: 0 0 10px;
  }
</style>
