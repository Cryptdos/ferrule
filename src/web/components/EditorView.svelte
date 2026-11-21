<script lang="ts">
  import {
    deleteClouds,
    deleteElements,
    deleteSections,
    deleteSegments,
    duplicateElements,
    moveElements,
    rotateElements,
  } from "../../core/ops";
  import { benchOf } from "../../core/symbols";
  import { api } from "../api";
  import FileBrowser from "./FileBrowser.svelte";
  import GaPanel from "./GaPanel.svelte";
  import GaProps from "./GaProps.svelte";
  import { deleteGaItems, moveGaItems, rotateGaItems } from "../../core/ops";
  import { isTyping } from "../typing";
  import type { Editor } from "../editor.svelte";
  import Canvas from "./Canvas.svelte";
  import Palette from "./Palette.svelte";
  import Props from "./Props.svelte";
  import PageList from "./PageList.svelte";
  import ProjectDialog from "./ProjectDialog.svelte";
  import PlantDialog from "./PlantDialog.svelte";
  import ChecksDialog from "./ChecksDialog.svelte";
  import RenumberDialog from "./RenumberDialog.svelte";
  import SchedulesDialog from "./SchedulesDialog.svelte";
  import ElementList from "./ElementList.svelte";
  import TableView from "./TableView.svelte";
  import SplitPane from "./SplitPane.svelte";
  import TemplatesDialog from "./TemplatesDialog.svelte";
  import SimPanel from "./SimPanel.svelte";
  import { Simulator } from "../sim.svelte";

  let { editor, onclose, onopen }: { editor: Editor; onclose: () => void; onopen?: (id: string) => void } = $props();
  let savingAs = $state(false);

  async function saveAs(path: string) {
    savingAs = false;
    await editor.saveNow();
    try {
      const { id } = await api.saveAs(editor.project.id, path);
      editor.flash(`Saved a copy as ${path}. Now editing the copy.`);
      onopen?.(id);
    } catch (e) {
      editor.flash((e as Error).message);
    }
  }

  let canvas: Canvas | undefined = $state();
  let showProject = $state(false);
  let dialog: "plant" | "checks" | "schedules" | "templates" | "renumber" | null = $state(null);
  let tableView = $state(false);
  let sim: Simulator | null = $state(null);

  function setMode(mode: "draft" | "annotate" | "ga" | "simulate") {
    if (mode === editor.mode) return;
    sim?.stop();
    sim = null;
    editor.mode = mode;
    // Each workbench has its own things to pick: start with nothing picked.
    editor.tool = "select";
    editor.placeSymbol = null;
    editor.gaPlace = null;
    editor.selection = [];
    if (mode === "simulate") {
      tableView = false;
      editor.tool = "select";
      editor.placeSymbol = null;
      editor.selection = [];
      sim = new Simulator($state.snapshot(editor.project) as typeof editor.project);
    }
  }
  $effect(() => () => sim?.stop());

  // A GA sheet is laid out in the GA workbench, a schematic sheet drafted:
  // moving between them takes you to the right one (Annotate and Simulate stay).
  $effect(() => {
    const isGa = !!editor.page.ga;
    if (isGa && editor.mode === "draft") setMode("ga");
  });

  function toggleSplit() {
    if (editor.splitPageId) {
      editor.splitPageId = null;
      return;
    }
    const pages = editor.project.pages;
    const next = pages[editor.pageIndex + 1] ?? pages[editor.pageIndex - 1] ?? pages[editor.pageIndex]!;
    editor.splitPageId = next.id;
  }
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
    // Show what would change first; nothing changes until it's applied.
    dialog = "renumber";
  }

  async function print() {
    await editor.saveNow();
    window.open(`/print/${encodeURIComponent(editor.project.id)}?autoprint=1`, "_blank");
  }

  const saveText = $derived(
    { saved: "Saved", pending: "Unsaved changes", saving: "Saving…", error: "Save failed" }[editor.saveState],
  );


  function onKey(e: KeyboardEvent) {
    if (isTyping(e.target) || showProject || dialog || tableView || savingAs) return;
    const ctrl = e.ctrlKey || e.metaKey;
    // GA: move, turn and delete layout items.
    if (editor.mode === "ga") {
      const gaIds = (editor.page.gaItems ?? []).filter((i) => editor.selection.includes(i.id)).map((i) => i.id);
      if (ctrl && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) editor.redo();
        else editor.undo();
      } else if (ctrl && e.key.toLowerCase() === "y") {
        e.preventDefault();
        editor.redo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && gaIds.length) {
        e.preventDefault();
        editor.apply((p) => deleteGaItems(p, editor.pageId, gaIds));
        editor.selection = [];
      } else if ((e.key === "r" || e.key === "R") && gaIds.length) {
        editor.apply((p) => rotateGaItems(p, editor.pageId, gaIds));
      } else if (e.key.startsWith("Arrow") && gaIds.length) {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 5;
        const d: [number, number] =
          e.key === "ArrowLeft" ? [-step, 0] : e.key === "ArrowRight" ? [step, 0] : e.key === "ArrowUp" ? [0, -step] : [0, step];
        editor.apply((p) => moveGaItems(p, editor.pageId, gaIds, d));
      } else if (e.key === "Escape") {
        editor.gaPlace = null;
        editor.tool = "select";
        editor.selection = [];
      } else if (e.key === "PageDown" || e.key === "PageUp") {
        e.preventDefault();
        const pages = editor.project.pages;
        const i = editor.pageIndex + (e.key === "PageDown" ? 1 : -1);
        if (pages[i]) editor.setPage(pages[i].id);
      } else if (e.key === "f" || e.key === "F") {
        canvas?.fit();
      }
      return;
    }
    // Simulating: only moving about (sheets, fit); nothing is edited.
    if (editor.mode === "simulate") {
      if (e.key === "PageDown" || e.key === "PageUp") {
        e.preventDefault();
        const pages = editor.project.pages;
        const i = editor.pageIndex + (e.key === "PageDown" ? 1 : -1);
        if (pages[i]) editor.setPage(pages[i].id);
      } else if (e.key === "f" || e.key === "F") {
        canvas?.fit();
      }
      return;
    }
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
      // Everything this workbench edits.
      const bench = editor.mode === "annotate" ? "annotate" : "draft";
      editor.selection = [
        ...editor.page.elements.filter((el) => el.symbol !== "junction" && benchOf(el) === bench).map((el) => el.id),
        ...(bench === "draft" ? editor.page.segments.map((s) => s.id) : editor.page.sections.map((s) => s.id)),
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
      const cloudIds = editor.selectedClouds.map((c) => c.id);
      if (!ids.length && !segIds.length && !secIds.length && !cloudIds.length) return;
      e.preventDefault();
      editor.apply((p) => {
        deleteClouds(p, cloudIds);
        deleteSections(p, pageId, secIds);
        deleteSegments(p, pageId, segIds);
        deleteElements(p, pageId, ids);
      });
      editor.selection = [];
    } else if (e.key === "r" || e.key === "R") {
      if (ids.length) editor.apply((p) => rotateElements(p, pageId, ids));
    } else if (e.key === "Escape") {
      if (canvas?.cancel()) return;
      editor.stamp = null;
      editor.tool = "select";
      editor.placeSymbol = null;
      editor.selection = [];
    } else if ((e.key === "w" || e.key === "W") && editor.mode === "draft") {
      editor.tool = "wire";
      editor.placeSymbol = null;
    } else if ((e.key === "b" || e.key === "B") && editor.mode === "annotate") {
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
  onpaste={(e) => {
    // Ctrl+V with a picture on the clipboard puts it on the sheet (Annotate).
    if (editor.mode === "simulate" || editor.mode === "ga" || isTyping(e.target) || showProject || dialog) return;
    const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    e.preventDefault();
    void canvas?.placePictures(files);
  }}
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
    <div class="workbench" role="group" aria-label="Workbench">
      <button class:active={editor.mode === "draft"} onclick={() => setMode("draft")} title="The electrical drawing: parts, wires, rails, plant">Draft</button>
      <button class:active={editor.mode === "annotate"} onclick={() => setMode("annotate")} title="Text, boxes, label plates, sections, revision clouds and pictures">Annotate</button>
      <button class:active={editor.mode === "ga"} onclick={() => setMode("ga")} title="General arrangement: the panel laid out at true scale">GA</button>
      <button class:active={editor.mode === "simulate"} onclick={() => setMode("simulate")} title="Try the logic as drawn">Simulate</button>
    </div>
    {#if editor.mode === "simulate"}
      <span class="simnote">Simulating: click switches and buttons on the drawing; double-click to follow a link. Editing is off.</span>
      <button onclick={() => canvas?.fit()} title="Fit sheet (F)">Fit</button>
      <button class:active={!!editor.splitPageId} onclick={toggleSplit}>Split</button>
    {:else}
      <div class="tools">
        <button class:active={editor.tool === "select"} onclick={() => ((editor.tool = "select"), (editor.placeSymbol = null))}>
          Select
        </button>
        {#if editor.mode === "draft"}
          <button class:active={editor.tool === "wire"} onclick={() => ((editor.tool = "wire"), (editor.placeSymbol = null))} title="Draw wires (W)">
            Wire
          </button>
        {:else if editor.mode === "ga"}
          <button class:active={editor.tool === "ga-rail"} onclick={() => ((editor.tool = "ga-rail"), (editor.gaPlace = null))} title="Drag along where a DIN rail goes">
            DIN rail
          </button>
          <button class:active={editor.tool === "ga-trunking"} onclick={() => ((editor.tool = "ga-trunking"), (editor.gaPlace = null))} title="Drag out a run of trunking">
            Trunking
          </button>
          <button class:active={editor.tool === "ga-note"} onclick={() => ((editor.tool = "ga-note"), (editor.gaPlace = null))} title="Add a note">
            Note
          </button>
        {:else if editor.mode === "annotate"}
          <button class:active={editor.tool === "section"} onclick={() => ((editor.tool = "section"), (editor.placeSymbol = null))} title="Draw a section box (B)">
            Section
          </button>
          <button class:active={editor.tool === "cloud"} onclick={() => ((editor.tool = "cloud"), (editor.placeSymbol = null))} title="Cloud a change for the latest revision">
            Cloud
          </button>
          <label class="button" title="Add a picture (or paste one with Ctrl+V, or drop one on the sheet)">
            Picture…
            <input
              type="file"
              accept="image/*"
              hidden
              onchange={(e) => {
                const files = [...(e.currentTarget.files ?? [])];
                e.currentTarget.value = "";
                if (files.length) void canvas?.placePictures(files);
              }}
            />
          </label>
        {/if}
        <span class="sep"></span>
        <button disabled={!editor.canUndo} onclick={() => editor.undo()} title="Undo (Ctrl+Z)">Undo</button>
        <button disabled={!editor.canRedo} onclick={() => editor.redo()} title="Redo (Ctrl+Y)">Redo</button>
        <span class="sep"></span>
        <button onclick={() => canvas?.fit()} title="Fit sheet (F)">Fit</button>
        <button class:active={!!editor.splitPageId} onclick={toggleSplit} title="Show another sheet alongside">Split</button>
        {#if editor.mode === "draft"}
          <button class:active={tableView} onclick={() => (tableView = !tableView)} title="Every element in the project as a table">Table</button>
          <span class="sep"></span>
          <button onclick={doRenumber} title="See what Renumber would change to tags, terminal and wire numbers, then apply">Renumber</button>
          <button onclick={() => (dialog = "templates")} title="Save and stamp sheet and section templates">Templates…</button>
          <button onclick={() => (dialog = "plant")} title="Field equipment: define plant and place views">Plant…</button>
          <button onclick={() => (dialog = "checks")} title="Check the drawing for problems">Check</button>
          <button onclick={() => (dialog = "schedules")} title="Terminal and cable schedules">Schedules</button>
        {/if}
      </div>
    {/if}
    <div class="file">
      <button onclick={() => (showProject = true)} title="Project details, logo and revisions (title block)">Project…</button>
      <button onclick={() => (savingAs = true)} title="Save a copy of this project to a file anywhere">Save as…</button>
      <button onclick={exportPdf} disabled={exporting} title="Download every sheet as an A4 PDF">
        {exporting ? "Exporting…" : "Export PDF"}
      </button>
      <button onclick={print} title="Open the print view and print from the browser">Print</button>
    </div>
    <span class="status" class:error={editor.saveState === "error"}>{saveText}</span>
  </header>
  <aside class="left">
    <PageList {editor} />
    {#if editor.mode === "draft" || editor.mode === "annotate"}<Palette {editor} />{/if}
    {#if editor.mode === "ga"}<GaPanel {editor} />{/if}
  </aside>
  <main class:split={!!editor.splitPageId && !tableView}>
    {#if tableView}
      <TableView {editor} onclose={() => (tableView = false)} />
    {:else}
      <div class="pane"><Canvas bind:this={canvas} {editor} {sim} /></div>
      {#if editor.splitPageId}
        <div class="pane"><SplitPane {editor} /></div>
      {/if}
    {/if}
    {#if editor.message}<div class="toast">{editor.message}</div>{/if}
  </main>
  <aside class="right">
    {#if sim}
      <div class="props-scroll"><SimPanel {editor} {sim} /></div>
    {:else if editor.mode === "ga"}
      <div class="props-scroll"><GaProps {editor} /></div>
    {:else}
      <ElementList {editor} />
      <div class="props-scroll"><Props {editor} /></div>
    {/if}
  </aside>
</div>
{#if savingAs}
  <FileBrowser
    mode="save"
    initialName={editor.project.project.title}
    onpick={(path) => void saveAs(path)}
    onclose={() => (savingAs = false)}
  />
{/if}
{#if dialog === "plant"}
  <PlantDialog {editor} onclose={() => (dialog = null)} />
{:else if dialog === "renumber"}
  <RenumberDialog {editor} onclose={() => (dialog = null)} />
{:else if dialog === "checks"}
  <ChecksDialog {editor} onclose={() => (dialog = null)} />
{:else if dialog === "templates"}
  <TemplatesDialog {editor} onclose={() => (dialog = null)} />
{:else if dialog === "schedules"}
  <SchedulesDialog {editor} onclose={() => (dialog = null)} />
{/if}
{#if showProject}
  <ProjectDialog {editor} onclose={() => (showProject = false)} />
{/if}

<style>
  .editor {
    display: grid;
    overflow: hidden;
    grid-template-columns: 200px 1fr 270px;
    grid-template-rows: 40px 1fr;
    grid-template-areas: "head head head" "left main right";
    height: 100vh;
  }
  header {
    grid-area: head;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 10px;
    overflow-x: auto;
    white-space: nowrap;
    border-bottom: 1px solid #cfd4d8;
    background: #f4f5f6;
  }
  header button,
  header .button {
    white-space: nowrap;
    flex: none;
  }
  .title {
    font-size: 14px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 260px;
  }
  .workbench {
    display: flex;
  }
  .workbench button {
    border-radius: 0;
  }
  .workbench button:first-child {
    border-radius: 4px 0 0 4px;
  }
  .workbench button:last-child {
    border-radius: 0 4px 4px 0;
    margin-left: -1px;
  }
  .simnote {
    font-size: 12px;
    color: #a55a00;
  }
  .tools {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .file {
    display: flex;
    gap: 4px;
    margin-left: auto;
  }
  label.button {
    border: 1px solid #c8ccd2;
    border-radius: 4px;
    padding: 3px 8px;
    background: #fff;
    cursor: pointer;
    font-size: 13px;
  }
  .sep {
    width: 1px;
    height: 20px;
    background: #cfd4d8;
    margin: 0 4px;
  }
  .status {
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
    background: #fafafa;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .props-scroll {
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }
  main {
    grid-area: main;
    position: relative;
    overflow: hidden;
    display: grid;
    grid-template-columns: 1fr;
    min-height: 0;
  }
  main.split {
    grid-template-columns: 1fr 1fr;
  }
  .pane {
    position: relative;
    min-width: 0;
    min-height: 0;
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
