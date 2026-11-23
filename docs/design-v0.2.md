# Ferrule v0.2: design

What changes after testing v0.1.0-pre, and why. It answers every note in the testing doc (`v0.1.0-pre Testing/testing.md`, numbered 1–75 below) and the follow-ups from 22/11/26. [DESIGN.md](DESIGN.md) stays the record of how Ferrule works; decisions made here are copied into its decisions table as each part lands.

**The ethos, restated:** simple, modular parts; one way to do each thing; a clean interface with no redundant parts; the same conventions everywhere, so engineering takes less time and less effort. Every change below is checked against that.

**No backwards compatibility before 1.0.** v0.2 writes file format **version 3** and refuses older files with a plain message ("made with Ferrule 0.1; this version can't open it") rather than half-opening them. The upgrade code in v0.1 (old file extension, lamp colours, plant tag prefixes, terminal block inference, lamp terminal names) is removed, and v0.2 adds none: no rescaling to the new grid, no rail-to-busbar conversion, no part conversions. That keeps the code small while the format is still moving. From 1.0 on, every format change comes with its upgrade. Checking files on load stays, because files can be hand-edited or written over MCP.

## Contents

1. [Bigger grid and readable text](#1-bigger-grid-and-readable-text)
2. [Busbars and distributions](#2-busbars-and-distributions)
3. [Parts audit](#3-parts-audit)
4. [Contacts, timers and selectors](#4-contacts-timers-and-selectors)
5. [Terminals and the terminal block](#5-terminals-and-the-terminal-block)
6. [Wires, labels and links](#6-wires-labels-and-links)
7. [Annotate](#7-annotate)
8. [GA and controllers](#8-ga-and-controllers)
9. [Simulation](#9-simulation)
10. [Windows and interface](#10-windows-and-interface)
11. [The app around it](#11-the-app-around-it)
12. [Bugs found in testing](#12-bugs-found-in-testing)
13. [Every testing note and its outcome](#13-every-testing-note-and-its-outcome)
14. [Order of work](#14-order-of-work)

---

## 1. Bigger grid and readable text

**Problem (2, 3, 7, 18, 19).** Printed on A4, the drawing reads like a thumbnail: tags are about 1.9 mm, terminal numbers and contact tables 1.1–1.3 mm. ISO 3098 and common drafting practice put the smallest text at 1.8 mm and ordinary text at 2.5 mm. The cause is the grid: one unit is 1.385 mm (277 mm ÷ 200 units), so symbols are small too (a coil is under 3 mm wide), and text can't grow without crowding them.

**Decision: a bigger grid, done properly**, so everything scales together and stays in proportion.

| | v0.1 | v0.2 |
|---|---|---|
| Columns per sheet | 100 | **75** |
| Units per column | 2 | 2 |
| Drawing area | 200 × 120 units | **150 × 90 units** |
| One unit | 1.385 mm | **1.847 mm** (+33%) |

The sheet holds three quarters as much in each direction. The scanned sheet used about 65% of the width and 70% of the height, so a typical sheet still fits, with room to spare.

### Text styles, in millimetres

Every piece of text on a drawing uses one of five named styles, defined once, in millimetres (ISO 3098 type B heights). Symbols name a style; they never give a number. This is the "do it right" part: changing a size, or the grid again, is one edit.

| Style | Height | Used for |
|---|---|---|
| `title` | 5 mm | Cover sheet title |
| `heading` | 3.5 mm | Section box titles, title block main fields |
| `tag` | 2.5 mm | Part tags, labels, busbar names, link arrow labels, plant names |
| `detail` | 1.8 mm | Terminal and pin numbers, wire numbers, colours and functions, contact tables, cross-references, ratings, plant information lines, title block captions |
| `note` | 2.5 mm | Notes and text (the user can pick `detail` or `heading` instead) |

**1.8 mm is the floor.** Nothing is drawn smaller: where text won't fit (a long terminal number in a block cell), the part makes room rather than the text shrinking. A test fails if any symbol draws text under 1.8 mm.

Line weights get the same treatment: `thin` 0.25 mm (symbols, wires), `thick` 0.5 mm (busbars, terminal block, plant outline), `frame` 0.7 mm.

### Old projects

Not converted (see *No backwards compatibility* above): v0.1 projects are redrawn. The LSP-01 example is rebuilt by its script.

### Terminal block and plant terminals (18, 19)

At the new scale a block cell is 1 unit wide (1.85 mm) and 3 units tall (5.5 mm). Its number is `detail` (1.8 mm) running up the cell; a number that won't fit makes the cell taller across the whole block, not the text smaller. Fused, disconnect and switched-fuse marks scale with it and read clearly.

Plant terminal boxes narrow to the same 1-unit pitch, so a plant under the block lines up cell for cell.

---

## 2. Busbars and distributions

**Problem (5, 43, 61, 68, 73, follow-up 3).** There are two parts that do the same job (control rail and busbar). Busbars with the same *name* become one conductor across the whole project. That made W1-18 in ATS-1 live whatever the changeover did (73), until it was renamed `La`/`Na`. Wires leaving a busbar have no number (5). The `/2 /3 /5` list after a rail is clutter (5).

### One part: Busbar

The control rail is removed; **Busbar** does both jobs.

- *Style*: **distribution** (thick, 0.5 mm, a little thinner than today, 13) or **control** (thin, like a control rail today). Only the look differs.
- *Distribution*: which supply it carries, picked from the project's distribution list (below), or **Local** (this busbar alone).
- Core colour and function, same as a wire (68).
- Its name sits beside its tag (40), with an option to print it at both ends (41). There's no more list of other sheets: the name says what it is (5).

### The distribution list

A **Distribution** button beside Plant opens the project's list of supplies (43):

| Name | Kind | Voltage | Colour | Function |
|---|---|---|---|---|
| L (grid) | AC line | 230 V | Bn | L |
| N (grid) | AC neutral | | Bu | N |
| L (EPS) | AC line | 230 V | Bn | L |
| CCT | Control | 24 V DC | Bu | +24V |
| 0V | Control | 0 V | Wh | 0V |

- **New projects start with an empty list**, as projects start bare in general. A preferred setup is kept in a template project and duplicated.
- Busbars, link arrows and the incoming supply pick from this list instead of free text, so matching is by identity, not spelling.
- **Busbars on the same distribution are one conductor**, on any sheet. That gives the continuity that rails had, explicitly, and only where it's meant.
- **Local** busbars join nothing else (follow-up 3). That's ATS-1's W1-18: the changeover's output. It could equally be its own distribution, `L (ATS)`, if other sheets need it.
- Colour and function come from the distribution unless overridden.

### Wire numbers at busbars (5)

A busbar is a joint, like a distribution block: **numbering stops at it**. Each wire leaving a busbar gets its own number, by the usual position scheme. Electrically they're still joined, so simulation and checks see one net. This is the opposite of terminals, where a wire keeps its number (review 2) because it's the same conductor carried on.


---

## 3. Parts audit

**Ethos check (62).** Every part, and whether it earns its place.

| Part | Verdict | Why |
|---|---|---|
| Contact NO, Contact NC, Changeover contact | **Keep** | Distinct symbols, distinct behaviour |
| Timer contact | **Remove** | A contact linked to a timer coil *is* timed (§4). Two parts for one thing caused bug #6 |
| Push button NO / NC | **Merge** into *Push button* with a NO/NC/both setting | Same part, different contact |
| Selector / keyswitch | **Keep, reworked** (§4) | |
| Isolator / MCB / contactor | **Keep**, operators rationalised (36) | |
| Fuse | **Keep** | |
| Relay / contactor coil, Timer coil | **Keep** | Different behaviour, different settings |
| Indicator lamp, Socket, Transformer, Motor | **Keep** | |
| Terminal | **Keep**; adds an *Earth* type (§5) | |
| Busbar + Control rail | **Merge** into *Busbar* (§2) | Same job |
| Earth | **Keep** | |
| Link arrow | **Keep** | |
| Cable screen | **Keep**, redrawn (25) | |
| Incoming supply | **Keep**; picks a distribution | |
| Plant view | **Keep** | |
| Junction | **Keep** (not in the palette) | |
| Text + Notes | **Merge** into *Text*, with formatting | Notes is a superset |
| Box, Label plate, Section box | **Keep** | Different purposes: border, engraved plate, functional group |
| Picture, Revision list, Symbol legend | **Keep** | |
| GA Note tool | **Remove** (46) | Annotate's Text works on GA sheets |

Result: 31 parts become 26, and each is the only way to draw its thing.

---

## 4. Contacts, timers and selectors

- **Timed contacts follow their coil (6, 32).** Any contact linked to a timer coil switches with the timer's function (TON, TOF…), and the delay mark is drawn on it automatically. There's no function setting on the contact. A tick box, *Instantaneous*, covers the timer relays that also have plain contacts.
- **Flip (31, 39).** `F` flips a part top to bottom (contacts that must be drawn upside down still read correctly); `R` rotates. **Fit** moves to a tap of `Space` (8 and follow-up 14): tapping fits the sheet, holding Space and dragging still pans. The Fit button stays.
- **Selector (33, 35, 75).** One part, configured as:
  - positions: 2 (0–I) or 3 (I–0–II);
  - poles: 1 to 4;
  - each pole: which positions close it, and NO or NC. That gives the I → C+NO and II → C+NO arrangement (four terminals: two separate contacts), changeovers, and NC selector contacts (35).

  The position legend (`I 0 II`) moves clear of the terminal numbers (34).
- **Isolator operators (36).** Rotary handle, door handle, key, or *none* (operated by something else, e.g. a contactor). No push-to-operate.
- Timer function notes: "no IEC 61131-3 name" goes (37). The time box gets a `?` explaining what it takes: `500ms`, `5s`, `1.5s`, `2min`; decimals allowed (38).
- Lamp test terminal `T` becomes `LT` (30). Lamp terminals `V+`/`V-` become `+V`/`-V`, and the DC incoming supply's `+`/`-` become `+V`/`-V` (44).

---

## 5. Terminals and the terminal block

- **Earth terminals (9, 27, follow-up 7).** A fifth terminal *Type*: **Earth**. On the block its cell shows the earth sign ⏚ (osifont has it), drawn upright rather than turned with the number. Elsewhere it's the earth terminal symbol. Earth terminals are green-yellow in the GA and grouped with their strip.
- **Terminal strip line (55).** A Draft tool: draw a dashed line through a group of terminals (e.g. X0 in 161627) and name it; every terminal it crosses joins that strip. The line shows the strip name at its end. It's how a strip that isn't on the boundary is grouped and read.
- Sizes per §1.

---

## 6. Wires, labels and links

- **Junctions (15).** A wire number is printed once per conductor per sheet, on the longest run, not on every branch meeting at a junction.
- **Earth wires (24).** Wires to an earth or earth terminal get no number. *Number this earth wire* overrides it.
- **Cable screen (25, 26).** A rounded rectangle round the cores, its tail leaving to the side so it routes easily. The wire from the screen is dashed like the screen.
- **Colour and function (67).** Both print at the source end only, inset from the terminal (about 2 units), running along the wire like the colour does. That ends the clash in 215734 (`230V` over `Bn`).
- **Labels wrap (28, 65).** Any part label can have a width; longer text wraps onto more lines. The incoming supply's label is centred and wraps.
- **References (21).** Back to always showing the full reference (`11-06`), on the same sheet too.
- **Link arrows (69, 70, 71).**
  - Two arrows showing the same `1-24` is correct: that's the address of their partners, and both partners are in column 24 of sheet 1. It isn't a tag, so it can't take an A suffix. The arrow's label is what tells them apart.
  - The label sits at the arrow's tip, along the wire's direction: under it when the wire is horizontal, to its right when vertical, with the reference after the label. That clears the overlaps in 222814 and 223310.
  - A destination arrow takes its source's label, ticked by default (*Same label as its source*).
  - **Linking workflow:** select an arrow, click *Link…*, go to any sheet and click the arrow to pair with (Esc cancels), or *Link to a new arrow* to drop an already-paired partner. Details in [controller.md](controller.md) §5.
- **Coil tables (29).** A contact table has its coil's tag above it, centred, so a table moved away from its coil still says whose it is.

---

## 7. Annotate

- **New tools (16):** arrow, highlight (a translucent marker band), numbered call-out circles (auto-numbered 1, 2, 3… per sheet), polygon.
- **Door items (11).** Lamps, pushbuttons, rotary handles and meters on a door are drawn by the **GA door view** from the schematic parts themselves (lamp lens in its colour, handle with its positions), rather than as Annotate shapes. That way the door GA can't drift from the schematic. The placeholder boxes go.
- Text gains Notes' formatting (§3).
- **Controller map** table, with controllers: modules in rail order with tag, bus address, maker, model and where each is drawn ([controller.md](controller.md) §5).

---

## 8. GA and controllers

- **Strips keep up (45).** A placed terminal strip grows when terminals are added to that strip in the schematic (the GA shows it longer). **Check** reports a GA strip whose terminals changed since you last looked, until you open the GA.
- **Sheet type (12).** In sheet settings, *Spare sheet* becomes *Sheet type*: **Schematic / Spare / GA** (an empty sheet can become a GA).
- **Remove GA Note (46).**
- **Views (follow-up of 22/11/26):** a GA sheet shows one of **backplate**, **door front** or **door back**. Door front is what the operator sees (lamps, pushbuttons, handles, meters, label plates); door back is the same door from inside, mirrored, showing what's mounted through it and any rail or trunking on the door.
- **Split doors:** an enclosure has **one or two doors**. With two, each has its width and hinge side, and each door view shows one leaf (or both side by side, set per sheet).
- **Any scale:** the scale is a number you type (1:7.5, 1:12…), with Fit suggesting the largest that fits the sheet, so the layout uses the page well. The standard scales stay as quick picks.
- **Basic dimensioning:** a **Dimension** tool draws horizontal and vertical dimensions in mm, measured from the GA's own scale, so they're always right. It snaps to the enclosure, rails, trunking and devices. Two quick forms cover most needs: **chain** (gaps along a run: 2.00 / 1.00 / 1.00 …) and **baseline** (several distances from one edge, as when setting out rail heights). There are no angled or radial dimensions. A dimension is an annotation of the GA, so it moves with the items it's attached to.
- **Tools and *To place* swap places:** the GA tools (DIN rail, trunking, dimension, label) move into the browser's lower section, where the parts list is in Draft, as a small GA tool library. *To place* becomes a **Place parts…** window opened from the top bar, listing every panel part not yet on a GA, with search.
- **Device "suits" matches the schematic:** in the device table, *Suits* lists every placeable schematic part (contact, coil, timer, isolator, terminal…), not the GA's own size groups, so a device is matched to the parts you actually draw.
- **From typical panel design suites, worth taking (and not):**
  - **Take:** a **bill of materials** from the device table (maker, part number, quantity per device, by GA), exported as CSV with the other schedules; a **rail and trunking fill** figure on each GA (how full each rail is, in mm and %), shown in Check; **door cut-out sizes** as an optional field on door devices, shown on the door-back view.
  - **Not:** 3D, short-circuit (SCCR) and breaker calculations, energy distribution planning, quoting, DXF export. They're outside what Ferrule is for, and each is a large piece of work to keep right.
- **Controllers (47, 48).** See [controller.md](controller.md). First outline, kept for reference: a controller (PLC, DDC, outstation) is a kind of plant with:
  - modules (CPU, IO cards), each with IO points: DI, DO, AI, AO, UI (universal), plus supply terminals;
  - IO points wired on the schematic like plant terminals, so the drawing shows `DO3` driving `K9-8`;
  - a GA footprint (modules side by side on a rail, sized from the device library);
  - an IO schedule (point, type, tag, description, sheet) exported with the other schedules;
  - in simulation, outputs can be set by hand, and inputs show their live state.

  This needs its own design doc, `docs/controller.md`, written and reviewed before any of it is built. It covers plant and controllers together (below).

### Field IO and simulation (plant and controllers)

Designed in full in [controller.md](controller.md). In short: plant and controllers share one model, **IO points** made of pins (number, optional id and group). Controllers are built from generic module types (power supply, host, DI/DO/UIO/AI/AO with a channel count), carry prefix **A**, and are drawn at the top of the sheet with terminals underneath, every connection wired at the module. Simulation is for proving wiring and links, not emulating a controller: outputs are clicked (plant outputs can also follow something with a delay), and **expectations** check the drawing: inputs turn **green** or **red** depending on whether they see what was expected, and "never" statements (e.g. two contactors both on) raise a warning. Expectations replace the separate "never both on" rules. No analogue simulation. Today's plant groups are replaced.

---

## 9. Simulation

- **Sources (73, 74).** The incoming supply energises its distribution. A transformer supplies its secondary only while its primary is energised (it's an isolated circuit, so it must remain a source), and the polarity follows the primary: whichever primary side is live, the matching secondary side (P1→S1, P2→S2) is live. With distributions (§2) the ATS-1 changeover simulates correctly: W1-18 is live only through Q1-23.
- **Live wires in their own colour (follow-up of 22/11/26).** While simulating, a live wire is drawn **in the core colour it's drafted with** (Bn, Bu, Og, Rd…), thicker than an unpowered one. Busbars likewise use their own colour (§2). What you see live is exactly what's drawn, nothing new to set up, and neutrals and 0 V returns light up in their own colours too, so the current's path reads both ways. White (0 V) is drawn with a dark edge so it shows on the sheet. A live wire with no colour set stays red, as today. A conductor fed from two different distributions is a **short**: it flashes and raises a warning. Print and PDF stay black.
- **Plant that supplies power (follow-up of 22/11/26).** An inverter's EPS output, a PSU or a controller's 24 V auxiliary output are **supply out** points on the device, each with a distribution, and act as sources ([controller.md](controller.md) §3). No more stand-in incoming supplies.
- **Break at a fuse (49).** Click a fuse or MCB while simulating to blow or trip it; click again to replace or reset. It's drawn open and marked.
- **Plant and controller IO (53, and follow-up of 22/11/26).** Plant simulation is replaced by the IO point model ([controller.md](controller.md) §6): outputs clicked or following, inputs green or red against what's expected. A point you've changed is marked on the drawing and listed at the top of the simulation panel until reset.

---

## 10. Windows and interface

- **One window style (51, 52, 57, follow-up 9).** Every dialog is a floating window: a title bar with *minimise* and *close*, in the KDE manner, in the same greys as the rest of the interface, with no coloured close button. Windows can be dragged, don't block the drawing (you can still look and scroll behind them), and remember where they were.
- **Plant (52).** The plant window lists the plant; *New plant…* opens its own window to fill in.
- **Plant view text (follow-up of 22/11/26).** A plant view's own *Label* field goes. The box already shows the plant's tag, description and information lines, set once in Plant; a second, per-view label repeated what they say (or contradicted them). Anything specific to one sheet is an annotation.
- **Tag fixed, not "lock" (follow-up of 22/11/26).** The table's *Lock* column and the properties' *Lock tag* were about one thing: Renumber leaving a typed tag alone. Both now say **Tag fixed**, and the table has a tick box per part (drawing parts only; annotations have no tag). Locking parts *in place* so they can't be moved isn't a feature; considered and left out for now, since nothing in testing needed it.
- **Workbench focus (8).** Things you can't select in the current workbench are drawn in grey (about 55% black) on screen, not faded enough to hurt reading. Print is unaffected.
- **One top bar layout everywhere (follow-up of 22/11/26).** The second row is always in the same order, on every workbench: the workbench's **tools** (Select first, then Wire, Section, DIN rail…), then **undo and redo**, then **view** (Fit, Split), then **menus** (Renumber, Templates, Plant, Check, Schedules, Place parts…, Device table…). Anything a workbench doesn't use is left out, but nothing changes place.
- **Sheet indicator (10).** `3 / 14` under the overview.
- **Split view (14).** Drag the divider to resize. The second pane zooms and pans, and has its own overview.
- **Number boxes (42).** Shift+scroll steps by 10.
- **Placing (72).** Place one part, then back to Select. A setting, *Keep placing until Esc*, brings back today's behaviour.
- **Save as (follow-up 16).** Choosing an existing file asks *Replace it?* instead of refusing.
- **Paper colour (63, follow-up 11).** The sheet on screen is a warm off-white (#FAF8F3), dimming the backlight without changing the drawing. The drawing stays black on paper, never inverted; print and PDF are pure white. The UI chrome gets an optional dark theme.

---

## 11. The app around it

- **Export PDF (56, follow-up 4).** Kept: it worked from other projects. If it fails again, the error now names the cause and offers *Print → Save as PDF*.
- **Status and Claude (59, 60, follow-up 10).** The console window stays (no tray icon: nothing that could upset antivirus). A **Status** page in settings shows:
  - the version, the projects folder and the address;
  - whether Claude is connected over MCP (and the last tool it used);
  - how to connect Claude, with the exact settings to paste;
  - a **Quit Ferrule** button that stops the server cleanly.
- **Logo (58).** A simple mark from the trade, not AI imagery: a crimp ferrule (a wire end with its sleeve) or a terminal block silhouette, in flat shapes that still read at 16 px for the tab and the exe icon. Three sketches for review.

---

## 12. Bugs found in testing

| # | Bug | Cause | Fix |
|---|---|---|---|
| 4, 23 | A wire loops through a coil (sheet 7 of *Example Building*) | The router fails and its fallback draws straight through | Reproduce from the file; the fallback must avoid bodies, and a failure is flagged |
| 6 | TON contact closes immediately (ATS-1, K2-59) | The contact is an ordinary NO linked to the timer coil, which was treated as instantaneous | Contacts follow their timer coil (§4) |
| 17 | A wire can't be dragged ("must start and end on its terminals") | Dragging the end run tries to move the wire's end | Dragging a run next to an end adds a jog; the end stays put |
| 20, 54 | Jumping to a link or a Check item doesn't centre on it | It only re-centres when the target is near the edge | Always centre and ring it; Check uses the same jump |
| 5 | Wires leaving a busbar have no number | They join the busbar's conductor | Numbering stops at busbars (§2) |
| 64, 214359, 214950 | Incoming supply's arrows overlap its labels when rotated | Labels don't follow rotation | Labels placed by direction |
| 66 | Straightening a wire bends it toward the fuse | The fuse's tag text is an obstacle on the straight path | Text only steers a wire with room to move; part labels kept off neighbouring wires |
| 73 | Unknown voltage source (ATS-1, W1-18) | Same-name busbars were joined | Distributions (§2) |
| 74 | Voltage "inverts" at the transformer | The secondary's live side was always S1 | Polarity follows the primary (§9) |
| — | Plant settings copied into later parts (ATS-1: `plant`, `pgroups`… on timers and contacts) | Placing a part after a plant view keeps the view's settings | Clear them between placements; strip unknown settings on load |
| 16 | Save as won't overwrite | No replace option | Ask to replace |
| — | The table (Table button) can't be scrolled: only the first rows can be seen | The table grew to its full height instead of fitting the window | **Fixed** in the fixes PR: it scrolls inside the window |
| — | Plant information placeholder named a third party's product | Example text taken from a reference drawing | **Fixed**: generic example. Docs checked and cleaned of reference-drawing sources too |

Both test files are kept privately as regression fixtures (not committed: they're your projects).

---

## 13. Every testing note and its outcome

| # | Note | Outcome |
|---|---|---|
| 1 | Printed and scanned sheet | Basis for §1 |
| 2, 3, 7 | Text too small; there's room | §1: bigger grid, ISO text styles |
| 4 | Routing error | §12 |
| 5 | Rail sheet lists cluttered; busbar vs control voltage | §2 |
| 8 | Grey out what you can't edit | §10 |
| 9 | Earth terminals on strips | §5 |
| 10 | Sheet indicator | §10 |
| 11 | Door shapes | §7: drawn by the GA door view |
| 12 | Sheet type drop-down | §8 |
| 14 | Resizable, zoomable split | §10 |
| 15 | No repeated numbers at junctions | §6 |
| 16 | Arrows, highlights, call-outs, polygons | §7 |
| 17 | Wire won't drag | §12 |
| 18, 19 | Bigger block terminals, narrower plant terminals | §1 |
| 20 | Jumps don't centre | §12 |
| 21 | Full references again | §6 |
| 23 | Routing loop again | §12 |
| 24 | No numbers on earth wires | §6 |
| 25, 26 | Cable screen shape; dashed screen wire | §6 |
| 27 | Earth terminal on the block | §5 |
| 28 | Wrapping labels | §6 |
| 29 | Coil table header | §6 |
| 30 | `T` → `LT` | §4 |
| 31, 39 | Flip; F for flip | §4: Space for fit |
| 32 | Timer contact function inherited | §4 |
| 33, 35, 75 | Selector poles, NC, two-contact three-position | §4 |
| 34 | `I 0 II` legend overlaps | §4 |
| 36 | Isolator operators | §4 |
| 37 | Flasher note | §4: removed |
| 38 | Time format help | §4 |
| 40, 41 | Busbar name by its tag, both ends | §2 |
| 42 | Shift+scroll ×10 | §10 |
| 43 | Distribution setup | §2 |
| 44 | `+V`/`-V` | §4 |
| 45 | GA strips and new terminals | §8 |
| 46 | Remove GA Note | §3, §8 |
| 47, 48 | Controllers | §8: own design doc first |
| 49 | Break at a fuse | §9 |
| 51, 52, 57 | Window style, plant sub-window, floating/minimisable windows | §10 |
| 53 | Plant group changes visible | §9 |
| 54 | Check doesn't centre | §12 |
| 55 | Terminal strip line | §5 |
| 56 | PDF export failed | §11: kept, better error |
| 58 | Logo | §11 |
| 59, 60 | MCP status; tray app | §11: status page, console kept |
| 61 | Rails vs busbars | §2: one part |
| 62 | Ethos review | §3 |
| 63 | Dark mode | §10: off-white paper, dark chrome optional |
| 64, 65 | Incoming supply labels | §6, §12 |
| 66 | Straightening bends | §12 |
| 67 | Colour/function overlap | §6 |
| 68 | Busbar colour and function | §2 |
| 69 | Duplicate `1-24` | §6: correct, explained |
| 70 | Destination inherits label | §6 |
| 71 | Arrow labels follow the wire | §6 |
| 72 | Place one, then stop | §10 |
| 73, 74 | Simulation sources | §9 |
| 6, 13, 22, 50 | Removed by you | — |

Follow-ups of 22/11/26: grid (1) §1; test file (2) §12; local busbars (3) §2; PDF export (4) §11; busbar wire numbers (5) §2; TON (6) §4, §12; ⏚ (7) §5; fit key (8, 14) §4; no red close (9) §10; console (10) §11; paper colour (11) §10; logo (12) §11; busbar weight (13) §2; Save as (16) §10.

---

## 14. Order of work

Each step is one pull request, with a build to test.

1. **Bug fixes** that don't depend on the rest: centring and Check (20, 54), wire dragging (17), plant settings leak, Save as (16), routing loop and straightening (4, 23, 66), transformer polarity (74).
2. **Grid and text** (§1): the new scale, text styles, the version 3 file format (older files refused, v0.1 upgrade code removed), the LSP-01 example rebuilt. Everything after builds on this.
3. **Busbars and distributions** (§2), with busbar numbering (5) and simulation sources (73).
4. **Parts audit** (§3, §4): timer contacts, selector, push buttons, Text + Notes, isolator operators, flip, renamed terminals.
5. **Wires, labels, terminals** (§5, §6).
6. **Windows and interface** (§10), paper colour, the status page (§11).
7. **Annotate tools and GA** (§7, §8 without controllers), fuse breaking and plant group marks (§9).
8. **Controller and field IO design doc** (`docs/controller.md`, §8) for review; then IO points for plant, then controllers; then the logo sketches.

### How the sprint runs (agreed 22/11/26)

- **One PR per step**, each built on the one before, so work never waits on a merge. Merged into `main` by you, in order (or by auto-merge once CI passes, if enabled: see below).
- **A build with every PR:** `ferrule-windows-v0.2.0-pre.zip`, linked from the PR. Test the newest; go back to earlier ones only if the newest breaks badly.
- **Version** `0.2.0-pre` throughout the sprint.
- **Judgement calls:** small ones are decided and noted here under *Changed during build*. Anything costly or considerable to reverse or change is sent to you as a push notification first, and waits for an answer.
- **Stop only at a PR boundary.** Never half a step. The last PR says what's next, so it's easy to pick up.
- **Test files** (*Example Building*, ATS-1) are staged from `C:\Temp\eCAD\v0.1.0-pre Testing`, used for reproducing bugs only, never committed.
- **No professional references** in code, docs, commits or PRs: no third-party firms, drawings or product names from reference material. Generic examples only.

### Changed during build

**Step 1 (bug fixes)**

- **Routing (4, 23, 66).** Router settings were left alone: turning nudging off or changing its penalties made other wires worse. Instead every route is checked after routing. A wire whose ends line up and face each other runs straight unless a part or another wire is in the way; tags and labels never bend it. A route that loops, crosses a part or runs along another wire is replaced by the best simple route (fewest crossings, then shortest).
- **ATS-1's N wire (66)** was saved hand-routed with the old bend, so it keeps it. *Reset route* now gives a straight wire.
- **Transformer polarity (74).** The secondary's live side follows the primary: P1 on the phase makes S1 live; P2 on the phase makes S2 live.
- **Incoming supply (64).** Names sit beyond each arrow's tail at every rotation. The label goes above the arrows, or below them when they point up.

**Step 2 (grid and text)**

- **Text sizes users pick** (Text, Notes, revision list, legend, label plates) are now the named styles: Detail 1.8, Note 2.5, Heading 3.5, Title 5 mm. Text and Notes default to Note.
- **Part labels are `tag` style (2.5 mm)**, which made long labels crowd their neighbours at a 10-unit rung pitch. Labels can now be written on two lines (a line break in the label). A label drawn above its tag grows upwards, clear of it.
- **Contact tables** are sized from their 1.8 mm text and fit between rungs 5 columns apart.
- **Revision list** columns are set in multiples of the text size, so the table keeps its shape at any size.
- **Terminal block:** the number stays at 1.8 mm; when one won't fit up a 3-unit cell, every cell in that sheet's block grows by half-unit steps (set when wires are routed).
- **Plant terminal boxes** are 1 unit apart with the name running up the box, like block cells. They're 3 units tall, taller when a name needs it.
- **GA sheets:** the enclosure's corner moved to (8, 9) so the same room in millimetres is left for dimensions.
- **Your test files** (Example Building, ATS-1) are format 2, so this build refuses them with the 0.1 message, as agreed. The LSP-01 example is rebuilt for the new grid.
