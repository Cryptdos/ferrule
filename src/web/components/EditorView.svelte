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
  import LabelButton from "./LabelButton.svelte";
  import SheetProps from "./SheetProps.svelte";
  import DevicesDialog from "./DevicesDialog.svelte";
  import GaProps from "./GaProps.svelte";
  import PlacePartsDialog from "./PlacePartsDialog.svelte";
  import { deleteGaItems, moveGaItems, rotateGaItems } from "../../core/ops";
  import { alignElements, alignGaItems, distributeElements, distributeGaItems, type AlignHow, type DistributeHow } from "../../core/align";
  import { isTyping } from "../typing";
  import type { Editor } from "../editor.svelte";
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
  import Tiles from "./Tiles.svelte";
  import { canvases } from "../canvases";
  import Dockable from "./Dockable.svelte";
  import { docking, DOCKABLE } from "../docking.svelte";
  import { leaves } from "../tiles";
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

  /** The active tile's canvas (design-v0.3 §7): Fit, Esc and pasting work on it. */
  const canvas = {
    fit: () => canvases.get(editor.activeTile)?.fit(),
    cancel: () => canvases.get(editor.activeTile)?.cancel() ?? false,
    placePictures: (files: Blob[]) => canvases.get(editor.activeTile)?.placePictures(files),
  };

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
  const open: Partial<Record<DialogName, boolean>> = editor.open;
  /** Windows in tiles (design-v0.3 §7), and where a dragged window would go. */
  const inTile = $derived(new Set(leaves(editor.tiles).flatMap((l) => (l.content.type === "window" ? [l.content.name] : []))));
  docking.dock = (name, tile, zone) => editor.dockWindow(name, tile, zone);
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

  /** Split the active tile: the new half, to its right, shows the same sheet. */
  function split() {
    const id = editor.activeTile;
    editor.splitTile(id, "row");
    // It's narrower now: fit its sheet to it again.
    setTimeout(() => canvases.get(id)?.fit(), 60);
  }
  /** What the alignment tools act on (design-v0.3 §5): this workbench's parts, or the GA's items. */
  const alignable = $derived.by(() => {
    if (editor.mode === "simulate") return [];
    if (editor.mode === "ga") {
      const items = editor.page.gaItems ?? [];
      return editor.selection.filter((id) => items.some((i) => i.id === id && !i.dim));
    }
    const bench = editor.mode === "annotate" ? "annotate" : "draft";
    return editor.selection.filter((id) => editor.page.elements.some((e) => e.id === id && e.symbol !== "junction" && benchOf(e) === bench));
  });
  const ALIGN: { how: AlignHow; name: string; icon: "alignLeft" | "alignCentre" | "alignRight" | "alignTop" | "alignMiddle" | "alignBottom" }[] = [
    { how: "left", name: "Align left", icon: "alignLeft" },
    { how: "centre", name: "Align centre", icon: "alignCentre" },
    { how: "right", name: "Align right", icon: "alignRight" },
    { how: "top", name: "Align top", icon: "alignTop" },
    { how: "middle", name: "Align middle", icon: "alignMiddle" },
    { how: "bottom", name: "Align bottom", icon: "alignBottom" },
  ];
  const alignHint = $derived(
    alignable.length === 1 ? "to the sheet (inside the border, above the title block)" : editor.pickedByBox ? "to the outline around them" : "to the first one picked",
  );
  function align(how: AlignHow) {
    const ids = [...alignable];
    const box = editor.pickedByBox;
    editor.apply((p) => (editor.mode === "ga" ? alignGaItems(p, editor.pageId, ids, how, box) : alignElements(p, editor.pageId, ids, how, box)));
  }
  function distribute(how: DistributeHow) {
    const ids = [...alignable];
    editor.apply((p) => (editor.mode === "ga" ? distributeGaItems(p, editor.pageId, ids, how) : distributeElements(p, editor.pageId, ids, how)));
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

  /** A menu button opens its window, and closes it again when it's open (10), in a tile or not. */
  function toggle(name: DialogName) {
    const tile = editor.windowTile(name);
    if (tile) editor.closeTile(tile);
    else open[name] = !open[name];
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
    } else if ((e.key === "r" || e.key === "R") && editor.tool === "place" && editor.placeSymbol && editor.placeSymbol !== "plant-view") {
      // Turn the part before it's placed (35).
      editor.placeRot = ((editor.placeRot + 90) % 360) as 0 | 90 | 180 | 270;
    } else if ((e.key === "f" || e.key === "F") && editor.tool === "place" && editor.placeSymbol && editor.placeSymbol !== "plant-view") {
      editor.placeFlip = !editor.placeFlip;
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
        <LabelButton icon="draft" label="Draft" active={editor.mode === "draft"} onclick={() => setMode("draft")} disabled={!!editor.page.spare}
          title={editor.page.spare ? "This is a spare sheet: annotations only" : "The electrical drawing: parts, wires, rails, plant"} />
        <LabelButton icon="annotate" label="Annotate" active={editor.mode === "annotate"} onclick={() => setMode("annotate")}
          title="Text, boxes, label plates, sections, revision clouds and pictures" />
        <LabelButton icon="ga" label="GA" active={editor.mode === "ga"} onclick={() => setMode("ga")}
          title="General arrangement: the panel laid out at true scale" />
        <LabelButton icon="simulate" label="Simulate" active={editor.mode === "simulate"} onclick={() => setMode("simulate")}
          title="Try the logic as drawn" />
      </div>
      <span class="grow"></span>
      <div class="group">
        <LabelButton icon="project" label="Project…" onclick={() => (showProject = true)} title="Project details, logo and revisions (title block)" />
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
      <button class="icon" onclick={split} title="Split: the active tile in two, side by side, both showing its sheet. Each tile has its own bar to split right or down and to close"><Icon name="split" /></button>
      {#if editor.mode === "draft"}
        <button class="icon" class:active={editor.colourCheck} onclick={() => (editor.colourCheck = !editor.colourCheck)}
          title="Colour check: every wire and busbar in its core colour (grey dashes: no colour set). Print and PDF stay black"><Icon name="colours" /></button>
      {/if}
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
      {#if editor.mode !== "simulate"}
        <!-- Align and distribute (design-v0.3 §5): always icons, the name on hover. -->
        <span class="sep"></span>
        {#each ALIGN as a (a.how)}
          <button class="icon" disabled={!alignable.length} onclick={() => align(a.how)} title="{a.name}: {alignHint}"><Icon name={a.icon} /></button>
        {/each}
        <button class="icon" disabled={alignable.length < 3} onclick={() => distribute("across")} title="Distribute across: equal gaps between them, the outer two staying put (three or more)"><Icon name="distributeAcross" /></button>
        <button class="icon" disabled={alignable.length < 3} onclick={() => distribute("down")} title="Distribute down: equal gaps between them, the outer two staying put (three or more)"><Icon name="distributeDown" /></button>
      {/if}
      {#if editor.mode === "simulate"}
        <span class="sep"></span>
        <span class="simnote">Simulating: click switches, buttons and plant outputs on the drawing; double-click to follow a link. Editing is off.</span>
        <LabelButton icon="expectations" label="Expectations…" active={!!open.expectations} onclick={() => toggle("expectations")} title="What the drawing should do: checked live, and by Check logic" />
      {:else if editor.mode === "draft"}
        <span class="sep"></span>
        <LabelButton icon="renumber" label="Renumber" active={!!open.renumber} onclick={() => toggle("renumber")} title="See what Renumber would change to tags, terminal and wire numbers, then apply" />
        <LabelButton icon="templates" label="Templates" active={!!open.templates} onclick={() => toggle("templates")} title="Save and stamp sheet and section templates" />
        <LabelButton icon="plant" label="Plant" active={!!open.plant} onclick={() => toggle("plant")} title="Field equipment: define plant and place views" />
        <LabelButton icon="controllers" label="Controllers" active={!!open.controllers} onclick={() => toggle("controllers")} title="Outstations and PLCs: their modules, in rail order, and module views" />
        <LabelButton icon="distribution" label="Distribution" active={!!open.distribution} onclick={() => toggle("distribution")} title="The supplies busbars, link arrows and the incoming supply pick from" />
        <LabelButton icon="table" label="Table" active={!!open.table} onclick={() => toggle("table")} title="Table: every element in the project, to filter, edit and find-and-replace" />
        <LabelButton icon="check" label="Check" active={!!open.checks} onclick={() => toggle("checks")} title="Check the drawing for problems" />
        <LabelButton icon="expectations" label="Expectations…" active={!!open.expectations} onclick={() => toggle("expectations")} title="What the drawing should do: checked live in Simulate, and by Check logic" />
        <LabelButton icon="schedules" label="Schedules" active={!!open.schedules} onclick={() => toggle("schedules")} title="Terminal, cable and IO schedules" />
      {:else if editor.mode === "ga"}
        <span class="sep"></span>
        <LabelButton icon="check" label="Check" active={!!open.checks} onclick={() => toggle("checks")} title="Check the drawing for problems, with how full each DIN rail is" />
        <LabelButton icon="schedules" label="Schedules" active={!!open.schedules} onclick={() => toggle("schedules")} title="Terminal and cable schedules, and the bill of materials" />
        <LabelButton icon="place" label="Place parts…" active={!!open.place} onclick={() => (open.place = !open.place)} title="Parts from the schematic not on a GA yet: pick one, then click on the sheet" />
        <LabelButton icon="devices" label="Device table…" active={!!open.devices} onclick={() => toggle("devices")} title="Real devices with their sizes, datasheets and pictures" />
      {/if}
    </div>
  </header>
  <main>
    <div class="pane"><Tiles {editor} node={editor.tiles} {sim} insetLeft={browserWidth} window={tileWindow} /></div>
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
          <p>Scroll to zoom, middle-drag or <kbd>Space</kbd>+drag to pan; tap <kbd>Space</kbd> to fit the sheet. <kbd>R</kbd> rotates, <kbd>F</kbd> flips top to bottom. Drag the outline in the overview (top right of the tile you're in) to move about.</p>
          <p><kbd>W</kbd> wire tool: click a terminal, then another; click on a wire to tee into it. <kbd>Esc</kbd> cancels, <kbd>S</kbd> back to select.</p>
          <p><kbd>PgUp</kbd>/<kbd>PgDn</kbd> change sheet. Double-click a contact, coil or link arrow to jump to its partner.</p>
          <p>Split the drawing into tiles from a tile's bar (split right, split down); click a tile to work in it. Drag a window's title bar onto a tile to put it there, and its tile's bar out to float it again.</p>
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
{#snippet windowBody(name: string)}
  {#if name === "distribution"}
    <DistributionDialog {editor} onclose={() => toggle("distribution")} />
  {:else if name === "plant"}
    <PlantDialog {editor} onclose={() => toggle("plant")} onexpectations={() => (open.expectations = true)} />
  {:else if name === "controllers"}
    <ControllersDialog {editor} onclose={() => toggle("controllers")} onexpectations={() => (open.expectations = true)} />
  {:else if name === "expectations"}
    <ExpectationsDialog {editor} onclose={() => toggle("expectations")} />
  {:else if name === "table"}
    <Modal title="Table" store="table" wide onclose={() => toggle("table")}>
      {#if editor.mode === "draft"}<TableView {editor} />{:else}<p class="hint">The table is for Draft.</p>{/if}
    </Modal>
  {:else if name === "checks"}
    <ChecksDialog {editor} onclose={() => toggle("checks")} />
  {:else if name === "templates"}
    <TemplatesDialog {editor} onclose={() => toggle("templates")} />
  {:else if name === "schedules"}
    <SchedulesDialog {editor} onclose={() => toggle("schedules")} />
  {/if}
{/snippet}
{#snippet tileWindow(name: string, tile: string)}
  <Dockable {name} {tile}>{@render windowBody(name)}</Dockable>
{/snippet}
{#each DOCKABLE as name (name)}
  {#if open[name] && !inTile.has(name) && (name !== "table" || editor.mode === "draft")}
    <Dockable {name}>{@render windowBody(name)}</Dockable>
  {/if}
{/each}
{#if docking.hint}
  {@const h = docking.hint}
  <div
    class="dockhint"
    style:left="{h.rect.left + (h.zone === "right" ? h.rect.width / 2 : 0)}px"
    style:top="{h.rect.top + (h.zone === "bottom" ? h.rect.height / 2 : 0)}px"
    style:width="{h.zone === "left" || h.zone === "right" ? h.rect.width / 2 : h.rect.width}px"
    style:height="{h.zone === "top" || h.zone === "bottom" ? h.rect.height / 2 : h.rect.height}px"
  ></div>
{/if}
{#if open.renumber}
  <RenumberDialog {editor} onclose={() => (open.renumber = false)} />
{/if}
{#if open.place && editor.mode === "ga"}
  <PlacePartsDialog {editor} onclose={() => ((open.place = false), (editor.gaPlace = null))} />
{/if}
{#if open.devices}
  <DevicesDialog {editor} onclose={() => (open.devices = false)} />
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
  header :global(button) {
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
  .workbench :global(button) {
    border-radius: 0;
    padding: 4px 12px;
  }
  .workbench :global(button:first-child) {
    border-radius: 4px 0 0 4px;
  }
  .workbench :global(button:last-child) {
    border-radius: 0 4px 4px 0;
  }
  .workbench :global(button + button) {
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
  .dockhint {
    position: fixed;
    background: rgba(30, 110, 230, 0.18);
    border: 2px solid #1e6ee6;
    z-index: 1000;
    pointer-events: none;
  }
  .hint {
    font-size: 12px;
    color: #667;
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
