/**
 * Editor state: the open project, current page, selection, tool, undo
 * history and autosave. All model changes go through `apply`, which calls
 * the core operations, records an undo step and schedules a save.
 */
import type { Project } from "../core/model";
import { OpError } from "../core/ops";
import { routePage } from "../core/routing";
import { refreshConductors } from "../core/conductors";
import { api, ConflictError } from "./api";
import { getAvoid } from "./avoid";

export type Tool = "select" | "place" | "wire" | "section" | "cloud" | "stamp";
export type SaveState = "saved" | "pending" | "saving" | "error";

const HISTORY_LIMIT = 200;
const SAVE_DELAY_MS = 600;

export class Editor {
  project: Project = $state()!;
  pageId: string = $state("");
  /** Sheet shown in the other half of the split view, or null when it's closed. */
  splitPageId: string | null = $state(null);
  /** Selected element ids on the current page. */
  selection: string[] = $state([]);
  tool: Tool = $state("select");
  /** Workbench (DESIGN.md §9): drafting, or simulating the logic as drawn. */
  mode: "draft" | "simulate" = $state("draft");
  placeSymbol: string | null = $state(null);
  /** A section template waiting to be stamped where you click. */
  stamp: { templateId: string; plant: import("../core/templates").PlantMapping; size: [number, number]; name: string } | null =
    $state(null);
  /** Extra settings for the symbol being placed (e.g. which plant item a view shows). */
  placeParams: Record<string, string | number | boolean> = $state({});
  saveState: SaveState = $state("saved");
  message: string = $state("");

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
    // Wires added outside the editor may not have routes yet.
    for (const page of this.project.pages) {
      if (page.segments.some((s) => s.points.length < 2)) routePage(getAvoid(), page);
    }
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

  get selectedSegments() {
    const ids = new Set(this.selection);
    return this.page.segments.filter((s) => ids.has(s.id));
  }

  get pageIndex() {
    return Math.max(0, this.project.pages.findIndex((p) => p.id === this.pageId));
  }

  /** Run a model operation as one undoable step. Returns false if it was refused. */
  apply(fn: (p: Project) => void): boolean {
    const before = JSON.stringify($state.snapshot(this.project));
    try {
      fn(this.project);
      // Keep every wire on the current page attached and routed.
      routePage(getAvoid(), this.page);
      refreshConductors(this.project);
    } catch (e) {
      // Roll back anything the operation changed before it failed.
      this.project = JSON.parse(before);
      if (e instanceof OpError) {
        this.flash(e.message);
        return false;
      }
      throw e;
    }
    this.undoStack.push(before);
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
    this.syncHistoryFlags();
    this.scheduleSave();
    return true;
  }

  undo(): void {
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
    if (this.splitPageId && !this.project.pages.some((p) => p.id === this.splitPageId)) this.splitPageId = null;
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
  }

  /** Swap the two halves of the split view. */
  swapSplit(): void {
    if (!this.splitPageId) return;
    const other = this.splitPageId;
    this.splitPageId = this.pageId;
    this.setPage(other);
  }

  /**
   * Show an element: switch to its sheet and select it. With the split view
   * open, the sheet you came from stays in view in the other half.
   */
  goTo(id: string): void {
    const page = this.project.pages.find((p) => p.elements.some((e) => e.id === id) || p.segments.some((s) => s.id === id));
    if (!page) return;
    if (this.splitPageId && page.id !== this.pageId) this.splitPageId = this.pageId;
    this.setPage(page.id);
    this.selection = [id];
    this.tool = "select";
    this.placeSymbol = null;
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
      if (this.splitPageId && !project.pages.some((p) => p.id === this.splitPageId)) this.splitPageId = null;
      const ids = new Set(this.page.elements.map((e) => e.id).concat(this.page.segments.map((s) => s.id)));
      this.selection = this.selection.filter((id) => ids.has(id));
      this.undoStack = [];
      this.redoStack = [];
      this.syncHistoryFlags();
      this.saveState = "saved";
      for (const page of this.project.pages) {
        if (page.segments.some((s) => s.points.length < 2)) routePage(getAvoid(), page);
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
