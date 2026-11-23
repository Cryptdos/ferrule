<script lang="ts">
  /**
   * A core colour picked from the list (`WIRE_COLOURS`) or None: the same
   * select for a wire and a distribution. A colour from a file that isn't on
   * the list is kept and shown as typed until it's changed.
   */
  import { WIRE_COLOURS } from "../../core/wirecolours";

  let {
    value,
    onchange,
    title,
  }: { value: string | undefined; onchange: (code: string) => void; title?: string } = $props();

  const odd = $derived(!!value && !WIRE_COLOURS.some((c) => c.code === value));
</script>

<select value={value ?? ""} {title} onchange={(e) => onchange(e.currentTarget.value)}>
  <option value="">None</option>
  {#each WIRE_COLOURS as c (c.code)}
    <option value={c.code}>{c.code} {c.name}</option>
  {/each}
  {#if odd}
    <option value={value}>(as typed: {value})</option>
  {/if}
</select>
