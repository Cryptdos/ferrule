import type { Project } from "../core/model";

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
  list: () => call<ProjectSummary[]>("/api/projects"),
  create: (title: string) => call<Project>("/api/projects", { method: "POST", body: JSON.stringify({ title }) }),
  load: (id: string) => call<Project>(`/api/projects/${encodeURIComponent(id)}`),
  save: (project: Project) =>
    call<{ ok: true }>(`/api/projects/${encodeURIComponent(project.id)}`, {
      method: "PUT",
      body: JSON.stringify(project),
    }),
};
