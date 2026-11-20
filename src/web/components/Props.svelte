<script lang="ts">
  import { columnOf } from "../../core/geometry";
  import {
    deleteElements,
    deleteSegments,
    linkContact,
    linkOffpage,
    renamePage,
    resetRoute,
    rotateElements,
    setConductorNumber,
    updateElement,
    type ElementPatch,
  } from "../../core/ops";
  import { address, contactMarks, contactType, isMaster, isSlave, masterOf, partnerOf, slavesOf } from "../../core/xref";
  import { requireSymbol } from "../../core/symbols";
  import { displayTag, tagPrefix } from "../../core/tags";
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

  /** Every coil in the project, for the contact link dropdown. */
  const coils = $derived(
    editor.project.pages.flatMap((pg) =>
      pg.elements.filter(isMaster).map((el) => ({ el, label: `${displayTag(el, editor.project)}  (sheet ${pg.number}, col ${columnOf(el.pos[0])})${el.label ? " " + el.label : ""}` })),
    ),
  );
  const arrows = $derived(
    editor.project.pages.flatMap((pg) =>
      pg.elements
        .filter((e) => e.symbol === "offpage" && e.id !== one?.id)
        .map((el) => ({ el, label: `${address(pg, el.pos)}${el.label ? " " + el.label : ""}` })),
    ),
  );
</script>

<div class="props">
  {#if one && def}
    <h3>{def.name}</h3>
    <div class="pos">Sheet {page.number} · column {columnOf(one.pos[0])} · ({one.pos[0]}, {one.pos[1]})</div>
    {@const master = masterOf(editor.project, one)}
    {#if isSlave(one)}
      <label>
        Driven by coil
        <select
          value={master?.el.id ?? ""}
          onchange={(e) => {
            const v = e.currentTarget.value || null;
            const id = one.id;
            editor.apply((p) => linkContact(p, id, v));
          }}
        >
          <option value="">Not linked</option>
          {#each coils as c (c.el.id)}
            <option value={c.el.id}>{c.label}</option>
          {/each}
        </select>
      </label>
      {#if master}
        <button class="link-btn" onclick={() => editor.goTo(master.el.id)}>Go to coil {displayTag(master.el, editor.project)} →</button>
      {/if}
    {/if}
    {#if def.kind(one) && !master}
      <label>
        Tag
        <input
          value={one.tag}
          placeholder={one.symbol === "terminal" ? "numbered by Renumber" : `${tagPrefix(one, editor.project)}? (numbered by Renumber)`}
          onchange={(e) => patch({ tag: e.currentTarget.value })}
        />
      </label>
      <label class="check">
        <input type="checkbox" checked={one.params.locked === true} onchange={(e) => setParam("locked", e.currentTarget.checked)} />
        Lock tag (Renumber keeps it)
      </label>
    {/if}
    {#if isMaster(one)}
      {@const slaves = slavesOf(editor.project, one)}
      <div class="sub">Contacts ({slaves.length})</div>
      {#if slaves.length === 0}
        <p class="hint">None yet. Select a contact and pick this coil under “Driven by coil”.</p>
      {/if}
      {#each slaves as s (s.el.id)}
        <button class="link-btn" onclick={() => editor.goTo(s.el.id)}>
          {contactType(s.el)} {contactMarks(s.el)} at {address(s.page, s.el.pos)} →
        </button>
      {/each}
    {/if}
    {#if one.symbol === "offpage"}
      {@const partner = partnerOf(editor.project, one)}
      <label>
        Continues at
        <select
          value={partner?.el.id ?? ""}
          onchange={(e) => {
            const v = e.currentTarget.value || null;
            const id = one.id;
            editor.apply((p) => linkOffpage(p, id, v));
          }}
        >
          <option value="">Not linked</option>
          {#each arrows as a (a.el.id)}
            <option value={a.el.id}>{a.label}</option>
          {/each}
        </select>
      </label>
      {#if partner}
        <button class="link-btn" onclick={() => editor.goTo(partner.el.id)}>Go to {address(partner.page, partner.el.pos)} →</button>
      {/if}
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
    {#if cond}
      <label>
        Wire number
        <input
          value={cond.number}
          placeholder="set by Renumber"
          onchange={(e) => {
            const v = e.currentTarget.value;
            const id = cond.id;
            editor.apply((p) => setConductorNumber(p, id, v, true));
          }}
        />
      </label>
      <label class="check">
        <input
          type="checkbox"
          checked={cond.locked === true}
          onchange={(e) => {
            const locked = e.currentTarget.checked;
            const id = cond.id;
            const n = cond.number;
            editor.apply((p) => setConductorNumber(p, id, n, locked));
          }}
        />
        Lock number (Renumber keeps it)
      </label>
      <div class="row">Conductor joins {cond.terminals.length} terminals</div>
    {/if}
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
    <h3>Sheet {page.number} of {editor.project.pages.length}</h3>
    <label>
      Sheet title
      <input
        value={page.title}
        placeholder="e.g. Controls section: supplies"
        onchange={(e) => {
          const v = e.currentTarget.value;
          editor.apply((p) => renamePage(p, editor.pageId, v));
        }}
      />
    </label>
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
  .sub {
    font-size: 12px;
    font-weight: 600;
    color: #334;
    margin-top: 4px;
  }
  .link-btn {
    text-align: left;
    font-size: 12px;
    padding: 3px 8px;
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
