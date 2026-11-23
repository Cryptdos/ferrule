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

/** A lamp colour as we write it. Amber isn't an IEC colour: yellow is used for it. */
export function lampColour(s: string): string {
  const c = colourCode(s);
  return c === "Am" ? "Ye" : c;
}

export const WIRE_FUNCTIONS = ["0V", "24V", "24V AC", "24V DC", "230V", "L", "N", "L1", "L2", "L3", "PE", "0-10V", "SIG", "COM", "FE"];

/** Screen colours for core colours, for drawing live conductors while simulating. */
const SCREEN: Record<string, string> = {
  bk: "#222222",
  bn: "#8b4a1c",
  rd: "#d42020",
  og: "#f08a1c",
  ye: "#e0b800",
  gn: "#1f9a3a",
  bu: "#1f5fd4",
  vt: "#8a3fd0",
  gy: "#8a8f98",
  wh: "#f4f4f4",
  pk: "#ef7fb4",
  tq: "#1fb5b0",
};

/**
 * How a live conductor of this core colour is drawn: its colour (the first
 * one of a pair like GnYe), red when it has none. White gets a dark edge so
 * it shows on the sheet.
 */
export function liveColour(code: string | undefined): { stroke: string; edge: boolean } {
  const first = (code ?? "").trim().slice(0, 2).toLowerCase();
  const stroke = SCREEN[first] ?? "#d42020";
  return { stroke, edge: first === "wh" };
}
