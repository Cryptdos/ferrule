<script lang="ts">
  /**
   * Suggest… (design-v0.4 §4): a proposed allocation for the points still
   * to allocate. Untick a line, or pick another channel for it, then accept
   * what's ticked; or throw the proposal away. Nothing is allocated until
   * it's accepted, and it never runs by itself.
   */
  import { untrack } from "svelte";
  import { acceptSuggestion, channelTypes, pointType, suggestAllocation, type Proposed } from "../../core/design";
  import { plantLabel } from "../../core/ops";
  import type { Editor } from "../editor.svelte";
  import Modal from "./Modal.svelte";
  import TypeBadge from "./TypeBadge.svelte";

  let { editor, onclose }: { editor: Editor; onclose: () => void } = $props();

  /** The proposal, made once when the window opens: it doesn't change under you. */
  let lines: (Proposed & { keep: boolean })[] = $state(untrack(() => suggestAllocation(editor.project).map((l) => ({ ...l, keep: !!l.channel }))));

  const key = (m: string, c: string) => `${m}\u0000${c}`;
  const plantOf = (id: string) => editor.project.plant.find((p) => p.id === id);
  const pointOf = (l: Proposed) => plantOf(l.plant)?.points?.find((q) => q.name === l.point);
  const moduleTag = (id: string) => {
    const m = plantOf(id);
    return m ? plantLabel(m) : "?";
  };

  /** Channels a line could have: of its type, not on a point already, and not proposed for another line. */
  function options(l: Proposed): { module: string; point: string; label: string }[] {
    const pt = pointOf(l);
    const t = pt && pointType(pt.form);
    if (!t) return [];
    const busy = new Set<string>();
    for (const it of editor.project.plant) for (const p of it.points ?? []) if (p.channel) busy.add(key(p.channel.module, p.channel.point));
    for (const o of lines) if (o !== l && o.keep && o.channel) busy.add(key(o.channel.module, o.channel.point));
    const out: { module: string; point: string; label: string }[] = [];
    for (const c of editor.project.controllers ?? [])
      for (const s of c.slots) {
        const m = s.module ? plantOf(s.module) : undefined;
        if (!m?.module) continue;
        for (const ch of m.points ?? []) if (channelTypes(m, ch).includes(t) && !busy.has(key(m.id, ch.name))) out.push({ module: m.id, point: ch.name, label: `${plantLabel(m)} ${ch.name}` });
      }
    return out;
  }

  const kept = $derived(lines.filter((l) => l.keep && l.channel).length);
  const none = $derived(lines.filter((l) => !l.channel).length);

  function accept() {
    const take = lines.filter((l) => l.keep && l.channel).map(({ keep: _k, ...l }) => $state.snapshot(l) as Proposed);
    let n = 0;
    if (editor.apply((p) => (n = acceptSuggestion(p, take)))) {
      editor.flash(`${n} point${n === 1 ? "" : "s"} allocated from the suggestion`);
      onclose();
    }
  }
</script>

<Modal title="Suggest" store="design-suggest" width={620} {onclose}>
  <div class="body">
    <p class="hint">
      A proposal for the {lines.length} point{lines.length === 1 ? "" : "s"} still to allocate, in table order: each on the first free channel of its type in rail
      order, a module of its own type before a universal one. Untick a line or pick another channel, then accept what's ticked; or throw it away. Nothing is
      allocated until you accept.
    </p>
    {#if !lines.length}
      <p>Every point that goes to a channel has one already.</p>
    {:else}
      <div class="lines">
        {#each lines as l (l.plant + "\u0000" + l.point)}
          {@const pt = pointOf(l)}
          {@const t = pt && pointType(pt.form)}
          <div class="line" class:off={!l.keep}>
            <input type="checkbox" bind:checked={l.keep} disabled={!l.channel} aria-label="Keep this line" />
            <strong>{plantLabel(plantOf(l.plant)!)}</strong>
            <span>{l.point}</span>
            {#if t}<TypeBadge type={t} />{/if}
            <span class="arrow">→</span>
            {#if l.channel}
              <select
                value={key(l.channel.module, l.channel.point)}
                onchange={(e) => {
                  const [module, point] = e.currentTarget.value.split("\u0000");
                  l.channel = { module: module!, point: point! };
                  l.keep = true;
                }}
                aria-label="Channel"
              >
                <option value={key(l.channel.module, l.channel.point)}>{moduleTag(l.channel.module)} {l.channel.point}</option>
                {#each options(l).filter((o) => !(o.module === l.channel!.module && o.point === l.channel!.point)) as o (key(o.module, o.point))}<option value={key(o.module, o.point)}>{o.label}</option>{/each}
              </select>
            {:else}
              <span class="none">no free channel of its type</span>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
    <div class="buttons">
      <span class="hint">{kept} to allocate{none ? ` · ${none} with no room` : ""}</span>
      <button onclick={onclose}>Throw away</button>
      <button class="primary" disabled={!kept} onclick={accept}>Accept ticked</button>
    </div>
  </div>
</Modal>

<style>
  .body {
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .lines {
    max-height: 50vh;
    overflow: auto;
    border: 1px solid #e3e6e9;
    border-radius: 4px;
  }
  .line {
    display: grid;
    grid-template-columns: 1.5em 7em 1fr auto 1.5em 11em;
    gap: 6px;
    align-items: center;
    padding: 3px 8px;
    border-bottom: 1px solid #f0f1f3;
    font-size: 13px;
  }
  .line.off {
    opacity: 0.55;
  }
  .arrow {
    color: #889;
    text-align: center;
  }
  .none {
    color: #b00;
    font-size: 12px;
  }
  .buttons {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .buttons .hint {
    flex: 1;
  }
  .hint {
    font-size: 12px;
    color: #667;
    margin: 0;
  }
  .primary {
    background: #1e6ee6;
    border-color: #1e6ee6;
    color: #fff;
  }
</style>
