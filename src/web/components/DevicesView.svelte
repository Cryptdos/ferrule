<script lang="ts">
  /**
   * Design's Devices view (v0.5 A70, design-design-workbench.md §8): every
   * drawn part, terminal strip, module and plant item, each with the real
   * device it is. A device is picked in a row's drop-down, or for the ticked
   * rows at once with *Set picked to…*; a row picked shows its device in
   * Properties, which is where a device is edited.
   */
  import { DEVICE_GROUPS, deviceRows, deviceSuits, type DeviceGroup, type DeviceRow } from "../../core/devicerows";
  import { setDevices } from "../../core/ops";
  import type { Editor } from "../editor.svelte";
  import DeviceProps from "./DeviceProps.svelte";

  let { editor }: { editor: Editor } = $props();

  const rows = $derived(deviceRows(editor.project));
  const devices = $derived([...(editor.project.devices ?? [])].sort((a, b) => a.name.localeCompare(b.name)));
  const left = $derived(rows.filter((r) => !r.device).length);
  const groups = $derived(DEVICE_GROUPS.map((g) => ({ ...g, rows: rows.filter((r) => r.group === g.key) })).filter((g) => g.rows.length));
  /** Devices no row has: reached here, to edit or delete. */
  const unused = $derived(devices.filter((d) => !rows.some((r) => r.device?.id === d.id)));

  /** Folded groups, by key. Not saved. */
  let folded: string[] = $state([]);
  const fold = (k: string) => (folded = folded.includes(k) ? folded.filter((x) => x !== k) : [...folded, k]);

  const ticked = (k: string) => editor.deviceTicks.includes(k);
  function tick(k: string, on: boolean) {
    editor.deviceTicks = on ? [...new Set([...editor.deviceTicks, k])] : editor.deviceTicks.filter((x) => x !== k);
  }
  function tickGroup(g: DeviceGroup, on: boolean) {
    const keys = rows.filter((r) => r.group === g).map((r) => r.key);
    editor.deviceTicks = on ? [...new Set([...editor.deviceTicks, ...keys])] : editor.deviceTicks.filter((x) => !keys.includes(x));
  }
  // Ticks for rows that have gone (a part deleted) drop off.
  $effect(() => {
    const keys = new Set(rows.map((r) => r.key));
    if (editor.deviceTicks.some((k) => !keys.has(k))) editor.deviceTicks = editor.deviceTicks.filter((k) => keys.has(k));
  });

  function pickRow(r: DeviceRow) {
    editor.designPick = { plant: [], row: r.key };
  }
  function setOne(r: DeviceRow, value: string) {
    editor.apply((p) => setDevices(p, [r.key], value || null));
    editor.designPick = { plant: [], row: r.key };
  }
  /** The devices offered in a row: those that suit it, and the one it has. */
  const offered = (r: DeviceRow) => devices.filter((d) => deviceSuits(d, r) || d.id === r.device?.id);
</script>

<div class="dview">
  <div class="panel main">
    <div class="head">
      <span class="title">Needs a device</span>
      <span class="hint">{left} left of {rows.length}</span>
    </div>
    <div class="scroll">
      {#if !rows.length}
        <p class="hint pad">Nothing yet. Parts show here once they're drawn in Draft; modules and plant once they're made in Design.</p>
      {/if}
      {#each groups as g (g.key)}
        {@const all = g.rows.every((r) => ticked(r.key))}
        {@const some = g.rows.some((r) => ticked(r.key))}
        {@const gleft = g.rows.filter((r) => !r.device).length}
        <div class="ghead">
          <button class="fold" onclick={() => fold(g.key)} title={folded.includes(g.key) ? "Show its rows" : "Fold it away"}>{folded.includes(g.key) ? "▸" : "▾"}</button>
          <input type="checkbox" checked={all} indeterminate={some && !all} onchange={(e) => tickGroup(g.key, e.currentTarget.checked)} title="Tick every row in the group" />
          <button class="gname" onclick={() => fold(g.key)}>{g.label} ({g.rows.length})</button>
          {#if gleft}<span class="left">{gleft} left</span>{/if}
        </div>
        {#if !folded.includes(g.key)}
          {#each g.rows as r (r.key)}
            <div class="row" class:picked={editor.designPick.row === r.key} class:ticked={ticked(r.key)} role="button" tabindex="-1" onclick={() => pickRow(r)} onkeydown={() => {}}>
              <input type="checkbox" checked={ticked(r.key)} onclick={(e) => e.stopPropagation()} onchange={(e) => tick(r.key, e.currentTarget.checked)} />
              <span class="tag">{r.tag}</span>
              <span class="what">{r.what}</span>
              <select class:none={!r.device} value={r.device?.id ?? ""} onclick={(e) => e.stopPropagation()} onchange={(e) => setOne(r, e.currentTarget.value)}>
                <option value="">● none yet</option>
                {#each offered(r) as d (d.id)}<option value={d.id}>{d.name}</option>{/each}
              </select>
            </div>
          {/each}
        {/if}
      {/each}
      {#if unused.length}
        <div class="ghead">
          <button class="fold" onclick={() => fold("unused")}>{folded.includes("unused") ? "▸" : "▾"}</button>
          <span></span>
          <button class="gname" onclick={() => fold("unused")}>Devices not used yet ({unused.length})</button>
        </div>
        {#if !folded.includes("unused")}
          {#each unused as d (d.id)}
            <div class="row unused" class:picked={editor.designPick.device === d.id} role="button" tabindex="-1" onclick={() => (editor.designPick = { plant: [], device: d.id })} onkeydown={() => {}}>
              <span></span>
              <span class="tag">{d.name}</span>
              <span class="what">{[d.maker, d.part].filter(Boolean).join(" ")}</span>
              <span></span>
            </div>
          {/each}
        {/if}
      {/if}
    </div>
  </div>
  <div class="panel side">
    <div class="head"><span class="title">Properties</span></div>
    <div class="pbody"><DeviceProps {editor} {rows} /></div>
  </div>
</div>

<style>
  .dview {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px;
    gap: 10px;
    height: 100%;
    min-height: 0;
  }
  .panel {
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: #fff;
    border: 1px solid #dde1e5;
    border-radius: 6px;
    overflow: hidden;
  }
  .head {
    display: flex;
    justify-content: space-between;
    gap: 10px;
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
  .hint {
    font-size: 12px;
    color: #778;
  }
  .pad {
    padding: 10px 12px;
    margin: 0;
  }
  .scroll {
    overflow: auto;
    flex: 1;
  }
  .pbody {
    overflow: auto;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .ghead {
    display: grid;
    grid-template-columns: 18px 22px auto 1fr;
    align-items: center;
    gap: 4px;
    padding: 5px 12px;
    background: #f1f3f6;
    border-bottom: 1px solid #e6e9ec;
    font-size: 13px;
  }
  .fold,
  .gname {
    border: none;
    background: none;
    padding: 0;
    cursor: pointer;
    text-align: left;
    font: inherit;
  }
  .gname {
    font-weight: 600;
  }
  .left {
    justify-self: end;
    color: #b33;
    font-size: 12px;
  }
  .row {
    display: grid;
    grid-template-columns: 22px minmax(7em, 12em) minmax(0, 1fr) minmax(12em, 18em);
    align-items: center;
    gap: 8px;
    padding: 4px 12px 4px 34px;
    border-bottom: 1px solid #f0f1f3;
    font-size: 13px;
    cursor: pointer;
  }
  .row.ticked {
    background: #f3f7fe;
  }
  .row.picked {
    background: #e2ecfc;
  }
  .tag {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .what {
    color: #556;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  select.none {
    color: #b33;
  }
</style>
