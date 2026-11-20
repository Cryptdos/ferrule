/**
 * Builds the portable Ferrule executable (DESIGN.md §19): the server with
 * the browser UI embedded, as one file with nothing to install.
 *
 *   bun scripts/build-exe.ts                 # Windows x64 → dist/ferrule.exe
 *   bun scripts/build-exe.ts --target linux  # this machine's OS, for testing
 */
import { readdir, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const root = join(import.meta.dir, "..");
const web = join(root, "dist", "web");

const targetArg = process.argv.includes("--target") ? process.argv[process.argv.indexOf("--target") + 1] : "windows";
const targets: Record<string, { bun: string; out: string }> = {
  windows: { bun: "bun-windows-x64", out: "dist/ferrule.exe" },
  linux: { bun: "bun-linux-x64", out: "dist/ferrule-linux" },
  mac: { bun: "bun-darwin-arm64", out: "dist/ferrule-mac" },
};
const target = targets[targetArg ?? "windows"];
if (!target) {
  console.error(`Unknown target "${targetArg}". Use one of: ${Object.keys(targets).join(", ")}`);
  process.exit(2);
}

async function run(cmd: string[]) {
  const p = Bun.spawn(cmd, { cwd: root, stdout: "inherit", stderr: "inherit" });
  if ((await p.exited) !== 0) throw new Error(`Failed: ${cmd.join(" ")}`);
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

await run(["bun", "x", "vite", "build"]);

// An entry point that imports every UI file so it's embedded in the binary.
const files = await walk(web);
const entry = join(root, "dist", "exe-entry.ts");
const lines = [
  `import { start } from "../src/server/main";`,
  `import { embeddedAssets } from "../src/server/assets";`,
];
const map: string[] = [];
files.forEach((f, i) => {
  const rel = relative(join(root, "dist"), f).split(sep).join("/");
  lines.push(`import f${i} from "./${rel}" with { type: "file" };`);
  map.push(`  ${JSON.stringify("/" + relative(web, f).split(sep).join("/"))}: f${i},`);
});
lines.push(`await start({ compiled: true, assets: embeddedAssets({\n${map.join("\n")}\n}) });`);
await writeFile(entry, lines.join("\n") + "\n");

await run(["bun", "build", "--compile", "--minify", `--target=${target.bun}`, entry, "--outfile", target.out]);
console.log(`Built ${target.out}`);
