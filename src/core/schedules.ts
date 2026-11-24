/**
 * Terminal and cable schedules, generated from the drawing (DESIGN.md §7).
 */
import type { Element, IoPoint, Page, PlantItem, Project, Segment } from "./model";
import { channelLabel, goesTo, pointType, systemGroups } from "./design";
import { Nets, wiringOf } from "./wiring";
import { displayTag, elementTexts } from "./tags";
import { address, partnerOf } from "./xref";
import { gaSizes, sizeKey } from "./ga";
import { controllerName, controllerOfModule, controllersInOrder, moduleTypeName, pointLabel, viewsOf } from "./modules";
import { formLabel, printedPin } from "./points";
import { isBar } from "./symbols";
import { isFieldWire } from "./wires";

export interface TerminalRow {
  strip: string;
  terminal: string;
  where: string;
  wire: string;
  internal: string;
  external: string;
}

export interface CableRow {
  plant: string;
  description: string;
  plantTerminal: string;
  wire: string;
  panelTerminal: string;
  where: string;
}

function endName(project: Project, el: Element | undefined, term: string): string {
  if (!el) return "?";
  if (el.symbol === "junction") return "(junction)";
  const tag = displayTag(el, project);
  if (el.symbol === "terminal") return `${el.params.strip ?? "X1"}:${tag}`;
  if (isBar(el)) return elementTexts(el, project).name || tag || (el.symbol === "rail" ? "rail" : "busbar");
  return `${tag || el.symbol}:${term}`;
}

function wireNumber(project: Project, seg: Segment): string {
  return project.conductors.find((c) => c.id === seg.conductor)?.number ?? "";
}

function natural(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true });
}

export function terminalSchedule(project: Project): TerminalRow[] {
  const rows: TerminalRow[] = [];
  for (const page of project.pages) {
    const byId = new Map(page.elements.map((e) => [e.id, e]));
    for (const el of page.elements) {
      if (el.symbol !== "terminal") continue;
      const internal: string[] = [];
      const external: string[] = [];
      let wire = "";
      for (const seg of page.segments) {
        const mine = seg.from[0] === el.id ? seg.from : seg.to[0] === el.id ? seg.to : null;
        if (!mine) continue;
        const other = mine === seg.from ? seg.to : seg.from;
        const o = byId.get(other[0]);
        wire ||= wireNumber(project, seg);
        const name = endName(project, o, other[1]);
        // The field side is wherever the other end is out in the field,
        // or the bottom of the terminal when there's no boundary.
        const field = o ? o.zone === "external" : false;
        (field || (page.boundaryY === null && mine[1] === "2") ? external : internal).push(name);
      }
      rows.push({
        strip: String(el.params.strip ?? "X1"),
        terminal: displayTag(el, project),
        where: address(page, el.pos),
        wire,
        internal: internal.join(", "),
        external: external.join(", "),
      });
    }
  }
  return rows.sort((a, b) => natural(a.strip, b.strip) || natural(a.terminal, b.terminal));
}

export function cableSchedule(project: Project): CableRow[] {
  const rows: CableRow[] = [];
  for (const page of project.pages) {
    const byId = new Map(page.elements.map((e) => [e.id, e]));
    for (const el of page.elements) {
      if (el.symbol !== "plant-view") continue;
      const item = project.plant.find((p) => p.id === el.params.plant);
      for (const seg of page.segments) {
        const mine = seg.from[0] === el.id ? seg.from : seg.to[0] === el.id ? seg.to : null;
        if (!mine) continue;
        const other = mine === seg.from ? seg.to : seg.from;
        rows.push({
          plant: item?.tag ?? "?",
          description: item?.description ?? "",
          plantTerminal: mine[1],
          wire: wireNumber(project, seg),
          panelTerminal: endName(project, byId.get(other[0]), other[1]),
          where: address(page as Page, el.pos),
        });
      }
    }
  }
  return rows.sort((a, b) => natural(a.plant, b.plant) || natural(a.plantTerminal, b.plantTerminal));
}

export interface CoreRow {
  plant: string;
  description: string;
  /** How many cores it needs: its wired terminals, earth included. */
  cores: number;
  terminals: string;
}

/**
 * Cores per field device (v0.4.x T18): one row per plant item drawn with
 * wires on its terminals (not a controller's module, not plant in the
 * panel), counting each of its terminals with a wire on it once, earth
 * included, over all its views.
 */
export function coresPerDevice(project: Project): CoreRow[] {
  const wired = new Map<string, Set<string>>();
  for (const page of project.pages) {
    const byId = new Map(page.elements.map((e) => [e.id, e]));
    for (const seg of page.segments) {
      for (const [id, t] of [seg.from, seg.to]) {
        const el = byId.get(id);
        if (el?.symbol !== "plant-view") continue;
        const plant = String(el.params.plant);
        wired.set(plant, (wired.get(plant) ?? new Set()).add(t));
      }
    }
  }
  const rows: CoreRow[] = [];
  for (const item of project.plant) {
    const pins = wired.get(item.id);
    if (!pins?.size || item.module || item.inPanel) continue;
    // In the device's own pin order.
    const terms = [...pins].sort((a, b) => (item.terminals.indexOf(a) + 1 || 1e9) - (item.terminals.indexOf(b) + 1 || 1e9) || natural(a, b));
    rows.push({ plant: item.tag || `${item.prefix || "U"}?`, description: item.description, cores: terms.length, terminals: terms.join(" ") });
  }
  return rows.sort((a, b) => natural(a.plant, b.plant));
}

export interface MarkerRow {
  /** What the marker says. */
  text: string;
  what: "wire" | "core, panel end" | "core, field end";
  /** The wire's number on the drawing, and where its end is. */
  wire: string;
  where: string;
}

/**
 * Wire and core markers for a marker supplier (v0.4.x M10), one per wire
 * end. A panel wire has two, each the number of the terminal it lands on
 * (the first along the strip, if it lands on two), or with none, its own
 * number. A field core has two: at the panel end the terminal it goes into
 * (or its own number), at the field end the device's tag. A terminal's
 * number is read from the terminal itself, so a wire numbered by hand still
 * gets the terminal's. An end on a junction isn't a place a marker goes, so
 * it has none.
 */
export function wireMarkers(project: Project): MarkerRow[] {
  const rows: MarkerRow[] = [];
  const order = (a: { el: Element; page: Page }, b: { el: Element; page: Page }) => a.page.number - b.page.number || a.el.pos[0] - b.el.pos[0] || a.el.pos[1] - b.el.pos[1];
  for (const page of project.pages) {
    if (page.ga) continue;
    const byId = new Map(page.elements.map((e) => [e.id, e]));
    for (const seg of page.segments) {
      const ends = [seg.from, seg.to].map(([id, t]) => ({ el: byId.get(id), t }));
      if (ends.some((e) => !e.el)) continue;
      const own = wireNumber(project, seg);
      const terms = ends.filter((e) => e.el!.symbol === "terminal").map((e) => ({ el: e.el!, page })).sort(order);
      const panelText = terms[0] ? displayTag(terms[0].el, project) || own : own;
      const field = isFieldWire(page, seg);
      // A field core's field end: a device out in the field, not the terminal.
      const fieldEnd = field ? (ends.find((e) => e.el!.zone === "external" && e.el!.symbol !== "terminal") ?? ends.find((e) => e.el!.symbol !== "terminal")) : undefined;
      for (const e of ends) {
        const el = e.el!;
        if (el.symbol === "junction") continue;
        const where = address(page, el.pos);
        if (field && e === fieldEnd) {
          const item = el.symbol === "plant-view" ? project.plant.find((p) => p.id === el.params.plant) : undefined;
          const tag = item ? item.tag || `${item.prefix || "U"}?` : displayTag(el, project) || el.symbol;
          rows.push({ text: tag, what: "core, field end", wire: own, where });
        } else rows.push({ text: panelText, what: field ? "core, panel end" : "wire", wire: own, where });
      }
    }
  }
  return rows;
}

/** Markers grouped: each text and kind once, with how many (v0.4.x M10). */
export function groupMarkers(rows: MarkerRow[]): { text: string; what: string; count: number }[] {
  const out = new Map<string, { text: string; what: string; count: number }>();
  for (const r of rows) {
    const k = `${r.what}\u0000${r.text}`;
    const g = out.get(k) ?? { text: r.text, what: r.what, count: 0 };
    g.count++;
    out.set(k, g);
  }
  return [...out.values()].sort((a, b) => a.what.localeCompare(b.what) || natural(a.text, b.text));
}

/** CSV text for a list of rows, for spreadsheets. */
export function toCsv<T extends object>(rows: T[], headers: [keyof T, string][]): string {
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(([, h]) => esc(h)).join(","), ...rows.map((r) => headers.map(([k]) => esc(r[k])).join(","))].join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Bill of materials (design-v0.2 §8): from the GA sheets and the device table

export interface BomRow {
  /** The GA sheet, as "5" (sheets in order). */
  sheet: string;
  item: string;
  maker: string;
  part: string;
  quantity: number;
  unit: string;
  /** The tags (or a label plate's text) it's for. */
  tags: string;
}

/**
 * What's laid out on each GA sheet, counted: devices by the device picked
 * from the table (or by their generic size where none is), terminals each,
 * label plates, and DIN rail and trunking by length.
 */
export function billOfMaterials(project: Project): BomRow[] {
  const sizes = gaSizes(project);
  const els = new Map(project.pages.flatMap((pg) => pg.elements.map((e) => [e.id, e] as const)));
  const out: BomRow[] = [];
  for (const page of project.pages) {
    if (!page.ga) continue;
    const rows = new Map<string, BomRow & { tagList: string[] }>();
    const add = (key: string, row: Omit<BomRow, "tags" | "sheet">, tags: string[]) => {
      const r = rows.get(key) ?? { ...row, sheet: String(page.number), tags: "", tagList: [], quantity: 0 };
      r.quantity += row.quantity;
      r.tagList.push(...tags.filter(Boolean));
      rows.set(key, r);
    };
    for (const it of page.gaItems ?? []) {
      if (it.kind === "rail") {
        add("rail", { item: "DIN rail 35 mm", maker: "", part: "", quantity: Math.max(it.w, it.h) / 1000, unit: "m" }, []);
      } else if (it.kind === "trunking") {
        const across = Math.min(it.w, it.h);
        add(`trunking:${across}`, { item: `Trunking ${across} mm wide`, maker: "", part: "", quantity: Math.max(it.w, it.h) / 1000, unit: "m" }, []);
      } else if (it.kind === "label") {
        add(`label:${it.w}x${it.h}`, { item: `Label plate ${it.w} × ${it.h} mm`, maker: "", part: "", quantity: 1, unit: "each" }, [(it.text ?? "").replace(/\n/g, " / ")]);
      } else if (it.kind === "device") {
        const refs = (it.refs ?? []).map((r) => els.get(r)).filter((e): e is Element => !!e);
        const first = refs[0];
        const strip = first?.symbol === "terminal" && !it.part;
        const modTag = it.module ? (project.plant.find((x) => x.id === it.module)?.tag ?? "") : "";
        const tags = it.module ? [modTag] : strip ? [`${it.strip ?? first.params.strip ?? "X1"}`] : refs.map((e) => displayTag(e, project) + (it.part === "handle" ? " handle" : ""));
        const qty = strip ? refs.length : 1;
        const dev = it.device ? project.devices?.find((d) => d.id === it.device) : undefined;
        if (dev) {
          add(`dev:${dev.id}`, { item: dev.name, maker: dev.maker, part: dev.part, quantity: qty, unit: "each" }, tags);
          continue;
        }
        // A device with no schematic part (v0.4.x M5): by its name, with its tag.
        if (!refs.length && !it.module && !it.refs?.length) {
          add(`own:${it.text ?? "Device"}`, { item: it.text || "Device", maker: "", part: "", quantity: 1, unit: "each" }, it.tag ? [it.tag] : []);
          continue;
        }
        // A controller's module: by its type until a model's picked.
        if (it.module) {
          const m = project.plant.find((x) => x.id === it.module);
          // Plant in the panel (v0.4.x T3): its generic size's name until a device is picked.
          if (m && !m.module) {
            add(`gen:panelPlant`, { item: `${sizes.panelPlant!.label} (no device picked)`, maker: "", part: "", quantity: 1, unit: "each" }, [m.tag]);
            continue;
          }
          const type = m?.module ? moduleTypeName(m.module) : "module";
          add(`mod:${type}`, { item: `Controller module ${type} (no device picked)`, maker: "", part: "", quantity: 1, unit: "each" }, [m?.tag ?? ""]);
          continue;
        }
        // No device picked: counted by its generic size, so what's still to choose shows.
        const key = it.part === "handle" ? "handle" : first ? (sizeKey(project, first)?.key ?? "other") : "other";
        const generic = key === "terminal" && first ? terminalKind(first) : key;
        const label = sizes[generic]?.label ?? (it.text || "Device");
        add(`gen:${generic}`, { item: `${label} (no device picked)`, maker: "", part: "", quantity: qty, unit: "each" }, tags);
      }
    }
    const list = [...rows.values()].map(({ tagList, ...r }) => ({ ...r, quantity: Math.round(r.quantity * 1000) / 1000, tags: [...new Set(tagList)].sort(natural).join(" ") }));
    out.push(...list.sort((a, b) => natural(a.item, b.item)));
  }
  return out;
}

/** A terminal's generic size: plain, fused or disconnect. */
function terminalKind(el: Element): string {
  const fn = el.params.function;
  return fn === "fuse" || fn === "fuse-disconnect" ? "fuseTerminal" : fn === "disconnect" ? "disconnectTerminal" : "terminal";
}

// ---------------------------------------------------------------------------
// Points lists (controller.md §7)

export interface IoRow {
  controller: string;
  module: string;
  /** The point, with where it's drawn when that's on a continuation: DO5 (4-10). */
  point: string;
  form: string;
  pins: string;
  label: string;
  wiredTo: string;
}

export interface PlantPointRow {
  device: string;
  description: string;
  point: string;
  form: string;
  pins: string;
  wiredTo: string;
}

/**
 * What a point's pins are wired to, by conductor: other devices' points
 * (with where they're drawn), link arrows (where they go), terminals and
 * parts. Its own device's pins are left out.
 */
export function wiredTo(project: Project, item: PlantItem, point: IoPoint): string {
  const els = new Map(project.pages.flatMap((pg) => pg.elements.map((e) => [e.id, { e, pg }])));
  const own = new Set(viewsOf(project, item.id).map((v) => v.el.id));
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (s: string) => {
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  };
  // A common shared with other channels is theirs too: what it's wired to is said by the point's own pins.
  const own_ = point.pins.filter((t) => !(item.points ?? []).some((q) => q !== point && q.pins.includes(t)));
  for (const pin of own_.length ? own_ : point.pins) {
    const conds = project.conductors.filter((c) => c.terminals.some(([id, t]) => own.has(id) && t === pin));
    for (const c of conds) {
      for (const [id, t] of c.terminals) {
        if (own.has(id)) continue;
        const x = els.get(id);
        if (!x) continue;
        const { e, pg } = x;
        if (e.symbol === "junction") continue;
        if (e.symbol === "plant-view") {
          const other = project.plant.find((p) => p.id === e.params.plant);
          const pt = other?.points?.find((q) => q.pins.includes(t));
          const where = address(pg, e.pos);
          push(other && pt ? `${pointLabel(project, other, pt)}${other.module ? "" : ` (${where})`}` : `${other?.tag ?? "?"}:${t} (${where})`);
        } else if (e.symbol === "offpage") {
          const partner = partnerOf(project, e);
          push(`via link ${address(pg, e.pos)}${partner ? ` → ${address(partner.page, partner.el.pos)}` : ""}`);
        } else if (e.symbol === "terminal") {
          push(`${e.params.strip ?? "X1"}:${displayTag(e, project)}`);
        } else if (isBar(e)) {
          push(elementTexts(e, project).name || displayTag(e, project) || (e.symbol === "rail" ? "rail" : "busbar"));
        } else {
          push(`${displayTag(e, project) || e.symbol}:${t}`);
        }
      }
    }
  }
  return out.join(", ");
}

const pinsText = (item: PlantItem, p: IoPoint) => p.pins.map((t) => printedPin(t, p.name)).join(", ");

/** The job's points list: every controller's points, module by module in rail order. */
export function ioSchedule(project: Project): IoRow[] {
  const rows: IoRow[] = [];
  for (const { ctrl, modules } of controllersInOrder(project)) {
    const cname = controllerName(project, ctrl);
    for (const m of modules) {
      const views = viewsOf(project, m.id);
      const tag = m.tag || `${m.prefix || "A"}?`;
      for (const p of m.points ?? []) {
        const said = pointLabel(project, m, p, views);
        rows.push({
          controller: cname,
          module: `${tag} (${moduleTypeName(m.module)})`,
          point: said.slice(said.indexOf(":") + 1),
          form: formLabel(p.form),
          pins: pinsText(m, p),
          label: channelLabel(project, m, p),
          wiredTo: wiredTo(project, m, p),
        });
      }
    }
  }
  return rows;
}

/** Plant's points: device, point, pins and what they're wired to. */
export function plantPointsSchedule(project: Project): PlantPointRow[] {
  const rows: PlantPointRow[] = [];
  const plant = project.plant.filter((p) => !p.module && !controllerOfModule(project, p));
  for (const item of [...plant].sort((a, b) => natural(a.tag, b.tag))) {
    for (const p of item.points ?? []) {
      rows.push({
        device: item.tag || `${item.prefix || "U"}?`,
        description: item.description,
        point: p.name,
        form: formLabel(p.form),
        pins: pinsText(item, p),
        wiredTo: wiredTo(project, item, p),
      });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Points schedule (design-v0.4 §9): an export of Design, by system.

export interface PointsRow {
  system: string;
  tag: string;
  description: string;
  point: string;
  form: string;
  signal: string;
  /** DI, DO, AI or AO: what the controller needs; empty for supplies and comms. */
  type: string;
  /** channel, via relay, panel only; empty where no channel is needed. */
  goesTo: string;
  controller: string;
  module: string;
  channel: string;
  /** The relay, when the check found one hop. */
  via: string;
  /** direct, via, confirmed, to review, not drawn; empty when it has no channel. */
  wired: string;
}

export const POINTS_COLS: [keyof PointsRow, string][] = [
  ["system", "System"],
  ["tag", "Tag"],
  ["description", "Description"],
  ["point", "Point"],
  ["form", "Form"],
  ["signal", "Signal"],
  ["type", "Type"],
  ["goesTo", "Goes to"],
  ["controller", "Controller"],
  ["module", "Module"],
  ["channel", "Channel"],
  ["via", "Via"],
  ["wired", "Wired"],
];

/**
 * Every point in Design's table, by system and in row order: unallocated
 * points too, with the channel empty. Comms devices with no points listed
 * are one row each.
 */
export function pointsSchedule(project: Project): PointsRow[] {
  const nets = new Nets(project);
  const rows: PointsRow[] = [];
  const tag = (p: PlantItem) => p.tag || `${p.prefix || "U"}?`;
  for (const g of systemGroups(project)) {
    for (const plant of g.plant) {
      // A panel device (v0.4.x T3) is in the points schedule only when one of its points is on a channel.
      if (plant.inPanel && !(plant.points ?? []).some((q) => q.channel)) continue;
      const base = { system: g.name, tag: tag(plant), description: plant.description };
      const points = plant.points ?? [];
      if (!points.length) {
        rows.push({ ...base, point: "", form: plant.connects === "comms" ? "comms" : "", signal: plant.protocol ?? "", type: "", goesTo: "", controller: "", module: "", channel: "", via: "", wired: "" });
        continue;
      }
      for (const point of points) {
        const t = pointType(point.form);
        const go = goesTo(point);
        const m = point.channel ? project.plant.find((x) => x.id === point.channel!.module) : undefined;
        const ctrl = m ? controllerOfModule(project, m) : undefined;
        const w = point.channel ? wiringOf(project, plant, point, nets) : undefined;
        rows.push({
          ...base,
          point: point.name,
          form: formLabel(point.form).toLowerCase(),
          signal: point.signal ?? "",
          type: t ?? "",
          goesTo: t ? { channel: "channel", relay: "via relay", panel: "panel only" }[go] : "",
          controller: ctrl ? controllerName(project, ctrl) : "",
          module: m ? tag(m) : "",
          channel: point.channel?.point ?? "",
          via: w?.kind === "via" ? w.relay : "",
          wired: w ? { direct: "direct", via: "via", confirmed: "confirmed", review: "to review", "not-drawn": "not drawn", "no-channel": "" }[w.kind] : "",
        });
      }
    }
  }
  return rows;
}
