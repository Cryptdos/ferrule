import type { DeviceEntry } from "../core/devices";
import { api } from "./api";

/** The shared device library, fetched once and refreshed after each change. */
class DeviceStore {
  list: DeviceEntry[] = $state([]);
  loaded = $state(false);
  error = $state("");
  private loading: Promise<void> | null = null;

  load(force = false): Promise<void> {
    if (this.loaded && !force) return Promise.resolve();
    if (this.loading && !force) return this.loading;
    this.loading = api.devices
      .list()
      .then((l) => {
        this.list = l;
        this.loaded = true;
        this.error = "";
      })
      .catch((e: Error) => {
        this.error = e.message;
      })
      .finally(() => (this.loading = null));
    return this.loading;
  }

  get(id: string): DeviceEntry | undefined {
    return this.list.find((d) => d.id === id);
  }

  /** Put a changed entry in the list. */
  put(e: DeviceEntry): void {
    const i = this.list.findIndex((d) => d.id === e.id);
    this.list = i < 0 ? [...this.list, e].sort((a, b) => a.name.localeCompare(b.name)) : this.list.map((d) => (d.id === e.id ? e : d));
  }

  drop(id: string): void {
    this.list = this.list.filter((d) => d.id !== id);
  }
}

export const deviceLibrary = new DeviceStore();
