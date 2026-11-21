/**
 * Core colours (IEC 60757 codes) and common conductor functions, offered
 * when labelling a wire. Anything else can be typed in.
 */
export const WIRE_COLOURS = [
  { code: "BK", name: "black" },
  { code: "BN", name: "brown" },
  { code: "RD", name: "red" },
  { code: "OG", name: "orange" },
  { code: "YE", name: "yellow" },
  { code: "GN", name: "green" },
  { code: "BU", name: "blue" },
  { code: "DBU", name: "dark blue (DC control)" },
  { code: "VT", name: "violet" },
  { code: "GY", name: "grey" },
  { code: "WH", name: "white" },
  { code: "PK", name: "pink" },
  { code: "TQ", name: "turquoise" },
  { code: "GNYE", name: "green-yellow (earth)" },
];

export const WIRE_FUNCTIONS = ["0V", "24V", "24V AC", "24V DC", "230V", "L", "N", "L1", "L2", "L3", "PE", "0-10V", "SIG", "COM", "FE"];
