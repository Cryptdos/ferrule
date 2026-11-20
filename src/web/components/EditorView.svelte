<script lang="ts">
  import { deleteElements, deleteSections, deleteSegments, duplicateElements, moveElements, rotateElements } from "../../core/ops";
  import { renumber } from "../../core/renumber";
  import { isTyping } from "../typing";
  import type { Editor } from "../editor.svelte";
  import Canvas from "./Canvas.svelte";
  import Palette from "./Palette.svelte";
  import Props from "./Props.svelte";
  import PageList from "./PageList.svelte";
  import ProjectDialog from "./ProjectDialog.svelte";
  import PlantDialog from "./PlantDialog.svelte";
  import ChecksDialog from "./ChecksDialog.svelte";
  import SchedulesDialog from "./SchedulesDialog.svelte";

  let { editor, onclose }: { editor: Editor; onclose: () => void } = $props();

  let canvas: Canvas | undefined = $state();
  let showProject = $state(false);
  let dialog: "plant" | "checks" | "schedules" | null = $state(null);
  let exporting = $state(false);

  async function exportPdf() {
    exporting = true;
    try {
      await editor.saveNow();
      const res = await fetch(`/api/projects/${encodeURIComponent(editor.project.id)}/pdf`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? res.statusText);
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "drawing.pdf";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } catch (e) {
      editor.flash(`PDF export failed: ${(e as Error).message}`);
    } finally {
      exporting = false;
    }
  }

  function doRenumber() {
    let r = { tags: 0, terminals: 0, wires: 0 };
    if (editor.apply((p) => (r = renumber(p)))) {
      editor.flash(`Renumbered ${r.tags} tags, ${r.terminals} terminals, ${r.wires} wires. Undo puts them back.`);
    }
  }

  async function print() {
    await editor.saveNow();
    window.open(`/print/${encodeURIComponent(editor.project.id)}?autoprint=1`, "_blank");
  }

  const saveText = $derived(
    { saved: "Saved", pending: "Unsaved changes", saving: "Saving…", error: "Save failed" }[editor.saveState],
  );


  function onKey(e: KeyboardEvent) {
    if (isTyping(e.target) || showProject || dialog) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const ids = editor.selectedElements.map((el) => el.id);
    const segIds = editor.selectedSegments.map((s) => s.id);
    const secIds = editor.selectedSections.map((s) => s.id);
    const pageId = editor.pageId;
    if (ctrl && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) editor.redo();
      else editor.undo();
    } else if (ctrl && e.key.toLowerCase() === "y") {
      e.preventDefault();
      editor.redo();
    } else if (ctrl && e.key.toLowerCase() === "s") {
      e.preventDefault();
      void editor.saveNow();
    } else if (ctrl && e.key.toLowerCase() === "a") {
      e.preventDefault();
      editor.selection = [
        ...editor.page.elements.filter((el) => el.symbol !== "junction").map((el) => el.id),
        ...editor.page.segments.map((s) => s.id),
      ];
    } else if (ctrl && e.key.toLowerCase() === "d") {
      e.preventDefault();
      if (!ids.length) return;
      let copies: string[] = [];
      editor.apply((p) => {
        copies = duplicateElements(p, pageId, ids, [4, 0]);
      });
      editor.selection = copies;
    } else if (e.key === "Delete" || e.key === "Backspace") {
      if (!ids.length && !segIds.length && !secIds.length) return;
      e.preventDefault();
      editor.apply((p) => {
        deleteSections(p, pageId, secIds);
        deleteSegments(p, pageId, segIds);
        deleteElements(p, pageId, ids);
      });
      editor.selection = [];
    } else if (e.key === "r" || e.key === "R") {
      if (ids.length) editor.apply((p) => rotateElements(p, pageId, ids));
    } else if (e.key === "Escape") {
      if (canvas?.cancel()) return;
      editor.tool = "select";
      editor.placeSymbol = null;
      editor.selection = [];
    } else if (e.key === "w" || e.key === "W") {
      editor.tool = "wire";
      editor.placeSymbol = null;
    } else if (e.key === "b" || e.key === "B") {
      editor.tool = "section";
      editor.placeSymbol = null;
    } else if (e.key === "s" || e.key === "S") {
      editor.tool = "select";
      editor.placeSymbol = null;
    } else if (e.key.startsWith("Arrow") && ids.length) {
      e.preventDefault();
      const step = e.shiftKey ? 2 : 1;
      const d: [number, number] =
        e.key === "ArrowLeft" ? [-step, 0] : e.key === "ArrowRight" ? [step, 0] : e.key === "ArrowUp" ? [0, -step] : [0, step];
      editor.apply((p) => moveElements(p, pageId, ids, d));
    } else if (e.key === "PageDown" || e.key === "PageUp") {
      e.preventDefault();
      const pages = editor.project.pages;
      const i = editor.pageIndex + (e.key === "PageDown" ? 1 : -1);
      if (pages[i]) editor.setPage(pages[i].id);
    } else if (e.key === "f" || e.key === "F") {
      canvas?.fit();
    }
  }
</script>

<svelte:window
  onkeydown={onKey}
  onbeforeunload={(e) => {
    if (editor.hasUnsaved) {
      void editor.saveNow();
      e.preventDefault();
    }
  }}
/>

<div class="editor">
  <header>
    <button class="link" onclick={onclose} title="Back to projects">◂ Projects</button>
    <strong class="title">{editor.project.project.title}</strong>
    <div class="tools">
      <button class:active={editor.tool === "select"} onclick={() => ((editor.tool = "select"), (editor.placeSymbol = null))}>
        Select
      </button>
      <button class:active={editor.tool === "wire"} onclick={() => ((editor.tool = "wire"), (editor.placeSymbol = null))} title="Draw wires (W)">
        Wire
      </button>
      <button class:active={editor.tool === "section"} onclick={() => ((editor.tool = "section"), (editor.placeSymbol = null))} title="Draw a section box (B)">
        Section
      </button>
      <span class="sep"></span>
      <button disabled={!editor.canUndo} onclick={() => editor.undo()} title="Undo (Ctrl+Z)">Undo</button>
      <button disabled={!editor.canRedo} onclick={() => editor.redo()} title="Redo (Ctrl+Y)">Redo</button>
      <span class="sep"></span>
      <button onclick={() => canvas?.fit()} title="Fit sheet (F)">Fit</button>
      <span class="sep"></span>
      <button onclick={doRenumber} title="Recalculate tags, terminal and wire numbers (locked ones are kept)">Renumber</button>
      <button onclick={() => (dialog = "plant")} title="Field equipment: define plant and place views">Plant…</button>
      <button onclick={() => (dialog = "checks")} title="Check the drawing for problems">Check</button>
      <button onclick={() => (dialog = "schedules")} title="Terminal and cable schedules">Schedules</button>
      <button onclick={() => (showProject = true)} title="Project details and revisions (title block)">Project…</button>
      <button onclick={exportPdf} disabled={exporting} title="Download every sheet as an A4 PDF">
        {exporting ? "Exporting…" : "Export PDF"}
      </button>
      <button onclick={print} title="Open the print view and print from the browser">Print</button>
    </div>
    <span class="status" class:error={editor.saveState === "error"}>{saveText}</span>
  </header>
  <aside class="left">
    <PageList {editor} />
    <Palette {editor} />
  </aside>
  <main>
    <Canvas bind:this={canvas} {editor} />
    {#if editor.message}<div class="toast">{editor.message}</div>{/if}
  </main>
  <aside class="right">
    <Props {editor} />
  </aside>
</div>
{#if dialog === "plant"}
  <PlantDialog {editor} onclose={() => (dialog = null)} />
{:else if dialog === "checks"}
  <ChecksDialog {editor} onclose={() => (dialog = null)} />
{:else if dialog === "schedules"}
  <SchedulesDialog {editor} onclose={() => (dialog = null)} />
{/if}
{#if showProject}
  <ProjectDialog {editor} onclose={() => (showProject = false)} />
{/if}

<style>
  .editor {
    display: grid;
    grid-template-columns: 200px 1fr 250px;
    grid-template-rows: 40px 1fr;
    grid-template-areas: "head head head" "left main right";
    height: 100vh;
  }
  header {
    grid-area: head;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 10px;
    border-bottom: 1px solid #cfd4d8;
    background: #f4f5f6;
  }
  .title {
    font-size: 14px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 260px;
  }
  .tools {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .sep {
    width: 1px;
    height: 20px;
    background: #cfd4d8;
    margin: 0 4px;
  }
  .status {
    margin-left: auto;
    font-size: 12px;
    color: #667;
  }
  .status.error {
    color: #b00;
    font-weight: bold;
  }
  .left {
    grid-area: left;
    border-right: 1px solid #cfd4d8;
    overflow-y: auto;
    background: #fafafa;
  }
  .right {
    grid-area: right;
    border-left: 1px solid #cfd4d8;
    overflow-y: auto;
    background: #fafafa;
  }
  main {
    grid-area: main;
    position: relative;
    overflow: hidden;
  }
  .toast {
    position: absolute;
    bottom: 14px;
    left: 50%;
    transform: translateX(-50%);
    background: #223;
    color: #fff;
    padding: 6px 12px;
    border-radius: 4px;
    font-size: 13px;
  }
</style>
