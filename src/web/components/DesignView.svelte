<script lang="ts">
  /**
   * The Design workbench (design-v0.4): what the panel has, before and
   * beside what's drawn. Its views share the Needs line along the bottom.
   */
  import type { Editor } from "../editor.svelte";
  import DesignProps from "./DesignProps.svelte";
  import DesignTable from "./DesignTable.svelte";
  import NeedsLine from "./NeedsLine.svelte";
  import ControllerView from "./ControllerView.svelte";
  import ToDrawView from "./ToDrawView.svelte";
  import NetworkView from "./NetworkView.svelte";

  let { editor }: { editor: Editor } = $props();
</script>

<div class="design">
  {#if editor.designView === "controller"}
    <div class="views one"><ControllerView {editor} /></div>
  {:else if editor.designView === "network"}
    <div class="views one"><NetworkView {editor} /></div>
  {:else if editor.designView === "todraw"}
    <div class="views one"><ToDrawView {editor} /></div>
  {:else}
    <div class="views">
      <div class="main"><DesignTable {editor} /></div>
      <div class="side"><DesignProps {editor} /></div>
    </div>
  {/if}
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
  .views.one {
    grid-template-columns: minmax(0, 1fr);
  }
  .main,
  .side {
    min-height: 0;
    min-width: 0;
  }
</style>
