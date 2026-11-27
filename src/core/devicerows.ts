/**
 * Design's Devices view (v0.5 A70, design-design-workbench.md §8): everything
 * in the job that needs a real device, in one list, each with the device it
 * is. One row for each drawn part, one for each terminal strip, and one for
 * each module and plant item, in the field or in the panel.
 */
import { SUITS, deviceById, deviceSize, gaSizes, moduleGaSize, sizeKey, suitsKey } from "./ga";
import type { ProjectDevice } from "./devices";
import type { Element, Project } from "./model";
import { moduleTypeName, viewsOf } from "./modules";
import { deviceKeySuits, plantLabel } from "./ops";
import { getSymbol } from "./symbols";
import { displayTag } from "./tags";
import { resolveFields } from "./fields";

export type DeviceGroup = "coils" | "switchgear" | "door" | "other" | "strips" | "controller" | "plant";

/** The groups, in the order they're listed. */
export const DEVICE_GROUPS: { key: DeviceGroup; label: string }[] = [
  { key: "coils", label: "Coils" },
  { key: "switchgear", label: "Breakers, isolators and fuses" },
  { key: "door", label: "Lamps, push buttons and selectors" },
  { key: "other", label: "Blocks, transformers and sockets" },
  { key: "strips", label: "Terminal strips" },
  { key: "controller", label: "Controller" },
  { key: "plant", label: "Plant" },
];

export interface DeviceRow {
  /** `el:<element id>`, `strip:<name>` or `plant:<plant id>`: what `setDevices` takes. */
  key: string;
  group: DeviceGroup;
  tag: string;
  /** What it is, in a few words: "Coil, relay · Supply fan run". */
  what: string;
  /** The SUITS keys a device for it may have (a device that suits "" fits anything). */
  suits: string[];
  device?: ProjectDevice;
  /** The sheet it's first on, for sorting; 0 for plant not drawn yet. */
  sheet: number;
}

const GROUP_OF: Record<string, DeviceGroup> = {
  relay: "coils",
  contactor: "coils",
  timer: "coils",
  mcb: "switchgear",
  isolator: "switchgear",
  fuse: "switchgear",
  lamp: "door",
  pushbutton: "door",
  selector: "door",
};

/** What a part is, in a few words: its kind, then its label. */
function partWhat(project: Project, el: Element): string {
  const k = suitsKey(project, el);
  const kind = k === "relay" ? "Coil, relay" : k === "contactor" ? (el.symbol === "coil" ? "Coil, contactor" : "Contactor") : k === "timer" ? "Coil, timer" : (SUITS.find((s) => s.key === k)?.label ?? getSymbol(el.symbol)?.name ?? el.symbol);
  const label = resolveFields(el.label, project).replace(/\s+/g, " ").trim();
  return label ? `${kind} · ${label}` : kind;
}

/** Every row of the Devices view, grouped in order, each group by sheet then tag. */
export function deviceRows(project: Project): DeviceRow[] {
  const rows: DeviceRow[] = [];
  const strips = new Map<string, { n: number; sheet: number }>();
  for (const pg of project.pages) {
    if (pg.ga) continue;
    for (const el of pg.elements) {
      if (!sizeKey(project, el)) continue;
      if (el.symbol === "terminal") {
        const s = String(el.params.strip ?? "X1");
        const was = strips.get(s);
        strips.set(s, { n: (was?.n ?? 0) + 1, sheet: was?.sheet ?? pg.number });
        continue;
      }
      const k = suitsKey(project, el);
      if (!k) continue;
      const group = k === "contactor" && el.symbol !== "coil" ? "switchgear" : (GROUP_OF[k] ?? "other");
      rows.push({ key: `el:${el.id}`, group, tag: displayTag(el, project), what: partWhat(project, el), suits: [k], device: deviceById(project, el.device), sheet: pg.number });
    }
  }
  for (const [name, s] of strips) {
    const key = `strip:${name}`;
    rows.push({ key, group: "strips", tag: name, what: `${s.n} terminal${s.n === 1 ? "" : "s"}`, suits: deviceKeySuits(project, key) ?? [], device: deviceById(project, project.stripDevices?.[name]), sheet: s.sheet });
  }
  for (const it of project.plant) {
    const sheet = viewsOf(project, it.id)[0]?.page.number ?? 0;
    if (it.module) {
      rows.push({ key: `plant:${it.id}`, group: "controller", tag: plantLabel(it), what: moduleTypeName(it.module), suits: ["module"], device: deviceById(project, it.device), sheet });
      continue;
    }
    const where = it.inPanel ? "panel" : "field";
    rows.push({ key: `plant:${it.id}`, group: "plant", tag: plantLabel(it), what: [it.description, where].filter(Boolean).join(" · "), suits: ["plant"], device: deviceById(project, it.device), sheet });
  }
  const order = new Map(DEVICE_GROUPS.map((g, i) => [g.key, i]));
  // The controller keeps rail order; the rest go by sheet, then tag.
  const rail = new Map((project.controllers ?? []).flatMap((c) => c.slots.map((s, i) => [s.module ?? "", i] as const)));
  return rows.sort(
    (a, b) =>
      order.get(a.group)! - order.get(b.group)! ||
      (a.group === "controller" ? (rail.get(a.key.slice(6)) ?? 0) - (rail.get(b.key.slice(6)) ?? 0) : 0) ||
      (a.group === "plant" ? 0 : a.sheet - b.sheet) ||
      a.tag.localeCompare(b.tag, undefined, { numeric: true }),
  );
}

/** Does a device suit a row: made for that kind of thing, or for any. */
export const deviceSuits = (d: Pick<ProjectDevice, "kind">, row: Pick<DeviceRow, "suits">): boolean => !d.kind || row.suits.includes(d.kind);

/** The rows a device is picked for. */
export function rowsUsing(rows: DeviceRow[], deviceId: string): DeviceRow[] {
  return rows.filter((r) => r.device?.id === deviceId);
}

/**
 * A new device for a row (`+ Device`, v0.5 A70): what it suits and the size
 * the row has today with no device, so it starts where the drawing is.
 */
export function newDeviceFor(project: Project, key: string | undefined): { kind: string; w: number; h: number } {
  const plain = { kind: "", w: 20, h: 40 };
  if (!key) return plain;
  const [kind, ...rest] = key.split(":");
  const id = rest.join(":");
  const suits = deviceKeySuits(project, key);
  if (!suits) return plain;
  const sizes = gaSizes(project);
  if (kind === "strip") return { kind: "terminal", w: sizes.terminal!.w, h: sizes.terminal!.h };
  if (kind === "plant") {
    const it = project.plant.find((x) => x.id === id)!;
    return { kind: suits[0]!, ...moduleGaSize(project, { ...it, device: undefined }) };
  }
  const el = project.pages.flatMap((pg) => pg.elements).find((e) => e.id === id)!;
  return { kind: suits[0]!, ...deviceSize(project, { ...el, device: undefined }) };
}
