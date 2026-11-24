/**
 * The network drawing (design-v0.4 §7), pure: laid out in sheet units from
 * the data, for the Network view and the network sheet alike. Kept apart
 * from the network ops so the symbols can draw it without importing them.
 */
import { lineUnits, textUnits } from "./geometry";
import type { Network } from "./model";
import type { Prim } from "./symbols";
import { textWidth } from "./textwidth";

export interface NetworkData {
  /** The controller's tag and description, if there is one. */
  controller?: { tag: string; description: string };
  lans: { net: Network; devices: string[] }[];
  buses: { net: Network; devices: string[] }[];
  /** Comms plant on no network. */
  loose: string[];
}

const TAG = textUnits("tag");
const NOTE = textUnits("note");
const THIN = lineUnits("thin");
const BOX_H = 3.6;
const GAP = 1.6;
/** Device boxes per row on a LAN, and rows before the rest are counted. */
const PER_ROW = 4;
const ROWS = 4;
/** Devices drawn on a bus before the rest are counted. */
const BUS_MAX = 8;

const box = (x: number, y: number, w: number, h: number, dash = false): Prim => ({
  t: "line",
  pts: [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
    [x, y],
  ],
  ...(dash ? { dash: true } : {}),
});
const line = (...pts: [number, number][]): Prim => ({ t: "line", pts, w: THIN });
const txt = (x: number, y: number, s: string, size = TAG, anchor: "start" | "middle" | "end" = "middle", bold = false): Prim => ({
  t: "text",
  at: [x, y],
  text: s,
  size,
  anchor,
  role: "label",
  ...(bold ? { bold: true } : {}),
});

/** "… FCU-17 to FCU-19 (3 more)". */
const rest = (tags: string[]) => (tags.length === 1 ? `… and ${tags[0]}` : `… ${tags[0]} to ${tags[tags.length - 1]} (${tags.length} more)`);

/**
 * The network drawing, in sheet units from (0, 0): controller and switch
 * along the top, each LAN a trunk down from the switch with its devices
 * along it, each bus a daisy chain from the controller along the bottom.
 */
export function networkDiagram(d: NetworkData, width = 150): { prims: Prim[]; w: number; h: number } {
  const prims: Prim[] = [];
  const devW = Math.max(9, ...[...d.lans, ...d.buses].flatMap((n) => n.devices).map((t) => textWidth(t, NOTE) + 2));
  const headW = 22;
  const headH = 7;
  // The controller.
  const cx = 2;
  prims.push(box(cx, 0, headW, headH));
  prims.push(txt(cx + headW / 2, 3, d.controller?.tag ?? "Controller", TAG, "middle", true));
  prims.push(txt(cx + headW / 2, 5.6, d.controller ? (d.controller.description || "Controller") : "No controller yet", NOTE));
  let y = headH;
  let maxX = cx + headW;
  // The switch, and its LANs.
  if (d.lans.length) {
    const sx = cx + headW + 14;
    prims.push(line([cx + headW, headH / 2], [sx, headH / 2]));
    prims.push(box(sx, 0, headW, headH));
    prims.push(txt(sx + headW / 2, 3, "Switch", TAG, "middle", true));
    prims.push(txt(sx + headW / 2, 5.6, `${d.lans.length} LAN${d.lans.length === 1 ? "" : "s"}`, NOTE));
    maxX = sx + headW;
    const colW = 3 + PER_ROW * (devW + GAP);
    const cols = Math.max(1, Math.floor((width - 6) / colW));
    let top = headH + 6;
    let rowH = 0;
    d.lans.forEach((lan, i) => {
      const col = i % cols;
      if (col === 0 && i > 0) {
        top += rowH + 4;
        rowH = 0;
      }
      // Trunks start right of the bus line, which runs down the left from the controller.
      const x = 6 + col * colW;
      const tapX = sx + 3 + ((i % 6) * (headW - 6)) / 5;
      // From the switch down, along to the trunk.
      prims.push(line([tapX, headH], [tapX, top - 2], [x, top - 2], [x, top]));
      prims.push(txt(x + 1, top - 2.6, `${lan.net.name}${lan.net.protocol ? ` · ${lan.net.protocol}` : ""} · ${lan.devices.length} device${lan.devices.length === 1 ? "" : "s"}`, NOTE, "start"));
      const shown = lan.devices.slice(0, PER_ROW * ROWS);
      const rows = Math.ceil(shown.length / PER_ROW) + (lan.devices.length > shown.length ? 1 : 0);
      const h = Math.max(1, rows) * (BOX_H + GAP) + 1;
      prims.push(line([x, top], [x, top + h - GAP]));
      shown.forEach((t, k) => {
        const r = Math.floor(k / PER_ROW);
        const c = k % PER_ROW;
        const bx = x + 2 + c * (devW + GAP);
        const by = top + 1 + r * (BOX_H + GAP);
        if (c === 0) prims.push(line([x, by + BOX_H / 2], [bx, by + BOX_H / 2]));
        else prims.push(line([bx - GAP, by + BOX_H / 2], [bx, by + BOX_H / 2]));
        prims.push(box(bx, by, devW, BOX_H));
        prims.push(txt(bx + devW / 2, by + BOX_H / 2 + NOTE * 0.35, t, NOTE));
      });
      if (lan.devices.length > shown.length) {
        const by = top + 1 + Math.ceil(shown.length / PER_ROW) * (BOX_H + GAP);
        prims.push(line([x, by + BOX_H / 2], [x + 2, by + BOX_H / 2]));
        prims.push(txt(x + 3, by + BOX_H / 2 + NOTE * 0.35, rest(lan.devices.slice(shown.length)), NOTE, "start"));
      }
      if (!lan.devices.length) prims.push(txt(x + 2, top + 2.5, "no devices yet", NOTE, "start"));
      rowH = Math.max(rowH, h);
      maxX = Math.max(maxX, x + colW);
    });
    y = top + rowH;
  }
  // Buses, each a daisy chain from the controller.
  const busX = cx + 1.5;
  let busLineTop = headH;
  for (const bus of d.buses) {
    y += 6;
    const label = `${bus.net.name}${bus.net.protocol ? ` · ${bus.net.protocol}` : ""} · ${bus.devices.length} device${bus.devices.length === 1 ? "" : "s"}`;
    prims.push(txt(busX + 2, y - 0.8, label, NOTE, "start"));
    const by = y + 1;
    prims.push(line([busX, busLineTop], [busX, by + BOX_H / 2]));
    busLineTop = by + BOX_H / 2;
    let x = busX + Math.max(textWidth(label, NOTE) + 6, 12);
    prims.push(line([busX, by + BOX_H / 2], [x, by + BOX_H / 2]));
    const shown = bus.devices.slice(0, BUS_MAX);
    shown.forEach((t, k) => {
      if (k) prims.push(line([x - 3, by + BOX_H / 2], [x, by + BOX_H / 2]));
      prims.push(box(x, by, devW, BOX_H));
      prims.push(txt(x + devW / 2, by + BOX_H / 2 + NOTE * 0.35, t, NOTE));
      x += devW + 3;
    });
    if (bus.devices.length > shown.length) {
      prims.push(line([x - 3, by + BOX_H / 2], [x - 1, by + BOX_H / 2]));
      prims.push(txt(x, by + BOX_H / 2 + NOTE * 0.35, rest(bus.devices.slice(shown.length)), NOTE, "start"));
      x += textWidth(rest(bus.devices.slice(shown.length)), NOTE) + 2;
    }
    if (!bus.devices.length) prims.push(txt(x, by + BOX_H / 2 + NOTE * 0.35, "no devices yet", NOTE, "start"));
    maxX = Math.max(maxX, x);
    y = by + BOX_H;
  }
  if (d.loose.length) {
    y += 5;
    prims.push(txt(2, y, `Comms, on no network: ${d.loose.join(", ")}`, NOTE, "start"));
  }
  if (!d.lans.length && !d.buses.length && !d.loose.length) {
    y += 5;
    prims.push(txt(2, y, "No networks yet: + Network, then put comms plant on one", NOTE, "start"));
  }
  return { prims, w: Math.max(maxX, 40), h: y + 2 };
}
