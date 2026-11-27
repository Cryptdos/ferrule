/**
 * Where windows and floating boxes were put, for this session only (v0.5
 * A73): kept while the page is open, so a window reopened comes back where
 * it was left, and forgotten on a reload, so a project opens with every
 * window in its usual place. Settings are kept for the browser instead
 * (`settings.svelte.ts`); layout isn't.
 */
export interface Place {
  x?: number;
  y?: number;
  min?: boolean;
}

const places = new Map<string, Place>();

export function placeOf(key: string): Place | null {
  return places.get(key) ?? null;
}

export function keepPlace(key: string, place: Place): void {
  places.set(key, place);
}

// Places used to be kept for the browser (before v0.5): clear what's left of them.
try {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && (k.startsWith("ferrule.win.") || k.startsWith("ferrule.box."))) localStorage.removeItem(k);
  }
} catch {
  /* storage may be unavailable */
}
