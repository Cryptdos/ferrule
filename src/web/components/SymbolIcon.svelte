<script lang="ts">
  import { localGeometry, defaultParams } from "../../core/symbols";
  import type { Element } from "../../core/model";
  import Prims from "./Prims.svelte";

  let { symbol }: { symbol: string } = $props();

  const geom = $derived.by(() => {
    const params = defaultParams(symbol);
    if (symbol === "rail" || symbol === "busbar") params.length = 8;
    if (symbol === "rail") params.name = "";
    const el: Element = { id: "icon", symbol, tag: "", label: "", pos: [0, 0], rot: 0, zone: "internal", params, links: [] };
    const g = localGeometry(el, "");
    return { prims: g.prims.filter((p) => p.t !== "text"), bbox: g.bbox };
  });
  const pad = 0.8;
  const size = $derived(Math.max(geom.bbox.w, geom.bbox.h) + 2 * pad);
  const cx = $derived(geom.bbox.x + geom.bbox.w / 2);
  const cy = $derived(geom.bbox.y + geom.bbox.h / 2);
</script>

<svg viewBox="{cx - size / 2} {cy - size / 2} {size} {size}" width="30" height="30" aria-hidden="true">
  <Prims prims={geom.prims} />
</svg>
