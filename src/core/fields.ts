/**
 * Fields in labels (DESIGN.md §8): `{plant:p1.tag}` or `{plant:SF-01.description}`
 * fill in from the plant list, so section titles, motor labels and door
 * labels always match the plant tag. The plant can be named by id (what the
 * UI inserts; survives renaming) or by tag.
 */
import type { Project } from "./model";

const FIELD = /\{plant:([^.}]+)\.(tag|description)\}/g;
/** Project fields for cover sheets and labels: {project:title}, {project:drawingNo}… plus {sheets} and {rev}. */
const PROJECT_FIELD = /\{project:([A-Za-z]+)\}/g;

export function resolveFields(text: string, project: Pick<Project, "plant"> & Partial<Pick<Project, "project" | "pages" | "revisions">>): string {
  if (!text.includes("{")) return text;
  let out = text.replace(FIELD, (whole, ref: string, field: "tag" | "description") => {
    const p = project.plant.find((x) => x.id === ref) ?? project.plant.find((x) => x.tag === ref);
    // A plant not yet numbered shows its prefix and "?", like any other part.
    return p ? (field === "tag" ? p.tag || `${p.prefix || "U"}?` : p[field]) : whole;
  });
  if (project.project) {
    const info = project.project as unknown as Record<string, string>;
    out = out.replace(PROJECT_FIELD, (whole, key: string) => (typeof info[key] === "string" ? info[key]! : whole));
  }
  if (project.pages) out = out.replace(/\{sheets\}/g, String(project.pages.length));
  if (project.revisions) out = out.replace(/\{rev\}/g, project.revisions[project.revisions.length - 1]?.rev ?? "");
  return out;
}

/** Plant ids a text refers to (used when stamping templates). */
export function fieldPlantRefs(text: string): string[] {
  return [...text.matchAll(FIELD)].map((m) => m[1]!);
}

/** Swap plant references in a text, e.g. when stamping a template for another fan. */
export function remapFields(text: string, map: Map<string, string>): string {
  return text.replace(FIELD, (whole, ref: string, field: string) => (map.has(ref) ? `{plant:${map.get(ref)}.${field}}` : whole));
}
