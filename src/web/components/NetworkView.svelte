<script lang="ts">
  /**
   * The Network view (design-v0.4 §7): drawn from the comms rows of the
   * table, as the network sheet prints it. Networks at the side: name,
   * protocol and kind, and each one's devices in order (the row order).
   */
  import { deleteNetwork, devicesOn, moveOnNetwork, networkData, networkDiagram, putOnNetwork, updateNetwork } from "../../core/network";
  import { plantLabel } from "../../core/ops";
  import type { Editor } from "../editor.svelte";
  import Prims from "./Prims.svelte";

  let { editor }: { editor: Editor } = $props();

  const diagram = $derived(networkDiagram(networkData(editor.project)));
  const nets = $derived(editor.project.networks ?? []);
  let picked = $state("");
  const net = $derived(nets.find((n) => n.id === picked) ?? nets[0]);
  const devices = $derived(net ? devicesOn(editor.project, net.id) : []);
  /** Field plant that could go on it: comms first, then the rest. */
  const candidates = $derived(
    editor.project.plant
      .filter((p) => !p.module && p.network !== net?.id)
      .sort((a, b) => Number(b.connects === "comms" || b.connects === "both") - Number(a.connects === "comms" || a.connects === "both")),
  );
</script>

<div class="nview">
  <div class="panel draw">
    <svg viewBox="-2 -2 {diagram.w + 4} {diagram.h + 4}" style:aspect-ratio="{diagram.w + 4} / {diagram.h + 4}">
      <Prims prims={diagram.prims} />
    </svg>
  </div>
  <div class="panel side">
    <div class="head"><span class="title">Networks</span></div>
    <div class="body">
      {#if nets.length}
        <table>
          <thead><tr><th>Network</th><th>Protocol</th><th>Kind</th><th class="n">Devices</th></tr></thead>
          <tbody>
            {#each nets as n (n.id)}
              <tr class:on={n.id === net?.id} onclick={() => (picked = n.id)}>
                <td><strong>{n.name}</strong></td><td>{n.protocol}</td><td>{n.kind === "lan" ? "LAN" : "bus"}</td><td class="n">{devicesOn(editor.project, n.id).length}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <p class="hint">No networks yet. <strong>+ Network</strong> adds one; then put comms plant on it, here or in the plant's Properties.</p>
      {/if}
      {#if net}
        <div class="sel">
          <label>Name <input value={net.name} onchange={(e) => editor.apply((p) => updateNetwork(p, net.id, { name: e.currentTarget.value }))} /></label>
          <div class="pair">
            <label>Protocol <input value={net.protocol} list="ferrule-net-protocols" onchange={(e) => editor.apply((p) => updateNetwork(p, net.id, { protocol: e.currentTarget.value }))} /></label>
            <label>Kind
              <select value={net.kind} onchange={(e) => editor.apply((p) => updateNetwork(p, net.id, { kind: e.currentTarget.value as "lan" | "bus" }))}>
                <option value="lan">LAN, off a switch</option>
                <option value="bus">Bus, off the controller</option>
              </select>
            </label>
          </div>
          <div class="sub">Devices, in order {#if net.kind === "bus"}<span class="hint">(along the bus)</span>{/if}</div>
          <ol>
            {#each devices as d, i (d.id)}
              <li>
                <span class="tag">{plantLabel(d)}</span><span class="desc">{d.description}</span>
                <button disabled={i === 0} title="Earlier" onclick={() => editor.apply((p) => moveOnNetwork(p, d.id, -1))}>↑</button>
                <button disabled={i === devices.length - 1} title="Later" onclick={() => editor.apply((p) => moveOnNetwork(p, d.id, 1))}>↓</button>
                <button class="x" title="Take it off this network" onclick={() => editor.apply((p) => putOnNetwork(p, [d.id], ""))}>×</button>
              </li>
            {/each}
          </ol>
          {#if candidates.length}
            <select value="" onchange={(e) => {
              const v = e.currentTarget.value;
              e.currentTarget.value = "";
              if (v) editor.apply((p) => putOnNetwork(p, [v], net.id));
            }}>
              <option value="">Put a device on it…</option>
              {#each candidates as c (c.id)}<option value={c.id}>{plantLabel(c)} {c.description}{c.connects ? "" : " (hardwired now)"}</option>{/each}
            </select>
          {/if}
          <p class="hint">Order is the row order in the table: moving a device here moves its row. Addresses aren't kept in v0.4.</p>
          <button class="danger" onclick={() => {
            if (confirm(`Delete ${net.name}? Its devices stay, on no network.`)) editor.apply((p) => deleteNetwork(p, net.id));
          }}>Delete network</button>
        </div>
      {/if}
    </div>
  </div>
  <datalist id="ferrule-net-protocols"><option value="BACnet IP"></option><option value="BACnet MS/TP"></option><option value="Modbus RTU"></option><option value="Modbus TCP"></option><option value="M-Bus"></option></datalist>
</div>

<style>
  .nview {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 360px;
    gap: 10px;
    height: 100%;
    min-height: 0;
  }
  .panel {
    min-height: 0;
    background: #fff;
    border: 1px solid #dde1e5;
    border-radius: 6px;
    overflow: auto;
  }
  .draw {
    background: #faf9f5;
    padding: 12px;
  }
  svg {
    width: 100%;
    max-width: 1400px;
    display: block;
  }
  .head {
    padding: 8px 12px;
    border-bottom: 1px solid #e3e6e9;
  }
  .title {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #334;
  }
  .body {
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 13px;
  }
  th {
    text-align: left;
    font-weight: normal;
    color: #556;
    border-bottom: 1px solid #ccd;
    padding: 3px 4px;
  }
  td {
    padding: 4px;
    border-bottom: 1px solid #f0f1f3;
    cursor: default;
  }
  tr.on td {
    background: #e8f0fd;
  }
  .n {
    text-align: right;
  }
  .sel {
    display: flex;
    flex-direction: column;
    gap: 6px;
    border-top: 1px solid #eef0f2;
    padding-top: 8px;
  }
  label {
    display: flex;
    flex-direction: column;
    font-size: 12px;
    color: #556;
    gap: 2px;
    flex: 1;
  }
  .pair {
    display: flex;
    gap: 6px;
  }
  .sub {
    font-size: 12px;
    color: #556;
  }
  ol {
    margin: 0;
    padding-left: 22px;
    font-size: 13px;
    max-height: 320px;
    overflow: auto;
  }
  li {
    display: flex;
    gap: 6px;
    align-items: center;
    padding: 1px 0;
  }
  .tag {
    font-weight: 600;
    min-width: 5em;
  }
  .desc {
    flex: 1;
    color: #667;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  li button {
    padding: 0 6px;
    font-size: 12px;
  }
  .x {
    border: none;
    background: none;
    color: #a00;
  }
  .hint {
    font-size: 12px;
    color: #778;
    margin: 0;
  }
</style>
