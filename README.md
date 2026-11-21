# Ferrule

A lightweight, browser-based tool for drafting control panel schematics: symbols, wires, position-based numbering, cross-references, plant views, title blocks and PDF export. Functionality first.

- [Design document](docs/DESIGN.md)
- [Benchmark: LSP-01 life safety panel](docs/benchmark-lsp01.md)
- [MCP server: letting Claude draft drawings](docs/mcp.md)

Status: milestones 1–10 built (skeleton, wires, pages + title block + PDF, numbering + cross-references, plant + boundary + sections, element list + table view, templates + revisions, MCP server, LSP-01 benchmark, simulation workbench), plus two rounds of review: four workbenches (Draft, Annotate, GA, Simulate), project files anywhere, pictures, true-scale general arrangements.

## Running it

### Portable Windows .exe

`ferrule.exe` is the whole thing in one file. Put it in a folder (e.g. `C:\Temp\eCAD`), double-click it, and your browser opens on Ferrule. A console window shows the address; close it to stop Ferrule. New projects are saved in a `projects` folder next to the .exe; *Open file…* and *Save as…* work with a project file anywhere.

PDF export uses Microsoft Edge in the background (or Chrome, if Edge isn't there). Nothing needs installing. Windows may warn the first time because the .exe isn't signed: *More info → Run anyway*.

Build it with `bun run build:exe` (→ `dist/ferrule.exe`). CI also builds it on every pull request; it's attached to the run as the `ferrule-windows` artifact.

### From source

Needs [Bun](https://bun.sh) 1.1 or newer.

```sh
bun install
bun run build      # build the browser UI into dist/web
bun run start      # start the server and open http://127.0.0.1:4810/
```

A project is one `.ferrule` file (JSON) with everything in it, pictures included, so it can be copied, emailed or kept in a job folder. New projects go in a `projects` folder (next to the program when running as the .exe, otherwise in the current folder); files opened from elsewhere stay where they are and are remembered in the project list. The previous save is kept as `.bak`. Older `.ferrule.json` files still open. *Delete* on the project list moves the file to `projects/Deleted`.

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

**Layout:** the top bar has two rows. The first has the project list, the workbenches, and icons for project settings, *Save as*, *Export PDF*, *Print* and help (hover any icon for its name). The second has the tools for the workbench you're in. The drawing fills the rest of the window, with three see-through panels floating over it:

- **Browser** (left): the sheets, and the parts for the workbench in use. Fold it away with `«`.
- **Properties** (right): shows when you click something. Drag it by its title bar and it stays where you put it; `–` folds it to its title.
- **Overview** (top right): the whole sheet with the part you're looking at outlined. Drag the outline, or click anywhere on it, to move about.

**Workbenches**: each shows only its own tools, so the palette stays short.

- **Draft**: the electro-mechanical drawing: parts, wires, rails, plant, numbering, links. Everything a part needs to say (tag, rating, function, colour) is a property of the part, not loose text.
- **Annotate**: text, boxes, label plates, pictures, section boxes and revision clouds, to explain the drawing to the reader. In Annotate only annotations can be selected, and in Draft only drawing parts, so a box round a group of parts never gets in the way.
- **GA**: general arrangement sheets drawn to scale (below).
- **Simulate**: the same sheets, live (below).

- Pick a part on the left (type in *Find a part…* to narrow the list) and click on the sheet to place it. `Esc` goes back to selecting.
- Drag to move (snaps to the grid), drag on empty paper to box-select, `Shift`/`Ctrl`+click to add to the selection.
- `R` rotate, `Del` delete, `Ctrl+D` duplicate, arrow keys nudge, `Ctrl+Z`/`Ctrl+Y` undo/redo, `F` fit.
- Scroll to zoom, middle-drag or `Space`+drag to pan.
- `W` wire tool: click a terminal, then another. Click part-way along a wire to tee into it (a junction dot is added). Wires to a rail drop straight onto it. `S` or `Esc` goes back to selecting.
- Wires route themselves at right angles around symbols. Select a wire and drag one of its legs to adjust it by hand; *Reset route* hands it back to the router.
- Saving is automatic.
- **Sheets** (in the browser): `+` adds a sheet after the current one (`▾` for a *spare sheet*), then duplicate, move up, move down and delete. `PgUp`/`PgDn` switch sheets. `▸` folds a sheet open to list what's on it for the workbench in use, in column order: click one to select it and bring it into view. *Find…* searches every sheet. The `⚙` on a sheet (or double-click its name) opens its settings: title, panel boundary, spare.
- **Spare sheets** hold annotations only (notes, tables, pictures): use them for spacing and organisation, or for a notes sheet. Draft is greyed out on them. Tick *Spare sheet* in a sheet's settings to make an empty sheet spare.
- **Numbering:** tags show as `K?`, `S?`… until you press **Renumber**. Position scheme (default): tags and wire numbers are the sheet-column where they are, e.g. `K3-16`, wire `3-22`; the highest in a column keeps the plain number and the rest get A, B, C. Wires on a named rail take its name (CCT, 0V). Sequential (K1, K2…, wire 100, 101…) can be chosen under Project…. Lock a tag or wire number to keep it.
- **Numbering:** **Renumber** first shows a table of what would change (old → new for tags, plant, terminals and wire numbers); nothing changes until you *Apply*.
- **Links:** select a contact and pick its coil under *Driven by coil* (listed by tag and description): it takes the coil's tag and pole number (13/14, 23/24, 31/32…), and the coil gets a contact table to its right showing where each contact is (drag the table to move it; click a row to jump to that contact). **Double-click** a contact to jump to its coil, a coil to its first contact, or a link arrow to its partner (in Simulate too); where you land is ringed until you select something else. References on the same sheet leave the sheet number out (`06`, not `11-06`).
- **Link arrows** pair up under *Continues at*. Tick *Source* on the one the wire comes from; its partner becomes the destination (filled). The wire keeps its number across sheets.
- **Rails across sheets:** rails (and busbars) with the same name are the same conductor on every sheet, so a 0V or CCT rail can simply be drawn again on the next sheet. The name sits above the rail with the other sheets it's on under it (`/7 /8`).
- **Wires:** select a wire to set its number, core colour (IEC codes written Bu, Bn, GnYe…) and function (0V, 24V…). The colour prints at the end the wire was drawn from with the number just after it (*Other end* flips it), and the function prints beside each terminal end. Wires go straight onto a terminal and keep their number through it.
- **Field wires:** *Kind: Field* draws a wire dashed. Field wires don't print a number unless you tick *Print the wire number*. Wires below the panel boundary are field wires automatically.
- **Lamps** have V+ and V- terminals and an optional lamp-test terminal T; colours are codes (Rd, Gn, Ye, Bu, Wh, Cl). **Timer coils** take an IEC 61131-3 function (TON on-delay, TOF off-delay, TP pulse, flashers) and the maker's code for it; the simulator runs each one.
- **Earth** takes a type (earth, protective, functional, chassis, equipotential: IEC 60417 symbols). The **socket** has L and N on top, 3 apart to line up under an MCB, and E out to the side.
- **Incoming supply** (Connection group) is where the simulator's power comes from: pick 3-phase + N, 3-phase, single phase or DC.
- Fields such as *Ratings* show an example as placeholder text, so every plant is written the same way.
- **Plant…:** define field equipment once (prefix, description, all its terminals, any information lines such as model and rating) and *Place view* on any sheet. The tag works like every other tag: prefix plus sheet-column where it's first shown, e.g. `SEF-3-13` for a safety extract fan, `U3-13` with the default prefix; type a tag to fix it instead. Group terminals by function as `L N E | R1: C NO NC | R2: C NO NC`: terminals sit in boxes along the top with the group names in capitals over them (the same name can be used in different groups). Tick the terminals a sheet shows; hidden ones give the box a break line. *Power by others* adds a break on the left. The tag and details print under the box. Labels can include `{plant:…}` fields (the *+ field* picker) so they always match the plant's tag.
- **Panel boundary:** tick it in the sheet settings. It's drawn as a **terminal block** across the sheet: terminals placed on it (or dropped within a unit of it) become cells of the block with their number written up the cell, panel wiring entering at the top and field cables leaving at the bottom. The strip name (`X1`) is at the left end of the block and again wherever the strip changes along it, so the cells only need the number (`3-13`); the terminal schedule lists them as `X1:3-13`. Drag the block (between terminals) to move it; its terminals go with it. Everything below is field equipment, and wires to it are drawn as dashed field cables. A wire crossing it without a terminal is flagged by **Check**.
- **Section** tool (`B`, Annotate): drag out a dashed section box. Drag its label to move it, any edge or corner to resize that side. Boxes and sections are picked by their edge, so parts inside them can still be clicked.
- **Check** lists problems (boundary crossings, loose contacts, coils without contacts, unpaired off-page arrows, duplicate tags, plant terminals shown nowhere or twice) with a *Show* button. **Schedules** gives terminal and field cable schedules, downloadable as CSV.
- **Split** shows another sheet alongside. *Go to* buttons (coil ↔ contacts, off-page pairs) then keep the sheet you came from in view; click the other half to work on it.
- **Table** lists every element in the project: filter by type, plant or text, edit tags and labels in place, and tick rows to find-and-replace or lock tags in bulk.
- **Templates…:** save the current sheet, or a selected section box and what's in it, as a template. *Stamp…* makes a copy for other plant (pick existing plant or type a new tag) with fresh tags; sheets go in as a new sheet, sections where you click. *To library* saves a copy in the `library` folder beside `projects` for use in other projects.
- **Cloud** (Annotate): drag round a change to cloud it for the latest revision (add revisions under Project…); the triangle shows the revision letter. Drag the triangle to move it, an edge to resize it; select it to change its revision or delete it. Only the latest revision's clouds are drawn.
- **Text**, **Box** and **Label plate** (Annotate) for cover sheets and door labels. Text can hold fields: `{project:title}`, `{project:drawingNo}`, `{sheets}`, `{rev}` and plant fields.
- **Notes (formatted)** (Annotate): multi-line notes written in a small Markdown, with buttons for each: `## Heading`, `**bold**`, `- bullet`, `1. numbered` (two spaces indent a list), `| tables |` (a `|---|` row under the first makes it the heading row) and `---` for a line across. Long lines wrap to the width you set. Good for general notes and cable size tables.
- **Revision list** and **Symbol legend** (Annotate, Tables): drop them on a sheet and they fill themselves. The revision list shows the project's revisions (edit them under project settings) with blank rows to spare. The legend draws one of each kind of part used in the project with its name (e.g. *Circuit breaker / MCB*, *Contactor coil*), in 1 to 4 columns.
- **Terminals** can be plain, **fused** (an IEC fuse drawn on the panel side, right on top of the terminal) or **disconnect** (an open knife link), set under *Type*. Terminals away from the boundary are drawn as small circles and can show their strip identifier (`X1`) beside them: tick it for one, or select several and tick it for them all. On the GA, fused and disconnect terminals take their own (wider) sizes.
- **Pictures** (Annotate): paste one (`Ctrl+V`), drag a PNG or JPEG in from Explorer, or use *Picture*. Drag the corner to size it. The company logo is set under *Project…* and prints in every title block (and anywhere a picture is set to *Logo*). Pictures are stored in the project file, scaled down to 2400 px at most.
- **GA**: *New GA sheet* sets the enclosure size and view (backplate or door); the scale is chosen to fit A4. Draw DIN rails and trunking, then pick panel parts from *To place* (every relay, timer, breaker, terminal strip… from the schematic, not yet on a GA) and click to place them; they snap onto rails and keep their schematic tags. Sizes are generic per kind of part (*Generic sizes…* in the sheet settings) until you pick a real device: select the part and choose it under *Device*. Labels sit in the middle of each device, across it or along it, whichever is bigger; on very small devices the text gets smaller, down to a size still readable on an A4 print.
- **Device table** (GA): real devices with their sizes from the datasheet (W × H × D), maker and part number. Devices in the **shared library** (`library/devices` beside the projects folder) can be used by any project and keep their datasheets (PDF) and pictures: add them with *Add files…* or drop them on the device. A project keeps a copy of each device it uses, so it opens anywhere; if the library entry changes, *Update* takes the new size. Parts sized by hand keep their size. When creating a project you can leave the shared library out (and change that later under project settings) to start a project's device table from scratch. Drag to move, `R` rotate, arrows nudge 5 mm, `Del` removes from the GA. **Check** lists parts not on a GA yet.
- **Simulate**: click switches, selectors, isolators and field plant to operate them; push buttons are held while the mouse is down (`Shift`+click latches). Coils pull in, contacts move, lamps glow in their colour, energised parts and live wires and rails turn red, and timing timers show their countdown. `PgUp`/`PgDn` and double-click links work as in Draft. The floating simulation panel lists every input, coil and lamp. Power comes from *Incoming supply* parts and transformers (phases kept separate; a short between them is reported); without one, any rail named CCT… is the supply and the 0V rail the return. Plant groups can act as inputs (a relay's C/NO/NC switch together) or outputs, and can *follow* a coil with a delay or inverted, e.g. a fan's run relay following its start contactor after 5 s: set these under *Plant… → Simulation*. Under *Rules*, add "never both on" rules (e.g. two contactors of an ATS) and **Check logic**: Ferrule tries every sequence of operations and reports the shortest one that breaks a rule, shorts the supply or makes relays chatter, with *Replay*.
- **Project settings** (the sliders icon) sets the title block fields (project, panel, job no., drawing ref., drawn/checked), the logo and the revision table. **Save as…** writes the project to a new file anywhere and carries on in it.
- **Export PDF** downloads every sheet as one A4 landscape PDF. **Print** opens the same sheets in a browser tab and prints them, if PDF export isn't available.
