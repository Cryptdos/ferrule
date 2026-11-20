/**
 * Project storage: one JSON file per project in a folder (DESIGN.md §4).
 * Writes go to a temporary file first and are then renamed into place, and
 * the previous version is kept as `.bak`, so a crash mid-save can't lose a
 * drawing.
 */
import { mkdir, readdir, readFile, rename, stat, writeFile, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { type Project, newProject } from "../core/model";
import { parseProject } from "../core/validate";

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
  constructor(readonly dir: string) {}

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
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

  async save(id: string, data: unknown): Promise<Project> {
    const project = parseProject(data);
    if (project.id !== id) throw new StorageError("Project id does not match the URL");
    const file = this.path(id);
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
