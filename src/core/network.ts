/**
 * Networks (design-v0.4 §7): comms plant names its network, a LAN off a
 * switch or a bus off the controller; order on a bus is the row order. The
 * Network view and the network sheet both draw `networkDiagram`, from the
 * data: controller, switch, each network with its devices in order, long
 * runs shortened with a count. Addresses aren't held in v0.4.
 */
import { newId, type Network, type Page, type PlantItem, type Project } from "./model";
import { OpError, addElement, addPage, getPlant } from "./ops";
import type { NetworkData } from "./networkdraw";
import { controllerTag } from "./modules";

const tagOf = (p: PlantItem) => p.tag || `${p.prefix || "U"}?`;

/** A network's devices, in row order. */
export function devicesOn(project: Project, net: string): PlantItem[] {
  return project.plant.filter((p) => !p.module && p.network === net);
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

export function updateNetwork(project: Project, id: string, patch: Partial<Omit<Network, "id">>): void {
  const n = project.networks?.find((x) => x.id === id);
  if (!n) throw new OpError("No such network");
  if (patch.name !== undefined) {
    const v = patch.name.trim();
    if (!v) throw new OpError("A network needs a name");
    if (project.networks!.some((x) => x !== n && x.name === v)) throw new OpError(`There's already a network "${v}"`);
    n.name = v;
  }
  if (patch.protocol !== undefined) n.protocol = patch.protocol.trim();
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

export function networkData(project: Project): NetworkData {
  const c = project.controllers?.[0];
  const nets = project.networks ?? [];
  const on = (n: Network) => devicesOn(project, n.id).map(tagOf);
  return {
    ...(c ? { controller: { tag: controllerTag(project, c), description: c.description } } : {}),
    lans: nets.filter((n) => n.kind === "lan").map((net) => ({ net, devices: on(net) })),
    buses: nets.filter((n) => n.kind === "bus").map((net) => ({ net, devices: on(net) })),
    loose: project.plant.filter((p) => !p.module && (p.connects === "comms" || p.connects === "both") && !p.network).map(tagOf),
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
