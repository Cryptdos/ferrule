<script lang="ts">
  import { checkProject } from "../../core/checks";
  import { confirmWiring } from "../../core/wiring";
  import type { Editor } from "../editor.svelte";
  import Modal from "./Modal.svelte";

  let { editor, onclose }: { editor: Editor; onclose: () => void } = $props();

  const findings = $derived(checkProject(editor.project, { proofs: editor.proofs }));
  const counts = $derived({
    error: findings.filter((f) => f.level === "error").length,
    warning: findings.filter((f) => f.level === "warning").length,
  });
</script>

<Modal title="Checks" {onclose} wide>
  <p class="summary">
    {#if findings.length === 0}
      No problems found.
    {:else}
      {counts.error} errors, {counts.warning} warnings.
    {/if}
  </p>
  <ul>
    {#each findings as f, i (i)}
      <li class={f.level}>
        <span class="lvl">{f.level}</span>
        <span class="msg">{f.message}</span>
        {#if f.confirm}
          {@const c = f.confirm}
          <button title="You've checked the drawing: it's wired. Kept until the wiring at either end changes" onclick={() => editor.apply((p) => confirmWiring(p, c.plant, c.point))}>Confirm by hand</button>
        {/if}
        {#if f.design && !f.ids.length}
          {@const d = f.design}
          <button
            onclick={() => {
              editor.mode = "design";
              editor.designView = "table";
              editor.designPick = { plant: [d.plant], ...(d.point ? { point: d.point } : {}) };
              onclose();
            }}>Show</button
          >
        {:else if f.ids.length}
          <button
            onclick={() => {
              editor.goTo(f.ids[0]!);
              editor.selection = f.ids.filter((id) => editor.page.elements.some((e) => e.id === id) || editor.page.segments.some((s) => s.id === id));
              onclose();
            }}>Show</button
          >
        {/if}
      </li>
    {/each}
  </ul>
</Modal>

<style>
  ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  li {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 4px 0;
    border-bottom: 1px solid #eef0f2;
    font-size: 13px;
  }
  .msg {
    flex: 1;
  }
  .lvl {
    font-size: 11px;
    text-transform: uppercase;
    width: 64px;
    color: #667;
  }
  .error .lvl {
    color: #b00;
    font-weight: 600;
  }
  .warning .lvl {
    color: #a60;
  }
  .summary {
    margin: 0 0 8px;
  }
</style>
