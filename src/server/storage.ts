/**
 * Project storage (DESIGN.md §4). Each project is one self-contained file,
 * `<name>.ferrule` (images included), saved anywhere. New projects go in
 * the projects folder by default; files opened from elsewhere are
 * remembered in a recent list beside it, so they keep the same id between
 * runs. Writes go to a temporary file first and are then renamed into
 * place, and the previous version is kept as `.bak`, so a crash mid-save
 * can't lose a drawing. Deleting moves the file to a "Deleted" folder.
 */
import { VERSION } from "../core/version";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile, copyFile } from "node:fs/promises";
import { existsSync, readdirSync, statSync, watch, type FSWatcher } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { homedir, platform } from "node:os";
import { createHash } from "node:crypto";
import { type Project, dateText, newProject } from "../core/model";
import { parseDesignTemplate, parseProject, parseTemplate, ProjectFormatError } from "../core/validate";
import type { DesignTemplate, Template } from "../core/model";
import { templateCounts, type Counts } from "../core/design";
import { fileKey, fileNameProblem } from "../core/filenames";

/** The project file extension. */
export const EXT = ".ferrule";
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
  /** Its file's name, as typed (v0.5 A17): what the project is known by. */
  name: string;
  /** Its title block's title, once there is one. */
  title: string;
  pages: number;
  modified: string;
  /** Where the file is. */
  path: string;
  /** In the projects folder, or opened from somewhere else. */
  where: "projects" | "elsewhere";
  /** When it was last opened from elsewhere (recent list). */
  opened?: string;
  /** Why it can't be opened (a project from an older Ferrule). */
  error?: string;
}

/** A project in the Deleted folder (v0.5 A16). */
export interface DeletedProject {
  /** Its file's name in the Deleted folder: what Restore and Delete permanently are given. */
  file: string;
  /** The name it had, which Restore starts from. */
  name: string;
  /** When it was deleted. */
  deleted: string;
  title: string;
  pages: number;
  /** Why it can't be opened, if it can't. */
  error?: string;
}

export interface FolderListing {
  path: string;
  parent: string | null;
  folders: string[];
  files: { name: string; path: string; modified: string }[];
  /** Places to start from: home, the projects folder, drives on Windows. */
  places: { name: string; path: string }[];
}

/**
 * The project as written to its file: `savedBy`, the version that saved it,
 * at the top beside the format (v0.4.x T19). Read when a newer file won't
 * open; otherwise ignored.
 */
export function stampSaved(project: Project): Record<string, unknown> {
  const { format, version, ...rest } = project as Project & { savedBy?: string };
  delete (rest as { savedBy?: string }).savedBy;
  return { format, version, savedBy: VERSION, ...rest };
}

/** A file's key: how names are compared, and a project's id (v0.5 A8). */
export const slugify = fileKey;

const isProjectFile = (name: string) => name.endsWith(EXT);
const stem = (name: string) => (name.endsWith(EXT) ? name.slice(0, -EXT.length) : name);
/** A deleted file's or a backup's name: `<name> <when>.ferrule`, the time with `:` and `.` made `-`. */
const STAMPED_RE = /^(.*) (\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.ferrule$/;
const stamped = (name: string, when: Date) => `${name} ${when.toISOString().replace(/[:.]/g, "-")}${EXT}`;
/** The name and time read back from a stamped file name, or null. */
function unstamp(file: string): { name: string; when: string } | null {
  const m = STAMPED_RE.exec(file);
  return m ? { name: m[1]!, when: `${m[2]}T${m[3]}:${m[4]}:${m[5]}.${m[6]}Z` } : null;
}
/** The folder a project's backups go in: beside its file (v0.5 A12). */
const BACKUPS = "Backups";

/** Move a file, copying when a rename can't (across drives). */
async function move(from: string, to: string): Promise<void> {
  await rename(from, to).catch(async () => {
    await copyFile(from, to);
    await rm(from);
  });
}

export class Storage {
  private listeners = new Map<string, Set<(version: string) => void>>();
  private watcher: FSWatcher | null = null;
  private fileWatchers = new Map<string, FSWatcher>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Serialises read-modify-write edits per project (MCP tools). */
  private locks = new Map<string, Promise<unknown>>();
  /** Files opened from outside the projects folder: id → path. */
  private recent: { id: string; path: string; opened: string }[] = [];

  /** `now`: the clock, in ms (tests move it on). */
  constructor(
    readonly dir: string,
    private readonly now: () => number = Date.now,
  ) {}

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
        this.changed(fileKey(stem(String(name))));
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

  /** The file a project id refers to: one opened from elsewhere, else the projects folder's file whose name has that key. */
  path(id: string): string {
    if (!ID_RE.test(id)) throw new StorageError(`Invalid project id "${id}"`);
    const r = this.recent.find((x) => x.id === id);
    if (r) return r.path;
    const name = this.folderFiles().find((n) => fileKey(stem(n)) === id);
    return join(this.dir, name ?? id + EXT);
  }

  /** The project files in the projects folder. */
  private folderFiles(): string[] {
    try {
      return readdirSync(this.dir).filter(isProjectFile);
    } catch {
      return [];
    }
  }

  /**
   * Is a name taken (v0.5 A8)? Names are compared as file names, by their
   * key, so `LSP 01` and `lsp-01` are the same; a project opened from
   * elsewhere takes its key too.
   */
  taken(name: string): boolean {
    const key = fileKey(name);
    return this.folderFiles().some((n) => fileKey(stem(n)) === key) || this.recent.some((r) => r.id === key);
  }

  /** Is a project open in an editor (something is listening for its changes)? */
  isOpen(id: string): boolean {
    return !!this.listeners.get(id)?.size;
  }

  /** A name for a new file in the projects folder: legal (D2) and not taken (A8), or refused with the reason. */
  private newName(name: string): string {
    const n = name.trim();
    const bad = fileNameProblem(n);
    if (bad) throw new StorageError(bad);
    if (this.taken(n)) throw new StorageError(`A file by that name already exists: ${n}${EXT}`, 409);
    return n;
  }

  async list(): Promise<ProjectSummary[]> {
    const out: ProjectSummary[] = [];
    const add = async (id: string, file: string, where: ProjectSummary["where"], opened?: string) => {
      try {
        const p = await this.load(id);
        const st = await stat(file);
        out.push({ id, name: stem(basename(file)), title: p.project.title, pages: p.pages.length, modified: st.mtime.toISOString(), path: file, where, ...(opened ? { opened } : {}) });
      } catch (e) {
        // A project this version can't open is listed with the reason, so it doesn't just vanish.
        if (e instanceof ProjectFormatError) {
          const st = await stat(file).catch(() => null);
          if (st) out.push({ id, name: stem(basename(file)), title: "", pages: 0, modified: st.mtime.toISOString(), path: file, where, error: e.message, ...(opened ? { opened } : {}) });
        }
        // Anything else (unreadable, gone) is skipped; files stay on disk untouched.
      }
    };
    const seen = new Set<string>();
    for (const name of (await readdir(this.dir)).filter(isProjectFile)) {
      const id = fileKey(stem(name));
      // Two files whose names compare the same: the first is the project (A8 stops a second being made).
      if (seen.has(id) || this.recent.some((r) => r.id === id)) continue;
      seen.add(id);
      await add(id, join(this.dir, name), "projects");
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
    // A dated copy now and then (A12); a copy going wrong doesn't stop the save.
    await this.backUp(file, project).catch((e) => console.error(`Couldn't take a backup of ${file}`, e));
    return project;
  }

  /** A project file's backups, oldest first: in `Backups` beside it, named `<its name> <when>.ferrule`. */
  private async backupsOf(file: string): Promise<{ path: string; file: string; when: string }[]> {
    const dir = join(dirname(file), BACKUPS);
    if (!existsSync(dir)) return [];
    const name = stem(basename(file));
    const out: { path: string; file: string; when: string }[] = [];
    for (const f of await readdir(dir)) {
      const u = unstamp(f);
      if (u?.name === name) out.push({ path: join(dir, f), file: f, when: u.when });
    }
    return out.sort((a, b) => a.when.localeCompare(b.when));
  }

  /**
   * Take a backup of a file just saved (v0.5 A12, D1): only when the last
   * is at least `every` minutes old and the project has changed since it,
   * the oldest going once there are more than `keep`. None while `keep` is 0.
   */
  private async backUp(file: string, project: Project): Promise<void> {
    const { every, keep } = project.backups;
    if (keep <= 0) return;
    const now = this.now();
    const mine = await this.backupsOf(file);
    const last = mine.at(-1);
    if (last && now - Date.parse(last.when) < every * 60_000) return;
    if (last && (await readFile(last.path, "utf8")) === (await readFile(file, "utf8"))) return;
    const dir = join(dirname(file), BACKUPS);
    await mkdir(dir, { recursive: true });
    const to = join(dir, stamped(stem(basename(file)), new Date(now)));
    await copyFile(file, to);
    const all = [...mine, { path: to }];
    for (const old of all.slice(0, Math.max(0, all.length - keep))) await rm(old.path, { force: true });
  }

  /** A project's backups for the list (v0.5 A12), newest first, with its settings. */
  async backups(id: string): Promise<{ every: number; keep: number; copies: { file: string; taken: string; pages: number; error?: string }[] }> {
    const file = this.path(id);
    const project = await this.load(id);
    const copies: { file: string; taken: string; pages: number; error?: string }[] = [];
    for (const b of (await this.backupsOf(file)).reverse()) {
      try {
        copies.push({ file: b.file, taken: b.when, pages: parseProject(JSON.parse(await readFile(b.path, "utf8"))).pages.length });
      } catch (e) {
        copies.push({ file: b.file, taken: b.when, pages: 0, error: e instanceof ProjectFormatError ? e.message : "It can't be read" });
      }
    }
    return { ...project.backups, copies };
  }

  /** Restore one of a project's backups into a new project in the projects folder (v0.5 A12), under a name: legal and not taken. The project itself is left alone. */
  async restoreBackup(id: string, file: string, name: string): Promise<string> {
    const b = (await this.backupsOf(this.path(id))).find((x) => x.file === file);
    if (!b) throw new StorageError("That isn't one of this project's backups", 404);
    const n = this.newName(name);
    await copyFile(b.path, join(this.dir, n + EXT));
    return fileKey(n);
  }

  private async writeProject(file: string, project: Project): Promise<void> {
    await mkdir(dirname(file), { recursive: true });
    if (existsSync(file)) await copyFile(file, file + ".bak");
    const tmp = file + ".tmp";
    await writeFile(tmp, JSON.stringify(stampSaved(project), null, 1));
    await rename(tmp, file);
  }

  /**
   * A new project from a file name (v0.5 A17): legal and not taken, or
   * refused with the reason. It has no title until one's typed in *Project…*.
   */
  async create(name: string, opts: { useDeviceLibrary?: boolean } = {}): Promise<Project> {
    const n = this.newName(name);
    const id = fileKey(n);
    const project = newProject(id, "");
    // Dated the day it's made: its drawn date and revision A (A49).
    project.project.drawnDate = project.revisions[0]!.date = dateText();
    if (opts.useDeviceLibrary === false) project.useDeviceLibrary = false;
    await this.writeProject(join(this.dir, n + EXT), project);
    return project;
  }

  /** A project made elsewhere (an example, an upload) put in the projects folder under a name: legal and not taken. Returns its id. */
  async add(name: string, project: Project): Promise<string> {
    const n = this.newName(name);
    const id = fileKey(n);
    await this.writeProject(join(this.dir, n + EXT), { ...project, id });
    return id;
  }

  /** The id for a file: its name in the projects folder, else its name plus a short hash of where it is. */
  private idFor(file: string): string {
    const name = fileKey(stem(basename(file))).slice(0, 60);
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
    const bad = fileNameProblem(stem(basename(file)));
    if (bad) throw new StorageError(bad);
    if (existsSync(file) && !overwrite) throw new StorageError(`${basename(file)} is already there`, 409);
    // In the projects folder a name that compares the same as another's is taken too (v0.5 A8).
    if (!existsSync(file) && this.inProjectsFolder(file) && this.taken(stem(basename(file)))) throw new StorageError(`A file by that name already exists: ${stem(basename(file))}${EXT}`, 409);
    const project = await this.load(id);
    await this.writeProject(file, project);
    const newId = await this.open(file);
    project.id = newId;
    await this.writeProject(file, project);
    return newId;
  }

  /** A copy in the projects folder, under the name asked for (v0.5 A8): a copy is made for a reason, and its name says what. */
  async duplicate(id: string, name: string): Promise<string> {
    return this.add(name, await this.load(id));
  }

  /** The file name a project has, without `.ferrule`. */
  fileName(id: string): string {
    return stem(basename(this.path(id)));
  }

  /**
   * Rename a project's file where it is (v0.5 A21), its `.bak` and backups
   * with it. The name must be legal (D2) and not taken (A8); a change of
   * capitals alone is allowed. Refused while the project is open in an
   * editor, so a file isn't renamed out from under it. Returns the new id.
   */
  async renameProject(id: string, name: string): Promise<string> {
    const file = this.path(id);
    if (!existsSync(file)) throw new StorageError(`No project "${id}"`, 404);
    if (this.isOpen(id)) throw new StorageError("It's open in an editor. Close it there, then rename it.", 409);
    const n = name.trim();
    const bad = fileNameProblem(n);
    if (bad) throw new StorageError(bad);
    const old = stem(basename(file));
    if (n === old) return id;
    const dir = dirname(file);
    const to = join(dir, n + EXT);
    const same = fileKey(n) === fileKey(old);
    if (!same) {
      const clash = this.inProjectsFolder(file)
        ? this.taken(n)
        : readdirSync(dir).some((f) => isProjectFile(f) && fileKey(stem(f)) === fileKey(n));
      if (clash) throw new StorageError(`A file by that name already exists: ${n}${EXT}`, 409);
    }
    await move(file, to);
    if (existsSync(file + ".bak")) await move(file + ".bak", to + ".bak");
    await this.renameBackups(dir, old, n);
    if (this.inProjectsFolder(to)) return fileKey(n);
    const newId = this.idFor(to);
    this.recent = this.recent.map((r) => (r.id === id ? { ...r, id: newId, path: to } : r));
    await this.saveRecent();
    return newId;
  }

  /** A project's backups follow its file's name (A12, A21), each keeping its time. */
  private async renameBackups(dir: string, from: string, to: string): Promise<void> {
    for (const b of await this.backupsOf(join(dir, from + EXT))) {
      await move(b.path, join(dir, BACKUPS, stamped(to, new Date(b.when))));
    }
  }

  /** Add a `.ferrule` file sent from the user's own machine (v0.5 A9): checked as opening one is, under its own name. Returns its id. */
  async upload(fileName: string, text: string): Promise<string> {
    const base = basename(fileName.replace(/\\/g, "/"));
    if (!isProjectFile(base)) throw new StorageError("That isn't a Ferrule project (.ferrule) file");
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new StorageError("That file isn't a Ferrule project: it can't be read");
    }
    return this.add(stem(base), parseProject(data));
  }

  private get bin(): string {
    return join(this.dir, "Deleted");
  }

  /** The projects in the Deleted folder (v0.5 A16), most recently deleted first. */
  async deleted(): Promise<DeletedProject[]> {
    if (!existsSync(this.bin)) return [];
    const out: DeletedProject[] = [];
    for (const file of (await readdir(this.bin)).filter(isProjectFile)) {
      const full = join(this.bin, file);
      const st = await stat(full).catch(() => null);
      if (!st?.isFile()) continue;
      const u = unstamp(file);
      const name = u ? u.name : stem(file);
      const deleted = u ? u.when : st.mtime.toISOString();
      try {
        const p = parseProject(JSON.parse(await readFile(full, "utf8")));
        out.push({ file, name, deleted, title: p.project.title, pages: p.pages.length });
      } catch (e) {
        out.push({ file, name, deleted, title: "", pages: 0, error: e instanceof ProjectFormatError ? e.message : "It can't be read" });
      }
    }
    return out.sort((a, b) => b.deleted.localeCompare(a.deleted));
  }

  /** A file in the Deleted folder, by its name there: only one that's listed. */
  private binFile(file: string): string {
    const names = existsSync(this.bin) ? readdirSync(this.bin).filter(isProjectFile) : [];
    if (!names.includes(file)) throw new StorageError("That project isn't in the Deleted folder", 404);
    return join(this.bin, file);
  }

  /**
   * Restore a deleted project into the projects folder (v0.5 A16) under the
   * name asked for: legal and not taken. Returns its id.
   */
  async restore(file: string, name: string): Promise<string> {
    const from = this.binFile(file);
    const n = this.newName(name);
    const to = join(this.dir, n + EXT);
    await move(from, to);
    if (existsSync(from + ".bak")) await move(from + ".bak", to + ".bak");
    return fileKey(n);
  }

  /** Delete a deleted project for good (v0.5 A16), its `.bak` with it. */
  async purge(file: string): Promise<void> {
    const from = this.binFile(file);
    await rm(from);
    if (existsSync(from + ".bak")) await rm(from + ".bak");
  }

  /**
   * Forget a project. With `deleteFile`, its file is moved into a "Deleted"
   * folder inside the projects folder (nothing is destroyed); otherwise a
   * file opened from elsewhere is just taken off the recent list.
   */
  async remove(id: string, deleteFile: boolean): Promise<void> {
    const file = this.path(id);
    if (deleteFile && existsSync(file)) {
      await mkdir(this.bin, { recursive: true });
      const to = join(this.bin, stamped(stem(basename(file)), new Date(this.now())));
      // The previous save goes with it (A45), so nothing of the project is left in its folder.
      await move(file, to);
      if (existsSync(file + ".bak")) await move(file + ".bak", to + ".bak");
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

const DESIGN_EXT = ".ferrule-design.json";

export interface DesignLibraryEntry {
  file: string;
  name: string;
  /** The rows' tags, and what they need from the controller in all. */
  plant: string[];
  total: Counts;
}

/**
 * Design templates (design-v0.4 §3): the engineer's own, one file each in
 * the library's "design" folder. A list of their own, apart from Draft's
 * templates. Nothing is built in: the folder starts empty.
 */
export class DesignLibrary {
  constructor(readonly dir: string) {}

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  private path(file: string): string {
    if (!ID_RE.test(file)) throw new StorageError(`Invalid template name "${file}"`);
    return join(this.dir, file + DESIGN_EXT);
  }

  async list(): Promise<DesignLibraryEntry[]> {
    await this.init();
    const out: DesignLibraryEntry[] = [];
    for (const name of (await readdir(this.dir)).filter((n) => n.endsWith(DESIGN_EXT))) {
      const file = name.slice(0, -DESIGN_EXT.length);
      try {
        const t = await this.load(file);
        out.push({ file, name: t.name, plant: t.plant.map((p) => p.tag), total: templateCounts(t).total });
      } catch {
        // Unreadable files are left alone.
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  async load(file: string): Promise<DesignTemplate> {
    const path = this.path(file);
    if (!existsSync(path)) throw new StorageError(`No Design template "${file}"`, 404);
    const data = JSON.parse(await readFile(path, "utf8"));
    if (data?.format !== "ferrule-design-template") throw new ProjectFormatError("Not a Ferrule Design template file");
    return parseDesignTemplate(data.template);
  }

  /** Save a template; returns its file name. One of the same name is replaced. */
  async save(template: unknown): Promise<string> {
    const t = parseDesignTemplate(template);
    if (!t.plant.length) throw new ProjectFormatError("A Design template needs rows");
    await this.init();
    const file = slugify(t.name);
    const path = this.path(file);
    const tmp = path + ".tmp";
    await writeFile(tmp, JSON.stringify({ format: "ferrule-design-template", version: 1, template: t }, null, 1));
    await rename(tmp, path);
    return file;
  }

  async remove(file: string): Promise<void> {
    const path = this.path(file);
    if (existsSync(path)) await rm(path);
  }
}
