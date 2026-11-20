/**
 * Fields in labels (DESIGN.md §8): `{plant:p1.tag}` or `{plant:SF-01.description}`
 * fill in from the plant list, so section titles, motor labels and door
 * labels always match the plant tag. The plant can be named by id (what the
 * UI inserts; survives renaming) or by tag.
 */
import type { Project } from "./model";

const FIELD = /\{plant:([^.}]+)\.(tag|description)\}/g;

export function resolveFields(text: string, project: Pick<Project, "plant">): string {
  if (!text.includes("{")) return text;
  return text.replace(FIELD, (whole, ref: string, field: "tag" | "description") => {
    const p = project.plant.find((x) => x.id === ref) ?? project.plant.find((x) => x.tag === ref);
    return p ? p[field] : whole;
  });
}

/** Plant ids a text refers to (used when stamping templates). */
export function fieldPlantRefs(text: string): string[] {
  return [...text.matchAll(FIELD)].map((m) => m[1]!);
}

/** Swap plant references in a text, e.g. when stamping a template for another fan. */
export function remapFields(text: string, map: Map<string, string>): string {
  return text.replace(FIELD, (whole, ref: string, field: string) => (map.has(ref) ? `{plant:${map.get(ref)}.${field}}` : whole));
}
