import type { Distribution, Project } from "./model";

/**
 * Core colours (IEC 60757 letters, written Bu, GnYe… for readability) and
 * common conductor functions, offered when labelling a wire. Anything else
 * can be typed in.
 */
export const WIRE_COLOURS = [
  { code: "Bk", name: "black" },
  { code: "Bn", name: "brown" },
  { code: "Rd", name: "red" },
  { code: "Og", name: "orange" },
  { code: "Ye", name: "yellow" },
  { code: "Gn", name: "green" },
  { code: "Bu", name: "blue" },
  { code: "Vt", name: "violet" },
  { code: "Gy", name: "grey" },
  { code: "Wh", name: "white" },
  { code: "Pk", name: "pink" },
  { code: "Tq", name: "turquoise" },
  { code: "GnYe", name: "green-yellow (earth)" },
];

/** How each core colour is drawn in Colour check (v0.2.1 note 31). */
export const CORE_CSS: Record<string, string> = {
  Bk: "#1a1a1a",
  Bn: "#8b4a1c",
  Rd: "#e02020",
  Og: "#f08a00",
  Ye: "#f2c400",
  Gn: "#1f9d3a",
  Bu: "#1e5fd6",
  Vt: "#8a3fc8",
  Gy: "#8c8c8c",
  Wh: "#ffffff",
  Pk: "#f07ab8",
  Tq: "#1fb5b0",
};

/** A core colour as drawn: one CSS colour, or two (green-yellow and the like). Unknown or unset: none. */
export function coreCss(code: string | undefined): string[] {
  if (!code) return [];
  const pairs = code.match(/[A-Z][a-z]/g) ?? [];
  const css = pairs.map((p) => CORE_CSS[p]).filter((c): c is string => !!c);
  return css.length === pairs.length ? css : [];
}

/**
 * A colour code as we write it: each two-letter colour with a capital
 * first letter ("BU" → "Bu", "gnye" → "GnYe"). Anything that isn't made of
 * two-letter colour codes is kept as typed.
 */
export function colourCode(s: string): string {
  const t = s.trim();
  const known = new Set([...WIRE_COLOURS.map((c) => c.code.toLowerCase()), "am", "cl"]);
  const pairs = /^([a-z]{2})+$/i.test(t) ? t.toLowerCase().match(/../g)! : [];
  if (!pairs.length || !pairs.every((p) => known.has(p))) return t;
  return pairs.map((p) => p[0]!.toUpperCase() + p[1]).join("");
}

/**
 * A colour typed in words or letters, as one of the listed codes if it is
 * one ("blue", "BU", "green-yellow" → Bu, Bu, GnYe); otherwise as typed.
 */
export function knownColour(s: string): string {
  const t = s.trim().toLowerCase();
  if (!t) return "";
  const byName = WIRE_COLOURS.find((c) => c.name.split(" ")[0] === t || c.name === t);
  if (byName) return byName.code;
  if (t === "green/yellow" || t === "green and yellow") return "GnYe";
  return colourCode(s);
}

/** A busbar's core colour choices: from its distribution, or one of the listed colours (T4). */
export const BUSBAR_COLOUR_OPTIONS = [{ value: "", label: "From its distribution" }, ...WIRE_COLOURS.map((c) => ({ value: c.code, label: `${c.code}, ${c.name}` }))];

/** A lamp colour as we write it. Amber isn't an IEC colour: yellow is used for it; clear (or none) is white. */
export function lampColour(s: string): string {
  const c = colourCode(s);
  if (c === "Am") return "Ye";
  if (!c || c === "Cl") return "Wh";
  return c;
}

export const WIRE_FUNCTIONS = ["0V", "24V", "24V AC", "24V DC", "230V", "L", "N", "L1", "L2", "L3", "PE", "0-10V", "SIG", "COM", "FE"];


// ---------------------------------------------------------------------------
// Wire colour by function (v0.4.x M3)

/** The functions the table starts with, colours empty; any other can be added. */
export const FUNCTION_ROWS = ["phase", "neutral", "earth", "24 V +", "0 V", "DC signal", "AC signal", "external supply"];

/** A distribution's function: by its kind (a DC + named by its voltage, "24 V +"). */
export function distributionFunction(d: Distribution): string {
  if (d.kind === "line") return "phase";
  if (d.kind === "neutral") return "neutral";
  if (d.kind === "earth") return "earth";
  if (d.kind === "dc0") return "0 V";
  const v = /(\d+(?:\.\d+)?)\s*v/i.exec(d.voltage ?? "");
  return v ? `${v[1]} V +` : "DC +";
}

/** The table's colour for a function, matched without regard to case or spaces. */
export function functionColour(project: Project, func: string | undefined): string | undefined {
  if (!func || !project.wireColours) return undefined;
  const k = func.replace(/\s+/g, "").toLowerCase();
  for (const [f, c] of Object.entries(project.wireColours)) if (f.replace(/\s+/g, "").toLowerCase() === k) return c;
  return undefined;
}

/**
 * Each conductor's function and colour as drawn (v0.4.x M3). Its function
 * comes from its distribution when it's on one (a busbar, rail or arrow on
 * it), else from the function set on the wire. Its colour is its own, set
 * on the wire; else its function's, from the project's table.
 */
export function conductorLooks(project: Project): Map<string, { func?: string; colour?: string; fromTable?: true }> {
  const out = new Map<string, { func?: string; colour?: string; fromTable?: true }>();
  const distOf = new Map<string, Distribution>();
  for (const pg of project.pages)
    for (const el of pg.elements) {
      const d = typeof el.params.dist === "string" ? project.distributions.find((x) => x.id === el.params.dist) : undefined;
      if (d) distOf.set(el.id, d);
    }
  for (const c of project.conductors) {
    const d = c.terminals.map(([id]) => distOf.get(id)).find((x) => !!x);
    const func = d ? distributionFunction(d) : c.function;
    const table = c.colour ? undefined : functionColour(project, func);
    out.set(c.id, { ...(func ? { func } : {}), ...(c.colour ? { colour: c.colour } : table ? { colour: table, fromTable: true as const } : {}) });
  }
  return out;
}

/** The functions to list in the table: its starting rows, those it has, and those in use on wires. */
export function functionRows(project: Project): string[] {
  const rows = [...FUNCTION_ROWS];
  const add = (f: string | undefined) => {
    if (f && !rows.some((r) => r.replace(/\s+/g, "").toLowerCase() === f.replace(/\s+/g, "").toLowerCase())) rows.push(f);
  };
  for (const k of Object.keys(project.wireColours ?? {})) add(k);
  for (const d of project.distributions) add(distributionFunction(d));
  for (const c of project.conductors) add(c.function);
  return rows;
}
