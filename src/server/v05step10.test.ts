/** v0.5 step 10: files and the project list. */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "./app";
import { Storage } from "./storage";
import { fileKey, fileNameProblem } from "../core/filenames";
import { newProject } from "../core/model";

let dir: string;
let storage: Storage;
let app: ReturnType<typeof createApp>;
const json = (body: unknown) => ({ method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "ferrule-step10-"));
  storage = new Storage(dir);
  await storage.init();
  app = createApp({ storage, examples: { "lsp-01": async () => newProject("x", "Example Building") } });
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe("step 10a: a project is made from a file name (A17, A8, D2)", () => {
  test("legal names are Windows' everywhere; names compare as file names", () => {
    expect(fileNameProblem("LSP 01 Panel")).toBeNull();
    expect(fileNameProblem("Panel (rev B)")).toBeNull();
    for (const bad of ["a/b", "a\\b", "a:b", "a*b", "a?b", 'a"b', "a<b", "a>b", "a|b", "", "  ", "ends.", "ends ", "CON", "lpt1.txt"]) expect(fileNameProblem(bad)).not.toBeNull();
    expect(fileKey("LSP 01")).toBe(fileKey("lsp-01"));
    expect(fileKey("Kitchen Panel, rev B")).toBe("kitchen-panel-rev-b");
  });

  test("the name typed is the file; it has no title; a taken name is refused, with the reason", async () => {
    const res = await app.request("/api/projects", json({ name: "Plant Room 2" }));
    expect(res.status).toBe(201);
    const p = await res.json();
    expect(p.project.title).toBe("");
    expect(await readdir(dir)).toContain("Plant Room 2.ferrule");
    const list = await (await app.request("/api/projects")).json();
    expect(list.find((x: { id: string }) => x.id === p.id)).toMatchObject({ name: "Plant Room 2", title: "" });
    // Loaded, it says its file's name.
    const got = await app.request(`/api/projects/${p.id}`);
    expect(decodeURIComponent(got.headers.get("x-ferrule-file") ?? "")).toBe("Plant Room 2");
    // Downloaded under it too.
    expect((await app.request(`/api/projects/${p.id}/file`)).headers.get("content-disposition")).toContain('filename="Plant Room 2.ferrule"');
    for (const name of ["plant room 2", "PLANT-ROOM-2"]) expect((await app.request("/api/projects", json({ name }))).status).toBe(409);
    const bad = await app.request("/api/projects", json({ name: "Plant/Room" }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toMatch(/can't have any of/);
  });

  test("the example is added under its name, and a second time is refused", async () => {
    const a = await app.request("/api/examples/lsp-01", { method: "POST" });
    expect(a.status).toBe(201);
    expect(await readdir(dir)).toContain("LSP-01.ferrule");
    expect((await app.request("/api/examples/lsp-01", { method: "POST" })).status).toBe(409);
  });
});
