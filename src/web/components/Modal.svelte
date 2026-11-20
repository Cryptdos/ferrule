<script lang="ts">
  import type { Snippet } from "svelte";

  let { title, onclose, wide = false, children }: { title: string; onclose: () => void; wide?: boolean; children: Snippet } = $props();
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && onclose()} />

<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="dialog" class:wide role="dialog" aria-label={title}>
    <div class="head">
      <h2>{title}</h2>
      <button class="close" onclick={onclose}>Done</button>
    </div>
    {@render children()}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(20, 24, 30, 0.35);
    display: grid;
    place-items: center;
    z-index: 10;
  }
  .dialog {
    background: #fff;
    border-radius: 6px;
    padding: 14px 20px 18px;
    width: min(720px, 94vw);
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 6px 30px rgba(0, 0, 0, 0.25);
  }
  .dialog.wide {
    width: min(1100px, 96vw);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  h2 {
    margin: 0;
    font-size: 17px;
  }
</style>
