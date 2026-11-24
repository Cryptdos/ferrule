<script lang="ts">
  /**
   * The Needs line (design-v0.4 §2), always along the bottom of Design:
   * what the points need, what the controller has, and what's spare, a
   * shortfall in red. Before there's a controller it says how many
   * channels of each kind the panel needs.
   */
  import { needsLine } from "../../core/design";
  import type { Editor } from "../editor.svelte";

  let { editor }: { editor: Editor } = $props();
  const TYPES = ["DI", "DO", "AI", "AO"] as const;
  const n = $derived(needsLine(editor.project));
  const hasChannels = $derived(TYPES.some((t) => n.have[t]) || n.have.UIO > 0);
  const comms = $derived(editor.project.plant.filter((p) => !p.module && (p.connects === "comms" || p.connects === "both")));
  const nets = $derived(new Set(comms.map((p) => p.network).filter(Boolean)).size);
</script>

<div class="needs">
  <span class="k">Needs</span>
  <span>{TYPES.map((t) => `${t} ${n.needs[t]}`).join(" · ")}</span>
  {#if hasChannels}
    <span class="k">Have</span>
    <span>{TYPES.map((t) => `${t} ${n.have[t]}`).join(" · ")}{n.have.UIO ? ` · UIO ${n.have.UIO}` : ""}</span>
    <span class="k">Spare</span>
    {#each TYPES as t (t)}
      {#if n.spare[t] < 0}
        <span class="pill short" title="Not enough {t} channels for the points that need them">{t} short {-n.spare[t]}</span>
      {:else if n.have[t] || n.needs[t]}
        <span class="pill">{t} {n.spare[t]}</span>
      {/if}
    {/each}
    {#if n.have.UIO}<span class="pill" title="Universal channels left after covering any shortfall">UIO {n.spare.UIO}</span>{/if}
  {:else}
    <span class="hint">No controller yet: these are the channels the panel needs.</span>
  {/if}
  <span class="grow"></span>
  {#if comms.length}
    <span class="hint">Comms: {comms.length} device{comms.length === 1 ? "" : "s"}{nets ? ` on ${nets} network${nets === 1 ? "" : "s"}` : ""}</span>
  {/if}
</div>

<style>
  .needs {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    border-top: 1px solid #dde1e5;
    background: #f8f9fa;
    font-size: 13px;
    white-space: nowrap;
    overflow-x: auto;
  }
  .k {
    color: #667;
    margin-left: 10px;
  }
  .k:first-child {
    margin-left: 0;
  }
  .pill {
    padding: 1px 8px;
    border-radius: 10px;
    background: #e4f3e6;
    color: #1d6b2c;
  }
  .pill.short {
    background: #fbe3e3;
    color: #b00;
    font-weight: 600;
  }
  .hint {
    color: #667;
  }
  .grow {
    flex: 1;
  }
</style>
