<script lang="ts">
  /**
   * A point's channel, picked by hand (design-v0.4 §4): only channels that
   * can take it and are free are offered. Nothing is allocated for you.
   */
  import { allocate, channelText, channelsFor } from "../../core/design";
  import type { IoPoint, PlantItem } from "../../core/model";
  import { plantLabel } from "../../core/ops";
  import type { Editor } from "../editor.svelte";

  let { editor, plant, point, compact = false }: { editor: Editor; plant: PlantItem; point: IoPoint; compact?: boolean } = $props();

  const key = (m: string, c: string) => `${m}\u0000${c}`;
  const options = $derived(channelsFor(editor.project, point));
  const value = $derived(point.channel ? key(point.channel.module, point.channel.point) : "");

  function pick(v: string) {
    const [module, ch] = v ? v.split("\u0000") : [];
    editor.apply((p) => allocate(p, plant.id, point.name, module && ch ? { module, point: ch } : null));
  }
</script>

<select
  class:compact
  class:none={!point.channel}
  {value}
  title={point.channel ? `On ${channelText(editor.project, point.channel)}` : options.length ? "Pick a channel for it" : "No free channel can take it"}
  onclick={(e) => e.stopPropagation()}
  onchange={(e) => pick(e.currentTarget.value)}
  aria-label="Channel"
>
  <option value="">{options.length || point.channel ? "—" : "no channel"}</option>
  {#each options as o (key(o.module.id, o.channel.name))}
    <option value={key(o.module.id, o.channel.name)}>{plantLabel(o.module)} {o.channel.name}</option>
  {/each}
</select>

<style>
  select.compact {
    padding: 1px 2px;
    font-size: 12px;
    border-color: transparent;
    background: transparent;
    max-width: 11em;
  }
  select.compact:hover,
  select.compact:focus {
    border-color: #b9c0c6;
    background: #fff;
  }
  select.none {
    color: #889;
  }
</style>
