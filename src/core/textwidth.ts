/**
 * Advance widths of osifont's characters, in em (generated from the bundled
 * font), so text can be measured, wrapped and fitted without a browser.
 */
const ASCII = [0.435, 0.22, 0.391, 0.613, 0.466, 0.764, 0.614, 0.204, 0.255, 0.255, 0.464, 0.465, 0.233, 0.465, 0.201, 0.491, 0.468, 0.342, 0.466, 0.48, 0.513, 0.497, 0.495, 0.478, 0.516, 0.503, 0.222, 0.255, 0.465, 0.464, 0.465, 0.464, 0.811, 0.614, 0.582, 0.49, 0.588, 0.49, 0.49, 0.58, 0.591, 0.221, 0.414, 0.564, 0.492, 0.666, 0.587, 0.587, 0.562, 0.597, 0.564, 0.54, 0.538, 0.589, 0.615, 0.761, 0.616, 0.614, 0.54, 0.266, 0.462, 0.266, 0.39, 0.465, 0.315, 0.481, 0.503, 0.405, 0.503, 0.496, 0.439, 0.502, 0.503, 0.218, 0.218, 0.492, 0.268, 0.642, 0.494, 0.493, 0.507, 0.507, 0.407, 0.466, 0.347, 0.494, 0.466, 0.612, 0.464, 0.464, 0.464, 0.314, 0.221, 0.314, 0.466];
const OTHER: Record<string, number> = {"°": 0.391, "×": 0.467, "–": 0.5, "—": 0.642, "’": 0.233, "±": 0.465, "µ": 0.549, "Ω": 0.644, "·": 0.221};
const DEFAULT = 0.55;

/** Width of a string drawn at a font size (same units as the size). */
export function textWidth(s: string, size: number): number {
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    w += c >= 32 && c < 127 ? ASCII[c - 32]! : (OTHER[ch] ?? DEFAULT);
  }
  return w * size;
}

/** Height of capitals as a share of the font size. */
export const CAP_HEIGHT = 0.74;

/**
 * Text broken into lines no wider than `width` (same units as the size), at
 * spaces; line breaks already in it are kept. A word longer than the width
 * gets a line of its own.
 */
export function wrapText(s: string, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of s.split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push("");
      continue;
    }
    let cur = "";
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (cur && textWidth(next, size) > width) {
        out.push(cur);
        cur = w;
      } else cur = next;
    }
    out.push(cur);
  }
  return out;
}
