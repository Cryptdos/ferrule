import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "./app";
import { loadServerAvoid } from "./avoid";
import { McpServer } from "./mcp";
import { Library, Storage } from "./storage";

let dir: string;
let storage: Storage;
let mcp: McpServer;
let n = 0;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "ferrule-mcp-"));
  storage = new Storage(join(dir, "projects"));
  await storage.init();
  mcp = new McpServer({ storage, library: new Library(join(dir, "library")), avoid: loadServerAvoid }, "test");
});
afterAll(async () => {
  storage.close();
  await rm(dir, { recursive: true, force: true });
});

async function rpc(method: string, params: Record<string, unknown> = {}) {
  const r = (await mcp.handle({ jsonrpc: "2.0", id: ++n, method, params })) as { result?: any; error?: any };
  return r;
}
async function call(name: string, args: Record<string, unknown>) {
  const r = await rpc("tools/call", { name, arguments: args });
  const c = r.result.content[0];
  return { error: r.result.isError === true, data: c.type === "text" ? safeJson(c.text) : c };
}
const safeJson = (t: string) => {
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
};

describe("MCP protocol", () => {
  test("initialize, list tools, notifications get no reply", async () => {
    const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } });
    expect(init.result.protocolVersion).toBe("2025-06-18");
    expect(init.result.serverInfo.name).toBe("ferrule");
    expect(init.result.instructions).toContain("renumber");
    expect(await mcp.handle({ jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
    const list = await rpc("tools/list");
    const names = list.result.tools.map((t: { name: string }) => t.name);
    for (const t of ["project_info", "get_page", "add_page", "add_element", "move_element", "delete_element", "connect", "disconnect", "add_plant", "place_plant_view", "apply_template", "renumber", "check", "export_pdf"]) {
      expect(names).toContain(t);
    }
    expect((await rpc("nope")).error.code).toBe(-32601);
  });
});

describe("MCP tools", () => {
  test("draw a rung, renumber and check", async () => {
    const { data: created } = await call("create_project", { title: "MCP Panel" });
    const project = created.id;
    const add = async (symbol: string, x: number, y: number, extra: Record<string, unknown> = {}) =>
      (await call("add_element", { project, sheet: 1, symbol, x, y, ...extra })).data;
    const cct = await add("rail", 0, 10, { params: { name: "CCT", length: 190 } });
    const ov = await add("rail", 0, 60, { params: { name: "0V", length: 190 } });
    const s1 = await add("pb-no", 30, 30, { label: "START" });
    const k1 = await add("coil", 30, 57);
    expect(s1.terminals.map((t: { name: string }) => t.name)).toEqual(["13", "14"]);
    await call("connect", { project, sheet: 1, from: { element: cct.id, terminal: "30" }, to: { element: s1.id, terminal: "13" } });
    await call("connect", { project, sheet: 1, from: { element: s1.id, terminal: "14" }, to: { element: k1.id, terminal: "A1" } });
    await call("connect", { project, sheet: 1, from: { element: k1.id, terminal: "A2" }, to: { element: ov.id, terminal: "30" } });
    const r = await call("renumber", { project });
    expect(r.data.tags).toBe(2);
    const page = (await call("get_page", { project, sheet: 1 })).data;
    expect(page.elements.find((e: { id: string }) => e.id === k1.id).tag).toBe("K1-16");
    const wire = page.wires.find((w: { between: string }) => w.between === "S1-16:14 → K1-16:A1");
    expect(wire.number).toBe("1-16");
    // Routed on the server: a straight drop.
    const saved = await storage.load(project);
    expect(saved.pages[0]!.segments.find((s) => s.id === wire.id)!.points).toEqual([[30, 33], [30, 54]]);
    const checks = (await call("check", { project })).data;
    expect(checks.some((f: { message: string }) => f.message.includes("coil K1-16 has no contacts"))).toBe(true);
  });

  test("mistakes come back as tool errors the model can read", async () => {
    const r = await call("add_element", { project: "mcp-panel", sheet: 9, symbol: "coil", x: 1, y: 1 });
    expect(r.error).toBe(true);
    expect(r.data).toContain("No sheet 9");
    const r2 = await call("add_element", { project: "mcp-panel", sheet: 1, symbol: "warp-drive", x: 1, y: 1 });
    expect(r2.error).toBe(true);
    expect(r2.data).toContain("Unknown symbol");
  });

  test("plant, templates and stamping", async () => {
    const project = "mcp-panel";
    await call("add_plant", { project, tag: "SF-01", description: "Supply fan 1", terminals: ["U", "V", "W", "PE"] });
    const p2 = (await call("add_page", { project, title: "{plant:SF-01.tag} starter", boundaryY: 90 })).data.sheet;
    await call("place_plant_view", { project, sheet: p2, plant: "SF-01", x: 20, y: 100 });
    await call("add_section", { project, sheet: p2, label: "{plant:SF-01.tag} SECTION", x: 2, y: 2, w: 100, h: 84 });
    await call("save_template", { project, sheet: p2, name: "Starter" });
    const stamped = (await call("apply_template", { project, template: "Starter", plant: { "SF-01": "SF-02" } })).data;
    expect(stamped.sheet).toBe(3);
    const info = (await call("project_info", { project })).data;
    expect(info.plant.map((x: { tag: string }) => x.tag)).toEqual(["SF-01", "SF-02"]);
    expect(info.sheets[2].title).toBe("SF-02 starter");
    const page3 = (await call("get_page", { project, sheet: 3 })).data;
    expect(page3.sections[0].label).toBe("SF-02 SECTION");
    expect(page3.elements[0].tag).toBe("SF-02");
  });
});

describe("MCP over HTTP", () => {
  test("POST /mcp answers; notifications get 202; foreign origins are refused", async () => {
    const app = createApp({ storage, mcp });
    const post = (body: unknown, headers: Record<string, string> = {}) =>
      app.request("/mcp", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", ...headers } });
    const r = await post({ jsonrpc: "2.0", id: 1, method: "ping" });
    expect(await r.json()).toEqual({ jsonrpc: "2.0", id: 1, result: {} });
    expect((await post({ jsonrpc: "2.0", method: "notifications/initialized" })).status).toBe(202);
    expect((await post({ jsonrpc: "2.0", id: 2, method: "ping" }, { origin: "https://evil.example" })).status).toBe(403);
    expect((await post({ jsonrpc: "2.0", id: 3, method: "ping" }, { origin: "http://localhost:4810" })).status).toBe(200);
    expect((await app.request("/mcp")).status).toBe(405);
  });

  test("saving refuses to overwrite changes made elsewhere", async () => {
    const app = createApp({ storage });
    const res = await app.request("/api/projects/mcp-panel");
    const version = res.headers.get("x-ferrule-version")!;
    const p = await res.json();
    await call("update_project_info", { project: "mcp-panel", fields: { client: "ACME" } });
    const put = await app.request("/api/projects/mcp-panel", { method: "PUT", body: JSON.stringify(p), headers: { "if-match": version } });
    expect(put.status).toBe(409);
  });
});
