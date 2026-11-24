<script lang="ts">
  /**
   * The Controller view (design-v0.4 §4): the panel's controller, its
   * modules in rail order with each channel and the point on it, and the
   * points still to allocate. A point goes on a channel when you drag it
   * there (or pick the channel in the table); nothing is allocated for you,
   * and a channel only takes a point of a type it serves.
   */
  import { allocate, channelTypes, noChannelReason, pointOnChannel, pointType, unallocated, type IoType } from "../../core/design";
  import { addController } from "../../core/controllers";
  import type { PlantItem } from "../../core/model";
  import { controllerTag, moduleTypeName, modulesOf } from "../../core/modules";
  import { plantLabel } from "../../core/ops";
  import type { Editor } from "../editor.svelte";
  import TypeBadge from "./TypeBadge.svelte";

  let { editor }: { editor: Editor } = $props();

  const controllers = $derived(editor.project.controllers ?? []);
  const left = $derived(unallocated(editor.project));
  const pick = $derived(editor.designPick);
  const picked = $derived.by(() => {
    const plant = pick.plant.length === 1 ? editor.project.plant.find((p) => p.id === pick.plant[0]) : undefined;
    const point = plant?.points?.find((q) => q.name === pick.point);
    return plant && point ? { plant, point } : undefined;
  });
  const pickedReason = $derived(picked && !picked.point.channel ? noChannelReason(editor.project, picked.point) : undefined);

  /** The point being dragged, and the type it needs: channels that can't take it don't light up. */
  let dragging: { plant: string; point: string; type: IoType } | null = $state(null);
  let over: string | null = $state(null);

  function startDrag(e: DragEvent, plant: PlantItem, name: string) {
    const point = plant.points?.find((q) => q.name === name);
    const type = point && pointType(point.form);
    if (!type) return;
    dragging = { plant: plant.id, point: name, type };
    e.dataTransfer?.setData("text/plain", `${plantLabel(plant)} ${name}`);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    editor.designPick = { plant: [plant.id], point: name };
  }

  const key = (m: string, c: string) => `${m}\u0000${c}`;
  function canTake(module: PlantItem, ch: string): boolean {
    if (!dragging) return false;
    const channel = module.points?.find((q) => q.name === ch);
    if (!channel || !channelTypes(module, channel).includes(dragging.type)) return false;
    const on = pointOnChannel(editor.project, { module: module.id, point: ch });
    return !on || (on.plant.id === dragging.plant && on.point.name === dragging.point);
  }
  function drop(module: PlantItem, ch: string) {
    const d = dragging;
    dragging = null;
    over = null;
    if (d) editor.apply((p) => allocate(p, d.plant, d.point, { module: module.id, point: ch }));
  }
  function dropBack() {
    const d = dragging;
    dragging = null;
    if (d) editor.apply((p) => allocate(p, d.plant, d.point, null));
  }

  function newController() {
    editor.apply((p) => void addController(p, "Panel controller"));
  }
</script>

<div class="cview">
  <div
    class="panel left"
    role="list"
    ondragover={(e) => dragging && e.preventDefault()}
    ondrop={(e) => {
      e.preventDefault();
      dropBack();
    }}
  >
    <div class="head"><span class="title">Unallocated ({left.length})</span></div>
    <div class="scroll">
      {#each left as u (u.plant.id + "\u0000" + u.point.name)}
        {@const t = pointType(u.point.form)}
        {@const why = noChannelReason(editor.project, u.point)}
        <div
          class="pt"
          role="button"
          tabindex="0"
          class:picked={picked?.plant === u.plant && picked.point === u.point}
          class:stuck={!!why}
          draggable={!why}
          ondragstart={(e) => startDrag(e, u.plant, u.point.name)}
          ondragend={() => ((dragging = null), (over = null))}
          onclick={() => (editor.designPick = { plant: [u.plant.id], point: u.point.name })}
          onkeydown={(e) => e.key === "Enter" && (editor.designPick = { plant: [u.plant.id], point: u.point.name })}
          title={why ? `No channel takes it: ${why}` : "Drag it onto a channel"}
        >
          <strong>{plantLabel(u.plant)}</strong>
          <span>{u.point.name}{#if u.point.signal}<span class="dim"> · {u.point.signal}</span>{/if}</span>
          {#if t}<TypeBadge type={t} />{/if}
        </div>
      {/each}
      {#if !left.length}<p class="hint">Every point that goes to a channel has one.</p>{/if}
      {#if picked && pickedReason}
        <p class="err">No channel takes {plantLabel(picked.plant)} {picked.point.name}: {pickedReason}.</p>
      {/if}
      <p class="hint">
        Drag a point onto a channel, or pick the channel in the table. Drag one back here to take it off. Nothing is allocated for you, and a channel only takes a point
        of a type it serves (a universal channel takes any).
      </p>
    </div>
  </div>

  <div class="panel main">
    {#if !controllers.length}
      <div class="head"><span class="title">Controller</span></div>
      <div class="empty">
        <p>This panel has no controller yet. A panel has one: anything outside it is plant.</p>
        <button onclick={newController}>Add the controller</button>
        <p class="hint">Then add its modules in rail order with <strong>Controller…</strong>.</p>
      </div>
    {/if}
    {#each controllers as c (c.id)}
      {@const mods = modulesOf(editor.project, c)}
      <div class="head">
        <span class="title">{controllerTag(editor.project, c)} {c.description || "Controller"}</span>
        <span class="hint">{mods.length} module{mods.length === 1 ? "" : "s"} in rail order{controllers.length > 1 ? " · a file from before v0.4 with more than one controller" : ""}</span>
      </div>
      <div class="mods">
        {#each mods as m (m.id)}
          {@const chans = (m.points ?? []).filter((q) => channelTypes(m, q).length)}
          {#if chans.length}
            {@const used = chans.filter((q) => pointOnChannel(editor.project, { module: m.id, point: q.name })).length}
            <div class="mod">
              <div class="mhead"><span><strong>{plantLabel(m)}</strong> {moduleTypeName(m.module!)}{m.module?.model ? ` · ${m.module.model}` : ""}</span><span class="dim">{used} of {chans.length} used</span></div>
              {#each chans as ch (ch.name)}
                {@const on = pointOnChannel(editor.project, { module: m.id, point: ch.name })}
                {@const types = channelTypes(m, ch)}
                {@const k = key(m.id, ch.name)}
                <div
                  class="ch"
                  role="button"
                  tabindex="-1"
                  class:ok={dragging && canTake(m, ch.name)}
                  class:no={dragging && !canTake(m, ch.name)}
                  class:over={over === k}
                  class:picked={!!on && picked?.point === on.point}
                  ondragover={(e) => {
                    if (canTake(m, ch.name)) {
                      e.preventDefault();
                      over = k;
                    }
                  }}
                  ondragleave={() => over === k && (over = null)}
                  ondrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    drop(m, ch.name);
                  }}
                  onclick={() => on && (editor.designPick = { plant: [on.plant.id], point: on.point.name })}
                  onkeydown={() => {}}
                >
                  <span class="cname">{ch.name}</span>
                  <span class="badges">{#if types.length === 1}<TypeBadge type={types[0]!} />{:else}<span class="uio">UIO</span>{/if}</span>
                  {#if on}
                    <span
                      class="on"
                      role="listitem"
                      draggable="true"
                      ondragstart={(e) => startDrag(e, on.plant, on.point.name)}
                      ondragend={() => ((dragging = null), (over = null))}
                      title="Drag it to another channel, or back to Unallocated">{plantLabel(on.plant)} {on.point.name}</span>
                  {:else}
                    <span class="spare">{ch.label ? `spare · ${ch.label}` : "spare"}</span>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        {/each}
        {#if c.slots.some((s) => s.spare)}
          <div class="mod"><div class="mhead"><span class="dim">{c.slots.filter((s) => s.spare).length} spare slot{c.slots.filter((s) => s.spare).length === 1 ? "" : "s"} on the rail</span></div></div>
        {/if}
        {#if !mods.length}<p class="hint pad">No modules yet: add them in rail order with <strong>Controller…</strong>.</p>{/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .cview {
    display: grid;
    grid-template-columns: 340px minmax(0, 1fr);
    gap: 10px;
    height: 100%;
    min-height: 0;
  }
  .panel {
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: #fff;
    border: 1px solid #dde1e5;
    border-radius: 6px;
    overflow: hidden;
  }
  .main {
    overflow: auto;
  }
  .head {
    display: flex;
    justify-content: space-between;
    gap: 10px;
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
  .scroll {
    overflow: auto;
    flex: 1;
  }
  .pt {
    display: grid;
    grid-template-columns: 6em 1fr auto;
    gap: 6px;
    align-items: center;
    padding: 5px 12px;
    border-bottom: 1px solid #f0f1f3;
    font-size: 13px;
    cursor: grab;
  }
  .pt.picked {
    background: #e8f0fd;
  }
  .pt.stuck {
    background: #fdf0f0;
    cursor: default;
  }
  .mods {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    align-content: start;
  }
  .mod {
    border-right: 1px solid #eef0f2;
    border-bottom: 1px solid #eef0f2;
  }
  .mhead {
    display: flex;
    justify-content: space-between;
    padding: 6px 12px;
    background: #f1f3f6;
    font-size: 13px;
  }
  .ch {
    display: grid;
    grid-template-columns: 4.5em 3.4em 1fr;
    gap: 6px;
    align-items: center;
    padding: 4px 12px;
    border-top: 1px solid #f0f1f3;
    font-size: 13px;
  }
  .ch.ok {
    background: #f1f8f2;
  }
  .ch.no {
    opacity: 0.45;
  }
  .ch.over {
    background: #d8efdc;
    outline: 2px solid #3a9a4c;
    outline-offset: -2px;
  }
  .ch.picked {
    background: #e8f0fd;
  }
  .cname {
    color: #556;
  }
  .on {
    cursor: grab;
  }
  .spare {
    color: #99a;
  }
  .uio {
    font-size: 11px;
    border: 1px solid #ccd;
    border-radius: 3px;
    padding: 0 4px;
    color: #445;
  }
  .dim {
    color: #778;
  }
  .hint {
    font-size: 12px;
    color: #778;
    padding: 0 12px;
  }
  .hint.pad {
    padding: 12px;
  }
  .err {
    color: #b00;
    font-weight: 600;
    font-size: 13px;
    padding: 0 12px;
  }
  .empty {
    padding: 16px;
  }
</style>
