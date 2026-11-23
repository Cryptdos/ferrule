<script lang="ts">
  /**
   * A workbench or menu button (design-v0.3 §8): its name, its name with an
   * icon, or the icon alone, as the Buttons setting says. With the icon
   * alone, its name leads the hover text.
   */
  import type { IconName } from "../icons";
  import { settings } from "../settings.svelte";
  import Icon from "./Icon.svelte";

  let {
    icon,
    label,
    title = "",
    active = false,
    disabled = false,
    onclick,
  }: { icon: IconName; label: string; title?: string; active?: boolean; disabled?: boolean; onclick: () => void } = $props();

  const mode = $derived(settings.buttons);
  const hover = $derived(mode === "icons" ? (title ? `${label}: ${title}` : label) : title);
</script>

<button class="lb" class:active class:iconly={mode === "icons"} {disabled} title={hover} aria-label={label} {onclick}>
  {#if mode !== "labels"}<Icon name={icon} size={17} />{/if}
  {#if mode !== "icons"}<span>{label}</span>{/if}
</button>

<style>
  .lb {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .lb.iconly {
    padding-left: 6px;
    padding-right: 6px;
  }
</style>
