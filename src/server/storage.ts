/**
 * Project storage (DESIGN.md §4). Each project is one self-contained file,
 * `<name>.ferrule` (images included), saved anywhere. New projects go in
 * the projects folder by default; files opened from elsewhere are
 * remembered in a recent list beside it, so they keep the same id between
 * runs. Writes go to a temporary file first and are then renamed into
 * place, and the previous version is kept as `.bak`, so a crash mid-save
 * can't lose a drawing. Deleting moves the file to a "Deleted" folder.
 */
import { mkdir, readdir, readFile, rename, stat, writeFile, copyFile } from "node:fs/promises";
import { existsSync, statSync, watch, type FSWatcher } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { homedir, platform } from "node:os";
import { createHash } from "node:crypto";
import { type Project, newProject } from "../core/model";
import { parseProject, parseTemplate, ProjectFormatError } from "../core/validate";
import type { Template } from "../core/model";

/** The project file extension. Older builds wrote `.ferrule.json`, which still opens. */
export const EXT = ".ferrule";
const OLD_EXT = ".ferrule.json";
const ID_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;
const RECENT_FILE = ".ferrule-recent.json";
const RECENT_MAX = 30;

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
  /** Where the file is. */
  path: string;
  /** In the projects folder, or opened from somewhere else. */
  where: "projects" | "elsewhere";
  /** When it was last opened from elsewhere (recent list). */
  opened?: string;
}

export interface FolderListing {
  path: string;
  parent: string | null;
  folders: string[];
  files: { name: string; path: string; modified: string }[];
  /** Places to start from: home, the projects folder, drives on Windows. */
  places: { name: string; path: string }[];
}

export function slugify(title: string): string {
  const s = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return s || "project";
}

const isProjectFile = (name: string) => name.endsWith(EXT) || name.endsWith(OLD_EXT);
const stem = (name: string) => (name.endsWith(OLD_EXT) ? name.slice(0, -OLD_EXT.length) : name.endsWith(EXT) ? name.slice(0, -EXT.length) : name);

export class Storage {
  private listeners = new Map<string, Set<(version: string) => void>>();
  private watcher: FSWatcher | null = null;
  private fileWatchers = new Map<string, FSWatcher>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Serialises read-modify-write edits per project (MCP tools). */
  private locks = new Map<string, Promise<unknown>>();
  /** Files opened from outside the projects folder: id → path. */
  private recent: { id: string; path: string; opened: string }[] = [];

  constructor(readonly dir: string) {}

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    try {
      const data = JSON.parse(await readFile(join(this.dir, RECENT_FILE), "utf8"));
      if (Array.isArray(data)) {
        this.recent = data.filter(
          (r): r is { id: string; path: string; opened: string } =>
            typeof r?.id === "string" && typeof r?.path === "string" && ID_RE.test(r.id),
        );
      }
    } catch {
      this.recent = [];
    }
  }

  private async saveRecent(): Promise<void> {
    this.recent = this.recent.slice(0, RECENT_MAX);
    await writeFile(join(this.dir, RECENT_FILE), JSON.stringify(this.recent, null, 1));
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
    const file = this.path(id);
    if (this.inProjectsFolder(file)) this.startWatching();
    else this.watchFile(id, file);
    if (!this.listeners.has(id)) this.listeners.set(id, new Set());
    this.listeners.get(id)!.add(fn);
    return () => this.listeners.get(id)?.delete(fn);
  }

  private changed(id: string): void {
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
  }

  private startWatching(): void {
    if (this.watcher) return;
    try {
      this.watcher = watch(this.dir, (_event, name) => {
        if (!name || !isProjectFile(String(name))) return;
        this.changed(stem(String(name)));
      });
    } catch (e) {
      console.error("Can't watch the projects folder; live updates are off", e);
    }
  }

  private watchFile(id: string, file: string): void {
    if (this.fileWatchers.has(id)) return;
    try {
      // Watch the folder (editors and sync tools replace files rather than write them in place).
      const w = watch(dirname(file), (_event, name) => {
        if (name && String(name) === basename(file)) this.changed(id);
      });
      this.fileWatchers.set(id, w);
    } catch {
      // No live updates for this file.
    }
  }

  close(): void {
    this.watcher?.close();
    this.watcher = null;
    for (const w of this.fileWatchers.values()) w.close();
    this.fileWatchers.clear();
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

  private inProjectsFolder(file: string): boolean {
    return resolve(dirname(file)) === resolve(this.dir);
  }

  /** The file a project id refers to. */
  path(id: string): string {
    if (!ID_RE.test(id)) throw new StorageError(`Invalid project id "${id}"`);
    const r = this.recent.find((x) => x.id === id);
    if (r) return r.path;
    const old = join(this.dir, id + OLD_EXT);
    return existsSync(old) ? old : join(this.dir, id + EXT);
  }

  async list(): Promise<ProjectSummary[]> {
    const out: ProjectSummary[] = [];
    const add = async (id: string, file: string, where: ProjectSummary["where"], opened?: string) => {
      try {
        const p = await this.load(id);
        const st = await stat(file);
        out.push({ id, title: p.project.title, pages: p.pages.length, modified: st.mtime.toISOString(), path: file, where, ...(opened ? { opened } : {}) });
      } catch {
        // Skip files we can't read (or that have gone); they stay on disk untouched.
      }
    };
    for (const name of (await readdir(this.dir)).filter(isProjectFile)) {
      const id = stem(name);
      if (ID_RE.test(id) && !this.recent.some((r) => r.id === id)) await add(id, join(this.dir, name), "projects");
    }
    for (const r of this.recent) if (existsSync(r.path)) await add(r.id, r.path, "elsewhere", r.opened);
    return out.sort((a, b) => (b.opened ?? b.modified).localeCompare(a.opened ?? a.modified));
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
    await this.writeProject(file, project);
    return project;
  }

  private async writeProject(file: string, project: Project): Promise<void> {
    await mkdir(dirname(file), { recursive: true });
    if (existsSync(file)) await copyFile(file, file + ".bak");
    const tmp = file + ".tmp";
    await writeFile(tmp, JSON.stringify(project, null, 1));
    await rename(tmp, file);
  }

  async create(title: string, opts: { useDeviceLibrary?: boolean } = {}): Promise<Project> {
    const base = slugify(title);
    let id = base;
    for (let i = 2; existsSync(this.path(id)) || this.recent.some((r) => r.id === id); i++) id = `${base}-${i}`;
    const project = newProject(id, title.trim() || "Untitled project");
    if (opts.useDeviceLibrary === false) project.useDeviceLibrary = false;
    return this.save(id, project);
  }

  /** The id for a file: its name in the projects folder, else its name plus a short hash of where it is. */
  private idFor(file: string): string {
    const name = slugify(stem(basename(file))).slice(0, 60);
    if (this.inProjectsFolder(file)) return name;
    const hash = createHash("sha1").update(resolve(file).toLowerCase()).digest("hex").slice(0, 6);
    return `${name}-${hash}`;
  }

  /** Open a project file from anywhere. Returns its id. */
  async open(path: string): Promise<string> {
    const file = resolve(path);
    if (!existsSync(file)) throw new StorageError(`There's no file at ${file}`, 404);
    if (!isProjectFile(basename(file))) throw new StorageError("That isn't a Ferrule project (.ferrule) file");
    // Check it reads before remembering it.
    parseProject(JSON.parse(await readFile(file, "utf8")));
    const id = this.idFor(file);
    if (!this.inProjectsFolder(file)) {
      this.recent = [{ id, path: file, opened: new Date().toISOString() }, ...this.recent.filter((r) => r.id !== id)];
      await this.saveRecent();
    }
    return id;
  }

  /** Save a copy of a project to a file (Save As). Returns the new copy's id; the old file is left as it was. */
  async saveAs(id: string, path: string, overwrite = false): Promise<string> {
    let file = resolve(path);
    if (!isProjectFile(basename(file))) file += EXT;
    if (existsSync(file) && !overwrite) throw new StorageError(`${basename(file)} is already there`, 409);
    const project = await this.load(id);
    await this.writeProject(file, project);
    const newId = await this.open(file);
    project.id = newId;
    await this.writeProject(file, project);
    return newId;
  }

  /** A copy beside the original. */
  async duplicate(id: string): Promise<string> {
    const project = await this.load(id);
    const copy = await this.create(`${project.project.title} copy`);
    const out = { ...project, id: copy.id, project: { ...project.project, title: `${project.project.title} (copy)` } };
    await this.save(copy.id, out);
    return copy.id;
  }

  /**
   * Forget a project. With `deleteFile`, its file is moved into a "Deleted"
   * folder inside the projects folder (nothing is destroyed); otherwise a
   * file opened from elsewhere is just taken off the recent list.
   */
  async remove(id: string, deleteFile: boolean): Promise<void> {
    const file = this.path(id);
    if (deleteFile && existsSync(file)) {
      const bin = join(this.dir, "Deleted");
      await mkdir(bin, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      await rename(file, join(bin, `${stem(basename(file))} ${stamp}${EXT}`)).catch(async () => {
        // Across drives a rename fails: copy, then remove by renaming over a temp.
        await copyFile(file, join(bin, `${stem(basename(file))} ${stamp}${EXT}`));
        await rename(file, file + ".deleted");
      });
    } else if (!this.recent.some((r) => r.id === id)) {
      throw new StorageError("A project in the projects folder can only be deleted, not removed from the list");
    }
    this.recent = this.recent.filter((r) => r.id !== id);
    await this.saveRecent();
  }

  /** The folders and project files in a folder, for the in-app file browser. */
  async browse(path?: string): Promise<FolderListing> {
    const places: { name: string; path: string }[] = [
      { name: "Projects folder", path: this.dir },
      { name: "Home", path: homedir() },
    ];
    if (platform() === "win32") {
      for (const l of "CDEFGHIJKLMNOPQRSTUVWXYZ") if (existsSync(`${l}:\\`)) places.push({ name: `${l}:`, path: `${l}:\\` });
    } else {
      places.push({ name: "/", path: "/" });
    }
    const dir = resolve(path || this.dir);
    if (!existsSync(dir)) throw new StorageError(`There's no folder at ${dir}`, 404);
    const st = await stat(dir);
    if (!st.isDirectory()) throw new StorageError(`${dir} isn't a folder`);
    const folders: string[] = [];
    const files: FolderListing["files"] = [];
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (e.name.startsWith(".")) continue;
      if (e.isDirectory()) folders.push(e.name);
      else if (e.isFile() && isProjectFile(e.name)) {
        const full = join(dir, e.name);
        const m = await stat(full).catch(() => null);
        files.push({ name: e.name, path: full, modified: m ? m.mtime.toISOString() : "" });
      }
    }
    folders.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    const parent = dirname(dir);
    return { path: dir, parent: parent === dir ? null : parent, folders, files, places };
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
