<script lang="ts">
  import { addDistribution, deleteDistribution, distParamKeys, setFunctionColour, updateDistribution } from "../../core/ops";
  import { DISTRIBUTION_KINDS, type DistributionKind } from "../../core/model";
  import { WIRE_COLOURS, WIRE_FUNCTIONS, functionColour, functionRows } from "../../core/wirecolours";
  import ColourSelect from "./ColourSelect.svelte";
  import type { Editor } from "../editor.svelte";
  import Modal from "./Modal.svelte";

  let { editor, onclose }: { editor: Editor; onclose: () => void } = $props();

  let name = $state("");
  let kind = $state<DistributionKind>("line");
  let voltage = $state("");
  let colour = $state("");
  let func = $state("");
  let newFunction = $state("");
  let newFunctionColour = $state("");

  function add(e: SubmitEvent) {
    e.preventDefault();
    const d = { name, kind, voltage, colour, function: func };
    if (editor.apply((p) => addDistribution(p, d))) {
      name = "";
      voltage = "";
      colour = "";
      func = "";
    }
  }

  const update = (id: string, patch: Parameters<typeof updateDistribution>[2]) => editor.apply((p) => updateDistribution(p, id, patch));

  /** Sheets with a block, rail, arrow or supply on this distribution. */
  const usedOn = (id: string) =>
    editor.project.pages
      .filter((pg) => pg.elements.some((e) => distParamKeys(e).some((k) => e.params[k] === id)))
      .map((pg) => pg.number);
</script>

<Modal title="Distribution" {onclose} wide>
  <p class="hint">
    The supplies this project distributes, each with a number, its <strong>tag</strong>, that every wire on it carries. Distribution blocks, control rails, link arrows and the incoming supply pick
    one from this list, so everything on the same distribution is joined on every sheet. A block or rail on no distribution
    is <strong>local</strong> and joins nothing else. Wires drawn from them take their colour and function from here unless they say otherwise.
  </p>
  {#if editor.project.distributions.length}
    <table>
      <thead>
        <tr><th>Name</th><th title="Every wire on this supply carries this number (0 is fine for the controls' 0 V)">Tag</th><th>Kind</th><th>Voltage</th><th>Colour</th><th>Function</th><th>Sheets</th><th></th></tr>
      </thead>
      <tbody>
        {#each editor.project.distributions as d (d.id)}
          <tr>
            <td><input value={d.name} onchange={(e) => update(d.id, { name: e.currentTarget.value })} /></td>
            <td class="tag">
              <input
                type="number"
                min="0"
                step="1"
                value={d.tag ?? ""}
                title="Every wire on this supply carries this number"
                onchange={(e) => {
                  const el = e.currentTarget;
                  if (!update(d.id, { tag: Number(el.value) })) el.value = String(d.tag ?? "");
                }}
              />
            </td>
            <td>
              <select value={d.kind} onchange={(e) => update(d.id, { kind: e.currentTarget.value as DistributionKind })}>
                {#each DISTRIBUTION_KINDS as k (k.value)}<option value={k.value}>{k.label}</option>{/each}
              </select>
            </td>
            <td><input value={d.voltage} placeholder="e.g. 230 V" onchange={(e) => update(d.id, { voltage: e.currentTarget.value })} /></td>
            <td class="narrow"><ColourSelect value={d.colour} onchange={(v) => update(d.id, { colour: v })} /></td>
            <td class="narrow"><input value={d.function ?? ""} list="dist-functions" onchange={(e) => update(d.id, { function: e.currentTarget.value })} /></td>
            <td class="sheets">{usedOn(d.id).join(", ") || "–"}</td>
            <td>
              <button
                class="danger"
                title="Delete it: blocks and rails on it become local"
                onclick={() => {
                  if (confirm(`Delete ${d.name}? Blocks and rails on it become local.`)) editor.apply((p) => deleteDistribution(p, d.id));
                }}>✕</button
              >
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {:else}
    <p class="hint">No distributions yet. Projects start bare: keep a preferred set in a project you duplicate.</p>
  {/if}
  <form onsubmit={add}>
    <input bind:value={name} placeholder="Name, e.g. L1 or CCT" required />
    <select bind:value={kind}>
      {#each DISTRIBUTION_KINDS as k (k.value)}<option value={k.value}>{k.label}</option>{/each}
    </select>
    <input bind:value={voltage} placeholder="Voltage, e.g. 24 V DC" />
    <ColourSelect value={colour} title="Colour" onchange={(v) => (colour = v)} />
    <input bind:value={func} placeholder="Function" list="dist-functions" />
    <button type="submit">Add</button>
  </form>
  <datalist id="dist-functions">
    {#each WIRE_FUNCTIONS as f (f)}<option value={f}></option>{/each}
  </datalist>
  <h3>Wire colours by function</h3>
  <!-- v0.4.x M3: a wire with no colour of its own takes its function's (from its distribution, or set on the wire). In Distribution since v0.5 (A52), with all wire colour. -->
  <table class="wirecolours">
    <tbody>
      {#each functionRows(editor.project) as f (f)}
        <tr>
          <td>{f}</td>
          <td>
            <input value={functionColour(editor.project, f) ?? ""} list="ferrule-core-colours" placeholder="—" onchange={(e) => { const v = e.currentTarget.value; editor.apply((p) => setFunctionColour(p, f, v)); }} />
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
  <form class="inline" onsubmit={(e) => { e.preventDefault(); const f = newFunction.trim(); const c = newFunctionColour.trim(); if (f && c) editor.apply((p) => setFunctionColour(p, f, c)); newFunction = ""; newFunctionColour = ""; }}>
    <input bind:value={newFunction} placeholder="Another function" />
    <input bind:value={newFunctionColour} list="ferrule-core-colours" placeholder="Colour, e.g. Og" />
    <button type="submit">Add</button>
  </form>
  <datalist id="ferrule-core-colours">{#each WIRE_COLOURS as c (c.code)}<option value={c.code}>{c.name}</option>{/each}</datalist>
  <p class="hint">A wire's function comes from its distribution when it's on one, else from the function set on the wire. Its own colour, if set, wins.</p>
</Modal>

<style>
  td.tag input {
    width: 4.5em;
  }
  table.wirecolours {
    width: auto;
  }
  form.inline {
    display: flex;
    gap: 6px;
    max-width: 520px;
    margin: 6px 0;
  }
  .wirecolours td {
    padding: 1px 8px 1px 0;
    font-size: 13px;
  }
  .wirecolours input {
    width: 6em;
  }
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
  td select {
    width: 100%;
  }
  td.narrow {
    width: 120px;
  }
  td :global(select) {
    width: 100%;
  }
  td.sheets {
    font-size: 12px;
    color: #556;
    white-space: nowrap;
  }
  form {
    display: grid;
    grid-template-columns: 1.4fr 1fr 1fr 0.7fr 0.7fr auto;
    gap: 6px;
  }
  .hint {
    font-size: 12px;
    color: #667;
    margin: 0 0 10px;
  }
</style>
