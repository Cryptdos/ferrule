/**
 * Serving the browser UI. In development the built files are read from
 * dist/web; in the portable .exe they are embedded in the binary.
 */
import { existsSync } from "node:fs";
import { join, normalize, sep } from "node:path";

export interface AssetSource {
  get(path: string): Promise<Response | null>;
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function contentType(path: string): string {
  const dot = path.lastIndexOf(".");
  return TYPES[dot >= 0 ? path.slice(dot) : ""] ?? "application/octet-stream";
}

function respond(file: Blob, path: string): Response {
  const immutable = path.startsWith("/assets/");
  return new Response(file, {
    headers: {
      "content-type": contentType(path),
      "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    },
  });
}

export function directoryAssets(root: string): AssetSource {
  return {
    async get(path) {
      const rel = normalize(decodeURIComponent(path === "/" ? "/index.html" : path)).replace(/^[/\\]+/, "");
      if (rel.split(sep).includes("..")) return null;
      const full = join(root, rel);
      if (!existsSync(full) || !full.startsWith(root)) return null;
      const file = Bun.file(full);
      if (!(await file.exists())) return null;
      return respond(file, "/" + rel.split(sep).join("/"));
    },
  };
}

/** `files` maps URL paths ("/index.html") to embedded file paths. */
export function embeddedAssets(files: Record<string, string>): AssetSource {
  return {
    async get(path) {
      const key = path === "/" ? "/index.html" : path;
      const src = files[key];
      return src ? respond(Bun.file(src), key) : null;
    },
  };
}
