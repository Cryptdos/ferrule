<script lang="ts">
  import { SHEET_MM } from "../../core/geometry";
  import type { Project } from "../../core/model";
  import Sheet from "./Sheet.svelte";

  let { project, autoprint = false }: { project: Project; autoprint?: boolean } = $props();

  $effect(() => {
    document.title = `${project.project.drawingNo || project.project.title} — print`;
    document.body.classList.add("printing");
    // Give the browser a frame to lay out the sheets before printing.
    requestAnimationFrame(() => {
      document.body.dataset.ready = "1";
      if (autoprint) setTimeout(() => window.print(), 200);
    });
  });
</script>

{#each project.pages as page (page.id)}
  <svg
    class="sheet"
    xmlns="http://www.w3.org/2000/svg"
    width="{SHEET_MM.w}mm"
    height="{SHEET_MM.h}mm"
    viewBox="0 0 {SHEET_MM.w} {SHEET_MM.h}"
  >
    <Sheet {project} {page} />
  </svg>
{/each}

<style>
  :global(body.printing) {
    background: #888;
  }
  .sheet {
    display: block;
    margin: 8mm auto;
    background: #fff;
    box-shadow: 0 1px 6px rgba(0, 0, 0, 0.4);
  }
  @media print {
    :global(body.printing) {
      background: #fff;
    }
    .sheet {
      margin: 0;
      box-shadow: none;
      break-after: page;
    }
    .sheet:last-child {
      break-after: auto;
    }
  }
  @page {
    size: A4 landscape;
    margin: 0;
  }
</style>
