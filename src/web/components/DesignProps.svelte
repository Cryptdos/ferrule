<script lang="ts">
  /**
   * Design's Properties (design-v0.4 §2): the picked plant item with its
   * points, or the picked system. Every field saves when you leave it.
   */
  import {
    addDesignPoint,
    deleteDesignPoint,
    addInterlock,
    updateInterlock,
    addInterlockCondition,
    removeInterlockCondition,
    deleteInterlock,
    interlockable,
    deleteSystem,
    goesTo,
    moveSystem,
    pointType,
    renameSystem,
    setPlantDesign,
    updateDesignPoint,
    type PlantDesign,
    type PointDesign,
  } from "../../core/design";
  import { CONNECTS, GOES_TO, POINT_FORMS, SIGNAL_SUGGESTIONS, type PointForm } from "../../core/model";
  import { deletePlant, plantLabel, setQuickEntry, updatePlant } from "../../core/ops";
  import { formatQuickEntry, printedPin } from "../../core/points";
  import type { Editor } from "../editor.svelte";
  import TypeBadge from "./TypeBadge.svelte";
  import { confirmWiring, wiringOf } from "../../core/wiring";
  import { MAX_CONDITIONS, interlockStatus } from "../../core/interlocks";
  import ChannelSelect from "./ChannelSelect.svelte";
  import { SUPPLY_CHOICES, formatSupplies, formatSupply } from "../../core/supplies";

  let { editor }: { editor: Editor } = $props();

  const pick = $derived(editor.designPick);
  const plant = $derived(pick.plant.length === 1 ? editor.project.plant.find((p) => p.id === pick.plant[0]) : undefined);
  const many = $derived(pick.plant.map((id) => editor.project.plant.find((p) => p.id === id)).filter((p) => !!p));
  const systems = $derived(editor.project.systems ?? []);
  const comms = $derived(plant?.connects === "comms" || plant?.connects === "both");
  const drawn = $derived(
    plant ? editor.project.pages.filter((pg) => pg.elements.some((e) => e.symbol === "plant-view" && e.params.plant === plant.id)).map((pg) => pg.number) : [],
  );

  /** Points in the table an interlock can name: field plant's, that can be on or off. */
  const tablePoints = $derived(
    editor.project.plant
      .filter((p) => !p.module)
      .flatMap((p) => (p.points ?? []).filter((q) => interlockable(q.form)).map((q) => ({ ref: `plant:${p.id}:${q.name}`, name: `${plantLabel(p)} ${q.name}` }))),
  );
  /** Whether each of this plant's interlocks is proved (Check logic's search, kept short). */
  const ilStatus = $derived(plant?.interlocks?.length ? interlockStatus(editor.project, editor.proofs, plant.interlocks.map((x) => x.id)) : new Map());
  /** Prove this plant's interlocks now, as Check logic would: it can take a moment, so it's asked for. */
  function prove() {
    if (plant) void editor.proveInterlocks(plant.interlocks?.map((x) => x.id));
  }
  function newInterlock() {
    if (!plant) return;
    const point = (plant.points ?? []).find((q) => interlockable(q.form));
    const other = tablePoints.find((t) => t.ref !== `plant:${plant.id}:${point?.name}`);
    if (point && other) editor.apply((p) => void addInterlock(p, plant.id, point.name, { ref: other.ref, on: true }));
  }

  /** Another condition on an interlock: the first point in the table it doesn't name yet. */
  function addCondition(id: string, point: string) {
    if (!plant) return;
    const il = plant.interlocks?.find((x) => x.id === id);
    const other = tablePoints.find((t) => t.ref !== `plant:${plant.id}:${point}` && !il?.when.some((c) => c.ref === t.ref)) ?? tablePoints.find((t) => t.ref !== `plant:${plant.id}:${point}`);
    if (other) editor.apply((p) => addInterlockCondition(p, plant.id, id, { ref: other.ref, on: true }));
  }

  let newName = $state("");
  let newForm: PointForm = $state("contact");
  let newSignal = $state("");
  let nameInput: HTMLInputElement | undefined = $state();
  $effect(() => {
    if (editor.designAdding && plant) nameInput?.focus();
  });

  const setPlant = (patch: PlantDesign) => plant && editor.apply((p) => setPlantDesign(p, plant.id, patch));
  const setPoint = (name: string, patch: PointDesign) => {
    if (!plant) return;
    const ok = editor.apply((p) => updateDesignPoint(p, plant.id, name, patch));
    if (ok && patch.name && editor.designPick.point === name) editor.designPick = { plant: [plant.id], point: patch.name.trim() };
  };

  function addPoint(e: SubmitEvent) {
    e.preventDefault();
    if (!plant) return;
    let name = "";
    const ok = editor.apply((p) => {
      name = addDesignPoint(p, plant.id, { name: newName, form: newForm, signal: newSignal }).name;
    });
    if (!ok) return;
    editor.designPick = { plant: [plant.id], point: name };
    newName = "";
    newSignal = "";
    nameInput?.focus();
  }

  function removePlant() {
    const list = many;
    const where = list.length === 1 && drawn.length ? ` It's drawn on sheet ${drawn.join(", ")}: its views go too.` : "";
    if (!confirm(`Delete ${list.map(plantLabel).join(", ")}?${where}`)) return;
    editor.apply((p) => list.forEach((it) => deletePlant(p, it.id)));
    editor.designPick = { plant: [] };
  }

  function moveTo(system: string) {
    const ids = many.map((p) => p.id);
    editor.apply((p) => ids.forEach((id) => setPlantDesign(p, id, { system })));
  }
</script>

<div class="dprops">
  <div class="head"><span class="title">Properties</span></div>
  <div class="body">
    {#if plant}
      <div class="who">
        <strong>{plantLabel(plant)}</strong>
        <span class="hint">Plant{plant.system ? ` · ${plant.system}` : ""}{drawn.length ? ` · drawn on sheet ${drawn.join(", ")}` : " · not drawn yet"}</span>
      </div>
      <label>Tag
        <input value={plant.tag} placeholder="{plant.prefix}? (from where it's drawn, by Renumber)" onchange={(e) => editor.apply((p) => updatePlant(p, plant.id, { tag: e.currentTarget.value }))} />
      </label>
      <label>Description
        <input value={plant.description} onchange={(e) => editor.apply((p) => updatePlant(p, plant.id, { description: e.currentTarget.value }))} />
      </label>
      <label title="The letters its tag starts with when Renumber tags it from where it's drawn (P → P3-12)">Prefix
        <input value={plant.prefix ?? ""} placeholder="U" onchange={(e) => editor.apply((p) => updatePlant(p, plant.id, { prefix: e.currentTarget.value }))} />
      </label>
      <label>System
        <select value={plant.system ?? ""} onchange={(e) => setPlant({ system: e.currentTarget.value })}>
          <option value="">No system</option>
          {#each systems as s (s)}<option value={s}>{s}</option>{/each}
        </select>
      </label>
      <label>Connects by
        <select value={plant.connects ?? "hardwired"} onchange={(e) => setPlant({ connects: e.currentTarget.value as PlantDesign["connects"] })}>
          {#each CONNECTS as c (c.value)}<option value={c.value}>{c.label}</option>{/each}
        </select>
      </label>
      {#if comms}
        <label>Protocol
          <input value={plant.protocol ?? ""} list="ferrule-protocols" placeholder="BACnet IP, Modbus RTU…" onchange={(e) => setPlant({ protocol: e.currentTarget.value })} />
        </label>
        <label>Network
          <select value={plant.network ?? ""} onchange={(e) => setPlant({ network: e.currentTarget.value })} disabled={!editor.project.networks?.length}>
            <option value="">{editor.project.networks?.length ? "None" : "No networks yet"}</option>
            {#each editor.project.networks ?? [] as n (n.id)}<option value={n.id}>{n.name || "(unnamed)"}{n.protocol ? ` · ${n.protocol}` : ""}</option>{/each}
          </select>
        </label>
      {/if}
      <label>Enabled by
        <input value={plant.enabledBy ?? ""} placeholder="e.g. ventilation time zone" onchange={(e) => setPlant({ enabledBy: e.currentTarget.value })} />
      </label>
      <label>Source
        <input value={plant.source ?? ""} placeholder="Where in the client's document it's from" onchange={(e) => setPlant({ source: e.currentTarget.value })} />
      </label>

      <div class="section">Interlocks{plant.interlocks?.length ? ` (${plant.interlocks.length})` : ""}</div>
      {#each plant.interlocks ?? [] as il (il.id)}
        {@const st = ilStatus.get(il.id)}
        <div class="interlock">
          <div class="line">
            <select value={il.point} aria-label="Point" onchange={(e) => editor.apply((p) => updateInterlock(p, plant.id, il.id, { point: e.currentTarget.value }))}>
              {#each (plant.points ?? []).filter((q) => interlockable(q.form)) as q (q.name)}<option value={q.name}>{q.name}</option>{/each}
            </select>
            <span class="never">never on while</span>
            {#if il.when.length > 1}
              <!-- Several conditions (v0.4.x T1): all of them together, or any one. -->
              <select class="state" value={il.join ?? "or"} aria-label="All of or any of" title="All of: only while every condition holds (an exception: '…and the override is off'). Any of: while any one does." onchange={(e) => editor.apply((p) => updateInterlock(p, plant.id, il.id, { join: e.currentTarget.value as "and" | "or" }))}>
                <option value="and">all of</option>
                <option value="or">any of</option>
              </select>
            {/if}
            <button class="x" title="Remove this interlock and its expectation" onclick={() => editor.apply((p) => deleteInterlock(p, plant.id, il.id))}>×</button>
          </div>
          {#each il.when as c, ci (ci)}
            <div class="line">
              <select value={c.ref} aria-label="Condition" onchange={(e) => editor.apply((p) => updateInterlock(p, plant.id, il.id, { at: ci, when: { ref: e.currentTarget.value, on: c.on } }))}>
                {#if !tablePoints.some((t) => t.ref === c.ref)}<option value={c.ref}>(missing)</option>{/if}
                {#each tablePoints.filter((t) => t.ref !== `plant:${plant.id}:${il.point}`) as t (t.ref)}<option value={t.ref}>{t.name}</option>{/each}
              </select>
              <select class="state" value={c.on ? "1" : "0"} aria-label="On or off" onchange={(e) => editor.apply((p) => updateInterlock(p, plant.id, il.id, { at: ci, when: { ref: c.ref, on: e.currentTarget.value === "1" } }))}>
                <option value="1">on</option>
                <option value="0">off</option>
              </select>
              {#if il.when.length > 1}<button class="x" title="Take this condition off" onclick={() => editor.apply((p) => removeInterlockCondition(p, plant.id, il.id, ci))}>×</button>{/if}
            </div>
          {/each}
          {#if il.when.length < MAX_CONDITIONS}
            <button class="link" onclick={() => addCondition(il.id, il.point)} title="Another condition: any of them, or all of them together">+ Condition</button>
          {/if}
          <div class="ilst {st?.kind ?? ''}">
            {#if st?.kind === "proved"}✓ Proved: the drawing can't break it
            {:else if st?.kind === "fails"}Not proved: it fails. Check logic in Simulate shows how
            {:else if st?.kind === "never-on"}Never on: is it powered? Its point can't come on, so this proves nothing
            {:else if st?.kind === "not-drawn"}Not proved yet: {st.what} isn't drawn
            {:else if st?.kind === "unknown"}Not proved: too many sequences to try them all
            {:else if st?.kind === "unchecked"}Not proved yet: Prove, or Check logic in Simulate{/if}
          </div>
        </div>
      {/each}
      {#if editor.proving}
        <div class="proving">Proving {editor.proving.done + 1} of {editor.proving.total}… <button onclick={() => editor.cancelProving()}>Cancel</button></div>
      {:else if [...ilStatus.values()].some((s) => s.kind === "unchecked")}
        <button onclick={prove} title="Try every sequence that can affect them, as Check logic in Simulate does">Prove</button>
      {/if}
      {#if (plant.points ?? []).some((q) => interlockable(q.form)) && tablePoints.length > 1}
        <button onclick={newInterlock} title="This plant's point is never on while a condition holds: a hardwired interlock, proved in Simulate">+ Interlock</button>
      {:else if !plant.interlocks?.length}
        <p class="hint">An interlock needs a point on this plant and another in the table.</p>
      {/if}

      <label>Information (under its box on the drawing)
        <textarea rows="2" value={plant.info ?? ""} placeholder="Model, rating, supply…" onchange={(e) => editor.apply((p) => updatePlant(p, plant.id, { info: e.currentTarget.value }))}></textarea>
      </label>
      <label class="tick"><input type="checkbox" checked={plant.powerByOthers === true} onchange={(e) => editor.apply((p) => updatePlant(p, plant.id, { powerByOthers: e.currentTarget.checked }))} /> Power by others (its power isn't on these drawings)</label>

      <div class="section">Points ({plant.points?.length ?? 0})</div>
      {#each plant.points ?? [] as pt (pt.name)}
        {@const t = pointType(pt.form)}
        <div class="point" class:picked={pick.point === pt.name}>
          <div class="line">
            <input class="pname" value={pt.name} onchange={(e) => setPoint(pt.name, { name: e.currentTarget.value })} aria-label="Point name" />
            {#if t}<TypeBadge type={t} />{/if}
            <button class="x" title="Delete this point" onclick={() => editor.apply((p) => deleteDesignPoint(p, plant.id, pt.name))}>×</button>
          </div>
          <div class="line">
            <select value={pt.form} onchange={(e) => setPoint(pt.name, { form: e.currentTarget.value as PointForm })} aria-label="Form" title="From the plant's side: a fault is a contact; an enable a powered or dry input">
              {#each POINT_FORMS as f (f.value)}<option value={f.value} title={f.hint}>{f.label}</option>{/each}
            </select>
            <input value={pt.signal ?? ""} list="ferrule-signals" placeholder="Signal" aria-label="Signal" onchange={(e) => setPoint(pt.name, { signal: e.currentTarget.value })} />
          </div>
          {#if t}
            <div class="line">
              <select value={goesTo(pt)} onchange={(e) => setPoint(pt.name, { goesTo: e.currentTarget.value as PointDesign["goesTo"] })} aria-label="Goes to">
                {#each GOES_TO as g (g.value)}<option value={g.value} title={g.hint}>{g.label}</option>{/each}
              </select>
              {#if goesTo(pt) !== "panel"}<ChannelSelect {editor} {plant} point={pt} />{/if}
            </div>
          {/if}
          {#if pt.form === "supply-out" || pt.form === "powered-out"}
            <div class="line"><label class="supply">Gives <input value={pt.gives ? formatSupply(pt.gives) : ""} list="ferrule-supplies" placeholder="e.g. 24 V DC" onchange={(e) => setPoint(pt.name, { gives: e.currentTarget.value })} title="What it supplies; Check compares it with what its loads take" /></label></div>
          {:else if pt.form === "supply-in" || pt.form === "powered-in"}
            <div class="line"><label class="supply">Takes <input value={pt.accepts ? formatSupplies(pt.accepts) : ""} list="ferrule-supplies" placeholder="e.g. 24 V AC, 24 V DC" onchange={(e) => setPoint(pt.name, { accepts: e.currentTarget.value })} title="What supply it takes; two, comma between, for either" /></label></div>
          {/if}
          <div class="pins">{pt.pins.length ? `Pins ${pt.pins.map((x) => printedPin(x, pt.name)).join(" ")}` : "No pins yet"}</div>
          {#if pt.channel}
            {@const w = wiringOf(editor.project, plant, pt)}
            <div class="wired {w.kind}">
              {#if w.kind === "direct"}✓ Wired straight to its channel
              {:else if w.kind === "via"}✓ Wired to its channel via {w.relay}
              {:else if w.kind === "confirmed"}✓ Wired: confirmed by hand <button class="link" onclick={() => editor.apply((p) => confirmWiring(p, plant.id, pt.name, false))}>Undo</button>
              {:else if w.kind === "review"}Not wired straight to its channel: check the drawing <button onclick={() => editor.apply((p) => confirmWiring(p, plant.id, pt.name))}>Confirm by hand</button>
              {:else if w.kind === "not-drawn"}Not drawn yet: its wiring is checked once it and its channel are on a sheet{/if}
            </div>
          {/if}
        </div>
      {/each}
      <label title="Each point and its pins, | between: enable: 1 2 | fault: 11 14. Points not listed keep what they have">Pins, from the datasheet
        <input class="mono" value={formatQuickEntry(plant)} placeholder={plant.points?.length ? "None yet: given here, or when it's placed" : "e.g. Mains: L N E | Run: 1 2"}
          onchange={(e) => editor.apply((p) => setQuickEntry(p, plant.id, e.currentTarget.value))} />
      </label>
      {#if editor.designAdding}
        <form class="point add" onsubmit={addPoint}>
          <div class="line">
            <input bind:this={nameInput} bind:value={newName} placeholder="Name: fault, enable, flow…" aria-label="New point's name" />
          </div>
          <div class="line">
            <select bind:value={newForm} aria-label="New point's form">
              {#each POINT_FORMS as f (f.value)}<option value={f.value} title={f.hint}>{f.label}</option>{/each}
            </select>
            <input bind:value={newSignal} list="ferrule-signals" placeholder="Signal" aria-label="New point's signal" />
          </div>
          <div class="line"><button type="submit">Add point</button><button type="button" onclick={() => (editor.designAdding = false)}>Done</button></div>
        </form>
      {:else}
        <button onclick={() => (editor.designAdding = true)}>+ Point</button>
      {/if}
      <div class="actions"><button onclick={() => (editor.open.designDuplicate = true)}>Duplicate ×n…</button><button class="danger" onclick={removePlant}>Delete</button></div>
    {:else if many.length > 1}
      <div class="who"><strong>{many.length} plant picked</strong><span class="hint">{many.map(plantLabel).join(", ")}</span></div>
      <label>Move to system
        <select value="" onchange={(e) => moveTo(e.currentTarget.value)}>
          <option value="" disabled>Choose…</option>
          <option value="">No system</option>
          {#each systems as s (s)}<option value={s}>{s}</option>{/each}
        </select>
      </label>
      <div class="actions"><button onclick={() => (editor.open.designDuplicate = true)}>Duplicate ×n…</button><button onclick={() => (editor.open.designTemplates = true)}>Save as template…</button><button class="danger" onclick={removePlant}>Delete</button></div>
    {:else if pick.system}
      {@const name = pick.system}
      <div class="who"><strong>{name}</strong><span class="hint">System · {editor.project.plant.filter((p) => !p.module && p.system === name).length} plant</span></div>
      <label>Name
        <input
          value={name}
          onchange={(e) => {
            const to = e.currentTarget.value.trim();
            if (editor.apply((p) => renameSystem(p, name, to))) editor.designPick = { plant: [], system: to };
          }}
        />
      </label>
      <div class="actions">
        <button onclick={() => editor.apply((p) => moveSystem(p, name, -1))} disabled={systems.indexOf(name) <= 0}>Move up</button>
        <button onclick={() => editor.apply((p) => moveSystem(p, name, 1))} disabled={systems.indexOf(name) >= systems.length - 1}>Move down</button>
        <button class="danger" title="Its plant stays, with no system" onclick={() => {
          editor.apply((p) => deleteSystem(p, name));
          editor.designPick = { plant: [] };
        }}>Delete system</button>
      </div>
    {:else}
      <p class="hint">Pick a row to see it here. A system is a name that groups plant; plant is a row with its points. Nothing is drawn in Design: Draft draws what's listed here.</p>
    {/if}
  </div>
  <datalist id="ferrule-supplies">{#each SUPPLY_CHOICES as s (s)}<option value={s}></option>{/each}</datalist>
  <datalist id="ferrule-signals">{#each SIGNAL_SUGGESTIONS as s (s)}<option value={s}></option>{/each}</datalist>
  <datalist id="ferrule-protocols"><option value="BACnet IP"></option><option value="BACnet MS/TP"></option><option value="Modbus RTU"></option><option value="Modbus TCP"></option><option value="M-Bus"></option></datalist>
</div>

<style>
  .dprops {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
    background: #fff;
    border: 1px solid #dde1e5;
    border-radius: 6px;
  }
  .head {
    padding: 8px 12px;
    border-bottom: 1px solid #e3e6e9;
  }
  .title {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #334;
  }
  .body {
    overflow: auto;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .who {
    display: flex;
    flex-direction: column;
  }
  .who strong {
    font-size: 16px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
    color: #556;
  }
  label.tick {
    flex-direction: row;
    align-items: center;
    gap: 6px;
  }
  textarea {
    font: inherit;
    font-size: 13px;
    resize: vertical;
  }
  .mono {
    font-family: ui-monospace, Consolas, monospace;
  }
  .section {
    margin-top: 6px;
    font-size: 12px;
    color: #556;
    border-top: 1px solid #eef0f2;
    padding-top: 8px;
  }
  .point {
    border: 1px solid #e3e6e9;
    border-radius: 5px;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .point.picked {
    border-color: #1e6ee6;
    background: #f5f8fe;
  }
  .line {
    display: flex;
    gap: 4px;
    align-items: center;
  }
  .line input,
  .line select {
    flex: 1;
    min-width: 0;
  }
  .pname {
    font-weight: 600;
  }
  .x {
    border: none;
    background: none;
    color: #a00;
    padding: 0 4px;
  }
  .pins {
    font-size: 11px;
    color: #889;
  }
  .interlock {
    border: 1px solid #e3e6e9;
    border-radius: 5px;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .never {
    font-size: 12px;
    color: #556;
    white-space: nowrap;
  }
  .state {
    flex: none !important;
    width: 5em;
  }
  .supply {
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: 12px;
    color: #556;
  }
  .proving {
    font-size: 12px;
    color: #556;
  }
  .ilst {
    font-size: 12px;
    color: #667;
  }
  .ilst.proved {
    color: #1d6b2c;
  }
  .ilst.fails {
    color: #b00;
  }
  .ilst.never-on {
    color: #b36b00;
  }
  .wired {
    font-size: 12px;
    color: #667;
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }
  .wired.direct,
  .wired.via,
  .wired.confirmed {
    color: #1d6b2c;
  }
  .wired.review {
    color: #a60;
  }
  .wired button {
    font-size: 12px;
    padding: 1px 6px;
  }
  .actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-top: 6px;
  }
  .hint {
    font-size: 12px;
    color: #778;
  }
</style>
