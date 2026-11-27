<script lang="ts">
  import Modal from "./Modal.svelte";

  /** Keyboard and mouse help: a window, so it can be docked beside the drawing (v0.5 A32). */
  let { onclose }: { onclose: () => void } = $props();
</script>

<Modal title="Help" store="help" width={340} {onclose}>
  <div class="help">
    <p>Pick a part in the browser and click to place it; then it's back to Select. Hold <kbd>Ctrl</kbd> as you click to keep the part for the next click (or tick <em>Keep placing until Esc</em> in Settings). Drag to move, <kbd>Del</kbd> delete, <kbd>Ctrl</kbd>+<kbd>D</kbd> duplicate, arrows nudge.</p>
    <p>Scroll to zoom, middle-drag or <kbd>Space</kbd>+drag to pan; tap <kbd>Space</kbd> to fit the sheet. <kbd>R</kbd> rotates, <kbd>F</kbd> flips top to bottom. Drag the outline in the overview (top right of the tile you're in) to move about.</p>
    <p><kbd>W</kbd> wire tool: click a terminal, then another; click on a wire to tee into it. <kbd>Esc</kbd> cancels, <kbd>S</kbd> back to select.</p>
    <p><kbd>PgUp</kbd>/<kbd>PgDn</kbd> change sheet. Double-click a contact, coil or link arrow to jump to its partner.</p>
    <p>Split the drawing into tiles from a tile's bar (split right, split down); click a tile to work in it. Drag a window's title bar close to a tile's edge to dock it there, and its tile's bar out to float it again.</p>
    <p><kbd>Ctrl</kbd>+<kbd>Z</kbd> undo, <kbd>Ctrl</kbd>+<kbd>Y</kbd> redo, <kbd>Ctrl</kbd>+<kbd>A</kbd> select all on this workbench. Saving is automatic.</p>
  </div>
</Modal>

<style>
  .help {
    padding: 8px 12px;
    font-size: 12px;
    color: #445;
    line-height: 1.5;
  }
  .help p {
    margin: 0 0 6px;
  }
  kbd {
    font-size: 11px;
    border: 1px solid #ccd;
    border-radius: 3px;
    padding: 0 3px;
    background: #f6f7f8;
  }
</style>
