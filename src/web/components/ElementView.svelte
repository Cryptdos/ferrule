<script lang="ts">
  import type { Element, Project } from "../../core/model";
  import { localGeometry } from "../../core/symbols";
  import { displayTag } from "../../core/tags";
  import Prims from "./Prims.svelte";

  let {
    el,
    project,
    dx = 0,
    dy = 0,
  }: { el: Element; project: Project; dx?: number; dy?: number } = $props();

  const geom = $derived(localGeometry(el, displayTag(el, project)));
</script>

<Prims prims={geom.prims} x={el.pos[0] + dx} y={el.pos[1] + dy} />
