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
  load: (id: string) => call<Project>(`/api/projects/${encodeURIComponent(id)}`),
  save: (project: Project) =>
    call<{ ok: true }>(`/api/projects/${encodeURIComponent(project.id)}`, {
      method: "PUT",
      body: JSON.stringify(project),
    }),
};
