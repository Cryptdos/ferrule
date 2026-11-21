<script lang="ts">
  import { api, type ProjectSummary } from "../api";

  let { onopen }: { onopen: (id: string) => void } = $props();

  let projects: ProjectSummary[] = $state([]);
  let loading = $state(true);
  let error = $state("");
  let title = $state("");

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
          <button class="open" onclick={() => onopen(p.id)}>
            <strong>{p.title}</strong>
            <span>{p.pages} {p.pages === 1 ? "sheet" : "sheets"} · {new Date(p.modified).toLocaleString()} · {p.id}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .picker {
    max-width: 640px;
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
