<script lang="ts">
  import { api } from "./api";
  import { Editor } from "./editor.svelte";
  import EditorView from "./components/EditorView.svelte";
  import Picker from "./components/Picker.svelte";

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
      const project = await api.load(id);
      editor = new Editor(project);
      const url = `?project=${encodeURIComponent(id)}`;
      if (location.search !== url) history.pushState(null, "", url);
    } catch (e) {
      error = (e as Error).message;
    }
  }

  void open(currentId());
</script>

<svelte:window onpopstate={() => void open(currentId())} />

{#if editor}
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
