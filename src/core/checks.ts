/**
 * Rule checks (DESIGN.md §6, §7, §10). Each finding names the elements
 * involved so the UI can jump to them.
 */
import { allDetails, allFrames, changedGaStrips, detailOf, doorOwner, frameOf, gaCandidates, railFill, railNumber } from "./ga";
import { compile, pinNode } from "./sim";
import { controllerName, modulesOf, moduleTypeName, slotAddress, viewsOf } from "./modules";
import { contactPins, isAnalogueForm, isInputForm, missingRefs, describeExpectation, things } from "./points";
import type { Element, Page, Project } from "./model";
import { benchOf, isBar, terminalNames } from "./symbols";
import { numberingTerminal } from "./renumber";
import { displayTag } from "./tags";
import { isMaster, isSlave, masterOf, partnerOf, slavesOf } from "./xref";
import { drawnOn, fieldPlant, needsChannel } from "./design";
import { Nets, wiringOf } from "./wiring";

export interface Finding {
  level: "error" | "warning" | "info";
  message: string;
  /** Page the finding is on, when it's about one place. */
  pageId?: string;
  ids: string[];
  /** A row in Design's table it's about (design-v0.4 §5): Show goes there. */
  design?: { plant: string; point?: string };
  /** A point whose wiring to its channel is to review: it can be confirmed by hand. */
  confirm?: { plant: string; point: string };
}

const NO_TERMINAL_CHECK = new Set(["busbar", "rail", "junction", "plant-view", "isolator", "transformer", "motor", "socket"]);

function wiredTerminals(page: Page): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const s of page.segments) {
    for (const [id, t] of [s.from, s.to]) {
      if (!out.has(id)) out.set(id, new Set());
      out.get(id)!.add(t);
    }
  }
  return out;
}

export function checkProject(project: Project): Finding[] {
  const out: Finding[] = [];
  const tagOwners = new Map<string, { el: Element; page: Page }[]>();
  let unnumbered = 0;
  const shownOn = new Map<string, Map<string, string[]>>(); // plant id → terminal → page ids

  for (const page of project.pages) {
    const byId = new Map(page.elements.map((e) => [e.id, e]));
    const wired = wiredTerminals(page);

    // Boundary crossings must land on a terminal.
    if (page.boundaryY !== null) {
      for (const s of page.segments) {
        const a = byId.get(s.from[0]);
        const b = byId.get(s.to[0]);
        if (!a || !b || a.zone === b.zone) continue;
        if (a.symbol === "terminal" || b.symbol === "terminal") continue;
        out.push({
          level: "error",
          message: `Sheet ${page.number}: a wire from ${displayTag(a, project) || a.symbol} to ${displayTag(b, project) || b.symbol} crosses the panel boundary without a terminal`,
          pageId: page.id,
          ids: [s.id],
        });
      }
    }

    for (const el of page.elements) {
      const tag = displayTag(el, project);
      if (tag.endsWith("?")) unnumbered++;
      else if (tag && !masterOf(project, el) && el.symbol !== "plant-view") {
        const key = el.symbol === "terminal" ? `${el.params.strip ?? "X1"}:${tag}` : tag;
        tagOwners.set(key, [...(tagOwners.get(key) ?? []), { el, page }]);
      }

      if (isSlave(el) && el.symbol !== "isolator" && !masterOf(project, el)) {
        out.push({ level: "warning", message: `Sheet ${page.number}: contact ${tag} isn't driven by a coil`, pageId: page.id, ids: [el.id] });
      }
      if (isMaster(el) && slavesOf(project, el).length === 0) {
        out.push({ level: "warning", message: `Sheet ${page.number}: coil ${tag} has no contacts`, pageId: page.id, ids: [el.id] });
      }
      if (el.symbol === "offpage" && !partnerOf(project, el)) {
        out.push({ level: "warning", message: `Sheet ${page.number}: off-page arrow isn't paired with another`, pageId: page.id, ids: [el.id] });
      }
      if (el.symbol === "offpage") {
        const other = partnerOf(project, el);
        const src = (e: typeof el) => e.params.source !== false;
        // Report each mismatched pair once, from the first-numbered end.
        if (other && src(el) === src(other.el) && el.id < other.el.id) {
          out.push({
            level: "warning",
            message: `Sheet ${page.number}: linked arrows are both ${src(el) ? "sources" : "destinations"}; one should be the source`,
            pageId: page.id,
            ids: [el.id],
          });
        }
      }

      const names = terminalNames(el);
      if (!NO_TERMINAL_CHECK.has(el.symbol) && names.length) {
        const w = wired.get(el.id) ?? new Set<string>();
        if (w.size === 0) {
          out.push({ level: "warning", message: `Sheet ${page.number}: ${tag || el.symbol} isn't connected`, pageId: page.id, ids: [el.id] });
        } else if (el.symbol !== "contact-co" && el.symbol !== "terminal" && names.some((n) => !w.has(n))) {
          // (A terminal wired on one side only is normal: the other side is a cable by others.)
          const open = names.filter((n) => !w.has(n));
          out.push({
            level: "warning",
            message: `Sheet ${page.number}: ${tag || el.symbol} terminal ${open.join(", ")} not connected`,
            pageId: page.id,
            ids: [el.id],
          });
        }
      }

      if (el.symbol === "plant-view" && typeof el.params.plant === "string") {
        const map = shownOn.get(el.params.plant) ?? new Map<string, string[]>();
        for (const t of String(el.params.show ?? "").split(",").filter(Boolean)) {
          map.set(t, [...(map.get(t) ?? []), page.id]);
        }
        shownOn.set(el.params.plant, map);
      }
    }
  }

  for (const [tag, owners] of tagOwners) {
    if (owners.length > 1) {
      out.push({
        level: "error",
        message: `Tag ${tag} is used ${owners.length} times (sheets ${owners.map((o) => o.page.number).join(", ")})`,
        ids: owners.map((o) => o.el.id),
      });
    }
  }

  const design = usesDesign(project);
  for (const item of project.plant) {
    const map = shownOn.get(item.id) ?? new Map<string, string[]>();
    const missing = item.terminals.filter((t) => !map.has(t));
    // Not drawn at all is said once, elsewhere: a module by controllerChecks, plant by Design's checks.
    const undrawn = !map.size && (!!item.module || design);
    if (missing.length && !undrawn) {
      const what = item.module ? "Module" : "Plant";
      out.push({ level: "warning", message: `${what} ${item.tag || `${item.prefix || (item.module ? "A" : "U")}?`}: terminal ${missing.join(", ")} not shown on any sheet`, ids: [] });
    }
    for (const [t, pages] of map) {
      if (pages.length > 1) {
        const nums = pages.map((id) => project.pages.find((p) => p.id === id)?.number);
        out.push({ level: "warning", message: `${item.module ? "Module" : "Plant"} ${item.tag || `${item.prefix || "U"}?`}: terminal ${t} is shown on more than one sheet (${nums.join(", ")})`, ids: [] });
      }
    }
  }

  if (unnumbered) out.push({ level: "info", message: `${unnumbered} items not numbered yet: press Renumber`, ids: [] });
  out.push(...terminalNumberChecks(project));
  // Detail sheets (design-v0.3 §6): a detail is shown in a frame; a frame shows a detail that's still there.
  for (const d of allDetails(project))
    if (!frameOf(project, d.it.id)) out.push({ level: "warning", message: `Sheet ${d.page.number}: detail ${d.it.letter ?? "?"} isn't shown on a detail sheet (Place detail…)`, pageId: d.page.id, ids: [d.it.id] });
  for (const f of allFrames(project))
    if (!detailOf(project, f.it)) out.push({ level: "warning", message: `Sheet ${f.page.number}: a frame shows a detail that has been deleted`, pageId: f.page.id, ids: [f.it.id] });
  out.push(...supplyBypasses(project));
  out.push(...pointChecks(project));
  out.push(...controllerChecks(project));
  out.push(...designChecks(project));

  // With a GA drawn, say what isn't on it yet; and GA devices whose schematic part has gone.
  if (project.pages.some((p) => p.ga)) {
    const left = gaCandidates(project, (el) => el.tag);
    if (left.length) {
      out.push({ level: "info", message: `${left.length} panel device${left.length === 1 ? "" : "s"} not on a GA yet (see the Layout workbench)`, ids: [] });
    }
    // A placed strip whose terminals changed since its GA was last open (note 45).
    for (const c of changedGaStrips(project)) {
      const what = [c.added ? `${c.added} terminal${c.added === 1 ? "" : "s"} added` : "", c.removed ? `${c.removed} removed` : ""].filter(Boolean).join(", ");
      out.push({ level: "info", message: `Sheet ${c.page.number}: terminal strip ${c.it.strip} has changed (${what}); open the GA to check its length`, pageId: c.page.id, ids: [c.it.id] });
    }
    // How full each DIN rail is (design-v0.2 §8), and devices that clash on it.
    for (const page of project.pages) {
      for (const f of railFill(page)) {
        const n = railNumber(page, f.rail);
        const pc = f.length > 0 ? Math.round((f.used / f.length) * 100) : 0;
        out.push({ level: "info", message: `Sheet ${page.number}, rail ${n}: ${f.used} of ${f.length} mm used (${pc}%), ${f.devices.length} device${f.devices.length === 1 ? "" : "s"}`, pageId: page.id, ids: [f.rail.id] });
        for (const [a, b] of f.overlaps) {
          out.push({ level: "warning", message: `Sheet ${page.number}, rail ${n}: two devices overlap`, pageId: page.id, ids: [a.id, b.id] });
        }
        for (const d of f.overhang) {
          out.push({ level: "warning", message: `Sheet ${page.number}, rail ${n}: a device runs off the end of the rail`, pageId: page.id, ids: [d.id] });
        }
      }
      if (page.ga?.view === "door-back" && !doorOwner(project, page)) {
        out.push({ level: "warning", message: `Sheet ${page.number} is a door back with no door front: pick its door in Sheet settings`, pageId: page.id, ids: [] });
      }
    }
    const all = new Set(project.pages.flatMap((p) => p.elements.map((e) => e.id)));
    for (const page of project.pages) {
      for (const it of page.gaItems ?? []) {
        if (it.module && !project.plant.some((x) => x.id === it.module)) {
          out.push({ level: "warning", message: `Sheet ${page.number}: a controller module on the GA has been deleted`, pageId: page.id, ids: [it.id] });
        }
        if (it.refs?.length && !it.refs.some((r) => all.has(r))) {
          out.push({ level: "warning", message: `Sheet ${page.number}: a device on the GA is no longer on the schematic`, pageId: page.id, ids: [it.id] });
        }
      }
    }
  }

  const rank = { error: 0, warning: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}

/**
 * Field IO checks (controller.md §10): expectations that name something
 * missing; dry inputs wired to a live conductor; inputs wired to nothing;
 * outputs wired to nothing (spare); analogue points wired to digital ones.
 */
export function pointChecks(project: Project): Finding[] {
  const out: Finding[] = [];
  const list = things(project);
  for (const e of project.expectations) {
    if (missingRefs(project, e, list).length) {
      out.push({ level: "error", message: `Expectation "${describeExpectation(project, e, list)}" names something that isn't on the drawing`, ids: [] });
    }
  }
  if (!project.plant.some((it) => it.points?.length)) return out;
  const c = compile(project);
  // Everything joined by wire, regardless of switches: conductors, busbars, distributions, views to their device.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };
  for (const l of c.links) {
    if (!l.fixed) continue;
    const a = find(l.a);
    const b = find(l.b);
    if (a !== b) parent.set(a, b);
  }
  const wired = new Set(project.conductors.filter((cd) => cd.terminals.length > 1).map((cd) => cd.id));
  const pinWired = (plant: string, pin: string) =>
    project.pages.some((pg) =>
      pg.elements.some(
        (el) =>
          el.symbol === "plant-view" &&
          el.params.plant === plant &&
          project.conductors.some((cd) => wired.has(cd.id) && cd.terminals.some(([id, t]) => id === el.id && t === pin)),
      ),
    );
  const viewIds = (plant: string) => project.pages.flatMap((pg) => pg.elements.filter((e) => e.symbol === "plant-view" && e.params.plant === plant).map((e) => e.id));
  // Live: every source's phase, through plain joins.
  const live = new Set(c.supplies.flatMap((s) => s.phases.map(find)));
  // Analogue against digital: which roots have an analogue pin, which a digital one.
  const kinds = new Map<string, Set<"a" | "d">>();
  for (const item of project.plant) {
    const tag = item.tag || `${item.prefix || "U"}?`;
    const lead = item.module ? `Module ${tag}` : `Plant ${tag}`;
    for (const pt of item.points ?? []) {
      // A point with no pins yet (Design) isn't drawn: there's nothing to wire.
      if (!pt.pins.length) continue;
      // A shared common (wired for its neighbour) doesn't make a point wired: its own pins do.
      const own = pt.pins.filter((t) => !(item.points ?? []).some((q) => q !== pt && q.pins.includes(t)));
      const any = (own.length ? own : pt.pins).some((t) => pinWired(item.id, t));
      const fed = pt.form === "supply-out" && Object.values(pt.dists ?? {}).some(Boolean);
      if (!any && !fed) {
        if (isInputForm(pt.form) && pt.form !== "supply-in") {
          out.push({ level: "warning", message: `${lead}: input ${pt.name} isn't wired to anything`, ids: viewIds(item.id) });
        } else if (pt.form === "contact" || pt.form === "powered-out") {
          out.push({ level: "info", message: `${lead}: output ${pt.name} isn't wired to anything (spare)`, ids: viewIds(item.id) });
        }
      }
      if (pt.form === "dry-in" && pt.pins.some((t) => pinWired(item.id, t) && live.has(find(pinNode(item.id, t))))) {
        out.push({ level: "error", message: `${lead}: dry input ${pt.name} is wired to a live conductor (a voltage onto a volt-free input)`, ids: viewIds(item.id) });
      }
      // Signal pins only: commons are often shared (an analogue 0 V with a DI common) and that's fine.
      if (pt.form === "comms" || pt.form === "supply-in" || pt.form === "supply-out") continue;
      const signals = pt.form === "contact" ? [contactPins(pt, item.pins).no, contactPins(pt, item.pins).nc].filter((x): x is string => !!x) : pt.pins.slice(0, 1);
      for (const t of signals) {
        if (!pinWired(item.id, t)) continue;
        const r = find(pinNode(item.id, t));
        const set = kinds.get(r) ?? new Set();
        set.add(isAnalogueForm(pt.form) ? "a" : "d");
        kinds.set(r, set);
      }
    }
  }
  const mixed = [...kinds.values()].filter((k) => k.size > 1).length;
  if (mixed) {
    out.push({ level: "warning", message: `${mixed} conductor${mixed === 1 ? " joins" : "s join"} an analogue point to a digital one`, ids: [] });
  }
  return out;
}

/**
 * An incoming supply terminal set to feed a distribution that its own wiring
 * also reaches (through an isolator, say). Everything on a distribution is
 * one net, so the wiring in between is bypassed: opening the isolator would
 * leave the busbars live. The supply's distribution should be left empty.
 */
export function supplyBypasses(project: Project): Finding[] {
  const out: Finding[] = [];
  const supplies = project.pages.flatMap((pg) =>
    pg.elements.filter((e) => e.symbol === "supply").map((el) => ({ el, page: pg })),
  );
  if (!supplies.some(({ el }) => Object.keys(el.params).some((k) => k.startsWith("dist_") && el.params[k]))) return out;
  const c = compile(project);
  const node = new Map<string, string>();
  for (const cd of project.conductors) for (const [id, t] of cd.terminals) node.set(`${id}:${t}`, cd.id);
  for (const { el, page } of supplies) {
    for (const [k, v] of Object.entries(el.params)) {
      if (!k.startsWith("dist_") || typeof v !== "string" || !v) continue;
      const term = k.slice(5);
      const d = project.distributions.find((x) => x.id === v);
      if (!d) continue;
      // Join everything the wiring joins, whatever the switches' state, but not this supply's own distribution joins.
      const parent = new Map<string, string>();
      const find = (x: string): string => {
        let r = x;
        while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!;
        return r;
      };
      const union = (a: string, b: string) => {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) parent.set(ra, rb);
      };
      for (const l of c.links) if (l.el !== el.id) union(l.a, l.b);
      const from = find(node.get(`${el.id}:${term}`) ?? `${el.id}:${term}`);
      const reached = project.pages.some((pg) =>
        pg.elements.some(
          (b) =>
            isBar(b) &&
            b.params.dist === v &&
            project.conductors.some((cd) => cd.terminals.some(([id]) => id === b.id) && find(cd.id) === from),
        ),
      );
      if (reached) {
        out.push({
          level: "warning",
          message: `Sheet ${page.number}: the supply's ${term} feeds ${d.name} directly, and its wiring reaches ${d.name} too, so the parts in between (an isolator, say) are bypassed. Leave the supply's distribution for ${term} empty`,
          pageId: page.id,
          ids: [el.id],
        });
      }
    }
  }
  return out;
}

/**
 * Controller checks (controller.md §10, with the field IO checks above for
 * their points): two slots at one bus address, modules not drawn or with no
 * pins, a controller with nothing on its rail.
 */
export function controllerChecks(project: Project): Finding[] {
  const out: Finding[] = [];
  for (const c of project.controllers ?? []) {
    const name = controllerName(project, c);
    if (!c.slots.length) {
      out.push({ level: "info", message: `Controller ${name} has no modules yet`, ids: [] });
      continue;
    }
    const at = new Map<number, number[]>();
    c.slots.forEach((_, i) => {
      const a = slotAddress(project, c, i);
      at.set(a, [...(at.get(a) ?? []), i + 1]);
    });
    for (const [a, slots] of at) {
      if (slots.length > 1) out.push({ level: "error", message: `Controller ${name}: slots ${slots.join(" and ")} are both at bus address ${a}`, ids: [] });
    }
    for (const m of modulesOf(project, c)) {
      const views = viewsOf(project, m.id);
      const tag = m.tag || `${m.prefix || "A"}?`;
      if (!views.length) out.push({ level: "warning", message: `Module ${tag} (${moduleTypeName(m.module)}) of ${name} isn't drawn on any sheet`, ids: [] });
      if (!m.terminals.length) out.push({ level: "warning", message: `Module ${tag} (${moduleTypeName(m.module)}) has no pins: Generate… or Pins and points…`, ids: views.map((v) => v.el.id) });
    }
  }
  return out;
}

/**
 * Wires and terminals agree (v0.3 §2): a locked wire number that isn't its
 * terminal's, and one number on two wires (terminals of different strips in
 * the same place).
 */
export function terminalNumberChecks(project: Project): Finding[] {
  const out: Finding[] = [];
  const seen = new Map<string, string[]>();
  for (const c of project.conductors) {
    const t = numberingTerminal(project, c);
    if (!t) continue;
    const name = `${t.el.params.strip ?? "X1"}:${t.el.tag}`;
    if (c.locked && c.number && c.number !== t.el.tag) {
      out.push({
        level: "warning",
        message: `Sheet ${t.page.number}: wire ${c.number} is locked but lands on terminal ${name}; a wire on a terminal is numbered by it`,
        pageId: t.page.id,
        ids: [t.el.id],
      });
    }
    if (c.number) seen.set(c.number, [...(seen.get(c.number) ?? []), name]);
  }
  for (const [n, names] of seen)
    if (names.length > 1) out.push({ level: "warning", message: `Wire number ${n} is on ${names.length} wires (terminals ${names.join(", ")}): move one of the terminals`, ids: [] });
  return out;
}

/** A project worked on in Design: it has systems, a controller, or plant with Design's fields. */
export function usesDesign(project: Project): boolean {
  if (project.systems?.length || project.controllers?.length || project.networks?.length) return true;
  return project.plant.some((p) => p.system || p.connects || p.source || p.enabledBy || (p.points ?? []).some((q) => q.signal || q.goesTo || q.channel));
}

/** Parts that are wiring or drawing furniture, not equipment: never "field plant not in the table". */
const NOT_EQUIPMENT = new Set(["terminal", "plant-view", "junction", "offpage", "busbar", "rail", "isolator", "supply"]);

/**
 * Design's checks (design-v0.4 §5): a point that should have a channel and
 * hasn't; plant in the table not drawn, and equipment drawn in the field
 * that isn't plant in the table; and every allocated point's wiring to its
 * channel (direct, via one relay, confirmed, or to review). Modules not
 * drawn are in controllerChecks.
 */
export function designChecks(project: Project, oneHop = true): Finding[] {
  const out: Finding[] = [];
  if (!usesDesign(project)) return out;
  const hasController = !!project.controllers?.length;
  const nets = new Nets(project);
  const tagOf = (p: { tag: string; prefix?: string }) => p.tag || `${p.prefix || "U"}?`;
  for (const plant of fieldPlant(project)) {
    if (!drawnOn(project, plant.id).length) {
      out.push({ level: "info", message: `${tagOf(plant)} ${plant.description}: in Design, not drawn yet (To draw)`.replace("  ", " "), ids: [], design: { plant: plant.id } });
    }
    for (const point of plant.points ?? []) {
      if (!needsChannel(point)) continue;
      if (!point.channel) {
        if (hasController) out.push({ level: "warning", message: `${tagOf(plant)} ${point.name} goes to a channel and has none`, ids: [], design: { plant: plant.id, point: point.name } });
        continue;
      }
      const w = wiringOf(project, plant, point, nets, oneHop);
      const on = `${tagOf(project.plant.find((p) => p.id === point.channel!.module) ?? { tag: "", prefix: "A" })} ${point.channel.point}`;
      if (w.kind === "review") {
        out.push({
          level: "warning",
          message: `${tagOf(plant)} ${point.name} isn't wired straight to its channel ${on}: check the drawing, then confirm by hand`,
          ids: viewsOf(project, plant.id).map((v) => v.el.id),
          design: { plant: plant.id, point: point.name },
          confirm: { plant: plant.id, point: point.name },
        });
      }
    }
  }
  // Equipment drawn below the panel boundary is field plant: it should be in the table (principle 1).
  for (const pg of project.pages) {
    if (pg.ga || pg.spare) continue;
    for (const el of pg.elements) {
      if (el.zone !== "external" || NOT_EQUIPMENT.has(el.symbol) || benchOf(el) !== "draft") continue;
      out.push({ level: "info", message: `Sheet ${pg.number}: ${displayTag(el, project) || el.symbol} is drawn in the field but isn't plant in Design's table`, pageId: pg.id, ids: [el.id] });
    }
  }
  return out;
}
