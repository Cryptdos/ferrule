<script lang="ts">
  import { addDistribution, deleteDistribution, distParamKeys, updateDistribution } from "../../core/ops";
  import { DISTRIBUTION_KINDS, type DistributionKind } from "../../core/model";
  import { WIRE_FUNCTIONS } from "../../core/wirecolours";
  import ColourSelect from "./ColourSelect.svelte";
  import type { Editor } from "../editor.svelte";
  import Modal from "./Modal.svelte";

  let { editor, onclose }: { editor: Editor; onclose: () => void } = $props();

  let name = $state("");
  let kind = $state<DistributionKind>("line");
  let voltage = $state("");
  let colour = $state("");
  let func = $state("");

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
    The supplies this project distributes. Distribution blocks, control rails, link arrows and the incoming supply pick
    one from this list, so everything on the same distribution is joined on every sheet. A block or rail on no distribution
    is <strong>local</strong> and joins nothing else. Wires drawn from them take their colour and function from here unless they say otherwise.
  </p>
  {#if editor.project.distributions.length}
    <table>
      <thead>
        <tr><th>Name</th><th>Kind</th><th>Voltage</th><th>Colour</th><th>Function</th><th>Sheets</th><th></th></tr>
      </thead>
      <tbody>
        {#each editor.project.distributions as d (d.id)}
          <tr>
            <td><input value={d.name} onchange={(e) => update(d.id, { name: e.currentTarget.value })} /></td>
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
