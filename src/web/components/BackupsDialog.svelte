<script lang="ts">
  import { api, type BackupList, type ProjectSummary } from "../api";
  import Modal from "./Modal.svelte";

  /**
   * A project's backups (v0.5 A12), newest first. *Restore…* makes one into
   * a new project, under a name asked for; the project itself is left alone.
   */
  let { project, onrestored, onclose }: { project: ProjectSummary; onrestored: () => void; onclose: () => void } = $props();

  let list: BackupList | null = $state(null);
  let error = $state("");
  let asking: { file: string; value: string } | null = $state(null);

  async function refresh() {
    try {
      list = await api.backups(project.id);
      error = "";
    } catch (e) {
      error = (e as Error).message;
    }
  }
  void refresh();

  const two = (n: number) => String(n).padStart(2, "0");
  /** A name for the restored copy that says when it's from: `<name> 2026-11-27 16.10`. */
  function nameFor(taken: string): string {
    const d = new Date(taken);
    return `${project.name} ${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}.${two(d.getMinutes())}`;
  }

  async function restore(e: SubmitEvent) {
    e.preventDefault();
    const a = asking;
    if (!a) return;
    try {
      await api.restoreBackup(project.id, a.file, a.value.trim());
      asking = null;
      onrestored();
    } catch (err) {
      error = (err as Error).message;
    }
  }
</script>

<Modal title={`Backups of ${project.name}`} {onclose} width={560}>
  {#if error}<p class="error">{error}</p>{/if}
  {#if list}
    <p class="hint">
      {#if list.keep > 0}
        A copy is taken at most every {list.every} {list.every === 1 ? "minute" : "minutes"} while the project changes, and the latest {list.keep} are kept, as set under <em>Project…</em>
      {:else}
        No copies are taken: <em>Project…</em> is set to keep none.
      {/if}
    </p>
    {#if list.copies.length === 0}
      <p class="muted">No copies yet.</p>
    {:else}
      <ul class="copies">
        {#each list.copies as b (b.file)}
          <li>
            <div class="what">
              <strong>{new Date(b.taken).toLocaleString()}</strong>
              <span>{b.error ?? `${b.pages} ${b.pages === 1 ? "sheet" : "sheets"}`}</span>
            </div>
            <button onclick={() => (asking = { file: b.file, value: nameFor(b.taken) })} title="Make this copy into a new project, under a name you give it">Restore…</button>
            {#if asking?.file === b.file}
              <form class="ask" onsubmit={restore}>
                <input bind:value={asking.value} aria-label="The new project's file name" />
                <button type="submit" class="primary">Restore as a new project</button>
                <button type="button" onclick={() => (asking = null)}>Cancel</button>
              </form>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  {:else if !error}
    <p>Loading…</p>
  {/if}
</Modal>

<style>
  .copies {
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
  li > button {
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
  .hint,
  .muted {
    color: #667;
    font-size: 12px;
  }
  .error {
    color: #b42318;
  }
</style>
