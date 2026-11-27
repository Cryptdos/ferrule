/** v0.5 step 11: one Ferrule at a time (A5), and Claude relayed to a Ferrule by its address (A10). */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createApp } from "./app";
import { McpServer } from "./mcp";
import { Library, Storage } from "./storage";
import { ferruleAddress, parseArgs } from "./main";
import { VERSION } from "../core/version";

const MAIN = resolve(import.meta.dir, "main.ts");
let dir: string;
let server: ReturnType<typeof Bun.serve>;
let base: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "ferrule-step11-"));
  const storage = new Storage(join(dir, "projects"));
  await storage.init();
  const library = new Library(join(dir, "library"));
  const mcp = new McpServer({ storage, library, avoid: async () => null }, VERSION);
  server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: createApp({ storage, library, version: VERSION, mcp }).fetch });
  base = `http://127.0.0.1:${server.port}`;
});
afterAll(async () => {
  server.stop(true);
  await rm(dir, { recursive: true, force: true });
});

/** Run Ferrule as a second copy would be run, with stdin given, and wait for it to finish. */
async function run(args: string[], stdin = ""): Promise<{ code: number; out: string; err: string }> {
  const p = Bun.spawn(["bun", MAIN, "--projects", join(dir, "second"), ...args], { stdin: new Blob([stdin]), stdout: "pipe", stderr: "pipe" });
  const timer = setTimeout(() => p.kill(), 15_000);
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  clearTimeout(timer);
  return { code, out, err };
}

describe("step 11: running (A5, A10)", () => {
  test("--mcp takes an address: a name, a name and port, or a full address", () => {
    expect(ferruleAddress("server")).toBe("http://server:4810");
    expect(ferruleAddress("192.168.1.20:4811")).toBe("http://192.168.1.20:4811");
    expect(ferruleAddress("http://server.local:4810/mcp")).toBe("http://server.local:4810");
    expect(ferruleAddress("https://ferrule.example.com/")).toBe("https://ferrule.example.com");
    expect(parseArgs(["--mcp"])).toMatchObject({ mcp: true, mcpTo: null, open: false });
    expect(parseArgs(["--mcp", "server", "--port", "4900"])).toMatchObject({ mcp: true, mcpTo: "http://server:4900", port: 4900 });
    expect(parseArgs(["--mcp", "--no-open"]).mcpTo).toBeNull();
    expect(() => parseArgs(["--mcp", "server:99999"])).toThrow(/isn't an address/);
  });

  test("started while a Ferrule answers on its port, it says which and stops, not starting a second", async () => {
    const r = await run(["--port", String(server.port), "--no-open"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain(`Ferrule ${VERSION} is already running at ${base}/`);
    expect(r.out).not.toContain("Open http");
  });

  test("a port taken by something that isn't Ferrule is passed over, as before", async () => {
    const other = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response("not Ferrule") });
    const taken = other.port!;
    const p = Bun.spawn(["bun", MAIN, "--projects", join(dir, "third"), "--port", String(taken), "--no-open"], { stdout: "pipe", stderr: "pipe" });
    const reader = p.stdout.getReader();
    let out = "";
    const until = Date.now() + 15_000;
    while (!out.includes("Open http") && Date.now() < until) {
      const { value, done } = await reader.read();
      if (done) break;
      out += new TextDecoder().decode(value);
    }
    p.kill();
    await p.exited;
    other.stop(true);
    expect(out).toContain(`:${taken + 1}/`);
  });

  test("--mcp with an address relays Claude to that Ferrule", async () => {
    const msgs = [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
    ];
    const r = await run(["--mcp", `127.0.0.1:${server.port}`], msgs.map((m) => JSON.stringify(m)).join("\n") + "\n");
    expect(r.err).toContain(`relaying to Ferrule ${VERSION} at ${base}`);
    const replies = r.out.trim().split("\n").map((l) => JSON.parse(l));
    expect(replies.map((x) => x.id)).toEqual([1, 2]);
    expect(replies[1].result.tools.length).toBeGreaterThan(10);
  });

  test("an address that isn't answering is still relayed to, each request saying so", async () => {
    const r = await run(["--mcp", "127.0.0.1:1"], JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/list" }) + "\n");
    expect(r.err).toContain("isn't answering yet");
    expect(JSON.parse(r.out.trim())).toMatchObject({ id: 7, error: { message: expect.stringContaining("isn't reachable") } });
  });
});
