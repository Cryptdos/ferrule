<script lang="ts">
  import { api, type ProjectSummary } from "../api";
  import FileBrowser from "./FileBrowser.svelte";
  import DeletedDialog from "./DeletedDialog.svelte";
  import BackupsDialog from "./BackupsDialog.svelte";
  import logo from "../logo/ferrule.svg";

  let { onopen }: { onopen: (id: string) => void } = $props();

  let projects: ProjectSummary[] = $state([]);
  let loading = $state(true);
  let error = $state("");
  /** The new project's file name (v0.5 A17). */
  let name = $state("");
  /** A row asking for a name: a copy's (A8), or a new one for its file (A21). */
  let asking: { id: string; kind: "duplicate" | "rename"; value: string } | null = $state(null);
  let browsing = $state(false);
  let showDeleted = $state(false);
  /** The project whose backups are open (A12). */
  let backupsOf: ProjectSummary | null = $state(null);
  let uploader: HTMLInputElement | undefined = $state();

  /** A .ferrule file from this computer into the projects folder (A9). */
  async function upload() {
    const f = uploader?.files?.[0];
    if (uploader) uploader.value = "";
    if (!f) return;
    try {
      await api.upload(f.name, await f.text());
      await refresh();
    } catch (e) {
      error = (e as Error).message;
    }
  }

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
        ? `Delete "${p.name}"? Its file moves to the Deleted folder inside the projects folder, and Deleted projects… can restore it.`
        : `Delete the file for "${p.name}"?\n${p.path}\nIt moves to the Deleted folder inside the projects folder.`;
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

  /** A copy asks for its name: a copy is made for a reason, and its name says what (A8). */
  function duplicate(p: ProjectSummary) {
    asking = { id: p.id, kind: "duplicate", value: `${p.name} copy` };
  }
  /** A new name for the file, where it is (A21). */
  function rename(p: ProjectSummary) {
    asking = { id: p.id, kind: "rename", value: p.name };
  }
  async function answer(e: SubmitEvent) {
    e.preventDefault();
    const a = asking;
    if (!a) return;
    try {
      if (a.kind === "duplicate") await api.duplicate(a.id, a.value.trim());
      else await api.rename(a.id, a.value.trim());
      asking = null;
      await refresh();
    } catch (err) {
      error = (err as Error).message;
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

  let useLibrary = $state(true);

  async function create(e: SubmitEvent) {
    e.preventDefault();
    try {
      const p = await api.create(name.trim(), useLibrary);
      onopen(p.id);
    } catch (err) {
      error = (err as Error).message;
    }
  }
</script>

<div class="picker">
  <h1><img src={logo} alt="" width="40" height="40" /> Ferrule</h1>
  <form onsubmit={create}>
    <input bind:value={name} placeholder="New project's file name" title="What you type is the file you get, capitals and spaces included (none of \ / : * ? &quot; < > |). Its title and the rest of the title block go in Project… once it's made" />
    <button type="submit" disabled={!name.trim()}>Create project</button>
    <button type="button" onclick={() => (browsing = true)} title="Open a .ferrule file from any folder on the machine Ferrule runs on">Open file…</button>
    <button type="button" onclick={() => uploader?.click()} title="Add a .ferrule file from this computer to the projects folder">Upload…</button>
    <input type="file" accept=".ferrule" hidden bind:this={uploader} onchange={upload} />
  </form>
  <label class="uselib" title="GA sheets can take device sizes, datasheets and pictures from the shared device library. Untick to start this project's device table from scratch.">
    <input type="checkbox" bind:checked={useLibrary} /> Use the shared device library for GA sheets
  </label>
  <p class="example">
    Or <button class="link" onclick={example}>add the LSP-01 example</button>: a life safety panel drawn
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
          {#if p.error}
            <div class="open refused" title={p.path}>
              <strong>{p.name}</strong>
              <span>{p.error}</span>
              <span class="path">{p.path}</span>
            </div>
          {:else}
            <button class="open" onclick={() => onopen(p.id)} title={p.path}>
              <strong>{p.name}{#if p.title}<span class="ttl">{p.title}</span>{/if}</strong>
              <span>{p.pages} {p.pages === 1 ? "sheet" : "sheets"} · saved {new Date(p.modified).toLocaleString()}</span>
              <span class="path">{p.path}</span>
            </button>
          {/if}
          {#if asking?.id === p.id}
            <form class="ask" onsubmit={answer}>
              <input bind:value={asking.value} aria-label={asking.kind === "duplicate" ? "The copy's file name" : "The new file name"} />
              <button type="submit" class="primary">{asking.kind === "duplicate" ? "Make the copy" : "Rename"}</button>
              <button type="button" onclick={() => (asking = null)}>Cancel</button>
            </form>
          {/if}
          <div class="actions">
            {#if !p.error}
              <button onclick={() => duplicate(p)} title="A copy in the projects folder, under a name you give it">Duplicate…</button>
              <button onclick={() => rename(p)} title="Rename the project's file where it is">Rename…</button>
              <a class="button" href={`/api/projects/${encodeURIComponent(p.id)}/file`} download title="Download the .ferrule file">Download</a>
              <button onclick={() => (backupsOf = p)} title="The dated copies taken as it's worked on, to restore one into a new project">Backups…</button>
            {/if}
            {#if p.where === "elsewhere"}
              <button onclick={() => forget(p)} title="Take it off this list; the file stays where it is">Remove from list</button>
            {/if}
            <button class="danger" onclick={() => del(p)} title="Delete the project file (it moves to the Deleted folder)">Delete</button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
  <p class="deleted-link"><button class="link" onclick={() => (showDeleted = true)} title="The projects that have been deleted, to restore or delete for good">Deleted projects…</button></p>
</div>
{#if backupsOf}
  <BackupsDialog project={backupsOf} onrestored={() => void refresh()} onclose={() => (backupsOf = null)} />
{/if}
{#if showDeleted}
  <DeletedDialog onrestored={() => void refresh()} onclose={() => (showDeleted = false)} />
{/if}
{#if browsing}
  <FileBrowser mode="open" onpick={(path) => void openFile(path)} onclose={() => (browsing = false)} />
{/if}

<style>
  .deleted-link {
    margin-top: 10px;
  }
  .ttl {
    margin-left: 0.6em;
    font-weight: normal;
    color: #667;
  }
  .ask {
    display: flex;
    flex-basis: 100%;
    order: 3;
    gap: 6px;
    align-items: center;
    margin: 0 0 4px;
  }
  .ask input {
    flex: 1;
  }
  .ask input {
    flex: 1;
  }
  .refused {
    opacity: 0.6;
    cursor: default;
  }
  .uselib {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: #445;
    margin: -4px 0 10px;
  }
  .picker {
    max-width: 760px;
    margin: 48px auto;
    padding: 0 16px;
  }
  h1 {
    font-size: 22px;
    display: flex;
    align-items: center;
    gap: 10px;
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
    flex-wrap: wrap;
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
