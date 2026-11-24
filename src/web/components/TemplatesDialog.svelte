<script lang="ts">
  import { saveSectionTemplate, saveSheetTemplate, stampTemplate, deleteTemplate, renameTemplate, importTemplate, type PlantMapping } from "../../core/templates";
  import { resolveFields } from "../../core/fields";
  import type { Template } from "../../core/model";
  import { api, type LibraryEntry } from "../api";
  import type { Editor } from "../editor.svelte";
  import Modal from "./Modal.svelte";

  let { editor, onclose }: { editor: Editor; onclose: () => void } = $props();

  let name = $state("");
  let library: LibraryEntry[] = $state([]);
  let libError = $state("");
  /** The template being stamped, and where each of its plant items goes. */
  let stamping: Template | null = $state(null);
  let choice: Record<string, string> = $state({});
  let newTags: Record<string, string> = $state({});
  let sheetTitle = $state("");

  const section = $derived(editor.selectedSections.length === 1 ? editor.selectedSections[0]! : null);

  async function refreshLibrary() {
    try {
      library = await api.library();
      libError = "";
    } catch (e) {
      libError = (e as Error).message;
    }
  }
  void refreshLibrary();

  function saveSheet() {
    const n = name;
    if (editor.apply((p) => saveSheetTemplate(p, editor.pageId, n))) {
      name = "";
      editor.flash("Saved this sheet as a template");
    }
  }
  function saveSection() {
    if (!section) return;
    const n = name;
    const id = section.id;
    if (editor.apply((p) => saveSectionTemplate(p, editor.pageId, id, n || resolveFields(section.label, p)))) {
      name = "";
      editor.flash("Saved the section as a template");
    }
  }

  function startStamp(t: Template) {
    stamping = t;
    // Default: a new plant item per template plant, tagged like the original.
    choice = Object.fromEntries(t.plant.map((p) => [p.id, "new"]));
    newTags = Object.fromEntries(t.plant.map((p) => [p.id, ""]));
    sheetTitle = t.title;
  }

  function mapping(t: Template): PlantMapping | null {
    const out: PlantMapping = {};
    for (const p of t.plant) {
      const c = choice[p.id] ?? "same";
      if (c === "same") continue;
      if (c === "new") {
        const tag = (newTags[p.id] ?? "").trim();
        if (!tag) {
          editor.flash(`Give the new plant for ${p.tag} a tag`);
          return null;
        }
        out[p.id] = { newTag: tag };
      } else {
        out[p.id] = { plant: c };
      }
    }
    return out;
  }

  function doStamp() {
    const t = stamping;
    if (!t) return;
    const plant = mapping(t);
    if (!plant) return;
    if (t.kind === "sheet") {
      let pageId = "";
      let links: typeof editor.stampLinks = null;
      const title = sheetTitle;
      if (
        editor.apply((p) => {
          const r = stampTemplate(p, t.id, { afterPageId: editor.pageId, plant, title });
          pageId = r.page.id;
          links = r.kept.length || r.relink.length ? { kept: r.kept, relink: r.relink } : null;
        })
      ) {
        editor.stampLinks = links;
        editor.setPage(pageId);
        editor.flash(`Stamped ${t.name} as a new sheet. Press Renumber to give it tags.`);
        stamping = null;
        onclose();
      }
    } else {
      editor.stamp = { templateId: t.id, plant, size: t.size, name: t.name };
      editor.tool = "stamp";
      editor.placeSymbol = null;
      editor.flash("Click where the top-left corner of the section goes");
      stamping = null;
      onclose();
    }
  }

  async function toLibrary(t: Template) {
    try {
      const { file } = await api.librarySave($state.snapshot(t) as Template);
      editor.flash(`Saved to the library as ${file}`);
      await refreshLibrary();
    } catch (e) {
      editor.flash(`Couldn't save to the library: ${(e as Error).message}`);
    }
  }

  async function fromLibrary(entry: LibraryEntry) {
    try {
      const t = await api.libraryLoad(entry.file);
      editor.apply((p) => importTemplate(p, t));
      editor.flash(`Imported ${t.name} into this project`);
    } catch (e) {
      editor.flash(`Couldn't import: ${(e as Error).message}`);
    }
  }
</script>

<Modal title="Templates" {onclose} wide>
  {#if stamping}
    {@const t = stamping}
    <h3>Stamp “{t.name}”</h3>
    {#if t.plant.length === 0}
      <p class="hint">This template doesn't refer to any plant.</p>
    {:else}
      <p class="hint">Choose the plant for this copy. Labels, section titles and plant views follow it.</p>
      <table>
        <thead><tr><th>In the template</th><th>Becomes</th><th></th></tr></thead>
        <tbody>
          {#each t.plant as p (p.id)}
            <tr>
              <td><strong>{p.tag}</strong> {p.description}</td>
              <td>
                <select bind:value={choice[p.id]}>
                  <option value="new">New plant item…</option>
                  <option value="same">The same plant ({p.tag})</option>
                  {#each editor.project.plant.filter((x) => x.id !== p.id) as x (x.id)}
                    <option value={x.id}>{x.tag} {x.description}</option>
                  {/each}
                </select>
              </td>
              <td>
                {#if choice[p.id] === "new"}
                  <input bind:value={newTags[p.id]} placeholder="New tag, e.g. SF-02" />
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
    {#if t.kind === "sheet"}
      <div class="row">
        <label class="grow-label">New sheet title <input bind:value={sheetTitle} /></label>
      </div>
      <p class="hint">Tip: put a plant field in the template's sheet title (e.g. via + field) and it follows the plant.</p>
    {/if}
    <div class="row">
      <button onclick={doStamp}>{t.kind === "sheet" ? "Stamp as a new sheet" : "Place on this sheet…"}</button>
      <button onclick={() => (stamping = null)}>Back</button>
    </div>
  {:else}
    <p class="hint">
      Draw a sheet or a section once, save it here, then stamp copies for other plant with fresh tags. Stamped copies don't
      change when the template does.
    </p>
    <div class="row">
      <input bind:value={name} placeholder="Template name" />
      <button onclick={saveSheet}>Save this sheet</button>
      <button onclick={saveSection} disabled={!section} title={section ? "" : "Select a section box first"}>Save selected section</button>
    </div>

    <h3>In this project</h3>
    {#if editor.project.templates.length === 0}
      <p class="hint">None yet.</p>
    {:else}
      <table>
        <thead><tr><th>Name</th><th>Kind</th><th>Plant</th><th>Items</th><th></th></tr></thead>
        <tbody>
          {#each editor.project.templates as t (t.id)}
            <tr>
              <td><input value={t.name} onchange={(e) => { const v = e.currentTarget.value; editor.apply((p) => renameTemplate(p, t.id, v)); }} /></td>
              <td>{t.kind}</td>
              <td>{t.plant.map((p) => p.tag).join(", ") || "–"}</td>
              <td>{t.elements.length}</td>
              <td class="actions">
                <button onclick={() => startStamp(t)}>Stamp…</button>
                <button onclick={() => toLibrary(t)} title="Save a copy to the shared library folder">To library</button>
                <button class="danger" onclick={() => editor.apply((p) => deleteTemplate(p, t.id))}>✕</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}

    <h3>Library</h3>
    {#if libError}<p class="error">{libError}</p>{/if}
    {#if library.length === 0}
      <p class="hint">The library folder (next to the projects folder) is empty.</p>
    {:else}
      <table>
        <thead><tr><th>Name</th><th>Kind</th><th>Plant</th><th></th></tr></thead>
        <tbody>
          {#each library as entry (entry.file)}
            <tr>
              <td>{entry.name}</td>
              <td>{entry.kind}</td>
              <td>{entry.plant.join(", ") || "–"}</td>
              <td class="actions"><button onclick={() => fromLibrary(entry)}>Import into project</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  {/if}
</Modal>

<style>
  h3 {
    font-size: 14px;
    margin: 14px 0 6px;
  }
  .row {
    display: flex;
    gap: 6px;
    align-items: center;
    margin: 8px 0;
  }
  .row input {
    flex: 1;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  th {
    text-align: left;
    font-weight: normal;
    color: #445;
  }
  td {
    padding: 2px 4px 2px 0;
  }
  td input {
    width: 100%;
  }
  td.actions {
    white-space: nowrap;
    text-align: right;
  }
  .grow-label {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    font-size: 13px;
  }
  .hint {
    font-size: 12px;
    color: #667;
    margin: 0;
  }
  .error {
    color: #b00;
    font-size: 12px;
  }
</style>
