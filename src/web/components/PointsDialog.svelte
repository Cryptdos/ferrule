<script lang="ts">
  import { POINT_FORMS, type IoPoint } from "../../core/model";
  import { addPin, deletePin, plantLabel, updatePin, updatePoint } from "../../core/ops";
  import { describeExpectation, isInputForm, isOutputForm, pointOfPin, pointRef, printedPin, things } from "../../core/points";
  import type { Editor } from "../editor.svelte";
  import Conditions from "./Conditions.svelte";
  import Modal from "./Modal.svelte";

  /**
   * One device's pins and points (controller.md §4): the pins table is the
   * real editor behind quick entry; the points table says what each signal
   * is and how it simulates.
   */
  let { editor, plantId, onclose, onexpectations }: { editor: Editor; plantId: string; onclose: () => void; onexpectations?: () => void } = $props();

  const item = $derived(editor.project.plant.find((p) => p.id === plantId));
  const pointOf = $derived(item ? pointOfPin(item) : new Map<string, string>());
  const list = $derived(things(editor.project));
  let newPin = $state("");

  const pin = (pin: string, patch: Parameters<typeof updatePin>[3]) => editor.apply((p) => updatePin(p, plantId, pin, patch));
  const point = (name: string, patch: Parameters<typeof updatePoint>[3]) => editor.apply((p) => updatePoint(p, plantId, name, patch));
  const expectationsOf = (pt: IoPoint) => editor.project.expectations.filter((e) => e.point === pointRef(plantId, pt.name));
</script>

{#if item}
  <Modal title={`${plantLabel(item)}: pins and points`} store="points" width={760} {onclose}>
    <p class="hint">
      Each pin has a <strong>number</strong> (what's wired), and may have an <strong>id</strong> (C, Y1, VO) and a
      <strong>group</strong> (IO1, AO1), drawn under it when present. Pins make up <strong>points</strong>: one signal each,
      e.g. <em>Airflow proven</em> (C, NO). Type a new point name against a pin to start one.
    </p>
    <div class="cols">
      <div>
        <div class="sub">Pins</div>
        <table>
          <thead><tr><th>Number</th><th>Id</th><th>Group</th><th>Point</th><th></th></tr></thead>
          <tbody>
            {#each item.terminals as t (t)}
              {@const pt = pointOf.get(t) ?? ""}
              <tr>
                <td><input value={t} title={printedPin(t, pt) !== t ? `Printed ${printedPin(t, pt)}` : ""} onchange={(e) => pin(t, { number: e.currentTarget.value })} /></td>
                <td><input value={item.pins?.[t]?.id ?? ""} onchange={(e) => pin(t, { id: e.currentTarget.value })} /></td>
                <td><input value={item.pins?.[t]?.group ?? ""} onchange={(e) => pin(t, { group: e.currentTarget.value })} /></td>
                <td>
                  <input
                    value={pt}
                    list={`pts-${plantId}`}
                    placeholder="–"
                    onchange={(e) => pin(t, { point: e.currentTarget.value })}
                  />
                </td>
                <td><button class="x" title="Remove this pin" onclick={() => editor.apply((p) => deletePin(p, plantId, t))}>✕</button></td>
              </tr>
            {/each}
          </tbody>
        </table>
        <datalist id={`pts-${plantId}`}>{#each item.points ?? [] as p (p.name)}<option value={p.name}></option>{/each}</datalist>
        <form
          class="addpin"
          onsubmit={(e) => {
            e.preventDefault();
            const n = newPin;
            if (editor.apply((p) => addPin(p, plantId, n))) newPin = "";
          }}
        >
          <input bind:value={newPin} placeholder="New pin number" />
          <button type="submit">Add pin</button>
        </form>
      </div>
      <div>
        <div class="sub">Points</div>
        {#if !item.points?.length}
          <p class="hint">No points yet: give pins a point name.</p>
        {/if}
        {#each item.points ?? [] as pt (pt.name)}
          <div class="point">
            <div class="head">
              <input class="name" value={pt.name} onchange={(e) => point(pt.name, { name: e.currentTarget.value })} />
              <select value={pt.form} onchange={(e) => point(pt.name, { form: e.currentTarget.value as IoPoint["form"] })}>
                {#each POINT_FORMS as f (f.value)}<option value={f.value} title={f.hint}>{f.label}</option>{/each}
              </select>
              <span class="pins">{pt.pins.map((t) => printedPin(t, pt.name)).join(" ")}</span>
            </div>
            <div class="what">{POINT_FORMS.find((f) => f.value === pt.form)?.hint}</div>
            {#if isOutputForm(pt.form)}
              <div class="sim">
                <label>
                  <input
                    type="radio"
                    checked={!pt.follows?.length}
                    onchange={() => point(pt.name, { follows: null })}
                  /> Clicked in Simulate
                </label>
                <label>
                  <input
                    type="radio"
                    checked={!!pt.follows?.length}
                    onchange={() => {
                      const first = list.find((x) => x.ref !== pointRef(plantId, pt.name));
                      if (first) point(pt.name, { follows: [{ ref: first.ref, on: true }] });
                    }}
                  /> Follows
                </label>
                {#if pt.follows?.length}
                  <Conditions
                    {list}
                    value={pt.follows}
                    join={pt.join ?? "and"}
                    exclude={pointRef(plantId, pt.name)}
                    onchange={(v, join) => point(pt.name, { follows: v, join })}
                  />
                  <label class="delay">
                    after
                    <input type="number" min="0" step="0.5" value={pt.delay ?? 0} onchange={(e) => point(pt.name, { delay: Number(e.currentTarget.value) || 0 })} />
                    s
                  </label>
                {/if}
              </div>
            {/if}
            {#if pt.form === "supply-out"}
              <div class="dists">
                {#each pt.pins as t (t)}
                  <label>
                    {printedPin(t, pt.name)} feeds
                    <select
                      value={pt.dists?.[t] ?? ""}
                      onchange={(e) => point(pt.name, { dists: { ...(pt.dists ?? {}), [t]: e.currentTarget.value } })}
                    >
                      <option value="">Nothing (wired only)</option>
                      {#each editor.project.distributions as d (d.id)}<option value={d.id}>{d.name}</option>{/each}
                    </select>
                  </label>
                {/each}
                {#if !editor.project.distributions.length}<p class="hint">Add distributions (Distribution) for it to feed.</p>{/if}
              </div>
            {/if}
            {#if isInputForm(pt.form)}
              <div class="exp">
                {#each expectationsOf(pt) as e (e.id)}<div>{describeExpectation(editor.project, e, list)}</div>{/each}
                {#if !expectationsOf(pt).length}<span class="hint">No expectation: shown on or off only.</span>{/if}
                {#if onexpectations}<button class="small" onclick={onexpectations}>Expectations…</button>{/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </Modal>
{/if}

<style>
  .cols {
    display: grid;
    grid-template-columns: 300px 1fr;
    gap: 16px;
    align-items: start;
  }
  table {
    border-collapse: collapse;
    width: 100%;
  }
  th {
    text-align: left;
    font-size: 12px;
    font-weight: normal;
    color: #445;
  }
  td input {
    width: 100%;
  }
  .sub {
    font-weight: 600;
    font-size: 12px;
    color: #334;
    margin-bottom: 4px;
  }
  .point {
    border: 1px solid #d5d9e0;
    border-radius: 4px;
    padding: 6px 8px;
    margin-bottom: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .head {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .head .name {
    width: 11em;
  }
  .pins,
  .what {
    font-size: 12px;
    color: #667;
  }
  .sim,
  .dists,
  .exp {
    font-size: 12px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .sim label,
  .dists label {
    display: flex;
    gap: 4px;
    align-items: center;
  }
  .delay input {
    width: 5em;
  }
  .addpin {
    display: flex;
    gap: 4px;
    margin-top: 6px;
  }
  .x,
  .small {
    font-size: 11px;
    padding: 1px 6px;
    align-self: flex-start;
  }
  .hint {
    font-size: 12px;
    color: #667;
    margin: 0 0 8px;
  }
</style>
