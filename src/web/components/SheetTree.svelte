<script lang="ts">
  import { addPage, addSparePage, deletePage, duplicatePage, movePage } from "../../core/ops";
  import { columnOf } from "../../core/geometry";
  import { resolveFields } from "../../core/fields";
  import { benchOf, isBar, requireSymbol } from "../../core/symbols";
  import { displayTag, elementTexts } from "../../core/tags";
  import type { Page } from "../../core/model";
  import type { Editor } from "../editor.svelte";
  import Icon from "./Icon.svelte";

  /**
   * The sheets, each folding open to what's on it (for the workbench in use),
   * in column order. Clicking an item selects it on its sheet.
   */
  let { editor }: { editor: Editor } = $props();

  let open: Record<string, boolean> = $state({});
  let filter = $state("");
  let addMenu = $state(false);
  let list: HTMLDivElement | undefined = $state();

  type Row = { id: string; tag: string; text: string; col: number; y: number };

  function rowsOf(page: Page): Row[] {
    const p = editor.project;
    if (page.ga) {
      return (page.gaItems ?? [])
        .filter((i) => i.kind === "device")
        .map((i) => {
          const ref = i.refs?.[0];
          const el = ref ? p.pages.flatMap((pg) => pg.elements).find((e) => e.id === ref) : undefined;
          return {
            id: i.id,
            tag: el ? displayTag(el, p) : "",
            text: i.text || (el ? requireSymbol(el.symbol).name : "Device"),
            col: Math.round(i.x),
            y: i.y,
          };
        })
        .sort((a, b) => a.y - b.y || a.col - b.col);
    }
    const bench = editor.mode === "annotate" ? "annotate" : "draft";
    const out: Row[] = page.elements
      .filter((e) => e.symbol !== "junction" && benchOf(e) === bench)
      .map((e) => ({
        id: e.id,
        tag: displayTag(e, p),
        text:
          resolveFields(e.label, p) ||
          (isBar(e) ? (elementTexts(e, p).name ?? "") : "") ||
          requireSymbol(e.symbol).name,
        col: columnOf(e.pos[0]),
        y: e.pos[1],
      }));
    if (bench === "annotate") {
      for (const s of page.sections) {
        out.push({ id: s.id, tag: "", text: resolveFields(s.label, p) || "Section box", col: columnOf(s.rect[0]), y: s.rect[1] });
      }
    }
    return out.sort((a, b) => a.col - b.col || a.y - b.y);
  }

  const sheets = $derived.by(() => {
    const q = filter.trim().toLowerCase();
    return editor.project.pages
      .map((page) => {
        const title = resolveFields(page.title, editor.project) || "Untitled sheet";
        const all = open[page.id] || q ? rowsOf(page) : [];
        const rows = q ? all.filter((r) => `${r.tag} ${r.text}`.toLowerCase().includes(q)) : all;
        const titleHit = !q || `${page.number} ${title}`.toLowerCase().includes(q);
        return { page, title, rows, show: titleHit || rows.length > 0, expanded: !!open[page.id] || (!!q && rows.length > 0) };
      })
      .filter((s) => s.show);
  });

  const selected = $derived(new Set(editor.selection));

  // Keep a selected item in view when its sheet is open in the tree.
  $effect(() => {
    const first = editor.selection[0];
    if (!first || !list) return;
    list.querySelector(`[data-id="${first}"]`)?.scrollIntoView({ block: "nearest" });
  });

  function pick(e: MouseEvent, page: Page, id: string) {
    if (page.id !== editor.pageId) editor.setPage(page.id);
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      editor.selection = selected.has(id) ? editor.selection.filter((x) => x !== id) : [...editor.selection, id];
      return;
    }
    if (page.ga) {
      editor.selection = [id];
      return;
    }
    editor.goTo(id);
  }

  function add(spare = false) {
    addMenu = false;
    let id = "";
    editor.apply((p) => {
      id = (spare ? addSparePage(p, editor.pageId) : addPage(p, "", editor.pageId)).id;
    });
    if (id) editor.setPage(id);
  }
  function duplicate() {
    let id = "";
    editor.apply((p) => {
      id = duplicatePage(p, editor.pageId).id;
    });
    if (id) editor.setPage(id);
  }
  function remove() {
    const page = editor.page;
    const what = page.elements.length ? ` and the ${page.elements.length} items on it` : "";
    if (!confirm(`Delete sheet ${page.number}${page.title ? ` “${page.title}”` : ""}${what}? (Undo brings it back.)`)) return;
    const i = editor.pageIndex;
    if (editor.apply((p) => deletePage(p, page.id))) {
      editor.setPage(editor.project.pages[Math.min(i, editor.project.pages.length - 1)]!.id);
    }
  }
  function move(by: number) {
    const to = editor.pageIndex + by;
    if (to < 0 || to >= editor.project.pages.length) return;
    editor.apply((p) => movePage(p, editor.pageId, to));
  }
  function settings(page: Page) {
    editor.setPage(page.id);
    editor.selection = [];
    editor.sheetSettings = true;
  }
</script>

<div class="tree">
  <div class="actions">
    <div class="addwrap">
      <button class="icon" title="Add a sheet after this one" onclick={() => add()}><Icon name="plus" size={15} /></button>
      <button class="icon drop" title="More kinds of sheet" onclick={() => (addMenu = !addMenu)}>▾</button>
      {#if addMenu}
        <div class="menu" role="menu">
          <button role="menuitem" onclick={() => add()}>Sheet</button>
          <button role="menuitem" onclick={() => add(true)} title="For spacing and organisation: annotations only, no drafting">Spare sheet</button>
        </div>
      {/if}
    </div>
    <button class="icon" title="Duplicate this sheet" onclick={duplicate}><Icon name="duplicate" size={15} /></button>
    <button class="icon" title="Move this sheet up" disabled={editor.pageIndex === 0} onclick={() => move(-1)}><Icon name="up" size={15} /></button>
    <button class="icon" title="Move this sheet down" disabled={editor.pageIndex === editor.project.pages.length - 1} onclick={() => move(1)}
      ><Icon name="down" size={15} /></button
    >
    <button class="icon" title="Delete this sheet" disabled={editor.project.pages.length === 1} onclick={remove}><Icon name="trash" size={15} /></button>
    <input class="find" type="search" placeholder="Find…" bind:value={filter} title="Find sheets and what's on them" />
  </div>
  <div class="rows" bind:this={list}>
    {#each sheets as s (s.page.id)}
      <div class="sheet" class:current={s.page.id === editor.pageId}>
        <button
          class="twisty"
          title={s.expanded ? "Fold away" : "Show what's on it"}
          onclick={() => (open[s.page.id] = !open[s.page.id])}>{s.expanded ? "▾" : "▸"}</button
        >
        <button class="name" onclick={() => editor.setPage(s.page.id)} ondblclick={() => settings(s.page)}>
          <span class="num">{s.page.number}</span>
          <span class="t" class:spare={s.page.spare}>{s.title}</span>
          {#if s.page.spare}<span class="badge">spare</span>{:else if s.page.ga}<span class="badge">GA</span>{/if}
        </button>
        <button class="icon gear" title="Sheet settings" onclick={() => settings(s.page)}><Icon name="gear" size={13} /></button>
      </div>
      {#if s.expanded}
        {#each s.rows as r (r.id)}
          <button class="item" class:sel={selected.has(r.id)} data-id={r.id} onclick={(e) => pick(e, s.page, r.id)} title={s.page.ga ? "" : `Column ${r.col}`}>
            <span class="tag">{r.tag || "–"}</span>
            <span class="txt">{r.text}</span>
          </button>
        {:else}
          <div class="empty">Nothing here{editor.mode === "annotate" ? " to annotate" : ""}</div>
        {/each}
      {/if}
    {/each}
  </div>
</div>

<style>
  .tree {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 1px;
    padding: 2px 6px 4px;
  }
  .find {
    flex: 1;
    min-width: 0;
    margin-left: 4px;
    font-size: 12px;
    padding: 2px 6px;
  }
  button.icon {
    border: none;
    background: none;
    padding: 3px;
    color: #445;
    border-radius: 3px;
  }
  button.icon:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.07);
  }
  button.icon:disabled {
    opacity: 0.35;
  }
  .addwrap {
    position: relative;
    display: flex;
  }
  .drop {
    font-size: 10px;
    padding: 3px 2px !important;
  }
  .menu {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 5;
    background: #fff;
    border: 1px solid #c8ccd2;
    border-radius: 4px;
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
    min-width: 120px;
  }
  .menu button {
    border: none;
    background: none;
    text-align: left;
    padding: 5px 10px;
    font-size: 12px;
  }
  .menu button:hover {
    background: #e8f0fd;
  }
  .rows {
    overflow-y: auto;
    min-height: 0;
    padding: 0 4px 4px;
  }
  .sheet {
    display: flex;
    align-items: center;
    border: 1px solid transparent;
    border-radius: 3px;
  }
  .sheet.current {
    background: rgba(30, 110, 230, 0.1);
    border-color: rgba(30, 110, 230, 0.55);
  }
  .twisty {
    border: none;
    background: none;
    width: 16px;
    padding: 0;
    font-size: 10px;
    color: #667;
    flex: none;
  }
  .name {
    flex: 1;
    min-width: 0;
    display: flex;
    gap: 6px;
    align-items: center;
    border: none;
    background: none;
    padding: 3px 2px;
    text-align: left;
    font-size: 13px;
  }
  .num {
    min-width: 1.5em;
    color: #667;
    text-align: right;
  }
  .t {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .t.spare {
    color: #778;
    font-style: italic;
  }
  .badge {
    font-size: 10px;
    color: #667;
    border: 1px solid #c8ccd2;
    border-radius: 3px;
    padding: 0 3px;
    flex: none;
  }
  .gear {
    opacity: 0;
  }
  .sheet:hover .gear,
  .sheet.current .gear {
    opacity: 1;
  }
  .item {
    width: 100%;
    display: grid;
    grid-template-columns: 5em 1fr;
    gap: 6px;
    text-align: left;
    border: 1px solid transparent;
    background: none;
    padding: 1px 4px 1px 24px;
    font-size: 12px;
    border-radius: 3px;
  }
  .item:hover {
    background: rgba(0, 0, 0, 0.05);
  }
  .item.sel {
    background: rgba(30, 110, 230, 0.12);
    border-color: rgba(30, 110, 230, 0.6);
  }
  .tag {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .txt {
    color: #445;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .empty {
    font-size: 11px;
    color: #889;
    padding: 1px 0 3px 28px;
  }
</style>
