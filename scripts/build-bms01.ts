/**
 * Writes the BMS-01 fixture (src/bench/bms01.ts) to a file, e.g. into a
 * projects folder to open in Ferrule:
 *
 *   bun scripts/build-bms01.ts projects/bms-01.ferrule.json
 */
import { buildBms01 } from "../src/bench/bms01";
import { loadServerAvoid } from "../src/server/avoid";

const out = process.argv[2] ?? "bms-01.ferrule.json";
const { project } = buildBms01(await loadServerAvoid());
await Bun.write(out, JSON.stringify(project, null, 1));
console.log(`Wrote ${out}: ${project.pages.length} sheets`);
