/** Loads the libavoid router (wasm) once. Wiring still works without it, with simpler routes. */
import { AvoidLib, type Avoid } from "libavoid-js";
import wasmUrl from "@libavoid-wasm?url";

let instance: Avoid | null = null;

export async function loadAvoid(): Promise<Avoid | null> {
  if (instance) return instance;
  try {
    await AvoidLib.load(wasmUrl);
    instance = AvoidLib.getInstance();
  } catch (e) {
    console.warn("Wire router failed to load; using simple routes", e);
  }
  return instance;
}

export function getAvoid(): Avoid | null {
  return instance;
}
