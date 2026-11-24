/**
 * Renumbering (DESIGN.md §8). Run on demand, never on every move, so a
 * drawing doesn't change under you while you work. Locked tags and wire
 * numbers are kept.
 *
 * Position scheme (default):
 *  - component tags: prefix + sheet-column of the component, e.g. K10-16;
 *  - terminals: sheet-column, e.g. 10-12 (the strip groups them);
 *  - wire numbers: a wire on a terminal takes the terminal's number (the
 *    first along the strip, by sheet then left to right, if it reaches
 *    more than one); any other, the sheet-column of the conductor's start
 *    (its highest point), e.g. 11-22 (v0.3 §2);
 *  - in each case the highest item in a column keeps the plain address and
 *    the rest, working down, get A, B, C…
 * Sequential scheme: K1, K2… and wires 100, 101…, in sheet, column, height
 * order.
 *
 * Wires on a named rail or busbar take its name (CCT, 0V, L1…). Contacts
 * linked to a coil take its tag and get pole numbers 1, 2, 3… (13/14,
 * 21/22, 33/34…).
 */
import { fitBlock } from "./blocks";
import { refreshConductors } from "./conductors";
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

/**
 * Terminal strips by section (v0.4.x T4). Each section with terminals in it
 * takes a strip of its own, X1, X2… in order across the sheets (by sheet,
 * then left to right, then top down); sections with the same name share one,
 * so a section carried on over two sheets is one strip. A terminal below the
 * sections, in the panel boundary's block, is in the nearest one above it.
 * Terminals outside any section are on X1, and when there are some the
 * sections start at X2.
 * A strip set by hand (Properties, or a strip line) to anything but X1 (the
 * default) wins, and its name isn't given to a section; a locked terminal keeps its strip. With strips back to
 * one, the strips given by section are taken off again.
 */
export function stripsBySection(project: Project): void {
  const terms: { el: Element; page: Page }[] = [];
  for (const page of project.pages) {
    if (page.ga) continue;
    for (const el of page.elements) if (el.symbol === "terminal") terms.push({ el, page });
  }
  // X1 is the default, so a terminal on X1 hasn't had its strip set.
  const auto = (el: Element) => el.params.stripAuto === true || String(el.params.strip ?? "X1").trim() === "X1";
  if (project.numbering.strips !== "section") {
    for (const { el } of terms) {
      if (el.params.stripAuto !== true) continue;
      el.params.strip = "X1";
      delete el.params.stripAuto;
    }
    return;
  }
  const handNames = new Set(terms.filter(({ el }) => !auto(el)).map(({ el }) => String(el.params.strip).trim()));
  // Inside a section; or, for a terminal below the sections (in the boundary's
  // terminal block), the nearest section above it, across its width.
  const sectionOf = (el: Element, page: Page) => {
    const [x, y] = el.pos;
    const across = page.sections.filter((s) => x >= s.rect[0] && x <= s.rect[0] + s.rect[2]);
    const inside = across.find((s) => y >= s.rect[1] && y <= s.rect[1] + s.rect[3]);
    if (inside) return inside;
    const above = across.filter((s) => s.rect[1] + s.rect[3] < y).sort((a, b) => b.rect[1] + b.rect[3] - (a.rect[1] + a.rect[3]));
    return above[0];
  };
  // Which section key each terminal Renumber decides for is in.
  const decided = terms.filter(({ el }) => auto(el) && !isLocked(el)).map((t) => {
    const s = sectionOf(t.el, t.page);
    return { ...t, key: s ? s.label.trim() || `\u0000${s.id}` : null };
  });
  const order: { key: string; page: number; x: number; y: number }[] = [];
  for (const page of project.pages)
    for (const s of page.sections) order.push({ key: s.label.trim() || `\u0000${s.id}`, page: page.number, x: s.rect[0], y: s.rect[1] });
  order.sort((a, b) => a.page - b.page || a.x - b.x || a.y - b.y);
  const used = new Set(decided.map((d) => d.key));
  const names = new Map<string, string>();
  let n = decided.some((d) => d.key === null) ? 2 : 1;
  for (const o of order) {
    if (!used.has(o.key) || names.has(o.key)) continue;
    while (handNames.has(`X${n}`)) n++;
    names.set(o.key, `X${n++}`);
  }
  for (const d of decided) {
    const name = d.key === null ? "X1" : names.get(d.key)!;
    if (name === "X1") {
      d.el.params.strip = "X1";
      delete d.el.params.stripAuto;
    } else {
      d.el.params.strip = name;
      d.el.params.stripAuto = true;
    }
  }
}

export function renumber(project: Project): RenumberResult {
  const scheme = project.numbering.scheme;
  const result: RenumberResult = { tags: 0, terminals: 0, wires: 0, plant: 0 };
  stripsBySection(project);

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
  for (const [id, keyed] of assign(plantItems, scheme, 1, new Set(), (it, n) => `${it.group}:${n}`)) {
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
  // A wire on a terminal takes the terminal's number: the two always agree (v0.3 §2).
  const fromTerminal = new Set<string>();
  for (const c of project.conductors) {
    if (c.locked && c.number) continue;
    const t = numberingTerminal(project, c);
    if (!t) continue;
    c.number = t.el.tag;
    takenWires.add(c.number);
    fromTerminal.add(c.id);
    result.wires++;
  }
  for (const c of project.conductors) {
    if ((c.locked && c.number) || fromTerminal.has(c.id)) continue;
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
