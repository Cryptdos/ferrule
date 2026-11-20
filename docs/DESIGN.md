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
- A3 PDF export.
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
- **PDF export:** the server renders pages in headless Chromium via Playwright and prints them to a flat A3 PDF (no clickable links needed).
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

- **Units:** grid units throughout. Millimetres only appear when fitting a page to A3 for printing. Control drawings have no scale.
- **Conductors (potentials):** a conductor is every terminal joined by wire without passing through a component. It has one ID/number and a 1-to-many set of terminals: a start, and any number of mid and end points. Example: 102 starts at L, loops into R1 and on to S1; the R1–S1 link is still 102. The number only changes once the circuit passes through a contact, coil or other component. The drawn wire segments belong to a conductor, and numbering is a trace of the circuit.
- **Templates and symbols:** live in a shared library. Using one copies it into the project, so library changes never alter existing projects.

## 5. Symbols

Keep to around 20. Protective devices are drawn as plain switches and the tag gives their purpose (F1, Q1, MCB1).

Draft list:

1. Switch / contact, normally open
2. Contact, normally closed
3. Changeover contact
4. Push button, NO
5. Push button, NC
6. Selector / keyswitch (2 and 3 position)
7. Multi-pole switch / isolator (with auxiliary poles)
8. Fuse
9. Relay / contactor coil
10. Timer coil (delay on, delay off)
11. Timer contact
12. Lamp (with colour letter)
13. Terminal
14. Socket outlet
15. Transformer
16. Motor (3-phase)
17. Distribution block / busbar
18. Earth
19. Plant view (box with break line, see §6)
20. Off-page / continuation arrow

Symbols are defined in code or simple SVG + terminal positions, not in a symbol editor.

## 6. Plant

A plant item (a fan, a pump, a BMS module) is defined once, with all its terminals.

Each time it's placed on a page you place a **view** of it:

- Each terminal has a checkbox. Only the ticked terminals are shown.
- If any terminals are hidden, a squiggly break line is drawn automatically to show there's more.
- Typical use: 230 V power terminals on one page, digital controls on another, network on a third.

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
- Exact prefix tables for each standard are to be confirmed against the standards before implementation.

### Position-based numbering (default)

The 100-column grid gives every point on a page an address: `page-column`, e.g. `10-16`. With a printout on site, a reference tells you exactly which page and column to go to.

- **Component tags:** prefix + position, e.g. relay coil `K10-16` (sheet 10, column 16). The position is the coil, or the main part of a component.
- **Conductor numbers:** position of the conductor's start point, e.g. `11-22`.
- **Terminals:** position of the terminal on the terminal rail, e.g. `10-12`, grouped by terminal strip.
- **Collisions:** if two items would get the same address, a suffix is added (`10-16.1`).
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
3. **Pages and title block:** page list, title block template, A3 PDF export.
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

## 16. Open questions

- Exact prefix tables for each supported standard.
- Collision suffix format.
- CI setup.

## 17. References

- IEC symbol shapes for reference: https://symbols.radicasoftware.com/225/iec-symbols (draw our own; don't copy files unless the licence allows reuse).
