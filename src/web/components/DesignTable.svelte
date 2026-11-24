<script lang="ts">
  /**
   * Design's table (design-v0.4 §2): system → plant → point, one row per
   * point, systems folding. Picking a row shows it in Properties; Ctrl or
   * Shift adds plant to what's picked.
   */
  import { goesTo, pointType, systemGroups } from "../../core/design";
  import { POINT_FORMS, type PlantItem } from "../../core/model";
  import { plantLabel } from "../../core/ops";
  import type { Editor } from "../editor.svelte";
  import TypeBadge from "./TypeBadge.svelte";
  import ChannelSelect from "./ChannelSelect.svelte";

  let { editor }: { editor: Editor } = $props();

  const groups = $derived(systemGroups(editor.project));
  const onlyUnnamed = $derived(groups.length === 1 && !groups[0]!.name);
  const formLabel = (f: string) => POINT_FORMS.find((x) => x.value === f)?.label.toLowerCase() ?? f;
  const by = (p: PlantItem) => (p.connects === "comms" ? "comms" : p.connects === "both" ? "both" : "wired");
  const folded = (name: string) => editor.designFolded.includes(name);

  function fold(name: string) {
    editor.designFolded = folded(name) ? editor.designFolded.filter((n) => n !== name) : [...editor.designFolded, name];
  }

  function pickPlant(e: MouseEvent, id: string, point?: string) {
    const cur = editor.designPick;
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      const has = cur.plant.includes(id);
      editor.designPick = { plant: has ? cur.plant.filter((x) => x !== id) : [...cur.plant, id] };
    } else {
      editor.designPick = { plant: [id], ...(point ? { point } : {}) };
    }
  }

  /** A folded system's one line: how many, and how they connect when that's shared. */
  function summary(plant: PlantItem[]): string {
    const n = plant.length;
    const points = plant.reduce((a, p) => a + (p.points?.length ?? 0), 0);
    const parts = [`${n} plant`, `${points} point${points === 1 ? "" : "s"}`];
    if (n && plant.every((p) => p.connects === "comms")) {
      parts.push("comms");
      const protos = [...new Set(plant.map((p) => p.protocol).filter(Boolean))];
      if (protos.length === 1) parts.push(protos[0]!);
      const nets = [...new Set(plant.map((p) => editor.project.networks?.find((x) => x.id === p.network)?.name).filter(Boolean))];
      if (nets.length) parts.push(nets.join(", "));
    }
    return parts.join(" · ");
  }
</script>

<div class="dtable">
  <div class="head">
    <span class="title">Plant and points</span>
    <span class="hint">this panel only</span>
  </div>
  <div class="scroll">
    <table>
      <thead>
        <tr><th>Tag</th><th>Description</th><th>By</th><th>Point</th><th>Form</th><th>Signal</th><th>Type</th><th>Channel</th></tr>
      </thead>
      <tbody>
        {#each groups as g (g.panel ? "\u0000panel" : g.name)}
          {@const gk = g.panel ? "\u0000panel" : g.name}
          {#if !onlyUnnamed}
            <tr class="system" class:picked={editor.designPick.system === g.name && !!g.name && !g.panel}>
              <td colspan="8">
                <button class="fold" onclick={() => fold(gk)} title={folded(gk) ? "Unfold" : "Fold"} aria-label={folded(gk) ? "Unfold" : "Fold"}>{folded(gk) ? "▸" : "▾"}</button>
                {#if g.panel}
                  <span class="sysname" title="Plant marked In the panel: power supplies, UPSs, batteries">Panel</span>
                {:else if g.name}
                  <button class="sysname" onclick={() => (editor.designPick = { plant: [], system: g.name })}>{g.name}</button>
                {:else}
                  <span class="sysname none">No system</span>
                {/if}
                {#if folded(gk)}<span class="sum">{summary(g.plant)}</span>{:else if !g.plant.length}<span class="sum">empty: + Plant adds a row here</span>{/if}
              </td>
            </tr>
          {/if}
          {#if !folded(gk)}
            {#each g.plant as p (p.id)}
              {@const pts = p.points ?? []}
              {@const picked = editor.designPick.plant.includes(p.id)}
              {#each pts.length ? pts : [null] as pt, i (pt?.name ?? "-")}
                {@const t = pt ? pointType(pt.form) : undefined}
                <tr
                  class="row"
                  class:picked={picked && (!editor.designPick.point || editor.designPick.point === pt?.name || editor.designPick.plant.length > 1)}
                  class:first={i === 0}
                  onclick={(e) => pickPlant(e, p.id, pt?.name)}
                >
                  <td class="tag">{i === 0 ? plantLabel(p) : ""}</td>
                  <td>{i === 0 ? p.description : ""}</td>
                  <td class="dim">{i === 0 ? by(p) : ""}</td>
                  <td>{pt?.name ?? ""}{#if pt && !pt.pins.length}<span class="nopins" title="No pins yet: they come when the plant is specified or drawn">○</span>{/if}</td>
                  <td class="dim">{pt ? formLabel(pt.form) : ""}</td>
                  <td class="dim">{pt?.signal ?? ""}</td>
                  <td>{#if t}<TypeBadge type={t} />{/if}</td>
                  <td>
                    {#if pt && t}
                      {#if goesTo(pt) === "panel"}<span class="dim">panel only</span>
                      {:else}<ChannelSelect {editor} plant={p} point={pt} compact />{#if goesTo(pt) === "relay"}<span class="dim"> via relay</span>{/if}{/if}
                    {/if}
                  </td>
                </tr>
              {/each}
            {/each}
          {/if}
        {/each}
      </tbody>
    </table>
    {#if !editor.project.plant.some((p) => !p.module)}
      <p class="empty">No plant yet. <strong>+ System</strong> groups plant ("Chilled water"); <strong>+ Plant</strong> adds a row; <strong>+ Point</strong> gives the picked plant a point.</p>
    {/if}
  </div>
</div>

<style>
  .dtable {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
    background: #fff;
    border: 1px solid #dde1e5;
    border-radius: 6px;
  }
  .head {
    display: flex;
    justify-content: space-between;
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
    color: #889;
  }
  .scroll {
    overflow: auto;
    flex: 1;
    min-height: 0;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 13px;
  }
  th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: #fff;
    text-align: left;
    font-weight: normal;
    color: #556;
    border-bottom: 1px solid #ccd;
    padding: 5px 8px;
  }
  td {
    padding: 4px 8px;
    border-bottom: 1px solid #f0f1f3;
    white-space: nowrap;
  }
  tr.row {
    cursor: default;
  }
  tr.row:hover {
    background: #f6f8fb;
  }
  tr.row.picked {
    background: #e8f0fd;
  }
  tr.system td {
    background: #f1f3f6;
    font-weight: 600;
    padding: 3px 6px;
  }
  tr.system.picked td {
    background: #dde8fb;
  }
  .fold,
  .sysname {
    border: none;
    background: none;
    padding: 2px 4px;
    font: inherit;
    font-weight: 600;
  }
  .sysname.none {
    color: #667;
    font-style: italic;
  }
  .sum {
    font-weight: normal;
    color: #778;
    margin-left: 8px;
  }
  .tag {
    font-weight: 600;
  }
  .dim {
    color: #667;
  }
  .nopins {
    color: #99a;
    margin-left: 4px;
    font-size: 11px;
  }
  .empty {
    padding: 16px;
    color: #667;
  }
</style>
