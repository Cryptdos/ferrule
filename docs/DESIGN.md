# Ferrule — Design Document

A lightweight, browser-based tool for drafting control panel schematics. It is a focused alternative to QElectroTech, not a replacement for all of it.

Status: draft for discussion. Nothing here is fixed until we've agreed it.

---

## 1. Ethos

- **Functionality first.** The UI can be plain. The UX must be readable and quick. Effort goes into what saves drafting time, not decoration.
- **Beautiful drawings without fuss.** The output is a clean, well laid-out, easy-to-follow control drawing. The style target is a clean relay-logic layout: rails across the top and bottom, coils in a row, contacts hanging above them, terminals on a rail, field plant below.
- **Generate, don't type.** Tags, wire numbers, terminal numbers, cross-references and labels come from the data. Copy-paste tag mismatches should be impossible.
- **Keep it small.** No font pickers, no styling options, no feature creep. If a feature doesn't make drawings faster or more correct, it waits.

## 2. Scope

### In scope (v1)

- About 20 symbols (see §5).
- Placing, moving and connecting symbols. Wires that stay attached, route at right angles and can be dragged by hand.
- 100-column page grid, and position-based references (sheet-column).
- Automatic wire numbering and terminal numbering.
- Element linking and cross-references (coil ↔ contacts), including contact tables under coils.
- Plant items split across pages (see §6).
- Panel boundary: a real internal/external split on each page (see §7).
- Section boxes (named zones such as "Main incoming section").
- Section templates: draw once, stamp out with new tags.
- Title block templates filled from project data.
- Revision table and revision clouds.
- Element list sidebar + properties panel, and a project-wide table view.
- A4 PDF export.
- MCP server so Claude can create and edit drawings.

### Later

- Simulation workbench (see §9) — planned early, but after drafting works.
- Rule checks (see §10).
- Live collaboration.

### Out of scope

- Motor, analogue or power-flow simulation.
- PLC code.
- 3D panel layout.
- Custom fonts and styling.
- Importing QElectroTech projects (maybe later, not a goal).

## 3. Architecture

```
┌────────────── Browser ──────────────┐
│  Svelte UI  ·  SVG canvas           │
│  Page list · Element list · Props   │
└──────────────┬──────────────────────┘
               │ HTTP / WebSocket
┌──────────────┴──────────────────────┐
│  Headless local server (Node/Bun)   │
│  · Project storage (JSON files)     │
│  · Core logic (shared TS module)    │
│  · PDF export (Playwright)          │
│  · MCP server                       │
└─────────────────────────────────────┘
```

- **Language:** TypeScript everywhere.
- **Server:** Bun, with a small HTTP framework (Hono or Fastify). Headless, accessed through a browser, so it can run on another machine. Bun can compile it to a single portable .exe.
- **Front end:** Svelte, rendering in SVG. What's on screen is what gets printed.
- **Wire routing:** libavoid-js (orthogonal routing around symbols), with manual segment override.
- **PDF export:** the server renders pages in headless Chromium via Playwright and prints them to a flat A4 PDF (no clickable links needed).
- **Core module:** data model, numbering, cross-referencing, checks and the simulator live in one shared module, used by the UI, the PDF export and the MCP tools.
- **Collaboration (later):** every edit is a small operation on the model, so Yjs can be added without a rewrite.

## 4. Data model

Store the **meaning**, not the drawing. Graphics are rebuilt from the data.

One JSON file per project. A 54-page set (our largest so far) should be a few thousand objects and a file of a megabyte or two.

Draft shape:

```jsonc
{
  "project": { "title": "", "client": "", "drawingNo": "", "revision": "A" },
  "titleBlock": "default-a3",
  "plant": [
    { "id": "p1", "tag": "SF-01", "description": "Supply fan 1",
      "terminals": ["U", "V", "W", "PE", "1", "2"] }
  ],
  "pages": [
    {
      "id": "pg3", "number": 3, "title": "Fan starter",
      "sections": [ { "id": "s1", "label": "{plant:p1.tag} section", "rect": [0, 0, 100, 60] } ],
      "boundaryY": 160,
      "elements": [
        { "id": "e1", "symbol": "coil", "tag": "K1", "pos": [42, 120], "zone": "internal",
          "links": ["e7", "e9"] },
        { "id": "e2", "symbol": "plant-view", "plant": "p1",
          "showTerminals": ["U", "V", "W", "PE"], "pos": [20, 180], "zone": "external" }
      ],
      "segments": [
        { "id": "w1", "conductor": "c1", "from": ["e1", "A1"], "to": ["e4", "2"], "route": "auto" }
      ]
    }
  ],
  "conductors": [
    { "id": "c1", "number": "7-12", "terminals": [["e9", "L"], ["e1", "A1"], ["e4", "2"]] }
  ],
  "revisions": [ { "rev": "A", "date": "", "description": "First issue", "clouds": [] } ]
}
```

Decisions:

- **Units:** grid units throughout. Millimetres only appear when fitting a page to paper for printing. Control drawings have no scale.
- **Conductors (potentials):** a conductor is every terminal joined by wire without passing through a component. It has one ID/number and a 1-to-many set of terminals: a start, and any number of mid and end points. Example: 102 starts at L, loops into R1 and on to S1; the R1–S1 link is still 102. The number only changes once the circuit passes through a contact, coil or other component. The drawn wire segments belong to a conductor, and numbering is a trace of the circuit.
- **Templates and symbols:** live in a shared library. Using one copies it into the project, so library changes never alter existing projects.

## 4a. Page format

- **A4 landscape** is the primary target. Technicians on site work from these prints, and A3 is cumbersome in the field. A3 can come later as an option.
- **75 columns** across the drawing area. Column numbers are printed below the drawing frame every 10 columns (10, 20 … 70), with tick marks on the frame every 5 columns.
- **No rows.** The left and right edges of the frame carry evenly spaced, unlabelled tick marks, so you can judge where you are vertically on a printout.
- The panel boundary is a thin dash-dot line across the lower part of the drawing area, with terminals sitting on it.
- The drawing area is 150 × 90 grid units (one unit ≈ 1.847 mm); the title block is kept to three 7 mm rows so the drawing gets the room.
- **Text styles** are set in millimetres (ISO 3098 type B), never in grid units: `title` 5, `heading` 3.5, `tag` 2.5, `detail` 1.8, `note` 2.5. Nothing is drawn under 1.8 mm. Line weights: `thin` 0.25, `thick` 0.5, `frame` 0.7 mm. All in `core/geometry.ts`.

### Title block (v1)

A simple title block along the bottom, with the same fields as the reference set. No logos or company data yet; we're building the framework.

| Area | Fields |
|---|---|
| Logo box | Empty placeholder |
| Project | Project, Panel name, Sheet title |
| Sheet | Sheet x of y, Job no., Drawn by + date, Checked by + date, Drawing ref. |
| Revisions | Table of Issue no., Date, Drawn by (latest at the bottom) |

All fields are filled from project data, except the sheet title and sheet number, which come from the page.

## 5. Symbols

Keep to around 20. Protective devices are drawn as plain switches and the tag gives their purpose (F1, Q1, MCB1).

Draft list:

1. Switch / contact, normally open
2. Contact, normally closed
3. Changeover contact
4. Push button, NO
5. Push button, NC
6. Selector / keyswitch (2 and 3 position)
7. Multi-pole switch: isolator (hand operated), contactor main contacts (coil operated) or circuit breaker, with NO and NC auxiliary poles numbered 13/14, 21/22…
8. Fuse
9. Relay / contactor coil
10. Timer coil: on-delay, off-delay, on- and off-delay, interval, cyclic ON-first and OFF-first, with the maker's function code (e.g. "C") printed beside it
11. Timer contact
12. Indicator lamp: +V / -V terminals (they're often 24 V DC), optional lamp-test terminal LT beside +V, two-letter IEC 60757 colour code written Rd, Ye, Am, Gn, Bu, Wh, Cl
13. Terminal
14. Socket outlet
15. Transformer
16. Motor (3-phase)
17. Distribution block / busbar
18. Earth
19. Plant view (box with break line, see §6)
20. Off-page / continuation arrow: open arrow pointing away for "going to", filled arrow pointing in for "coming from". Pairing two arrows makes one of each.
21. Cable screen: an ellipse across the cores with the drain taken to a terminal

Multi-terminal symbols keep the switch pole pitch (3 units) between terminals, so a transformer or motor wires straight down from the MCB or contactor above it.

Symbols are defined in code or simple SVG + terminal positions, not in a symbol editor.

## 6. Plant

A plant item (a fan, a pump, a BMS module) is defined once, with all its terminals.

Each time it's placed on a page you place a **view** of it:

- Each terminal has a checkbox. Only the ticked terminals are shown.
- If any terminals are hidden, a squiggly break line is drawn automatically to show there's more.
- Typical use: 230 V power terminals on one page, digital controls on another, network on a third.
- The box is as wide as its shown terminals need. Terminals can be grouped by function (written `L N E | ENABLE: 1 2 | 0-10V: 3 4`); each group's name is printed in bold inside the box under its terminals. The tag, description and any information lines (model, rating) are printed left-aligned under the box.

Checks:

- A terminal not shown on any page → warning.
- A terminal shown on two pages → warning (unless allowed).

## 7. Panel boundary

Each page has a real boundary between panel internals and field equipment, not just a drawn line.

- Every element knows whether it's internal or external.
- A wire crossing the boundary must land on a terminal, or it's flagged.
- Terminal schedules and cable schedules are generated from this.

## 8. Numbering and cross-references

### Component designations

- Each project picks a **designation standard** from a list, e.g. IEC 81346 or BS 3939. This sets the letter prefixes for every component type (relay, contactor, fuse, lamp, switch, terminal, transformer, motor, sensor).
- The standard is applied project-wide. Changing it relabels the whole project.
- Custom overrides (e.g. R for relays) are allowed per component type, but discouraged: they sit behind an "advanced" option and the project shows that it deviates from its standard.
- Prefix tables: see [`designations.md`](designations.md). IEC 81346-2:2019 single-letter table is done; BS 3939 needs a copy of the standard.

### Position-based numbering (default)

The 100-column grid gives every point on a page an address: `page-column`, e.g. `10-16`. With a printout on site, a reference tells you exactly which page and column to go to.

- **Component tags:** prefix + position, e.g. relay coil `K10-16` (sheet 10, column 16). The position is the coil, or the main part of a component.
- **Conductor numbers:** position of the conductor's start point, e.g. `11-22`.
- **Terminals:** position of the terminal on the terminal rail, e.g. `10-12`, grouped by terminal strip.
- **Collisions:** the item highest on the page keeps the plain address. Each further item in the same column, working down the page, gets a letter: `11-22`, `11-22A`, `11-22B`, `11-22C`… This is common for conductors in vertical rungs. Dots are avoided because they read like decimals on a ferrule.
- **Stability:** numbers are recalculated on demand ("renumber"), not on every move, so a drawing doesn't change under you while you're working. Items can be locked to keep their number.
- Sequential numbering (100, 101…, K1, K2…) is available as an alternative scheme.

### Cross-references

- Linked elements (coil ↔ contacts) show each other's position references.
- Contact tables under coils are generated: which contacts exist, NO/NC, and where they are.
- Labels can contain fields, e.g. `{plant:p1.tag} RUNNING`, so section titles, motor labels and door labels always match the plant tag.

## 9. Simulation workbench (later)

FreeCAD-style workbench switch: same pages, different mode.

- Basic digital relay logic only: switches, push buttons, keyswitches, coils, contacts, timers, lamps.
- Clicking a switch toggles it. Coils energise when there's a path from supply to return through closed contacts. Linked contacts change state. Repeat until stable.
- Latching and interlocks work automatically. Timers are a small add-on.
- Purpose: verify a design for free before building it, especially where live testing is risky (e.g. an ATS changeover at 230 V).
- No motors, analogue or power flow.

## 10. Rule checks (later)

- Unconnected terminals and dangling wires.
- Coils with no contacts, contacts with no coil.
- Boundary crossings without terminals.
- Plant terminals not shown, or shown twice.
- Logic rules checked by the simulator, e.g. "these two contactors must never both be closed" — for an ATS, it searches for any input combination that parallels the supplies.

## 11. UI

- **Left sidebar:** page list, with titles and maybe thumbnails. No tabs along the top — they duplicate the page list.
- **Split view:** two pages side by side. Clicking a cross-reference can open the linked page in the other half.
- **Right sidebar:** list of elements on the current page, synced with selection on the canvas. Below it, the properties of the selected element, with dropdowns for links and plant. No double-click pop-ups.
- **Table view:** every element in the project as a row. Filter by type or plant, edit tags in bulk.
- **Workbench switch:** Draft / Simulate.

## 12. MCP

The local server exposes MCP tools so Claude can draft and edit drawings directly. Draft list:

- `project_info`, `list_pages`, `get_page`
- `add_page`, `add_element`, `move_element`, `delete_element`
- `connect` (terminal to terminal), `disconnect`
- `add_plant`, `place_plant_view`
- `apply_template`
- `renumber`, `check`
- `export_pdf`
- `simulate` (later)

All tools call the same core module as the UI.

## 13. Benchmark

The gold-standard test is reproducing a real 12-sheet life safety panel set, fully tool-assisted. See [`benchmark-lsp01.md`](benchmark-lsp01.md).

Reference drawings from other companies are proprietary. They are never committed to the repo, and anything derived from them must be anonymised.

## 14. Milestones (draft)

1. **Skeleton:** server, project JSON load/save, one page, place and move symbols on the grid.
2. **Wires:** connect terminals, auto-routing, manual drag.
3. **Pages and title block:** page list, title block template, A4 PDF export.
4. **Numbering and cross-references.**
5. **Plant views, panel boundary, section boxes.**
6. **Element list, properties panel, table view.**
7. **Templates and revisions.**
8. **MCP server.**
9. **Benchmark:** rebuild LSP-01.
10. **Simulation workbench.**

## 15. Decisions log

| Topic | Decision |
|---|---|
| Name | Ferrule. Repo: github.com/Cryptdos/ferrule |
| Front end | Svelte |
| Server runtime | Bun |
| Units | Grid units; mm only for print scaling |
| Wire IDs | Per conductor/potential, 1-to-many terminals |
| Templates | Shared library, imported into projects |
| Designations | Selectable standard (IEC, BS 3939…), custom overrides discouraged |
| Numbering | Position-based (page-column) by default |
| PDF | Flat, no clickable links |
| Page size | A4 landscape primary; A3 later |
| Page grid | 75 columns, numbered every 10; unlabelled tick marks down the sides, no rows |
| Title block | Simple v1: project, panel, title, sheet, job no., drawn/checked, drawing ref., revision table |
| Designation default | IEC 81346-2:2019, single-letter prefixes |
| Collisions | Topmost keeps plain address; then A, B, C… down the column |
| CI | GitHub Actions: install, type-check, test on every push and PR |
| Routing results | Routed in the browser (libavoid wasm) and stored in the project as points, so printing, PDF and MCP draw stored routes and don't need the router |
| PDF engine | Headless Edge/Chrome `--print-to-pdf` of the print view, not Playwright: Edge is on every Windows PC, so the portable .exe needs nothing installed. Browser *Print* as fallback |
| Font | osifont (ISO 3098 lettering), LGPL-3 + font exception variant, bundled. The only font on drawings, screen and PDF; single weight, no bold |
| Grid unit | 1 unit ≈ 1.847 mm on A4 (2 units per column); symbols and terminals snap to whole units. Text and line weights are named styles in mm |
| MCP transport | Streamable HTTP at /mcp (JSON replies, no SSE stream needed) plus `--mcp` stdio, which relays to a running Ferrule or starts one, so editor and Claude share one server |
| Concurrent edits | Project files carry a version (file mtime). Saves send If-Match and are refused if someone else saved since; open editors get change events (file watch → SSE) and reload |
| Simulation | Conductors are nodes; contacts, buttons, selectors, isolators and field plant views are switched links; coils and lamps are loads between a CCT… rail and the 0V rail. Settle until stable; on/off-delay timers on a simulation clock. Plant views act as volt-free field contacts |
| Logic rules | Breadth-first search over operator actions (operate, press, wait for timers) for the shortest sequence that breaks a rule; also reports shorts and chatter. Only inputs that can influence the rule's coils are searched; isolators and breakers stay closed unless asked. (From v0.2 step 8a the rules are **expectations**, controller.md §6.) |
| Wires to rails | Rail taps slide to sit directly above/below the other end, so rung wires stay straight when symbols move |
| Review 1 (2026-11-21) | Palette lists parts by name with a small icon and a search box. Coil contact tables sit to the right of the coil and can be dragged; double-click jumps contact ↔ coil and arrow ↔ arrow, and the part you land on is ringed until you select something else. Section boxes resize from any edge. Text boxes commit when you click away. Wires carry a core colour (printed at the source end, the number just after it) and a function (printed at each terminal end). Colour codes are written with a capital first letter: Bu, Rd, GnYe. Smaller symbol text (tag ≈ 1.9 mm). Format version 2: lamp terminals L/N become V+/V-, colour letters become IEC codes, on load |
| Review 2 (2026-11-21) | **Workbenches** are strict: Draft (electro-mechanical only), Annotate (text, boxes, plates, pictures, sections, clouds), GA, Simulate; each shows and selects only its own things. **Files:** one `.ferrule` JSON file anywhere, pictures embedded as data URLs (≤2400 px), recent list for files outside `projects`; delete moves to `projects/Deleted`. **Plant tags** follow the position scheme: prefix + sheet-column of the first view (`SEF-3-13`, default `U`); layout as the LIFT 2 example (terminal boxes along the top, group names in capitals over them), optional *power by others* break; duplicate terminal names allowed in different groups. **Link arrows**: one source, partner is the destination; 1-to-1 only (a 1-to-many fan-out is better drawn as a rail with the same name). **Rails/busbars with the same name** are one conductor across sheets. **Field wires** dashed, numbers hidden by default; a wire keeps its number through a terminal. **Renumber** previews a table of changes before applying. **Timers** use IEC 61131-3 names (TON, TOF, TP; flashers have no IEC name). Amber lamps migrate to yellow. **Simulation**: Incoming supply part (3ph+N/3ph/1ph+N/DC) with separate phases, transformers supply their secondary when energised, legacy CCT/0V rails if no supply part; plant groups are inputs (C/NO/NC move together) or outputs and may follow a coil with delay/invert; symbols draw their operated state. **GA**: separate sheets at a true scale (1:5…1:20 to fit A4), items stored in mm, devices linked to schematic parts by id (each part on one GA at most), generic sizes per kind editable per project. **Routing**: 1-unit stub out of every terminal, tag and note text are obstacles, rail taps slide only when the far end faces the rail |
| Review 3 (2026-11-21) | **Layout:** two-row top bar (file and workbenches, then the workbench's tools); common actions are icons. The drawing fills the window, with floating see-through panels: the browser (sheets folding open to their items, then parts), a draggable properties box that remembers its place (shown only when something is picked), and a sheet overview with a draggable view outline. Fit centres the sheet in the part the browser doesn't cover. **Spare sheets**: annotations only, enforced in the model (adding a drafting part to one is refused). **Annotations** (notes, revision list, legend) are drawn from data: `draw(el, t)` gets project-derived content through `GeometryText`, so canvas, print and PDF draw them alike. Text is measured with osifont's own advance widths (generated table) for wrapping and fitting. Annotations are never routing obstacles. **GA labels**: centred, along the longer side, shrunk to fit down to 0.75 units (≈1 mm), then knocked out of the lines instead. **Device table**: shared library at `library/devices/devices.json` with each device's files in its own folder; projects copy the entries they use (`devices`), GA items reference one (`device`) and keep hand-set sizes; `useDeviceLibrary: false` per project |
| Panel boundary as a terminal block (2026-11-21) | Replaces the dashed line, following common panel-builder practice: a block 3 units tall (≈4.2 mm) centred on the boundary, inset 2 units from each side. Upright terminals exactly on it are drawn as cells (`params.onBlock`, kept up to date by `updateZones` and on load) with connection points at ±1.5. The number goes up the cell at 1.05 units (≈1.5 mm), centred, shrunk only if it won't fit (3-13A). Strip names sit in the block at the left end and where the strip changes, so cells carry just the sheet-column number; schedules write `X1:3-13`. Moving the boundary moves its terminals; terminals dropped within 1 unit snap in. Terminals get a type: plain, fused (IEC fuse above the cell), disconnect (open knife above it) or switched fuse (knife with the fuse on the blade), moving the panel-side connection 2 units further up; wires whose ends no longer meet are re-routed when the project is opened, edited or printed (`routesStale`). GA strips size each terminal by its type |
| Grid and text, v0.2 (2026-11-23) | 75 columns, 150 × 90 units (1.847 mm each). Five text styles in mm (title 5, heading 3.5, tag 2.5, detail 1.8, note 2.5) and three line weights; a test fails if any symbol draws text under 1.8 mm. Terminal block cells keep their number at 1.8 mm; a number too long for the cell makes every cell in that block taller (`params.cellHalf`, set by `fitBlock` on routing). Plant terminal boxes are 1 unit apart and their names run up the box, like block cells. Labels can be written on two lines. File format 3; older files are refused ("made with Ferrule 0.1") and the upgrade code is gone. The LSP-01 example is redrawn for the new grid |
| Busbars and distributions, v0.2 (2026-11-23) | The control rail is gone: one **Busbar** part, styled distribution (0.5 mm, tagged W) or control (0.35 mm, no tag). Project **distributions** (name, kind: AC line / AC neutral / DC + / DC 0 V / earth, voltage, colour, function) start empty; busbars, link arrows and incoming supply terminals pick one by id (`params.dist`, `params.dist_<terminal>`). Busbars on the same distribution are one net on every sheet; a busbar on none is local. **Numbering stops at busbars**: each wire leaving one is its own conductor with its own number; `netJoins` gives the electrical joins (busbar taps, distributions) to simulation. Without an Incoming supply, line/DC + distributions supply and neutral/DC 0 V return. Two supplies on one conductor is a short. Templates carry the distributions they use (matched by name when stamped elsewhere). Simulation draws live busbars and wires in their core colour (red when unset) and lights returns too |
| Parts audit, v0.2 (2026-11-23) | 31 parts to 26. **Timer contact** gone: a contact linked to a timer coil is timed by it (switches on the timer's output, draws the delay mark, prints 17-18 / 15-16 / 15-16/18), unless ticked *Instantaneous*. **Push button** NO, NC or both. **Selector** 2 or 3 positions, 1–4 poles, each NO/NC with the positions that close it, or a changeover (terminals k3/k4, k1/k2, k1/k2/k4 by pole); legend under the head; Simulate steps through the positions. **Isolator** operators: rotary, door handle, key, none. **Text** takes over Notes (Markdown, alignment, optional wrap); empty text is removed on deselect. GA Note tool gone. **Flip** (`F`, `Element.flip`, applied before rotation); fit is a tap of Space. Lamp terminals +V, -V, LT; DC supply +V, -V. Cable screen a rounded rectangle with its drain out to the side. 0.2 test-build drawings (format 3) are mapped on load (to be removed at release) |
| Wires, labels and terminals, v0.2 (2026-11-23) | A wire's colour, function and number print together at its source end, 2 units in, along the wire; on a wire too short for them, centred (but not across a busbar). A number prints once per conductor per sheet, on its longest run, and not on earth wires; *Show number* overrides. Wires from a cable screen are dashed. Busbar colour is a dropdown; a new wire takes the colour of a busbar, or of the wire on the other side of an in-line part's pole, once. **Earth** terminal type (earth sign, green-yellow on the GA); **Terminal strip line** groups the terminals it crosses. Labels can have a width and wrap. Link arrows: label at the tip then the reference; a destination shows its source's label; *Link…* and *Link to a new arrow*. References always in full; a contact table carries its coil's tag. |
| Windows and interface, v0.2 (2026-11-23) | Every dialog is a floating window (title bar with minimise and close, draggable, remembers its place) that doesn't block the drawing; several can be open. The second row of the top bar is in one order on every workbench: tools, undo/redo, view, menus. Annotate's section, cloud, picture and logo are in its parts list. Placing places one part, then back to Select (*Keep placing until Esc* in Settings). What the workbench can't pick is grey on screen. The sheet is off-white (#FAF8F3) on screen, white in print; optional dark chrome. Overview shows `3 / 14`. Split resizes, zooms and pans with its own overview. Shift+scroll steps number boxes by 10. Save as asks *Replace it?*. Settings has a Status page: version, folders, address, Claude's MCP connection and last tool, settings to paste, Quit Ferrule. Export PDF names its failure and offers Print. |
| GA and simulation, v0.2 step 7a (2026-11-23) | Clicking a fuse in Simulate blows it (drawn broken), again replaces it. Sheet settings have a *Sheet type* (Schematic / Spare / GA); an empty sheet can become a GA. GA notes are gone (Text annotations instead). A GA's scale is any number, Fit giving the largest that fits to a half step. A placed terminal strip follows its strip in the schematic (terminals and length), and Check reports the change until its GA is opened. The device table's *Suits* lists schematic parts. |
| Annotate and GA, v0.2 step 7b (2026-11-23) | Annotate gains **Arrow** (tip by its handle, one or both heads), **Highlight** (translucent marker band, multiplied over the drawing, prints), **Call-out** (numbered 1, 2, 3… per sheet) and **Polygon** (drawn corner by corner; corners by their handles). Arrows and polygons keep their corners in `params.pts`; turning or flipping turns the points. A GA sheet's view is **backplate**, **door front** or **door back**. A door front has one or two leaves (`ga.leaves`: width, hinge); other door sheets are `of` it: the back mirrors its devices (dashed, with cut-outs), and a front `of` it shows one leaf at its own scale (`ga.leaf`), taking dimensions only. Door devices (lamps, push buttons, selectors, an isolator's door handle as `part: "handle"`) are drawn from their schematic parts. GA items add **label plates** (true size, engraved text height) and **dimensions** (`kind: "dim"`, chain or baseline, points attached to items' edges or middles or the enclosure, so they follow). The GA tools (DIN rail, trunking, dimension, label plate) are in the browser; *Place parts…* is a window. **Bill of materials** (Schedules, CSV): by GA sheet, devices by device-table entry or generic size, terminals each, plates, rail and trunking in metres. **Rail fill** in Check and a rail's properties: devices across the rail's line, mm and %, overlaps and overhangs warned. Door cut-outs (`cutout`: "22.3" or "92 x 92") on door devices, shown on the back. |
| Field IO for plant and expectations, v0.2 step 8a (2026-11-23) | Plant groups are replaced by **IO points** ([controller.md](controller.md) §3): `PlantItem.terminals` are pin numbers, `pins` holds each pin's optional id and group, and `points` its signals, each with a **form** (contact, powered output, dry/powered input, analogue in/out, supply in/out, comms). Quick entry (`Mains: L N E \| R1: C NO NC`) guesses forms; *Pins and points…* is the table. A plant view prints a pin's id in a row under its number and labels each run by its group, else its point. In simulation each pin is the device's own node (`pin:<plant>:<pin>`), shared by every view. Outputs are clicked or **follow** up to two conditions (and/or) after a delay; inputs sense their pins (dry: loop closed; powered and supply in: voltage across). **Supply out** points are sources on their distributions (two sources on one distribution aren't a short). **Expectations** (`Project.expectations`) replace logic rules: *should be on/off when …* for inputs (iff; held as "wait" only while a timer between the input and its conditions runs), *never …* for anything. Check logic searches each expectation over only the inputs that can affect it. Check adds the field IO checks (controller.md §10). Test-build files: groups become points and rules become *never* statements on load |
| Controllers, v0.2 step 8b1 (2026-11-23) | A **controller** (`Project.controllers`: description, prefix, `slots` in rail order) is its modules and spare slots. A **module** is a plant item with `module` set (controller, type psu/host/di/do/uio/ai/ao, channels, maker, model, bus address), so it's wired, scheduled, checked and simulated like plant, and tagged by its first view: prefix A, `A3-23`. The **generator** (`modules.ts generatePins`) fills its pins and points from a pattern; a shared common is one pin in several points. A module view is a plant view drawn the other way up (`params.pmod`): title row, heading, channel names, ids and numbers, terminals along the bottom edge leaving downwards, each point's `label` along its wire, a break at a cut edge. Points are named `A3-23:DI2`, adding `(4-10)` when drawn on a continuation. Plant addresses are taken per prefix in Renumber, so `SF-3-23` and `A3-23` share a column. Templates leave module views out |
| Controllers, v0.2 step 8b2 (2026-11-23) | **Controller map** (`ctrlmap`, Annotate Tables, `params.ctrl`, wraps to `params.width`): a box per slot in rail order with tag, circled bus address, maker, model, type and where it's drawn; spares dashed. **IO schedule** and **plant points** schedule (`schedules.ts`), with what each point is wired to along its conductors (points, link arrows to where they go, terminals, parts). **GA:** a GA device item can be a module (`GaItem.module`); a controller is one *Place parts* item placing its modules side by side onto a rail, sized by their model or generically (`ctrlPsu`, `ctrlHost`, `ctrlIo` per 2 channels, changeable like the other sizes). **Library models:** a device can carry a module's pins table (`module`: type, channels, terminals, pins, points); *Save model* and *Add a saved model…*; `ModuleInfo.device` sizes it on the GA and names it in the bill of materials. Check adds the controller checks. MCP `place_controller`, `schedules` io/plant/bom, `update_page` type |
| Windows and top bar, v0.2.1 step 1 (2026-11-23) | A menu button toggles its window (open, and closed when clicked again). `Esc` on the drawing cancels what's being drawn or placed, then closes the topmost window (`Modal.svelte closeTopmost`), then clears the selection. **Table** is a window from a labelled button among the menus. The second row reads undo, redo · Fit, Split · Select, Wire · menus on every workbench. The dark interface is toned down to dark greys. Parts that are only text (Text, Symbol legend, Controller map) get drawn icons; long or large ones (Box, Terminal strip line) are drawn small for theirs. *Label width* is always shown in properties |
| Parts and Annotate, v0.2.1 step 2a (2026-11-23) | Lamp colours are Rd, Ye, Gn, Bu, Wh (none and clear become white). Call-outs have *Auto* (`params.auto`, default on): numbered by placing order on the sheet, skipping hand-set numbers. The Annotate *Logo* entry and **label plate** (`plate`) part are gone: label plates are GA items; files' plates become boxes. **Labels are one line** (`labelWidth` wraps them); line breaks in labels become spaces, with a width set from the widest line. `R`/`F` turn and flip a part before it's placed (`placeRot`, `placeFlip`). Plant terminal boxes are at least tall enough for a 5-character name. Strip lines draw over terminals. The **cable screen** has no tag and no tail: points `E` (right) and `E2` (left), bridged. PE earth redrawn centred. The incoming supply places its names and label for the way its arrows point after turning and flipping. The logo loses its cable |
| Logo, v0.2 step 8c (2026-11-23) | A crimp ferrule on a cut cable, on the diagonal: the red collar of a 1 mm² ferrule (straight walls, a shoulder down to the sleeve), the crimped grey sleeve, a copper tip, and a black cable cut at a slant showing its copper core. Red is the only colour, as red is the app's one colour (live in Simulate); copper marks the conductor at both ends. Drawn three times for its sizes (`src/web/logo`: full detail from 48 px, simplified at 24–32 px, flat shapes at 16 px), on an off-white tile the colour of the sheet. It's the browser tab icon, the project list's heading and the exe's icon (`ferrule.ico`, every size drawn for itself; set only when the exe is built on Windows, so CI's exe job runs there) |

## 16. Open questions

- Two-letter IEC 81346-2 subclass codes (needs the full standard; we only have the preview).
- BS 3939 prefix table (needs a copy of the standard).

## 17. CI

GitHub Actions, in `.github/workflows/ci.yml`. Runs on every push and pull request:

1. Set up Bun.
2. Install dependencies.
3. Type-check.
4. Run tests (core module: numbering, cross-references, checks, simulator).

Later: render the LSP-01 benchmark and compare it against a stored result, so layout changes are caught.

## 19. First build plan (agreed 2026-11-20)

- **Scope:** milestones 1–3 (skeleton, wires with routing, pages + title block + A4 PDF export). Stop for review after that.
- **Git:** one branch and pull request per milestone; the user reviews and merges. CI must pass on each PR.
- **Delivery:** a portable Windows .exe built with `bun build --compile`. The user double-clicks it and opens the browser. Nothing to install on the Work PC.
- **Drawing defaults:**
  - Plain black and white.
  - Terminal markings: A1/A2 on coils, 13/14 on NO contacts, 21/22 on NC contacts, L/N on lamps.
  - Control rails: 24 V AC, labelled CCT and 0V. Further control circuits are CCT1, CCT2 … as needed.
- **Symbols:** IEC 60617 shapes in our own plain style.
- **Reference drawings** stay in the user's C:\Temp\eCAD folder and are never committed.

## 18. References

- IEC symbol shapes for reference: https://symbols.radicasoftware.com/225/iec-symbols (draw our own; don't copy files unless the licence allows reuse).
