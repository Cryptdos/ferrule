<script lang="ts">
  import { addPage, deletePage, duplicatePage, movePage } from "../../core/ops";
  import type { Editor } from "../editor.svelte";

  let { editor }: { editor: Editor } = $props();

  function add() {
    let id = "";
    editor.apply((p) => {
      id = addPage(p, "", editor.pageId).id;
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
</script>

<div class="pages">
  <div class="head">
    <span>Sheets</span>
    <div class="actions">
      <button title="Add a sheet after this one" onclick={add}>+</button>
      <button title="Duplicate this sheet" onclick={duplicate}>⧉</button>
      <button title="Move up" disabled={editor.pageIndex === 0} onclick={() => move(-1)}>↑</button>
      <button title="Move down" disabled={editor.pageIndex === editor.project.pages.length - 1} onclick={() => move(1)}>↓</button>
      <button title="Delete this sheet" disabled={editor.project.pages.length === 1} onclick={remove}>✕</button>
    </div>
  </div>
  <ol>
    {#each editor.project.pages as page (page.id)}
      <li>
        <button class="page" class:current={page.id === editor.pageId} onclick={() => editor.setPage(page.id)}>
          <span class="num">{page.number}</span>
          <span class="t">{page.title || "Untitled sheet"}</span>
        </button>
      </li>
    {/each}
  </ol>
</div>

<style>
  .pages {
    padding: 6px 8px;
    border-bottom: 1px solid #cfd4d8;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #667;
    margin-bottom: 4px;
  }
  .actions {
    display: flex;
    gap: 2px;
  }
  .actions button {
    padding: 0 5px;
    font-size: 12px;
    min-width: 22px;
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 40vh;
    overflow-y: auto;
  }
  .page {
    width: 100%;
    display: flex;
    gap: 6px;
    text-align: left;
    border: 1px solid transparent;
    background: none;
    padding: 3px 4px;
  }
  .page.current {
    background: #e8f0fd;
    border-color: #1e6ee6;
  }
  .num {
    min-width: 1.6em;
    color: #667;
    text-align: right;
  }
  .t {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
