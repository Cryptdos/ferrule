/**
 * Editor state: the open project, current page, selection, tool, undo
 * history and autosave. All model changes go through `apply`, which calls
 * the core operations, records an undo step and schedules a save.
 */
import type { Project } from "../core/model";
import { OpError } from "../core/ops";
import { routePage } from "../core/routing";
import { routesStale } from "../core/wires";
import { markGaSeen, syncDetailFrames, syncGaStrips } from "../core/ga";
import { refreshConductors } from "../core/conductors";
import { api, ConflictError } from "./api";
import { dropOn, findLeaf, leaves, removeLeaf, setContent, sheetLeaf, splitLeaf, tileId, type DropZone, type TileNode } from "./tiles";
import { getAvoid } from "./avoid";

export type Tool = "select" | "place" | "wire" | "section" | "cloud" | "polygon" | "stamp" | "ga-rail" | "ga-trunking" | "ga-dim" | "ga-label" | "ga-detail";
export type SaveState = "saved" | "pending" | "saving" | "error";

const HISTORY_LIMIT = 200;
const SAVE_DELAY_MS = 600;

export class Editor {
  project: Project = $state()!;
  /** The sheet being worked on: the active sheet tile's (design-v0.3 §7). */
  pageId: string = $state("");
  /** The main area's tiles. Not saved: a project opens with one sheet tile. */
  tiles: TileNode = $state(sheetLeaf(""));
  /** The sheet tile last clicked: the browser, Properties, the sheet list and the tools work on it. */
  activeTile: string = $state("");
  /** Windows open, by name: floating, or in a tile when a tile shows them. */
  open: Record<string, boolean> = $state({});
  /** Selected element ids on the current page. */
  selection: string[] = $state([]);
  /** The selection as a box last picked it: while it's unchanged, it has no first item to align to. */
  boxPicked: string[] = $state([]);
  get pickedByBox(): boolean {
    return this.boxPicked.length > 0 && this.boxPicked.length === this.selection.length && this.boxPicked.every((id, i) => this.selection[i] === id);
  }
  tool: Tool = $state("select");
  /** Workbench (DESIGN.md §9): drafting, or simulating the logic as drawn. */
  /** Workbench: drafting the electrics, annotating, the panel GA, or simulating. */
  mode: "draft" | "annotate" | "ga" | "simulate" = $state("draft");
  placeSymbol: string | null = $state(null);
  /** A section template waiting to be stamped where you click. */
  stamp: { templateId: string; plant: import("../core/templates").PlantMapping; size: [number, number]; name: string } | null =
    $state(null);
  /** Extra settings for the symbol being placed (e.g. which plant item a view shows). */
  placeParams: Record<string, string | number | boolean> = $state({});
  /** The part being placed, turned and flipped with R and F before it's placed (35). */
  placeRot: 0 | 90 | 180 | 270 = $state(0);
  placeFlip: boolean = $state(false);
  /** Colour check: every wire and busbar drawn in its core colour (v0.2.1 note 31). */
  colourCheck: boolean = $state(false);
  saveState: SaveState = $state("saved");
  message: string = $state("");
  /** A schematic device (or terminal strip) being placed on a GA sheet. */
  gaPlace: { refs: string[]; part?: "handle"; modules?: { id: string; w: number; h: number }[]; detail?: string; w: number; h: number; label: string } | null = $state(null);
  /** How the Dimension tool measures: the gaps along a run, or each distance from the first point. */
  gaDimStyle: "chain" | "baseline" = $state("chain");
  /** Sheet settings open in the floating properties box (nothing need be selected). */
  sheetSettings: boolean = $state(false);
  /** An element just jumped to (goTo): ringed until the selection moves on. */
  highlight: string | null = $state(null);
  /** Bumped by goTo so the canvas scrolls the highlighted element into view. */
  focusRequest = $state(0);
  /**
   * Linking a link arrow (Link… in its properties): the next click on an
   * arrow, on any sheet, pairs it with this one; or, for "new", drops a
   * paired destination where you click. Esc cancels.
   */
  linking: { from: string; address: string; mode: "pick" | "new" } | null = $state(null);

  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saving: Promise<void> | null = null;
  canUndo = $state(false);
  canRedo = $state(false);

  /** Version of the project file we last loaded or saved. */
  private version = "";
  private events: EventSource | null = null;
  /** A change seen while a save was in flight, to check once it lands. */
  private remoteSeen: string | null = null;

  constructor(project: Project, version = "") {
    this.project = project;
    this.version = version;
    this.pageId = project.pages[0]?.id ?? "";
    this.tiles = sheetLeaf(this.pageId);
    this.activeTile = this.tiles.id;
    // Wires added outside the editor may not have routes yet.
    for (const page of this.project.pages) {
      if (routesStale(page)) routePage(getAvoid(), page);
    }
    syncGaStrips(this.project);
    this.markSeen();
  }

  /**
   * Looking at a GA sheet: its strips are now as seen, so Check stops
   * reporting their changes. Not an undo step; just saved.
   */
  private markSeen(): void {
    if (markGaSeen(this.page)) this.scheduleSave();
  }

  get page() {
    return this.project.pages.find((p) => p.id === this.pageId) ?? this.project.pages[0]!;
  }

  get selectedElements() {
    const ids = new Set(this.selection);
    return this.page.elements.filter((e) => ids.has(e.id));
  }

  get selectedSections() {
    const ids = new Set(this.selection);
    return this.page.sections.filter((s) => ids.has(s.id));
  }

  /** Revision clouds on this sheet that are selected (the latest revision's are the ones drawn). */
  get selectedClouds() {
    const ids = new Set(this.selection);
    return this.project.revisions.flatMap((r) => r.clouds).filter((c) => c.pageId === this.pageId && ids.has(c.id));
  }

  get selectedSegments() {
    const ids = new Set(this.selection);
    return this.page.segments.filter((s) => ids.has(s.id));
  }

  get pageIndex() {
    return Math.max(0, this.project.pages.findIndex((p) => p.id === this.pageId));
  }

  /** Run a model operation as one undoable step. Returns false if it was refused. */
  /**
   * Run a model operation as one undoable step. Steps with the same `merge`
   * key in a row (a number box being scrolled) make one undo step together.
   */
  apply(fn: (p: Project) => void, opts: { merge?: string } = {}): boolean {
    const before = JSON.stringify($state.snapshot(this.project));
    try {
      fn(this.project);
      // Keep every wire on the current page attached and routed.
      routePage(getAvoid(), this.page);
      refreshConductors(this.project);
      // Placed terminal strips follow the schematic (note 45); detail frames follow their details.
      syncGaStrips(this.project);
      syncDetailFrames(this.project);
    } catch (e) {
      // Roll back anything the operation changed before it failed.
      this.project = JSON.parse(before);
      if (e instanceof OpError) {
        this.flash(e.message);
        return false;
      }
      throw e;
    }
    const merging = !!opts.merge && opts.merge === this.lastMerge && this.undoStack.length > 0;
    if (!merging) this.undoStack.push(before);
    this.lastMerge = opts.merge ?? null;
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
    this.syncHistoryFlags();
    this.scheduleSave();
    return true;
  }

  private lastMerge: string | null = null;

  undo(): void {
    this.lastMerge = null;
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(JSON.stringify($state.snapshot(this.project)));
    this.restore(prev);
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(JSON.stringify($state.snapshot(this.project)));
    this.restore(next);
  }

  private restore(json: string): void {
    this.project = JSON.parse(json);
    if (!this.project.pages.some((p) => p.id === this.pageId)) this.pageId = this.project.pages[0]!.id;
    const ids = new Set([
      ...this.page.elements.map((e) => e.id),
      ...this.page.segments.map((s) => s.id),
      ...this.page.sections.map((s) => s.id),
    ]);
    this.selection = this.selection.filter((id) => ids.has(id));
    this.syncHistoryFlags();
    this.scheduleSave();
  }

  private syncHistoryFlags(): void {
    this.canUndo = this.undoStack.length > 0;
    this.canRedo = this.redoStack.length > 0;
  }

  setPage(id: string): void {
    if (id === this.pageId) return;
    this.pageId = id;
    this.selection = [];
    this.markSeen();
  }

  /** The sheet a tile shows: the active one follows the sheet being worked on. */
  tilePage(tileId: string): string {
    if (tileId === this.activeTile) return this.pageId;
    const leaf = findLeaf(this.tiles, tileId);
    const id = leaf?.content.type === "sheet" ? leaf.content.pageId : "";
    return this.project.pages.some((p) => p.id === id) ? id : (this.project.pages[0]?.id ?? "");
  }

  /** Make a sheet tile the one being worked on. What's picked belongs to the tile it was picked in. */
  activateTile(tileId: string): void {
    if (tileId === this.activeTile) return;
    const leaf = findLeaf(this.tiles, tileId);
    if (!leaf || leaf.content.type !== "sheet") return;
    const target = this.tilePage(tileId);
    // The tile being left keeps the sheet it was showing.
    this.tiles = setContent(this.tiles, this.activeTile, { type: "sheet", pageId: this.pageId });
    this.activeTile = tileId;
    this.selection = [];
    this.setPage(target);
  }

  /** Split a tile: the new half, right of it or below it, shows the same sheet (or the active sheet, for a window). */
  splitTile(tileId: string, dir: "row" | "col"): void {
    const leaf0 = findLeaf(this.tiles, tileId);
    const pageId = tileId === this.activeTile || leaf0?.content.type !== "sheet" ? this.pageId : this.tilePage(tileId);
    const leaf = sheetLeaf(pageId);
    this.tiles = splitLeaf(this.syncedTiles(), tileId, dir, leaf);
  }

  /** Close a tile. The last sheet tile stays. */
  closeTile(tileId: string): void {
    const all = leaves(this.tiles);
    const leaf = all.find((l) => l.id === tileId);
    if (!leaf) return;
    const sheets = all.filter((l) => l.content.type === "sheet");
    if (leaf.content.type === "sheet" && sheets.length <= 1) return;
    this.tiles = removeLeaf(this.syncedTiles(), tileId);
    // Closing a window's tile closes the window.
    if (leaf.content.type === "window") this.open[leaf.content.name] = false;
    if (tileId === this.activeTile) {
      const next = leaves(this.tiles).find((l) => l.content.type === "sheet")!;
      this.activeTile = next.id;
      this.selection = [];
      this.setPage(next.content.type === "sheet" ? next.content.pageId : this.pageId);
    }
  }

  /** The tile a window is in, if it's docked. */
  windowTile(name: string): string | null {
    return leaves(this.tiles).find((l) => l.content.type === "window" && l.content.name === name)?.id ?? null;
  }

  /**
   * Put a window in a tile (design-v0.3 §7): dropped on an edge it splits
   * that tile, in the middle it replaces what's there. The last sheet tile
   * is never replaced: the window goes beside it instead.
   */
  dockWindow(name: string, target: string, zone: DropZone): void {
    let tree = this.syncedTiles();
    const already = this.windowTile(name);
    if (already === target) return;
    if (already) tree = removeLeaf(tree, already);
    const at = findLeaf(tree, target);
    if (!at) return;
    const sheets = leaves(tree).filter((l) => l.content.type === "sheet");
    let z = zone;
    if (z === "middle" && at.content.type === "sheet" && sheets.length <= 1) z = "right";
    // A window replaced by this one closes.
    if (z === "middle" && at.content.type === "window") this.open[at.content.name] = false;
    tree = dropOn(tree, target, z, { kind: "leaf", id: tileId(), content: { type: "window", name } });
    this.tiles = tree;
    this.open[name] = true;
    if (z === "middle" && target === this.activeTile) {
      const next = leaves(tree).find((l) => l.content.type === "sheet")!;
      this.activeTile = next.id;
      this.selection = [];
      this.setPage(next.content.type === "sheet" ? next.content.pageId : this.pageId);
    }
  }

  /** Take a window out of its tile: it floats again. */
  undockWindow(tile: string): void {
    const leaf = findLeaf(this.tiles, tile);
    if (!leaf || leaf.content.type !== "window") return;
    this.tiles = removeLeaf(this.syncedTiles(), tile);
  }

  /** Replace the tree (after a divider drag, a drop…), keeping the active tile's sheet. */
  setTiles(tiles: TileNode): void {
    this.tiles = tiles;
  }

  /** The tree with the active tile's sheet written into it. */
  syncedTiles(): TileNode {
    return setContent(this.tiles, this.activeTile, { type: "sheet", pageId: this.pageId });
  }

  /**
   * Show an element: switch the active tile to its sheet and select it.
   */
  goTo(id: string): void {
    const page = this.project.pages.find(
      (p) => p.elements.some((e) => e.id === id) || p.segments.some((s) => s.id === id) || (p.gaItems ?? []).some((i) => i.id === id),
    );
    if (!page) return;
    this.setPage(page.id);
    this.selection = [id];
    this.tool = "select";
    this.placeSymbol = null;
    // Show where we've landed: the canvas brings it into view and rings it until it's unselected.
    this.highlight = id;
    this.focusRequest++;
  }

  flash(msg: string): void {
    this.message = msg;
    setTimeout(() => {
      if (this.message === msg) this.message = "";
    }, 4000);
  }

  scheduleSave(): void {
    this.saveState = "pending";
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.saveNow(), SAVE_DELAY_MS);
  }

  async saveNow(): Promise<void> {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (this.saving) await this.saving;
    this.saveState = "saving";
    const snapshot = $state.snapshot(this.project) as Project;
    this.saving = api
      .save(snapshot, this.version)
      .then((v) => {
        this.version = v;
        if (this.saveState === "saving") this.saveState = "saved";
      })
      .catch(async (e: Error) => {
        if (e instanceof ConflictError) {
          await this.reloadFromServer(
            "This project was changed elsewhere (e.g. by Claude) while you were editing. It has been reloaded; your last change wasn't saved.",
          );
          return;
        }
        this.saveState = "error";
        this.flash(`Save failed: ${e.message}`);
      })
      .finally(() => {
        this.saving = null;
      });
    await this.saving;
    if (this.remoteSeen && this.remoteSeen !== this.version) {
      this.remoteSeen = null;
      await this.reloadFromServer("Updated with changes made elsewhere.");
    }
    this.remoteSeen = null;
  }

  /** Listen for changes to the project file made by anyone else (MCP, another tab). */
  watch(): void {
    if (this.events || typeof EventSource === "undefined") return;
    this.events = new EventSource(`/api/projects/${encodeURIComponent(this.project.id)}/events`);
    this.events.addEventListener("changed", (ev) => {
      const v = (ev as MessageEvent).data as string;
      if (v === this.version) return;
      if (this.saving) {
        this.remoteSeen = v;
        return;
      }
      // Unsaved local edits will meet the conflict when they save.
      if (this.saveState === "pending") return;
      void this.reloadFromServer("Updated with changes made elsewhere.");
    });
  }

  close(): void {
    this.events?.close();
    this.events = null;
  }

  /** Replace the open project with what's on the server. Undo history is cleared: it no longer applies. */
  async reloadFromServer(message: string): Promise<void> {
    try {
      const { project, version } = await api.load(this.project.id);
      this.project = project;
      this.version = version;
      if (!project.pages.some((p) => p.id === this.pageId)) this.pageId = project.pages[0]!.id;
      const ids = new Set(this.page.elements.map((e) => e.id).concat(this.page.segments.map((s) => s.id)));
      this.selection = this.selection.filter((id) => ids.has(id));
      this.undoStack = [];
      this.redoStack = [];
      this.syncHistoryFlags();
      this.saveState = "saved";
      for (const page of this.project.pages) {
        if (routesStale(page)) routePage(getAvoid(), page);
      }
      this.flash(message);
    } catch (e) {
      this.flash(`Couldn't reload: ${(e as Error).message}`);
    }
  }

  get hasUnsaved(): boolean {
    return this.saveState !== "saved";
  }
}
