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

describe("step 10b: Rename, deleted projects, Upload (A21, A16, A9)", () => {
  const names = async () => (await readdir(dir)).filter((n) => n.endsWith(".ferrule") || n.endsWith(".bak"));

  test("Rename renames the file and its .bak where it is, refusing taken and illegal names", async () => {
    const p = await (await app.request("/api/projects", json({ name: "Boiler House" }))).json();
    // A save leaves a .bak beside it.
    await storage.save(p.id, p);
    expect(await names()).toContain("Boiler House.ferrule.bak");
    expect((await app.request(`/api/projects/${p.id}/rename`, json({ name: "plant room 2" }))).status).toBe(409);
    expect((await app.request(`/api/projects/${p.id}/rename`, json({ name: "Boiler:House" }))).status).toBe(400);
    const res = await app.request(`/api/projects/${p.id}/rename`, json({ name: "Boiler House East" }));
    expect(res.status).toBe(200);
    const { id } = await res.json();
    expect(id).toBe("boiler-house-east");
    const now = await names();
    expect(now).toContain("Boiler House East.ferrule");
    expect(now).toContain("Boiler House East.ferrule.bak");
    expect(now.some((n) => n.startsWith("Boiler House.ferrule"))).toBe(false);
    // Capitals alone can change: it's the same file's name.
    const again = await (await app.request(`/api/projects/${id}/rename`, json({ name: "BOILER HOUSE EAST" }))).json();
    expect(again.id).toBe(id);
    expect(await names()).toContain("BOILER HOUSE EAST.ferrule");
    expect((await storage.load(id)).pages.length).toBe(1);
  });

  test("a project open in an editor isn't renamed out from under it", async () => {
    const id = "boiler-house-east";
    const off = storage.subscribe(id, () => {});
    const res = await app.request(`/api/projects/${id}/rename`, json({ name: "Boiler House West" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/open in an editor/);
    off();
    expect((await app.request(`/api/projects/${id}/rename`, json({ name: "Boiler House West" }))).status).toBe(200);
  });

  test("deleted projects are listed by the name they had, restored under a name, or deleted for good", async () => {
    const id = "boiler-house-west";
    await storage.save(id, await storage.load(id));
    expect((await app.request(`/api/projects/${id}?file=1`, { method: "DELETE" })).status).toBe(200);
    const list = await (await app.request("/api/deleted")).json();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: "Boiler House West", pages: 1 });
    expect(Date.now() - Date.parse(list[0].deleted)).toBeLessThan(60_000);
    const file = list[0].file as string;
    // A name that's taken is refused; one that isn't in the Deleted folder isn't found.
    expect((await app.request("/api/deleted/restore", json({ file, name: "Plant Room 2" }))).status).toBe(409);
    expect((await app.request("/api/deleted/restore", json({ file: "../Plant Room 2.ferrule", name: "x" }))).status).toBe(404);
    const back = await app.request("/api/deleted/restore", json({ file, name: "Boiler House" }));
    expect(back.status).toBe(201);
    expect((await back.json()).id).toBe("boiler-house");
    expect(await names()).toEqual(expect.arrayContaining(["Boiler House.ferrule", "Boiler House.ferrule.bak"]));
    expect(await (await app.request("/api/deleted")).json()).toHaveLength(0);
    // Deleted again, then for good: the file and its .bak are gone.
    await app.request(`/api/projects/boiler-house?file=1`, { method: "DELETE" });
    const [gone] = await (await app.request("/api/deleted")).json();
    expect((await app.request("/api/deleted/purge", json({ file: gone.file }))).status).toBe(200);
    expect(await readdir(join(dir, "Deleted"))).toEqual([]);
  });

  test("Upload adds a .ferrule file under its own name, checked as opening one is", async () => {
    const text = JSON.stringify(newProject("whatever", "Uploaded"));
    const up = (name: string, body: string) => app.request(`/api/projects/upload?name=${encodeURIComponent(name)}`, { method: "POST", body });
    const res = await up("Chiller Plant.ferrule", text);
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("chiller-plant");
    expect((await storage.load("chiller-plant")).project.title).toBe("Uploaded");
    expect((await up("chiller plant.ferrule", text)).status).toBe(409);
    expect((await up("Notes.txt", text)).status).toBe(400);
    expect((await up("Broken.ferrule", "{not json")).status).toBe(400);
    const old = await up("Old.ferrule", JSON.stringify({ ...JSON.parse(text), version: 1 }));
    expect(old.status).toBe(400);
    expect((await old.json()).error).toMatch(/Not opened/);
    expect(await names()).not.toContain("Old.ferrule");
  });
});

describe("step 10c: rolling backups (A12, D1)", () => {
  let clock = Date.parse("2026-11-27T09:00:00Z");
  let s: Storage;
  let a: ReturnType<typeof createApp>;
  let d: string;
  const minutes = (n: number) => (clock += n * 60_000);
  const copies = async (name: string) => ((await readdir(join(d, "Backups")).catch(() => [])) as string[]).filter((f) => f.startsWith(name + " 2026")).sort();
  beforeAll(async () => {
    d = await mkdtemp(join(tmpdir(), "ferrule-step10c-"));
    s = new Storage(d, () => clock);
    await s.init();
    a = createApp({ storage: s, examples: {} });
  });
  afterAll(() => rm(d, { recursive: true, force: true }));

  test("a new project starts at a copy every 30 minutes, 10 kept; the settings are kept within limits", async () => {
    const p = await s.create("AHU 1");
    expect(p.backups).toEqual({ every: 30, keep: 10 });
    const { parseProject } = await import("../core/validate");
    expect(parseProject({ ...p, backups: { every: 0, keep: 500 } }).backups).toEqual({ every: 1, keep: 100 });
    expect(parseProject({ ...p, backups: undefined }).backups).toEqual({ every: 30, keep: 10 });
  });

  test("a copy is taken on a save when the last is old enough and the project has changed since", async () => {
    const p = await s.load("ahu-1");
    await s.save("ahu-1", p);
    expect(await copies("AHU 1")).toHaveLength(1);
    // Saved again ten minutes on: too soon.
    minutes(10);
    p.project.title = "Air handler";
    await s.save("ahu-1", p);
    expect(await copies("AHU 1")).toHaveLength(1);
    // Half an hour on: a second copy.
    minutes(25);
    await s.save("ahu-1", p);
    expect(await copies("AHU 1")).toHaveLength(2);
    // Saved again later with nothing changed since that copy: none.
    minutes(60);
    await s.save("ahu-1", p);
    expect(await copies("AHU 1")).toHaveLength(2);
  });

  test("the oldest go once there are more than are kept; keeping none takes none", async () => {
    const p = await s.load("ahu-1");
    p.backups = { every: 1, keep: 3 };
    for (let i = 0; i < 5; i++) {
      minutes(2);
      p.project.jobNo = `J${i}`;
      await s.save("ahu-1", p);
    }
    const kept = await copies("AHU 1");
    expect(kept).toHaveLength(3);
    // The newest are the ones kept.
    expect(kept.at(-1)).toContain("2026-11-27T10-45");
    p.backups = { every: 1, keep: 0 };
    minutes(5);
    p.project.jobNo = "J9";
    await s.save("ahu-1", p);
    expect(await copies("AHU 1")).toHaveLength(3);
  });

  test("the list shows them newest first; one restores into a new project under a name, the project left alone", async () => {
    const list = await (await a.request("/api/projects/ahu-1/backups")).json();
    expect(list.keep).toBe(0);
    expect(list.copies).toHaveLength(3);
    expect(list.copies[0].taken > list.copies[2].taken).toBe(true);
    const oldest = list.copies[2];
    expect((await a.request("/api/projects/ahu-1/backups/restore", json({ file: oldest.file, name: "AHU 1" }))).status).toBe(409);
    expect((await a.request("/api/projects/ahu-1/backups/restore", json({ file: "../AHU 1.ferrule", name: "x" }))).status).toBe(404);
    const res = await a.request("/api/projects/ahu-1/backups/restore", json({ file: oldest.file, name: "AHU 1 before" }));
    expect(res.status).toBe(201);
    const { id } = await res.json();
    expect((await s.load(id)).project.jobNo).toBe("J2");
    expect((await s.load("ahu-1")).project.jobNo).toBe("J9");
    // A restored project starts its own run of copies.
    expect(await copies("AHU 1 before")).toHaveLength(0);
  });

  test("Rename takes the backups with it, each keeping its time", async () => {
    const before = await copies("AHU 1");
    const { id } = await (await a.request("/api/projects/ahu-1/rename", json({ name: "AHU-01" }))).json();
    expect(id).toBe("ahu-01");
    const after = await copies("AHU-01");
    expect(after.map((f) => f.slice("AHU-01".length))).toEqual(before.map((f) => f.slice("AHU 1".length)));
    expect(await copies("AHU 1 ")).toHaveLength(0);
    expect((await (await a.request("/api/projects/ahu-01/backups")).json()).copies).toHaveLength(3);
  });
});
