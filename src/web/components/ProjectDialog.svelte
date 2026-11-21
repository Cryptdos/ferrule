<script lang="ts">
  import { addAsset, addRevision, deleteRevision, setLogo, setNumberingScheme, updateProjectInfo, updateRevision } from "../../core/ops";
  import { readImage } from "../images";
  import type { ProjectInfo, Revision } from "../../core/model";
  import type { Editor } from "../editor.svelte";

  let { editor, onclose }: { editor: Editor; onclose: () => void } = $props();

  /** A picture for the title block's logo box (chosen, dropped or pasted). */
  async function useLogo(file: Blob | undefined) {
    if (!file) return;
    try {
      const img = await readImage(file);
      editor.apply((p) => setLogo(p, addAsset(p, img)));
    } catch (e) {
      editor.flash((e as Error).message);
    }
  }
  const logo = $derived(editor.project.logo ? editor.project.assets?.[editor.project.logo] : undefined);

  const fields: { key: keyof ProjectInfo; label: string }[] = [
    { key: "title", label: "Project" },
    { key: "panelName", label: "Panel name" },
    { key: "client", label: "Client" },
    { key: "jobNo", label: "Job no." },
    { key: "drawingNo", label: "Drawing ref." },
    { key: "drawnBy", label: "Drawn by" },
    { key: "drawnDate", label: "Drawn date" },
    { key: "checkedBy", label: "Checked by" },
    { key: "checkedDate", label: "Checked date" },
  ];
  const revCols: { key: keyof Revision; label: string; w: string }[] = [
    { key: "rev", label: "Issue", w: "4em" },
    { key: "date", label: "Date", w: "7em" },
    { key: "drawnBy", label: "Drawn", w: "5em" },
    { key: "description", label: "Description", w: "auto" },
  ];
</script>

<svelte:window
  onpaste={(e) => {
    const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith("image/"));
    if (f) {
      e.preventDefault();
      void useLogo(f);
    }
  }}
/>

<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="dialog" role="dialog" aria-label="Project details">
    <h2>Project details</h2>
    <p class="hint">These fill the title block on every sheet. Sheet titles are set per sheet.</p>
    <div class="grid">
      {#each fields as f (f.key)}
        <label>
          {f.label}
          <input
            value={editor.project.project[f.key]}
            onchange={(e) => {
              const v = e.currentTarget.value;
              editor.apply((p) => updateProjectInfo(p, { [f.key]: v }));
            }}
          />
        </label>
      {/each}
    </div>
    <h3>Logo</h3>
    <div
      class="logo"
      role="region"
      aria-label="Title block logo"
      ondragover={(e) => e.preventDefault()}
      ondrop={(e) => {
        e.preventDefault();
        void useLogo([...(e.dataTransfer?.files ?? [])].find((f) => f.type.startsWith("image/")));
      }}
    >
      {#if logo}
        <img src={logo.data} alt="Logo" />
      {:else}
        <span class="hint">No logo. Choose one, drop one here, or paste one (Ctrl+V) while this is open.</span>
      {/if}
      <div class="logo-buttons">
        <label class="button">
          {logo ? "Change…" : "Choose…"}
          <input
            type="file"
            accept="image/*"
            hidden
            onchange={(e) => {
              const f = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              void useLogo(f);
            }}
          />
        </label>
        {#if logo}<button onclick={() => editor.apply((p) => setLogo(p, null))}>Remove</button>{/if}
      </div>
    </div>
    <h3>Numbering</h3>
    <label class="inline">
      Scheme
      <select
        value={editor.project.numbering.scheme}
        onchange={(e) => {
          const v = e.currentTarget.value as "position" | "sequential";
          editor.apply((p) => setNumberingScheme(p, v));
        }}
      >
        <option value="position">Position: K10-16, wire 11-22 (sheet-column)</option>
        <option value="sequential">Sequential: K1, K2…, wire 100, 101…</option>
      </select>
    </label>
    <p class="hint">Takes effect next time you press Renumber.</p>
    <h3>Revisions</h3>
    <table>
      <thead>
        <tr>
          {#each revCols as c (c.key)}<th style:width={c.w}>{c.label}</th>{/each}
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each editor.project.revisions as r, i (i)}
          <tr>
            {#each revCols as c (c.key)}
              <td>
                <input
                  value={r[c.key]}
                  onchange={(e) => {
                    const v = e.currentTarget.value;
                    editor.apply((p) => updateRevision(p, i, { [c.key]: v }));
                  }}
                />
              </td>
            {/each}
            <td><button class="danger" title="Remove" onclick={() => editor.apply((p) => deleteRevision(p, i))}>✕</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
    <div class="row">
      <button
        onclick={() =>
          editor.apply((p) => addRevision(p, { date: new Date().toLocaleDateString("en-GB"), drawnBy: p.project.drawnBy }))}
        >Add revision</button
      >
      <span class="hint">The latest four show in the title block, newest at the bottom.</span>
      <button class="close" onclick={onclose}>Done</button>
    </div>
  </div>
</div>

<style>
  .logo {
    display: flex;
    align-items: center;
    gap: 12px;
    border: 1px dashed #c8ccd2;
    padding: 8px;
    border-radius: 4px;
  }
  .logo img {
    max-height: 60px;
    max-width: 180px;
    object-fit: contain;
  }
  .logo-buttons {
    margin-left: auto;
    display: flex;
    gap: 6px;
  }
  label.button {
    border: 1px solid #c8ccd2;
    border-radius: 4px;
    padding: 3px 8px;
    cursor: pointer;
    font-size: 13px;
  }
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(20, 24, 30, 0.35);
    display: grid;
    place-items: center;
    z-index: 10;
  }
  .dialog {
    background: #fff;
    border-radius: 6px;
    padding: 16px 20px;
    width: min(720px, 94vw);
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 6px 30px rgba(0, 0, 0, 0.25);
  }
  h2 {
    margin: 0 0 4px;
    font-size: 17px;
  }
  h3 {
    font-size: 14px;
    margin: 16px 0 6px;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 8px 12px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
    color: #445;
  }
  table {
    width: 100%;
    border-collapse: collapse;
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
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 8px;
  }
  .close {
    margin-left: auto;
  }
  .hint {
    font-size: 12px;
    color: #667;
    margin: 0;
  }
</style>
