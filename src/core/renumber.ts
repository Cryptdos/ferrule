/**
 * Renumbering (DESIGN.md §8). Run on demand, never on every move, so a
 * drawing doesn't change under you while you work. Locked tags and wire
 * numbers are kept.
 *
 * Position scheme (default):
 *  - component tags: prefix + sheet-column of the component, e.g. K10-16;
 *  - terminals: sheet-column, e.g. 10-12 (the strip groups them);
 *  - wire numbers: sheet-column of the conductor's start (its highest
 *    point), e.g. 11-22;
 *  - in each case the highest item in a column keeps the plain address and
 *    the rest, working down, get A, B, C…
 * Sequential scheme: K1, K2… and wires 100, 101…, in sheet, column, height
 * order.
 *
 * Wires on a named rail or busbar take its name (CCT, 0V, L1…). Contacts
 * linked to a coil take its tag and get pole numbers 1, 2, 3… (13/14,
 * 21/22, 33/34…).
 */
import { refreshConductors } from "./conductors";
import { columnOf, type Vec } from "./geometry";
import type { Element, Page, Project } from "./model";
import { assignAddresses, collisionSuffix, type Placed } from "./numbering";
import { requireSymbol, terminalPoint } from "./symbols";
import { tagPrefix } from "./tags";
import { plantTag } from "./ops";
import { isMaster, masterOf, slavesOf } from "./xref";

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

/** Addresses (or sequence numbers) for items grouped by prefix/strip, avoiding `taken` values. */
function assign(
  items: Item[],
  scheme: Project["numbering"]["scheme"],
  first: number,
  taken: Set<string>,
  label: (it: Item, n: string) => string,
): Map<string, string> {
  const out = new Map<string, string>();
  const groups = new Map<string, Item[]>();
  for (const it of items) groups.set(it.group, [...(groups.get(it.group) ?? []), it]);
  for (const group of groups.values()) {
    if (scheme === "sequential") {
      let n = first;
      for (const it of group.sort(order)) {
        let v = label(it, String(n++));
        while (taken.has(v)) v = label(it, String(n++));
        taken.add(v);
        out.set(it.id, v);
      }
    } else {
      const addr = assignAddresses(group.map((it): Placed => ({ id: it.id, page: it.page, column: it.column, y: it.y })));
      for (const it of group.sort(order)) {
        let v = label(it, addr.get(it.id)!);
        // Skip past anything locked (or already given out) that holds this address.
        for (let k = 1; taken.has(v); k++) v = label(it, `${it.page}-${it.column}${collisionSuffix(k)}`);
        taken.add(v);
        out.set(it.id, v);
      }
    }
  }
  return out;
}

export function renumber(project: Project): RenumberResult {
  const scheme = project.numbering.scheme;
  const result: RenumberResult = { tags: 0, terminals: 0, wires: 0, plant: 0 };

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
  for (const [id, tag] of assign(tagItems, scheme, 1, takenTags, (it, n) => it.group + n)) {
    byId.get(id)!.tag = tag;
    result.tags++;
  }
  for (const [id, tag] of assign(termItems, scheme, 1, takenTerms, (it, n) => `${it.group}:${n}`)) {
    byId.get(id)!.tag = tag.slice(tag.indexOf(":") + 1);
    result.terminals++;
  }

  // --- Plant: prefix + where its first view is -------------------------------
  const plantItems: Item[] = [];
  for (const item of project.plant) {
    if (item.locked && item.tag) {
      takenTags.add(item.tag);
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
  for (const [id, address] of assign(plantItems, scheme, 1, new Set(), (_it, n) => n)) {
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
  for (const c of project.conductors) {
    if (c.locked && c.number) {
      takenWires.add(c.number);
      continue;
    }
    // Numbering stops at busbars: each wire leaving one is numbered by where it starts, like any other.
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
  const numbers = assign(condItems, scheme, 100, takenWires, (_it, n) => n);
  for (const c of project.conductors) {
    const n = numbers.get(c.id);
    if (n !== undefined) {
      c.number = n;
      result.wires++;
    }
  }
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
