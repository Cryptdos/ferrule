<script lang="ts">
  import { untrack } from "svelte";
  /**
   * Design templates (design-v0.4 §3): rows the engineer saved, a list of
   * their own apart from Draft's templates, kept in the library so every
   * project can use them. None are built in. Inserting makes ordinary rows:
   * add or delete rows and points afterwards; nothing links back.
   */
  import { designTemplateOf, insertDesignTemplate, tagPlan, templateCounts } from "../../core/design";
  import type { DesignTemplate } from "../../core/model";
  import { plantLabel } from "../../core/ops";
  import { api } from "../api";
  import type { Editor } from "../editor.svelte";
  import Modal from "./Modal.svelte";

  let { editor, onclose }: { editor: Editor; onclose: () => void } = $props();

  type Entry = Awaited<ReturnType<typeof api.designTemplates>>[number];
  let list: Entry[] = $state([]);
  let error = $state("");
  let file = $state("");
  let chosen = $state<DesignTemplate | null>(null);
  /** The picked system, or the picked plant's, to begin with. */
  let system = $state(untrack(() => editor.designPick.system ?? editor.project.plant.find((p) => p.id === editor.designPick.plant[0])?.system ?? ""));
  let copies = $state(1);
  let step = $state(1);
  let saving = $state(false);
  let name = $state("");

  const picked = $derived(editor.project.plant.filter((p) => !p.module && editor.designPick.plant.includes(p.id)));
  const counts = $derived(chosen ? templateCounts(chosen) : null);
  const plan = $derived(chosen ? tagPlan(editor.project, chosen.plant.map((p) => p.tag), Math.max(1, Math.floor(copies) || 1), Math.floor(step) || 0, 0) : []);
  const taken = $derived(plan.flat().filter((t) => t.taken).length);

  async function refresh() {
    try {
      list = await api.designTemplates();
      error = "";
    } catch (e) {
      error = (e as Error).message;
    }
  }
  void refresh();

  async function choose(f: string) {
    file = f;
    try {
      chosen = await api.designTemplate(f);
    } catch (e) {
      error = (e as Error).message;
    }
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    try {
      const t = designTemplateOf($state.snapshot(editor.project) as typeof editor.project, picked.map((p) => p.id), name);
      const r = await api.saveDesignTemplate(t);
      saving = false;
      name = "";
      await refresh();
      await choose(r.file);
      editor.flash(`Saved "${t.name}" as a Design template`);
    } catch (err) {
      error = (err as Error).message;
    }
  }

  async function remove(f: string, n: string) {
    if (!confirm(`Delete the Design template "${n}"? Rows already inserted from it stay as they are.`)) return;
    await api.deleteDesignTemplate(f);
    if (file === f) {
      file = "";
      chosen = null;
    }
    await refresh();
  }

  function insert() {
    if (!chosen) return;
    const t = chosen;
    let ids: string[] = [];
    let untagged = 0;
    const ok = editor.apply((p) => {
      const r = insertDesignTemplate(p, t, { system, copies, step });
      ids = r.plant.map((x) => x.id);
      untagged = r.untagged;
    });
    if (!ok) return;
    editor.designPick = { plant: ids };
    editor.designFolded = editor.designFolded.filter((n) => n !== system);
    if (untagged) editor.flash(`${untagged} tag${untagged === 1 ? " was" : "s were"} taken: left empty for you to type, or for Renumber`);
    onclose();
  }
</script>

<Modal title="Templates" store="design-templates" wide {onclose}>
  <div class="body">
    <div class="left">
      <div class="h">Your templates</div>
      {#if list.length}
        <ul>
          {#each list as t (t.file)}
            <li class:on={file === t.file}>
              <button class="pick" onclick={() => choose(t.file)}>{t.name}</button>
              <button class="x" title="Delete this template" onclick={() => remove(t.file, t.name)}>×</button>
            </li>
          {/each}
        </ul>
      {/if}
      <p class="hint">A template is a selection of rows you saved. None are built in; the list starts empty. Templates are kept in the library beside your projects, so every project can use them. They're apart from Draft's templates, which are drawings.</p>
      {#if saving}
        <form onsubmit={save}>
          <input bind:value={name} placeholder="Name: pump pair, flow proved" aria-label="Template name" />
          <div class="row"><button type="submit" disabled={!name.trim()}>Save</button><button type="button" onclick={() => (saving = false)}>Cancel</button></div>
        </form>
      {:else}
        <button disabled={!picked.length} onclick={() => (saving = true)} title={picked.length ? `Save ${picked.map(plantLabel).join(", ")}` : "Pick rows in the table first"}>Save selection as template…</button>
      {/if}
      {#if error}<p class="err">{error}</p>{/if}
    </div>
    <div class="right">
      {#if chosen && counts}
        <div class="fields">
          <label>Into system
            <select bind:value={system}>
              <option value="">No system</option>
              {#each editor.project.systems ?? [] as s (s)}<option value={s}>{s}</option>{/each}
            </select>
          </label>
          <label>Copies <input type="number" min="1" max="200" bind:value={copies} /></label>
          <label>Tags step by <input type="number" min="0" bind:value={step} /></label>
        </div>
        <div class="h">Will insert <span class="hint">ordinary rows; type over any tag</span></div>
        <table>
          <thead><tr><th>Tag</th><th>Description</th><th>Points</th><th>DI</th><th>DO</th><th>AI</th><th>AO</th></tr></thead>
          <tbody>
            {#each counts.rows as r, i (i)}
              <tr>
                <td class="tag">{plan[0]?.[i]?.tag || "?"}</td><td>{r.description}</td><td class="dim">{r.points}</td>
                {#each ["DI", "DO", "AI", "AO"] as const as k (k)}<td class="n">{r.counts[k] || ""}</td>{/each}
              </tr>
            {/each}
            <tr class="total">
              <td colspan="3">Total{copies > 1 ? ` × ${copies}` : ""}</td>
              {#each ["DI", "DO", "AI", "AO"] as const as k (k)}<td class="n">{counts.total[k] * Math.max(1, Math.floor(copies) || 1) || ""}</td>{/each}
            </tr>
          </tbody>
        </table>
        {#if taken}<p class="err">{taken} tag{taken === 1 ? " is" : "s are"} taken in this project: {taken === 1 ? "it's" : "they're"} left empty. Change the step, or type them after.</p>{/if}
        <p class="hint">After inserting, add or delete rows and points as the job needs. Nothing links back to the template.</p>
        <div class="row end"><button onclick={onclose}>Cancel</button><button class="primary" onclick={insert}>Insert</button></div>
      {:else}
        <p class="hint">Pick a template on the left to see what it inserts.</p>
      {/if}
    </div>
  </div>
</Modal>

<style>
  .body {
    display: grid;
    grid-template-columns: 260px minmax(420px, 1fr);
    gap: 16px;
    padding: 12px 14px;
  }
  .h {
    font-weight: 600;
    font-size: 13px;
    margin-bottom: 6px;
  }
  ul {
    list-style: none;
    margin: 0 0 8px;
    padding: 0;
    border: 1px solid #e3e6e9;
    border-radius: 4px;
  }
  li {
    display: flex;
    border-bottom: 1px solid #eef0f2;
  }
  li.on {
    background: #e8f0fd;
  }
  .pick {
    flex: 1;
    text-align: left;
    border: none;
    background: none;
  }
  .x {
    border: none;
    background: none;
    color: #a00;
  }
  .fields {
    display: flex;
    gap: 10px;
    margin-bottom: 10px;
  }
  label {
    display: flex;
    flex-direction: column;
    font-size: 12px;
    color: #556;
    gap: 2px;
  }
  label input {
    width: 7em;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 13px;
  }
  th {
    text-align: left;
    font-weight: normal;
    color: #556;
    border-bottom: 1px solid #ccd;
    padding: 4px 6px;
  }
  td {
    padding: 3px 6px;
    border-bottom: 1px solid #eef0f2;
  }
  .tag {
    font-weight: 600;
  }
  .dim {
    color: #778;
  }
  .n {
    text-align: center;
  }
  tr.total td {
    background: #f1f3f6;
    font-weight: 600;
  }
  .row {
    display: flex;
    gap: 6px;
    margin-top: 6px;
  }
  .row.end {
    justify-content: flex-end;
  }
  form input {
    width: 100%;
  }
  .hint {
    font-size: 12px;
    color: #667;
    font-weight: normal;
  }
  .err {
    font-size: 12px;
    color: #b00;
  }
  .primary {
    background: #1e6ee6;
    border-color: #1e6ee6;
    color: #fff;
  }
</style>
