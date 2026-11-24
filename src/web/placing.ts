/**
 * Placing a view of plant or a module (design-v0.4 §8): Draft draws what
 * Design lists, so placing always happens in Draft, on a schematic sheet,
 * with the tag, pins and channel labels from the data.
 */
import type { PlantItem } from "../core/model";
import { moduleParam, plantPinsParam } from "../core/ops";
import type { Editor } from "./editor.svelte";

export function startPlacing(editor: Editor, item: PlantItem): boolean {
  if (!item.terminals.length) {
    editor.flash(`${item.tag || "It"} has no pins yet: give it pins first`);
    return false;
  }
  if (editor.mode !== "draft") editor.mode = "draft";
  if (editor.page.ga || editor.page.spare) {
    // The nearest schematic sheet: the first one after this, else before.
    const pages = editor.project.pages;
    const i = editor.pageIndex;
    const next = [...pages.slice(i + 1), ...pages.slice(0, i).reverse()].find((pg) => !pg.ga && !pg.spare);
    if (!next) {
      editor.flash("There's no schematic sheet to place it on: add one first");
      return false;
    }
    editor.setPage(next.id);
  }
  editor.tool = "place";
  editor.placeSymbol = "plant-view";
  editor.placeParams = {
    plant: item.id,
    show: item.terminals.join(","),
    terms: item.terminals.join(","),
    pdesc: item.description,
    pinfo: item.info ?? "",
    ppins: plantPinsParam(item, editor.project),
    pbo: item.powerByOthers === true,
    ...(item.module ? { pmod: moduleParam(item) } : {}),
  };
  editor.flash(`Click on the sheet to place ${item.tag || "it"}${item.module ? ", at the top" : ""}`);
  return true;
}
