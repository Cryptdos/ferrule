/**
 * The wire router on the server, for edits made through MCP. The wasm file
 * is embedded in the .exe like the UI files are.
 */
import { AvoidLib, type Avoid } from "libavoid-js";
import wasmPath from "../../node_modules/libavoid-js/dist/libavoid.wasm" with { type: "file" };

let loading: Promise<Avoid | null> | null = null;

export function loadServerAvoid(): Promise<Avoid | null> {
  loading ??= AvoidLib.load(wasmPath)
    .then(() => AvoidLib.getInstance())
    .catch((e) => {
      console.error("Wire router unavailable on the server; MCP edits use simple routes.", e);
      return null;
    });
  return loading;
}
