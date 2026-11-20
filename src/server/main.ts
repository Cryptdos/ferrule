/**
 * Ferrule server entry point.
 *
 *   ferrule [--port 4810] [--host 127.0.0.1] [--projects <folder>] [--no-open]
 *
 * By default projects live in a "projects" folder next to the program, so
 * the whole thing can be carried around on a USB stick or a shared drive.
 */
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createApp } from "./app";
import { type AssetSource, directoryAssets } from "./assets";
import { Storage } from "./storage";
import { headlessBrowserRenderer } from "./pdf";

export const VERSION = "0.1.0";

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
}

function parseArgs(argv: string[]): Args {
  const args: Args = { port: 4810, host: "127.0.0.1", projects: null, open: true, help: false };
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
    console.log("ferrule [--port 4810] [--host 127.0.0.1] [--projects <folder>] [--no-open]");
    return;
  }

  const baseDir = opts.compiled ? dirname(process.execPath) : process.cwd();
  const storage = new Storage(resolve(args.projects ?? join(baseDir, "projects")));
  await storage.init();
  const assets = opts.assets ?? directoryAssets(resolve(import.meta.dir, "../../dist/web"));
  // Use the requested port, or the next free one.
  let server: ReturnType<typeof Bun.serve> | null = null;
  const local = args.host === "0.0.0.0" || args.host === "::" ? "127.0.0.1" : args.host;
  const app = createApp({
    storage,
    assets,
    version: VERSION,
    pdf: headlessBrowserRenderer(),
    selfUrl: () => `http://${local.includes(":") ? `[${local}]` : local}:${server?.port}`,
  });
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
  if (args.open) openBrowser(url);
}

if (import.meta.main) await start();
