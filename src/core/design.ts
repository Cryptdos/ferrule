/**
 * Design (design-v0.4 §2, §4, §6, §7): what a panel has, recorded before
 * it's drawn. Plant in systems, points with a signal and where they go,
 * module channels they're allocated to, interlocks and networks. Nothing
 * here decides anything for the engineer: allocation is by hand, and a
 * reference to something that's gone is let go, never guessed.
 */
import type { ChannelRef, IoPoint, PlantItem, PointForm, Project } from "./model";
import { OpError, getPlant } from "./ops";

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
