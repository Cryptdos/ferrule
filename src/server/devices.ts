/**
 * The shared device library: `library/devices/devices.json` beside the
 * projects folder, with each device's datasheets and pictures in a folder of
 * its own (`library/devices/<id>/`).
 */
import { mkdir, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join } from "node:path";
import { randomBytes } from "node:crypto";
import { parseDeviceEntry, type DeviceEntry, type DeviceFile } from "../core/devices";
import { StorageError, slugify } from "./storage";

const ID_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;
const FILE_RE = /^[\w][\w .()+-]{0,120}\.(pdf|png|jpe?g|webp|gif)$/i;
/** Datasheets and pictures, not archives of a whole catalogue. */
const MAX_FILE = 25 * 1024 * 1024;

export const FILE_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function parse(input: unknown, id?: string): DeviceEntry {
  try {
    return parseDeviceEntry(input, id);
  } catch (e) {
    throw new StorageError((e as Error).message);
  }
}

export class DeviceLibrary {
  private cache: DeviceEntry[] | null = null;
  constructor(readonly dir: string) {}

  private get file(): string {
    return join(this.dir, "devices.json");
  }

  async list(): Promise<DeviceEntry[]> {
    if (this.cache) return this.cache;
    if (!existsSync(this.file)) return (this.cache = []);
    try {
      const data = JSON.parse(await readFile(this.file, "utf8"));
      const list: unknown[] = Array.isArray(data?.devices) ? data.devices : [];
      const out: DeviceEntry[] = [];
      for (const d of list) {
        try {
          const e = parseDeviceEntry(d);
          if (ID_RE.test(e.id) && !out.some((x) => x.id === e.id)) out.push(e);
        } catch {
          // A broken entry is skipped, not fatal.
        }
      }
      return (this.cache = out.sort((a, b) => a.name.localeCompare(b.name)));
    } catch {
      throw new StorageError("The device library file can't be read");
    }
  }

  private async write(list: DeviceEntry[]): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const tmp = this.file + ".tmp";
    await writeFile(tmp, JSON.stringify({ format: "ferrule-devices", version: 1, devices: list }, null, 1));
    await rename(tmp, this.file);
    this.cache = [...list].sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(id: string): Promise<DeviceEntry> {
    const e = (await this.list()).find((d) => d.id === id);
    if (!e) throw new StorageError(`No device "${id}" in the library`, 404);
    return e;
  }

  async add(input: unknown): Promise<DeviceEntry> {
    const list = await this.list();
    const e = parse(input);
    let id = slugify(`${e.name} ${e.part}`).slice(0, 60) || "device";
    if (list.some((d) => d.id === id)) id = `${id}-${randomBytes(2).toString("hex")}`;
    const entry: DeviceEntry = { ...e, id, files: [] };
    await this.write([...list, entry]);
    return entry;
  }

  async update(id: string, input: unknown): Promise<DeviceEntry> {
    const list = await this.list();
    const old = await this.get(id);
    const e = parse({ ...old, ...(typeof input === "object" && input ? input : {}) }, id);
    const entry: DeviceEntry = { ...e, files: old.files };
    await this.write(list.map((d) => (d.id === id ? entry : d)));
    return entry;
  }

  async remove(id: string): Promise<void> {
    const list = await this.list();
    await this.get(id);
    await this.write(list.filter((d) => d.id !== id));
    await rm(join(this.dir, id), { recursive: true, force: true });
  }

  private filePath(id: string, name: string): string {
    if (!ID_RE.test(id)) throw new StorageError("Invalid device id");
    if (!FILE_RE.test(name) || name.includes("..")) throw new StorageError("Datasheets and pictures only: PDF, PNG, JPEG, WebP or GIF");
    return join(this.dir, id, name);
  }

  async addFile(id: string, name: string, data: Uint8Array): Promise<DeviceEntry> {
    const entry = await this.get(id);
    if (data.byteLength > MAX_FILE) throw new StorageError("That file is over 25 MB");
    const clean = name.replace(/[^\w .()+-]/g, "_").replace(/^[^\w]+/, "") || "file";
    const ext = extname(clean).toLowerCase();
    if (!FILE_TYPES[ext]) throw new StorageError("Datasheets and pictures only: PDF, PNG, JPEG, WebP or GIF");
    // Keep names unique within the device.
    let final = clean;
    for (let i = 2; entry.files.some((f) => f.name === final); i++) final = `${clean.slice(0, -ext.length)} (${i})${ext}`;
    const path = this.filePath(id, final);
    await mkdir(join(this.dir, id), { recursive: true });
    await writeFile(path, data);
    const file: DeviceFile = { name: final, type: ext === ".pdf" ? "datasheet" : "picture", bytes: data.byteLength };
    return this.setFiles(id, [...entry.files, file]);
  }

  async removeFile(id: string, name: string): Promise<DeviceEntry> {
    const entry = await this.get(id);
    await unlink(this.filePath(id, name)).catch(() => {});
    return this.setFiles(
      id,
      entry.files.filter((f) => f.name !== name),
    );
  }

  private async setFiles(id: string, files: DeviceFile[]): Promise<DeviceEntry> {
    const list = await this.list();
    const entry = { ...(await this.get(id)), files };
    await this.write(list.map((d) => (d.id === id ? entry : d)));
    return entry;
  }

  async readFile(id: string, name: string): Promise<{ data: Uint8Array; type: string }> {
    await this.get(id);
    const path = this.filePath(id, name);
    if (!existsSync(path)) throw new StorageError("That file isn't there any more", 404);
    return { data: new Uint8Array(await readFile(path)), type: FILE_TYPES[extname(name).toLowerCase()] ?? "application/octet-stream" };
  }
}
