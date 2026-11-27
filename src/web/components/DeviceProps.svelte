<script lang="ts">
  /**
   * A device's Properties in Design's Devices view (v0.5 A70): the device the
   * picked row has, or a device picked by itself. This is where a device is
   * edited. A device from the shared library is edited there, and this
   * project's copy follows; one made in this project is edited here.
   */
  import { SUITS } from "../../core/ga";
  import { rowsUsing, type DeviceRow } from "../../core/devicerows";
  import { formatRelayPins, parseRelayPins, type DeviceEntry, type ProjectDevice } from "../../core/devices";
  import { removeProjectDevice, renameDevice, updateProjectDevice, useLibraryDevice } from "../../core/ops";
  import { api } from "../api";
  import { deviceLibrary } from "../devices.svelte";
  import type { Editor } from "../editor.svelte";

  let { editor, rows }: { editor: Editor; rows: DeviceRow[] } = $props();

  const useLib = $derived(editor.project.useDeviceLibrary !== false);
  $effect(() => {
    if (useLib) void deviceLibrary.load();
  });
  const row = $derived(editor.designPick.row ? rows.find((r) => r.key === editor.designPick.row) : undefined);
  const dev = $derived(row ? row.device : editor.designPick.device ? editor.project.devices?.find((d) => d.id === editor.designPick.device) : undefined);
  const lib = $derived(dev?.library ? deviceLibrary.get(dev.id) : undefined);
  const users = $derived(dev ? rowsUsing(rows, dev.id) : []);
  /** The library's entry when it says something the project's copy doesn't. */
  const newer = $derived(dev && lib && (lib.w !== dev.w || lib.h !== dev.h || lib.d !== dev.d || lib.name !== dev.name || lib.maker !== dev.maker || lib.part !== dev.part || lib.kind !== dev.kind) ? lib : undefined);

  let busy = $state("");
  let error = $state("");
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

  type Patch = Partial<Pick<DeviceEntry, "name" | "maker" | "part" | "kind" | "w" | "h" | "d" | "va" | "ways" | "relayPins" | "notes">>;
  /** One change: to the library entry (the copy follows), or to this project's own device. */
  function save(patch: Patch) {
    const d = dev;
    if (!d) return;
    if (d.library && lib) {
      void run("save", async () => {
        const e = await api.devices.update(d.id, { ...patch, ...("relayPins" in patch ? { relayPins: patch.relayPins ?? null } : {}) } as never);
        deviceLibrary.put(e);
        editor.apply((p) => void useLibraryDevice(p, e));
      });
      return;
    }
    const { notes: _notes, ...rest } = patch;
    editor.apply((p) => updateProjectDevice(p, d.id, rest as Partial<ProjectDevice>));
  }
  const num = (v: string) => Number(v);
  function savePins(text: string) {
    try {
      save({ relayPins: parseRelayPins(text) });
    } catch (e) {
      error = (e as Error).message;
    }
  }

  async function toLibrary(d: ProjectDevice) {
    await run("up", async () => {
      const e = await api.devices.add({ name: d.name, maker: d.maker, part: d.part, kind: d.kind, w: d.w, h: d.h, d: d.d, ...(d.module ? { module: d.module } : {}), ...(d.va ? { va: d.va } : {}), ...(d.relayPins ? { relayPins: d.relayPins } : {}), ...(d.ways ? { ways: d.ways } : {}) });
      deviceLibrary.put(e);
      // The project now has the library's entry in place of its own.
      editor.apply((p) => {
        useLibraryDevice(p, e);
        renameDevice(p, d.id, e.id);
        removeProjectDevice(p, d.id);
      });
      if (editor.designPick.device === d.id) editor.designPick = { plant: [], device: e.id };
    });
  }
  async function addFiles(e: DeviceEntry, files: File[]) {
    await run("files", async () => {
      let x = e;
      for (const f of files) x = await api.devices.addFile(e.id, f);
      deviceLibrary.put(x);
    });
  }
  function remove(d: ProjectDevice) {
    const n = users.length;
    if (n && !confirm(`Take ${d.name} out of this project? ${n === 1 ? "One thing has" : `${n} things have`} it, and will have no device.`)) return;
    editor.apply((p) => removeProjectDevice(p, d.id));
    if (editor.designPick.device === d.id) editor.designPick = { plant: [] };
  }
  const usedBy = (list: DeviceRow[]) => {
    const tags = list.map((r) => r.tag);
    if (!tags.length) return "not used yet";
    if (tags.length <= 3) return `used by ${tags.slice(0, -1).join(", ")}${tags.length > 1 ? " and " : ""}${tags[tags.length - 1]}`;
    return `used by ${tags.slice(0, 2).join(", ")} and ${tags.length - 2} more`;
  };
</script>

{#if !row && !dev}
  <p class="hint">Pick a row to see its device here. Tick rows, or a whole group, to give them one with <strong>Set picked to…</strong>.</p>
{:else if row && !dev}
  <div class="who">
    <strong>{row.tag}</strong>
    <span class="hint">{row.what}</span>
  </div>
  <p class="none">No device yet.</p>
  <p class="hint">Pick one in its row, or make one with <strong>+ Device</strong>: it suits {row.tag} and is given to it. Until it has one, it's drawn and laid out at its generic size, and draws nothing in Simulate.</p>
{:else if dev}
  <div class="who">
    <strong>{dev.name}</strong>
    <span class="hint">Device{dev.library ? " from the shared library" : ""} · {usedBy(users)}</span>
  </div>
  {#if error}<p class="error">{error}</p>{/if}
  {#if dev.library && !lib && useLib && deviceLibrary.loaded}
    <p class="hint">It's no longer in the shared library: this project keeps its copy as it was.</p>
  {/if}
  {#if newer}
    <p class="hint">The library says something else now ({newer.w} × {newer.h}). <button class="link-btn" onclick={() => editor.apply((p) => void useLibraryDevice(p, newer))}>Take the library's</button></p>
  {/if}
  {#key dev.id}
    <label>Name <input value={dev.name} onchange={(e) => save({ name: e.currentTarget.value })} /></label>
    <div class="two">
      <label>Maker <input value={dev.maker} placeholder="Maker" onchange={(e) => save({ maker: e.currentTarget.value })} /></label>
      <label>Part number <input value={dev.part} placeholder="Part number" onchange={(e) => save({ part: e.currentTarget.value })} /></label>
    </div>
    <label>
      Suits
      <select value={dev.kind} onchange={(e) => save({ kind: e.currentTarget.value })}>
        <option value="">Anything</option>
        {#each SUITS as k (k.key)}<option value={k.key}>{k.label}</option>{/each}
      </select>
    </label>
    <div class="size" title="Width × height as seen on the backplate (along the rail × up the panel), and depth, from the datasheet's dimensions">
      <span class="lbl">Size, W × H × D mm</span>
      <span class="wh">
        <input type="number" min="1" step="0.1" value={dev.w} onchange={(e) => num(e.currentTarget.value) > 0 && save({ w: num(e.currentTarget.value) })} /> ×
        <input type="number" min="1" step="0.1" value={dev.h} onchange={(e) => num(e.currentTarget.value) > 0 && save({ h: num(e.currentTarget.value) })} /> ×
        <input type="number" min="0" step="0.1" value={dev.d} onchange={(e) => save({ d: num(e.currentTarget.value) || 0 })} />
      </span>
    </div>
    <label title="Its expected draw from its data sheet, which Simulate adds up on the supply that feeds it">Draw (VA) <input type="number" min="0" step="0.1" value={dev.va ?? ""} placeholder="–" onchange={(e) => save({ va: num(e.currentTarget.value) || 0 })} /></label>
    {#if dev.kind === "block"}
      <label title="How many wires it takes. Each wire drawn onto a distribution block needs a way, and Check warns when the block's device has fewer">Ways <input type="number" min="0" step="1" value={dev.ways ?? ""} onchange={(e) => save({ ways: Math.floor(num(e.currentTarget.value) || 0) })} /></label>
    {/if}
    {#if dev.kind === "relay" || dev.kind === "timer" || dev.kind === "contactor"}
      <label title="A relay base's own terminal numbers, printed on its coil, contacts and contact table in place of A1/A2 and 11/12/14: the coil's two, then | and each pole's common, NC and NO (a dash for one it hasn't)">Relay pins <input value={formatRelayPins(dev.relayPins)} placeholder="e.g. A1 A2 | 11 12 14 | 21 22 24" onchange={(e) => savePins(e.currentTarget.value)} /></label>
    {/if}
    {#if lib}
      <label>Notes <input value={lib.notes} placeholder="e.g. coil 24 V DC, 4 changeover" onchange={(e) => save({ notes: e.currentTarget.value })} /></label>
      <div class="section">Datasheets and pictures</div>
      <div class="files">
        {#each lib.files as f (f.name)}
          <span class="file">
            <a href={api.devices.fileUrl(lib.id, f.name)} target="_blank" rel="noreferrer">{f.type === "datasheet" ? "📄" : "🖼"} {f.name}</a>
            <button class="x" title="Remove this file" onclick={() => run("rmf", async () => deviceLibrary.put(await api.devices.removeFile(lib.id, f.name)))}>×</button>
          </span>
        {/each}
        <label class="button" title="Add datasheets (PDF) or pictures">
          {busy === "files" ? "Adding…" : "Add files…"}
          <input
            type="file"
            multiple
            accept=".pdf,image/*"
            hidden
            onchange={(e) => {
              const files = [...(e.currentTarget.files ?? [])];
              e.currentTarget.value = "";
              if (files.length) void addFiles(lib, files);
            }}
          />
        </label>
      </div>
    {:else if !dev.library}
      <p class="hint">Datasheets and pictures are kept in the shared library: {useLib ? "put it there with To library to add them." : "this project doesn't use it (Project settings)."}</p>
    {/if}
    <div class="buttons">
      {#if !dev.library && useLib}<button disabled={!!busy} onclick={() => void toLibrary(dev)} title="Put it in the shared library, for other projects and for its datasheets and pictures">To library</button>{/if}
      <button class="danger" onclick={() => remove(dev)} title="Take it out of this project: what has it has no device (the shared library keeps its entry)">Delete device</button>
    </div>
  {/key}
{/if}

<style>
  .who {
    display: flex;
    flex-direction: column;
  }
  .hint {
    font-size: 12px;
    color: #778;
    margin: 0;
  }
  .none {
    margin: 0;
    color: #b33;
  }
  .error {
    color: #b33;
    font-size: 12px;
    margin: 0;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
    color: #556;
  }
  .two {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 8px;
  }
  .two input {
    width: 100%;
    box-sizing: border-box;
    min-width: 0;
  }
  .size {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
    color: #556;
  }
  .wh {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .wh input {
    width: 5.5em;
  }
  .section {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #778;
    border-top: 1px solid #eef0f2;
    padding-top: 6px;
  }
  .files {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    font-size: 12px;
  }
  .file {
    display: inline-flex;
    gap: 2px;
    align-items: center;
  }
  .x {
    border: none;
    background: none;
    color: #b33;
    cursor: pointer;
    padding: 0 2px;
  }
  label.button {
    display: inline-block;
    border: 1px solid #ccd2d8;
    border-radius: 4px;
    padding: 2px 8px;
    cursor: pointer;
    color: inherit;
  }
  .buttons {
    display: flex;
    gap: 6px;
    border-top: 1px solid #eef0f2;
    padding-top: 8px;
  }
  .danger {
    color: #b33;
  }
  .link-btn {
    border: none;
    background: none;
    color: #1e6ee6;
    padding: 0;
    cursor: pointer;
    font: inherit;
  }
</style>
