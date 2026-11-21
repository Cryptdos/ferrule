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
- **100 columns** across the drawing area. Column numbers are printed below the drawing frame every 10 columns (10, 20 … 90), with tick marks on the frame every 5 columns.
- **No rows.** The left and right edges of the frame carry evenly spaced, unlabelled tick marks, so you can judge where you are vertically on a printout.
- The panel boundary is a thin dash-dot line across the lower part of the drawing area, with terminals sitting on it.
- The drawing area is 200 × 120 grid units; the title block is kept to three 7 mm rows so the drawing gets the room.

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
10. Timer coil: on-delay, off-delay, on- and off-delay, interval, cyclic ON-first and OFF-first, with the maker's function code (e.g. Selec 600XU "C") printed beside it
11. Timer contact
12. Indicator lamp: V+ / V- terminals (they're often 24 V DC), optional lamp-test terminal T beside V+, two-letter IEC 60757 colour code (RD, YE, AM, GN, BU, WH, CL)
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
| Page grid | 100 columns, numbered every 10; unlabelled tick marks down the sides, no rows |
| Title block | Simple v1: project, panel, title, sheet, job no., drawn/checked, drawing ref., revision table |
| Designation default | IEC 81346-2:2019, single-letter prefixes |
| Collisions | Topmost keeps plain address; then A, B, C… down the column |
| CI | GitHub Actions: install, type-check, test on every push and PR |
| Routing results | Routed in the browser (libavoid wasm) and stored in the project as points, so printing, PDF and MCP draw stored routes and don't need the router |
| PDF engine | Headless Edge/Chrome `--print-to-pdf` of the print view, not Playwright: Edge is on every Windows PC, so the portable .exe needs nothing installed. Browser *Print* as fallback |
| Font | osifont (ISO 3098 lettering), LGPL-3 + font exception variant, bundled. The only font on drawings, screen and PDF; single weight, no bold |
| Grid unit | 1 unit = 1.385 mm on A4 (2 units per column); symbols and terminals snap to whole units |
| MCP transport | Streamable HTTP at /mcp (JSON replies, no SSE stream needed) plus `--mcp` stdio, which relays to a running Ferrule or starts one, so editor and Claude share one server |
| Concurrent edits | Project files carry a version (file mtime). Saves send If-Match and are refused if someone else saved since; open editors get change events (file watch → SSE) and reload |
| Simulation | Conductors are nodes; contacts, buttons, selectors, isolators and field plant views are switched links; coils and lamps are loads between a CCT… rail and the 0V rail. Settle until stable; on/off-delay timers on a simulation clock. Plant views act as volt-free field contacts |
| Logic rules | Breadth-first search over operator actions (operate, press, wait for timers) for the shortest sequence that breaks a rule; also reports shorts and chatter. Only inputs that can influence the rule's coils are searched; isolators and breakers stay closed unless asked |
| Wires to rails | Rail taps slide to sit directly above/below the other end, so rung wires stay straight when symbols move |
| Review 1 (2026-11-21) | Palette lists parts by name with a small icon and a search box. Coil contact tables sit to the right of the coil and can be dragged; double-click jumps contact ↔ coil and arrow ↔ arrow, and the part you land on is ringed until you select something else. Section boxes resize from any edge. Text boxes commit when you click away. Wires carry a core colour and function after their number. Smaller symbol text (tag ≈ 1.9 mm). Format version 2: lamp terminals L/N become V+/V-, colour letters become IEC codes, on load |

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
