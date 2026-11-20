/**
 * A4 PDF export (DESIGN.md §3). The server prints its own print page with
 * a Chromium-based browser in headless mode. On Windows that's Microsoft
 * Edge, which every Windows PC already has, so nothing needs installing.
 * Set FERRULE_BROWSER to use a particular browser executable.
 */
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface PdfRenderer {
  /** Print a page to PDF. */
  render(url: string): Promise<Uint8Array>;
}

export class PdfError extends Error {}

function candidates(): string[] {
  const env = process.env;
  const list: string[] = [];
  if (env.FERRULE_BROWSER) list.push(env.FERRULE_BROWSER);
  if (process.platform === "win32") {
    const pf = env["ProgramFiles"] ?? "C:\\Program Files";
    const pf86 = env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
    const local = env["LOCALAPPDATA"] ?? "";
    list.push(
      join(pf86, "Microsoft\\Edge\\Application\\msedge.exe"),
      join(pf, "Microsoft\\Edge\\Application\\msedge.exe"),
      join(pf, "Google\\Chrome\\Application\\chrome.exe"),
      join(pf86, "Google\\Chrome\\Application\\chrome.exe"),
    );
    if (local) list.push(join(local, "Google\\Chrome\\Application\\chrome.exe"), join(local, "Chromium\\Application\\chrome.exe"));
  } else if (process.platform === "darwin") {
    list.push(
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    );
  } else {
    for (const dir of ["/usr/bin", "/usr/local/bin", "/snap/bin"]) {
      for (const name of ["microsoft-edge", "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
        list.push(join(dir, name));
      }
    }
  }
  return list;
}

export function findBrowser(): string | null {
  return candidates().find((p) => existsSync(p)) ?? null;
}

export function headlessBrowserRenderer(timeoutMs = 90_000): PdfRenderer {
  return {
    async render(url) {
      const browser = findBrowser();
      if (!browser) {
        throw new PdfError(
          "No Edge or Chrome found to make the PDF. Use Print in the browser instead, or set FERRULE_BROWSER to a Chromium-based browser.",
        );
      }
      const dir = await mkdtemp(join(tmpdir(), "ferrule-pdf-"));
      const out = join(dir, "out.pdf");
      try {
        const proc = Bun.spawn(
          [
            browser,
            "--headless",
            "--disable-gpu",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-extensions",
            "--disable-background-networking",
            "--disable-sync",
            // Needed when running as root in a Linux container; not used elsewhere.
            ...(process.platform === "linux" ? ["--no-sandbox"] : []),
            `--user-data-dir=${join(dir, "profile")}`,
            "--no-pdf-header-footer",
            "--print-to-pdf-no-header",
            "--virtual-time-budget=15000",
            `--print-to-pdf=${out}`,
            url,
          ],
          { stdout: "ignore", stderr: "pipe" },
        );
        const timer = setTimeout(() => proc.kill(), timeoutMs);
        const code = await proc.exited;
        clearTimeout(timer);
        if (!existsSync(out)) {
          const err = (await new Response(proc.stderr).text()).trim().split("\n").slice(-3).join(" ");
          throw new PdfError(`The browser didn't produce a PDF (exit ${code}). ${err}`.trim());
        }
        return new Uint8Array(await readFile(out));
      } finally {
        await rm(dir, { recursive: true, force: true }).catch(() => {});
      }
    },
  };
}
