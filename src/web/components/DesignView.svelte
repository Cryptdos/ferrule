<script lang="ts">
  /**
   * The Design workbench (design-v0.4): what the panel has, before and
   * beside what's drawn. Its views share the Needs line along the bottom.
   */
  import type { Editor } from "../editor.svelte";
  import DesignProps from "./DesignProps.svelte";
  import DesignTable from "./DesignTable.svelte";
  import NeedsLine from "./NeedsLine.svelte";

  let { editor }: { editor: Editor } = $props();
</script>

<div class="design">
  <div class="views">
    <div class="main"><DesignTable {editor} /></div>
    <div class="side"><DesignProps {editor} /></div>
  </div>
  <NeedsLine {editor} />
</div>

<style>
  .design {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    height: 100%;
    min-height: 0;
    background: #eef0f3;
  }
  .views {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px;
    gap: 10px;
    padding: 10px;
    min-height: 0;
  }
  .main,
  .side {
    min-height: 0;
    min-width: 0;
  }
</style>
