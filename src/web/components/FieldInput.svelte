<script lang="ts">
  import { resolveFields } from "../../core/fields";
  import { plantLabel } from "../../core/ops";
  import type { Editor } from "../editor.svelte";

  /** A text input for labels, with a picker that inserts plant fields like {plant:p1.tag}. */
  let {
    editor,
    value,
    placeholder = "",
    onchange,
    multiline = false,
  }: { editor: Editor; value: string; placeholder?: string; onchange: (v: string) => void; multiline?: boolean } = $props();

  let input: HTMLInputElement | HTMLTextAreaElement | undefined = $state();
  const preview = $derived(value.includes("{") ? resolveFields(value, editor.project) : "");

  function insert(field: string) {
    if (!input) return;
    const at = input.selectionStart ?? input.value.length;
    const next = input.value.slice(0, at) + field + input.value.slice(input.selectionEnd ?? at);
    onchange(next);
  }
</script>

<div class="field">
  {#if multiline}
    <textarea bind:this={input} {value} {placeholder} rows="3" onchange={(e) => onchange(e.currentTarget.value)}></textarea>
  {:else}
    <input bind:this={input} {value} {placeholder} onchange={(e) => onchange(e.currentTarget.value)} />
  {/if}
    <select
      title="Insert a field: it always shows the current value (plant tag, project title…)"
      value=""
      onchange={(e) => {
        const v = e.currentTarget.value;
        e.currentTarget.value = "";
        if (v) insert(v);
      }}
    >
      <option value="">+ field</option>
      <option value={"{project:title}"}>Project title</option>
      <option value={"{project:panelName}"}>Panel name</option>
      <option value={"{project:client}"}>Client</option>
      <option value={"{project:drawingNo}"}>Drawing ref.</option>
      <option value={"{project:jobNo}"}>Job no.</option>
      <option value={"{sheets}"}>Sheet count</option>
      <option value={"{rev}"}>Latest revision</option>
      {#each editor.project.plant as p (p.id)}
        <option value={`{plant:${p.id}.tag}`}>{plantLabel(p)} tag</option>
        <option value={`{plant:${p.id}.description}`}>{plantLabel(p)} description</option>
      {/each}
    </select>
</div>
{#if preview}<div class="preview">Shows: {preview}</div>{/if}

<style>
  .field {
    display: flex;
    gap: 4px;
  }
  .field textarea {
    flex: 1;
    min-width: 0;
    font: inherit;
    font-size: 13px;
    resize: vertical;
  }
  .field input {
    flex: 1;
    min-width: 0;
  }
  .field select {
    width: 78px;
    flex: none;
  }
  .preview {
    font-size: 11px;
    color: #667;
  }
</style>
