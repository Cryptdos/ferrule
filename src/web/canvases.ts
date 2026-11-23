/**
 * The canvas in each sheet tile, by tile id (design-v0.3 §7), so the top bar
 * and keys (Fit, Esc, pasting a picture) reach the active tile's canvas.
 */
import type Canvas from "./components/Canvas.svelte";

export const canvases = new Map<string, Canvas>();
