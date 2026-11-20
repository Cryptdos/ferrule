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
    expect(await readdir(dir)).toContain("fan-panel.ferrule.json.bak");
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
