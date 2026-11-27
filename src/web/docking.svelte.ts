/**
 * Docking windows into tiles (design-v0.3 §7): while a window is dragged by
 * its title bar over a tile, `hint` says where it would go (the tile, and
 * which edge or the middle); dropping it calls `dock`, which the editor view
 * sets.
 */
import type { DropZone } from "./tiles";

export const docking = $state<{
  hint: { tile: string; zone: DropZone; rect: { left: number; top: number; width: number; height: number } } | null;
  dock: ((name: string, tile: string, zone: DropZone) => void) | null;
}>({ hint: null, dock: null });

/**
 * Windows, which can go in a tile (v0.5 A32): anything opened from a button
 * on the row and left open to work beside, with closing it the only way out.
 * A prompt (one step of an action, finished by a button) and a panel
 * (Properties, the Simulation panel: they come up by themselves) always float.
 */
export const DOCKABLE = ["plant", "templates", "schedules", "table", "controllers", "distribution", "expectations", "checks", "place", "project", "settings", "help"] as const;
export type DockableName = (typeof DOCKABLE)[number];
export const isDockable = (name: string): name is DockableName => (DOCKABLE as readonly string[]).includes(name);

/** Window titles, for a docked window's tile bar. */
export const WINDOW_TITLES: Record<DockableName, string> = {
  plant: "Plant",
  templates: "Templates",
  schedules: "Schedules",
  table: "Table",
  controllers: "Controllers",
  distribution: "Distribution",
  expectations: "Expectations",
  checks: "Check",
  place: "Place parts",
  project: "Project details",
  settings: "Settings",
  help: "Help",
};
