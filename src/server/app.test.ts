import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "./app";
import { Storage } from "./storage";

let dir: string;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "ferrule-test-"));
  const storage = new Storage(dir);
  await storage.init();
  app = createApp({ storage });
});
afterAll(() => rm(dir, { recursive: true, force: true }));

const json = (body: unknown) => ({ method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

describe("project API", () => {
  test("create, list, load, save", async () => {
    const created = await (await app.request("/api/projects", json({ title: "Fan Panel" }))).json();
    expect(created.id).toBe("fan-panel");

    const again = await (await app.request("/api/projects", json({ title: "Fan Panel" }))).json();
    expect(again.id).toBe("fan-panel-2");

    const list = await (await app.request("/api/projects")).json();
    expect(list.map((p: { id: string }) => p.id).sort()).toEqual(["fan-panel", "fan-panel-2"]);

    created.project.client = "ACME";
    const put = await app.request("/api/projects/fan-panel", { method: "PUT", body: JSON.stringify(created) });
    expect(put.status).toBe(200);
    const loaded = await (await app.request("/api/projects/fan-panel")).json();
    expect(loaded.project.client).toBe("ACME");
    expect(await readdir(dir)).toContain("fan-panel.ferrule.bak");
  });

  test("rejects bad ids, bad data and mismatched ids", async () => {
    expect((await app.request("/api/projects/..%2Fetc")).status).toBe(400);
    expect((await app.request("/api/projects/missing")).status).toBe(404);
    const bad = await app.request("/api/projects/fan-panel", { method: "PUT", body: JSON.stringify({ hello: 1 }) });
    expect(bad.status).toBe(400);
    const p = await (await app.request("/api/projects/fan-panel")).json();
    const wrong = await app.request("/api/projects/fan-panel-2", { method: "PUT", body: JSON.stringify(p) });
    expect(wrong.status).toBe(400);
  });
});

describe("PDF export", () => {
  test("prints the project's print page and names the file after the drawing", async () => {
    const storage = new Storage(dir);
    const urls: string[] = [];
    const pdfApp = createApp({
      storage,
      selfUrl: () => "http://127.0.0.1:9999",
      pdf: {
        async render(url) {
          urls.push(url);
          return new TextEncoder().encode("%PDF-1.4 fake");
        },
      },
    });
    const p = await storage.load("fan-panel");
    p.project.drawingNo = "LSP-01/E/001";
    await storage.save("fan-panel", p);
    const res = await pdfApp.request("/api/projects/fan-panel/pdf");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain('filename="LSP-01-E-001.pdf"');
    expect(urls).toEqual(["http://127.0.0.1:9999/print/fan-panel"]);
  });

  test("print page embeds the project", async () => {
    const storage = new Storage(dir);
    const html = "<html><head></head><body></body></html>";
    const a = createApp({ storage, assets: { get: async (path) => (path === "/index.html" ? new Response(html) : null) } });
    const res = await a.request("/print/fan-panel");
    const text = await res.text();
    expect(text).toContain("window.__FERRULE_PRINT__=");
    expect(text).toContain('"id":"fan-panel"');
  });

  test("without a renderer the API says so", async () => {
    const res = await app.request("/api/projects/fan-panel/pdf");
    expect(res.status).toBe(503);
  });
});

describe("template library", () => {
  test("save, list, load", async () => {
    const { Library } = await import("./storage");
    const { saveSheetTemplate } = await import("../core/templates");
    const { addPlant, placePlantView } = await import("../core/ops");
    const lib = new Library(join(dir, "library"));
    const a = createApp({ storage: new Storage(dir), library: lib });
    const p = await new Storage(dir).load("fan-panel");
    const sf = addPlant(p, "SF-01", "Fan", ["U", "V", "W"]);
    placePlantView(p, p.pages[0]!.id, sf.id, [20, 100]);
    const t = saveSheetTemplate(p, p.pages[0]!.id, "Fan starter");
    const res = await a.request("/api/library", { method: "POST", body: JSON.stringify(t) });
    expect(res.status).toBe(201);
    expect((await res.json()).file).toBe("fan-starter");
    const list = await (await a.request("/api/library")).json();
    expect(list).toEqual([{ file: "fan-starter", name: "Fan starter", kind: "sheet", plant: ["SF-01"] }]);
    const back = await (await a.request("/api/library/fan-starter")).json();
    expect(back.elements).toHaveLength(1);
    expect((await a.request("/api/library/nope")).status).toBe(404);
  });
});

describe("examples", () => {
  test("adds a copy of an example project", async () => {
    const { buildLsp01 } = await import("../bench/lsp01");
    const a = createApp({ storage: new Storage(dir), examples: { "lsp-01": async () => buildLsp01(null).project } });
    const res = await a.request("/api/examples/lsp-01", { method: "POST" });
    expect(res.status).toBe(201);
    const { id } = await res.json();
    const p = await (await a.request(`/api/projects/${id}`)).json();
    expect(p.pages).toHaveLength(14);
    expect((await a.request("/api/examples/nope", { method: "POST" })).status).toBe(404);
  });
});

describe("project files anywhere", () => {
  test("save as, open, list, duplicate, delete, browse", async () => {
    const elsewhere = await mkdtemp(join(tmpdir(), "ferrule-elsewhere-"));
    try {
      const created = await (await app.request("/api/projects", json({ title: "Kitchen Panel" }))).json();
      // Save As puts a copy somewhere else and gives it its own id.
      const saved = await (await app.request(`/api/projects/${created.id}/save-as`, json({ path: join(elsewhere, "Kitchen") }))).json();
      expect(saved.id).toMatch(/^kitchen-[0-9a-f]{6}$/);
      expect(await readdir(elsewhere)).toContain("Kitchen.ferrule");
      // A second Save As to the same name is refused unless asked to overwrite.
      expect((await app.request(`/api/projects/${created.id}/save-as`, json({ path: join(elsewhere, "Kitchen.ferrule") }))).status).toBe(409);
      // It's on the list, from elsewhere, and opens again by its path to the same id.
      const list = await (await app.request("/api/projects")).json();
      expect(list.find((p: { id: string }) => p.id === saved.id).where).toBe("elsewhere");
      const opened = await (await app.request("/api/projects/open", json({ path: join(elsewhere, "Kitchen.ferrule") }))).json();
      expect(opened.id).toBe(saved.id);
      const loaded = await (await app.request(`/api/projects/${saved.id}`)).json();
      expect(loaded.id).toBe(saved.id);
      // The folder browser lists it.
      const listing = await (await app.request(`/api/browse?path=${encodeURIComponent(elsewhere)}`)).json();
      expect(listing.files.map((f: { name: string }) => f.name)).toEqual(["Kitchen.ferrule"]);
      // Duplicate, then delete: the file moves to Deleted, not destroyed.
      const dup = await (await app.request(`/api/projects/${created.id}/duplicate`, { method: "POST" })).json();
      expect((await app.request(`/api/projects/${dup.id}?file=1`, { method: "DELETE" })).status).toBe(200);
      expect((await readdir(join(dir, "Deleted"))).length).toBe(1);
      // Removing one from elsewhere from the list leaves its file alone.
      expect((await app.request(`/api/projects/${saved.id}`, { method: "DELETE" })).status).toBe(200);
      expect(await readdir(elsewhere)).toContain("Kitchen.ferrule");
    } finally {
      await rm(elsewhere, { recursive: true, force: true });
    }
  });
});

describe("device library", () => {
  test("add, edit, attach a datasheet and a picture, read them back, delete", async () => {
    const { DeviceLibrary } = await import("./devices");
    const devices = new DeviceLibrary(join(dir, "library", "devices"));
    const a = createApp({ storage: new Storage(dir), devices });
    const res = await a.request("/api/devices", json({ name: "Relay 4CO", maker: "Weidmüller", part: "7760056085", kind: "relay", w: 30.6, h: 101.8, d: 82.3 }));
    expect(res.status).toBe(201);
    const dev = await res.json();
    expect(dev.id).toBe("relay-4co-7760056085");
    expect((await a.request("/api/devices", json({ name: "" }))).status).toBe(400);

    const put = await a.request(`/api/devices/${dev.id}`, { method: "PUT", body: JSON.stringify({ h: 100 }), headers: { "content-type": "application/json" } });
    expect((await put.json()).h).toBe(100);

    const pdf = new TextEncoder().encode("%PDF-1.4 fake");
    const up = await a.request(`/api/devices/${dev.id}/files?name=${encodeURIComponent("DRM datasheet.pdf")}`, { method: "POST", body: pdf });
    expect(up.status).toBe(201);
    const pic = await a.request(`/api/devices/${dev.id}/files?name=photo.png`, { method: "POST", body: new Uint8Array([137, 80, 78, 71]) });
    const withFiles = await pic.json();
    expect(withFiles.files.map((f: { name: string; type: string }) => `${f.type}:${f.name}`)).toEqual(["datasheet:DRM datasheet.pdf", "picture:photo.png"]);
    expect((await a.request(`/api/devices/${dev.id}/files?name=evil.exe`, { method: "POST", body: pdf })).status).toBe(400);

    const got = await a.request(`/api/devices/${dev.id}/files/${encodeURIComponent("DRM datasheet.pdf")}`);
    expect(got.headers.get("content-type")).toBe("application/pdf");
    expect(await got.text()).toBe("%PDF-1.4 fake");

    // A fresh library object reads the same file back.
    const again = await new DeviceLibrary(join(dir, "library", "devices")).list();
    expect(again[0]!.files).toHaveLength(2);

    await a.request(`/api/devices/${dev.id}/files/photo.png`, { method: "DELETE" });
    expect((await (await a.request("/api/devices")).json())[0].files).toHaveLength(1);
    await a.request(`/api/devices/${dev.id}`, { method: "DELETE" });
    expect(await (await a.request("/api/devices")).json()).toEqual([]);
  });

  test("a new project can leave the library out", async () => {
    const created = await (await app.request("/api/projects", json({ title: "No lib", useDeviceLibrary: false }))).json();
    expect(created.useDeviceLibrary).toBe(false);
  });
});

describe("save as", () => {
  test("refuses to replace a file unless asked, and keeps the old one as .bak", async () => {
    const { existsSync } = await import("node:fs");
    const p = await (await app.request("/api/projects", json({ title: "Save as test" }))).json();
    const target = join(dir, "elsewhere", "copy.ferrule");
    const post = (overwrite?: boolean) => app.request(`/api/projects/${p.id}/save-as`, json({ path: target, ...(overwrite ? { overwrite } : {}) }));
    expect((await post()).status).toBe(200);
    expect((await post()).status).toBe(409);
    expect((await post(true)).status).toBe(200);
    expect(existsSync(target + ".bak")).toBe(true);
  });
});
