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

  let editor: Editor | null = $state(null);
  let error = $state("");

  function currentId(): string | null {
    return new URLSearchParams(location.search).get("project");
  }

  async function open(id: string | null) {
    error = "";
    if (editor) await editor.saveNow();
    editor = null;
    if (!id) {
      history.replaceState(null, "", location.pathname);
      return;
    }
    try {
      const [project] = await Promise.all([api.load(id), loadAvoid()]);
      editor = new Editor(project);
      const url = `?project=${encodeURIComponent(id)}`;
      if (location.search !== url) history.pushState(null, "", url);
    } catch (e) {
      error = (e as Error).message;
    }
  }

  if (!printData) void open(currentId());
</script>

<svelte:window onpopstate={() => void open(currentId())} />

{#if printData}
  <PrintView project={printData} {autoprint} />
{:else if editor}
  <EditorView {editor} onclose={() => void open(null)} />
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
