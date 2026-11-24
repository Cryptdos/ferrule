<script lang="ts">
  import { untrack } from "svelte";
  import { billOfMaterials, cableSchedule, coresPerDevice, groupMarkers, ioSchedule, plantPointsSchedule, terminalSchedule, toCsv, wireMarkers } from "../../core/schedules";
  import type { Editor } from "../editor.svelte";
  import Modal from "./Modal.svelte";

  let { editor, onclose }: { editor: Editor; onclose: () => void } = $props();

  let tab: "terminals" | "cables" | "markers" | "io" | "plant" | "bom" = $state(untrack(() => (editor.mode === "ga" ? "bom" : "terminals")));
  const bom = $derived(billOfMaterials(editor.project));
  const terms = $derived(terminalSchedule(editor.project));
  const cables = $derived(cableSchedule(editor.project));
  const cores = $derived(coresPerDevice(editor.project));
  const markers = $derived(wireMarkers(editor.project));
  /** Markers grouped into text and count, for ordering (v0.4.x M10). */
  let grouped = $state(false);
  const groups = $derived(groupMarkers(markers));
  const io = $derived(ioSchedule(editor.project));
  const plantPts = $derived(plantPointsSchedule(editor.project));
  const IO_COLS: [keyof (typeof io)[number], string][] = [["controller", "Controller"], ["module", "Module"], ["point", "Point"], ["form", "Form"], ["pins", "Pins"], ["label", "Label"], ["wiredTo", "Wired to"]];
  const PLANT_COLS: [keyof (typeof plantPts)[number], string][] = [["device", "Device"], ["description", "Description"], ["point", "Point"], ["form", "Form"], ["pins", "Pins"], ["wiredTo", "Wired to"]];

  function download(name: string, text: string) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  }
  const base = $derived(editor.project.project.drawingNo || editor.project.id);
</script>

<Modal title="Schedules" {onclose} wide>
  <div class="tabs">
    <button class:active={tab === "terminals"} onclick={() => (tab = "terminals")}>Terminals ({terms.length})</button>
    <button class:active={tab === "cables"} onclick={() => (tab = "cables")}>Field cables ({cables.length})</button>
    <button class:active={tab === "markers"} onclick={() => (tab = "markers")} title="Wire and core markers, one per wire end, for a marker supplier">Markers ({markers.length})</button>
    <button class:active={tab === "io"} onclick={() => (tab = "io")} title="Every controller's points: the job's points list">IO points ({io.length})</button>
    <button class:active={tab === "plant"} onclick={() => (tab = "plant")} title="Plant's points and what they're wired to">Plant points ({plantPts.length})</button>
    <button class:active={tab === "bom"} onclick={() => (tab = "bom")} title="From the GA sheets and the device table">Bill of materials ({bom.length})</button>
    <span class="grow"></span>
    {#if tab === "terminals"}
      <button
        onclick={() =>
          download(
            `${base} terminals.csv`,
            toCsv(terms, [["strip", "Strip"], ["terminal", "Terminal"], ["where", "Sheet-col"], ["wire", "Wire"], ["internal", "Internal"], ["external", "External"]]),
          )}>Download CSV</button
      >
    {:else if tab === "markers"}
      <label class="check"><input type="checkbox" bind:checked={grouped} /> Group duplicates</label>
      <button
        onclick={() =>
          grouped
            ? download(`${base} markers grouped.csv`, toCsv(groups, [["text", "Marker"], ["count", "Count"], ["what", "What"]]))
            : download(`${base} markers.csv`, toCsv(markers, [["text", "Marker"], ["what", "What"], ["wire", "Wire"], ["where", "Sheet-col"]]))}>Download CSV</button
      >
    {:else if tab === "io"}
      <button onclick={() => download(`${base} IO schedule.csv`, toCsv(io, IO_COLS))}>Download CSV</button>
    {:else if tab === "plant"}
      <button onclick={() => download(`${base} plant points.csv`, toCsv(plantPts, PLANT_COLS))}>Download CSV</button>
    {:else if tab === "bom"}
      <button
        onclick={() =>
          download(
            `${base} bill of materials.csv`,
            toCsv(bom, [["sheet", "GA sheet"], ["item", "Item"], ["maker", "Maker"], ["part", "Part number"], ["quantity", "Quantity"], ["unit", "Unit"], ["tags", "Tags"]]),
          )}>Download CSV</button
      >
    {:else}
      <button
        onclick={() =>
          download(
            `${base} cables.csv`,
            toCsv(cables, [["plant", "Plant"], ["description", "Description"], ["plantTerminal", "Plant terminal"], ["wire", "Wire"], ["panelTerminal", "Panel terminal"], ["where", "Sheet-col"]]),
          )}>Download CSV</button
      >
    {/if}
  </div>
  <p class="hint">
    {#if tab === "markers"}
      Two markers on every wire: a panel wire's say the terminal it lands on (or its own number), a field core's say the terminal at the panel end and the device's tag at the field end. Press Renumber first.
    {:else if tab === "bom"}
      Counted from the GA sheets: devices by the device picked from the device table (or their generic size), terminals each, label plates, and DIN rail and trunking by length.
    {:else}
      Generated from the drawing. Press Renumber first so terminals and wires have their numbers.
    {/if}
  </p>
  {#if tab === "terminals"}
    <table>
      <thead><tr><th>Strip</th><th>Terminal</th><th>Sheet-col</th><th>Wire</th><th>Internal</th><th>External</th></tr></thead>
      <tbody>
        {#each terms as r, i (i)}
          <tr><td>{r.strip}</td><td>{r.terminal}</td><td>{r.where}</td><td>{r.wire}</td><td>{r.internal}</td><td>{r.external}</td></tr>
        {/each}
      </tbody>
    </table>
  {:else if tab === "markers"}
    <table>
      {#if grouped}
        <thead><tr><th>Marker</th><th>Count</th><th>What</th></tr></thead>
        <tbody>
          {#each groups as g, i (i)}<tr><td>{g.text}</td><td>{g.count}</td><td>{g.what}</td></tr>{/each}
        </tbody>
      {:else}
        <thead><tr><th>Marker</th><th>What</th><th>Wire</th><th>Sheet-col</th></tr></thead>
        <tbody>
          {#each markers as r, i (i)}<tr><td>{r.text}</td><td>{r.what}</td><td>{r.wire}</td><td>{r.where}</td></tr>{/each}
        </tbody>
      {/if}
    </table>
  {:else if tab === "io"}
    <table>
      <thead><tr>{#each IO_COLS as [, h] (h)}<th>{h}</th>{/each}</tr></thead>
      <tbody>
        {#each io as r, i (i)}
          <tr>{#each IO_COLS as [k] (k)}<td>{r[k]}</td>{/each}</tr>
        {:else}
          <tr><td colspan="7" class="hint">No controllers yet (Controllers… in Draft).</td></tr>
        {/each}
      </tbody>
    </table>
  {:else if tab === "plant"}
    <table>
      <thead><tr>{#each PLANT_COLS as [, h] (h)}<th>{h}</th>{/each}</tr></thead>
      <tbody>
        {#each plantPts as r, i (i)}
          <tr>{#each PLANT_COLS as [k] (k)}<td>{r[k]}</td>{/each}</tr>
        {:else}
          <tr><td colspan="6" class="hint">No plant with points yet.</td></tr>
        {/each}
      </tbody>
    </table>
  {:else if tab === "bom"}
    <table>
      <thead><tr><th>GA sheet</th><th>Item</th><th>Maker</th><th>Part number</th><th>Qty</th><th>Unit</th><th>Tags</th></tr></thead>
      <tbody>
        {#each bom as r, i (i)}
          <tr><td>{r.sheet}</td><td>{r.item}</td><td>{r.maker}</td><td>{r.part}</td><td>{r.quantity}</td><td>{r.unit}</td><td>{r.tags}</td></tr>
        {:else}
          <tr><td colspan="7" class="hint">No GA sheets laid out yet.</td></tr>
        {/each}
      </tbody>
    </table>
  {:else}
    <table>
      <thead><tr><th>Plant</th><th>Description</th><th>Plant terminal</th><th>Wire</th><th>Panel terminal</th><th>Sheet-col</th></tr></thead>
      <tbody>
        {#each cables as r, i (i)}
          <tr><td>{r.plant}</td><td>{r.description}</td><td>{r.plantTerminal}</td><td>{r.wire}</td><td>{r.panelTerminal}</td><td>{r.where}</td></tr>
        {/each}
      </tbody>
    </table>
    <!-- How many cores each field device needs (v0.4.x T18). -->
    <div class="tabs second">
      <h3>Cores per device</h3>
      <span class="grow"></span>
      <button onclick={() => download(`${base} cores per device.csv`, toCsv(cores, [["plant", "Plant"], ["description", "Description"], ["cores", "Cores"], ["terminals", "Terminals"]]))}>Download CSV</button>
    </div>
    <table>
      <thead><tr><th>Plant</th><th>Description</th><th>Cores</th><th>Terminals</th></tr></thead>
      <tbody>
        {#each cores as r, i (i)}
          <tr><td>{r.plant}</td><td>{r.description}</td><td>{r.cores}</td><td>{r.terminals}</td></tr>
        {/each}
      </tbody>
    </table>
  {/if}
</Modal>

<style>
  .tabs {
    display: flex;
    gap: 6px;
    margin-bottom: 6px;
  }
  .grow {
    flex: 1;
  }
  .second {
    margin-top: 14px;
    align-items: center;
  }
  .second h3 {
    margin: 0;
    font-size: 14px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  th {
    text-align: left;
    font-weight: normal;
    color: #445;
    border-bottom: 1px solid #ccd;
  }
  td {
    border-bottom: 1px solid #eef0f2;
    padding: 2px 4px 2px 0;
  }
  .hint {
    font-size: 12px;
    color: #667;
    margin: 0 0 8px;
  }
</style>
