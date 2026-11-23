/** How a lit lamp glows in Simulate, by its colour: on the schematic and on the door (design-v0.3 §4). */
export function lampGlow(c: unknown): string {
  // White lamps glow a warm white, so they show on white paper.
  return { Gn: "#3cc85a", Rd: "#ff4a4a", Wh: "#ffe9a8", Bu: "#4a8cff", Ye: "#ffd21f" }[String(c)] ?? "#ffe9a8";
}
