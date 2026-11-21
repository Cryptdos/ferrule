/**
 * The GA device table: real devices with their sizes (from a datasheet), kept
 * in a shared library beside the projects and copied into each project that
 * uses one, so a project file always has the sizes it needs.
 */

export interface DeviceFile {
  /** File name as stored, e.g. "drm-datasheet.pdf". */
  name: string;
  type: "datasheet" | "picture";
  bytes: number;
}

/** A device in the shared library. */
export interface DeviceEntry {
  id: string;
  /** What it's called on a GA and in the list, e.g. "Relay 4CO 24V DC with base". */
  name: string;
  maker: string;
  part: string;
  /** Which kind of schematic part it suits (a GA size key: relay, contactor, mcb…), or "" for any. */
  kind: string;
  /** Width × height as seen on the backplate, and depth, in mm. */
  w: number;
  h: number;
  d: number;
  notes: string;
  files: DeviceFile[];
}

/** A device a project uses: a copy of the library entry's details (or the project's own). */
export interface ProjectDevice {
  id: string;
  name: string;
  maker: string;
  part: string;
  kind: string;
  w: number;
  h: number;
  d: number;
  /** Came from the shared library (true) or was made in this project only. */
  library: boolean;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const mm = (v: unknown, dflt: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v * 10) / 10 : dflt);

export function parseDeviceFile(v: unknown): DeviceFile | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  const name = str(o.name);
  if (!name) return null;
  return { name, type: o.type === "picture" ? "picture" : "datasheet", bytes: typeof o.bytes === "number" ? o.bytes : 0 };
}

export function parseDeviceEntry(v: unknown, id?: string): DeviceEntry {
  const o = (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;
  const name = str(o.name);
  if (!name) throw new Error("A device needs a name");
  return {
    id: id ?? (str(o.id) || ""),
    name,
    maker: str(o.maker),
    part: str(o.part),
    kind: str(o.kind),
    w: mm(o.w, 18),
    h: mm(o.h, 90),
    d: typeof o.d === "number" && o.d > 0 ? mm(o.d, 0) : 0,
    notes: typeof o.notes === "string" ? o.notes : "",
    files: Array.isArray(o.files) ? o.files.map(parseDeviceFile).filter((f): f is DeviceFile => !!f) : [],
  };
}

export function parseProjectDevices(v: unknown): ProjectDevice[] {
  if (!Array.isArray(v)) return [];
  const out: ProjectDevice[] = [];
  for (const x of v) {
    if (typeof x !== "object" || x === null) continue;
    const o = x as Record<string, unknown>;
    const id = str(o.id);
    const name = str(o.name);
    if (!id || !name || out.some((d) => d.id === id)) continue;
    out.push({
      id,
      name,
      maker: str(o.maker),
      part: str(o.part),
      kind: str(o.kind),
      w: mm(o.w, 18),
      h: mm(o.h, 90),
      d: typeof o.d === "number" && o.d > 0 ? mm(o.d, 0) : 0,
      library: o.library === true,
    });
  }
  return out;
}

/** The project's copy of a library entry. */
export function projectCopy(e: DeviceEntry): ProjectDevice {
  return { id: e.id, name: e.name, maker: e.maker, part: e.part, kind: e.kind, w: e.w, h: e.h, d: e.d, library: true };
}

/** "Relay 4CO (Weidmüller DRM 7760…) 30.6 × 101.8" for lists. */
export function deviceLabel(d: Pick<ProjectDevice, "name" | "maker" | "part" | "w" | "h">): string {
  const who = [d.maker, d.part].filter(Boolean).join(" ");
  return `${d.name}${who ? ` (${who})` : ""} · ${d.w} × ${d.h}`;
}
