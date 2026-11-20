<script lang="ts">
  import { resolveFields } from "../../core/fields";
  import type { Editor } from "../editor.svelte";

  /** A text input for labels, with a picker that inserts plant fields like {plant:p1.tag}. */
  let {
    editor,
    value,
    placeholder = "",
    onchange,
  }: { editor: Editor; value: string; placeholder?: string; onchange: (v: string) => void } = $props();

  let input: HTMLInputElement | undefined = $state();
  const preview = $derived(value.includes("{") ? resolveFields(value, editor.project) : "");

  function insert(field: string) {
    if (!input) return;
    const at = input.selectionStart ?? input.value.length;
    const next = input.value.slice(0, at) + field + input.value.slice(input.selectionEnd ?? at);
    onchange(next);
  }
</script>

<div class="field">
  <input bind:this={input} {value} {placeholder} onchange={(e) => onchange(e.currentTarget.value)} />
  {#if editor.project.plant.length}
    <select
      title="Insert a plant field: it always shows the plant's current tag or description"
      value=""
      onchange={(e) => {
        const v = e.currentTarget.value;
        e.currentTarget.value = "";
        if (v) insert(v);
      }}
    >
      <option value="">+ field</option>
      {#each editor.project.plant as p (p.id)}
        <option value={`{plant:${p.id}.tag}`}>{p.tag} tag</option>
        <option value={`{plant:${p.id}.description}`}>{p.tag} description</option>
      {/each}
    </select>
  {/if}
</div>
{#if preview}<div class="preview">Shows: {preview}</div>{/if}

<style>
  .field {
    display: flex;
    gap: 4px;
  }
  .field input {
    flex: 1;
    min-width: 0;
  }
  .field select {
    width: 68px;
  }
  .preview {
    font-size: 11px;
    color: #667;
  }
</style>
