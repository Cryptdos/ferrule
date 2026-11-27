<script lang="ts">
  import { localGeometry, defaultParams, type Prim } from "../../core/symbols";
  import type { Element, ParamValue } from "../../core/model";
  import type { Vec } from "../../core/geometry";
  import Prims from "./Prims.svelte";

  let { symbol, size: px = 30 }: { symbol: string; size?: number } = $props();

  /** Parts drawn long or large are shown small, so their lines show at icon size. */
  const SMALL: Record<string, Record<string, ParamValue>> = {
    busbar: { length: 8 },
    rail: { length: 8 },
    "strip-line": { length: 7 },
    box: { w: 7, h: 5 },
  };
  const line = (...pts: Vec[]): Prim => ({ t: "line", pts });
  /** Parts that are only text, drawn as a picture of what they are (12). */
  const DRAWN: Record<string, Prim[]> = {
    // A T over two lines of text.
    text: [line([-2.5, -2.5], [0.5, -2.5]), line([-1, -2.5], [-1, 0.5]), line([1.5, -0.5], [3, -0.5]), line([-2.5, 1.8], [3, 1.8])],
    // A small table: a symbol column and a name column, three rows.
    legend: [
      { t: "poly", pts: [[-3, -2.5], [3, -2.5], [3, 2.5], [-3, 2.5]], fill: false },
      line([-1, -2.5], [-1, 2.5]),
      line([-3, -0.8], [3, -0.8]),
      line([-3, 0.8], [3, 0.8]),
      { t: "circle", c: [-2, -1.65], r: 0.45 },
      line([-2.4, 0], [-1.6, 0]),
      line([-2, 1.2], [-2, 2.1]),
      line([0, -1.65], [2.2, -1.65]),
      line([0, 0], [1.6, 0]),
      line([0, 1.65], [2, 1.65]),
    ],
    // A box with a trunk and devices hanging off it (a network diagram).
    netmap: [
      { t: "poly", pts: [[-1.2, -2.4], [1.2, -2.4], [1.2, -1.2], [-1.2, -1.2]], fill: false },
      line([0, -1.2], [0, -0.4], [-2.6, -0.4], [-2.6, 2.2]),
      { t: "poly", pts: [[-2, 0.2], [-0.6, 0.2], [-0.6, 1], [-2, 1]], fill: false },
      { t: "poly", pts: [[-2, 1.6], [-0.6, 1.6], [-0.6, 2.4], [-2, 2.4]], fill: false },
      { t: "poly", pts: [[0.2, 0.2], [1.6, 0.2], [1.6, 1], [0.2, 1]], fill: false },
      line([-0.6, 0.6], [0.2, 0.6]),
    ],
    // A ruled list with a heading row: a bill of materials.
    bomtable: [
      { t: "poly", pts: [[-3, -2.5], [3, -2.5], [3, 2.5], [-3, 2.5]], fill: false },
      line([-3, -1.3], [3, -1.3]),
      line([-3, 0], [3, 0]),
      line([-3, 1.25], [3, 1.25]),
      line([-1.6, -2.5], [-1.6, 2.5]),
      line([1.8, -2.5], [1.8, 2.5]),
    ],
    // Module boxes side by side, each with its circled address; the last dashed (a spare slot).
    ctrlmap: [
      { t: "poly", pts: [[-3, -2], [-1, -2], [-1, 2], [-3, 2]], fill: false },
      { t: "poly", pts: [[-1, -2], [1, -2], [1, 2], [-1, 2]], fill: false },
      { t: "line", pts: [[1, -2], [3, -2], [3, 2], [1, 2]], dash: true },
      { t: "circle", c: [-1.6, -1.2], r: 0.4 },
      { t: "circle", c: [0.4, -1.2], r: 0.4 },
      line([-2.6, 0.3], [-1.6, 0.3]),
      line([-0.6, 0.3], [0.4, 0.3]),
    ],
  };

  const geom = $derived.by(() => {
    const drawn = DRAWN[symbol];
    if (drawn) return { prims: drawn, bbox: { x: -3, y: -2.5, w: 6, h: 5 } };
    const params = { ...defaultParams(symbol), ...(SMALL[symbol] ?? {}) };
    const el: Element = { id: "icon", symbol, tag: "", label: "", pos: [0, 0], rot: 0, zone: "internal", params, links: [] };
    const g = localGeometry(el, "");
    return { prims: g.prims.filter((p) => p.t !== "text"), bbox: g.bbox };
  });
  const pad = 0.8;
  const size = $derived(Math.max(geom.bbox.w, geom.bbox.h) + 2 * pad);
  const cx = $derived(geom.bbox.x + geom.bbox.w / 2);
  const cy = $derived(geom.bbox.y + geom.bbox.h / 2);
</script>

<svg viewBox="{cx - size / 2} {cy - size / 2} {size} {size}" width={px} height={px} aria-hidden="true">
  <Prims prims={geom.prims} />
</svg>
