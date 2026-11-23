<script lang="ts">
  import { setModuleDevice } from "../../core/controllers";
  import { moduleTypeName } from "../../core/modules";
  import { deleteGaItems, rotateGaItems, setGaItemDevice, setGaSettings, setGaSize, updateGaItem, useLibraryDevice } from "../../core/ops";
  import {
    GA_SCALES,
    VIEW_NAMES,
    deviceSize,
    doorLeaves,
    doorOwner,
    fitScale,
    gaFrame,
    gaSizes,
    isDoorDevice,
    moduleGaSize,
    railFill,
    railNumber,
    sheetLeaves,
    stripSize,
    suitsKey,
    DETAIL_ZOOMS,
    detailOf,
    frameCaption,
    frameOf,
    zoomText,
  } from "../../core/ga";
  import type { DoorLeaf, GaView } from "../../core/model";
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
  /** A controller's module on the GA. */
  const mod = $derived(one?.module ? editor.project.plant.find((x) => x.id === one.module) : undefined);
  const kind = $derived(mod ? "module" : first ? suitsKey(editor.project, first) : "");
  /** The size the part would have without a device from the table. */
  const generic = $derived.by(() => {
    if (mod?.module) return moduleGaSize(editor.project, { ...mod, module: { ...mod.module, device: undefined } });
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
    // A module is its model everywhere it's placed.
    if (mod) {
      const lib = value.startsWith("lib:") ? deviceLibrary.get(value.slice(4)) : undefined;
      const mid = mod.id;
      editor.apply((p) => setModuleDevice(p, mid, value ? (lib ? useLibraryDevice(p, lib).id : value) : null));
      return;
    }
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

  // The sheet: its view, its door (one or two leaves, or another sheet's door) and what it shows.
  const owner = $derived(page.ga ? doorOwner(editor.project, page) : null);
  const ownDoor = $derived(!!owner && owner.id === page.id);
  const leaves = $derived(owner ? doorLeaves(owner) : []);
  const doorFronts = $derived(editor.project.pages.filter((p) => p.ga?.view === "door-front" && !p.ga.of && p.id !== page.id));
  const frame = $derived(page.ga ? gaFrame(editor.project, page) : null);
  const fits = $derived(frame ? fitScale(frame.w, frame.h) : 1);
  const fill = $derived(one?.kind === "rail" ? railFill(page).find((f) => f.rail.id === one.id) : undefined);
  const doorDevice = $derived(!!first && one?.kind === "device" && (one.part === "handle" || isDoorDevice(editor.project, first)));
  function setLeaves(next: DoorLeaf[]) {
    editor.apply((p) => setGaSettings(p, editor.pageId, { leaves: next }));
  }
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
</script>

<div class="props">
  {#if !page.ga}
    <h3>GA workbench</h3>
    <p class="hint">Pick a GA sheet from the list, or add one on the left.</p>
  {:else if one}
    <h3>{one.kind === "rail" ? `DIN rail ${railNumber(page, one)}` : one.kind === "trunking" ? "Trunking" : one.kind === "label" ? "Label plate" : one.kind === "dim" ? "Dimension" : one.kind === "detail" ? `Detail ${one.letter ?? ""}` : one.kind === "frame" ? "Detail frame" : one.part === "handle" ? "Door handle" : "Device"}</h3>
    {#if one.kind === "detail"}
      {@const f = frameOf(editor.project, one.id)}
      <div class="grid">
        <label>Letter<input value={one.letter ?? ""} onchange={(e) => editor.apply((p) => updateGaItem(p, editor.pageId, one.id, { letter: e.currentTarget.value }))} /></label>
        <label>Title<input placeholder="e.g. SUPPLY FAN" value={one.text ?? ""} onchange={(e) => editor.apply((p) => updateGaItem(p, editor.pageId, one.id, { text: e.currentTarget.value }))} /></label>
      </div>
      <p class="hint">
        {#if f}Shown on sheet {f.page.number} at {zoomText(f.it.zoom ?? 1)}. <button class="link-btn" onclick={() => editor.goTo(f.it.id)}>Show it →</button>
        {:else}Not shown yet: add a detail sheet and use Place detail… there.{/if}
      </p>
    {/if}
    {#if one.kind === "frame"}
      {@const d = detailOf(editor.project, one)}
      <p class="hint">{frameCaption(editor.project, one)}</p>
      <label>
        Scale
        <select value={String(one.zoom ?? 1)} onchange={(e) => editor.apply((p) => updateGaItem(p, editor.pageId, one.id, { zoom: Number(e.currentTarget.value) }))}>
          {#each DETAIL_ZOOMS as k (k)}<option value={String(k)}>{zoomText(k)}</option>{/each}
        </select>
      </label>
      {#if d}<button class="link-btn" onclick={() => editor.goTo(d.it.id)}>Show detail {d.it.letter} on sheet {d.page.number} →</button>{/if}
    {/if}
    {#if fill}
      <p class="fill" class:over={fill.overlaps.length || fill.overhang.length}>
        Fill: {fill.used} of {fill.length} mm ({pct(fill.used, fill.length)}%), {fill.devices.length} device{fill.devices.length === 1 ? "" : "s"}.
        {#if fill.overlaps.length}{fill.overlaps.length} overlap{fill.overlaps.length === 1 ? "s" : ""}.{/if}
        {#if fill.overhang.length}{fill.overhang.length} run{fill.overhang.length === 1 ? "s" : ""} off the end.{/if}
      </p>
    {/if}
    {#if one.kind === "dim" && one.dim}
      {@const dim = one.dim}
      <label>
        Style
        <select value={dim.style} onchange={(e) => editor.apply((p) => updateGaItem(p, editor.pageId, one.id, { dim: { ...dim, style: e.currentTarget.value as "chain" | "baseline" } }))}>
          <option value="chain">Chain: the gaps along a run</option>
          <option value="baseline">Baseline: each distance from the first point</option>
        </select>
      </label>
      <p class="hint">
        {dim.axis === "h" ? "Horizontal" : "Vertical"}, {dim.points.length} points, {dim.points.filter((p) => p.item).length} on items (it follows them when they move). Drag it to move its line.
      </p>
    {/if}
    {#if one.kind === "label"}
      <label>
        Text (a line break for a second line)
        <textarea rows="2" value={one.text ?? ""} onchange={(e) => editor.apply((p) => updateGaItem(p, editor.pageId, one.id, { text: e.currentTarget.value }))}></textarea>
      </label>
      <label>
        Engraved text height (mm)
        <input type="number" min="1" step="0.5" value={one.textMm ?? 5} onchange={(e) => editor.apply((p) => updateGaItem(p, editor.pageId, one.id, { textMm: num(e.currentTarget.value) }))} />
      </label>
    {/if}
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
    {#if mod?.module}
      <p class="hint">{mod.tag || `${mod.prefix || "A"}?`} · {moduleTypeName(mod.module)}{mod.module.maker || mod.module.model ? ` · ${[mod.module.maker, mod.module.model].filter(Boolean).join(" ")}` : ""}, a controller's module (Controllers… in Draft).</p>
    {/if}
    {#if one.kind === "device" && (one.refs?.length || mod)}
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
    {#if doorDevice}
      <label>
        Door cut-out (mm: 22.3 round, or 92 x 92)
        <input placeholder="e.g. 22.3" value={one.cutout ?? ""} onchange={(e) => editor.apply((p) => updateGaItem(p, editor.pageId, one.id, { cutout: e.currentTarget.value }))} />
      </label>
    {/if}
    {#if one.kind === "device"}
      <label>
        Label (instead of its tag)
        <input value={one.text ?? ""} onchange={(e) => editor.apply((p) => updateGaItem(p, editor.pageId, one.id, { text: e.currentTarget.value }))} />
      </label>
    {/if}
    {#if one.kind !== "dim"}
    <div class="grid">
      {#if one.kind === "frame"}
        <label>X (mm)<input type="number" step="5" value={one.x} onchange={(e) => editor.apply((p) => updateGaItem(p, editor.pageId, one.id, { x: num(e.currentTarget.value) }))} /></label>
        <label>Y (mm)<input type="number" step="5" value={one.y} onchange={(e) => editor.apply((p) => updateGaItem(p, editor.pageId, one.id, { y: num(e.currentTarget.value) }))} /></label>
      {:else}
      <label>X (mm)<input type="number" step="5" value={one.x} onchange={(e) => editor.apply((p) => updateGaItem(p, editor.pageId, one.id, { x: num(e.currentTarget.value) }))} /></label>
      <label>Y (mm)<input type="number" step="5" value={one.y} onchange={(e) => editor.apply((p) => updateGaItem(p, editor.pageId, one.id, { y: num(e.currentTarget.value) }))} /></label>
      <label>Width (mm)<input type="number" step="5" value={one.w} onchange={(e) => editor.apply((p) => updateGaItem(p, editor.pageId, one.id, { w: num(e.currentTarget.value) }))} /></label>
      <label>Height (mm)<input type="number" step="5" value={one.h} onchange={(e) => editor.apply((p) => updateGaItem(p, editor.pageId, one.id, { h: num(e.currentTarget.value) }))} /></label>
      {/if}
    </div>
    {/if}
    <div class="buttons">
      {#if one.kind !== "dim" && one.kind !== "frame" && one.kind !== "detail"}<button onclick={() => editor.apply((p) => rotateGaItems(p, editor.pageId, [one.id]))} title="R">Rotate</button>{/if}
      <button
        class="danger"
        onclick={() => {
          editor.apply((p) => deleteGaItems(p, editor.pageId, [one.id]));
          editor.selection = [];
        }}>Delete</button
      >
    </div>
    {#if one.kind === "frame"}<p class="hint">Drag to move (5 mm steps, Shift for 1 mm). Its size is its detail's at its scale.</p>
    {:else if one.kind !== "dim"}<p class="hint">Drag to move (5 mm steps, Shift for 1 mm); drag the corner square to size it.</p>{/if}
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
    <h3>{VIEW_NAMES[page.ga.view]}</h3>
    <div class="grid">
      <label>
        View
        <select value={page.ga.view} onchange={(e) => editor.apply((p) => setGaSettings(p, editor.pageId, { view: e.currentTarget.value as GaView }))}>
          {#each Object.entries(VIEW_NAMES) as [v, name] (v)}
            <!-- A detail sheet is its own kind: it's added as one, and stays one. -->
            <option value={v} disabled={(v === "door-back" && !page.ga.of && !doorFronts.length) || (v === "detail") !== (page.ga.view === "detail")}>{name}</option>
          {/each}
        </select>
      </label>
      {#if page.ga.view !== "detail"}
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
          <button title="The largest that fits the sheet: 1:{fits}" onclick={() => editor.apply((p) => setGaSettings(p, editor.pageId, { scale: fits }))}>Fit</button>
        </span>
        <datalist id="ferrule-ga-scales">{#each GA_SCALES as s (s)}<option value={s}></option>{/each}</datalist>
      </label>
      {/if}
    </div>
    {#if page.ga.view === "detail"}
      <p class="hint">Frames showing details drawn on other GA sheets, each at its own scale (Place detail…). No enclosure and no scale of its own.</p>
    {:else if page.ga.view !== "backplate"}
      <label>
        Door
        <select
          value={page.ga.of ?? ""}
          onchange={(e) => {
            const v = e.currentTarget.value;
            editor.apply((p) => setGaSettings(p, editor.pageId, { of: v || null }));
          }}
        >
          {#if page.ga.view === "door-front"}<option value="">Its own door, laid out here</option>{/if}
          {#each doorFronts as d (d.id)}<option value={d.id}>The door on sheet {d.number}{d.title ? `: ${d.title}` : ""}</option>{/each}
        </select>
      </label>
    {/if}
    {#if !page.ga.of && page.ga.view !== "detail"}
      <div class="grid">
        <label>Width (mm)<input type="number" step="10" value={page.ga.enclosure.w} onchange={(e) => editor.apply((p) => setGaSettings(p, editor.pageId, { enclosure: { w: num(e.currentTarget.value), h: page.ga!.enclosure.h } }))} /></label>
        <label>Height (mm)<input type="number" step="10" value={page.ga.enclosure.h} onchange={(e) => editor.apply((p) => setGaSettings(p, editor.pageId, { enclosure: { w: page.ga!.enclosure.w, h: num(e.currentTarget.value) } }))} /></label>
      </div>
    {/if}
    {#if ownDoor}
      <label>
        Leaves
        <select
          value={leaves.length}
          onchange={(e) =>
            setLeaves(
              e.currentTarget.value === "2"
                ? [
                    { w: page.ga!.enclosure.w / 2, hinge: "left" },
                    { w: page.ga!.enclosure.w / 2, hinge: "right" },
                  ]
                : [{ w: page.ga!.enclosure.w, hinge: leaves[0]?.hinge ?? "left" }],
            )}
        >
          <option value={1}>One door</option>
          <option value={2}>Two doors</option>
        </select>
      </label>
      <div class="grid">
        {#each leaves as l, i (i)}
          <label>
            {leaves.length > 1 ? (i === 0 ? "Left leaf" : "Right leaf") : "Door"} hinged
            <select value={l.hinge} onchange={(e) => setLeaves(leaves.map((x, j) => (j === i ? { ...x, hinge: e.currentTarget.value as "left" | "right" } : x)))}>
              <option value="left">On the left</option>
              <option value="right">On the right</option>
            </select>
          </label>
        {/each}
        {#if leaves.length > 1}
          <label>
            Left leaf width (mm)
            <input type="number" step="10" value={leaves[0]!.w} onchange={(e) => setLeaves([{ ...leaves[0]!, w: num(e.currentTarget.value) }, leaves[1]!])} />
          </label>
          <label>Right leaf (mm)<input disabled value={leaves[1]!.w} /></label>
        {/if}
      </div>
    {/if}
    {#if owner && leaves.length > 1}
      <label>
        Shows
        <select
          value={page.ga.leaf === undefined ? "" : String(page.ga.leaf)}
          onchange={(e) => {
            const v = e.currentTarget.value;
            editor.apply((p) => setGaSettings(p, editor.pageId, { leaf: v === "" ? null : (Number(v) as 0 | 1) }));
          }}
        >
          <option value="">Both leaves, side by side</option>
          <option value="0">The left leaf (from the front)</option>
          <option value="1">The right leaf (from the front)</option>
        </select>
      </label>
    {/if}
    {#if page.ga.view === "door-back"}
      <p class="hint">Seen from inside, mirrored: the door's devices from sheet {owner?.number ?? "?"} are drawn dashed with their cut-outs. Rail and trunking on the door go here.</p>
    {:else if owner && !ownDoor}
      <p class="hint">The door's devices and label plates are laid out on sheet {owner.number}; dimension them here.</p>
    {/if}
    {#each railFill(page) as f (f.rail.id)}
      <p class="fill" class:over={f.overlaps.length || f.overhang.length}>Rail {railNumber(page, f.rail)}: {f.used} of {f.length} mm ({pct(f.used, f.length)}%)</p>
    {/each}
    {#if sheetLeaves(editor.project, page).length === 0 && page.ga.view === "door-back"}<p class="hint warn">Pick the door this is the back of.</p>{/if}
    <p class="hint">
      The GA tools are in the browser on the left; parts from the schematic in <em>Place parts…</em>.
      Positions are measured from the enclosure's top-left corner, as this sheet sees it.
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
  .fill {
    font-size: 12px;
    margin: 0;
    color: #334;
  }
  .fill.over,
  .warn {
    color: #a60;
  }
  textarea {
    width: 100%;
    box-sizing: border-box;
    font: inherit;
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
