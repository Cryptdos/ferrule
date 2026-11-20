# Ferrule

A lightweight, browser-based tool for drafting control panel schematics: symbols, wires, position-based numbering, cross-references, plant views, title blocks and PDF export. Functionality first.

- [Design document](docs/DESIGN.md)
- [Benchmark: LSP-01 life safety panel](docs/benchmark-lsp01.md)

Status: milestones 1–5 (skeleton, wires, pages + title block + PDF, numbering + cross-references, plant + boundary + sections).

## Running it

### Portable Windows .exe

`ferrule.exe` is the whole thing in one file. Put it in a folder (e.g. `C:\Temp\eCAD`), double-click it, and your browser opens on Ferrule. A console window shows the address; close it to stop Ferrule. Projects are saved in a `projects` folder next to the .exe.

PDF export uses Microsoft Edge in the background (or Chrome, if Edge isn't there). Nothing needs installing. Windows may warn the first time because the .exe isn't signed: *More info → Run anyway*.

Build it with `bun run build:exe` (→ `dist/ferrule.exe`). CI also builds it on every pull request; it's attached to the run as the `ferrule-windows` artifact.

### From source

Needs [Bun](https://bun.sh) 1.1 or newer.

```sh
bun install
bun run build      # build the browser UI into dist/web
bun run start      # start the server and open http://127.0.0.1:4810/
```

Projects are saved as `<id>.ferrule.json` in a `projects` folder (next to the program when running as the .exe, otherwise in the current folder). The previous save is kept as `.bak`.

Set `FERRULE_BROWSER` to the path of a Chromium-based browser to choose which one makes PDFs.

Server options: `--port 4810`, `--host 0.0.0.0` (to reach it from another machine), `--projects <folder>`, `--no-open`.

### Development

```sh
bun run dev        # server on :4810 with reload, plus Vite on :5173 (use this one)
bun run typecheck
bun test
```

## Layout

| Path | What |
|---|---|
| `src/core` | Shared model: geometry, symbols, operations, numbering, loading. Used by the UI, the server and (later) the MCP tools. |
| `src/server` | Bun + Hono server: project storage and the API, serves the UI. |
| `src/web` | Svelte UI, drawing in SVG. |

Drawings use [osifont](https://github.com/hikikomori82/osifont) (ISO 3098 lettering, LGPL-3 with font exception), bundled in `src/web/fonts`. It is the only font on drawings and is embedded in the PDFs.

Wire routing uses [libavoid-js](https://github.com/Aksem/libavoid-js) (LGPL-2.1-or-later), loaded as a separate WebAssembly file.

## Using the editor

- Pick a symbol on the left and click on the sheet to place it. `Esc` goes back to selecting.
- Drag to move (snaps to the grid), drag on empty paper to box-select, `Shift`/`Ctrl`+click to add to the selection.
- `R` rotate, `Del` delete, `Ctrl+D` duplicate, arrow keys nudge, `Ctrl+Z`/`Ctrl+Y` undo/redo, `F` fit.
- Scroll to zoom, middle-drag or `Space`+drag to pan.
- `W` wire tool: click a terminal, then another. Click part-way along a wire to tee into it (a junction dot is added). Wires to a rail drop straight onto it. `S` or `Esc` goes back to selecting.
- Wires route themselves at right angles around symbols. Select a wire and drag one of its legs to adjust it by hand; *Reset route* hands it back to the router.
- Saving is automatic.
- **Sheets** (top left): `+` adds a sheet after the current one, `⧉` duplicates it, arrows reorder, `✕` deletes. `PgUp`/`PgDn` switch sheets. With nothing selected, the right panel edits the sheet title.
- **Numbering:** tags show as `K?`, `S?`… until you press **Renumber**. Position scheme (default): tags and wire numbers are the sheet-column where they are, e.g. `K3-16`, wire `3-22`; the highest in a column keeps the plain number and the rest get A, B, C. Wires on a named rail take its name (CCT, 0V). Sequential (K1, K2…, wire 100, 101…) can be chosen under Project…. Lock a tag or wire number to keep it.
- **Links:** select a contact and pick its coil under *Driven by coil*: it takes the coil's tag and pole number (13/14, 23/24, 31/32…), and the coil gets a contact table showing where each contact is. Off-page arrows pair up under *Continues at*: each shows where the other is, and the wire keeps its number across sheets.
- **Plant…:** define field equipment once (tag, description, all its terminals) and *Place view* on any sheet. Tick the terminals a sheet shows; hidden ones give the box a break line. Labels can include `{plant:…}` fields (the *+ field* picker) so they always match the plant's tag.
- **Panel boundary:** tick it in the sheet panel (nothing selected), then drag the dashed line. Everything below is field equipment, and wires to it are drawn as dashed field cables. A wire crossing it without a terminal is flagged by **Check**.
- **Section** tool (`B`): drag out a dashed section box; select its border to label, move or resize it.
- **Check** lists problems (boundary crossings, loose contacts, coils without contacts, unpaired off-page arrows, duplicate tags, plant terminals shown nowhere or twice) with a *Show* button. **Schedules** gives terminal and field cable schedules, downloadable as CSV.
- **Project…** sets the title block fields (project, panel, job no., drawing ref., drawn/checked) and the revision table.
- **Export PDF** downloads every sheet as one A4 landscape PDF. **Print** opens the same sheets in a browser tab and prints them, if PDF export isn't available.
