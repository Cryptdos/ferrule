<script lang="ts">
  import { SHEET_MM } from "../../core/geometry";
  import type { Project } from "../../core/model";
  import Sheet from "./Sheet.svelte";

  /** `solo`: show just that sheet, filling the window (for screenshots). */
  let { project, autoprint = false, solo = 0 }: { project: Project; autoprint?: boolean; solo?: number } = $props();

  const pages = $derived(solo ? project.pages.filter((p) => p.number === solo) : project.pages);

  $effect(() => {
    document.title = `${project.project.drawingNo || project.project.title} — print`;
    document.body.classList.add("printing");
    // Wait for the drawing font, then a frame to lay out, before printing.
    void document.fonts
      .load('10px "osifont"')
      .catch(() => {})
      .then(() =>
        requestAnimationFrame(() => {
          document.body.dataset.ready = "1";
          if (autoprint) setTimeout(() => window.print(), 200);
        }),
      );
  });
</script>

{#each pages as page (page.id)}
  <svg
    class="sheet"
    class:solo={!!solo}
    xmlns="http://www.w3.org/2000/svg"
    width={solo ? "100%" : `${SHEET_MM.w}mm`}
    height={solo ? "100%" : `${SHEET_MM.h}mm`}
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
  .sheet.solo {
    position: fixed;
    inset: 0;
    margin: 0;
    box-shadow: none;
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
