/**
 * Editor state: the open project, current page, selection, tool, undo
 * history and autosave. All model changes go through `apply`, which calls
 * the core operations, records an undo step and schedules a save.
 */
import type { Project } from "../core/model";
import { OpError } from "../core/ops";
import { routePage } from "../core/routing";
import { refreshConductors } from "../core/conductors";
import { api } from "./api";
import { getAvoid } from "./avoid";

export type Tool = "select" | "place" | "wire";
export type SaveState = "saved" | "pending" | "saving" | "error";

const HISTORY_LIMIT = 200;
const SAVE_DELAY_MS = 600;

export class Editor {
  project: Project = $state()!;
  pageId: string = $state("");
  /** Selected element ids on the current page. */
  selection: string[] = $state([]);
  tool: Tool = $state("select");
  placeSymbol: string | null = $state(null);
  saveState: SaveState = $state("saved");
  message: string = $state("");

  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saving: Promise<void> | null = null;
  canUndo = $state(false);
  canRedo = $state(false);

  constructor(project: Project) {
    this.project = project;
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
    const ids = new Set([...this.page.elements.map((e) => e.id), ...this.page.segments.map((s) => s.id)]);
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
      .save(snapshot)
      .then(() => {
        if (this.saveState === "saving") this.saveState = "saved";
      })
      .catch((e: Error) => {
        this.saveState = "error";
        this.flash(`Save failed: ${e.message}`);
      })
      .finally(() => {
        this.saving = null;
      });
    await this.saving;
  }

  get hasUnsaved(): boolean {
    return this.saveState !== "saved";
  }
}
