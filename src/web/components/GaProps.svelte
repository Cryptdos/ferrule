<script lang="ts">
  import { deleteGaItems, rotateGaItems, setGaItemDevice, setGaSettings, setGaSize, updateGaItem, useLibraryDevice } from "../../core/ops";
  import { GA_SCALES, fitScale, suitsKey, deviceSize, gaSizes, sizeKey, stripSize } from "../../core/ga";
  import { deviceLabel } from "../../core/devices";
  import { api } from "../api";
  import { deviceLibrary } from "../devices.svelte";
  import { displayTag } from "../../core/tags";
  import type { Editor } from "../editor.svelte";

  /** GA workbench, right side: the selected item, or the sheet's enclosure and the size library. */
  let { editor, ondevices }: { editor: Editor; ondevices?: () => void } = $props();

  const page = $derived(editor.page);
  const items = $derived((page.gaItems ?? []).filter((i) => editor.selection.includes(i.id)));
  const one = $derived(items.length === 1 ? items[0]! : null);
  const byId = $derived(new Map(editor.project.pages.flatMap((pg) => pg.elements.map((e) => [e.id, { e, pg }]))));
  const sizes = $derived(gaSizes(editor.project));
  let showSizes = $state(false);

  // The device table: the project's devices, then the library's (if it's used).
  const useLib = $derived(editor.project.useDeviceLibrary !== false);
  $effect(() => {
    if (useLib) void deviceLibrary.load();
  });
  const first = $derived(one?.refs?.[0] ? byId.get(one.refs[0])?.e : undefined);
  const kind = $derived(first ? suitsKey(editor.project, first) : "");
  /** The size the part would have without a device from the table. */
  const generic = $derived.by(() => {
    if (!first || !one) return null;
    if (first.symbol === "terminal") return stripSize(editor.project, one.refs ?? []);
    return deviceSize(editor.project, first);
  });
  const suits = (k: string) => !k || k === kind;
  const mine = $derived([...(editor.project.devices ?? [])].sort((a, b) => Number(suits(b.kind)) - Number(suits(a.kind)) || a.name.localeCompare(b.name)));
  const libOnly = $derived(
    useLib
      ? deviceLibrary.list.filter((d) => !mine.some((m) => m.id === d.id)).sort((a, b) => Number(suits(b.kind)) - Number(suits(a.kind)) || a.name.localeCompare(b.name))
      : [],
  );
  const dev = $derived(one?.device ? editor.project.devices?.find((d) => d.id === one.device) : undefined);
  const libEntry = $derived(dev?.library ? deviceLibrary.get(dev.id) : undefined);
  /** Sized by hand since the device was picked (either way round). */
  const handSized = $derived(!!dev && !!one && !((one.w === dev.w && one.h === dev.h) || (one.w === dev.h && one.h === dev.w)));

  function pickDevice(value: string) {
    if (!one) return;
    const id = one.id;
    if (!value) {
      const g = generic;
      if (g) editor.apply((p) => setGaItemDevice(p, editor.pageId, id, null, g));
      return;
    }
    const lib = value.startsWith("lib:") ? deviceLibrary.get(value.slice(4)) : undefined;
    editor.apply((p) => {
      const devId = lib ? useLibraryDevice(p, lib).id : value;
      setGaItemDevice(p, editor.pageId, id, devId);
    });
  }
  const num = (v: string) => Number(v);
</script>

<div class="props">
  {#if !page.ga}
    <h3>GA workbench</h3>
    <p class="hint">Pick a GA sheet from the list, or add one on the left.</p>
  {:else if one}
    <h3>{one.kind === "rail" ? "DIN rail" : one.kind === "trunking" ? "Trunking" : "Device"}</h3>
    {#if one.kind === "device" && one.refs?.length}
      <div class="refs">
        {#each one.refs.slice(0, 12) as r (r)}
          {@const x = byId.get(r)}
          {#if x}
            <button class="link-btn" onclick={() => editor.goTo(r)} title="Show it on the schematic">
              {displayTag(x.e, editor.project) || x.e.symbol} (sheet {x.pg.number}) →
            </button>
          {:else}<span class="hint">{r}: no longer on the schematic</span>{/if}
        {/each}
        {#if one.refs.length > 12}<span class="hint">and {one.refs.length - 12} more</span>{/if}
      </div>
    {/if}
    {#if one.kind === "device" && one.refs?.length}
      <label>
        Device
        <select value={one.device ?? ""} onchange={(e) => pickDevice(e.currentTarget.value)}>
          <option value="">Generic size{generic ? ` (${generic.w} × ${generic.h})` : ""}</option>
          {#if mine.length}
            <optgroup label="This project's devices">
              {#each mine as d (d.id)}<option value={d.id}>{suits(d.kind) ? "" : "· "}{deviceLabel(d)}</option>{/each}
            </optgroup>
          {/if}
          {#if libOnly.length}
            <optgroup label="From the shared library">
              {#each libOnly as d (d.id)}<option value={"lib:" + d.id}>{suits(d.kind) ? "" : "· "}{deviceLabel(d)}</option>{/each}
            </optgroup>
          {/if}
        </select>
      </label>
      {#if dev && handSized}
        <p class="hint">
          Sized by hand: {one.w} × {one.h} mm (the table says {dev.w} × {dev.h}).
          <button class="link-btn" onclick={() => pickDevice(dev.id)}>Back to the table size</button>
        </p>
      {/if}
      {#if libEntry?.files.length}
        <div class="files">
          {#each libEntry.files as f (f.name)}
            <a href={api.devices.fileUrl(libEntry.id, f.name)} target="_blank" rel="noreferrer">{f.type === "datasheet" ? "📄" : "🖼"} {f.name}</a>
          {/each}
        </div>
      {/if}
      <button class="link-btn" onclick={() => ondevices?.()}>Device table…</button>
    {/if}
    {#if one.kind === "device"}
      <label>
        Label (instead of its tag)
        <input value={one.text ?? ""} onchange={(e) => editor.apply((p) => updateGaItem(p, editor.pageId, one.id, { text: e.currentTarget.value }))} />
      </label>
    {/if}
    <div class="grid">
      <label>X (mm)<input type="number" step="5" value={one.x} onchange={(e) => editor.apply((p) => updateGaItem(p, editor.pageId, one.id, { x: num(e.currentTarget.value) }))} /></label>
      <label>Y (mm)<input type="number" step="5" value={one.y} onchange={(e) => editor.apply((p) => updateGaItem(p, editor.pageId, one.id, { y: num(e.currentTarget.value) }))} /></label>
      <label>Width (mm)<input type="number" step="5" value={one.w} onchange={(e) => editor.apply((p) => updateGaItem(p, editor.pageId, one.id, { w: num(e.currentTarget.value) }))} /></label>
      <label>Height (mm)<input type="number" step="5" value={one.h} onchange={(e) => editor.apply((p) => updateGaItem(p, editor.pageId, one.id, { h: num(e.currentTarget.value) }))} /></label>
    </div>
    <div class="buttons">
      <button onclick={() => editor.apply((p) => rotateGaItems(p, editor.pageId, [one.id]))} title="R">Rotate</button>
      <button
        class="danger"
        onclick={() => {
          editor.apply((p) => deleteGaItems(p, editor.pageId, [one.id]));
          editor.selection = [];
        }}>Delete</button
      >
    </div>
    <p class="hint">Drag to move (5 mm steps, Shift for 1 mm); drag the corner square to size it.</p>
  {:else if items.length > 1}
    <h3>{items.length} items</h3>
    <div class="buttons">
      <button
        class="danger"
        onclick={() => {
          const ids = items.map((i) => i.id);
          editor.apply((p) => deleteGaItems(p, editor.pageId, ids));
          editor.selection = [];
        }}>Delete</button
      >
    </div>
  {:else}
    <h3>{page.ga.view === "door" ? "Door" : "Backplate"}</h3>
    <div class="grid">
      <label>Width (mm)<input type="number" step="10" value={page.ga.enclosure.w} onchange={(e) => editor.apply((p) => setGaSettings(p, editor.pageId, { enclosure: { w: num(e.currentTarget.value), h: page.ga!.enclosure.h } }))} /></label>
      <label>Height (mm)<input type="number" step="10" value={page.ga.enclosure.h} onchange={(e) => editor.apply((p) => setGaSettings(p, editor.pageId, { enclosure: { w: page.ga!.enclosure.w, h: num(e.currentTarget.value) } }))} /></label>
      <label>
        Scale
        <span class="scale">
          1:<input
            type="number"
            min="0.5"
            step="0.5"
            list="ferrule-ga-scales"
            value={page.ga.scale}
            onchange={(e) => editor.apply((p) => setGaSettings(p, editor.pageId, { scale: num(e.currentTarget.value) }))}
          />
          <button
            title="The largest that fits the sheet: 1:{fitScale(page.ga.enclosure.w, page.ga.enclosure.h)}"
            onclick={() => editor.apply((p) => setGaSettings(p, editor.pageId, { scale: fitScale(page.ga!.enclosure.w, page.ga!.enclosure.h) }))}>Fit</button
          >
        </span>
        <datalist id="ferrule-ga-scales">{#each GA_SCALES as s (s)}<option value={s}></option>{/each}</datalist>
      </label>
      <label>
        View
        <select value={page.ga.view} onchange={(e) => editor.apply((p) => setGaSettings(p, editor.pageId, { view: e.currentTarget.value as "backplate" | "door" }))}>
          <option value="backplate">Backplate</option>
          <option value="door">Door</option>
        </select>
      </label>
    </div>
    <p class="hint">
      DIN rail: drag along where it goes (35 mm). Trunking: drag out its size. Devices: pick from the list on the left.
      Positions are measured from the enclosure's top-left corner.
    </p>
    <div class="buttons">
      <button onclick={() => ondevices?.()} title="Real devices with sizes, datasheets and pictures">Device table…</button>
      <button onclick={() => (showSizes = !showSizes)} title="The size each kind of part has when no device is picked">{showSizes ? "Hide generic sizes" : "Generic sizes…"}</button>
    </div>
    {#if showSizes}
      <table class="sizes">
        <thead><tr><th>Part</th><th>W</th><th>H</th></tr></thead>
        <tbody>
          {#each Object.entries(sizes) as [k, v] (k)}
            <tr>
              <td title={k}>{v.label}</td>
              <td><input type="number" step="0.5" value={v.w} onchange={(e) => editor.apply((p) => setGaSize(p, k, { w: num(e.currentTarget.value) }))} /></td>
              <td><input type="number" step="0.5" value={v.h} onchange={(e) => editor.apply((p) => setGaSize(p, k, { h: num(e.currentTarget.value) }))} /></td>
            </tr>
          {/each}
        </tbody>
      </table>
      <p class="hint">Generic sizes for this project, in mm, for parts with no device picked from the table. Parts already placed keep their size.</p>
    {/if}
  {/if}
</div>

<style>
  .scale {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .scale input {
    flex: 1;
    width: 0;
    min-width: 4.5em;
  }
  .scale button {
    padding: 2px 6px;
    font-size: 12px;
  }
  .props {
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 13px;
  }
  h3 {
    margin: 0;
    font-size: 14px;
  }
  .hint {
    font-size: 12px;
    color: #667;
    margin: 0;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
  }
  label input,
  label select {
    width: 100%;
    box-sizing: border-box;
    min-width: 0;
  }
  .grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 6px;
  }
  .buttons {
    display: flex;
    gap: 6px;
  }
  .danger {
    color: #a22;
  }
  .refs {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .link-btn {
    text-align: left;
    border: none;
    background: none;
    color: #1e6ee6;
    padding: 0;
    cursor: pointer;
  }
  .files {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
  }
  .sizes {
    font-size: 12px;
    border-collapse: collapse;
  }
  .sizes input {
    width: 4.5em;
  }
  .sizes td {
    padding: 1px 3px;
  }
</style>
