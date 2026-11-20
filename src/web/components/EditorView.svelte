<script lang="ts">
  import { deleteElements, duplicateElements, moveElements, rotateElements } from "../../core/ops";
  import type { Editor } from "../editor.svelte";
  import Canvas from "./Canvas.svelte";
  import Palette from "./Palette.svelte";
  import Props from "./Props.svelte";

  let { editor, onclose }: { editor: Editor; onclose: () => void } = $props();

  let canvas: Canvas | undefined = $state();

  const saveText = $derived(
    { saved: "Saved", pending: "Unsaved changes", saving: "Saving…", error: "Save failed" }[editor.saveState],
  );

  function isTyping(e: KeyboardEvent) {
    const t = e.target;
    return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;
  }

  function onKey(e: KeyboardEvent) {
    if (isTyping(e)) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const ids = editor.selection;
    const pageId = editor.pageId;
    if (ctrl && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) editor.redo();
      else editor.undo();
    } else if (ctrl && e.key.toLowerCase() === "y") {
      e.preventDefault();
      editor.redo();
    } else if (ctrl && e.key.toLowerCase() === "s") {
      e.preventDefault();
      void editor.saveNow();
    } else if (ctrl && e.key.toLowerCase() === "a") {
      e.preventDefault();
      editor.selection = editor.page.elements.map((el) => el.id);
    } else if (ctrl && e.key.toLowerCase() === "d") {
      e.preventDefault();
      if (!ids.length) return;
      let copies: string[] = [];
      editor.apply((p) => {
        copies = duplicateElements(p, pageId, ids, [4, 0]);
      });
      editor.selection = copies;
    } else if (e.key === "Delete" || e.key === "Backspace") {
      if (!ids.length) return;
      e.preventDefault();
      editor.apply((p) => deleteElements(p, pageId, ids));
      editor.selection = [];
    } else if (e.key === "r" || e.key === "R") {
      if (ids.length) editor.apply((p) => rotateElements(p, pageId, ids));
    } else if (e.key === "Escape") {
      editor.tool = "select";
      editor.placeSymbol = null;
      editor.selection = [];
    } else if (e.key.startsWith("Arrow") && ids.length) {
      e.preventDefault();
      const step = e.shiftKey ? 2 : 1;
      const d: [number, number] =
        e.key === "ArrowLeft" ? [-step, 0] : e.key === "ArrowRight" ? [step, 0] : e.key === "ArrowUp" ? [0, -step] : [0, step];
      editor.apply((p) => moveElements(p, pageId, ids, d));
    } else if (e.key === "f" || e.key === "F") {
      canvas?.fit();
    }
  }
</script>

<svelte:window
  onkeydown={onKey}
  onbeforeunload={(e) => {
    if (editor.hasUnsaved) {
      void editor.saveNow();
      e.preventDefault();
    }
  }}
/>

<div class="editor">
  <header>
    <button class="link" onclick={onclose} title="Back to projects">◂ Projects</button>
    <strong class="title">{editor.project.project.title}</strong>
    <div class="tools">
      <button class:active={editor.tool === "select"} onclick={() => ((editor.tool = "select"), (editor.placeSymbol = null))}>
        Select
      </button>
      <span class="sep"></span>
      <button disabled={!editor.canUndo} onclick={() => editor.undo()} title="Undo (Ctrl+Z)">Undo</button>
      <button disabled={!editor.canRedo} onclick={() => editor.redo()} title="Redo (Ctrl+Y)">Redo</button>
      <span class="sep"></span>
      <button onclick={() => canvas?.fit()} title="Fit sheet (F)">Fit</button>
    </div>
    <span class="status" class:error={editor.saveState === "error"}>{saveText}</span>
  </header>
  <aside class="left">
    <Palette {editor} />
  </aside>
  <main>
    <Canvas bind:this={canvas} {editor} />
    {#if editor.message}<div class="toast">{editor.message}</div>{/if}
  </main>
  <aside class="right">
    <Props {editor} />
  </aside>
</div>

<style>
  .editor {
    display: grid;
    grid-template-columns: 200px 1fr 250px;
    grid-template-rows: 40px 1fr;
    grid-template-areas: "head head head" "left main right";
    height: 100vh;
  }
  header {
    grid-area: head;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 10px;
    border-bottom: 1px solid #cfd4d8;
    background: #f4f5f6;
  }
  .title {
    font-size: 14px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 260px;
  }
  .tools {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .sep {
    width: 1px;
    height: 20px;
    background: #cfd4d8;
    margin: 0 4px;
  }
  .status {
    margin-left: auto;
    font-size: 12px;
    color: #667;
  }
  .status.error {
    color: #b00;
    font-weight: bold;
  }
  .left {
    grid-area: left;
    border-right: 1px solid #cfd4d8;
    overflow-y: auto;
    background: #fafafa;
  }
  .right {
    grid-area: right;
    border-left: 1px solid #cfd4d8;
    overflow-y: auto;
    background: #fafafa;
  }
  main {
    grid-area: main;
    position: relative;
    overflow: hidden;
  }
  .toast {
    position: absolute;
    bottom: 14px;
    left: 50%;
    transform: translateX(-50%);
    background: #223;
    color: #fff;
    padding: 6px 12px;
    border-radius: 4px;
    font-size: 13px;
  }
</style>
