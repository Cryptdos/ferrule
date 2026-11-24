/**
 * Networks (design-v0.4 §7): comms plant names its network, a LAN off a
 * switch or a bus off the controller; order on a bus is the row order. The
 * Network view and the network sheet both draw `networkDiagram`, from the
 * data: controller, switch, each network with its devices in order, long
 * runs shortened with a count. Addresses aren't held in v0.4.
 */
import { newId, type Network, type Page, type PlantItem, type Project } from "./model";
import { OpError, addElement, addPage, getPlant, portGroups } from "./ops";
import type { NetworkData } from "./networkdraw";
import { controllerTag } from "./modules";
import { requireSymbol, terminalPoint } from "./symbols";

const tagOf = (p: PlantItem) => p.tag || `${p.prefix || "U"}?`;

/** A network's devices, in row order. */
export function devicesOn(project: Project, net: string): PlantItem[] {
  return project.plant.filter((p) => !p.module && p.network === net);
}

/**
 * A network on a serial port that has wires on it (v0.4.x M7): its devices
 * and their order, from the drawing. Followed from the port's pins along
 * wires, terminals passed straight through (and other bridged parts), links
 * to other sheets and plant views joined to their device's pins, to each
 * device reached at a pin of one of its own serial ports, and on through
 * that port to the next. Order is by how many devices the conductors pass
 * through to get there, then by length of the path, then row order. A
 * device's pins that aren't a serial port end the trail (so a shared 0 V
 * doesn't bring in everything on it), and so does a module.
 *
 * `drawn` is false when the port has no wires on it: the order is Design's.
 */
export function networkChain(project: Project, net: Network): { drawn: boolean; devices: PlantItem[] } {
  const none = { drawn: false, devices: [] };
  const owner = net.port && project.plant.find((p) => p.id === net.port!.plant);
  if (!owner || !net.port) return none;
  const group = net.port.group;
  const startPins = owner.terminals.filter((t) => owner.pins?.[t]?.group === group && owner.pins[t]!.port);
  if (!startPins.length) return none;

  const pinKey = (plant: string, pin: string) => `p\u0000${plant}\u0000${pin}`;
  const termKey = (el: string, t: string) => `t\u0000${el}\u0000${t}`;
  const adj = new Map<string, Set<string>>();
  const join = (a: string, b: string) => {
    if (a === b) return;
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  };
  /** A node that's a device's pin: drawn on a plant view, or the pin itself. */
  const devOf = new Map<string, { plant: string; pin: string }>();
  const plantById = new Map(project.plant.map((p) => [p.id, p]));
  let drawn = false;
  for (const pg of project.pages) {
    if (pg.ga) continue;
    const byId = new Map(pg.elements.map((e) => [e.id, e]));
    for (const seg of pg.segments) {
      join(termKey(...seg.from), termKey(...seg.to));
      for (const [id, t] of [seg.from, seg.to]) {
        const el = byId.get(id);
        if (el?.symbol === "plant-view" && el.params.plant === owner.id && startPins.includes(t)) drawn = true;
      }
    }
    const at = new Map<string, string[]>();
    for (const el of pg.elements) {
      if (el.symbol === "plant-view") {
        const plant = String(el.params.plant);
        for (const t of String(el.params.show ?? "").split(",").filter(Boolean)) {
          devOf.set(termKey(el.id, t), { plant, pin: t });
          join(termKey(el.id, t), pinKey(plant, t));
        }
      }
      if (el.symbol === "offpage") {
        for (const other of el.links) join(termKey(el.id, "1"), termKey(other, "1"));
        continue;
      }
      const sym = requireSymbol(el.symbol);
      for (const g of sym.bridged?.(el) ?? []) for (const n of g.slice(1)) join(termKey(el.id, g[0]!), termKey(el.id, n));
      for (const t of sym.draw(el).terminals) {
        const pt = terminalPoint(el, t.name);
        if (pt) at.set(`${pt[0]},${pt[1]}`, [...(at.get(`${pt[0]},${pt[1]}`) ?? []), termKey(el.id, t.name)]);
      }
    }
    // An arrow dropped straight onto a pin is on it, as for conductors.
    for (const a of pg.elements) {
      if (a.symbol !== "offpage") continue;
      const pt = terminalPoint(a, "1");
      for (const k of (pt && at.get(`${pt[0]},${pt[1]}`)) || []) join(termKey(a.id, "1"), k);
    }
  }
  if (!drawn) return none;
  for (const it of project.plant) {
    for (const t of it.terminals) {
      devOf.set(pinKey(it.id, t), { plant: it.id, pin: t });
      // A serial port's pins are one way through the device, on to the next.
      const g = it.pins?.[t];
      if (g?.port && g.group) for (const u of it.terminals) if (u !== t && it.pins?.[u]?.group === g.group && it.pins[u]!.port) join(pinKey(it.id, t), pinKey(it.id, u));
    }
  }

  const isPort = (d: { plant: string; pin: string }) => !!plantById.get(d.plant)?.pins?.[d.pin]?.port;
  const PASS = 1e6;
  const cost = new Map<string, number>();
  const found = new Map<string, number>();
  let frontier = startPins.map((t) => pinKey(owner.id, t));
  for (const k of frontier) cost.set(k, 0);
  // Small graphs: a plain Dijkstra over a sorted list.
  const done = new Set<string>();
  while (frontier.length) {
    frontier.sort((a, b) => cost.get(a)! - cost.get(b)!);
    const u = frontier.shift()!;
    if (done.has(u)) continue;
    done.add(u);
    const c = cost.get(u)!;
    const du = devOf.get(u);
    if (du) {
      const item = plantById.get(du.plant);
      if (du.plant === owner.id) {
        if (owner.pins?.[du.pin]?.group !== group || !isPort(du)) continue;
      } else {
        if (!item || item.module || !isPort(du)) continue;
        if (!found.has(du.plant)) found.set(du.plant, c);
      }
    }
    for (const v of adj.get(u) ?? []) {
      if (done.has(v)) continue;
      const dv = devOf.get(v);
      const w = du && dv && du.plant === dv.plant ? 0 : du && du.plant !== owner.id ? PASS + 1 : 1;
      if (c + w < (cost.get(v) ?? Infinity)) {
        cost.set(v, c + w);
        frontier.push(v);
      }
    }
  }
  const row = new Map(project.plant.map((p, i) => [p.id, i]));
  const devices = [...found.keys()].sort((a, b) => found.get(a)! - found.get(b)! || row.get(a)! - row.get(b)!).map((id) => plantById.get(id)!);
  return { drawn: true, devices };
}

/** A network's devices in the order the sheet draws them: from the drawing when its port is wired, else Design's. */
export function networkOrder(project: Project, net: Network): { drawn: boolean; devices: PlantItem[] } {
  const ch = networkChain(project, net);
  return ch.drawn ? ch : { drawn: false, devices: devicesOn(project, net.id) };
}

/** Add a network: "LAN 1", "Bus 1"… with its kind and protocol. */
export function addNetwork(project: Project, kind: "lan" | "bus" = "lan", protocol = ""): Network {
  const list = project.networks ?? [];
  const base = kind === "lan" ? "LAN" : "Bus";
  let i = 1;
  while (list.some((n) => n.name === `${base} ${i}`)) i++;
  const name = `${base} ${i}`;
  const n: Network = { id: newId("net"), name, protocol: protocol || (kind === "lan" ? "BACnet IP" : "Modbus RTU"), kind };
  project.networks = [...list, n];
  return n;
}

export function updateNetwork(project: Project, id: string, patch: Partial<Omit<Network, "id" | "port">> & { port?: Network["port"] | null }): void {
  const n = project.networks?.find((x) => x.id === id);
  if (!n) throw new OpError("No such network");
  if (patch.name !== undefined) {
    const v = patch.name.trim();
    if (!v) throw new OpError("A network needs a name");
    if (project.networks!.some((x) => x !== n && x.name === v)) throw new OpError(`There's already a network "${v}"`);
    n.name = v;
  }
  if (patch.protocol !== undefined) n.protocol = patch.protocol.trim();
  // The serial port it's on (v0.4.x T5): a group marked as a port.
  if (patch.port !== undefined) {
    if (!patch.port) delete n.port;
    else {
      const it = project.plant.find((p) => p.id === patch.port!.plant);
      if (!it || !portGroups(it).includes(patch.port.group)) throw new OpError("Pick a group of pins marked as a serial port");
      n.port = { plant: it.id, group: patch.port.group };
    }
  }
  if (patch.kind !== undefined) n.kind = patch.kind === "lan" ? "lan" : "bus";
}

/** Remove a network: its devices stay, on no network. */
export function deleteNetwork(project: Project, id: string): void {
  project.networks = (project.networks ?? []).filter((n) => n.id !== id);
  if (!project.networks.length) delete project.networks;
  for (const p of project.plant) if (p.network === id) delete p.network;
}

/**
 * Move a device along its network (-1 earlier, +1 later): the row order,
 * so it swaps places with its neighbour on the network in the table too.
 */
export function moveOnNetwork(project: Project, plantId: string, by: -1 | 1): void {
  const it = getPlant(project, plantId);
  if (!it.network) throw new OpError("It isn't on a network");
  const n = project.networks?.find((x) => x.id === it.network);
  if (n && networkChain(project, n).drawn) throw new OpError(`${n.name}'s order comes from the drawing`);
  const list = devicesOn(project, it.network);
  const i = list.indexOf(it);
  const other = list[i + by];
  if (!other) return;
  const a = project.plant.indexOf(it);
  const b = project.plant.indexOf(other);
  project.plant[a] = other;
  project.plant[b] = it;
}

/** Put devices on a network (or none, ""), as comms plant. */
export function putOnNetwork(project: Project, ids: string[], net: string): void {
  if (net && !project.networks?.some((n) => n.id === net)) throw new OpError("No such network");
  for (const id of ids) {
    const it = getPlant(project, id);
    if (it.module) continue;
    if (!net) {
      delete it.network;
      continue;
    }
    it.network = net;
    if (!it.connects) it.connects = "comms";
    const n = project.networks!.find((x) => x.id === net)!;
    if (!it.protocol && n.protocol) it.protocol = n.protocol;
  }
}

// ---------------------------------------------------------------------------
// The drawing

/** A network's port, as printed at the controller end (v0.4.x T5): its group, and whose it is when that isn't the controller's host. */
export function portName(project: Project, net: Network): string {
  if (!net.port) return "";
  const it = project.plant.find((p) => p.id === net.port!.plant);
  if (!it) return "";
  const c = project.controllers?.[0];
  const host = c ? controllerTag(project, c) : "";
  const tag = it.tag || `${it.prefix || "U"}?`;
  return tag === host ? net.port.group : `${tag} ${net.port.group}`;
}

export function networkData(project: Project): NetworkData {
  const portOf = (n: Network) => {
    const p = portName(project, n);
    return p ? { port: p } : {};
  };
  const c = project.controllers?.[0];
  const nets = project.networks ?? [];
  const order = new Map(nets.map((n) => [n.id, networkOrder(project, n)]));
  const chained = new Set([...order.values()].filter((o) => o.drawn).flatMap((o) => o.devices.map((d) => d.id)));
  const on = (n: Network) => order.get(n.id)!.devices.map(tagOf);
  return {
    ...(c ? { controller: { tag: controllerTag(project, c), description: c.description } } : {}),
    lans: nets.filter((n) => n.kind === "lan").map((net) => ({ net, devices: on(net), ...portOf(net) })),
    buses: nets.filter((n) => n.kind === "bus").map((net) => ({ net, devices: on(net), ...portOf(net) })),
    loose: project.plant.filter((p) => !p.module && (p.connects === "comms" || p.connects === "both") && !p.network && !chained.has(p.id)).map(tagOf),
  };
}


/**
 * Place as sheet (design-v0.4 §7): a spare sheet at the end of the set (one
 * that holds annotations only) titled Network, with a network diagram on
 * it, redrawn from the data as the networks change. Returns the sheet.
 */
export function placeNetworkSheet(project: Project): Page {
  const page = addPage(project, "Network diagram");
  page.spare = true;
  addElement(project, page.id, "netmap", [2, 3], { params: { width: 146 } });
  return page;
}

export { networkDiagram, type NetworkData } from "./networkdraw";
