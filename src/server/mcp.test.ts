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
    const { data: created } = await call("create_project", { name: "MCP Panel" });
    const project = created.id;
    const add = async (symbol: string, x: number, y: number, extra: Record<string, unknown> = {}) =>
      (await call("add_element", { project, sheet: 1, symbol, x, y, ...extra })).data;
    const dists = (await call("add_distribution", { project, name: "CCT", kind: "dc+", voltage: "24 V DC" })).data;
    const ovd = (await call("add_distribution", { project, name: "0V", kind: "dc0" })).data.find((d: { name: string }) => d.name === "0V");
    const cct = await add("rail", 0, 10, { params: { dist: dists[0].id, length: 140 } });
    const ov = await add("rail", 0, 60, { params: { dist: ovd.id, length: 140 } });
    const s1 = await add("pushbutton", 30, 30, { label: "START" });
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
    // The wire off the CCT rail carries its supply's number (v0.5 A23); this one is the column's first by position.
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
    // A link end isn't placed (A27): it's the end of a wire.
    const r3 = await call("add_element", { project: "mcp-panel", sheet: 1, symbol: "link", x: 1, y: 1 });
    expect(r3.error).toBe(true);
    expect(r3.data).toContain("connect with {x, y}");
  });

  test("a wire to bare paper ends in a link end, and two pair up (A27)", async () => {
    const project = "mcp-panel";
    const k = (await call("add_element", { project, sheet: 1, symbol: "contact", x: 90, y: 20 })).data;
    const out = (await call("connect", { project, sheet: 1, from: { element: k.id, terminal: "14" }, to: { x: 90, y: 40, label: "FAN RUN" } })).data;
    expect(out.linkEnd).toBeTruthy();
    const h = (await call("add_element", { project, sheet: 1, symbol: "lamp", x: 110, y: 40 })).data;
    const inn = (await call("connect", { project, sheet: 1, from: { x: 110, y: 25, link: out.linkEnd }, to: { element: h.id, terminal: "+V" } })).data;
    const saved = await storage.load(project);
    const ends = saved.pages[0]!.elements.filter((e) => e.symbol === "link");
    expect(ends.map((e) => [e.id, e.params.source, e.links])).toEqual([
      [out.linkEnd, true, [inn.linkEnd]],
      [inn.linkEnd, false, [out.linkEnd]],
    ]);
    const symbols = (await call("list_symbols", {})).data as { id: string }[];
    expect(symbols.some((x) => x.id === "link")).toBe(false);
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

describe("MCP simulation", () => {
  test("simulate and check_logic", async () => {
    const project = (await call("create_project", { name: "Sim Panel" })).data.id;
    const add = async (symbol: string, x: number, y: number, params = {}) =>
      (await call("add_element", { project, sheet: 1, symbol, x, y, params })).data;
    const cd = (await call("add_distribution", { project, name: "CCT", kind: "dc+" })).data[0];
    const od = (await call("add_distribution", { project, name: "0V", kind: "dc0" })).data[1];
    const cct = await add("rail", 0, 10, { dist: cd.id, length: 140 });
    const ov = await add("rail", 0, 80, { dist: od.id, length: 140 });
    const s1 = await add("selector", 20, 30);
    const s2 = await add("selector", 60, 30);
    const q1 = await add("coil", 20, 70, { type: "contactor" });
    const q2 = await add("coil", 60, 70, { type: "contactor" });
    const c = (f: [string, string], t: [string, string]) =>
      call("connect", { project, sheet: 1, from: { element: f[0], terminal: f[1] }, to: { element: t[0], terminal: t[1] } });
    await c([cct.id, "20"], [s1.id, "13"]);
    await c([s1.id, "14"], [q1.id, "A1"]);
    await c([q1.id, "A2"], [ov.id, "20"]);
    await c([cct.id, "60"], [s2.id, "13"]);
    await c([s2.id, "14"], [q2.id, "A1"]);
    await c([q2.id, "A2"], [ov.id, "60"]);
    await call("renumber", { project });
    const run = (await call("simulate", { project, actions: [{ toggle: s1.id }] })).data;
    expect(run.steps[1].energised).toEqual(["Q1-11"]);
    const check = (await call("check_logic", { project, never: [[q1.id, q2.id]] })).data;
    expect(check.complete).toBe(true);
    expect(check.broken[0].after).toHaveLength(2);
    // The same as a saved expectation, named by tag.
    const tags = run.steps[1].energised[0] as string;
    const other = (await call("get_page", { project, sheet: 1 })).data.elements.find((e: { id: string }) => e.id === q2.id).tag;
    const set = (await call("set_expectation", { project, kind: "never", when: [{ thing: tags }, { thing: other }], join: "and" })).data;
    expect(set.expectations[0].text).toMatch(/^Never: Q.* energised and Q.* energised$/);
    const saved = (await call("check_logic", { project })).data;
    expect(saved.broken[0].expectation).toBe(set.expectations[0].text);
  });
});

describe("MCP controller tools", () => {
  test("add a controller and modules, place a view, renumber, and refer to its points", async () => {
    const proj = (await call("create_project", { name: "Controllers" })).data;
    const c = (await call("controller", { project: proj.id, description: "AHU-1 outstation" })).data;
    expect(c.tag).toBe("A?");
    await call("add_module", { project: proj.id, controller: c.id, type: "host" });
    const r = (await call("add_module", {
      project: proj.id,
      controller: "AHU-1 outstation",
      type: "do",
      channels: 4,
      pattern: { ids: "Y ⊥", first: 31, shared: "⊥", shareBy: 2 },
      labels: { DO1: "SF-01 enable" },
    })).data;
    const dout = r.slots[1];
    expect(dout.type).toBe("DO-4");
    expect(dout.points[0]).toEqual({ name: "DO1", ref: "A?:DO1", form: "contact", pins: ["31 (Y)", "32 (⊥)"], label: "SF-01 enable" });
    expect((await call("add_module", { project: proj.id, controller: c.id, spare: true })).data.slots[2].spare).toBe(true);
    const placed = await call("place_plant_view", { project: proj.id, sheet: 1, plant: dout.module, x: 44, y: 20 });
    expect(placed.error).toBe(false);
    await call("renumber", { project: proj.id });
    const list = (await call("controller", { project: proj.id })).data;
    expect(list[0].slots[1].tag).toBe("A1-23");
    expect(list[0].slots[1].drawn).toEqual(["1-23"]);
    expect(list[0].slots[1].points[0].ref).toBe("A1-23:DO1");
    const io = (await call("schedules", { project: proj.id, kind: "io" })).data;
    expect(io[0]).toMatchObject({ controller: "A? AHU-1 outstation", module: "A1-23 (DO-4)", point: "DO1", label: "SF-01 enable" });
    // Saved as a model, the next one comes from it.
    await call("add_module", { project: proj.id, module: "A1-23", saveModel: true });
    const again = (await call("add_module", { project: proj.id, controller: c.id, device: "DO-4 module" })).data;
    expect(again.slots.at(-1).type).toBe("DO-4");
    await call("add_page", { project: proj.id, title: "GA" });
    await call("update_page", { project: proj.id, sheet: 2, type: "ga" });
    const ga = await call("place_controller", { project: proj.id, sheet: 2, controller: c.id, x: 50, y: 100 });
    expect(ga.error).toBe(false);
    expect(ga.data.length).toBe(3);
    const bad = await call("add_module", { project: proj.id, controller: c.id, type: "xx" });
    expect(bad.error).toBe(true);
    const gone = (await call("controller", { project: proj.id, controller: c.id, delete: true })).data;
    expect(gone.controllers).toEqual([]);
  });
});
