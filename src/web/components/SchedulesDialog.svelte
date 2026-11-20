<script lang="ts">
  import { cableSchedule, terminalSchedule, toCsv } from "../../core/schedules";
  import type { Editor } from "../editor.svelte";
  import Modal from "./Modal.svelte";

  let { editor, onclose }: { editor: Editor; onclose: () => void } = $props();

  let tab: "terminals" | "cables" = $state("terminals");
  const terms = $derived(terminalSchedule(editor.project));
  const cables = $derived(cableSchedule(editor.project));

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
    <span class="grow"></span>
    {#if tab === "terminals"}
      <button
        onclick={() =>
          download(
            `${base} terminals.csv`,
            toCsv(terms, [["strip", "Strip"], ["terminal", "Terminal"], ["where", "Sheet-col"], ["wire", "Wire"], ["internal", "Internal"], ["external", "External"]]),
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
  <p class="hint">Generated from the drawing. Press Renumber first so terminals and wires have their numbers.</p>
  {#if tab === "terminals"}
    <table>
      <thead><tr><th>Strip</th><th>Terminal</th><th>Sheet-col</th><th>Wire</th><th>Internal</th><th>External</th></tr></thead>
      <tbody>
        {#each terms as r, i (i)}
          <tr><td>{r.strip}</td><td>{r.terminal}</td><td>{r.where}</td><td>{r.wire}</td><td>{r.internal}</td><td>{r.external}</td></tr>
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
