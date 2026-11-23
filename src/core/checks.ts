/**
 * Rule checks (DESIGN.md §6, §7, §10). Each finding names the elements
 * involved so the UI can jump to them.
 */
import { changedGaStrips, gaCandidates } from "./ga";
import { compile } from "./sim";
import type { Element, Page, Project } from "./model";
import { terminalNames } from "./symbols";
import { displayTag } from "./tags";
import { isMaster, isSlave, masterOf, partnerOf, slavesOf } from "./xref";

export interface Finding {
  level: "error" | "warning" | "info";
  message: string;
  /** Page the finding is on, when it's about one place. */
  pageId?: string;
  ids: string[];
}

const NO_TERMINAL_CHECK = new Set(["busbar", "junction", "plant-view", "isolator", "transformer", "motor", "socket"]);

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

  for (const item of project.plant) {
    const map = shownOn.get(item.id) ?? new Map<string, string[]>();
    const missing = item.terminals.filter((t) => !map.has(t));
    if (missing.length) {
      out.push({ level: "warning", message: `Plant ${item.tag}: terminal ${missing.join(", ")} not shown on any sheet`, ids: [] });
    }
    for (const [t, pages] of map) {
      if (pages.length > 1) {
        const nums = pages.map((id) => project.pages.find((p) => p.id === id)?.number);
        out.push({ level: "warning", message: `Plant ${item.tag}: terminal ${t} is shown on more than one sheet (${nums.join(", ")})`, ids: [] });
      }
    }
  }

  if (unnumbered) out.push({ level: "info", message: `${unnumbered} items not numbered yet: press Renumber`, ids: [] });
  out.push(...supplyBypasses(project));

  // With a GA drawn, say what isn't on it yet; and GA devices whose schematic part has gone.
  if (project.pages.some((p) => p.ga)) {
    const left = gaCandidates(project, (el) => el.tag);
    if (left.length) {
      out.push({ level: "info", message: `${left.length} panel device${left.length === 1 ? "" : "s"} not on a GA yet (see the GA workbench)`, ids: [] });
    }
    // A placed strip whose terminals changed since its GA was last open (note 45).
    for (const c of changedGaStrips(project)) {
      const what = [c.added ? `${c.added} terminal${c.added === 1 ? "" : "s"} added` : "", c.removed ? `${c.removed} removed` : ""].filter(Boolean).join(", ");
      out.push({ level: "info", message: `Sheet ${c.page.number}: terminal strip ${c.it.strip} has changed (${what}); open the GA to check its length`, pageId: c.page.id, ids: [c.it.id] });
    }
    const all = new Set(project.pages.flatMap((p) => p.elements.map((e) => e.id)));
    for (const page of project.pages) {
      for (const it of page.gaItems ?? []) {
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
            b.symbol === "busbar" &&
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
