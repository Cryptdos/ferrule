/**
 * Writes the LSP-01 benchmark project (src/bench/lsp01.ts) to a file, e.g.
 * into a projects folder to open in Ferrule:
 *
 *   bun scripts/build-lsp01.ts projects/lsp-01.ferrule.json
 */
import { buildLsp01 } from "../src/bench/lsp01";
import { loadServerAvoid } from "../src/server/avoid";

const out = process.argv[2] ?? "lsp-01.ferrule.json";
const { project } = buildLsp01(await loadServerAvoid());
await Bun.write(out, JSON.stringify(project, null, 1));
console.log(`Wrote ${out}: ${project.pages.length} sheets`);
