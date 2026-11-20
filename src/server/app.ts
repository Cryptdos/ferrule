import { Hono } from "hono";
import { ProjectFormatError } from "../core/validate";
import { type Storage, StorageError } from "./storage";
import type { AssetSource } from "./assets";
import { PdfError, type PdfRenderer } from "./pdf";

export interface AppOptions {
  storage: Storage;
  assets?: AssetSource;
  version?: string;
  pdf?: PdfRenderer;
  /** Where the PDF renderer can reach this server, e.g. http://127.0.0.1:4810 */
  selfUrl?: () => string;
}

/** Safe file name for a download. */
function fileName(s: string): string {
  return s.replace(/[^A-Za-z0-9._ -]+/g, "-").trim() || "drawing";
}

export function createApp({ storage, assets, version = "dev", pdf, selfUrl }: AppOptions): Hono {
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

  app.get("/api/projects/:id", async (c) => c.json(await storage.load(c.req.param("id"))));

  app.put("/api/projects/:id", async (c) => {
    const saved = await storage.save(c.req.param("id"), await c.req.json());
    return c.json({ ok: true, id: saved.id });
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

  app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

  // Print view: the UI page with the project embedded, so a headless
  // browser can render it without waiting on further requests.
  app.get("/print/:id", async (c) => {
    const project = await storage.load(c.req.param("id"));
    const index = await assets?.get("/index.html");
    if (!index) return c.text("UI not built", 500);
    const html = await index.text();
    const data = JSON.stringify(project).replace(/</g, "\\u003c");
    const auto = c.req.query("autoprint") === "1";
    const inject = `<script>window.__FERRULE_PRINT__=${data};window.__FERRULE_AUTOPRINT__=${auto};</script>`;
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
