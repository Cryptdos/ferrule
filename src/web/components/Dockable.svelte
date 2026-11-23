<script lang="ts">
  /**
   * Tells the window inside it (Modal) which window it is and, when it's in
   * a tile, which tile: docked, it fills the tile instead of floating
   * (design-v0.3 §7).
   */
  import { setContext, type Snippet } from "svelte";

  let { name, tile, children }: { name: string; tile?: string; children: Snippet } = $props();
  setContext("ferrule.window", {
    get name() {
      return name;
    },
    get tile() {
      return tile;
    },
  });
</script>

{@render children()}
