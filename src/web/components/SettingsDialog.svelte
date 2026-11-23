<script lang="ts">
  import { api, type Status } from "../api";
  import { saveSettings, settings } from "../settings.svelte";
  import Modal from "./Modal.svelte";

  /**
   * Settings for this browser, and the Status page (design-v0.2 §10, §11):
   * what's running where, whether Claude is connected, how to connect it,
   * and Quit Ferrule.
   */
  let { onclose }: { onclose: () => void } = $props();

  let status = $state<Status | null>(null);
  let error = $state("");
  let stopped = $state(false);
  let copied = $state("");

  async function refresh() {
    try {
      status = await api.status();
      error = "";
    } catch (e) {
      error = (e as Error).message;
    }
  }
  // Keep the Claude line current while the window is open.
  $effect(() => {
    void refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  });

  const ago = (ms?: number) => {
    if (!ms) return "";
    const s = Math.round((Date.now() - ms) / 1000);
    return s < 60 ? `${s} s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : new Date(ms).toLocaleString();
  };
  const desktopConfig = $derived(
    status?.command
      ? JSON.stringify({ mcpServers: { ferrule: { command: status.command.command, args: status.command.args } } }, null, 2)
      : "",
  );
  const codeCommand = $derived(status ? `claude mcp add --transport http ferrule ${status.mcpUrl}` : "");

  async function copy(what: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      copied = what;
      setTimeout(() => (copied = ""), 1500);
    } catch {
      /* the text can still be selected and copied by hand */
    }
  }

  async function quit() {
    if (!confirm("Quit Ferrule? Your work is saved. The server stops and this page won't respond until Ferrule is started again.")) return;
    try {
      await api.quit();
      stopped = true;
    } catch (e) {
      error = (e as Error).message;
    }
  }
</script>

<Modal title="Settings" store="settings" width={620} {onclose}>
  <h3>Drawing</h3>
  <label class="check">
    <input type="checkbox" bind:checked={settings.keepPlacing} onchange={saveSettings} />
    Keep placing until Esc (otherwise place one part, then back to Select)
  </label>
  <label class="check">
    <input type="checkbox" bind:checked={settings.dark} onchange={saveSettings} />
    Dark interface (the sheet stays paper-coloured, the drawing black)
  </label>
  <label class="row">
    Buttons
    <select bind:value={settings.buttons} onchange={saveSettings}>
      <option value="labels">Labels</option>
      <option value="both">Labels and icons</option>
      <option value="icons">Icons (the name shows on hover)</option>
    </select>
  </label>

  <h3>Status</h3>
  {#if stopped}
    <p class="stopped">Ferrule has stopped. Start it again from ferrule.exe; this page can be closed.</p>
  {:else if error && !status}
    <p class="error">Can't reach Ferrule: {error}</p>
  {:else if status}
    <dl>
      <dt>Version</dt>
      <dd>{status.version}</dd>
      <dt>Projects folder</dt>
      <dd class="path">{status.projects}</dd>
      <dt>Address</dt>
      <dd class="path">{status.address}</dd>
      <dt>Claude</dt>
      <dd>
        {#if status.mcp?.connectedAt}
          <span class="ok">●</span> Connected: {status.mcp.client} said hello {ago(status.mcp.connectedAt)}.
          {#if status.mcp.lastTool}Last tool: <code>{status.mcp.lastTool}</code>, {ago(status.mcp.lastAt)}.{/if}
        {:else}
          <span class="off">●</span> Not connected since Ferrule started.
        {/if}
      </dd>
    </dl>

    <h3>Connecting Claude</h3>
    <p class="hint">
      <strong>Claude Desktop:</strong> add this to <code>claude_desktop_config.json</code> (Settings → Developer → Edit config), then restart
      Claude Desktop. It uses this Ferrule if it's running, or starts one.
    </p>
    <div class="code">
      <pre>{desktopConfig}</pre>
      <button onclick={() => copy("desktop", desktopConfig)}>{copied === "desktop" ? "Copied" : "Copy"}</button>
    </div>
    <p class="hint"><strong>Claude Code</strong> (or any client that speaks streamable HTTP), with Ferrule running:</p>
    <div class="code">
      <pre>{codeCommand}</pre>
      <button onclick={() => copy("code", codeCommand)}>{copied === "code" ? "Copied" : "Copy"}</button>
    </div>

    {#if status.canQuit}
      <div class="quit">
        <button class="danger" onclick={quit}>Quit Ferrule</button>
        <span class="hint">Stops the server cleanly. Closing its console window does the same.</span>
      </div>
    {/if}
  {/if}
</Modal>

<style>
  label.row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    margin: 6px 0;
  }
  h3 {
    font-size: 13px;
    margin: 14px 0 6px;
  }
  h3:first-child {
    margin-top: 2px;
  }
  label.check {
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: 13px;
    margin: 4px 0;
  }
  dl {
    display: grid;
    grid-template-columns: 9em 1fr;
    gap: 4px 10px;
    margin: 0;
    font-size: 13px;
  }
  dt {
    color: #556;
  }
  dd {
    margin: 0;
  }
  .path {
    font-family: ui-monospace, Consolas, monospace;
    font-size: 12px;
    word-break: break-all;
  }
  .ok {
    color: #1a8f3a;
  }
  .off {
    color: #99a;
  }
  .hint {
    font-size: 12px;
    color: #556;
    margin: 6px 0 4px;
  }
  .code {
    display: flex;
    gap: 6px;
    align-items: flex-start;
  }
  pre {
    flex: 1;
    margin: 0;
    padding: 6px 8px;
    background: #f4f5f6;
    border: 1px solid #dde1e5;
    border-radius: 4px;
    font-size: 12px;
    white-space: pre-wrap;
    word-break: break-all;
    user-select: all;
  }
  .quit {
    display: flex;
    gap: 10px;
    align-items: center;
    margin-top: 16px;
  }
  .error,
  .stopped {
    font-size: 13px;
    color: #a22;
  }
</style>
