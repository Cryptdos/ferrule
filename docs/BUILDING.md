# Building Ferrule

Everything needed to build Ferrule is in this repository. The only tool you install is [Bun](https://bun.sh), which fetches the rest (the libraries listed in `package.json`, pinned exactly by `bun.lock`). The drawing font ([osifont](https://github.com/hikikomori82/osifont)) is already in `src/web/fonts`.

From a fresh clone it's three commands to a working `ferrule.exe`:

```sh
bun install
bun run build:exe      # → dist/ferrule.exe
```

The rest of this page goes through it step by step.

## 1. Install the tools

You need **Git** (to get the code) and **Bun** (to build it). Ferrule is developed and tested with Bun 1.4, and CI uses the latest Bun.

**Windows** (PowerShell):

```powershell
winget install Git.Git
powershell -c "irm bun.sh/install.ps1 | iex"
```

Close and reopen the terminal afterwards so `bun` is on the path. Check with `bun --version`.

**macOS / Linux:**

```sh
curl -fsSL https://bun.sh/install | bash
```

No Git? On the GitHub page, *Code → Download ZIP* gets the same files; unzip them and carry on from step 3 in that folder.

## 2. Get the code

```sh
git clone https://github.com/Cryptdos/ferrule.git
cd ferrule
```

## 3. Install the libraries

```sh
bun install
```

This downloads the libraries into `node_modules` (about 50 packages, a few seconds). Behind a company proxy, set `HTTPS_PROXY` first, e.g. `set HTTPS_PROXY=http://proxy:8080` on Windows.

## 4. Build the portable .exe

```sh
bun run build:exe
```

This builds the browser UI (Vite) into `dist/web`, then compiles the server, the UI and the wire router into one file, `dist/ferrule.exe` (about 115 MB; zipped, about 55 MB). It builds the Windows exe whatever system you're on, so a Mac or Linux machine can build it too. For a build that runs on the machine you're on, for testing:

```sh
bun scripts/build-exe.ts --target linux   # → dist/ferrule-linux
bun scripts/build-exe.ts --target mac     # → dist/ferrule-mac (Apple silicon)
```

Copy `ferrule.exe` anywhere and double-click it. See the [README](../README.md#running-it) for what it does when it runs.

## Run from source instead

To run without building an exe (handy on Mac or Linux):

```sh
bun run build      # the browser UI, into dist/web
bun run start      # the server; your browser opens on http://127.0.0.1:4810/
```

Projects go in a `projects` folder in the current folder. Options: `--port 4810`, `--host 0.0.0.0`, `--projects <folder>`, `--no-open`.

## Working on Ferrule

```sh
bun run dev        # server with reload on :4810, plus Vite on :5173 (open this one)
bun run typecheck  # TypeScript and Svelte checks
bun test           # the test suite (no browser needed)
```

Where things are:

| Path | What |
|---|---|
| `src/core` | The model and everything that works on it: symbols, operations, numbering, routing, simulation, GA, checks. No UI. |
| `src/server` | Bun + Hono server: project files, the device library, PDF export, the MCP server. |
| `src/web` | The Svelte UI, drawing in SVG. |
| `src/bench` | The LSP-01 example, built entirely with Ferrule's own operations (also a test). |
| `scripts` | Dev server, exe build, example builder. |
| `docs` | Design document, MCP guide, benchmark, this page. |

How it fits together, and why, is in the [design document](DESIGN.md).

## CI

Every push to `main` and every pull request runs the type checks, the tests and the UI build on GitHub Actions (`.github/workflows/ci.yml`), then builds `ferrule.exe`. The exe is attached to the run as the `ferrule-windows` artifact: open the run from the PR's *Checks* tab and download it from *Artifacts*.

## Making a release

1. Set the version in `package.json` (e.g. `0.1.0-pre`). The exe prints it when it starts.
2. Merge to `main` and let CI pass.
3. Build the exe (`bun run build:exe`, or download the CI artifact from the merge) and zip it as `ferrule-windows-v<version>.zip`, e.g. `ferrule-windows-v0.2.0-pre.zip`, matching the release tag.
4. On GitHub: *Releases → Draft a new release*, tag `v` plus the version on `main`, attach the zip, publish.

## If something goes wrong

- **`bun` isn't recognised:** open a new terminal after installing Bun, or add `%USERPROFILE%\.bun\bin` to the path.
- **`bun install` can't reach the internet:** set `HTTPS_PROXY` (above), or build on a machine that can and copy the exe across.
- **Windows warns about the exe:** it isn't signed. *More info → Run anyway*. Some antivirus tools are wary of compiled single-file programs; building it yourself from this source is the answer to that.
- **PDF export fails:** it drives Microsoft Edge (or Chrome) in the background. Set `FERRULE_BROWSER` to the path of a Chromium-based browser if neither is found. *Print* in the app works without it.
- **Port 4810 in use:** start it with `--port 4811` (from a terminal: `ferrule.exe --port 4811`).

## Third-party parts

Ferrule's own code is in this repository. It builds on these, fetched by `bun install` or bundled as noted:

| Part | Licence | Used for |
|---|---|---|
| [osifont](https://github.com/hikikomori82/osifont) | LGPL-3 with font exception | The only font on drawings; bundled in `src/web/fonts` and embedded in PDFs |
| [libavoid-js](https://github.com/Aksem/libavoid-js) | LGPL-2.1-or-later | Wire routing (WebAssembly, loaded as a separate module) |
| [Hono](https://hono.dev) | MIT | The web server |
| [Svelte](https://svelte.dev) | MIT | The UI |
| [Vite](https://vite.dev) | MIT | Building the UI (build time only) |
| [Bun](https://bun.sh) | MIT | Runtime, and compiling the exe |
