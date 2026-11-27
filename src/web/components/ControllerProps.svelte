<script lang="ts">
  /**
   * Properties in the Controller view (v0.5 A67, design-design-workbench §4,
   * §6): the controller, a module on the rail, a spare slot, or a channel or
   * point of a module. Everything about a module that isn't a terminal is
   * here; its terminals are in the Terminals window.
   */
  import { allocate, channelLabel, channelTypes, pointOnChannel } from "../../core/design";
  import { deleteController, moveSlot, removeSlot, saveModuleDevice, setModuleCommons, setModuleVa, setSlotAddress, sharedPins, updateController, updateModule } from "../../core/controllers";
  import { isOutputForm, pointRef, printedPin, things } from "../../core/points";
  import { MODULE_TYPES, controllerTag, moduleType, moduleTypeName, slotAddress, viewsOf } from "../../core/modules";
  import { POINT_FORMS, type ModuleType, type PointForm } from "../../core/model";
  import { plantLabel, updatePoint } from "../../core/ops";
  import type { Editor } from "../editor.svelte";
  import Conditions from "./Conditions.svelte";
  import TypeBadge from "./TypeBadge.svelte";

  let { editor }: { editor: Editor } = $props();

  const pick = $derived(editor.designPick);
  const ctrl = $derived(editor.project.controllers?.find((c) => c.id === pick.controller) ?? editor.project.controllers?.[0]);
  const module = $derived(pick.plant.length === 1 ? editor.project.plant.find((p) => p.id === pick.plant[0] && p.module) : undefined);
  const slotIndex = $derived(module && ctrl ? ctrl.slots.findIndex((s) => s.module === module.id) : pick.slot ?? -1);
  const point = $derived(module && pick.point ? module.points?.find((q) => q.name === pick.point) : undefined);
  const list = $derived(things(editor.project));
  const device = $derived(module?.device ? editor.project.devices?.find((d) => d.id === module.device) : undefined);

  const move = (by: number) => {
    if (!ctrl || slotIndex < 0) return;
    const c = ctrl.id;
    const i = slotIndex;
    editor.apply((p) => moveSlot(p, c, i, i + by));
    if (!module) editor.designPick = { plant: [], controller: c, slot: i + by };
  };
  function removeModule() {
    if (!ctrl || !module || slotIndex < 0) return;
    const c = ctrl.id;
    const i = slotIndex;
    if (!confirm(`Delete ${plantLabel(module)} and every view of it?`)) return;
    if (editor.apply((p) => removeSlot(p, c, i))) editor.designPick = { plant: [] };
  }
  const setPoint = (name: string, patch: Parameters<typeof updatePoint>[3]) => {
    if (!module) return;
    const id = module.id;
    if (editor.apply((p) => updatePoint(p, id, name, patch)) && patch.name) editor.designPick = { plant: [id], point: patch.name.trim() };
  };
</script>

{#if module && point && ctrl}
  {@const types = channelTypes(module, point)}
  {@const on = pointOnChannel(editor.project, { module: module.id, point: point.name })}
  <div class="who">
    <strong>{point.name}</strong>
    <span class="hint">{types.length ? "Channel" : "Point"} of {plantLabel(module)} · {moduleTypeName(module.module!)}</span>
  </div>
  {#if types.length}
    <div class="line">Takes {#each types as t (t)}<TypeBadge type={t} />{/each}</div>
    {#if on}
      <div class="line">
        <span>{plantLabel(on.plant)} {on.point.name}</span>
        <button onclick={() => editor.apply((p) => allocate(p, on.plant.id, on.point.name, null))} title="Take the point off this channel">Unallocate</button>
      </div>
      <label>Label <input value={channelLabel(editor.project, module, point)} disabled title="It follows the point on this channel" /></label>
    {:else}
      <p class="hint">Spare: drag a point onto it from Unallocated.</p>
      <label>Label
        <input value={point.label ?? ""} placeholder="What it does on this job, e.g. SF-01 running" title="Printed along its wire under the module's terminals, and in the IO schedule" onchange={(e) => setPoint(point.name, { label: e.currentTarget.value })} />
      </label>
    {/if}
  {:else}
    <label>Name <input value={point.name} onchange={(e) => setPoint(point.name, { name: e.currentTarget.value })} /></label>
    <label>Form
      <select value={point.form} onchange={(e) => setPoint(point.name, { form: e.currentTarget.value as PointForm })}>
        {#if point.form === "none"}<option value="none" disabled>Choose its form…</option>{/if}
        {#each POINT_FORMS as f (f.value)}<option value={f.value}>{f.label}: {f.hint.toLowerCase()}</option>{/each}
      </select>
    </label>
  {/if}
  <div class="section">Terminals</div>
  <div class="line">
    <span class="grow">{point.pins.length ? point.pins.map((x) => printedPin(x, point.name)).join("  ") : "None yet"}</span>
    <button onclick={() => editor.openTerminals(module.id)}>Terminals…</button>
  </div>
  {#if !types.length && isOutputForm(point.form)}
    <div class="section">In Simulate</div>
    <label class="tick"><input type="radio" checked={!point.follows?.length} onchange={() => setPoint(point.name, { follows: null })} /> Clicked</label>
    <label class="tick">
      <input
        type="radio"
        checked={!!point.follows?.length}
        onchange={() => {
          const first = list.find((x) => x.ref !== pointRef(module.id, point.name));
          if (first) setPoint(point.name, { follows: [{ ref: first.ref, on: true }] });
        }}
      /> Follows
    </label>
    {#if point.follows?.length}
      <Conditions {list} value={point.follows} join={point.join ?? "and"} exclude={pointRef(module.id, point.name)} onchange={(v, join) => setPoint(point.name, { follows: v, join })} />
      <label class="row">after <input type="number" min="0" step="0.5" value={point.delay ?? 0} onchange={(e) => setPoint(point.name, { delay: Number(e.currentTarget.value) || 0 })} /> s</label>
    {/if}
  {/if}
{:else if module && ctrl}
  {@const m = module.module!}
  <div class="who">
    <strong>{plantLabel(module)} · {moduleTypeName(m)}</strong>
    <span class="hint">Module {slotIndex + 1} of {ctrl.slots.length} on the rail</span>
  </div>
  <label>Type
    <select value={m.type} onchange={(e) => editor.apply((p) => updateModule(p, module.id, { type: e.currentTarget.value as ModuleType }))}>
      {#each MODULE_TYPES as t (t.value)}<option value={t.value}>{t.label}</option>{/each}
    </select>
  </label>
  {#if moduleType(m.type).channels}
    <label>Channels
      <input type="number" min="1" max="64" value={m.channels ?? 8} title="The count: Generate in Terminals… makes its terminals" onchange={(e) => editor.apply((p) => updateModule(p, module.id, { channels: Number(e.currentTarget.value) }))} />
    </label>
  {/if}
  <label>Address
    <span class="row">
      <input
        type="number"
        min="1"
        max="255"
        value={slotAddress(editor.project, ctrl, slotIndex)}
        onchange={(e) => {
          const v = e.currentTarget.value;
          const c = ctrl.id;
          const i = slotIndex;
          editor.apply((p) => setSlotAddress(p, c, i, v === "" ? null : Number(v)));
        }}
      />
      <span class="hint">{m.address ? "set by hand: clear it for rail order" : "rail order"}</span>
    </span>
  </label>
  <div class="field"><span>Device</span><span>{device ? device.name : "None yet"} <button class="link" onclick={() => editor.showDevice(`plant:${module.id}`)} title="Its row in the Devices view, where its device is picked">Devices →</button></span></div>
  {#if sharedPins(module).length > 1}
    <label class="tick" title="Its commons (C, RET, 0 V) are joined inside the module, as its datasheet has it: one return carries them all, in Simulate and the wiring check, and its view shows the link">
      <input type="checkbox" checked={!!m.commons?.length} onchange={(e) => editor.apply((p) => setModuleCommons(p, module.id, e.currentTarget.checked))} /> Commons linked inside
    </label>
  {/if}
  <label title="Its expected draw from its data sheet, in VA; Simulate counts the controller's modules on its power supply module">Draw (VA)
    <input type="number" min="0" step="0.1" value={m.va ?? ""} placeholder="—" onchange={(e) => editor.apply((p) => setModuleVa(p, module.id, Number(e.currentTarget.value) || null))} />
  </label>
  <div class="field">
    <span>Drawn at</span>
    <span>
      {#each viewsOf(editor.project, module.id) as v, i (v.el.id)}{i ? ", " : ""}<button class="link" onclick={() => editor.goTo(v.el.id)}>sheet {v.page.number}, column {v.address.split("-")[1]}</button>{:else}not drawn yet{/each}
    </span>
  </div>
  <div class="actions">
    <button onclick={() => editor.openTerminals(module.id)}>Terminals…</button>
    {#if !module.device}
      <button title="Keep it as a device, its type, channels, terminals and points, so the next one is added whole from + Module" onclick={() => editor.apply((p) => void saveModuleDevice(p, module.id))}>Save as device</button>
    {/if}
    <button disabled={slotIndex <= 0} onclick={() => move(-1)}>← Move</button>
    <button disabled={slotIndex >= ctrl.slots.length - 1} onclick={() => move(1)}>Move →</button>
  </div>
  <div class="actions end"><button class="danger" onclick={removeModule}>Delete module</button></div>
{:else if ctrl && pick.slot !== undefined && ctrl.slots[pick.slot]?.spare}
  <div class="who"><strong>Spare slot</strong><span class="hint">Slot {pick.slot + 1} of {ctrl.slots.length}: drawn dashed on the controller map</span></div>
  <div class="actions">
    <button disabled={pick.slot <= 0} onclick={() => move(-1)}>← Move</button>
    <button disabled={pick.slot >= ctrl.slots.length - 1} onclick={() => move(1)}>Move →</button>
  </div>
  <div class="actions end">
    <button
      class="danger"
      onclick={() => {
        const c = ctrl.id;
        const i = pick.slot!;
        if (editor.apply((p) => removeSlot(p, c, i))) editor.designPick = { plant: [] };
      }}>Remove slot</button
    >
  </div>
{:else if ctrl && pick.controller}
  <div class="who"><strong>{controllerTag(editor.project, ctrl)} {ctrl.description || "Controller"}</strong><span class="hint">The panel's controller</span></div>
  <label>Description <input value={ctrl.description} placeholder="e.g. AHU-1 outstation" onchange={(e) => editor.apply((p) => updateController(p, ctrl.id, { description: e.currentTarget.value }))} /></label>
  <label title="The letters its modules' tags start with: A unless the project uses another">Prefix <input value={ctrl.prefix} onchange={(e) => editor.apply((p) => updateController(p, ctrl.id, { prefix: e.currentTarget.value }))} /></label>
  <div class="actions end">
    <button
      class="danger"
      onclick={() => {
        if (!confirm(`Delete ${controllerTag(editor.project, ctrl)} ${ctrl.description}, its modules and every view of them?`)) return;
        const c = ctrl.id;
        if (editor.apply((p) => deleteController(p, c))) editor.designPick = { plant: [] };
      }}>Delete controller</button
    >
  </div>
{:else}
  <p class="hint">Pick the controller's heading, a module on the rail or one of its channels to see it here.</p>
{/if}

<style>
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
  .row {
    display: flex;
    flex-direction: row;
    gap: 6px;
    align-items: center;
  }
  .row input {
    width: 5em;
  }
  .field {
    display: grid;
    grid-template-columns: 6em 1fr;
    gap: 6px;
    font-size: 12px;
    color: #556;
  }
  .field span:last-child {
    color: #223;
  }
  .line {
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: 13px;
  }
  .grow {
    flex: 1;
  }
  .section {
    margin-top: 6px;
    font-size: 12px;
    color: #556;
    border-top: 1px solid #eef0f2;
    padding-top: 8px;
  }
  .actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-top: 6px;
  }
  .actions.end {
    border-top: 1px solid #eef0f2;
    padding-top: 8px;
  }
  .hint {
    font-size: 12px;
    color: #778;
  }
  .link {
    border: none;
    background: none;
    color: #1e6ee6;
    padding: 0;
    cursor: pointer;
  }
</style>
