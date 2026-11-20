<script lang="ts">
  import { columnOf } from "../../core/geometry";
  import { resolveFields } from "../../core/fields";
  import { listSymbols, requireSymbol } from "../../core/symbols";
  import { displayTag } from "../../core/tags";
  import { masterOf } from "../../core/xref";
  import { replaceInElements, setTagLocks, updateElementAnywhere } from "../../core/ops";
  import type { Editor } from "../editor.svelte";

  /** Every element in the project as a row (DESIGN.md §11). */
  let { editor, onclose }: { editor: Editor; onclose: () => void } = $props();

  let type = $state("");
  let plant = $state("");
  let text = $state("");
  let checked: Set<string> = $state(new Set());
  let find = $state("");
  let replace = $state("");
  let inTags = $state(true);
  let inLabels = $state(false);

  const rows = $derived.by(() => {
    const out = [];
    for (const page of editor.project.pages) {
      for (const el of page.elements) {
        if (el.symbol === "junction") continue;
        const linked = masterOf(editor.project, el);
        out.push({
          el,
          page,
          tag: displayTag(el, editor.project),
          type: requireSymbol(el.symbol).name,
          label: el.label,
          shown: resolveFields(el.label, editor.project),
          linked: !!linked,
          plantId: el.symbol === "plant-view" ? String(el.params.plant) : (el.label.match(/\{plant:([^.}]+)\./)?.[1] ?? ""),
        });
      }
    }
    return out;
  });

  const filtered = $derived.by(() => {
    const t = text.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!type || r.el.symbol === type) &&
        (!plant || r.plantId === plant || r.shown.includes(editor.project.plant.find((p) => p.id === plant)?.tag ?? "\u0000")) &&
        (!t || `${r.tag} ${r.type} ${r.shown}`.toLowerCase().includes(t)),
    );
  });

  const allChecked = $derived(filtered.length > 0 && filtered.every((r) => checked.has(r.el.id)));
  const ids = $derived(filtered.filter((r) => checked.has(r.el.id)).map((r) => r.el.id));

  function toggleAll() {
    const next = new Set(checked);
    for (const r of filtered) {
      if (allChecked) next.delete(r.el.id);
      else next.add(r.el.id);
    }
    checked = next;
  }
  function toggle(id: string) {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    checked = next;
  }

  function doReplace() {
    let n = 0;
    const list = ids;
    if (editor.apply((p) => (n = replaceInElements(p, list, find, replace, { tag: inTags, label: inLabels })))) {
      editor.flash(`Changed ${n} of ${list.length}`);
    }
  }
</script>

<div class="table-view">
  <div class="bar">
    <strong>All elements</strong>
    <select bind:value={type}>
      <option value="">All types</option>
      {#each listSymbols().filter((s) => s.id !== "junction") as s (s.id)}
        <option value={s.id}>{s.name}</option>
      {/each}
    </select>
    {#if editor.project.plant.length}
      <select bind:value={plant}>
        <option value="">All plant</option>
        {#each editor.project.plant as p (p.id)}<option value={p.id}>{p.tag}</option>{/each}
      </select>
    {/if}
    <input bind:value={text} placeholder="Search tag, type or label" />
    <span class="count">{filtered.length} rows</span>
    <span class="grow"></span>
    <button onclick={onclose}>Back to drawing</button>
  </div>
  <div class="bulk">
    <span>{ids.length} ticked:</span>
    <input bind:value={find} placeholder="Find" />
    <input bind:value={replace} placeholder="Replace with" />
    <label><input type="checkbox" bind:checked={inTags} /> tags</label>
    <label><input type="checkbox" bind:checked={inLabels} /> labels</label>
    <button disabled={!ids.length || !find || (!inTags && !inLabels)} onclick={doReplace}>Replace</button>
    <span class="sep"></span>
    <button disabled={!ids.length} onclick={() => { const l = ids; editor.apply((p) => setTagLocks(p, l, true)); }}>Lock tags</button>
    <button disabled={!ids.length} onclick={() => { const l = ids; editor.apply((p) => setTagLocks(p, l, false)); }}>Unlock</button>
  </div>
  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th><input type="checkbox" checked={allChecked} onchange={toggleAll} /></th>
          <th>Sheet</th><th>Col</th><th>Tag</th><th>Type</th><th>Label</th><th>Lock</th><th></th>
        </tr>
      </thead>
      <tbody>
        {#each filtered as r (r.el.id)}
          <tr>
            <td><input type="checkbox" checked={checked.has(r.el.id)} onchange={() => toggle(r.el.id)} /></td>
            <td>{r.page.number}</td>
            <td>{columnOf(r.el.pos[0])}</td>
            <td>
              {#if r.linked || r.el.symbol === "plant-view" || !requireSymbol(r.el.symbol).kind(r.el)}
                <span class="ro" title={r.linked ? "Takes its coil's tag" : ""}>{r.tag}</span>
              {:else}
                <input
                  class="tag"
                  value={r.el.tag}
                  placeholder={r.tag}
                  onchange={(e) => {
                    const v = e.currentTarget.value;
                    editor.apply((p) => updateElementAnywhere(p, r.el.id, { tag: v }));
                  }}
                />
              {/if}
            </td>
            <td>{r.type}</td>
            <td>
              <input
                value={r.label}
                onchange={(e) => {
                  const v = e.currentTarget.value;
                  editor.apply((p) => updateElementAnywhere(p, r.el.id, { label: v }));
                }}
              />
            </td>
            <td>{r.el.params.locked === true ? "🔒" : ""}</td>
            <td>
              <button
                onclick={() => {
                  editor.goTo(r.el.id);
                  onclose();
                }}>Show</button
              >
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .table-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #fff;
  }
  .bar,
  .bulk {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-bottom: 1px solid #e1e4e8;
    font-size: 13px;
  }
  .bulk {
    background: #f8f9fa;
  }
  .bulk label {
    display: flex;
    align-items: center;
    gap: 3px;
  }
  .grow {
    flex: 1;
  }
  .sep {
    width: 1px;
    height: 18px;
    background: #ccd;
  }
  .count {
    color: #667;
  }
  .scroll {
    overflow: auto;
    flex: 1;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 13px;
  }
  th {
    position: sticky;
    top: 0;
    background: #fff;
    text-align: left;
    font-weight: normal;
    color: #445;
    border-bottom: 1px solid #ccd;
    padding: 4px;
  }
  td {
    border-bottom: 1px solid #eef0f2;
    padding: 1px 4px;
  }
  td input:not([type="checkbox"]) {
    width: 100%;
    padding: 2px 4px;
  }
  input.tag {
    width: 9em;
  }
  .ro {
    color: #556;
  }
</style>
