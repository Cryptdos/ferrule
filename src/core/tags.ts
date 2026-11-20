import { STANDARDS } from "./designations";
import type { Element, Project } from "./model";
import { requireSymbol } from "./symbols";

/** Tag prefix for an element under the project's designation standard. */
export function tagPrefix(el: Element, project: Pick<Project, "designation">): string {
  const kind = requireSymbol(el.symbol).kind(el);
  if (!kind) return "";
  const override = project.designation.overrides[kind];
  if (override) return override;
  const std = STANDARDS.find((s) => s.id === project.designation.standard) ?? STANDARDS[0]!;
  return std.prefixes[kind];
}

/** The tag as drawn: the element's own tag, or `prefix?` until it's numbered. */
export function displayTag(el: Element, project: Pick<Project, "designation">): string {
  if (el.tag) return el.tag;
  const prefix = tagPrefix(el, project);
  return prefix ? `${prefix}?` : "";
}
