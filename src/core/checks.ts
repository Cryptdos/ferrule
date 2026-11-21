/**
 * Rule checks (DESIGN.md §6, §7, §10). Each finding names the elements
 * involved so the UI can jump to them.
 */
import { gaCandidates } from "./ga";
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

const NO_TERMINAL_CHECK = new Set(["rail", "busbar", "junction", "plant-view", "isolator", "transformer", "motor", "socket"]);

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

  // With a GA drawn, say what isn't on it yet; and GA devices whose schematic part has gone.
  if (project.pages.some((p) => p.ga)) {
    const left = gaCandidates(project, (el) => el.tag);
    if (left.length) {
      out.push({ level: "info", message: `${left.length} panel device${left.length === 1 ? "" : "s"} not on a GA yet (see the GA workbench)`, ids: [] });
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
