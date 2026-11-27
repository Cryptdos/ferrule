<script lang="ts">
  /**
   * `+ Module ▾` (v0.5 A67, design-design-workbench §6): a type and a channel
   * count, a module saved before as a device, or a spare slot, added at the
   * end of the rail. Every module is added here.
   */
  import { addModule, addModuleFromDevice, addSpareSlot } from "../../core/controllers";
  import { MODULE_TYPES } from "../../core/modules";
  import type { ModuleType } from "../../core/model";
  import type { Editor } from "../editor.svelte";
  import { deviceLibrary } from "../devices.svelte";

  let { editor }: { editor: Editor } = $props();

  let open = $state(false);
  /** Where the menu opens: under the button, fixed, so the toolbar doesn't clip it. */
  let at = $state({ x: 0, y: 0 });
  let btn: HTMLButtonElement | undefined = $state();
  function toggle() {
    if (!open && btn) {
      const r = btn.getBoundingClientRect();
      at = { x: r.left, y: r.bottom + 4 };
    }
    open = !open;
  }
  let channels = $state(8);
  const ctrl = $derived(editor.project.controllers?.[0]);
  const useLib = $derived(editor.project.useDeviceLibrary !== false);
  $effect(() => {
    if (open && useLib) void deviceLibrary.load();
  });
  /** Modules saved before as devices: this project's, then the shared library's. */
  const saved = $derived([
    ...(editor.project.devices ?? []).filter((d) => d.module).map((d) => ({ value: d.id, label: d.name })),
    ...(useLib ? deviceLibrary.list.filter((d) => d.module && !editor.project.devices?.some((m) => m.id === d.id)).map((d) => ({ value: `lib:${d.id}`, label: `${d.name} (library)` })) : []),
  ]);

  function pickNew(id: string) {
    editor.designPick = { plant: [id] };
    open = false;
  }
  function add(type: ModuleType) {
    if (!ctrl) return;
    const c = ctrl.id;
    const n = channels;
    let id = "";
    if (editor.apply((p) => (id = addModule(p, c, { type, channels: n, pattern: type === "host" ? null : undefined }).id))) pickNew(id);
  }
  function addSaved(value: string) {
    if (!ctrl) return;
    const c = ctrl.id;
    const lib = value.startsWith("lib:") ? deviceLibrary.get(value.slice(4)) : undefined;
    let id = "";
    if (editor.apply((p) => (id = addModuleFromDevice(p, c, lib ?? p.devices!.find((d) => d.id === value)!).id))) pickNew(id);
  }
  function spare() {
    if (!ctrl) return;
    const c = ctrl.id;
    if (editor.apply((p) => addSpareSlot(p, c))) {
      editor.designPick = { plant: [], controller: c, slot: (editor.project.controllers?.[0]?.slots.length ?? 1) - 1 };
      open = false;
    }
  }
</script>

<div class="wrap">
  <button bind:this={btn} class:active={open} disabled={!ctrl} onclick={toggle} title={ctrl ? "Add a module at the end of the rail" : "Add the controller first"}>+ Module ▾</button>
  {#if open && ctrl}
    <div class="menu" role="menu" style:left="{at.x}px" style:top="{at.y}px">
      <div class="sub">A type</div>
      <label class="count">Channels <input type="number" min="1" max="64" bind:value={channels} /></label>
      {#each MODULE_TYPES as t (t.value)}
        <button class="item" onclick={() => add(t.value)}>{t.label}{t.channels ? ` × ${channels}` : ""}</button>
      {/each}
      {#if saved.length}
        <div class="sub">Saved as a device</div>
        {#each saved as d (d.value)}<button class="item" onclick={() => addSaved(d.value)}>{d.label}</button>{/each}
      {/if}
      <div class="sub"></div>
      <button class="item" onclick={spare} title="A slot left for later: drawn dashed on the controller map">Spare slot</button>
    </div>
  {/if}
</div>
<svelte:window onkeydown={(e) => e.key === "Escape" && (open = false)} />

<style>
  .wrap {
    position: relative;
    display: inline-block;
  }
  .menu {
    position: fixed;
    z-index: 50;
    min-width: 230px;
    background: #fff;
    border: 1px solid #ccd2d8;
    border-radius: 6px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .sub {
    font-size: 11px;
    color: #778;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 6px 4px 2px;
    border-top: 1px solid #eef0f2;
    padding-top: 4px;
  }
  .sub:first-child {
    border-top: none;
    margin-top: 0;
  }
  .item {
    text-align: left;
    border: none;
    background: none;
    padding: 4px 8px;
    border-radius: 4px;
  }
  .item:hover {
    background: #eef3fb;
  }
  .count {
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: 12px;
    color: #556;
    padding: 0 8px 4px;
  }
  .count input {
    width: 4em;
  }
</style>
