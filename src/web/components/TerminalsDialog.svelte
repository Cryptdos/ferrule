<script lang="ts">
  /**
   * The Terminals window (v0.5 A67, design-design-workbench §7): one window
   * for a plant item and for a module. It lays out the terminals and groups
   * them into points; nothing about a point is edited here. Numbers never
   * change by themselves. On an IO module, Generate sits above the list.
   */
  import { POINT_FORMS, type PointForm } from "../../core/model";
  import { addPin, deletePin, movePin, nextPinNumber, pinGroups, plantLabel, portGroups, setGroupPort, setQuickEntry, updatePin } from "../../core/ops";
  import { formatQuickEntry, pointOfPin, printedPin } from "../../core/points";
  import { generateModule } from "../../core/controllers";
  import { pointType } from "../../core/design";
  import { defaultPattern, moduleType, patternSummary, type ModulePattern } from "../../core/modules";
  import type { Editor } from "../editor.svelte";
  import Modal from "./Modal.svelte";

  let { editor, onclose }: { editor: Editor; onclose: () => void } = $props();

  const item = $derived(editor.terminalsOf ? editor.project.plant.find((p) => p.id === editor.terminalsOf) : undefined);
  /** The groups that can be a serial port: not a channel's (an input or output point of the same name). */
  const ports = $derived(item ? pinGroups(item).filter((g) => portGroups(item).includes(g) || !(item.points ?? []).some((q) => q.name === g && pointType(q.form))) : []);
  const pointOf = $derived(item ? pointOfPin(item) : new Map<string, string>());
  /** Generate is on IO modules only: not plant, a host, a power supply or an adapter. */
  const io = $derived(!!item?.module && moduleType(item.module.type).channels);

  const pin = (t: string, patch: Parameters<typeof updatePin>[3]) => item && editor.apply((p) => updatePin(p, item.id, t, patch));

  function addTerminal() {
    if (!item) return;
    const n = nextPinNumber(item);
    editor.apply((p) => addPin(p, item.id, n));
  }

  // Dragging a row to reorder it.
  let dragging: string | null = $state(null);
  let overAt: number | null = $state(null);
  function drop(at: number) {
    const t = dragging;
    dragging = null;
    overAt = null;
    if (!item || !t) return;
    const from = item.terminals.indexOf(t);
    editor.apply((p) => movePin(p, item.id, t, at > from ? at - 1 : at));
  }

  // The generator, started from what the module has.
  let pattern: ModulePattern | null = $state(null);
  let patternFor = "";
  $effect(() => {
    if (!item?.module || patternFor === item.id) return;
    patternFor = item.id;
    const m = item.module;
    const p = defaultPattern(m.type, m.channels ?? 8);
    const first = item.points?.[0];
    if (first) {
      p.ids = first.pins.map((t) => item.pins?.[t]?.id ?? "").filter(Boolean).join(" ") || p.ids;
      if (first.form !== "none") p.form = first.form;
    }
    const n = Number(item.terminals[0]);
    if (Number.isFinite(n) && item.terminals.length) p.first = n;
    pattern = p;
  });
  const summary = $derived(pattern ? patternSummary(pattern) : "");

  /** Is any of its terminals wired on a sheet? */
  function wired(): boolean {
    if (!item) return false;
    return editor.project.pages.some((pg) => {
      const views = new Set(pg.elements.filter((e) => e.symbol === "plant-view" && e.params.plant === item.id).map((e) => e.id));
      return pg.segments.some((s) => views.has(s.from[0]) || views.has(s.to[0]));
    });
  }
  function generate() {
    if (!item || !pattern) return;
    const g = { ...pattern };
    if (wired() && !confirm(`${plantLabel(item)} has terminals wired on the drawing. Generate replaces its list: wires on terminals that go are removed. Go on?`)) return;
    editor.apply((p) => generateModule(p, item.id, g));
  }
</script>

<Modal title={item ? `${plantLabel(item)}: terminals` : "Terminals"} store="terminals" width={640} {onclose}>
  {#if !item}
    <p class="hint">Pick a plant or a module in Design and choose <em>Terminals…</em>.</p>
  {:else}
    {#if io && pattern}
      <section class="gen">
        <div class="sub">Generate</div>
        <div class="pattern">
          <label>Channels <input type="number" min="0" max="64" bind:value={pattern.channels} /></label>
          <label title="One channel's terminal ids in order, e.g. VO RET CO, IO C, Y ⊥. A dash uses up a number without making a terminal">One channel's terminals <input bind:value={pattern.ids} /></label>
          <label>First terminal number <input type="number" min="0" bind:value={pattern.first} /></label>
          <label>
            Form
            <select bind:value={pattern.form}>
              {#each POINT_FORMS as f (f.value)}<option value={f.value as PointForm}>{f.label}</option>{/each}
            </select>
          </label>
          <label title="Group and point names, # for the channel number">Names <input bind:value={pattern.group} placeholder="DI#" /></label>
          <label title="The first channel's number: later than 1 where the maker numbers channels across the controller">Counting from <input type="number" min="0" bind:value={pattern.start} placeholder="1" /></label>
          <label title="The id of a terminal shared by several channels, e.g. a common ⊥">Shared terminal <input bind:value={pattern.shared} placeholder="e.g. C" /></label>
          <label title="How many channels share each shared terminal">serving <input type="number" min="1" bind:value={pattern.shareBy} placeholder="1" /> channels</label>
        </div>
        <div class="line"><span class="says">{summary}</span><button onclick={generate} title="Replaces the list below">Generate</button></div>
      </section>
    {/if}
    <table>
      <thead><tr><th></th><th>Number</th><th>Id</th><th>Group</th><th>Point</th><th></th></tr></thead>
      <tbody>
        {#each item.terminals as t, i (t)}
          {@const pt = pointOf.get(t) ?? ""}
          <tr
            class:over={overAt === i}
            ondragover={(e) => {
              if (dragging) {
                e.preventDefault();
                overAt = i;
              }
            }}
            ondrop={(e) => {
              e.preventDefault();
              drop(i);
            }}
          >
            <td class="grip" draggable="true" ondragstart={() => (dragging = t)} ondragend={() => ((dragging = null), (overAt = null))} title="Drag to reorder: the list is the order they're drawn along a view">⠿</td>
            <td><input value={t} title={printedPin(t, pt) !== t ? `Printed ${printedPin(t, pt)}` : ""} onchange={(e) => pin(t, { number: e.currentTarget.value })} /></td>
            <td><input value={item.pins?.[t]?.id ?? ""} onchange={(e) => pin(t, { id: e.currentTarget.value })} /></td>
            <td><input value={item.pins?.[t]?.group ?? ""} onchange={(e) => pin(t, { group: e.currentTarget.value })} /></td>
            <td><input value={pt} list={`pts-${item.id}`} placeholder="–" onchange={(e) => pin(t, { point: e.currentTarget.value })} /></td>
            <td><button class="x" title="Delete this terminal: the others keep their numbers" onclick={() => editor.apply((p) => deletePin(p, item.id, t))}>✕</button></td>
          </tr>
        {/each}
        <tr
          class="end"
          class:over={overAt === item.terminals.length}
          ondragover={(e) => {
            if (dragging) {
              e.preventDefault();
              overAt = item.terminals.length;
            }
          }}
          ondrop={(e) => {
            e.preventDefault();
            drop(item.terminals.length);
          }}
        ><td colspan="6"></td></tr>
      </tbody>
    </table>
    <datalist id={`pts-${item.id}`}>{#each item.points ?? [] as p (p.name)}<option value={p.name}></option>{/each}</datalist>
    <div class="line">
      <button onclick={addTerminal} title="A terminal numbered one more than the highest">Add terminal</button>
      <span class="hint">A point name not used yet makes a point, marked in Design until its form is set.</span>
    </div>
    {#if ports.length}
      <!-- A group can be a serial port (v0.4.x M7): a network on it is built from the wiring. A channel's group isn't offered. -->
      <div class="sub">Serial ports</div>
      {#each ports as g (g)}
        <label class="port"><input type="checkbox" checked={portGroups(item).includes(g)} onchange={(e) => editor.apply((p) => setGroupPort(p, item.id, g, e.currentTarget.checked))} /> {g} is a serial port (RS485…)</label>
      {/each}
    {/if}
    <label class="oneline" title="Each point and its terminals, | between. Typing or pasting here changes the list above">
      In one line
      <input class="mono" value={formatQuickEntry(item)} placeholder="e.g. Enable: 1 2 | Run: 11 14" onchange={(e) => editor.apply((p) => setQuickEntry(p, item.id, e.currentTarget.value))} />
    </label>
  {/if}
</Modal>

<style>
  .hint {
    font-size: 12px;
    color: #778;
  }
  .sub {
    font-size: 12px;
    font-weight: 600;
    color: #445;
    margin: 6px 0 4px;
  }
  .gen {
    border: 1px solid #e3e6e9;
    border-radius: 5px;
    padding: 6px 8px;
    margin-bottom: 8px;
    background: #fafbfc;
  }
  .pattern {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px 12px;
  }
  .pattern label {
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: 12px;
    color: #556;
  }
  .pattern input,
  .pattern select {
    flex: 1;
    min-width: 0;
  }
  .line {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 6px;
  }
  .says {
    flex: 1;
    font-size: 12px;
    color: #334;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  th {
    text-align: left;
    font-weight: 500;
    color: #667;
    font-size: 12px;
    padding: 2px 4px;
  }
  td {
    padding: 1px 4px;
  }
  td input {
    width: 100%;
    box-sizing: border-box;
  }
  tr.over td {
    box-shadow: inset 0 2px 0 #1e6ee6;
  }
  tr.end td {
    height: 6px;
  }
  .grip {
    cursor: grab;
    color: #99a;
    width: 1em;
    user-select: none;
  }
  .x {
    border: none;
    background: none;
    color: #a00;
  }
  .port {
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: 12px;
  }
  .oneline {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
    color: #556;
    margin-top: 10px;
    border-top: 1px solid #eef0f2;
    padding-top: 8px;
  }
  .mono {
    font-family: ui-monospace, Consolas, monospace;
  }
</style>
