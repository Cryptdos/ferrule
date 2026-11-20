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
