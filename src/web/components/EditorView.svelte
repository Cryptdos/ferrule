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
  import { benchOf, canRotate, nextRotation } from "../../core/symbols";
  import { api, ApiError } from "../api";
  import FileBrowser from "./FileBrowser.svelte";
  import Browser from "./Browser.svelte";
  import FloatBox from "./FloatBox.svelte";
  import Icon from "./Icon.svelte";
  import LabelButton from "./LabelButton.svelte";
  import SheetProps from "./SheetProps.svelte";
  import LibraryDialog from "./LibraryDialog.svelte";
  import GaProps from "./GaProps.svelte";
  import PlacePartsDialog from "./PlacePartsDialog.svelte";
  import { addProjectDevice, deleteGaItems, moveGaItems, rotateGaItems, setDevices } from "../../core/ops";
  import { deviceRows, deviceSuits, newDeviceFor } from "../../core/devicerows";
  import { alignElements, alignGaItems, distributeElements, distributeGaItems, type AlignHow, type DistributeHow } from "../../core/align";
  import { isTyping } from "../typing";
  import type { Editor } from "../editor.svelte";
  import Props from "./Props.svelte";
  import ProjectDialog from "./ProjectDialog.svelte";
  import PlantDialog from "./PlantDialog.svelte";
  import TerminalsDialog from "./TerminalsDialog.svelte";
  import AddModuleMenu from "./AddModuleMenu.svelte";
  import DistributionDialog from "./DistributionDialog.svelte";
  import ExpectationsDialog from "./ExpectationsDialog.svelte";
  import ChecksDialog from "./ChecksDialog.svelte";
  import RenumberDialog from "./RenumberDialog.svelte";
  import SchedulesDialog from "./SchedulesDialog.svelte";
  import StampLinks from "./StampLinks.svelte";
  import TableView from "./TableView.svelte";
  import DesignView from "./DesignView.svelte";
  import DuplicateDialog from "./DuplicateDialog.svelte";
  import DesignTemplatesDialog from "./DesignTemplatesDialog.svelte";
  import SuggestDialog from "./SuggestDialog.svelte";
  import { addDesignPlant, addDesignPoint, addSystem, allocate } from "../../core/design";
  import { addNetwork, placeNetworkSheet } from "../../core/network";
  import { POINTS_COLS, pointsSchedule, toCsv } from "../../core/schedules";
  import Tiles from "./Tiles.svelte";
  import { canvases } from "../canvases";
  import Dockable from "./Dockable.svelte";
  import { docking, DOCKABLE } from "../docking.svelte";
  import { leaves } from "../tiles";
  import TemplatesDialog from "./TemplatesDialog.svelte";
  import SimPanel from "./SimPanel.svelte";
  import SettingsDialog from "./SettingsDialog.svelte";
  import HelpDialog from "./HelpDialog.svelte";
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
  /** Open windows: they don't block the drawing, and several can be open at once. */
  type DialogName = "expectations" | "plant" | "terminals" | "table" | "distribution" | "checks" | "schedules" | "templates" | "renumber" | "library" | "settings" | "place" | "project" | "help";
  const open: Partial<Record<DialogName, boolean>> = editor.open;
  /** Windows in tiles (design-v0.3 §7), and where a dragged window would go. */
  const inTile = $derived(new Set(leaves(editor.tiles).flatMap((l) => (l.content.type === "window" ? [l.content.name] : []))));
  docking.dock = (name, tile, zone) => editor.dockWindow(name, tile, zone);
  /** Export PDF failed: what went wrong, with the Print way round it. */
  let pdfError = $state("");
  let browserWidth = $state(0);
  const gaSelected = $derived((editor.gaSelectionPage.gaItems ?? []).some((i) => editor.selection.includes(i.id)));

  function closeProps() {
    editor.selection = [];
    editor.sheetSettings = false;
  }
  // Picking something shows its properties in place of the sheet's.
  $effect(() => {
    if (editor.selection.length) editor.sheetSettings = false;
  });
  let sim: Simulator | null = $state(null);

  function setMode(mode: "design" | "draft" | "annotate" | "ga" | "simulate") {
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
  // Place parts… has nothing to place onto off a GA sheet: it closes when the sheet in view stops being one (A59).
  $effect(() => {
    if (open.place && !editor.page.ga) {
      const tile = editor.windowTile("place");
      if (tile) editor.closeTile(tile);
      open.place = false;
      editor.gaPlace = null;
    }
  });

  // A GA sheet is laid out in the Layout workbench, a schematic sheet drafted:
  // moving between them takes you to the right one (Annotate and Simulate stay).
  // A spare sheet holds annotations only. Each is greyed out where it can't work (A35).
  $effect(() => {
    const isGa = !!editor.page.ga;
    if (editor.mode === "design") return;
    if (isGa && editor.mode === "draft") setMode("ga");
    else if (editor.page.spare && (editor.mode === "draft" || editor.mode === "ga")) setMode("annotate");
    else if (!isGa && editor.mode === "ga") setMode("draft");
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

  /** + System: a new system, picked so it can be named at once. */
  function newSystem() {
    let name = "";
    if (editor.apply((p) => (name = addSystem(p)))) editor.designPick = { plant: [], system: name };
  }
  /** + Plant: an empty row in the picked system, after the picked plant if there is one. */
  function newPlant() {
    const pick = editor.designPick;
    const after = pick.plant[pick.plant.length - 1];
    const sys = pick.system ?? editor.project.plant.find((p) => p.id === after)?.system ?? "";
    let id = "";
    if (editor.apply((p) => (id = addDesignPlant(p, sys, after).id))) {
      editor.designPick = { plant: [id] };
      editor.designFolded = editor.designFolded.filter((n) => n !== sys);
    }
  }

  /** + Point (A69): an empty point under the picked plant, picked and ready to fill in from Properties. No prompt. */
  function newPoint() {
    const id = editor.designPick.plant[0];
    if (!id) return;
    let name = "";
    if (editor.apply((p) => (name = addDesignPoint(p, id).name))) editor.designPick = { plant: [id], point: name };
  }

  /**
   * + Device (A70): a device made in this project, suiting the picked row and
   * sized as it is now; a picked row with no device is given it.
   */
  function newDevice() {
    const key = editor.designPick.row;
    let id = "";
    let given = false;
    const ok = editor.apply((p) => {
      const was = key ? deviceRows(p).find((r) => r.key === key) : undefined;
      const d = addProjectDevice(p, { name: "New device", maker: "", part: "", d: 0, ...newDeviceFor(p, key) });
      id = d.id;
      if (key && was && !was.device) {
        setDevices(p, [key], d.id);
        given = true;
      }
    });
    if (!ok) return;
    editor.designPick = given && key ? { plant: [], row: key } : { plant: [], device: id };
  }
  /** The devices that suit every ticked row, for Set picked to…. */
  const tickedRows = $derived(editor.mode === "design" && editor.designView === "devices" ? deviceRows(editor.project).filter((r) => editor.deviceTicks.includes(r.key)) : []);
  const forTicked = $derived((editor.project.devices ?? []).filter((d) => tickedRows.length && tickedRows.every((r) => deviceSuits(d, r))).sort((a, b) => a.name.localeCompare(b.name)));
  function setTicked(value: string) {
    if (!value) return;
    const keys = tickedRows.map((r) => r.key);
    editor.apply((p) => setDevices(p, keys, value === "-" ? null : value));
  }

  /** The point picked in Design, when it's on a channel. */
  const pickedAllocated = $derived.by(() => {
    const pk = editor.designPick;
    if (pk.plant.length !== 1 || !pk.point) return false;
    return !!editor.project.plant.find((p) => p.id === pk.plant[0])?.points?.find((q) => q.name === pk.point)?.channel;
  });
  function unallocate() {
    const pk = editor.designPick;
    const plant = pk.plant[0];
    const point = pk.point;
    if (plant && point) editor.apply((p) => allocate(p, plant, point, null));
  }

  /** Place as sheet: the network diagram on a sheet of its own, shown in Annotate. */
  function placeNetwork() {
    const existing = editor.project.pages.find((pg) => pg.elements.some((e) => e.symbol === "netmap"));
    if (existing && !confirm(`Sheet ${existing.number} already has the network on it. Add another sheet with it?`)) return;
    let id = "";
    if (!editor.apply((p) => (id = placeNetworkSheet(p).id))) return;
    setMode("annotate");
    editor.setPage(id);
    editor.flash("The network is on its own sheet: it's redrawn as Design's networks change");
  }

  /** The points schedule (design-v0.4 §9): Design's table as CSV, by system. */
  function exportPoints() {
    const rows = pointsSchedule($state.snapshot(editor.project) as typeof editor.project);
    const text = toCsv(rows, POINTS_COLS);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    a.download = `${editor.project.project.drawingNo || editor.project.id} points schedule.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    editor.flash(`Points schedule: ${rows.length} row${rows.length === 1 ? "" : "s"}`);
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
    // Design: a table, not a sheet. Undo, redo and save; Esc lets go of what's picked.
    if (editor.mode === "design") {
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
      } else if (e.key === "Escape") {
        if (closeTopmost()) return;
        editor.designPick = { plant: [] };
      }
      return;
    }
    // GA: move, turn and delete layout items.
    if (editor.mode === "ga") {
      // Items picked through a frame on a detail sheet are on the sheet it shows (design-v0.3 §6).
      const gaPage = editor.gaSelectionPage;
      const gaIds = (gaPage.gaItems ?? []).filter((i) => editor.selection.includes(i.id)).map((i) => i.id);
      if (ctrl && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) editor.redo();
        else editor.undo();
      } else if (ctrl && e.key.toLowerCase() === "y") {
        e.preventDefault();
        editor.redo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && gaIds.length) {
        e.preventDefault();
        editor.apply((p) => deleteGaItems(p, gaPage.id, gaIds));
        editor.selection = [];
      } else if ((e.key === "r" || e.key === "R") && gaIds.length) {
        editor.apply((p) => rotateGaItems(p, gaPage.id, gaIds));
      } else if (e.key.startsWith("Arrow") && gaIds.length) {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 5;
        const d: [number, number] =
          e.key === "ArrowLeft" ? [-step, 0] : e.key === "ArrowRight" ? [step, 0] : e.key === "ArrowUp" ? [0, -step] : [0, step];
        editor.apply((p) => moveGaItems(p, gaPage.id, gaIds, d));
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
      // Turn the part before it's placed (35), if it turns at all (A39).
      if (canRotate({ symbol: editor.placeSymbol })) editor.placeRot = nextRotation(editor.placeSymbol, editor.placeRot);
      else editor.flash("This part doesn't turn: F flips it");
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
    if (editor.mode === "simulate" || editor.mode === "ga" || editor.mode === "design" || isTyping(e.target) || inWindow(e.target) || open.project) return;
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
        <LabelButton icon="design" label="Design" active={editor.mode === "design"} onclick={() => setMode("design")}
          title="What the panel has: systems, plant and points, the controller. Nothing is drawn here" />
        <LabelButton icon="draft" label="Draft" active={editor.mode === "draft"} onclick={() => setMode("draft")} disabled={!!editor.page.spare || !!editor.page.ga}
          title={editor.page.spare ? "This is a spare sheet: annotations only" : editor.page.ga ? "This is a GA sheet: it's laid out in Layout" : "The electrical drawing: parts, wires, rails, plant"} />
        <LabelButton icon="annotate" label="Annotate" active={editor.mode === "annotate"} onclick={() => setMode("annotate")}
          title="Text, boxes, label plates, sections, revision clouds and pictures" />
        <LabelButton icon="ga" label="Layout" active={editor.mode === "ga"} onclick={() => setMode("ga")} disabled={!editor.page.ga}
          title={editor.page.spare ? "This is a spare sheet: annotations only" : !editor.page.ga ? "Layout works on GA sheets: add one from ▾ beside + in Sheets" : "General arrangement: the panel laid out at true scale"} />
        <LabelButton icon="simulate" label="Simulate" active={editor.mode === "simulate"} onclick={() => setMode("simulate")}
          title="Try the logic as drawn" />
      </div>
      <span class="grow"></span>
      <div class="group">
        <LabelButton icon="project" label="Project…" onclick={() => toggle("project")} title="Project details, logo and revisions (title block)" />
        <button class="icon" onclick={() => (savingAs = true)} title="Save as… (a copy of this project, to a file anywhere)"><Icon name="saveAs" /></button>
        <button class="icon" onclick={exportPdf} disabled={exporting} title={exporting ? "Exporting…" : "Export PDF: every sheet as an A4 PDF"}><Icon name="pdf" /></button>
        <button class="icon" onclick={print} title="Print (opens the print view)"><Icon name="print" /></button>
        <span class="sep"></span>
        <button class="icon" class:active={!!open.help} onclick={() => toggle("help")} title="Keyboard and mouse help"><Icon name="help" /></button>
        <button class="icon" class:active={!!open.settings} onclick={() => toggle("settings")} title="Settings, and Status: Claude's connection, Quit Ferrule"><Icon name="gear" /></button>
      </div>
      <span class="status" class:error={editor.saveState === "error"}>{saveText}</span>
    </div>
    <div class="row two">
      <!-- The same order on every workbench (v0.5 A34): undo and redo | Fit and Split | align and distribute | Select | the workbench's own. -->
      {#if editor.mode !== "simulate"}
        <button class="icon" disabled={!editor.canUndo} onclick={() => editor.undo()} title="Undo (Ctrl+Z)"><Icon name="undo" /></button>
        <button class="icon" disabled={!editor.canRedo} onclick={() => editor.redo()} title="Redo (Ctrl+Y)"><Icon name="redo" /></button>
        <span class="sep"></span>
      {/if}
      {#if editor.mode === "design"}
        <div class="workbench" role="group" aria-label="Design view">
          <button class:active={editor.designView === "plant"} onclick={() => (editor.designView = "plant")} title="Systems, plant and points">Plant</button>
          <button class:active={editor.designView === "controller"} onclick={() => (editor.designView = "controller")} title="The panel's controller: its modules, their channels, and the points on them">Controller</button>
          <button class:active={editor.designView === "devices"} onclick={() => (editor.designView = "devices")} title="Every drawn part, terminal strip, module and plant item, each with the real device it is">Devices</button>
          <button class:active={editor.designView === "network"} onclick={() => (editor.designView = "network")} title="Comms plant by network: a LAN off a switch, or a bus off the controller">Network</button>
          <button class:active={editor.designView === "todraw"} onclick={() => (editor.designView = "todraw")} title="What Design has that isn't on a sheet yet: place it from here">To draw</button>
        </div>
        <LabelButton icon="check" label="Check" active={!!open.checks} onclick={() => toggle("checks")} title="Check the design and the drawing: points with no channel, plant not drawn, points not wired to their channel" />
        <LabelButton icon="schedules" label="Export points schedule" onclick={exportPoints} title="Every point, by system, with its channel and how it's wired, as a CSV for a spreadsheet" />
        <span class="sep"></span>
        {#if editor.designView === "network"}
          <button class="primary" onclick={placeNetwork} title="The network as a sheet at the end of the set, redrawn from the data as networks change">Place as sheet</button>
          <button onclick={() => editor.apply((p) => void addNetwork(p, "lan"))} title="A network comms plant can be on: a LAN off a switch, or a bus off the controller">+ Network</button>
        {:else if editor.designView === "todraw"}
          <span class="hint">Pick a line and place it: Draft opens with it ready to drop on the sheet.</span>
        {:else if editor.designView === "devices"}
          <button onclick={newDevice} title={editor.designPick.row ? "A device for the picked row, made in this project: edit it in Properties" : "A device made in this project: edit it in Properties"}>+ Device</button>
          <button class:active={!!open.library} onclick={() => toggle("library")} title="Bring a device in from the shared library, with its datasheets and pictures">From the library…</button>
          <span class="sep"></span>
          <select class="setpicked" value="" disabled={!tickedRows.length} onchange={(e) => {
            setTicked(e.currentTarget.value);
            e.currentTarget.value = "";
          }} title={tickedRows.length ? "Give every ticked row the same device" : "Tick rows, or a whole group, first"}>
            <option value="">{tickedRows.length ? `Set ${tickedRows.length} picked to…` : "Set picked to…"}</option>
            {#each forTicked as d (d.id)}<option value={d.id}>{d.name}</option>{/each}
            <option value="-">No device</option>
          </select>
        {:else if editor.designView === "controller"}
          <AddModuleMenu {editor} />
          <button disabled={!pickedAllocated} onclick={unallocate} title={pickedAllocated ? "Take the picked point off its channel" : "Pick an allocated point first"}>Unallocate</button>
          <span class="sep"></span>
          <button class:active={!!editor.open.designSuggest} disabled={!editor.project.controllers?.length} onclick={() => (editor.open.designSuggest = !editor.open.designSuggest)} title="Propose channels for the points still to allocate: accept, change or throw away. Nothing is allocated until you accept">Suggest…</button>
        {:else}
        <button onclick={newSystem} title="A name that groups plant: Chilled water, Ventilation">+ System</button>
        <button onclick={newPlant} title="An empty plant row, in the picked system (or the picked plant's)">+ Plant</button>
        <button onclick={newPoint} disabled={editor.designPick.plant.length !== 1} title={editor.designPick.plant.length === 1 ? "An empty point on the picked plant, picked to fill in here" : "Pick one plant row first"}>+ Point</button>
        <span class="sep"></span>
        <button class:active={!!editor.open.designDuplicate} disabled={!editor.designPick.plant.length} onclick={() => (editor.open.designDuplicate = !editor.open.designDuplicate)} title={editor.designPick.plant.length ? "Copy the picked rows n times, tags stepping on" : "Pick plant rows first (Ctrl+click for a group)"}>Duplicate ×n…</button>
        <button class:active={!!editor.open.designTemplates} onclick={() => (editor.open.designTemplates = !editor.open.designTemplates)} title="Your Design templates: insert one, or save the picked rows as one">Templates…</button>
        {/if}
      {:else}
      <button class="icon" onclick={() => canvas?.fit()} title="Fit sheet (tap Space)"><Icon name="fit" /></button>
      <button class="icon" onclick={split} title="Split: the active tile in two, side by side, both showing its sheet. Each tile has its own bar to split right or down and to close"><Icon name="split" /></button>
      {#if editor.mode === "draft"}
        <button class="icon" class:active={editor.colourCheck} onclick={() => (editor.colourCheck = !editor.colourCheck)}
          title="Colour check: every wire and busbar in its core colour (grey dashes: no colour set). Print and PDF stay black"><Icon name="colours" /></button>
      {/if}
      {/if}
      {#if editor.mode !== "simulate" && editor.mode !== "design"}
        <!-- Align and distribute (design-v0.3 §5): always icons, the name on hover. -->
        <span class="sep"></span>
        {#each ALIGN as a (a.how)}
          <button class="icon" disabled={!alignable.length} onclick={() => align(a.how)} title="{a.name}: {alignHint}"><Icon name={a.icon} /></button>
        {/each}
        <button class="icon" disabled={alignable.length < 3} onclick={() => distribute("across")} title="Distribute across: equal gaps between them, the outer two staying put (three or more)"><Icon name="distributeAcross" /></button>
        <button class="icon" disabled={alignable.length < 3} onclick={() => distribute("down")} title="Distribute down: equal gaps between them, the outer two staying put (three or more)"><Icon name="distributeDown" /></button>
      {/if}
      {#if editor.mode !== "simulate" && editor.mode !== "design"}
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
        <LabelButton icon="expectations" label="Expectations…" active={!!open.expectations} onclick={() => toggle("expectations")} title="What the drawing should do: checked live, and by Check logic" />
      {:else if editor.mode === "draft"}
        <span class="sep"></span>
        <!-- The menus the workbenches share come first in their own group (D8): Check, Expectations…, Schedules. -->
        <LabelButton icon="check" label="Check" active={!!open.checks} onclick={() => toggle("checks")} title="Check the drawing for problems" />
        <LabelButton icon="expectations" label="Expectations…" active={!!open.expectations} onclick={() => toggle("expectations")} title="What the drawing should do: checked live in Simulate, and by Check logic" />
        <LabelButton icon="schedules" label="Schedules" active={!!open.schedules} onclick={() => toggle("schedules")} title="Terminal, cable and IO schedules" />
        <LabelButton icon="renumber" label="Renumber" active={!!open.renumber} onclick={() => toggle("renumber")} title="See what Renumber would change to tags, terminal and wire numbers, then apply" />
        <LabelButton icon="templates" label="Templates" active={!!open.templates} onclick={() => toggle("templates")} title="Save and stamp sheet and section templates" />
        <LabelButton icon="plant" label="Plant" active={!!open.plant} onclick={() => toggle("plant")} title="Field equipment: define plant and place views" />
        <LabelButton icon="distribution" label="Distribution" active={!!open.distribution} onclick={() => toggle("distribution")} title="The supplies blocks and rails pick from" />
        <LabelButton icon="table" label="Table" active={!!open.table} onclick={() => toggle("table")} title="Table: every element in the project, to filter, edit and find-and-replace" />
      {:else if editor.mode === "ga"}
        <span class="sep"></span>
        <LabelButton icon="check" label="Check" active={!!open.checks} onclick={() => toggle("checks")} title="Check the drawing for problems, with how full each DIN rail is" />
        <LabelButton icon="schedules" label="Schedules" active={!!open.schedules} onclick={() => toggle("schedules")} title="Terminal and cable schedules, and the bill of materials" />
        <LabelButton icon="place" label={editor.page.ga?.view === "detail" ? "Place detail…" : "Place parts…"} active={!!open.place} onclick={() => toggle("place")} title="Parts from the schematic not on a GA yet: pick one, then click on the sheet" />
      {/if}
    </div>
  </header>
  <main>
    {#if editor.mode === "design"}
      <div class="pane"><DesignView {editor} /></div>
    {:else}
      <div class="pane"><Tiles {editor} node={editor.tiles} {sim} insetLeft={browserWidth} window={tileWindow} /></div>
      <Browser {editor} bind:width={browserWidth} onplace={() => (open.place = true)} />
    {/if}
    {#if editor.mode === "design"}
      <!-- Design has its own Properties beside its table. -->
    {:else if sim}
      <FloatBox title="Simulation" store="sim"><SimPanel {editor} {sim} onexpectations={() => (open.expectations = true)} /></FloatBox>
    {:else if editor.mode === "ga"}
      {#if gaSelected || editor.sheetSettings}
        <FloatBox title={gaSelected ? "Properties" : "Sheet"} store="props" onclose={closeProps}>
          {#if editor.sheetSettings && !gaSelected}<SheetProps {editor} />{/if}
          <GaProps {editor} />
        </FloatBox>
      {/if}
    {:else if editor.selection.length || editor.sheetSettings}
      <FloatBox title={editor.selection.length ? "Properties" : "Sheet"} store="props" onclose={closeProps}>
        {#if editor.selection.length}<Props {editor} />{:else}<SheetProps {editor} />{/if}
      </FloatBox>
    {/if}
    {#if editor.mode === "design" && editor.open.designDuplicate}
      <DuplicateDialog {editor} onclose={() => (editor.open.designDuplicate = false)} />
    {/if}
    {#if editor.mode === "design" && editor.open.designSuggest}
      <SuggestDialog {editor} onclose={() => (editor.open.designSuggest = false)} />
    {/if}
    {#if editor.mode === "design" && editor.open.designTemplates}
      <DesignTemplatesDialog {editor} onclose={() => (editor.open.designTemplates = false)} />
    {/if}
    {#if editor.linking}
      <div class="linkbar">
        Linking from {editor.linking.address}: click the link end to link to, or bare paper to carry the wire on there, on
        any sheet.
        Esc cancels.
        <button onclick={() => (editor.linking = null)}>Cancel</button>
      </div>
    {/if}
    {#if editor.message}<div class="toast">{editor.message}</div>{/if}
    {#if editor.stampLinks}<StampLinks {editor} />{/if}
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
    <PlantDialog {editor} onclose={() => toggle("plant")} />
  {:else if name === "terminals"}
    <TerminalsDialog {editor} onclose={() => toggle("terminals")} />
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
  {:else if name === "place"}
    <PlacePartsDialog {editor} onclose={() => (toggle("place"), (editor.gaPlace = null))} />
  {:else if name === "project"}
    <ProjectDialog {editor} onclose={() => toggle("project")} />
  {:else if name === "settings"}
    <SettingsDialog onclose={() => toggle("settings")} />
  {:else if name === "help"}
    <HelpDialog onclose={() => toggle("help")} />
  {/if}
{/snippet}
{#snippet tileWindow(name: string, tile: string)}
  <Dockable {name} {tile}>{@render windowBody(name)}</Dockable>
{/snippet}
{#each DOCKABLE as name (name)}
  {#if open[name] && !inTile.has(name) && (name !== "table" || editor.mode === "draft") && (name !== "place" || editor.mode === "ga")}
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
{#if open.library}
  <LibraryDialog {editor} onclose={() => (open.library = false)} />
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
  button.primary {
    background: #1e6ee6;
    border-color: #1e6ee6;
    color: #fff;
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
