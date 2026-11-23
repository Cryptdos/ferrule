import { STANDARDS } from "./designations";
import type { Element, Project } from "./model";
import { requireSymbol, type GeometryText } from "./symbols";
import { masterOf, xrefText } from "./xref";
import { resolveFields } from "./fields";
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
  if (el.symbol === "revtable") t.rows = revisionRows(project);
  else if (el.symbol === "legend") t.legend = legendEntries(project);
  else if (el.symbol === "busbar" || el.symbol === "offpage") {
    // On a distribution: a busbar is named after it, an unlabelled arrow says which it carries.
    const d = typeof el.params.dist === "string" && el.params.dist ? project.distributions.find((x) => x.id === el.params.dist) : undefined;
    if (el.symbol === "busbar") t.name = d?.name ?? String(el.params.name ?? "");
    else if (d && !t.label) t.label = d.name;
  }
  return t;
}
