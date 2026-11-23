import { STANDARDS } from "./designations";
import type { Element, Project } from "./model";
import { requireSymbol, type GeometryText } from "./symbols";
import { isTimed, masterOf, xrefText } from "./xref";
import { resolveFields } from "./fields";
import { controllerMapEntries, moduleTitle } from "./modules";
import { legendEntries, revisionRows } from "./annotations";

/** Tag prefix for an element under the project's designation standard. */
export function tagPrefix(el: Element, project: Pick<Project, "designation">): string {
  const kind = requireSymbol(el.symbol).kind(el);
  if (!kind) return "";
  // Terminals are numbered by position alone; the strip groups them.
  if (kind === "terminal" && el.symbol === "terminal") return "";
  const override = project.designation.overrides[kind];
  if (override) return override;
  const std = STANDARDS.find((s) => s.id === project.designation.standard) ?? STANDARDS[0]!;
  return std.prefixes[kind];
}

/**
 * The tag as drawn: a contact driven by a coil shows the coil's tag;
 * otherwise the element's own tag, or `prefix?` until it's numbered.
 */
export function displayTag(el: Element, project: Project): string {
  const m = masterOf(project, el);
  if (m) return displayTag(m.el, project);
  if (el.symbol === "plant-view") return project.plant.find((p) => p.id === el.params.plant)?.tag ?? "?";
  if (el.tag) return el.tag;
  const prefix = tagPrefix(el, project);
  if (el.symbol === "terminal") return "?";
  return prefix ? `${prefix}?` : "";
}

/** Everything an element needs to draw its texts. */
export function elementTexts(el: Element, project: Project): GeometryText {
  const m = masterOf(project, el);
  const masterTag = m ? displayTag(m.el, project) : "";
  const t: GeometryText = { tag: displayTag(el, project), xref: xrefText(project, el, masterTag), label: resolveFields(el.label, project) };
  if (isTimed(project, el)) {
    const coil = masterOf(project, el)!.el;
    t.timed = typeof coil.params.mode === "string" ? coil.params.mode : "on";
  }
  // A module view's title row: A3-23 · DI-8 · part of A2-5, AHU-1 outstation (controller.md §5).
  if (el.symbol === "plant-view" && el.params.pmod) t.xref = moduleTitle(project, el);
  if (el.symbol === "callout" && el.params.auto !== false) t.name = String(calloutNumber(project, el));
  if (el.symbol === "ctrlmap") t.modules = controllerMapEntries(project, String(el.params.ctrl ?? ""));
  if (el.symbol === "revtable") t.rows = revisionRows(project);
  else if (el.symbol === "legend") t.legend = legendEntries(project);
  else if (el.symbol === "busbar" || el.symbol === "offpage") {
    // On a distribution: a busbar is named after it, an unlabelled arrow says which it carries.
    const d = typeof el.params.dist === "string" && el.params.dist ? project.distributions.find((x) => x.id === el.params.dist) : undefined;
    if (el.symbol === "busbar") t.name = d?.name ?? String(el.params.name ?? "");
    else {
      // A linked destination says what its source says, unless told not to (70).
      if (el.params.source === false && el.params.sameLabel !== false && el.links[0]) {
        const src = project.pages.flatMap((pg) => pg.elements).find((e) => e.id === el.links[0]);
        if (src?.label) t.label = resolveFields(src.label, project);
      }
      if (d && !t.label) t.label = d.name;
    }
  }
  return t;
}

/**
 * An Auto call-out's number (v0.2.1 note 6): its place among the Auto
 * call-outs on its sheet, in the order they were placed, skipping numbers
 * that call-outs numbered by hand have taken.
 */
export function calloutNumber(project: Project, el: Element): number {
  const page = project.pages.find((p) => p.elements.includes(el)) ?? project.pages.find((p) => p.elements.some((e) => e.id === el.id));
  const all = (page?.elements ?? []).filter((e) => e.symbol === "callout");
  const taken = new Set(all.filter((e) => e.params.auto === false).map((e) => Math.round(Number(e.params.n) || 1)));
  let n = 0;
  for (const e of all.filter((x) => x.params.auto !== false)) {
    do n++;
    while (taken.has(n));
    if (e.id === el.id) return n;
  }
  return 1;
}
