<script lang="ts">
  import type { Element, Project } from "../../core/model";
  import { localGeometry } from "../../core/symbols";
  import { elementTexts } from "../../core/tags";
  import { contactTable, contactTableAt, contactTablePrims, isMaster } from "../../core/xref";
  import Prims from "./Prims.svelte";

  let {
    el,
    project,
    dx = 0,
    dy = 0,
  }: { el: Element; project: Project; dx?: number; dy?: number } = $props();

  const geom = $derived(localGeometry(el, elementTexts(el, project)));
  const table = $derived.by(() => {
    if (!isMaster(el)) return [];
    const rows = contactTable(project, el);
    return contactTablePrims(rows, contactTableAt(el, geom.body, rows.length));
  });
</script>

<Prims prims={table.length ? [...geom.prims, ...table] : geom.prims} x={el.pos[0] + dx} y={el.pos[1] + dy} />
