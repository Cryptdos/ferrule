<script lang="ts">
  import { untrack } from "svelte";
  import {
    deleteClouds,
    deleteElements,
    deleteSections,
    deleteSegments,
    duplicateElements,
    moveElements,
    flipElements,
    rotateElements,
  } from "../../core/ops";
  import { benchOf } from "../../core/symbols";
  import { api, ApiError } from "../api";
  import FileBrowser from "./FileBrowser.svelte";
  import Browser from "./Browser.svelte";
  import FloatBox from "./FloatBox.svelte";
  import Icon from "./Icon.svelte";
  import SheetProps from "./SheetProps.svelte";
  import DevicesDialog from "./DevicesDialog.svelte";
  import GaProps from "./GaProps.svelte";
  import PlacePartsDialog from "./PlacePartsDialog.svelte";
  import { deleteGaItems, moveGaItems, rotateGaItems } from "../../core/ops";
  import { isTyping } from "../typing";
  import type { Editor } from "../editor.svelte";
  import Canvas from "./Canvas.svelte";
  import Props from "./Props.svelte";
  import ProjectDialog from "./ProjectDialog.svelte";
  import PlantDialog from "./PlantDialog.svelte";
  import ControllersDialog from "./ControllersDialog.svelte";
  import DistributionDialog from "./DistributionDialog.svelte";
  import ExpectationsDialog from "./ExpectationsDialog.svelte";
  import ChecksDialog from "./ChecksDialog.svelte";
  import RenumberDialog from "./RenumberDialog.svelte";
  import SchedulesDialog from "./SchedulesDialog.svelte";
  import TableView from "./TableView.svelte";
  import SplitPane from "./SplitPane.svelte";
  import TemplatesDialog from "./TemplatesDialog.svelte";
  import SimPanel from "./SimPanel.svelte";
  import SettingsDialog from "./SettingsDialog.svelte";
  import Modal, { closeTopmost } from "./Modal.svelte";
  import { Simulator } from "../sim.svelte";

  let { editor, onclose, onopen }: { editor: Editor; onclose: () => void; onopen?: (id: string) => void } = $props();
  let savingAs = $state(false);

  async function saveAs(path: string, replace = false) {
    savingAs = false;
    await editor.saveNow();
    try {
      let id: string;
      try {
        id = (await api.saveAs(editor.project.id, path, replace)).id;
      } catch (e) {
        // Already a file there (made since the folder was listed): replace it if asked to (the old one is kept as .bak).
        if (!(e instanceof ApiError && e.status === 409)) throw e;
        if (!confirm(`${e.message}. Replace it? (The file that's there now is kept as a .bak beside it.)`)) return;
        id = (await api.saveAs(editor.project.id, path, true)).id;
      }
      editor.flash(`Saved as ${path}. Now editing that file.`);
      onopen?.(id);
    } catch (e) {
      editor.flash((e as Error).message);
    }
  }

  let canvas: Canvas | undefined = $state();
  let mainEl: HTMLElement | undefined = $state();
  let dividerDrag = false;
  /** Share of the width the working sheet takes in the split view. */
  let splitAt = $state(
    (() => {
      try {
        const v = Number(localStorage.getItem("ferrule.split"));
        return v > 0.1 && v < 0.9 ? v : 0.5;
      } catch {
        return 0.5;
      }
    })(),
  );

  // Text left empty disappears when you click away from it: an empty box is invisible on the sheet.
  let lastSelected: { page: string; ids: string[] } = { page: "", ids: [] };
  $effect(() => {
    const now = { page: editor.pageId, ids: [...editor.selection] };
    untrack(() => {
      const left = lastSelected.ids.filter((id) => !now.ids.includes(id));
      const page = editor.project.pages.find((pg) => pg.id === lastSelected.page);
      const empty = left.filter((id) => {
        const el = page?.elements.find((e) => e.id === id);
        return el?.symbol === "text" && !el.label.trim();
      });
      if (page && empty.length) editor.apply((p) => deleteElements(p, page.id, empty));
      lastSelected = now;
    });
  });
  let showProject = $state(false);
  /** Open windows: they don't block the drawing, and several can be open at once. */
  type DialogName = "expectations" | "plant" | "controllers" | "table" | "distribution" | "checks" | "schedules" | "templates" | "renumber" | "devices" | "settings" | "place";
  let open: Partial<Record<DialogName, boolean>> = $state({});
  /** Export PDF failed: what went wrong, with the Print way round it. */
  let pdfError = $state("");
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
    // The working half is narrower now: fit the sheet to it.
    setTimeout(() => canvas?.fit(), 60);
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
      pdfError = (e as Error).message;
    } finally {
      exporting = false;
    }
  }

  /** A menu button opens its window, and closes it again when it's open (10). */
  function toggle(name: DialogName) {
    open[name] = !open[name];
  }

  async function print() {
    await editor.saveNow();
    window.open(`/print/${encodeURIComponent(editor.project.id)}?autoprint=1`, "_blank");
  }

  const saveText = $derived(
    { saved: "Saved", pending: "Unsaved changes", saving: "Saving…", error: "Save failed" }[editor.saveState],
  );


  const inWindow = (t: EventTarget | null) => t instanceof Element && !!t.closest('[role="dialog"]');

  function onKey(e: KeyboardEvent) {
    // Windows don't block the drawing: keys work on it unless a window has the focus.
    if (isTyping(e.target) || inWindow(e.target)) return;
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
        if (canvas?.cancel()) return;
        // Then the window on top (13), then what's picked.
        if (closeTopmost()) return;
        editor.gaPlace = null;
        editor.tool = "select";
        editor.selection = [];
      } else if (e.key === "PageDown" || e.key === "PageUp") {
        e.preventDefault();
        const pages = editor.project.pages;
        const i = editor.pageIndex + (e.key === "PageDown" ? 1 : -1);
        if (pages[i]) editor.setPage(pages[i].id);
      }
      return;
    }
    // Simulating: only moving about (sheets, fit); nothing is edited.
    if (editor.mode === "simulate") {
      if (e.key === "Escape") closeTopmost();
      if (e.key === "PageDown" || e.key === "PageUp") {
        e.preventDefault();
        const pages = editor.project.pages;
        const i = editor.pageIndex + (e.key === "PageDown" ? 1 : -1);
        if (pages[i]) editor.setPage(pages[i].id);
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
      if (editor.linking) {
        editor.linking = null;
        return;
      }
      if (canvas?.cancel()) return;
      // Then the window on top (13), then what's picked.
      if (closeTopmost()) return;
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
      if (ids.length) editor.apply((p) => flipElements(p, pageId, ids));
    }
  }
</script>

<svelte:window
  onkeydown={onKey}
  onpaste={(e) => {
    // Ctrl+V with a picture on the clipboard puts it on the sheet (Annotate).
    if (editor.mode === "simulate" || editor.mode === "ga" || isTyping(e.target) || inWindow(e.target) || showProject) return;
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
        <button onclick={() => (showProject = true)} title="Project details, logo and revisions (title block)">Project…</button>
        <button class="icon" onclick={() => (savingAs = true)} title="Save as… (a copy of this project, to a file anywhere)"><Icon name="saveAs" /></button>
        <button class="icon" onclick={exportPdf} disabled={exporting} title={exporting ? "Exporting…" : "Export PDF: every sheet as an A4 PDF"}><Icon name="pdf" /></button>
        <button class="icon" onclick={print} title="Print (opens the print view)"><Icon name="print" /></button>
        <span class="sep"></span>
        <button class="icon" class:active={help} onclick={() => (help = !help)} title="Keyboard and mouse help"><Icon name="help" /></button>
        <button class="icon" class:active={!!open.settings} onclick={() => (open.settings = !open.settings)} title="Settings, and Status: Claude's connection, Quit Ferrule"><Icon name="gear" /></button>
      </div>
      <span class="status" class:error={editor.saveState === "error"}>{saveText}</span>
    </div>
    <div class="row two">
      <!-- The same order on every workbench (v0.2.1 note 15): undo and redo, view, tools, menus. -->
      {#if editor.mode !== "simulate"}
        <button class="icon" disabled={!editor.canUndo} onclick={() => editor.undo()} title="Undo (Ctrl+Z)"><Icon name="undo" /></button>
        <button class="icon" disabled={!editor.canRedo} onclick={() => editor.redo()} title="Redo (Ctrl+Y)"><Icon name="redo" /></button>
        <span class="sep"></span>
      {/if}
      <button class="icon" onclick={() => canvas?.fit()} title="Fit sheet (tap Space)"><Icon name="fit" /></button>
      <button class="icon" class:active={!!editor.splitPageId} onclick={toggleSplit} title="Show another sheet alongside"><Icon name="split" /></button>
      {#if editor.mode !== "simulate"}
        <span class="sep"></span>
        <button class="icon" class:active={editor.tool === "select"} onclick={() => ((editor.tool = "select"), (editor.placeSymbol = null), (editor.gaPlace = null))} title="Select (S)">
          <Icon name="select" />
        </button>
        {#if editor.mode === "draft"}
          <button class="tool" class:active={editor.tool === "wire"} onclick={() => ((editor.tool = "wire"), (editor.placeSymbol = null))} title="Draw wires (W)">
            <Icon name="wire" /> Wire
          </button>
        {/if}
      {/if}
      {#if editor.mode === "simulate"}
        <span class="sep"></span>
        <span class="simnote">Simulating: click switches, buttons and plant outputs on the drawing; double-click to follow a link. Editing is off.</span>
        <button class:active={!!open.expectations} onclick={() => toggle("expectations")} title="What the drawing should do: checked live, and by Check logic">Expectations…</button>
      {:else if editor.mode === "draft"}
        <span class="sep"></span>
        <button class:active={!!open.renumber} onclick={() => toggle("renumber")} title="See what Renumber would change to tags, terminal and wire numbers, then apply">Renumber</button>
        <button class:active={!!open.templates} onclick={() => toggle("templates")} title="Save and stamp sheet and section templates">Templates</button>
        <button class:active={!!open.plant} onclick={() => toggle("plant")} title="Field equipment: define plant and place views">Plant</button>
        <button class:active={!!open.controllers} onclick={() => toggle("controllers")} title="Outstations and PLCs: their modules, in rail order, and module views">Controllers</button>
        <button class:active={!!open.distribution} onclick={() => toggle("distribution")} title="The supplies busbars, link arrows and the incoming supply pick from">Distribution</button>
        <button class:active={!!open.table} onclick={() => toggle("table")} title="Table: every element in the project, to filter, edit and find-and-replace">Table</button>
        <button class:active={!!open.checks} onclick={() => toggle("checks")} title="Check the drawing for problems">Check</button>
        <button class:active={!!open.expectations} onclick={() => toggle("expectations")} title="What the drawing should do: checked live in Simulate, and by Check logic">Expectations…</button>
        <button class:active={!!open.schedules} onclick={() => toggle("schedules")} title="Terminal, cable and IO schedules">Schedules</button>
      {:else if editor.mode === "ga"}
        <span class="sep"></span>
        <button class:active={!!open.checks} onclick={() => toggle("checks")} title="Check the drawing for problems, with how full each DIN rail is">Check</button>
        <button class:active={!!open.schedules} onclick={() => toggle("schedules")} title="Terminal and cable schedules, and the bill of materials">Schedules</button>
        <button class:active={!!open.place} onclick={() => (open.place = !open.place)} title="Parts from the schematic not on a GA yet: pick one, then click on the sheet">Place parts…</button>
        <button class:active={!!open.devices} onclick={() => toggle("devices")} title="Real devices with their sizes, datasheets and pictures">Device table…</button>
      {/if}
    </div>
  </header>
  <main class:split={!!editor.splitPageId} style:--split={splitAt} bind:this={mainEl}>
    <div class="pane"><Canvas bind:this={canvas} {editor} {sim} insetLeft={browserWidth} atlas /></div>
    {#if editor.splitPageId}
      <!-- Drag the divider to share the width between the two sheets (note 14). -->
      <div
        class="divider"
        role="separator"
        aria-orientation="vertical"
        aria-label="Drag to resize the split"
        onpointerdown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          dividerDrag = true;
        }}
        onpointermove={(e) => {
          if (!dividerDrag || !mainEl) return;
          const r = mainEl.getBoundingClientRect();
          splitAt = Math.min(0.85, Math.max(0.15, (e.clientX - r.left) / r.width));
        }}
        onpointerup={() => {
          dividerDrag = false;
          try {
            localStorage.setItem("ferrule.split", String(splitAt));
          } catch {
            /* storage may be unavailable */
          }
        }}
      ></div>
      <div class="pane"><SplitPane {editor} /></div>
    {/if}
    <Browser {editor} bind:width={browserWidth} onplace={() => (open.place = true)} />
    {#if sim}
      <FloatBox title="Simulation" store="sim"><SimPanel {editor} {sim} onexpectations={() => (open.expectations = true)} /></FloatBox>
    {:else if editor.mode === "ga"}
      {#if gaSelected || editor.sheetSettings}
        <FloatBox title={gaSelected ? "Properties" : "Sheet"} store="props" onclose={closeProps}>
          {#if editor.sheetSettings && !gaSelected}<SheetProps {editor} />{/if}
          <GaProps {editor} ondevices={() => (open.devices = true)} />
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
          <p>Pick a part in the browser and click to place it; then it's back to Select (or keep placing until <kbd>Esc</kbd>: Settings). Drag to move, <kbd>R</kbd> rotate, <kbd>Del</kbd> delete, <kbd>Ctrl</kbd>+<kbd>D</kbd> duplicate, arrows nudge.</p>
          <p>Scroll to zoom, middle-drag or <kbd>Space</kbd>+drag to pan; tap <kbd>Space</kbd> to fit the sheet. <kbd>R</kbd> rotates, <kbd>F</kbd> flips top to bottom. Drag the outline in the overview (top right) to move about.</p>
          <p><kbd>W</kbd> wire tool: click a terminal, then another; click on a wire to tee into it. <kbd>Esc</kbd> cancels, <kbd>S</kbd> back to select.</p>
          <p><kbd>PgUp</kbd>/<kbd>PgDn</kbd> change sheet. Double-click a contact, coil or link arrow to jump to its partner.</p>
          <p><kbd>Ctrl</kbd>+<kbd>Z</kbd> undo, <kbd>Ctrl</kbd>+<kbd>Y</kbd> redo, <kbd>Ctrl</kbd>+<kbd>A</kbd> select all on this workbench. Saving is automatic.</p>
        </div>
      </FloatBox>
    {/if}
    {#if editor.linking}
      <div class="linkbar">
        {editor.linking.mode === "new"
          ? `New arrow linked from ${editor.linking.address}: click where it goes, on any sheet.`
          : `Linking from ${editor.linking.address}: click the arrow to link to, on any sheet.`}
        Esc cancels.
        <button onclick={() => (editor.linking = null)}>Cancel</button>
      </div>
    {/if}
    {#if editor.message}<div class="toast">{editor.message}</div>{/if}
  </main>
</div>
{#if savingAs}
  <FileBrowser
    mode="save"
    initialName={editor.project.project.title}
    onpick={(path, replace) => void saveAs(path, replace)}
    onclose={() => (savingAs = false)}
  />
{/if}
{#if open.distribution}
  <DistributionDialog {editor} onclose={() => (open.distribution = false)} />
{/if}
{#if open.plant}
  <PlantDialog {editor} onclose={() => (open.plant = false)} onexpectations={() => (open.expectations = true)} />
{/if}
{#if open.controllers}
  <ControllersDialog {editor} onclose={() => (open.controllers = false)} onexpectations={() => (open.expectations = true)} />
{/if}
{#if open.expectations}
  <ExpectationsDialog {editor} onclose={() => (open.expectations = false)} />
{/if}
{#if open.table && editor.mode === "draft"}
  <Modal title="Table" store="table" wide onclose={() => (open.table = false)}><TableView {editor} /></Modal>
{/if}
{#if open.renumber}
  <RenumberDialog {editor} onclose={() => (open.renumber = false)} />
{/if}
{#if open.checks}
  <ChecksDialog {editor} onclose={() => (open.checks = false)} />
{/if}
{#if open.templates}
  <TemplatesDialog {editor} onclose={() => (open.templates = false)} />
{/if}
{#if open.place && editor.mode === "ga"}
  <PlacePartsDialog {editor} onclose={() => ((open.place = false), (editor.gaPlace = null))} />
{/if}
{#if open.devices}
  <DevicesDialog {editor} onclose={() => (open.devices = false)} />
{/if}
{#if open.schedules}
  <SchedulesDialog {editor} onclose={() => (open.schedules = false)} />
{/if}
{#if open.settings}
  <SettingsDialog onclose={() => (open.settings = false)} />
{/if}
{#if pdfError}
  <Modal title="Export PDF" store="pdf-error" width={520} onclose={() => (pdfError = "")}>
    <p>The PDF couldn't be made.</p>
    <p class="cause">{pdfError}</p>
    <p>The print view makes the same A4 sheets: choose <strong>Save as PDF</strong> as the printer.</p>
    <div class="buttons">
      <button
        onclick={() => {
          pdfError = "";
          void print();
        }}>Print → Save as PDF</button
      >
      <button onclick={() => (pdfError = "")}>Close</button>
    </div>
  </Modal>
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
  header button {
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
    /* One row the height of the window: a table taller than it scrolls inside. */
    grid-template-rows: minmax(0, 1fr);
    min-height: 0;
  }
  main.split {
    grid-template-columns: minmax(0, calc(var(--split) * 100%)) 6px minmax(0, 1fr);
  }
  .divider {
    cursor: col-resize;
    background: var(--chrome, #e4e7ea);
    border-left: 1px solid #b9c0c6;
    border-right: 1px solid #b9c0c6;
    touch-action: none;
  }
  .divider:hover {
    background: #c9d3e0;
  }
  .cause {
    font-family: ui-monospace, Consolas, monospace;
    font-size: 12px;
    background: #f4f5f6;
    border: 1px solid #dde1e5;
    border-radius: 4px;
    padding: 6px 8px;
    word-break: break-word;
  }
  .buttons {
    display: flex;
    gap: 6px;
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
  .linkbar {
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    background: #fff6d6;
    border: 1px solid #d9b84a;
    color: #332;
    padding: 5px 10px;
    border-radius: 4px;
    font-size: 13px;
    z-index: 30;
    display: flex;
    gap: 10px;
    align-items: center;
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
