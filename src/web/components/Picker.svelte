<script lang="ts">
  import { api, type ProjectSummary } from "../api";
  import FileBrowser from "./FileBrowser.svelte";

  let { onopen }: { onopen: (id: string) => void } = $props();

  let projects: ProjectSummary[] = $state([]);
  let loading = $state(true);
  let error = $state("");
  let title = $state("");
  let browsing = $state(false);

  async function openFile(path: string) {
    browsing = false;
    try {
      onopen((await api.open(path)).id);
    } catch (e) {
      error = (e as Error).message;
    }
  }

  async function del(p: ProjectSummary) {
    const what =
      p.where === "projects"
        ? `Delete "${p.title}"? Its file moves to the Deleted folder inside the projects folder, so it can be got back.`
        : `Delete the file for "${p.title}"?\n${p.path}\nIt moves to the Deleted folder inside the projects folder.`;
    if (!confirm(what)) return;
    try {
      await api.remove(p.id, true);
      await refresh();
    } catch (e) {
      error = (e as Error).message;
    }
  }

  async function forget(p: ProjectSummary) {
    try {
      await api.remove(p.id, false);
      await refresh();
    } catch (e) {
      error = (e as Error).message;
    }
  }

  async function duplicate(p: ProjectSummary) {
    try {
      await api.duplicate(p.id);
      await refresh();
    } catch (e) {
      error = (e as Error).message;
    }
  }

  async function refresh() {
    loading = true;
    try {
      projects = await api.list();
      error = "";
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }
  void refresh();

  async function example() {
    try {
      const res = await fetch("/api/examples/lsp-01", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? res.statusText);
      onopen(body.id);
    } catch (err) {
      error = (err as Error).message;
    }
  }

  async function create(e: SubmitEvent) {
    e.preventDefault();
    try {
      const p = await api.create(title.trim() || "Untitled project");
      onopen(p.id);
    } catch (err) {
      error = (err as Error).message;
    }
  }
</script>

<div class="picker">
  <h1>Ferrule</h1>
  <form onsubmit={create}>
    <input bind:value={title} placeholder="New project title" />
    <button type="submit">Create project</button>
    <button type="button" onclick={() => (browsing = true)} title="Open a .ferrule file from any folder">Open file…</button>
  </form>
  <p class="example">
    Or <button class="link" onclick={example}>add the LSP-01 example</button>: a 12-sheet life safety panel drawn
    entirely with Ferrule's own tools.
  </p>
  {#if error}<p class="error">{error}</p>{/if}
  {#if loading}
    <p>Loading…</p>
  {:else if projects.length === 0}
    <p class="muted">No projects yet.</p>
  {:else}
    <ul>
      {#each projects as p (p.id)}
        <li>
          <button class="open" onclick={() => onopen(p.id)} title={p.path}>
            <strong>{p.title}</strong>
            <span>{p.pages} {p.pages === 1 ? "sheet" : "sheets"} · saved {new Date(p.modified).toLocaleString()}</span>
            <span class="path">{p.path}</span>
          </button>
          <div class="actions">
            <button onclick={() => duplicate(p)} title="Make a copy beside it">Duplicate</button>
            <a class="button" href={`/api/projects/${encodeURIComponent(p.id)}/file`} download title="Download the .ferrule file">Download</a>
            {#if p.where === "elsewhere"}
              <button onclick={() => forget(p)} title="Take it off this list; the file stays where it is">Remove from list</button>
            {/if}
            <button class="danger" onclick={() => del(p)} title="Delete the project file (it moves to the Deleted folder)">Delete</button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>
{#if browsing}
  <FileBrowser mode="open" onpick={(path) => void openFile(path)} onclose={() => (browsing = false)} />
{/if}

<style>
  .picker {
    max-width: 760px;
    margin: 48px auto;
    padding: 0 16px;
  }
  h1 {
    font-size: 22px;
  }
  form {
    display: flex;
    gap: 8px;
    margin-bottom: 18px;
  }
  form input {
    flex: 1;
  }
  ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .open {
    width: 100%;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 12px;
  }
  .open span {
    font-size: 12px;
    color: #667;
  }
  .open .path {
    font-family: ui-monospace, monospace;
    font-size: 11px;
    color: #889;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  li {
    display: flex;
    gap: 6px;
    align-items: stretch;
  }
  li .open {
    flex: 1;
    min-width: 0;
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
  }
  .actions button,
  .actions .button {
    font-size: 11px;
    padding: 2px 6px;
  }
  .button {
    border: 1px solid #c8ccd2;
    border-radius: 4px;
    text-decoration: none;
    color: inherit;
    text-align: center;
    background: #fff;
  }
  .danger {
    color: #a22;
  }
  .example {
    font-size: 13px;
    color: #556;
    margin: -8px 0 18px;
  }
  .error {
    color: #b00;
  }
  .muted {
    color: #667;
  }
</style>
