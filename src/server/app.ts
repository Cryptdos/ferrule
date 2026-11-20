import { Hono } from "hono";
import { ProjectFormatError } from "../core/validate";
import { type Storage, StorageError } from "./storage";
import type { AssetSource } from "./assets";

export interface AppOptions {
  storage: Storage;
  assets?: AssetSource;
  version?: string;
}

export function createApp({ storage, assets, version = "dev" }: AppOptions): Hono {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof StorageError) return c.json({ error: err.message }, err.status);
    if (err instanceof ProjectFormatError || err instanceof SyntaxError) return c.json({ error: err.message }, 400);
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

  app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

  if (assets) {
    app.get("*", async (c) => {
      const res = (await assets.get(c.req.path)) ?? (await assets.get("/index.html"));
      return res ?? c.text("Not found", 404);
    });
  }

  return app;
}
