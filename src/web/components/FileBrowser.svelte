<script lang="ts">
  import { api, type FolderListing } from "../api";
  import Modal from "./Modal.svelte";

  /**
   * Pick a project file to open, or a folder and name to save to. The
   * server lists the folders (a browser page can't see the disk itself).
   */
  let {
    mode,
    initialName = "",
    onpick,
    onclose,
  }: {
    mode: "open" | "save";
    initialName?: string;
    /** `replace`: the file is there already and the user said to replace it. */
    onpick: (path: string, replace?: boolean) => void;
    onclose: () => void;
  } = $props();

  let listing: FolderListing | null = $state(null);
  let error = $state("");
  let name = $state(initialName);
  let typed = $state("");

  async function go(path?: string) {
    try {
      listing = await api.browse(path);
      typed = listing.path;
      error = "";
      try {
        localStorage.setItem("ferrule.lastFolder", listing.path);
      } catch {
        // Not remembered; fine.
      }
    } catch (e) {
      error = (e as Error).message;
    }
  }
  let last: string | undefined;
  try {
    last = localStorage.getItem("ferrule.lastFolder") ?? undefined;
  } catch {
    last = undefined;
  }
  void go(last).then(() => (listing ? undefined : go()));

  const sepOf = (p: string) => (p.includes("\\") ? "\\" : "/");
  const join = (dir: string, n: string) => (dir.endsWith("/") || dir.endsWith("\\") ? dir + n : dir + sepOf(dir) + n);

  /** A file of that name is already in the folder: ask before replacing it (follow-up 16). */
  let replacing = $state("");
  function save(e: SubmitEvent) {
    e.preventDefault();
    if (!listing || !name.trim()) return;
    const n = name.trim().replace(/\.ferrule$/i, "") + ".ferrule";
    if (listing.files.some((f) => f.name.toLowerCase() === n.toLowerCase())) replacing = n;
    else onpick(join(listing.path, n));
  }
</script>

<Modal title={mode === "open" ? "Open a project file" : "Save a copy as"} {onclose} wide>
  {#if listing}
    <div class="places">
      {#each listing.places as p (p.path)}
        <button class:here={p.path === listing.path} onclick={() => go(p.path)}>{p.name}</button>
      {/each}
    </div>
    <form class="pathbar" onsubmit={(e) => (e.preventDefault(), go(typed))}>
      <button type="button" disabled={!listing.parent} onclick={() => listing?.parent && go(listing.parent)} title="Up a folder">↑</button>
      <input bind:value={typed} spellcheck="false" />
      <button type="submit">Go</button>
    </form>
    <div class="list">
      {#each listing.folders as f (f)}
        <button class="row folder" ondblclick={() => go(join(listing!.path, f))} onclick={() => go(join(listing!.path, f))}>📁 {f}</button>
      {/each}
      {#each listing.files as f (f.path)}
        <button
          class="row file"
          onclick={() => (mode === "open" ? onpick(f.path) : (name = f.name.replace(/\.ferrule(\.json)?$/, "")))}
          title={f.path}
        >
          {f.name}<span>{f.modified ? new Date(f.modified).toLocaleString() : ""}</span>
        </button>
      {/each}
      {#if !listing.folders.length && !listing.files.length}<p class="muted">Empty folder.</p>{/if}
    </div>
    {#if mode === "save"}
      <form class="name" onsubmit={save}>
        <input bind:value={name} placeholder="File name" />
        <span class="ext">.ferrule</span>
        <button type="submit" disabled={!name.trim()}>Save here</button>
      </form>
      {#if replacing}
        <div class="replace">
          <span><strong>{replacing}</strong> is already there. Replace it? The file that's there now is kept as a .bak beside it.</span>
          <button onclick={() => listing && onpick(join(listing.path, replacing), true)}>Replace it</button>
          <button onclick={() => (replacing = "")}>Cancel</button>
        </div>
      {/if}
    {:else}
      <p class="muted">Ferrule project files end in .ferrule. Click one to open it.</p>
    {/if}
  {/if}
  {#if error}<p class="error">{error}</p>{/if}
</Modal>

<style>
  .replace {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 8px;
    padding: 6px 8px;
    background: #fff6d6;
    border: 1px solid #d9b84a;
    border-radius: 4px;
    font-size: 13px;
  }
  .replace span {
    flex: 1;
  }
  .places {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 6px;
  }
  .places .here {
    border-color: #1e6ee6;
  }
  .pathbar,
  .name {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .pathbar input,
  .name input {
    flex: 1;
    font-family: ui-monospace, monospace;
    font-size: 12px;
  }
  .list {
    margin: 8px 0;
    border: 1px solid #dde;
    height: 46vh;
    overflow: auto;
    display: flex;
    flex-direction: column;
  }
  .row {
    text-align: left;
    border: none;
    border-bottom: 1px solid #f0f0f3;
    background: none;
    padding: 5px 8px;
    border-radius: 0;
    display: flex;
    justify-content: space-between;
  }
  .row:hover {
    background: #eef3fd;
  }
  .row span {
    color: #889;
    font-size: 12px;
  }
  .file {
    font-weight: 600;
  }
  .ext {
    color: #667;
  }
  .muted {
    color: #667;
    font-size: 13px;
  }
  .error {
    color: #b00;
  }
</style>
