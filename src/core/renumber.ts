/**
 * Renumbering (DESIGN.md §8). Run on demand, never on every move, so a
 * drawing doesn't change under you while you work. Locked tags and wire
 * numbers are kept.
 *
 * Position numbering:
 *  - component tags: prefix + sheet-column of the component, e.g. K10-16;
 *  - terminals: sheet-column, e.g. 10-12 (the strip groups them);
 *  - wire numbers: a wire on a terminal takes the terminal's number (the
 *    first along the strip, by sheet then left to right, if it reaches
 *    more than one); any other, the sheet-column of the conductor's start
 *    (its highest point), e.g. 11-22 (v0.3 §2);
 *  - in each case the highest item in a column keeps the plain address and
 *    the rest, working down, get A, B, C…
 * Position numbering is the only scheme (v0.5 A50): it's part of the
 * design, and where it falls short it's fixed.
 *
 * A wire on a supply (a block or rail assigned one with a tag) carries the
 * supply's number, ahead of every other rule (v0.5 A23). Contacts
 * linked to a coil take its tag and get pole numbers 1, 2, 3… (13/14,
 * 21/22, 33/34…).
 */
import { fitBlock } from "./blocks";
import { refreshConductors, supplyOf } from "./conductors";
import { columnOf, type Vec } from "./geometry";
import type { Conductor, Element, Page, Project } from "./model";
import { assignAddresses, collisionSuffix, type Placed } from "./numbering";
import { requireSymbol, terminalPoint } from "./symbols";
import { tagPrefix } from "./tags";
import { plantTag, syncPlantViews } from "./ops";
import { controllerMapEntries } from "./modules";
import { controllerMapSlots } from "./symbols";
import { isMaster, masterOf, slavesOf } from "./xref";

/**
 * The terminal a conductor takes its number from (v0.3 §2): the first along
 * the strip it reaches, by sheet then left to right. None if it reaches no
 * terminal, or only unnumbered ones.
 */
export function numberingTerminal(project: Project, c: Conductor): { el: Element; page: Page } | null {
  const ids = new Set(c.terminals.map(([id]) => id));
  let best: { el: Element; page: Page } | null = null;
  for (const page of project.pages) {
    for (const el of page.elements) {
      if (el.symbol !== "terminal" || !el.tag || !ids.has(el.id)) continue;
      if (!best || page.number < best.page.number || (page.number === best.page.number && (el.pos[0] < best.el.pos[0] || (el.pos[0] === best.el.pos[0] && el.pos[1] < best.el.pos[1]))))
        best = { el, page };
    }
  }
  return best;
}

export interface RenumberResult {
  tags: number;
  terminals: number;
  wires: number;
  plant: number;
}

const isLocked = (el: Element) => el.params.locked === true;

interface Item {
  id: string;
  page: number;
  column: number;
  y: number;
  x: number;
  group: string;
}

function order(a: Item, b: Item) {
  return a.page - b.page || a.column - b.column || a.y - b.y || a.x - b.x || a.id.localeCompare(b.id);
}

/** Addresses for items grouped by prefix/strip, avoiding `taken` values. */
function assign(
  items: Item[],
  taken: Set<string>,
  label: (it: Item, n: string) => string,
): Map<string, string> {
  const out = new Map<string, string>();
  const groups = new Map<string, Item[]>();
  for (const it of items) groups.set(it.group, [...(groups.get(it.group) ?? []), it]);
  for (const group of groups.values()) {
    const addr = assignAddresses(group.map((it): Placed => ({ id: it.id, page: it.page, column: it.column, y: it.y })));
    for (const it of group.sort(order)) {
      let v = label(it, addr.get(it.id)!);
      // Skip past anything locked (or already given out) that holds this address.
      for (let k = 1; taken.has(v); k++) v = label(it, `${it.page}-${it.column}${collisionSuffix(k)}`);
      taken.add(v);
      out.set(it.id, v);
    }
  }
  return out;
}

/**
 * Terminal strips follow on (v0.5 A51). A terminal is on the same strip as
 * the terminal before it, by sheet then left to right (then top down), until
 * a strip is typed on one; every terminal after that follows the new strip,
 * until the next one typed. With nothing typed, everything is X1.
 * A terminal Renumber gives its strip carries `stripAuto`; one typed (in
 * Properties, or by a strip line) doesn't, and starts a run. A locked
 * terminal keeps its strip.
 */
export function stripsFollowOn(project: Project): void {
  const terms: { el: Element; page: number }[] = [];
  for (const page of project.pages) {
    if (page.ga) continue;
    for (const el of page.elements) if (el.symbol === "terminal") terms.push({ el, page: page.number });
  }
  terms.sort((a, b) => a.page - b.page || a.el.pos[0] - b.el.pos[0] || a.el.pos[1] - b.el.pos[1]);
  let strip = "X1";
  for (const { el } of terms) {
    const typed = el.params.stripAuto !== true;
    if (typed) {
      strip = String(el.params.strip ?? "X1").trim() || "X1";
      continue;
    }
    if (isLocked(el)) continue;
    el.params.strip = strip;
  }
}

export function renumber(project: Project): RenumberResult {
  const result: RenumberResult = { tags: 0, terminals: 0, wires: 0, plant: 0 };
  stripsFollowOn(project);

  // --- Component tags and terminals --------------------------------------
  const tagItems: Item[] = [];
  const termItems: Item[] = [];
  const takenTags = new Set<string>();
  const takenTerms = new Set<string>();
  const byId = new Map<string, Element>();
  for (const page of project.pages) {
    for (const el of page.elements) {
      byId.set(el.id, el);
      const def = requireSymbol(el.symbol);
      if (!def.kind(el) || masterOf(project, el)) continue;
      const it: Item = {
        id: el.id,
        page: page.number,
        column: columnOf(el.pos[0]),
        y: el.pos[1],
        x: el.pos[0],
        group: "",
      };
      if (el.symbol === "terminal") {
        it.group = String(el.params.strip ?? "X1");
        if (isLocked(el) && el.tag) takenTerms.add(`${it.group}:${el.tag}`);
        else termItems.push(it);
      } else {
        it.group = tagPrefix(el, project);
        if (isLocked(el) && el.tag) takenTags.add(el.tag);
        else tagItems.push(it);
      }
    }
  }
  for (const [id, tag] of assign(tagItems, takenTags, (it, n) => it.group + n)) {
    byId.get(id)!.tag = tag;
    result.tags++;
  }
  for (const [id, tag] of assign(termItems, takenTerms, (it, n) => `${it.group}:${n}`)) {
    byId.get(id)!.tag = tag.slice(tag.indexOf(":") + 1);
    result.terminals++;
  }

  // --- Plant: prefix + where its first view is -------------------------------
  // A controller's modules, when the project has a map of it, take their tags
  // from their place on the map instead (v0.4.x T9).
  const onMap = new Map<string, Item>();
  for (const page of project.pages) {
    for (const el of page.elements) {
      if (el.symbol !== "ctrlmap") continue;
      const ctrl = (project.controllers ?? []).find((c) => c.id === el.params.ctrl) ?? project.controllers?.[0];
      if (!ctrl) continue;
      const entries = controllerMapEntries(project, ctrl.id);
      const slots = controllerMapSlots(entries, typeof el.params.width === "number" ? el.params.width : 120);
      ctrl.slots.forEach((sl, i) => {
        const item = sl.module ? project.plant.find((p) => p.id === sl.module) : undefined;
        const at = slots[i];
        if (!item || !at || onMap.has(item.id)) return;
        const x = el.pos[0] + at[0];
        const y = el.pos[1] + at[1];
        onMap.set(item.id, { id: item.id, page: page.number, column: columnOf(x), y, x, group: item.prefix || "A" });
      });
    }
  }
  const plantItems: Item[] = [];
  for (const item of project.plant) {
    if (item.locked && item.tag) {
      takenTags.add(item.tag);
      continue;
    }
    const mapped = onMap.get(item.id);
    if (mapped) {
      plantItems.push(mapped);
      continue;
    }
    let first: Item | null = null;
    for (const page of project.pages) {
      for (const el of page.elements) {
        if (el.symbol !== "plant-view" || el.params.plant !== item.id) continue;
        const it: Item = { id: item.id, page: page.number, column: columnOf(el.pos[0]), y: el.pos[1], x: el.pos[0], group: item.prefix || "U" };
        if (!first || order(it, first) < 0) first = it;
      }
    }
    if (first) plantItems.push(first);
  }
  // Addresses are only taken within a prefix: SF-1-23 and A1-23 can share a column.
  for (const [id, keyed] of assign(plantItems, new Set(), (it, n) => `${it.group}:${n}`)) {
    const address = keyed.slice(keyed.indexOf(":") + 1);
    const item = project.plant.find((p) => p.id === id)!;
    let tag = plantTag(item.prefix || "U", address);
    for (let k = 1; takenTags.has(tag); k++) tag = plantTag(item.prefix || "U", `${address}${collisionSuffix(k)}`);
    takenTags.add(tag);
    item.tag = tag;
    result.plant++;
  }

  // --- Contact pole numbers ------------------------------------------------
  for (const page of project.pages) {
    for (const el of page.elements) {
      if (!isMaster(el)) continue;
      slavesOf(project, el)
        .filter((s) => s.el.symbol !== "isolator")
        .forEach((s, i) => (s.el.params.pole = Math.min(9, i + 1)));
    }
  }

  // --- Wire numbers ----------------------------------------------------------
  refreshConductors(project);
  const where = new Map<string, { el: Element; page: Page }>();
  for (const page of project.pages) for (const el of page.elements) where.set(el.id, { el, page });

  const condItems: Item[] = [];
  const takenWires = new Set<string>();
  for (const c of project.conductors) if (c.locked && c.number) takenWires.add(c.number);
  // 1. A wire on a supply carries the supply's number (v0.5 A23), terminal or not.
  const fromTerminal = new Set<string>();
  for (const c of project.conductors) {
    if (c.locked && c.number) continue;
    const d = supplyOf(project, c);
    if (!d) continue;
    c.number = String(d.tag);
    fromTerminal.add(c.id);
    result.wires++;
  }
  // 2. A wire on a terminal takes the terminal's number: the two always agree (v0.3 §2).
  for (const c of project.conductors) {
    if ((c.locked && c.number) || fromTerminal.has(c.id)) continue;
    const t = numberingTerminal(project, c);
    if (!t) continue;
    c.number = t.el.tag;
    takenWires.add(c.number);
    fromTerminal.add(c.id);
    result.wires++;
  }
  for (const c of project.conductors) {
    if ((c.locked && c.number) || fromTerminal.has(c.id)) continue;
    // 3. Otherwise by where it starts (a wire off a block or rail on no supply, too).
    let start: { page: number; at: Vec } | null = null;
    for (const [id, term] of c.terminals) {
      const w = where.get(id);
      const at = w ? terminalPoint(w.el, term) : null;
      if (!w || !at) continue;
      const better =
        !start ||
        w.page.number < start.page ||
        (w.page.number === start.page && (at[1] < start.at[1] || (at[1] === start.at[1] && at[0] < start.at[0])));
      if (better) start = { page: w.page.number, at };
    }
    if (!start) continue;
    condItems.push({ id: c.id, page: start.page, column: columnOf(start.at[0]), y: start.at[1], x: start.at[0], group: "" });
  }
  const numbers = assign(condItems, takenWires, (_it, n) => n);
  for (const c of project.conductors) {
    const n = numbers.get(c.id);
    if (n !== undefined) {
      c.number = n;
      result.wires++;
    }
  }
  // Module labels follow the tags of the points on them (design-v0.4 §4).
  syncPlantViews(project);
  // Each sheet's terminal block fits its new numbers now, not at the next route (v0.4.x F8).
  for (const page of project.pages) fitBlock(page);
  return result;
}

export interface RenumberChange {
  kind: "Tag" | "Terminal" | "Plant" | "Wire" | "Pole";
  /** Sheet-column of the thing, or its sheet for a wire. */
  where: string;
  from: string;
  to: string;
}

/**
 * What Renumber would change, without changing anything: run it on a copy
 * and compare. Only real changes are listed.
 */
export function renumberPreview(project: Project): { changes: RenumberChange[]; result: Project } {
  const copy: Project = JSON.parse(JSON.stringify(project));
  renumber(copy);
  const changes: RenumberChange[] = [];
  const before = new Map<string, Element>();
  for (const page of project.pages) for (const el of page.elements) before.set(el.id, el);
  for (const page of copy.pages) {
    for (const el of page.elements) {
      const old = before.get(el.id);
      if (!old) continue;
      const where = `${page.number}-${columnOf(el.pos[0])}`;
      if ((old.tag ?? "") !== (el.tag ?? "")) {
        changes.push({ kind: el.symbol === "terminal" ? "Terminal" : "Tag", where, from: old.tag || "–", to: el.tag || "–" });
      }
      if (old.params.pole !== el.params.pole && el.params.pole !== undefined) {
        changes.push({ kind: "Pole", where, from: String(old.params.pole ?? "–"), to: String(el.params.pole) });
      }
    }
  }
  const oldPlant = new Map(project.plant.map((p) => [p.id, p]));
  for (const item of copy.plant) {
    const old = oldPlant.get(item.id);
    if (old && old.tag !== item.tag) changes.push({ kind: "Plant", where: item.description || "", from: old.tag || "–", to: item.tag });
  }
  const oldCond = new Map(project.conductors.map((c) => [c.id, c]));
  const sheetOf = new Map<string, number>();
  for (const page of copy.pages) for (const el of page.elements) sheetOf.set(el.id, page.number);
  for (const c of copy.conductors) {
    const old = oldCond.get(c.id);
    if ((old?.number ?? "") === c.number) continue;
    const sheets = [...new Set(c.terminals.map(([id]) => sheetOf.get(id)).filter((n): n is number => n !== undefined))].sort((a, b) => a - b);
    changes.push({ kind: "Wire", where: sheets.length ? `sheet ${sheets.join(", ")}` : "", from: old?.number || "–", to: c.number || "–" });
  }
  const rank = { Plant: 0, Tag: 1, Pole: 2, Terminal: 3, Wire: 4 };
  changes.sort((a, b) => rank[a.kind] - rank[b.kind] || a.where.localeCompare(b.where, undefined, { numeric: true }));
  return { changes, result: copy };
}
