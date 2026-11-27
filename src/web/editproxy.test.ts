/**
 * The editor holds what it shows as Svelte `$state`: reactive proxies. An
 * edit runs on a plain copy of the project (`Editor.apply`), but what it
 * takes in can still come from a proxy: a library device, a Design template.
 * `structuredClone` refuses a proxy, so copying one with it fails in the
 * editor while every test on plain data passes. Model code copies with
 * `clone` (`src/core/model.ts`) instead.
 */
import { describe, expect, test } from "bun:test";
import { proxy } from "svelte/internal/client";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { newProject, type Project } from "../core/model";
import { addController, addModule, addModuleFromDevice, saveModuleDevice } from "../core/controllers";
import { addSystem, designTemplateOf, insertDesignTemplate } from "../core/design";
import { bringDevices } from "../core/templates";
import { projectCopy, type DeviceEntry } from "../core/devices";
import { buildBms01 } from "../bench/bms01";

/** Ids differ from run to run: number them in the order they first appear. */
function normalise(p: unknown): string {
  const seen = new Map<string, string>();
  return JSON.stringify(p).replace(/\b([a-z]+)_[0-9a-z]{5,}\b/g, (id, kind: string) => {
    if (!seen.has(id)) seen.set(id, `${kind}#${seen.size}`);
    return seen.get(id)!;
  });
}

/** The same edit given plain data, and given it as the editor holds it. */
function bothWays<T>(input: T, edit: (p: Project, input: T) => void): { plain: string; held: string } {
  const a = newProject("p", "P");
  edit(a, JSON.parse(JSON.stringify(input)));
  const b = newProject("p", "P");
  edit(b, proxy(JSON.parse(JSON.stringify(input))));
  return { plain: normalise(a), held: normalise(b) };
}

describe("an edit takes what the editor holds", () => {
  const bms = buildBms01(null).project;

  test("a module saved as a device, added from the project's devices or the library", () => {
    const p = newProject("p", "P");
    const c = addController(p, "Panel controller");
    const d = saveModuleDevice(p, addModule(p, c.id, { type: "di", channels: 8 }).id);
    expect(d.module?.pins).toBeDefined();
    const r = bothWays(d, (q, dev) => addModuleFromDevice(q, addController(q, "Panel controller").id, dev));
    expect(r.held).toBe(r.plain);
    const entry = { ...d, library: true } as unknown as DeviceEntry;
    expect(normalise(projectCopy(proxy(JSON.parse(JSON.stringify(entry)))))).toBe(normalise(projectCopy(entry)));
  });

  test("a Design template, and its devices, into a project that has none", () => {
    const rows = bms.plant.filter((x) => !x.module && x.device).map((x) => x.id);
    const t = designTemplateOf(proxy(JSON.parse(JSON.stringify(bms))), rows.slice(0, 2), "Template");
    expect(t.devices?.length).toBeGreaterThan(0);
    const r = bothWays(t, (p, tt) => insertDesignTemplate(p, tt, { system: addSystem(p, "AHU") }));
    expect(r.held).toBe(r.plain);
    const s = bothWays(t.devices, (p, devs) => bringDevices(p, devs));
    expect(s.held).toBe(s.plain);
    expect(JSON.parse(s.held).devices).toHaveLength(t.devices!.length);
  });

  test("nothing copies with structuredClone", () => {
    const files = (sub: string) =>
      readdirSync(join(import.meta.dir, "..", sub))
        .filter((f) => /\.(ts|svelte)$/.test(f) && !f.endsWith(".test.ts"))
        .map((f) => join(import.meta.dir, "..", sub, f));
    const bad = [...files("core"), ...files("web"), ...files("web/components"), ...files("server")].flatMap((f) =>
      readFileSync(f, "utf8")
        .split("\n")
        .map((line, i) => ({ at: `${f}:${i + 1}`, line }))
        .filter(({ line }) => /\bstructuredClone\(/.test(line)),
    );
    expect(bad).toEqual([]);
  });
});
