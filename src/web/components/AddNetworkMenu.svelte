<script lang="ts">
  /**
   * `+ Network ▾` (v0.5 A65): the kind is the first thing chosen, as
   * `+ Module ▾` offers types, so a bus isn't made as a LAN and remade.
   */
  import { addNetwork } from "../../core/network";
  import { fixedAt } from "../fixedat";
  import type { Editor } from "../editor.svelte";

  let { editor }: { editor: Editor } = $props();

  const KINDS: { kind: "lan" | "bus"; label: string; hint: string }[] = [
    { kind: "lan", label: "LAN, off a switch", hint: "BACnet IP and the like: plant on an Ethernet switch" },
    { kind: "bus", label: "Bus, off the controller", hint: "Modbus RTU and the like: a serial bus from one of the controller's ports" },
  ];
  let open = $state(false);
  let at = $state({ x: 0, y: 0 });
  let btn: HTMLButtonElement | undefined = $state();
  function toggle() {
    if (!open && btn) {
      const r = btn.getBoundingClientRect();
      at = { x: r.left, y: r.bottom + 4 };
    }
    open = !open;
  }
  function add(kind: "lan" | "bus") {
    let id = "";
    if (editor.apply((p) => (id = addNetwork(p, kind).id))) editor.networkPick = id;
    open = false;
  }
</script>

<div class="wrap">
  <button bind:this={btn} class:active={open} onclick={toggle} title="A network comms plant can be on: pick its kind first">+ Network ▾</button>
  {#if open}
    <div class="menu" role="menu" use:fixedAt={at}>
      {#each KINDS as k (k.kind)}
        <button class="item" onclick={() => add(k.kind)} title={k.hint}>{k.label}</button>
      {/each}
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
    min-width: 200px;
    background: #fff;
    border: 1px solid #ccd2d8;
    border-radius: 6px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
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
</style>
