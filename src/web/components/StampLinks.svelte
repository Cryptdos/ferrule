<script lang="ts">
  /**
   * After a stamp (v0.4.x T6): the contacts that kept their link to a coil
   * outside it, and the arrows (or contacts) left to link again. Each is a
   * click to select it.
   */
  import { displayTag } from "../../core/tags";
  import { address, locate } from "../../core/xref";
  import type { Editor } from "../editor.svelte";

  let { editor }: { editor: Editor } = $props();
  const links = $derived(editor.stampLinks!);

  function where(id: string): string {
    const l = locate(editor.project, id);
    return l ? address(l.page, l.el.pos) : "(gone)";
  }
  function name(id: string): string {
    const l = locate(editor.project, id);
    if (!l) return "(gone)";
    return displayTag(l.el, editor.project) || (l.el.symbol === "offpage" ? "Arrow" : "Contact");
  }
  const isArrow = (id: string) => locate(editor.project, id)?.el.symbol === "offpage";
</script>

<div class="stamplinks">
  <div class="head">
    <strong>Links out of the stamp</strong>
    <button class="x" title="Close" onclick={() => (editor.stampLinks = null)}>×</button>
  </div>
  {#if links.kept.length}
    <div class="sub">Kept: contacts on a coil outside it</div>
    {#each links.kept as k (k.contact)}
      <button class="row" onclick={() => editor.goTo(k.contact)}>Contact at {where(k.contact)} → coil {name(k.coil)} at {where(k.coil)}</button>
    {/each}
  {/if}
  {#if links.relink.length}
    <div class="sub">To link again</div>
    {#each links.relink as id (id)}
      <button class="row" onclick={() => editor.goTo(id)}>{isArrow(id) ? "Arrow" : "Contact"} at {where(id)}{isArrow(id) ? ": link it to its partner" : ": its coil isn't in this project"}</button>
    {/each}
  {/if}
</div>

<style>
  .stamplinks {
    position: absolute;
    right: 14px;
    bottom: 14px;
    width: 340px;
    max-height: 40%;
    overflow: auto;
    background: #fff;
    border: 1px solid #ccd;
    border-radius: 6px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
    padding: 8px 10px;
    font-size: 13px;
    z-index: 30;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .sub {
    margin: 6px 0 2px;
    font-size: 12px;
    color: #667;
  }
  .row {
    display: block;
    width: 100%;
    text-align: left;
    border: none;
    background: none;
    padding: 2px 0;
    color: #246;
    cursor: pointer;
  }
  .row:hover {
    text-decoration: underline;
  }
  .x {
    border: none;
    background: none;
    font-size: 16px;
  }
</style>
