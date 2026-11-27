<script lang="ts">
  import { api } from "./api";
  import { loadAvoid } from "./avoid";
  import { Editor } from "./editor.svelte";
  import EditorView from "./components/EditorView.svelte";
  import Picker from "./components/Picker.svelte";
  import PrintView from "./components/PrintView.svelte";
  import type { Project } from "../core/model";

  const printData = (window as { __FERRULE_PRINT__?: Project }).__FERRULE_PRINT__;
  const autoprint = (window as { __FERRULE_AUTOPRINT__?: boolean }).__FERRULE_AUTOPRINT__ === true;
  const solo = (window as { __FERRULE_SOLO__?: number }).__FERRULE_SOLO__ ?? 0;

  let editor: Editor | null = $state(null);
  let error = $state("");

  function currentId(): string | null {
    return new URLSearchParams(location.search).get("project");
  }

  async function open(id: string | null) {
    error = "";
    if (editor) {
      await editor.saveNow();
      editor.close();
    }
    editor = null;
    if (!id) {
      history.replaceState(null, "", location.pathname);
      return;
    }
    try {
      const [{ project, version, file }] = await Promise.all([api.load(id), loadAvoid()]);
      editor = new Editor(project, version);
      editor.fileName = file;
      editor.watch();
      const url = `?project=${encodeURIComponent(id)}`;
      if (location.search !== url) history.pushState(null, "", url);
    } catch (e) {
      error = (e as Error).message;
    }
  }

  if (!printData) void open(currentId());
</script>

<svelte:window
  onpopstate={() => void open(currentId())}
  onpointerdowncapture={(e) => {
    // Clicking away from a text box commits what was typed (its change event)
    // before the click can change the selection and take the box away.
    const a = document.activeElement;
    if ((a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement) && e.target !== a) a.blur();
  }}
/>

{#if printData}
  <PrintView project={printData} {autoprint} {solo} />
{:else if editor}
  <EditorView {editor} onclose={() => void open(null)} onopen={(id) => void open(id)} />
{:else}
  {#if error}<p class="error">{error}</p>{/if}
  <Picker onopen={(id) => void open(id)} />
{/if}

<style>
  .error {
    color: #b00;
    text-align: center;
  }
</style>
