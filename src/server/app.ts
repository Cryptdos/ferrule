import { Hono } from "hono";
import { ProjectFormatError } from "../core/validate";
import { type Library, type Storage, StorageError } from "./storage";
import type { AssetSource } from "./assets";
import { PdfError, type PdfRenderer } from "./pdf";
import type { McpServer } from "./mcp";

export interface AppOptions {
  storage: Storage;
  library?: Library;
  assets?: AssetSource;
  version?: string;
  pdf?: PdfRenderer;
  /** Where the PDF renderer can reach this server, e.g. http://127.0.0.1:4810 */
  selfUrl?: () => string;
  mcp?: McpServer;
  /** Example projects that can be added to the projects folder, by name. */
  examples?: Record<string, () => Promise<import("../core/model").Project>>;
}

/** Only pages served from this machine may call /mcp from a browser (DNS-rebinding guard). */
function localOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  try {
    const h = new URL(origin).hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1";
  } catch {
    return false;
  }
}

/** Safe file name for a download. */
function fileName(s: string): string {
  return s.replace(/[^A-Za-z0-9._ -]+/g, "-").trim() || "drawing";
}

export function createApp({ storage, library, assets, version = "dev", pdf, selfUrl, mcp, examples }: AppOptions): Hono {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof StorageError) return c.json({ error: err.message }, err.status);
    if (err instanceof ProjectFormatError || err instanceof SyntaxError) return c.json({ error: err.message }, 400);
    if (err instanceof PdfError) return c.json({ error: err.message }, 503);
    console.error(err);
    return c.json({ error: "Internal error" }, 500);
  });

  app.get("/api/health", (c) => c.json({ ok: true, version }));

  app.get("/api/projects", async (c) => c.json(await storage.list()));

  app.post("/api/projects", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const title = typeof body?.title === "string" ? body.title : "Untitled project";
    return c.json(await storage.create(title), 201);
  });

  app.get("/api/projects/:id", async (c) => {
    const id = c.req.param("id");
    const project = await storage.load(id);
    c.header("x-ferrule-version", storage.version(id));
    return c.json(project);
  });

  app.put("/api/projects/:id", async (c) => {
    const id = c.req.param("id");
    const saved = await storage.save(id, await c.req.json(), c.req.header("if-match") || undefined);
    return c.json({ ok: true, id: saved.id, version: storage.version(id) });
  });

  // Server-sent events: tells an open editor when its project's file changes.
  app.get("/api/projects/:id/events", (c) => {
    const id = c.req.param("id");
    storage.version(id);
    let unsubscribe = () => {};
    let ping: ReturnType<typeof setInterval>;
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const send = (s: string) => {
          try {
            controller.enqueue(enc.encode(s));
          } catch {
            unsubscribe();
            clearInterval(ping);
          }
        };
        send(`event: hello\ndata: ${storage.version(id)}\n\n`);
        unsubscribe = storage.subscribe(id, (v) => send(`event: changed\ndata: ${v}\n\n`));
        ping = setInterval(() => send(`: ping\n\n`), 25_000);
      },
      cancel() {
        unsubscribe();
        clearInterval(ping);
      },
    });
    return new Response(stream, {
      headers: { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" },
    });
  });

  app.get("/api/projects/:id/pdf", async (c) => {
    const id = c.req.param("id");
    const project = await storage.load(id);
    if (!pdf || !selfUrl) throw new PdfError("PDF export isn't available on this server");
    const bytes = await pdf.render(`${selfUrl()}/print/${encodeURIComponent(id)}`);
    const name = fileName(project.project.drawingNo || project.project.title || id) + ".pdf";
    return new Response(new Blob([bytes as Uint8Array<ArrayBuffer>]), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${name}"`,
        "cache-control": "no-store",
      },
    });
  });

  if (examples) {
    app.get("/api/examples", (c) => c.json(Object.keys(examples)));
    // Adds a fresh copy of an example to the projects folder.
    app.post("/api/examples/:name", async (c) => {
      const make = examples[c.req.param("name")];
      if (!make) return c.json({ error: "No such example" }, 404);
      const project = await make();
      const created = await storage.create(project.project.title);
      project.id = created.id;
      await storage.save(created.id, project);
      return c.json({ id: created.id }, 201);
    });
  }

  if (library) {
    app.get("/api/library", async (c) => c.json(await library.list()));
    app.get("/api/library/:file", async (c) => c.json(await library.load(c.req.param("file"))));
    app.post("/api/library", async (c) => c.json({ file: await library.save(await c.req.json()) }, 201));
  }

  app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

  if (mcp) {
    app.post("/mcp", async (c) => {
      if (!localOrigin(c.req.header("origin"))) return c.json({ error: "Forbidden origin" }, 403);
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
      }
      const reply = await mcp.handle(body);
      return reply ? c.json(reply) : c.body(null, 202);
    });
    // No server-to-client stream: everything is request/response.
    app.on(["GET", "DELETE"], "/mcp", (c) => c.body(null, 405));
  }

  // Print view: the UI page with the project embedded, so a headless
  // browser can render it without waiting on further requests.
  app.get("/print/:id", async (c) => {
    const project = await storage.load(c.req.param("id"));
    const index = await assets?.get("/index.html");
    if (!index) return c.text("UI not built", 500);
    const html = await index.text();
    const data = JSON.stringify(project).replace(/</g, "\\u003c");
    const auto = c.req.query("autoprint") === "1";
    const solo = Number(c.req.query("page")) || 0;
    const inject = `<script>window.__FERRULE_PRINT__=${data};window.__FERRULE_AUTOPRINT__=${auto};window.__FERRULE_SOLO__=${solo};</script>`;
    return c.html(html.replace("</head>", `${inject}</head>`));
  });

  if (assets) {
    app.get("*", async (c) => {
      const res = (await assets.get(c.req.path)) ?? (await assets.get("/index.html"));
      return res ?? c.text("Not found", 404);
    });
  }

  return app;
}
