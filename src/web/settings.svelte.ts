/**
 * Preferences for this browser (not saved in projects): how placing works
 * and the interface theme (design-v0.2 §10).
 */
export interface Settings {
  /** Keep placing the same part until Esc, rather than one and back to Select (note 72). */
  keepPlacing: boolean;
  /** Dark interface chrome. The sheet stays a paper colour with black drawing. */
  dark: boolean;
}

const KEY = "ferrule.settings";

function load(): Settings {
  const base: Settings = { keepPlacing: false, dark: false };
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return base;
  }
}

export const settings: Settings = $state(load());

/** Save the settings and apply the theme. */
export function saveSettings(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* storage may be unavailable */
  }
  applyTheme();
}

export function applyTheme(): void {
  if (typeof document !== "undefined") document.documentElement.dataset.theme = settings.dark ? "dark" : "light";
}
