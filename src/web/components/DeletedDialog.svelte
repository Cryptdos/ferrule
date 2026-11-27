<script lang="ts">
  import { api, type DeletedProject } from "../api";
  import Modal from "./Modal.svelte";

  /**
   * The projects in the Deleted folder (v0.5 A16), each with *Restore…*,
   * which asks for the name to restore it as, and *Delete permanently*,
   * which asks first.
   */
  let { onrestored, onclose }: { onrestored: () => void; onclose: () => void } = $props();

  let items: DeletedProject[] = $state([]);
  let loading = $state(true);
  let error = $state("");
  /** The row asking for the name to restore as, starting from the name it had. */
  let asking: { file: string; value: string } | null = $state(null);

  async function refresh() {
    loading = true;
    try {
      items = await api.deleted();
      error = "";
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }
  void refresh();

  async function restore(e: SubmitEvent) {
    e.preventDefault();
    const a = asking;
    if (!a) return;
    try {
      await api.restore(a.file, a.value.trim());
      asking = null;
      await refresh();
      onrestored();
    } catch (err) {
      error = (err as Error).message;
    }
  }

  async function purge(d: DeletedProject) {
    if (!confirm(`Delete "${d.name}" permanently? This can't be undone.`)) return;
    try {
      await api.purge(d.file);
      await refresh();
    } catch (err) {
      error = (err as Error).message;
    }
  }
</script>

<Modal title="Deleted projects" {onclose} width={560}>
  {#if error}<p class="error">{error}</p>{/if}
  {#if loading}
    <p>Loading…</p>
  {:else if items.length === 0}
    <p class="muted">Nothing has been deleted.</p>
  {:else}
    <ul class="deleted">
      {#each items as d (d.file)}
        <li>
          <div class="what">
            <strong>{d.name}{#if d.title}<span class="ttl">{d.title}</span>{/if}</strong>
            <span>
              deleted {new Date(d.deleted).toLocaleString()}{" · "}{d.error ?? `${d.pages} ${d.pages === 1 ? "sheet" : "sheets"}`}
            </span>
          </div>
          <div class="acts">
            <button onclick={() => (asking = { file: d.file, value: d.name })} title="Put it back in the projects folder, under a name you give it">Restore…</button>
            <button class="danger" onclick={() => purge(d)} title="Delete its file for good">Delete permanently</button>
          </div>
          {#if asking?.file === d.file}
            <form class="ask" onsubmit={restore}>
              <input bind:value={asking.value} aria-label="The name to restore it as" />
              <button type="submit" class="primary">Restore</button>
              <button type="button" onclick={() => (asking = null)}>Cancel</button>
            </form>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</Modal>

<style>
  .deleted {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 60vh;
    overflow: auto;
  }
  li {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    padding: 6px 0;
    border-bottom: 1px solid #e4e6ea;
  }
  .what {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .what span {
    color: #667;
    font-size: 12px;
  }
  .ttl {
    margin-left: 0.6em;
    font-weight: normal;
    color: #667;
  }
  .acts {
    display: flex;
    gap: 4px;
  }
  .acts button {
    font-size: 12px;
    padding: 2px 8px;
  }
  .ask {
    display: flex;
    flex-basis: 100%;
    gap: 6px;
  }
  .ask input {
    flex: 1;
  }
  .danger {
    color: #b42318;
  }
  .muted {
    color: #667;
  }
  .error {
    color: #b42318;
  }
</style>
