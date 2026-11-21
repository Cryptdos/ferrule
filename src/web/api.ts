import type { Project, Template } from "../core/model";

export interface LibraryEntry {
  file: string;
  name: string;
  kind: "sheet" | "section";
  plant: string[];
}

export interface ProjectSummary {
  id: string;
  title: string;
  pages: number;
  modified: string;
  path: string;
  where: "projects" | "elsewhere";
  opened?: string;
}

export interface FolderListing {
  path: string;
  parent: string | null;
  folders: string[];
  files: { name: string; path: string; modified: string }[];
  places: { name: string; path: string }[];
}

export class ConflictError extends Error {}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  library: () => call<LibraryEntry[]>("/api/library"),
  libraryLoad: (file: string) => call<Template>(`/api/library/${encodeURIComponent(file)}`),
  librarySave: (t: Template) => call<{ file: string }>("/api/library", { method: "POST", body: JSON.stringify(t) }),
  list: () => call<ProjectSummary[]>("/api/projects"),
  browse: (path?: string) => call<FolderListing>(`/api/browse${path ? `?path=${encodeURIComponent(path)}` : ""}`),
  open: (path: string) => call<{ id: string }>("/api/projects/open", { method: "POST", body: JSON.stringify({ path }) }),
  saveAs: (id: string, path: string, overwrite = false) =>
    call<{ id: string }>(`/api/projects/${encodeURIComponent(id)}/save-as`, { method: "POST", body: JSON.stringify({ path, overwrite }) }),
  duplicate: (id: string) => call<{ id: string }>(`/api/projects/${encodeURIComponent(id)}/duplicate`, { method: "POST" }),
  /** Delete moves the file to the Deleted folder; without `file`, a file from elsewhere just leaves the list. */
  remove: (id: string, file: boolean) => call<{ ok: true }>(`/api/projects/${encodeURIComponent(id)}${file ? "?file=1" : ""}`, { method: "DELETE" }),
  create: (title: string) => call<Project>("/api/projects", { method: "POST", body: JSON.stringify({ title }) }),
  load: async (id: string): Promise<{ project: Project; version: string }> => {
    const res = await fetch(`/api/projects/${encodeURIComponent(id)}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `${res.status} ${res.statusText}`);
    }
    return { project: await res.json(), version: res.headers.get("x-ferrule-version") ?? "" };
  },
  /** Save; `version` is what we last loaded or saved. Throws ConflictError if someone else saved since. */
  save: async (project: Project, version: string): Promise<string> => {
    const res = await fetch(`/api/projects/${encodeURIComponent(project.id)}`, {
      method: "PUT",
      headers: { "content-type": "application/json", ...(version ? { "if-match": version } : {}) },
      body: JSON.stringify(project),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 409) throw new ConflictError(body.error ?? "Changed elsewhere");
    if (!res.ok) throw new Error(body.error ?? `${res.status} ${res.statusText}`);
    return body.version ?? "";
  },
};
