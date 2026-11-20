/**
 * Project storage: one JSON file per project in a folder (DESIGN.md §4).
 * Writes go to a temporary file first and are then renamed into place, and
 * the previous version is kept as `.bak`, so a crash mid-save can't lose a
 * drawing.
 */
import { mkdir, readdir, readFile, rename, stat, writeFile, copyFile } from "node:fs/promises";
import { existsSync, statSync, watch, type FSWatcher } from "node:fs";
import { join } from "node:path";
import { type Project, newProject } from "../core/model";
import { parseProject, parseTemplate, ProjectFormatError } from "../core/validate";
import type { Template } from "../core/model";

const EXT = ".ferrule.json";
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export class StorageError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 = 400,
  ) {
    super(message);
  }
}

export interface ProjectSummary {
  id: string;
  title: string;
  pages: number;
  modified: string;
}

export function slugify(title: string): string {
  const s = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return s || "project";
}

export class Storage {
  private listeners = new Map<string, Set<(version: string) => void>>();
  private watcher: FSWatcher | null = null;
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Serialises read-modify-write edits per project (MCP tools). */
  private locks = new Map<string, Promise<unknown>>();

  constructor(readonly dir: string) {}

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  /** A project's version: changes every time its file is written, by anyone. */
  version(id: string): string {
    const file = this.path(id);
    if (!existsSync(file)) throw new StorageError(`No project "${id}"`, 404);
    return String(Math.round(statSync(file).mtimeMs * 1000));
  }

  /**
   * Hear about changes to a project's file, whoever made them (this server,
   * MCP over stdio in another process, a sync tool). Returns an unsubscribe.
   */
  subscribe(id: string, fn: (version: string) => void): () => void {
    this.path(id);
    this.startWatching();
    if (!this.listeners.has(id)) this.listeners.set(id, new Set());
    this.listeners.get(id)!.add(fn);
    return () => this.listeners.get(id)?.delete(fn);
  }

  private startWatching(): void {
    if (this.watcher) return;
    try {
      this.watcher = watch(this.dir, (_event, name) => {
        if (!name || !String(name).endsWith(EXT)) return;
        const id = String(name).slice(0, -EXT.length);
        const subs = this.listeners.get(id);
        if (!subs?.size) return;
        clearTimeout(this.timers.get(id));
        this.timers.set(
          id,
          setTimeout(() => {
            let v: string;
            try {
              v = this.version(id);
            } catch {
              return;
            }
            for (const fn of subs) fn(v);
          }, 120),
        );
      });
    } catch (e) {
      console.error("Can't watch the projects folder; live updates are off", e);
    }
  }

  close(): void {
    this.watcher?.close();
    this.watcher = null;
  }

  /** Load, change and save a project, one edit at a time. */
  async edit<T>(id: string, fn: (p: Project) => T | Promise<T>): Promise<T> {
    const prev = this.locks.get(id) ?? Promise.resolve();
    const run = prev.catch(() => {}).then(async () => {
      const project = await this.load(id);
      const out = await fn(project);
      await this.save(id, project);
      return out;
    });
    this.locks.set(id, run);
    return run;
  }

  private path(id: string): string {
    if (!ID_RE.test(id)) throw new StorageError(`Invalid project id "${id}"`);
    return join(this.dir, id + EXT);
  }

  async list(): Promise<ProjectSummary[]> {
    const names = (await readdir(this.dir)).filter((n) => n.endsWith(EXT));
    const out: ProjectSummary[] = [];
    for (const name of names) {
      const id = name.slice(0, -EXT.length);
      try {
        const p = await this.load(id);
        const st = await stat(this.path(id));
        out.push({ id, title: p.project.title, pages: p.pages.length, modified: st.mtime.toISOString() });
      } catch {
        // Skip files we can't read; they stay on disk untouched.
      }
    }
    return out.sort((a, b) => b.modified.localeCompare(a.modified));
  }

  async load(id: string): Promise<Project> {
    const file = this.path(id);
    if (!existsSync(file)) throw new StorageError(`No project "${id}"`, 404);
    const project = parseProject(JSON.parse(await readFile(file, "utf8")));
    project.id = id;
    return project;
  }

  /**
   * Save a project. With `ifVersion`, refuse (409) if the file has changed
   * since that version was loaded, so one editor can't silently overwrite
   * another's work.
   */
  async save(id: string, data: unknown, ifVersion?: string): Promise<Project> {
    const project = parseProject(data);
    if (project.id !== id) throw new StorageError("Project id does not match the URL");
    const file = this.path(id);
    if (ifVersion && existsSync(file) && this.version(id) !== ifVersion) {
      throw new StorageError("This project was changed elsewhere since you opened it", 409);
    }
    if (existsSync(file)) await copyFile(file, file + ".bak");
    const tmp = file + ".tmp";
    await writeFile(tmp, JSON.stringify(project, null, 1));
    await rename(tmp, file);
    return project;
  }

  async create(title: string): Promise<Project> {
    const base = slugify(title);
    let id = base;
    for (let i = 2; existsSync(this.path(id)); i++) id = `${base}-${i}`;
    const project = newProject(id, title.trim() || "Untitled project");
    return this.save(id, project);
  }
}

const TEMPLATE_EXT = ".ferrule-template.json";

export interface LibraryEntry {
  file: string;
  name: string;
  kind: Template["kind"];
  plant: string[];
}

/**
 * The shared template library: one file per template in a folder (by
 * default "library" next to the program). Projects import copies.
 */
export class Library {
  constructor(readonly dir: string) {}

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  private path(file: string): string {
    if (!ID_RE.test(file)) throw new StorageError(`Invalid template name "${file}"`);
    return join(this.dir, file + TEMPLATE_EXT);
  }

  async list(): Promise<LibraryEntry[]> {
    await this.init();
    const out: LibraryEntry[] = [];
    for (const name of (await readdir(this.dir)).filter((n) => n.endsWith(TEMPLATE_EXT))) {
      const file = name.slice(0, -TEMPLATE_EXT.length);
      try {
        const t = await this.load(file);
        out.push({ file, name: t.name, kind: t.kind, plant: t.plant.map((p) => p.tag) });
      } catch {
        // Unreadable files are left alone.
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  async load(file: string): Promise<Template> {
    const path = this.path(file);
    if (!existsSync(path)) throw new StorageError(`No template "${file}" in the library`, 404);
    const data = JSON.parse(await readFile(path, "utf8"));
    if (data?.format !== "ferrule-template" || typeof data.template !== "object") {
      throw new ProjectFormatError("Not a Ferrule template file");
    }
    return parseTemplate(data.template);
  }

  /** Save a template; returns the file name used. An existing file of the same name is replaced. */
  async save(template: unknown): Promise<string> {
    if (typeof template !== "object" || template === null) throw new ProjectFormatError("No template given");
    const t = parseTemplate(template as Record<string, unknown>);
    await this.init();
    const file = slugify(t.name);
    const path = this.path(file);
    const tmp = path + ".tmp";
    await writeFile(tmp, JSON.stringify({ format: "ferrule-template", version: 1, template: t }, null, 1));
    await rename(tmp, path);
    return file;
  }
}
