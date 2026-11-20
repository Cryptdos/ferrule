/**
 * Model Context Protocol server (DESIGN.md §12): JSON-RPC 2.0 messages,
 * carried over HTTP (POST /mcp, "streamable HTTP" with plain JSON replies)
 * or over stdio (one message per line).
 */
import { ProjectFormatError } from "../core/validate";
import { OpError } from "../core/ops";
import { ArgError, INSTRUCTIONS, TOOLS, type Content, type ToolContext } from "./mcp-tools";
import { StorageError } from "./storage";

const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

interface Request {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export type Reply = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
};

export class McpServer {
  constructor(
    private ctx: ToolContext,
    private version: string,
  ) {}

  /** Handle one message (or a batch). Returns null for notifications, which get no reply. */
  async handle(msg: unknown): Promise<Reply | Reply[] | null> {
    if (Array.isArray(msg)) {
      const out = (await Promise.all(msg.map((m) => this.one(m)))).filter((r): r is Reply => r !== null);
      return out.length ? out : null;
    }
    return this.one(msg);
  }

  private async one(raw: unknown): Promise<Reply | null> {
    const req = (raw ?? {}) as Request;
    const id = req.id ?? null;
    const isNotification = req.id === undefined;
    if (typeof req.method !== "string") return isNotification ? null : err(id, -32600, "Invalid request");
    try {
      const result = await this.dispatch(req.method, req.params ?? {});
      return isNotification ? null : { jsonrpc: "2.0", id, result };
    } catch (e) {
      if (isNotification) return null;
      if (e instanceof MethodNotFound) return err(id, -32601, e.message);
      return err(id, -32603, (e as Error).message);
    }
  }

  private async dispatch(method: string, params: Record<string, unknown>): Promise<unknown> {
    switch (method) {
      case "initialize": {
        const asked = String(params.protocolVersion ?? "");
        return {
          protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "ferrule", title: "Ferrule", version: this.version },
          instructions: INSTRUCTIONS,
        };
      }
      case "ping":
        return {};
      case "tools/list":
        return { tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) };
      case "tools/call":
        return this.call(String(params.name ?? ""), (params.arguments as Record<string, unknown>) ?? {});
      default:
        if (method.startsWith("notifications/")) return {};
        throw new MethodNotFound(`Unknown method ${method}`);
    }
  }

  private async call(name: string, args: Record<string, unknown>) {
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) return { content: [{ type: "text", text: `Unknown tool ${name}` }], isError: true };
    try {
      const out = await tool.run(args, this.ctx);
      const content: Content[] =
        Array.isArray(out) && out.every((c) => c && typeof c === "object" && "type" in c)
          ? (out as Content[])
          : [{ type: "text", text: typeof out === "string" ? out : JSON.stringify(out, null, 1) }];
      return { content };
    } catch (e) {
      // Mistakes in a call are reported to the model so it can correct them.
      const known =
        e instanceof ArgError || e instanceof OpError || e instanceof StorageError || e instanceof ProjectFormatError;
      if (!known) console.error(`MCP tool ${name} failed`, e);
      return {
        content: [{ type: "text", text: known ? (e as Error).message : `Internal error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
}

class MethodNotFound extends Error {}

function err(id: string | number | null, code: number, message: string): Reply {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

/** Serve MCP over stdin/stdout, one JSON message per line. */
export async function serveStdio(server: McpServer): Promise<void> {
  const decoder = new TextDecoder();
  let buf = "";
  const reader = Bun.stdin.stream().getReader();
  for (;;) {
    const { value: chunk, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(chunk, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let reply: Reply | Reply[] | null;
      try {
        reply = await server.handle(JSON.parse(line));
      } catch {
        reply = err(null, -32700, "Parse error");
      }
      if (reply) process.stdout.write(JSON.stringify(reply) + "\n");
    }
  }
}
