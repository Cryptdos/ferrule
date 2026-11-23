<script lang="ts">
  import { SUITS } from "../../core/ga";
  import { addProjectDevice, removeProjectDevice, updateProjectDevice, useLibraryDevice } from "../../core/ops";
  import type { DeviceEntry, ProjectDevice } from "../../core/devices";
  import { api } from "../api";
  import { deviceLibrary } from "../devices.svelte";
  import type { Editor } from "../editor.svelte";
  import Modal from "./Modal.svelte";

  /**
   * The GA device table: this project's devices and (if the project uses it)
   * the shared library, where datasheets and pictures are kept.
   */
  let { editor, onclose }: { editor: Editor; onclose: () => void } = $props();

  const useLib = $derived(editor.project.useDeviceLibrary !== false);
  const mine = $derived(editor.project.devices ?? []);
  let filter = $state("");
  let busy = $state("");
  let error = $state("");

  $effect(() => {
    if (useLib) void deviceLibrary.load();
  });

  /** What a device suits: the schematic parts you draw. */
  const kinds = SUITS;
  const kindLabel = (k: string) => kinds.find((x) => x.key === k)?.label ?? "Any";

  const libShown = $derived.by(() => {
    const q = filter.trim().toLowerCase();
    return deviceLibrary.list.filter((d) => !q || `${d.name} ${d.maker} ${d.part} ${d.kind} ${d.notes}`.toLowerCase().includes(q));
  });
  /** In use on a GA sheet of this project. */
  const used = $derived(new Set(editor.project.pages.flatMap((pg) => (pg.gaItems ?? []).map((i) => i.device).filter(Boolean))));

  // New / edit form.
  type Form = { id: string | null; where: "library" | "project"; name: string; maker: string; part: string; kind: string; w: number; h: number; d: number; notes: string };
  const blank = (): Form => ({ id: null, where: useLib ? "library" : "project", name: "", maker: "", part: "", kind: "", w: 18, h: 90, d: 0, notes: "" });
  let form: Form | null = $state(null);

  function editLibrary(d: DeviceEntry) {
    form = { id: d.id, where: "library", name: d.name, maker: d.maker, part: d.part, kind: d.kind, w: d.w, h: d.h, d: d.d, notes: d.notes };
  }
  function editMine(d: ProjectDevice) {
    form = { id: d.id, where: "project", name: d.name, maker: d.maker, part: d.part, kind: d.kind, w: d.w, h: d.h, d: d.d, notes: "" };
  }

  async function run(what: string, fn: () => Promise<void>) {
    busy = what;
    error = "";
    try {
      await fn();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = "";
    }
  }

  async function saveForm() {
    const f = form;
    if (!f) return;
    if (!f.name.trim()) {
      error = "Give the device a name";
      return;
    }
    const fields = { name: f.name, maker: f.maker, part: f.part, kind: f.kind, w: Number(f.w), h: Number(f.h), d: Number(f.d) || 0 };
    await run("save", async () => {
      if (f.where === "library") {
        const e = f.id ? await api.devices.update(f.id, { ...fields, notes: f.notes }) : await api.devices.add({ ...fields, notes: f.notes });
        deviceLibrary.put(e);
        // The project's copy (and GA items still at the old size) follow.
        if (mine.some((d) => d.id === e.id)) editor.apply((p) => void useLibraryDevice(p, e));
      } else if (f.id) {
        const id = f.id;
        editor.apply((p) => updateProjectDevice(p, id, fields));
      } else {
        editor.apply((p) => void addProjectDevice(p, fields));
      }
      form = null;
    });
  }

  async function addFiles(d: DeviceEntry, files: File[]) {
    await run(`files:${d.id}`, async () => {
      let e = d;
      for (const f of files) e = await api.devices.addFile(d.id, f);
      deviceLibrary.put(e);
    });
  }

  async function removeLibrary(d: DeviceEntry) {
    if (!confirm(`Delete “${d.name}” from the shared library, with its datasheets and pictures? Projects that use it keep their copy of its size.`)) return;
    await run(`del:${d.id}`, async () => {
      await api.devices.remove(d.id);
      deviceLibrary.drop(d.id);
    });
  }

  /** The library's entry for a project copy, when its size has changed since. */
  function newer(d: ProjectDevice): DeviceEntry | null {
    if (!d.library) return null;
    const e = deviceLibrary.get(d.id);
    return e && (e.w !== d.w || e.h !== d.h || e.d !== d.d || e.name !== d.name) ? e : null;
  }

  async function toLibrary(d: ProjectDevice) {
    await run(`up:${d.id}`, async () => {
      const e = await api.devices.add({ name: d.name, maker: d.maker, part: d.part, kind: d.kind, w: d.w, h: d.h, d: d.d, ...(d.module ? { module: d.module } : {}) });
      deviceLibrary.put(e);
      // The project now uses the library entry in place of its own.
      editor.apply((p) => {
        useLibraryDevice(p, e);
        for (const pg of p.pages) for (const it of pg.gaItems ?? []) if (it.device === d.id) it.device = e.id;
        for (const it of p.plant) if (it.module?.device === d.id) it.module.device = e.id;
        removeProjectDevice(p, d.id);
      });
    });
  }
</script>

<Modal title="GA device table" {onclose} wide>
  <p class="intro">
    Real devices with their sizes from the datasheet. On a GA sheet, pick one for a part under <em>Device</em> in its properties.
    {#if useLib}
      Devices in the shared library (beside the projects folder) can be used in any project and keep their datasheets and pictures.
    {:else}
      This project doesn't use the shared library (Project settings), so only its own devices are here.
    {/if}
  </p>
  {#if error}<p class="error">{error}</p>{/if}

  <h3>In this project ({mine.length})</h3>
  {#if mine.length === 0}
    <p class="muted">None yet. {useLib ? "Use one from the library below, or add a new one." : "Add one below."}</p>
  {:else}
    <table>
      <thead><tr><th>Name</th><th>Maker / part</th><th>Suits</th><th class="num">W × H × D mm</th><th></th></tr></thead>
      <tbody>
        {#each mine as d (d.id)}
          {@const n = newer(d)}
          <tr>
            <td>{d.name} {#if d.library}<span class="badge" title="A copy of a library device">library</span>{/if}</td>
            <td>{[d.maker, d.part].filter(Boolean).join(" ")}</td>
            <td>{kindLabel(d.kind)}</td>
            <td class="num">{d.w} × {d.h}{d.d ? ` × ${d.d}` : ""}</td>
            <td class="acts">
              {#if n}
                <button onclick={() => editor.apply((p) => void useLibraryDevice(p, n))} title="The library now says {n.w} × {n.h}: take its details">Update</button>
              {/if}
              {#if !d.library}
                <button onclick={() => editMine(d)}>Edit</button>
                {#if useLib}<button onclick={() => void toLibrary(d)} disabled={!!busy} title="Put it in the shared library for other projects">To library</button>{/if}
              {/if}
              <button
                class="danger"
                onclick={() => editor.apply((p) => removeProjectDevice(p, d.id))}
                title={used.has(d.id) ? "GA parts that are this device keep their size" : "Take it out of this project"}>Remove</button
              >
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}

  {#if useLib}
    <div class="libhead">
      <h3>Shared library ({deviceLibrary.list.length})</h3>
      <input type="search" placeholder="Find a device…" bind:value={filter} />
    </div>
    {#if deviceLibrary.error}<p class="error">{deviceLibrary.error}</p>{/if}
    {#if !deviceLibrary.loaded}
      <p class="muted">Loading…</p>
    {:else if libShown.length === 0}
      <p class="muted">{deviceLibrary.list.length ? "Nothing matches." : "The library is empty: add the first device below."}</p>
    {:else}
      <div class="cards">
        {#each libShown as d (d.id)}
          {@const pic = d.files.find((f) => f.type === "picture")}
          <div
            class="card"
            role="group"
            ondragover={(e) => e.preventDefault()}
            ondrop={(e) => {
              e.preventDefault();
              const files = [...(e.dataTransfer?.files ?? [])];
              if (files.length) void addFiles(d, files);
            }}
          >
            <div class="pic">
              {#if pic}<img src={api.devices.fileUrl(d.id, pic.name)} alt={d.name} />{:else}<span>No picture</span>{/if}
            </div>
            <div class="info">
              <strong>{d.name}</strong>
              <span>{[d.maker, d.part].filter(Boolean).join(" ") || "–"}</span>
              <span>{d.w} × {d.h}{d.d ? ` × ${d.d}` : ""} mm · {kindLabel(d.kind)}</span>
              {#if d.notes}<span class="muted">{d.notes}</span>{/if}
              <span class="files">
                {#each d.files as f (f.name)}
                  <span class="file">
                    <a href={api.devices.fileUrl(d.id, f.name)} target="_blank" rel="noreferrer">{f.type === "datasheet" ? "📄" : "🖼"} {f.name}</a>
                    <button
                      class="x"
                      title="Remove this file"
                      onclick={() => run(`rmf:${d.id}`, async () => deviceLibrary.put(await api.devices.removeFile(d.id, f.name)))}>×</button
                    >
                  </span>
                {/each}
              </span>
              <div class="acts">
                {#if mine.some((m) => m.id === d.id)}
                  <span class="badge">in this project</span>
                {:else}
                  <button onclick={() => editor.apply((p) => void useLibraryDevice(p, d))}>Use in project</button>
                {/if}
                <label class="button" title="Add datasheets (PDF) or pictures; or drop them on this card">
                  {busy === `files:${d.id}` ? "Adding…" : "Add files…"}
                  <input
                    type="file"
                    multiple
                    accept=".pdf,image/*"
                    hidden
                    onchange={(e) => {
                      const files = [...(e.currentTarget.files ?? [])];
                      e.currentTarget.value = "";
                      if (files.length) void addFiles(d, files);
                    }}
                  />
                </label>
                <button onclick={() => editLibrary(d)}>Edit</button>
                <button class="danger" onclick={() => void removeLibrary(d)}>Delete</button>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}

  {#if form}
    <div class="form">
      <h3>{form.id ? "Edit device" : "New device"}</h3>
      <div class="grid">
        <label class="wide">Name <input bind:value={form.name} placeholder="e.g. Relay 4CO 24V DC with base" /></label>
        <label>Maker <input bind:value={form.maker} placeholder="e.g. Weidmüller" /></label>
        <label>Part no. <input bind:value={form.part} placeholder="e.g. 7760056085" /></label>
        <label>
          Suits
          <select bind:value={form.kind}>
            <option value="">Any part</option>
            {#each kinds as k (k.key)}<option value={k.key}>{k.label}</option>{/each}
          </select>
        </label>
        <label>Width (mm) <input type="number" min="1" step="0.1" bind:value={form.w} /></label>
        <label>Height (mm) <input type="number" min="1" step="0.1" bind:value={form.h} /></label>
        <label>Depth (mm) <input type="number" min="0" step="0.1" bind:value={form.d} /></label>
        {#if form.where === "library"}
          <label class="wide">Notes <input bind:value={form.notes} placeholder="e.g. coil 24V DC, 4 changeover" /></label>
        {/if}
      </div>
      {#if !form.id && useLib}
        <div class="where">
          <label><input type="radio" bind:group={form.where} value="library" /> In the shared library (datasheets and pictures can be added)</label>
          <label><input type="radio" bind:group={form.where} value="project" /> This project only</label>
        </div>
      {/if}
      <p class="hint">Width × height as seen on the backplate (along the rail × up the panel), from the datasheet's dimensions.</p>
      <div class="buttons">
        <button class="primary" onclick={() => void saveForm()} disabled={!!busy}>{form.id ? "Save" : "Add device"}</button>
        <button onclick={() => (form = null)}>Cancel</button>
      </div>
    </div>
  {:else}
    <div class="buttons"><button class="primary" onclick={() => (form = blank())}>New device…</button></div>
  {/if}
</Modal>

<style>
  .intro {
    margin: 0 0 8px;
    font-size: 13px;
    color: #445;
  }
  h3 {
    font-size: 13px;
    margin: 12px 0 6px;
  }
  .libhead {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .libhead input {
    margin-top: 6px;
    flex: 1;
    max-width: 260px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  th,
  td {
    text-align: left;
    padding: 3px 6px;
    border-bottom: 1px solid #eef0f2;
  }
  .num {
    text-align: right;
    white-space: nowrap;
  }
  td.acts {
    white-space: nowrap;
    text-align: right;
  }
  .acts button,
  .acts .button {
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
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
    gap: 8px;
    max-height: 340px;
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
  .files {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 8px;
  }
  .file a {
    font-size: 11px;
  }
  .x {
    border: none;
    background: none;
    padding: 0 2px;
    color: #a33;
  }
  .info .acts {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    margin-top: 2px;
    align-items: center;
  }
  label.button {
    border: 1px solid #c8ccd2;
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
  }
  .form {
    margin-top: 12px;
    border-top: 1px solid #dde1e5;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px 10px;
  }
  .grid label {
    display: flex;
    flex-direction: column;
    font-size: 12px;
    color: #445;
    gap: 2px;
  }
  .grid .wide {
    grid-column: span 3;
  }
  .grid input,
  .grid select {
    width: 100%;
    box-sizing: border-box;
  }
  .where {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
    margin-top: 6px;
  }
  .hint,
  .muted {
    font-size: 12px;
    color: #667;
  }
  .error {
    color: #b00;
    font-size: 13px;
  }
  .buttons {
    display: flex;
    gap: 6px;
    margin-top: 10px;
  }
</style>
