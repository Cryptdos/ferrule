/**
 * Design (design-v0.4 §2, §4, §6, §7): what a panel has, recorded before
 * it's drawn. Plant in systems, points with a signal and where they go,
 * module channels they're allocated to, interlocks and networks. Nothing
 * here decides anything for the engineer: allocation is by hand, and a
 * reference to something that's gone is let go, never guessed.
 */
import { newId, type ChannelRef, type DesignTemplate, type IoPoint, type PlantItem, type PointForm, type Project } from "./model";
import { OpError, getPlant, renamePointRefs, syncPlantViews } from "./ops";

/** What the controller needs for a point (design-v0.4 §2, Type): shown, never stored. */
export type IoType = "DI" | "DO" | "AI" | "AO";

/**
 * Worked out from the form, which is from the plant's side: a plant contact
 * needs a DI; a plant input needs a DO; a plant analogue out needs an AI;
 * a plant analogue in needs an AO. Supplies and comms need no channel.
 */
export function pointType(form: PointForm): IoType | undefined {
  switch (form) {
    case "contact":
    case "powered-out":
      return "DI";
    case "dry-in":
    case "powered-in":
      return "DO";
    case "analogue-out":
      return "AI";
    case "analogue-in":
      return "AO";
    default:
      return undefined;
  }
}

/** Where a point goes; unset is straight to a channel. */
export const goesTo = (p: IoPoint): "channel" | "relay" | "panel" => p.goesTo ?? "channel";

/** A point that needs a controller channel: it has a type and doesn't stay in the panel. */
export const needsChannel = (p: IoPoint): boolean => !!pointType(p.form) && goesTo(p) !== "panel";

/**
 * What a module's channel is, from the controller's side: a module input
 * (a DI channel) takes a plant contact, and so on. A universal channel
 * takes any of the four.
 */
export function channelTypes(module: PlantItem, channel: IoPoint): IoType[] {
  if (module.module?.type === "uio") return ["DI", "DO", "AI", "AO"];
  switch (channel.form) {
    case "dry-in":
    case "powered-in":
      return ["DI"];
    case "contact":
    case "powered-out":
      return ["DO"];
    case "analogue-in":
      return ["AI"];
    case "analogue-out":
      return ["AO"];
    default:
      return [];
  }
}

/** Every module channel in the project: module plant items' points that can take a point. */
export function channelsOf(project: Project): { module: PlantItem; channel: IoPoint; types: IoType[] }[] {
  const out: { module: PlantItem; channel: IoPoint; types: IoType[] }[] = [];
  for (const m of project.plant) {
    if (!m.module) continue;
    for (const ch of m.points ?? []) {
      const types = channelTypes(m, ch);
      if (types.length) out.push({ module: m, channel: ch, types });
    }
  }
  return out;
}

/** The point allocated to a channel, if any. */
export function pointOnChannel(project: Project, ref: ChannelRef): { plant: PlantItem; point: IoPoint } | undefined {
  for (const plant of project.plant) {
    if (plant.module) continue;
    for (const point of plant.points ?? []) {
      if (point.channel?.module === ref.module && point.channel.point === ref.point) return { plant, point };
    }
  }
  return undefined;
}

export interface Counts {
  DI: number;
  DO: number;
  AI: number;
  AO: number;
  /** Universal channels, counted apart: they make up a shortfall of any type. */
  UIO: number;
}

const zero = (): Counts => ({ DI: 0, DO: 0, AI: 0, AO: 0, UIO: 0 });

/**
 * The Needs line (design-v0.4 §2): points that go to a channel, by type;
 * the controller's channels; and what's spare. A shortfall shows as a
 * negative spare; universal channels cover shortfalls in order DI, DO, AI, AO.
 */
export function needsLine(project: Project): { needs: Counts; have: Counts; spare: Counts } {
  const needs = zero();
  const have = zero();
  for (const it of project.plant) {
    if (it.module) continue;
    for (const p of it.points ?? []) {
      const t = pointType(p.form);
      if (t && goesTo(p) !== "panel") needs[t]++;
    }
  }
  for (const { module, types } of channelsOf(project)) {
    if (module.module?.type === "uio") have.UIO++;
    else have[types[0]!]++;
  }
  const spare = zero();
  let uio = have.UIO;
  for (const t of ["DI", "DO", "AI", "AO"] as const) {
    let s = have[t] - needs[t];
    if (s < 0 && uio > 0) {
      const take = Math.min(uio, -s);
      uio -= take;
      s += take;
    }
    spare[t] = s;
  }
  spare.UIO = uio;
  return { needs, have, spare };
}

/**
 * Put a point on a channel, or take it off (null). By hand only
 * (design-v0.4 §4): the channel must be a module's, able to serve the
 * point's type, and not already taken; a panel-only point takes none.
 */
export function allocate(project: Project, plantId: string, pointName: string, channel: ChannelRef | null): void {
  const plant = getPlant(project, plantId);
  if (plant.module) throw new OpError("A module's points are its channels");
  const point = plant.points?.find((p) => p.name === pointName);
  if (!point) throw new OpError(`No point "${pointName}" on that plant`);
  if (!channel) {
    delete point.channel;
    syncPlantViews(project);
    return;
  }
  const type = pointType(point.form);
  if (!type) throw new OpError(`${point.name} needs no controller channel`);
  if (goesTo(point) === "panel") throw new OpError(`${point.name} is panel only: it doesn't reach the controller`);
  const m = project.plant.find((p) => p.id === channel.module);
  if (!m?.module) throw new OpError("That isn't a controller module");
  const ch = m.points?.find((q) => q.name === channel.point);
  if (!ch) throw new OpError(`No channel "${channel.point}" on that module`);
  if (!channelTypes(m, ch).includes(type)) throw new OpError(`${ch.name} can't take ${point.name}: it needs a ${type}`);
  const taken = pointOnChannel(project, channel);
  if (taken && !(taken.plant === plant && taken.point === point)) throw new OpError(`${ch.name} already has ${taken.point.name} on it`);
  point.channel = { module: m.id, point: ch.name };
  syncPlantViews(project);
}

/**
 * Design's references kept true: systems named by plant are listed; a
 * network, channel or interlock naming something that's gone is let go;
 * an expectation generated by an interlock that's gone stays, as an
 * ordinary one. Run on opening a file and after edits that can orphan them.
 */
export function tidyDesign(project: Project): void {
  const systems = project.systems ?? [];
  for (const it of project.plant) if (it.system && !systems.includes(it.system)) systems.push(it.system);
  if (systems.length) project.systems = systems;
  else delete project.systems;
  if (project.networks && !project.networks.length) delete project.networks;
  const nets = new Set((project.networks ?? []).map((n) => n.id));
  const byId = new Map(project.plant.map((p) => [p.id, p]));
  const interlocks = new Set<string>();
  const taken = new Set<string>();
  for (const it of project.plant) {
    if (it.network && !nets.has(it.network)) delete it.network;
    for (const pt of it.points ?? []) {
      if (!pt.channel) continue;
      const m = byId.get(pt.channel.module);
      const key = `${pt.channel.module}\u0000${pt.channel.point}`;
      // A module's own points are its channels; a panel-only point has none; one point to a channel.
      if (it.module || pt.goesTo === "panel" || !m?.module || !m.points?.some((q) => q.name === pt.channel!.point) || taken.has(key)) delete pt.channel;
      else taken.add(key);
    }
    if (it.interlocks) {
      it.interlocks = it.interlocks.filter((x) => it.points?.some((q) => q.name === x.point));
      if (!it.interlocks.length) delete it.interlocks;
    }
    for (const x of it.interlocks ?? []) interlocks.add(x.id);
  }
  for (const e of project.expectations) if (e.interlock && !interlocks.has(e.interlock)) delete e.interlock;
}

/** A point renamed on a plant item: channels on it (a module) and its interlocks follow. */
export function renamePointDesign(project: Project, plantId: string, from: string, to: string): void {
  for (const it of project.plant) {
    for (const pt of it.points ?? []) if (pt.channel?.module === plantId && pt.channel.point === from) pt.channel.point = to;
    if (it.id === plantId) for (const x of it.interlocks ?? []) if (x.point === from) x.point = to;
  }
}

// ---------------------------------------------------------------------------
// The table (design-v0.4 §2, §3): systems, plant and points, made from parts.

/** Field plant, in table order: everything but controller modules. */
export const fieldPlant = (project: Project): PlantItem[] => project.plant.filter((p) => !p.module);

/** The table's groups: each system in order, then plant with none (the unnamed group), if any or if there are no systems. */
export function systemGroups(project: Project): { name: string; plant: PlantItem[] }[] {
  const field = fieldPlant(project);
  const out = (project.systems ?? []).map((name) => ({ name, plant: field.filter((p) => p.system === name) }));
  const none = field.filter((p) => !p.system || !(project.systems ?? []).includes(p.system));
  if (none.length || !out.length) out.push({ name: "", plant: none });
  return out;
}

/** Add a system, named or the next free "System n"; returns its name. */
export function addSystem(project: Project, name = ""): string {
  const list = project.systems ?? [];
  let n = name.trim();
  if (n && list.includes(n)) throw new OpError(`There's already a system "${n}"`);
  if (!n) for (let i = list.length + 1; ; i++) if (!list.includes((n = `System ${i}`))) break;
  project.systems = [...list, n];
  return n;
}

/** Rename a system: its plant follows. */
export function renameSystem(project: Project, from: string, to: string): void {
  const n = to.trim();
  const list = project.systems ?? [];
  if (!list.includes(from)) throw new OpError(`No system "${from}"`);
  if (!n) throw new OpError("A system needs a name");
  if (n !== from && list.includes(n)) throw new OpError(`There's already a system "${n}"`);
  project.systems = list.map((s) => (s === from ? n : s));
  for (const it of project.plant) if (it.system === from) it.system = n;
}

/** Remove a system: its plant stays, in the unnamed group. */
export function deleteSystem(project: Project, name: string): void {
  project.systems = (project.systems ?? []).filter((s) => s !== name);
  for (const it of project.plant) if (it.system === name) delete it.system;
  tidyDesign(project);
}

/** Move a system up (-1) or down (+1) in the table. */
export function moveSystem(project: Project, name: string, by: -1 | 1): void {
  const list = [...(project.systems ?? [])];
  const i = list.indexOf(name);
  const j = i + by;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j]!, list[i]!];
  project.systems = list;
}

export interface PlantDesign {
  system?: string;
  connects?: "hardwired" | "comms" | "both";
  protocol?: string;
  network?: string;
  enabledBy?: string;
  source?: string;
}

/** Set a plant item's Design fields; an empty value clears one. */
export function setPlantDesign(project: Project, id: string, patch: PlantDesign): void {
  const it = getPlant(project, id);
  for (const k of ["system", "protocol", "network", "enabledBy", "source"] as const) {
    const v = patch[k];
    if (v === undefined) continue;
    if (v.trim()) it[k] = v.trim();
    else delete it[k];
  }
  if (patch.connects !== undefined) {
    if (patch.connects === "hardwired") delete it.connects;
    else it.connects = patch.connects;
  }
  if (it.network && !(project.networks ?? []).some((n) => n.id === it.network)) throw new OpError("No such network");
  tidyDesign(project);
}

/**
 * Add an empty plant row (design-v0.4 §3, `+ Plant`): in a system, after a
 * given plant item or at the end of its system. Renumber tags it, unless a
 * tag is typed.
 */
export function addDesignPlant(project: Project, system = "", after?: string): PlantItem {
  if (system && !(project.systems ?? []).includes(system)) throw new OpError(`No system "${system}"`);
  const it: PlantItem = { id: newId("p"), tag: "", prefix: "U", description: "", terminals: [], ...(system ? { system } : {}) };
  insertPlant(project, it, after);
  return it;
}

/** Put plant into the project's list after a given item, or after the last of its system, or at the end. */
export function insertPlant(project: Project, it: PlantItem, after?: string): void {
  let i = after ? project.plant.findIndex((p) => p.id === after) : -1;
  if (i < 0) {
    for (let k = project.plant.length - 1; k >= 0; k--) {
      const p = project.plant[k]!;
      if (!p.module && (p.system ?? "") === (it.system ?? "")) {
        i = k;
        break;
      }
    }
  }
  if (i < 0) project.plant.push(it);
  else project.plant.splice(i + 1, 0, it);
}

/** Move plant to just after another (or to the top of its system, `null`), changing its system to that one's. */
export function movePlant(project: Project, id: string, after: string | null, system?: string): void {
  const it = getPlant(project, id);
  if (after === id) return;
  project.plant = project.plant.filter((p) => p !== it);
  if (after) {
    const a = getPlant(project, after);
    if (a.system) it.system = a.system;
    else delete it.system;
    project.plant.splice(project.plant.indexOf(a) + 1, 0, it);
  } else {
    if (system) it.system = system;
    else delete it.system;
    const first = project.plant.findIndex((p) => !p.module && (p.system ?? "") === (system ?? ""));
    if (first < 0) insertPlant(project, it);
    else project.plant.splice(first, 0, it);
  }
}

export interface PointDesign {
  name?: string;
  form?: PointForm;
  signal?: string;
  goesTo?: "channel" | "relay" | "panel";
}

/** Add a point with no pins (design-v0.4 §2, `+ Point`): a form, a name and a signal. */
export function addDesignPoint(project: Project, plantId: string, p: { name?: string; form: PointForm; signal?: string }): IoPoint {
  const it = getPlant(project, plantId);
  if (it.module) throw new OpError("A module's points are its channels: change them in the controller");
  const have = new Set((it.points ?? []).map((q) => q.name));
  let name = (p.name ?? "").trim();
  if (name && have.has(name)) throw new OpError(`${plantLabelOf(it)} already has a point "${name}"`);
  if (!name) for (let i = have.size + 1; ; i++) if (!have.has((name = `Point ${i}`))) break;
  const point: IoPoint = { name, form: p.form, pins: [], ...(p.signal?.trim() ? { signal: p.signal.trim() } : {}) };
  it.points = [...(it.points ?? []), point];
  return point;
}

const plantLabelOf = (it: PlantItem) => it.tag || `${it.prefix || "U"}?`;

/** Change a point's Design fields. Renaming follows its references; a form or goes-to its channel can't serve lets the channel go. */
export function updateDesignPoint(project: Project, plantId: string, name: string, patch: PointDesign): void {
  const it = getPlant(project, plantId);
  const p = it.points?.find((q) => q.name === name);
  if (!p) throw new OpError(`No point "${name}"`);
  if (patch.name !== undefined) {
    const n = patch.name.trim();
    if (!n) throw new OpError("A point needs a name");
    if (n !== name) {
      if (it.points!.some((q) => q.name === n)) throw new OpError(`${plantLabelOf(it)} already has a point "${n}"`);
      p.name = n;
      renamePointRefs(project, it.id, name, n);
      renamePointDesign(project, it.id, name, n);
    }
  }
  if (patch.form !== undefined) p.form = patch.form;
  if (patch.signal !== undefined) {
    if (patch.signal.trim()) p.signal = patch.signal.trim();
    else delete p.signal;
  }
  if (patch.goesTo !== undefined) {
    if (patch.goesTo === "channel") delete p.goesTo;
    else p.goesTo = patch.goesTo;
  }
  // What it now is: a channel that can't take it lets it go.
  if (p.channel) {
    const m = project.plant.find((x) => x.id === p.channel!.module);
    const ch = m?.points?.find((q) => q.name === p.channel!.point);
    const t = pointType(p.form);
    if (!t || goesTo(p) === "panel" || !m || !ch || !channelTypes(m, ch).includes(t)) delete p.channel;
  }
  syncPlantViews(project);
}

/** Remove a point; references to it are left for Check, as when one goes in Draft. */
export function deleteDesignPoint(project: Project, plantId: string, name: string): void {
  const it = getPlant(project, plantId);
  it.points = (it.points ?? []).filter((q) => q.name !== name);
  if (!it.points.length) delete it.points;
  tidyDesign(project);
  syncPlantViews(project);
}

/** A channel as people say it: the module's tag and the channel's name, "A3-23 DI2". */
export function channelText(project: Project, ref: ChannelRef | undefined): string {
  if (!ref) return "";
  const m = project.plant.find((p) => p.id === ref.module);
  return m ? `${plantLabelOf(m)} ${ref.point}` : "";
}

// ---------------------------------------------------------------------------
// Duplicate ×n and Design templates (design-v0.4 §3): general tools that
// copy rows, with no idea what kind of plant they are.

/**
 * A tag moved on by `by`: its last number plus `by`, keeping leading zeros
 * (P1 → P2, AHU-01 → AHU-02). A tag with no number, or an empty one, gives
 * an empty tag, for Renumber or typing.
 */
export function stepTag(tag: string, by: number): string {
  const m = /^(.*?)(\d+)(\D*)$/.exec(tag);
  if (!m) return "";
  const n = Number(m[2]) + by;
  if (n < 0) return "";
  return `${m[1]}${String(n).padStart(m[2]!.length, "0")}${m[3]}`;
}

/** What copying would give each source row's tag, copy by copy, and whether it's free. */
export function tagPlan(project: Project, tags: string[], copies: number, step: number, first: number): { tag: string; taken: boolean }[][] {
  const used = new Set(project.plant.map((p) => p.tag).filter(Boolean));
  const out: { tag: string; taken: boolean }[][] = [];
  for (let k = 0; k < copies; k++) {
    out.push(
      tags.map((t) => {
        const tag = stepTag(t, step * (first + k));
        const taken = !!tag && used.has(tag);
        if (tag && !taken) used.add(tag);
        return { tag, taken };
      }),
    );
  }
  return out;
}

/**
 * Copies of plant rows, `copies` times, each copy's tags moved on by
 * `step` more (copy k by step × (first + k)). Within the group, points
 * that follow or interlock on each other follow the copies; anything
 * outside the group is kept. Copies aren't on channels (allocation is by
 * hand) and aren't drawn. A tag that's taken is left empty.
 */
function copyRows(
  project: Project,
  source: PlantItem[],
  opts: { copies: number; step: number; first: number; system?: string; after?: string },
): { plant: PlantItem[]; untagged: number } {
  const copies = Math.max(1, Math.min(200, Math.floor(opts.copies)));
  const plan = tagPlan(project, source.map((p) => p.tag), copies, opts.step, opts.first);
  const made: PlantItem[] = [];
  let untagged = 0;
  let after = opts.after;
  for (let k = 0; k < copies; k++) {
    const ids = new Map(source.map((p) => [p.id, newId("p")]));
    const remap = (ref: string) => {
      const m = /^plant:([^:]+):(.*)$/.exec(ref);
      const to = m && ids.get(m[1]!);
      return to ? `plant:${to}:${m![2]}` : ref;
    };
    source.forEach((src, i) => {
      const { module: _m, ...rest } = plain(src);
      const it: PlantItem = { ...rest, id: ids.get(src.id)! };
      const t = plan[k]![i]!;
      it.tag = t.taken ? "" : t.tag;
      if (src.tag && !it.tag) untagged++;
      if (it.tag) it.locked = true;
      else delete it.locked;
      if (opts.system !== undefined) {
        if (opts.system) it.system = opts.system;
        else delete it.system;
      }
      for (const pt of it.points ?? []) {
        delete pt.channel;
        for (const c of pt.follows ?? []) c.ref = remap(c.ref);
      }
      for (const x of it.interlocks ?? []) {
        x.id = newId("il");
        for (const c of x.when) c.ref = remap(c.ref);
      }
      insertPlant(project, it, after);
      after = it.id;
      made.push(it);
    });
  }
  if (opts.system && !(project.systems ?? []).includes(opts.system)) project.systems = [...(project.systems ?? []), opts.system];
  tidyDesign(project);
  return { plant: made, untagged };
}

/** Plain data from a reactive proxy or a plain object alike. */
function plain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Plant rows by id, in table order. */
function rowsOf(project: Project, ids: string[]): PlantItem[] {
  const set = new Set(ids);
  const rows = project.plant.filter((p) => set.has(p.id) && !p.module);
  if (!rows.length) throw new OpError("Pick plant rows first");
  return rows;
}

/**
 * Duplicate ×n (design-v0.4 §3): any picked rows, one item or a group,
 * copied n times after the last of them, tags stepping (P1 → P2, P3…).
 */
export function duplicatePlant(project: Project, ids: string[], copies = 1, step = 1): { plant: PlantItem[]; untagged: number } {
  const rows = rowsOf(project, ids);
  return copyRows(project, rows, { copies, step, first: 1, after: rows[rows.length - 1]!.id });
}

/** Save picked rows as a Design template: copies, with no module, channels or system. */
export function designTemplateOf(project: Project, ids: string[], name: string): DesignTemplate {
  const n = name.trim();
  if (!n) throw new OpError("A template needs a name");
  const rows = rowsOf(project, ids);
  const plant = rows.map((src) => {
    const { module: _m, system: _s, ...rest } = plain(src);
    for (const pt of rest.points ?? []) delete pt.channel;
    return rest as PlantItem;
  });
  return { name: n, plant };
}

/**
 * Insert a Design template into a system: `copies` copies, the first with
 * the template's own tags, each next moved on by `step`. Nothing links
 * back to the template.
 */
export function insertDesignTemplate(
  project: Project,
  t: DesignTemplate,
  opts: { system?: string; copies?: number; step?: number; after?: string } = {},
): { plant: PlantItem[]; untagged: number } {
  if (!t.plant.length) throw new OpError("That template has no rows");
  if (opts.system && !(project.systems ?? []).includes(opts.system)) throw new OpError(`No system "${opts.system}"`);
  return copyRows(project, t.plant, { copies: opts.copies ?? 1, step: opts.step ?? 1, first: 0, system: opts.system ?? "", after: opts.after });
}

/** What a template's rows need from the controller: its DI, DO, AI, AO, row by row and in all. */
export function templateCounts(t: DesignTemplate): { rows: { tag: string; description: string; points: string; counts: Counts }[]; total: Counts } {
  const total = zero();
  const rows = t.plant.map((p) => {
    const counts = zero();
    for (const q of p.points ?? []) {
      const ty = pointType(q.form);
      if (ty && goesTo(q) !== "panel") {
        counts[ty]++;
        total[ty]++;
      }
    }
    return { tag: p.tag, description: p.description, points: (p.points ?? []).map((q) => q.name).join(", "), counts };
  });
  return { rows, total };
}

// ---------------------------------------------------------------------------
// Allocation views (design-v0.4 §4): what's left to put on a channel, and
// which channels a point can go on. Nothing here allocates.

/** Points that go to a channel and have none, in table order. */
export function unallocated(project: Project): { plant: PlantItem; point: IoPoint }[] {
  const out: { plant: PlantItem; point: IoPoint }[] = [];
  for (const g of systemGroups(project)) for (const plant of g.plant) for (const point of plant.points ?? []) if (needsChannel(point) && !point.channel) out.push({ plant, point });
  return out;
}

/** Channels a point could go on: of a type it needs, and free (or already its own), in rail order. */
export function channelsFor(project: Project, point: IoPoint): { module: PlantItem; channel: IoPoint }[] {
  const t = pointType(point.form);
  if (!t || goesTo(point) === "panel") return [];
  const out: { module: PlantItem; channel: IoPoint }[] = [];
  for (const { module, channel, types } of channelsOfInRailOrder(project)) {
    if (!types.includes(t)) continue;
    const on = pointOnChannel(project, { module: module.id, point: channel.name });
    if (!on || on.point === point) out.push({ module, channel });
  }
  return out;
}

/** Every module channel, its controller's rail order first. */
export function channelsOfInRailOrder(project: Project): { module: PlantItem; channel: IoPoint; types: IoType[] }[] {
  const all = channelsOf(project);
  const order: string[] = [];
  for (const c of project.controllers ?? []) for (const s of c.slots) if (s.module) order.push(s.module);
  const rank = (id: string) => {
    const i = order.indexOf(id);
    return i < 0 ? order.length : i;
  };
  return all.map((x, i) => ({ ...x, i })).sort((a, b) => rank(a.module.id) - rank(b.module.id) || a.i - b.i);
}

/** Why a point can't be allocated at all, if it can't: no channel of its type on the controller. */
export function noChannelReason(project: Project, point: IoPoint): string | undefined {
  const t = pointType(point.form);
  if (!t || goesTo(point) === "panel") return undefined;
  if (!channelsOf(project).some((c) => c.types.includes(t))) {
    const word = { DI: "digital inputs", DO: "digital outputs", AI: "analogue inputs", AO: "analogue outputs" }[t];
    return `the panel has no ${word}`;
  }
  if (!channelsFor(project, point).length) return `every ${t} channel is taken`;
  return undefined;
}

/**
 * A module channel's label (design-v0.4 §4): it follows the point on it
 * ("DPS1 flow"); a channel with no point keeps a label typed by hand.
 */
export function channelLabel(project: Project, module: PlantItem, channel: IoPoint): string {
  if (!module.module) return channel.label ?? "";
  const on = pointOnChannel(project, { module: module.id, point: channel.name });
  return on ? `${plantLabelOf(on.plant)} ${on.point.name}` : (channel.label ?? "");
}
