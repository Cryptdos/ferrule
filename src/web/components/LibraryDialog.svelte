<script lang="ts">
  /**
   * *From the library…* in Design's Devices view (v0.5 A70): the shared
   * device library beside the projects, to bring a device into this project.
   * A device brought in is edited in its Properties in the Devices view.
   */
  import { SUITS } from "../../core/ga";
  import type { DeviceEntry } from "../../core/devices";
  import { useLibraryDevice } from "../../core/ops";
  import { api } from "../api";
  import { deviceLibrary } from "../devices.svelte";
  import type { Editor } from "../editor.svelte";
  import Modal from "./Modal.svelte";

  let { editor, onclose }: { editor: Editor; onclose: () => void } = $props();

  const useLib = $derived(editor.project.useDeviceLibrary !== false);
  let filter = $state("");
  let busy = $state("");
  let error = $state("");
  $effect(() => {
    if (useLib) void deviceLibrary.load();
  });
  const kindLabel = (k: string) => SUITS.find((x) => x.key === k)?.label ?? "Anything";
  const shown = $derived.by(() => {
    const q = filter.trim().toLowerCase();
    return deviceLibrary.list.filter((d) => !q || `${d.name} ${d.maker} ${d.part} ${d.kind} ${d.notes}`.toLowerCase().includes(q));
  });
  const mine = (id: string) => !!editor.project.devices?.some((d) => d.id === id);

  function bring(d: DeviceEntry) {
    if (editor.apply((p) => void useLibraryDevice(p, d))) editor.designPick = { plant: [], device: d.id };
  }
  async function remove(d: DeviceEntry) {
    if (!confirm(`Delete “${d.name}” from the shared library, with its datasheets and pictures? Projects that use it keep their copy.`)) return;
    busy = d.id;
    error = "";
    try {
      await api.devices.remove(d.id);
      deviceLibrary.drop(d.id);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = "";
    }
  }
</script>

<Modal title="From the library" store="library" width={760} {onclose}>
  {#if !useLib}
    <p class="hint">This project doesn't use the shared library (Project settings): its devices are its own, made with <strong>+ Device</strong>.</p>
  {:else}
    <div class="find">
      <input type="search" placeholder="Find a device…" bind:value={filter} />
      <span class="hint">{deviceLibrary.list.length} in the library, beside the projects folder</span>
    </div>
    {#if error || deviceLibrary.error}<p class="error">{error || deviceLibrary.error}</p>{/if}
    {#if !deviceLibrary.loaded}
      <p class="hint">Loading…</p>
    {:else if !shown.length}
      <p class="hint">{deviceLibrary.list.length ? "Nothing matches." : "The library is empty: make a device with + Device, then put it there with To library."}</p>
    {:else}
      <div class="cards">
        {#each shown as d (d.id)}
          {@const pic = d.files.find((f) => f.type === "picture")}
          <div class="card">
            <div class="pic">{#if pic}<img src={api.devices.fileUrl(d.id, pic.name)} alt={d.name} />{:else}<span>No picture</span>{/if}</div>
            <div class="info">
              <strong>{d.name}</strong>
              <span>{[d.maker, d.part].filter(Boolean).join(" ") || "–"}</span>
              <span>{d.w} × {d.h}{d.d ? ` × ${d.d}` : ""} mm · {kindLabel(d.kind)}</span>
              {#if d.notes}<span class="hint">{d.notes}</span>{/if}
              <div class="acts">
                {#if mine(d.id)}
                  <span class="badge">in this project</span>
                {:else}
                  <button onclick={() => bring(d)}>Use in this project</button>
                {/if}
                <button class="danger" disabled={busy === d.id} onclick={() => void remove(d)} title="Delete it from the shared library">Delete from library</button>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</Modal>

<style>
  .find {
    display: flex;
    gap: 10px;
    align-items: center;
    margin-bottom: 8px;
  }
  .find input {
    flex: 0 1 260px;
  }
  .hint {
    font-size: 12px;
    color: #667;
  }
  .error {
    color: #b00;
    font-size: 13px;
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
    gap: 8px;
    max-height: 420px;
    overflow-y: auto;
  }
  .card {
    display: flex;
    gap: 8px;
    border: 1px solid #dde1e5;
    border-radius: 5px;
    padding: 6px;
    background: #fff;
  }
  .pic {
    width: 80px;
    height: 80px;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f4f5f6;
    border-radius: 3px;
    font-size: 10px;
    color: #99a;
    overflow: hidden;
  }
  .pic img {
    max-width: 100%;
    max-height: 100%;
  }
  .info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
    min-width: 0;
  }
  .acts {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    margin-top: 2px;
    align-items: center;
  }
  .acts button {
    font-size: 11px;
    padding: 1px 6px;
  }
  .badge {
    font-size: 10px;
    border: 1px solid #c8ccd2;
    border-radius: 3px;
    padding: 0 3px;
    color: #667;
  }
  .danger {
    color: #a33;
  }
</style>
