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
  import Browser from "./Browser.svelte";
  import FloatBox from "./FloatBox.svelte";
  import Icon from "./Icon.svelte";
  import SheetProps from "./SheetProps.svelte";
  import DevicesDialog from "./DevicesDialog.svelte";
  import GaProps from "./GaProps.svelte";
  import { deleteGaItems, moveGaItems, rotateGaItems } from "../../core/ops";
  import { isTyping } from "../typing";
  import type { Editor } from "../editor.svelte";
  import Canvas from "./Canvas.svelte";
  import Props from "./Props.svelte";
  import ProjectDialog from "./ProjectDialog.svelte";
  import PlantDialog from "./PlantDialog.svelte";
  import ChecksDialog from "./ChecksDialog.svelte";
  import RenumberDialog from "./RenumberDialog.svelte";
  import SchedulesDialog from "./SchedulesDialog.svelte";
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
  let dialog: "plant" | "checks" | "schedules" | "templates" | "renumber" | "devices" | null = $state(null);
  let tableView = $state(false);
  let help = $state(false);
  let browserWidth = $state(0);
  const gaSelected = $derived((editor.page.gaItems ?? []).some((i) => editor.selection.includes(i.id)));

  function closeProps() {
    editor.selection = [];
    editor.sheetSettings = false;
  }
  // Picking something shows its properties in place of the sheet's.
  $effect(() => {
    if (editor.selection.length) editor.sheetSettings = false;
  });
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
  // A spare sheet holds annotations only.
  $effect(() => {
    const isGa = !!editor.page.ga;
    if (isGa && editor.mode === "draft") setMode("ga");
    else if (editor.page.spare && editor.mode === "draft") setMode("annotate");
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
    <div class="row one">
      <button class="icon" onclick={onclose} title="Back to the project list"><Icon name="projects" /></button>
      <strong class="title" title={editor.project.project.title}>{editor.project.project.title}</strong>
      <div class="workbench" role="group" aria-label="Workbench">
        <button class:active={editor.mode === "draft"} disabled={!!editor.page.spare} onclick={() => setMode("draft")}
          title={editor.page.spare ? "This is a spare sheet: annotations only" : "The electrical drawing: parts, wires, rails, plant"}>Draft</button>
        <button class:active={editor.mode === "annotate"} onclick={() => setMode("annotate")} title="Text, boxes, label plates, sections, revision clouds and pictures">Annotate</button>
        <button class:active={editor.mode === "ga"} onclick={() => setMode("ga")} title="General arrangement: the panel laid out at true scale">GA</button>
        <button class:active={editor.mode === "simulate"} onclick={() => setMode("simulate")} title="Try the logic as drawn">Simulate</button>
      </div>
      <span class="grow"></span>
      <div class="group">
        <button class="icon" onclick={() => (showProject = true)} title="Project details, logo and revisions (title block)"><Icon name="settings" /></button>
        <button class="icon" onclick={() => (savingAs = true)} title="Save as… (a copy of this project, to a file anywhere)"><Icon name="saveAs" /></button>
        <button class="icon" onclick={exportPdf} disabled={exporting} title={exporting ? "Exporting…" : "Export PDF: every sheet as an A4 PDF"}><Icon name="pdf" /></button>
        <button class="icon" onclick={print} title="Print (opens the print view)"><Icon name="print" /></button>
        <span class="sep"></span>
        <button class="icon" class:active={help} onclick={() => (help = !help)} title="Keyboard and mouse help"><Icon name="help" /></button>
      </div>
      <span class="status" class:error={editor.saveState === "error"}>{saveText}</span>
    </div>
    <div class="row two">
      {#if editor.mode === "simulate"}
        <button class="icon" onclick={() => canvas?.fit()} title="Fit sheet (F)"><Icon name="fit" /></button>
        <button class="icon" class:active={!!editor.splitPageId} onclick={toggleSplit} title="Show another sheet alongside"><Icon name="split" /></button>
        <span class="sep"></span>
        <span class="simnote">Simulating: click switches and buttons on the drawing; double-click to follow a link. Editing is off.</span>
      {:else}
        <button class="icon" class:active={editor.tool === "select"} onclick={() => ((editor.tool = "select"), (editor.placeSymbol = null), (editor.gaPlace = null))} title="Select (S)">
          <Icon name="select" />
        </button>
        {#if editor.mode === "draft"}
          <button class="tool" class:active={editor.tool === "wire"} onclick={() => ((editor.tool = "wire"), (editor.placeSymbol = null))} title="Draw wires (W)">
            <Icon name="wire" /> Wire
          </button>
        {:else if editor.mode === "ga"}
          <button class="tool" class:active={editor.tool === "ga-rail"} onclick={() => ((editor.tool = "ga-rail"), (editor.gaPlace = null))} title="Drag along where a DIN rail goes">
            <Icon name="rail" /> DIN rail
          </button>
          <button class="tool" class:active={editor.tool === "ga-trunking"} onclick={() => ((editor.tool = "ga-trunking"), (editor.gaPlace = null))} title="Drag out a run of trunking">
            <Icon name="trunking" /> Trunking
          </button>
          <button class="tool" class:active={editor.tool === "ga-note"} onclick={() => ((editor.tool = "ga-note"), (editor.gaPlace = null))} title="Add a note">
            <Icon name="note" /> Note
          </button>
          <span class="sep"></span>
          <button class="tool" onclick={() => (dialog = "devices")} title="Real devices with their sizes, datasheets and pictures">
            <Icon name="library" /> Device table
          </button>
        {:else if editor.mode === "annotate"}
          <button class="tool" class:active={editor.tool === "section"} onclick={() => ((editor.tool = "section"), (editor.placeSymbol = null))} title="Draw a section box (B)">
            <Icon name="section" /> Section
          </button>
          <button class="tool" class:active={editor.tool === "cloud"} onclick={() => ((editor.tool = "cloud"), (editor.placeSymbol = null))} title="Cloud a change for the latest revision">
            <Icon name="cloud" /> Cloud
          </button>
          <label class="tool" title="Add a picture (or paste one with Ctrl+V, or drop one on the sheet)">
            <Icon name="picture" /> Picture
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
        <button class="icon" disabled={!editor.canUndo} onclick={() => editor.undo()} title="Undo (Ctrl+Z)"><Icon name="undo" /></button>
        <button class="icon" disabled={!editor.canRedo} onclick={() => editor.redo()} title="Redo (Ctrl+Y)"><Icon name="redo" /></button>
        <span class="sep"></span>
        <button class="icon" onclick={() => canvas?.fit()} title="Fit sheet (F)"><Icon name="fit" /></button>
        <button class="icon" class:active={!!editor.splitPageId} onclick={toggleSplit} title="Show another sheet alongside"><Icon name="split" /></button>
        {#if editor.mode === "draft"}
          <button class="icon" class:active={tableView} onclick={() => (tableView = !tableView)} title="Table: every element in the project"><Icon name="table" /></button>
          <span class="sep"></span>
          <button onclick={doRenumber} title="See what Renumber would change to tags, terminal and wire numbers, then apply">Renumber</button>
          <button onclick={() => (dialog = "templates")} title="Save and stamp sheet and section templates">Templates</button>
          <button onclick={() => (dialog = "plant")} title="Field equipment: define plant and place views">Plant</button>
          <button onclick={() => (dialog = "checks")} title="Check the drawing for problems">Check</button>
          <button onclick={() => (dialog = "schedules")} title="Terminal and cable schedules">Schedules</button>
        {/if}
      {/if}
    </div>
  </header>
  <main class:split={!!editor.splitPageId && !tableView}>
    {#if tableView}
      <TableView {editor} onclose={() => (tableView = false)} />
    {:else}
      <div class="pane"><Canvas bind:this={canvas} {editor} {sim} insetLeft={browserWidth} atlas /></div>
      {#if editor.splitPageId}
        <div class="pane"><SplitPane {editor} /></div>
      {/if}
      <Browser {editor} bind:width={browserWidth} />
      {#if sim}
        <FloatBox title="Simulation" store="sim"><SimPanel {editor} {sim} /></FloatBox>
      {:else if editor.mode === "ga"}
        {#if gaSelected || editor.sheetSettings}
          <FloatBox title={gaSelected ? "Properties" : "Sheet"} store="props" onclose={closeProps}>
            {#if editor.sheetSettings && !gaSelected}<SheetProps {editor} />{/if}
            <GaProps {editor} ondevices={() => (dialog = "devices")} />
          </FloatBox>
        {/if}
      {:else if editor.selection.length || editor.sheetSettings}
        <FloatBox title={editor.selection.length ? "Properties" : "Sheet"} store="props" onclose={closeProps}>
          {#if editor.selection.length}<Props {editor} />{:else}<SheetProps {editor} />{/if}
        </FloatBox>
      {/if}
      {#if help}
        <FloatBox title="Help" store="help" top={162} right={344} width={280} onclose={() => (help = false)}>
          <div class="help">
            <p>Pick a part in the browser and click to place it. Drag to move, <kbd>R</kbd> rotate, <kbd>Del</kbd> delete, <kbd>Ctrl</kbd>+<kbd>D</kbd> duplicate, arrows nudge.</p>
            <p>Scroll to zoom, middle-drag or <kbd>Space</kbd>+drag to pan, <kbd>F</kbd> fits the sheet. Drag the outline in the overview (top right) to move about.</p>
            <p><kbd>W</kbd> wire tool: click a terminal, then another; click on a wire to tee into it. <kbd>Esc</kbd> cancels, <kbd>S</kbd> back to select.</p>
            <p><kbd>PgUp</kbd>/<kbd>PgDn</kbd> change sheet. Double-click a contact, coil or link arrow to jump to its partner.</p>
            <p><kbd>Ctrl</kbd>+<kbd>Z</kbd> undo, <kbd>Ctrl</kbd>+<kbd>Y</kbd> redo, <kbd>Ctrl</kbd>+<kbd>A</kbd> select all on this workbench. Saving is automatic.</p>
          </div>
        </FloatBox>
      {/if}
    {/if}
    {#if editor.message}<div class="toast">{editor.message}</div>{/if}
  </main>
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
{:else if dialog === "devices"}
  <DevicesDialog {editor} onclose={() => (dialog = null)} />
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
    grid-template-rows: auto 1fr;
    height: 100vh;
  }
  header {
    display: flex;
    flex-direction: column;
    border-bottom: 1px solid #cfd4d8;
    background: #f4f5f6;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    height: 40px;
    overflow-x: auto;
    white-space: nowrap;
  }
  .row.two {
    height: 38px;
    background: #fbfbfc;
    border-top: 1px solid #e3e6e9;
  }
  header button,
  header label.tool {
    white-space: nowrap;
    flex: none;
  }
  button.icon {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    border: 1px solid transparent;
    background: none;
    border-radius: 4px;
    color: #334;
  }
  button.icon:hover:not(:disabled),
  .tool:hover {
    background: rgba(0, 0, 0, 0.06);
  }
  button.icon.active,
  .tool.active {
    background: #e2ecfc;
    border-color: #1e6ee6;
    color: #1550b0;
  }
  button.icon:disabled {
    opacity: 0.35;
  }
  .tool {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px 3px 5px;
    border: 1px solid transparent;
    background: none;
    border-radius: 4px;
    font-size: 13px;
    color: #223;
    cursor: pointer;
  }
  .title {
    font-size: 14px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 280px;
    margin-right: 8px;
  }
  .workbench {
    display: flex;
  }
  .workbench button {
    border-radius: 0;
    padding: 4px 12px;
  }
  .workbench button:first-child {
    border-radius: 4px 0 0 4px;
  }
  .workbench button:last-child {
    border-radius: 0 4px 4px 0;
  }
  .workbench button + button {
    margin-left: -1px;
  }
  .group {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .grow {
    flex: 1;
  }
  .simnote {
    font-size: 12px;
    color: #a55a00;
  }
  .sep {
    width: 1px;
    height: 20px;
    background: #cfd4d8;
    margin: 0 4px;
    flex: none;
  }
  .status {
    font-size: 12px;
    color: #667;
    min-width: 7em;
    text-align: right;
  }
  .status.error {
    color: #b00;
    font-weight: bold;
  }
  main {
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
  .help {
    padding: 8px 12px;
    font-size: 12px;
    color: #445;
    line-height: 1.5;
  }
  .help p {
    margin: 0 0 6px;
  }
  kbd {
    font-size: 11px;
    border: 1px solid #ccd;
    border-radius: 3px;
    padding: 0 3px;
    background: #f6f7f8;
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
    z-index: 30;
  }
</style>
