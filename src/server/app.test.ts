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
