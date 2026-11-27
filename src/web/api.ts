import type { Project, Template } from "../core/model";
import type { DeviceEntry } from "../core/devices";

export interface LibraryEntry {
  file: string;
  name: string;
  kind: "sheet" | "section";
  plant: string[];
}

export interface ProjectSummary {
  id: string;
  /** Its file's name, as typed (v0.5 A17). */
  name: string;
  title: string;
  pages: number;
  modified: string;
  path: string;
  where: "projects" | "elsewhere";
  opened?: string;
  /** Why it can't be opened (a project from an older Ferrule). */
  error?: string;
}

/** A project in the Deleted folder (v0.5 A16). */
export interface DeletedProject {
  file: string;
  name: string;
  deleted: string;
  title: string;
  pages: number;
  error?: string;
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
    throw new ApiError(body.error ?? `${res.status} ${res.statusText}`, res.status);
  }
  return res.json() as Promise<T>;
}

/** An error from the server, with its HTTP status (409: that file is already there). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface Status {
  version: string;
  projects: string;
  address: string;
  mcpUrl: string;
  mcp: { client?: string; connectedAt?: number; lastTool?: string; lastAt?: number } | null;
  command: { command: string; args: string[] } | null;
  canQuit: boolean;
}

export const api = {
  status: () => call<Status>("/api/status"),
  quit: () => call<{ ok: true }>("/api/quit", { method: "POST" }),
  library: () => call<LibraryEntry[]>("/api/library"),
  designTemplates: () => call<import("../server/storage").DesignLibraryEntry[]>("/api/design-templates"),
  designTemplate: (file: string) => call<import("../core/model").DesignTemplate>(`/api/design-templates/${encodeURIComponent(file)}`),
  saveDesignTemplate: (t: import("../core/model").DesignTemplate) => call<{ file: string }>("/api/design-templates", { method: "POST", body: JSON.stringify(t) }),
  deleteDesignTemplate: (file: string) => call<{ ok: boolean }>(`/api/design-templates/${encodeURIComponent(file)}`, { method: "DELETE" }),
  libraryLoad: (file: string) => call<Template>(`/api/library/${encodeURIComponent(file)}`),
  librarySave: (t: Template) => call<{ file: string }>("/api/library", { method: "POST", body: JSON.stringify(t) }),
  list: () => call<ProjectSummary[]>("/api/projects"),
  browse: (path?: string) => call<FolderListing>(`/api/browse${path ? `?path=${encodeURIComponent(path)}` : ""}`),
  open: (path: string) => call<{ id: string }>("/api/projects/open", { method: "POST", body: JSON.stringify({ path }) }),
  saveAs: (id: string, path: string, overwrite = false) =>
    call<{ id: string }>(`/api/projects/${encodeURIComponent(id)}/save-as`, { method: "POST", body: JSON.stringify({ path, overwrite }) }),
  rename: (id: string, name: string) => call<{ id: string }>(`/api/projects/${encodeURIComponent(id)}/rename`, { method: "POST", body: JSON.stringify({ name }) }),
  upload: (name: string, text: string) => call<{ id: string }>(`/api/projects/upload?name=${encodeURIComponent(name)}`, { method: "POST", body: text }),
  deleted: () => call<DeletedProject[]>("/api/deleted"),
  restore: (file: string, name: string) => call<{ id: string }>("/api/deleted/restore", { method: "POST", body: JSON.stringify({ file, name }) }),
  purge: (file: string) => call<{ ok: true }>("/api/deleted/purge", { method: "POST", body: JSON.stringify({ file }) }),
  duplicate: (id: string, name: string) => call<{ id: string }>(`/api/projects/${encodeURIComponent(id)}/duplicate`, { method: "POST", body: JSON.stringify({ name }) }),
  /** Delete moves the file to the Deleted folder; without `file`, a file from elsewhere just leaves the list. */
  remove: (id: string, file: boolean) => call<{ ok: true }>(`/api/projects/${encodeURIComponent(id)}${file ? "?file=1" : ""}`, { method: "DELETE" }),
  /** A new project from a file name (v0.5 A17). */
  create: (name: string, useDeviceLibrary = true) =>
    call<Project>("/api/projects", { method: "POST", body: JSON.stringify({ name, useDeviceLibrary }) }),
  devices: {
    list: () => call<DeviceEntry[]>("/api/devices"),
    add: (d: Partial<DeviceEntry>) => call<DeviceEntry>("/api/devices", { method: "POST", body: JSON.stringify(d) }),
    update: (id: string, d: Partial<DeviceEntry>) =>
      call<DeviceEntry>(`/api/devices/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(d) }),
    remove: (id: string) => call<{ ok: true }>(`/api/devices/${encodeURIComponent(id)}`, { method: "DELETE" }),
    addFile: async (id: string, file: File): Promise<DeviceEntry> => {
      const res = await fetch(`/api/devices/${encodeURIComponent(id)}/files?name=${encodeURIComponent(file.name)}`, {
        method: "POST",
        headers: { "content-type": "application/octet-stream" },
        body: file,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `${res.status} ${res.statusText}`);
      return body as DeviceEntry;
    },
    removeFile: (id: string, name: string) =>
      call<DeviceEntry>(`/api/devices/${encodeURIComponent(id)}/files/${encodeURIComponent(name)}`, { method: "DELETE" }),
    fileUrl: (id: string, name: string) => `/api/devices/${encodeURIComponent(id)}/files/${encodeURIComponent(name)}`,
  },
  load: async (id: string): Promise<{ project: Project; version: string; file: string }> => {
    const res = await fetch(`/api/projects/${encodeURIComponent(id)}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `${res.status} ${res.statusText}`);
    }
    return { project: await res.json(), version: res.headers.get("x-ferrule-version") ?? "", file: decodeURIComponent(res.headers.get("x-ferrule-file") ?? "") };
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
