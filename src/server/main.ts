/**
 * Ferrule server entry point.
 *
 *   ferrule [--port 4810] [--host 127.0.0.1] [--projects <folder>] [--no-open]
 *   ferrule --mcp      MCP over stdio, for Claude Desktop and similar clients
 *
 * MCP over HTTP is always available at http://127.0.0.1:4810/mcp.
 * By default projects live in a "projects" folder next to the program, so
 * the whole thing can be carried around on a USB stick or a shared drive.
 */
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createApp } from "./app";
import { type AssetSource, directoryAssets } from "./assets";
import { DesignLibrary, Library, Storage } from "./storage";
import { DeviceLibrary } from "./devices";
import { headlessBrowserRenderer, type PdfRenderer } from "./pdf";
import { mkdir, writeFile } from "node:fs/promises";
import { McpServer, serveStdio } from "./mcp";
import { loadServerAvoid } from "./avoid";
import { slugify } from "./storage";
import { buildLsp01 } from "../bench/lsp01";
import pkg from "../../package.json" with { type: "json" };

/** The version in package.json: the one place to change it for a release. */
export const VERSION: string = pkg.version;

export interface StartOptions {
  assets?: AssetSource;
  /** True when running as the compiled .exe. */
  compiled?: boolean;
  argv?: string[];
}

interface Args {
  port: number;
  host: string;
  projects: string | null;
  open: boolean;
  help: boolean;
  mcp: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { port: 4810, host: "127.0.0.1", projects: null, open: true, help: false, mcp: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === "--port" || a === "-p") args.port = Number(next());
    else if (a === "--host") args.host = next();
    else if (a === "--projects") args.projects = next();
    else if (a === "--no-open") args.open = false;
    else if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--mcp") {
      args.mcp = true;
      args.open = false;
    }
    else throw new Error(`Unknown option ${a}`);
  }
  if (!Number.isInteger(args.port) || args.port < 1 || args.port > 65535) throw new Error("Invalid --port");
  return args;
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  try {
    const child = spawn(cmd[0] as string, cmd[1] as string[], { detached: true, stdio: "ignore" });
    child.on("error", () => {});
    child.unref();
  } catch {
    // No browser to open; the URL is printed anyway.
  }
}

export async function start(opts: StartOptions = {}): Promise<void> {
  let args: Args;
  try {
    args = parseArgs(opts.argv ?? process.argv.slice(2));
  } catch (e) {
    console.error(String((e as Error).message));
    process.exit(2);
  }
  if (args.help) {
    console.log("ferrule [--port 4810] [--host 127.0.0.1] [--projects <folder>] [--no-open] [--mcp]");
    return;
  }

  if (args.mcp) {
    // stdout carries the protocol; everything else goes to stderr.
    console.log = console.error;
    // If Ferrule is already running, relay to it so the browser and Claude share one server.
    const base = `http://127.0.0.1:${args.port}`;
    if (await isFerrule(base)) {
      console.error(`Ferrule MCP: relaying to the running Ferrule at ${base}`);
      await relayStdio(`${base}/mcp`);
      return;
    }
  }

  const baseDir = opts.compiled ? dirname(process.execPath) : process.cwd();
  const storage = new Storage(resolve(args.projects ?? join(baseDir, "projects")));
  await storage.init();
  // The template library sits beside the projects folder.
  const library = new Library(resolve(join(storage.dir, "..", "library")));
  // The GA device table lives in the library too, with its datasheets and pictures.
  const devices = new DeviceLibrary(join(library.dir, "devices"));
  // Design templates there too, a folder of their own.
  const designs = new DesignLibrary(join(library.dir, "design"));
  const assets = opts.assets ?? directoryAssets(resolve(import.meta.dir, "../../dist/web"));
  // Use the requested port, or the next free one.
  let server: ReturnType<typeof Bun.serve> | null = null;
  const local = args.host === "0.0.0.0" || args.host === "::" ? "127.0.0.1" : args.host;
  const pdf = headlessBrowserRenderer();
  const selfUrl = () => `http://${local.includes(":") ? `[${local}]` : local}:${server?.port}`;
  const mcp = new McpServer(
    {
      storage,
      library,
      avoid: loadServerAvoid,
      exportPdf: (id) => exportPdf(storage, pdf, selfUrl(), id),
      viewPage: (id, n) => pdf.screenshot!(`${selfUrl()}/print/${encodeURIComponent(id)}?page=${n}`, 1684, 1191),
    },
    VERSION,
  );
  const examples = { "lsp-01": async () => buildLsp01(await loadServerAvoid()).project };
  // How Claude Desktop would start this Ferrule: the exe, or bun with this script.
  const command = opts.compiled
    ? { command: process.execPath, args: ["--mcp"] }
    : { command: process.execPath, args: [resolve(import.meta.dir, "main.ts"), "--mcp"] };
  const quit = () => {
    console.log("Ferrule stopped (Quit Ferrule on the Status page).");
    server?.stop(true);
    process.exit(0);
  };
  const app = createApp({ storage, library, designs, devices, assets, version: VERSION, pdf, selfUrl, mcp, examples, command, quit });
  for (let port = args.port; port < args.port + 20 && !server; port++) {
    try {
      server = Bun.serve({ port, hostname: args.host, fetch: app.fetch, idleTimeout: 120 });
    } catch (e) {
      if ((e as { code?: string }).code !== "EADDRINUSE") throw e;
    }
  }
  if (!server) {
    console.error(`No free port from ${args.port} to ${args.port + 19}`);
    process.exit(1);
  }

  const shownHost = args.host === "0.0.0.0" || args.host === "::" ? "localhost" : args.host;
  const url = `http://${shownHost}:${server.port}/`;
  console.log(`Ferrule ${VERSION}`);
  console.log(`Projects: ${storage.dir}`);
  console.log(`Open ${url} in your browser. Close this window to stop Ferrule.`);
  console.log(`MCP for Claude: ${url}mcp`);
  if (args.open) openBrowser(url);
  if (args.mcp) {
    await serveStdio(mcp);
    process.exit(0);
  }
}

async function isFerrule(base: string): Promise<boolean> {
  try {
    const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(800) });
    return res.ok && (await res.json())?.ok === true;
  } catch {
    return false;
  }
}

/** Pass stdio MCP messages to a running Ferrule's HTTP endpoint. */
async function relayStdio(url: string): Promise<void> {
  const decoder = new TextDecoder();
  const reader = Bun.stdin.stream().getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: line });
        if (res.status !== 202) process.stdout.write((await res.text()).trim() + "\n");
      } catch (e) {
        const id = (() => {
          try {
            return JSON.parse(line).id ?? null;
          } catch {
            return null;
          }
        })();
        if (id !== null) {
          process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32603, message: `Ferrule isn't reachable: ${(e as Error).message}` } }) + "\n");
        }
      }
    }
  }
  process.exit(0);
}

/** Save a project's PDF into an "exports" folder beside the projects folder. */
async function exportPdf(storage: Storage, pdf: PdfRenderer, base: string, id: string): Promise<string> {
  const project = await storage.load(id);
  const bytes = await pdf.render(`${base}/print/${encodeURIComponent(id)}`);
  const dir = resolve(join(storage.dir, "..", "exports"));
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${slugify(project.project.drawingNo || project.project.title || id)}.pdf`);
  await writeFile(file, bytes);
  return file;
}

if (import.meta.main) await start();
