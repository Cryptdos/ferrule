<script lang="ts">
  import type { Condition, Expectation } from "../../core/model";
  import { deleteExpectation, setExpectation } from "../../core/ops";
  import { describeExpectation, isInputForm, missingRefs, things } from "../../core/points";
  import type { Editor } from "../editor.svelte";
  import Conditions from "./Conditions.svelte";
  import Modal from "./Modal.svelte";

  /**
   * The project's expectations (controller.md §6): plain statements about how
   * the drawing should behave, checked live in Simulate and by Check logic.
   */
  let { editor, onclose }: { editor: Editor; onclose: () => void } = $props();

  const list = $derived(things(editor.project));
  const inputs = $derived(list.filter((t) => t.form && isInputForm(t.form)));

  const save = (e: Expectation) => editor.apply((p) => setExpectation(p, e));
  const patch = (e: Expectation, change: Partial<Expectation>) => save({ ...e, ...change });

  function addShould() {
    const point = inputs[0];
    const first = list.find((t) => !t.form);
    if (!point || !first) return;
    editor.apply((p) => setExpectation(p, { kind: "should", point: point.ref, when: [{ ref: first.ref, on: true }] }));
  }
  function addNever() {
    const [a, b] = list;
    if (!a) return;
    const when: Condition[] = [{ ref: a.ref, on: true }, ...(b ? [{ ref: b.ref, on: true }] : [])];
    editor.apply((p) => setExpectation(p, { kind: "never", when, join: "and" }));
  }
</script>

<Modal title="Expectations" store="expectations" width={640} {onclose}>
  <p class="hint">
    What the drawing should do, checked live in Simulate and in full by <em>Check logic</em>.
    <strong>Should be … when …</strong> is for an input (a plant input, or a controller's): it turns green when it sees what's
    expected, red when it doesn't. <strong>Never …</strong> can name anything: two contactors of a changeover, a fan running
    while its damper is shut.
  </p>
  <div class="buttons">
    <button onclick={addShould} disabled={!inputs.length} title={inputs.length ? "" : "No plant inputs yet: give a plant point an input form"}>+ Should be … when …</button>
    <button onclick={addNever} disabled={!list.length}>+ Never …</button>
  </div>
  {#if !editor.project.expectations.length}<p class="hint">None yet.</p>{/if}
  {#each editor.project.expectations as e (e.id)}
    {@const missing = missingRefs(editor.project, e, list).length > 0}
    {#if e.interlock}
      <div class="exp gen">
        <div class="text">{describeExpectation(editor.project, e, list)}</div>
        <div class="hint">Made by an interlock in Design: change or remove it there.</div>
      </div>
    {:else}
    <div class="exp" class:missing>
      <div class="text">{describeExpectation(editor.project, e, list)}</div>
      {#if e.kind === "should"}
        <div class="row">
          <select value={e.point} onchange={(ev) => patch(e, { point: ev.currentTarget.value })}>
            {#if !inputs.some((t) => t.ref === e.point)}<option value={e.point}>(missing)</option>{/if}
            {#each inputs as t (t.ref)}<option value={t.ref}>{t.name}</option>{/each}
          </select>
          should be
          <select value={e.on === false ? "0" : "1"} onchange={(ev) => patch(e, { on: ev.currentTarget.value === "1" })}>
            <option value="1">on</option>
            <option value="0">off</option>
          </select>
          when
        </div>
      {:else}
        <div class="row">Never:</div>
      {/if}
      <Conditions {list} value={e.when} join={e.join ?? "and"} exclude={e.point ?? ""} onchange={(v, join) => v.length && patch(e, { when: v, join })} />
      <div class="row">
        <input class="note" value={e.note ?? ""} placeholder="Note (why)" onchange={(ev) => patch(e, { note: ev.currentTarget.value })} />
        <button class="x" title="Delete" onclick={() => editor.apply((p) => deleteExpectation(p, e.id))}>✕</button>
      </div>
      {#if missing}<div class="warn">It names something that's no longer on the drawing.</div>{/if}
    </div>
    {/if}
  {/each}
</Modal>

<style>
  .exp {
    border: 1px solid #d5d9e0;
    border-radius: 4px;
    padding: 6px 8px;
    margin-bottom: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
  }
  .exp.gen {
    background: #f7f8fa;
  }
  .exp.missing {
    border-color: #e3a5a5;
  }
  .text {
    font-weight: 600;
  }
  .row {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .note {
    flex: 1;
  }
  .buttons {
    display: flex;
    gap: 6px;
    margin-bottom: 8px;
  }
  .x {
    font-size: 11px;
    padding: 1px 6px;
  }
  .warn {
    color: #b02a2a;
  }
  .hint {
    font-size: 12px;
    color: #667;
    margin: 0 0 8px;
  }
</style>
