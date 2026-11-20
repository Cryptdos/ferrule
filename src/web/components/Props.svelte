<script lang="ts">
  import { columnOf } from "../../core/geometry";
  import { deleteElements, deleteSegments, resetRoute, rotateElements, updateElement, type ElementPatch } from "../../core/ops";
  import { requireSymbol } from "../../core/symbols";
  import { tagPrefix } from "../../core/tags";
  import type { ParamValue } from "../../core/model";
  import type { Editor } from "../editor.svelte";

  let { editor }: { editor: Editor } = $props();

  const page = $derived(editor.page);
  const sel = $derived(page.elements.filter((e) => editor.selection.includes(e.id)));
  const segs = $derived(page.segments.filter((s) => editor.selection.includes(s.id)));
  const describe = (ref: [string, string]) => {
    const el = page.elements.find((e) => e.id === ref[0]);
    if (!el) return "?";
    if (el.symbol === "junction") return "junction";
    const name = el.tag || requireSymbol(el.symbol).name;
    return `${name}:${ref[1]}`;
  };
  const one = $derived(sel.length === 1 ? sel[0]! : null);
  const def = $derived(one ? requireSymbol(one.symbol) : null);

  function patch(p: ElementPatch) {
    if (!one) return;
    const id = one.id;
    editor.apply((proj) => updateElement(proj, editor.pageId, id, p));
  }
  function setParam(key: string, value: ParamValue) {
    patch({ params: { [key]: value } });
  }
</script>

<div class="props">
  {#if one && def}
    <h3>{def.name}</h3>
    <div class="pos">Sheet {page.number} · column {columnOf(one.pos[0])} · ({one.pos[0]}, {one.pos[1]})</div>
    {#if def.kind(one)}
      <label>
        Tag
        <input
          value={one.tag}
          placeholder="{tagPrefix(one, editor.project)}? (numbered later)"
          onchange={(e) => patch({ tag: e.currentTarget.value })}
        />
      </label>
    {/if}
    {#if one.symbol !== "junction" && one.symbol !== "rail"}
      <label>
        Label
        <input value={one.label} onchange={(e) => patch({ label: e.currentTarget.value })} />
      </label>
    {/if}
    {#each def.params as p (p.key)}
      {@const v = one.params[p.key] ?? p.default}
      {#if p.type === "bool"}
        <label class="check">
          <input type="checkbox" checked={v === true} onchange={(e) => setParam(p.key, e.currentTarget.checked)} />
          {p.label}
        </label>
      {:else}
        <label>
          {p.label}
          {#if p.type === "select"}
            <select value={String(v)} onchange={(e) => setParam(p.key, e.currentTarget.value)}>
              {#each p.options ?? [] as o (o.value)}
                <option value={o.value}>{o.label}</option>
              {/each}
            </select>
          {:else if p.type === "number"}
            <input
              type="number"
              min={p.min}
              max={p.max}
              value={Number(v)}
              onchange={(e) => {
                const n = Number(e.currentTarget.value);
                if (Number.isFinite(n)) setParam(p.key, Math.min(p.max ?? n, Math.max(p.min ?? n, Math.round(n))));
              }}
            />
          {:else}
            <input value={String(v)} onchange={(e) => setParam(p.key, e.currentTarget.value)} />
          {/if}
        </label>
      {/if}
    {/each}
    <label>
      Zone
      <select value={one.zone} onchange={(e) => patch({ zone: e.currentTarget.value as "internal" | "external" })}>
        <option value="internal">Internal (in panel)</option>
        <option value="external">External (field)</option>
      </select>
    </label>
    <div class="row">
      <span>Rotation {one.rot}°</span>
    </div>
  {:else if segs.length === 1 && sel.length === 0}
    {@const seg = segs[0]!}
    {@const cond = editor.project.conductors.find((c) => c.id === seg.conductor)}
    <h3>Wire</h3>
    <div class="pos">{describe(seg.from)} → {describe(seg.to)}</div>
    <div class="row">Conductor: {cond?.number || "not numbered yet"} ({cond?.terminals.length ?? 0} terminals)</div>
    <div class="row">Route: {seg.route === "manual" ? "adjusted by hand" : "automatic"}</div>
    <p class="hint">Drag a leg of the wire to move it. The ends stay on their terminals.</p>
    <div class="buttons">
      <button
        disabled={seg.route !== "manual"}
        onclick={() => editor.apply((p) => resetRoute(p, editor.pageId, [seg.id]))}>Reset route</button
      >
      <button
        class="danger"
        onclick={() => {
          editor.apply((p) => deleteSegments(p, editor.pageId, [seg.id]));
          editor.selection = [];
        }}>Delete</button
      >
    </div>
  {:else if sel.length + segs.length > 1}
    <h3>{sel.length} elements, {segs.length} wires selected</h3>
    {#if segs.some((s) => s.route === "manual")}
      <div class="buttons">
        <button
          onclick={() => {
            const ids = segs.map((s) => s.id);
            editor.apply((p) => resetRoute(p, editor.pageId, ids));
          }}>Reset wire routes</button
        >
      </div>
    {/if}
  {:else}
    <h3>Sheet {page.number}</h3>
    <p class="hint">
      Pick a symbol on the left and click to place it. Drag to move, <kbd>R</kbd> to rotate, <kbd>Del</kbd> to delete,
      <kbd>Ctrl</kbd>+<kbd>D</kbd> to duplicate. Scroll to zoom, middle-drag or <kbd>Space</kbd>+drag to pan.
    </p>
    <p class="hint">
      <kbd>W</kbd> wire tool: click a terminal, then another. Click on a wire to tee into it. <kbd>Esc</kbd> cancels,
      <kbd>S</kbd> back to select.
    </p>
  {/if}
  {#if sel.length > 0}
    <div class="buttons">
      <button
        onclick={() => {
          const ids = sel.map((e) => e.id);
          editor.apply((p) => rotateElements(p, editor.pageId, ids));
        }}>Rotate (R)</button
      >
      <button
        class="danger"
        onclick={() => {
          const ids = sel.map((e) => e.id);
          const segIds = segs.map((s) => s.id);
          editor.apply((p) => {
            deleteSegments(p, editor.pageId, segIds);
            deleteElements(p, editor.pageId, ids);
          });
          editor.selection = [];
        }}>Delete</button
      >
    </div>
  {/if}
</div>

<style>
  .props {
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  h3 {
    margin: 0;
    font-size: 14px;
  }
  .pos {
    font-size: 12px;
    color: #667;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
    color: #445;
  }
  label.check {
    flex-direction: row;
    align-items: center;
    gap: 6px;
  }
  .row {
    font-size: 12px;
    color: #445;
  }
  .buttons {
    display: flex;
    gap: 6px;
    margin-top: 4px;
  }
  .hint {
    font-size: 12px;
    color: #556;
    line-height: 1.5;
    margin: 0;
  }
  kbd {
    font-size: 11px;
    border: 1px solid #ccd;
    border-radius: 3px;
    padding: 0 3px;
    background: #f6f7f8;
  }
</style>
