<script lang="ts">
  import type { Condition } from "../../core/model";
  import type { Thing } from "../../core/points";

  /**
   * Up to two plain conditions joined with and/or (controller.md §6): the one
   * condition language for expectations and for plant outputs that follow.
   */
  let {
    list,
    value,
    join = "and",
    onchange,
    exclude = "",
  }: {
    list: Thing[];
    value: Condition[];
    join?: "and" | "or";
    onchange: (v: Condition[], join: "and" | "or") => void;
    /** A ref not to offer (the point itself). */
    exclude?: string;
  } = $props();

  const options = $derived(list.filter((t) => t.ref !== exclude));
  const thing = (ref: string) => list.find((t) => t.ref === ref);
  const set = (i: number, patch: Partial<Condition>) => {
    const next = value.map((c, j) => (j === i ? { ...c, ...patch } : c));
    onchange(next, join);
  };
</script>

<div class="conds">
  {#each value as c, i (i)}
    {#if i > 0}
      <select class="join" value={join} onchange={(e) => onchange(value, e.currentTarget.value as "and" | "or")}>
        <option value="and">and</option>
        <option value="or">or</option>
      </select>
    {/if}
    <div class="row">
      <select value={c.ref} onchange={(e) => set(i, { ref: e.currentTarget.value })}>
        {#if !thing(c.ref)}<option value={c.ref}>(missing)</option>{/if}
        {#each options as t (t.ref)}<option value={t.ref}>{t.name}{t.page ? ` (sh ${t.page})` : ""}</option>{/each}
      </select>
      <select class="state" value={c.on ? "1" : "0"} onchange={(e) => set(i, { on: e.currentTarget.value === "1" })}>
        <option value="1">{thing(c.ref)?.onWord ?? "on"}</option>
        <option value="0">{thing(c.ref)?.offWord ?? "off"}</option>
      </select>
      <button class="x" title="Remove" onclick={() => onchange(value.filter((_, j) => j !== i), join)}>✕</button>
    </div>
  {/each}
  {#if value.length < 2 && options.length}
    <button class="add" onclick={() => onchange([...value, { ref: options[0]!.ref, on: true }], join)}>
      {value.length ? "+ and/or…" : "+ Condition"}
    </button>
  {/if}
</div>

<style>
  .conds {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .row {
    display: flex;
    gap: 4px;
    align-items: center;
  }
  .row select:first-child {
    flex: 1;
    min-width: 0;
  }
  .state {
    width: 7.5em;
  }
  .join {
    width: 4.5em;
    align-self: flex-start;
  }
  .x,
  .add {
    font-size: 11px;
    padding: 1px 6px;
  }
  .add {
    align-self: flex-start;
  }
</style>
