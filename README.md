# Ferrule

A lightweight, browser-based tool for drafting control panel schematics: symbols, wires, position-based numbering, cross-references, plant views, title blocks and PDF export. Functionality first.

- [Design document](docs/DESIGN.md)
- [Benchmark: LSP-01 life safety panel](docs/benchmark-lsp01.md)
- [MCP server: letting Claude draft drawings](docs/mcp.md)

Status: milestones 1–10 built (skeleton, wires, pages + title block + PDF, numbering + cross-references, plant + boundary + sections, element list + table view, templates + revisions, MCP server, LSP-01 benchmark, simulation workbench).

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

**Claude:** Ferrule is also an MCP server, at `http://127.0.0.1:4810/mcp`, or `ferrule.exe --mcp` over stdio. See [docs/mcp.md](docs/mcp.md).

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

To see what a finished set looks like, choose *add the LSP-01 example* on the project picker.

- Pick a part on the left (type in *Find a part…* to narrow the list) and click on the sheet to place it. `Esc` goes back to selecting.
- Drag to move (snaps to the grid), drag on empty paper to box-select, `Shift`/`Ctrl`+click to add to the selection.
- `R` rotate, `Del` delete, `Ctrl+D` duplicate, arrow keys nudge, `Ctrl+Z`/`Ctrl+Y` undo/redo, `F` fit.
- Scroll to zoom, middle-drag or `Space`+drag to pan.
- `W` wire tool: click a terminal, then another. Click part-way along a wire to tee into it (a junction dot is added). Wires to a rail drop straight onto it. `S` or `Esc` goes back to selecting.
- Wires route themselves at right angles around symbols. Select a wire and drag one of its legs to adjust it by hand; *Reset route* hands it back to the router.
- Saving is automatic.
- **Sheets** (top left): `+` adds a sheet after the current one, `⧉` duplicates it, arrows reorder, `✕` deletes. `PgUp`/`PgDn` switch sheets. With nothing selected, the right panel edits the sheet title.
- **Numbering:** tags show as `K?`, `S?`… until you press **Renumber**. Position scheme (default): tags and wire numbers are the sheet-column where they are, e.g. `K3-16`, wire `3-22`; the highest in a column keeps the plain number and the rest get A, B, C. Wires on a named rail take its name (CCT, 0V). Sequential (K1, K2…, wire 100, 101…) can be chosen under Project…. Lock a tag or wire number to keep it.
- **Links:** select a contact and pick its coil under *Driven by coil*: it takes the coil's tag and pole number (13/14, 23/24, 31/32…), and the coil gets a contact table to its right showing where each contact is (drag the table to move it; click a row to jump to that contact). **Double-click** a contact to jump to its coil, a coil to its first contact, or an off-page arrow to its partner; where you land is ringed until you select something else. Off-page arrows pair up under *Continues at*: each shows where the other is, one is drawn going (open arrow) and the other coming (filled arrow), and the wire keeps its number across sheets.
- **Wires:** select a wire to set its number, core colour (IEC codes: BU, BN, GNYE…) and function (0V, 24V…); all three print along it.
- **Lamps** have V+ and V- terminals and an optional lamp-test terminal T; colours are two-letter codes (RD, GN, AM…). **Timer coils** take a function (on-delay, off-delay, interval, cyclic…) and the maker's code for it; the simulator runs each one.
- **Plant…:** define field equipment once (tag, description, all its terminals, any information lines such as model and rating) and *Place view* on any sheet. Group terminals by function as `L N E | ENABLE: 1 2 | 0-10V: 3 4`: the group names print in bold inside the box, the tag and details under it. Tick the terminals a sheet shows; hidden ones give the box a break line. Labels can include `{plant:…}` fields (the *+ field* picker) so they always match the plant's tag.
- **Panel boundary:** tick it in the sheet panel (nothing selected), then drag the dash-dot line. Everything below is field equipment, and wires to it are drawn as dashed field cables. A wire crossing it without a terminal is flagged by **Check**.
- **Section** tool (`B`): drag out a dashed section box. Drag its label to move it, any edge or corner to resize that side.
- **Check** lists problems (boundary crossings, loose contacts, coils without contacts, unpaired off-page arrows, duplicate tags, plant terminals shown nowhere or twice) with a *Show* button. **Schedules** gives terminal and field cable schedules, downloadable as CSV.
- **Right sidebar:** everything on the sheet, in column order and synced with the canvas selection (click a row to select; filter box at the top), with the selection's properties below.
- **Split** shows another sheet alongside. *Go to* buttons (coil ↔ contacts, off-page pairs) then keep the sheet you came from in view; click the other half to work on it.
- **Table** lists every element in the project: filter by type, plant or text, edit tags and labels in place, and tick rows to find-and-replace or lock tags in bulk.
- **Templates…:** save the current sheet, or a selected section box and what's in it, as a template. *Stamp…* makes a copy for other plant (pick existing plant or type a new tag) with fresh tags; sheets go in as a new sheet, sections where you click. *To library* saves a copy in the `library` folder beside `projects` for use in other projects.
- **Cloud:** drag round a change to cloud it for the latest revision (add revisions under Project…). Only the latest revision's clouds are drawn. Remove them from the sheet panel.
- **Text**, **Box** and **Label plate** (Drawing group) for cover sheets, general arrangements and door labels. Text can hold fields: `{project:title}`, `{project:drawingNo}`, `{sheets}`, `{rev}` and plant fields.
- **Simulate** (top left, beside Draft): the same sheets, live. Click switches, push buttons, selectors, isolators and field plant (e.g. a DPS or fire alarm contact) to operate them; coils pull in, contacts follow, lamps light, live wires show red and timers run on the clock. The panel lists every input, coil and lamp. Under *Rules*, add "never both on" rules (e.g. two contactors of an ATS) and **Check logic**: Ferrule tries every sequence of operations and reports the shortest one that breaks a rule, shorts the supply or makes relays chatter, with *Replay*. Supply is any rail named CCT…, return the 0V rail.
- **Project…** sets the title block fields (project, panel, job no., drawing ref., drawn/checked) and the revision table.
- **Export PDF** downloads every sheet as one A4 landscape PDF. **Print** opens the same sheets in a browser tab and prints them, if PDF export isn't available.
