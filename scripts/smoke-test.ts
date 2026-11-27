/**
 * End-to-end check of a built Ferrule (v0.5 A11): starts the binary on a
 * scratch projects folder, and works it over HTTP as the browser would.
 *
 *   bun scripts/smoke-test.ts dist/ferrule-linux
 *
 * Exits non-zero, saying what failed, if anything does.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import pkg from "../package.json" with { type: "json" };

const bin = process.argv[2];
if (!bin) {
  console.error("Usage: bun scripts/smoke-test.ts <path to the built ferrule>");
  process.exit(2);
}
const port = 4890 + Math.floor(Math.random() * 9);
const base = `http://127.0.0.1:${port}`;
const dir = await mkdtemp(join(tmpdir(), "ferrule-smoke-"));
const proc = Bun.spawn([resolve(bin), "--projects", dir, "--no-open", "--host", "127.0.0.1", "--port", String(port)], { stdout: "pipe", stderr: "inherit" });

function check(ok: unknown, what: string): void {
  if (!ok) throw new Error(what);
  console.log(`ok  ${what}`);
}
async function json(path: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const r = await fetch(base + path, init);
  return { status: r.status, body: await r.json().catch(() => null) };
}

try {
  let up = false;
  for (let i = 0; i < 100 && !up; i++) {
    up = await fetch(`${base}/api/status`).then((r) => r.ok, () => false);
    if (!up) await Bun.sleep(100);
  }
  check(up, `it answers on ${base}`);
  const status = (await json("/api/status")).body;
  check(status.version === pkg.version, `it says it's version ${pkg.version} (${status.version})`);
  check(resolve(status.projects) === resolve(dir), "it works on the projects folder it was given");
  const page = await fetch(`${base}/`).then((r) => r.text());
  check(/<script/.test(page), "the page and its scripts are served from inside the binary");
  const made = await json("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Smoke test" }) });
  check(made.status === 201 || made.status === 200, "a project is created");
  const loaded = await json(`/api/projects/${made.body.id}`);
  check(loaded.status === 200 && loaded.body.pages.length === 1, "it opens with one sheet");
  const examples = (await json("/api/examples")).body as string[];
  check(examples.length > 0, `the examples are there (${examples.join(", ")})`);
  const ex = await json(`/api/examples/${examples[0]}`, { method: "POST" });
  check(ex.status === 201, `the ${examples[0]} example is added`);
  const big = await json(`/api/projects/${ex.body.id}`);
  check(big.status === 200 && big.body.pages.length > 1, `it opens, ${big.body.pages?.length} sheets`);
  const print = await fetch(`${base}/print/${ex.body.id}?page=1`);
  check(print.ok, "its first sheet prints");
  const list = (await json("/api/projects")).body as { id: string; error?: string }[];
  check(list.length === 2 && list.every((p) => !p.error), "the project list shows both, neither refused");
  console.log("Smoke test passed.");
} catch (e) {
  console.error(`FAILED: ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  proc.kill();
  await proc.exited;
  await rm(dir, { recursive: true, force: true });
}
