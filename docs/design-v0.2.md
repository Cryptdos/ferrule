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

**Step 3 (busbars and distributions)**

- **Distribution kinds** are AC line, AC neutral, DC +, DC 0 V and earth, not "Control". The simulator needs to know which side is the supply and which the return. A 24 V AC CCT is an AC line, and its 0V an AC neutral.
- **Control busbars** are drawn at 0.35 mm, between a wire and a distribution busbar, and carry no tag (CCT and 0V never had one). Distribution busbars are tagged W like before. The tag sits just before the name, on the bar's line, so stacked busbars don't collide.
- **Incoming supply:** each terminal can feed a distribution, and does so with no wire drawn. Use this only when the busbars aren't wired from the supply. Everything on a distribution is one net, so a supply feeding L1 directly while its own wiring runs through the main isolator to the L1 busbars bypasses the isolator. The example did exactly that, and opening Q2-12 left the busbars live (testing, 23/11/26). The example's supply is now on no distribution, and **Check** warns when a supply feeds a distribution its own wiring also reaches. A link arrow on a distribution is labelled with its name unless given a label.
- **Without an Incoming supply,** line and DC + distributions are the supply, and neutral and DC 0 V the return. This replaces the old "rails named CCT…" rule.
- **Live wires are red (reverted 23/11/26).** Drawing live wires and busbars in their core colour was tried and taken out: a black or grey core (L2, L3) looks the same live or dead. Live wires and busbars are red, as before; returns aren't lit. A conductor fed by two supplies is still reported as a short. The stand-in supply from CCT/0V busbars (no Incoming supply drawn) doesn't count as a second source, so a transformer feeding them isn't a short.
- **Wire colour from the busbar (agreed 23/11/26):** a wire drawn from a busbar takes the busbar's colour (its own, else its distribution's) if its conductor has none yet. It's copied once, when the wire is drawn, not linked, so it can be changed like any other wire's colour. Wires carried on through terminals or joined at a junction are the same conductor, so they share it.
- **Wire labels can be hidden per wire (agreed 23/11/26):** by default every wire prints its colour and number by the usual rules (field wires don't print their number). Each wire has **Show colour** and **Show number** ticks, so the drafter can dial back clutter where, in their judgement, nothing is lost.
- **Templates** carry the distributions they use. When stamped into another project, each is matched by name, or added if it's missing.

### Testing notes of 23/11/26 (step 3 build)

| # | Note | Fix | Step |
|---|---|---|---|
| T1, T7 | Live wires in their core colour can't be told from dead ones (a black L2); simulation with distributions blocked testing | Reverted to red; stand-in CCT supply plus a transformer no longer a false short | Done (follow-up to 3) |
| T2 | The example's "Logo: add one under Project…" box can't be made in Annotate. Section, cloud and picture sit in the top bar, apart from the other drawing tools. Picture opens the file picker straight away | Logo becomes a part in Annotate's list (it shows the project's logo). Section, cloud and picture move into Annotate's parts list with Text and Notes. A picture is placed like any part, and its file is chosen in its properties | 6 |
| T3 | A blank Text or Notes stays on the sheet, invisible | Text and Notes with no content are removed when you click away | 4 (with Text + Notes) |
| T4 | A control busbar gives no colour to its wires; its colour is free text; wires off it show no number | Busbar colour is the same colour dropdown as wires. Short wires off a busbar get their number (see T6) | 5 |
| T5 | A wire from a fuse's other side (fuse 2 → lamp) doesn't take the colour of the wire into the fuse | A wire drawn from one side of an in-line part (fuse, contact, isolator pole, terminal) takes the colour of the wire on the other side of that pole, once, when drawn | 5 |
| T6 | On a short wire the colour and number collide with things around them | When the wire is no longer than its text, the colour and number are centred on it | 5 |

**Step 4 (parts audit)**

- **Timed contacts:** a contact linked to a timer coil prints the timer marks (17-18 NO, 15-16 NC, 15-16/18 changeover, by pole), so the contact table and the drawing agree. On-and-off delay draws both arcs; pulse and flasher draw the on-delay mark.
- **Push button "both"** puts NO 13/14 and NC 21/22 side by side on one head.
- **Selector poles** are each a single choice: *NO, closed in I*; *NO, closed in II*; *NO, closed in I and II*; *NC, opened in I*; *NC, opened in II*; or *Changeover* (12 in 0 and 14 in I on a 2-position switch; 12 in I and 14 in II on a 3-position one, both open in 0). Terminals are numbered by pole: NO k3/k4, NC k1/k2, changeover k1/k2/k4. In Simulate a click steps 0 → I → II → 0. The whole switch is drawn turned whenever it's out of 0.
- **Isolator "door handle"** is drawn as the rotary head with a bar across the shaft (coupled through the door).
- **Text:** the merged Text is laid out from its top left, where the old plain Text sat on its first baseline, so text from before sits about a line lower. Wrapping is off (0) unless a width is set.
- **Contact tables** are a little wider (the marks column), so "15-16/18" doesn't run into "CO".
- **Drawings from the 0.2 test builds** still open: timer contacts, push buttons NO/NC, Notes, the old selector changeover and lamp/DC-supply terminal names are mapped on load. That mapping is for the test period and comes out at release.
- Not in this step: note 26 (wires to a cable screen drawn dashed) goes with the wire work in step 5.

**Step 5 (wires, labels and terminals)**

- **Wire text order:** colour, function, number, in that order from the source end, the colour nearest the terminal (as the colour was before). The function no longer prints at both ends.
- **Short wires (T6):** a number on a wire shorter than its text is centred on it, except where the wire lands on a busbar: there it runs away from the bar instead of across it. Wires under 3 units used to print no number; they now always do.
- **Once per sheet (15):** the number prints on the conductor's longest run on each sheet. Ticking *Show number* on another branch moves it there; unticking it on the printed one moves it to the next longest. The checkbox says why a branch has none.
- **Earth wires (24):** a conductor is an earth wire when it reaches an earth symbol or an Earth terminal anywhere in the project, so every branch of it goes unnumbered by default.
- **Earth terminal (9, 27):** the earth sign is drawn as lines (three bars) rather than the ⏚ character, so it prints the same everywhere. In the block it sits at the top of the cell and the cell grows to fit it and the number. Off the block it hangs from the terminal's lower left, clear of its leads and of a strip line through it. On the GA its slice of the strip is striped green-yellow.
- **Terminal strip line (55):** a part in Connection. A terminal keeps the strip a line gave it after the line moves away; only a line crossing it changes it again. Terminals are picked before the line where they overlap.
- **Busbar colour (T4)** is the wire colour list plus *From its distribution*. Colours typed in the test builds ("blue", "BU") become codes on load.
- **In-line colour (T5)** covers fuses, contacts, isolator and breaker poles (and their auxiliaries), terminals, push buttons and selectors. A busbar's colour wins if the wire also lands on one.
- **Label width (28):** any part with a label has *Label width* in its properties (0: one line). The incoming supply's label is centred on its arrows when upright and grows upwards from above the conductor names; turned sideways it stays where it was.
- **Link arrows (71):** on a vertical wire the label starts just right of the tip, with the reference after its first line; on a horizontal wire both go under the arrow, running on the way it points. A destination with *Same label as its source* ticked shows the source's label instead of its own. *Link to a new arrow* points the new one the opposite way to the source, so a wire leaving down the page arrives from the top of the next.

**Step 6 (windows and interface)**

- **Windows:** every dialog (Plant, Distribution, Check, Schedules, Templates, Renumber, Device table, Project…, Save as, the new Settings) is one floating window. Several can be open at once; a new one opens a little down and right of the last. `Esc` closes the window that has the focus; with the focus on the drawing, keys work on the drawing as usual. Properties, Simulation and Help keep their lighter see-through boxes.
- **Settings and Status** share one window, opened from a gear at the top right. *Project…* is now a text button (its icon was the gear's). The Claude Desktop settings shown are for the program actually running (the .exe's own path), so they can be pasted as they are. "Connected" means a client has said hello since Ferrule started; MCP over HTTP has no open connection to watch.
- **Top bar:** *Place parts…* isn't a menu: GA's parts to place stay in the browser's *To place*, where they're picked. Simulate shows only the view group and its note. Annotate's tools are all in its parts list (T2), so its tools group is just Select.
- **Picture and logo (T2):** *Picture* and *Logo* are parts in Annotate's list. A placed picture shows *Picture: choose its file in Properties* until a file is chosen; its properties can switch it between a picture and the project's logo. Paste and drop still work.
- **Plant view label:** a view that already has a label keeps it, with a note saying to move it, rather than losing what was typed. New views have no label field.
- **Greyed workbench (8):** drawn at 55% opacity on screen (sections and clouds in Draft; parts, wires and the terminal block in Annotate). Print, PDF and previews are unaffected.
- **Split (14):** the other half pans by dragging, so it's double-click (or *Edit this sheet*) to work on it, rather than a single click. The divider position is remembered.
- **Number boxes (42):** scrolling steps a number box only while it has the focus, so the panel still scrolls under the pointer.
- **Dark interface:** the chrome is turned dark by inverting it (pictures and previews inside are turned back), rather than a second set of colours; the sheet stays paper-coloured.
- **Export PDF (56):** the error names the browser it tried and why it failed (stopped after 90 s, or what it said), in a window with *Print → Save as PDF*.
- **Example:** the starter sheets' outgoing link arrows are labelled with the fan's tag (`SF-01 ENABLE`, `SF-01 RUN`), since destinations now show their source's label.
- **README screenshots** retaken.

**Step 7a (GA and simulation; the rest of step 7 is 7b)**

- **Split:** step 7 went into two PRs. 7a: fuse breaking, sheet type, GA notes gone, any scale, strips that keep up, device "suits". 7b: the Annotate tools (arrow, highlight, call-outs, polygon), door views with split doors and door devices drawn from the schematic, dimensions, the GA tool library and *Place parts…* window, bill of materials, rail and trunking fill, door cut-outs.
- **GA label tool (for 7b, decided 23/11/26):** the *label* in §8's GA tools is a **label plate placed at true size on the door**, shown on the door views (and counted in the bill of materials). It isn't free text (GA notes stay gone, 46) or a device's label (already in its properties).
- **Fuse (49):** a blown fuse is drawn with its link broken inside the carrier and crossed out, and is listed with the other inputs in the simulation panel (On = intact). An MCB already trips by clicking (it's an isolator with the breaker function) and is drawn open; no extra mark.
- **Sheet type (12):** a GA can change type only with nothing laid out on it, and only an empty sheet (no parts, wires or sections) can become a GA, starting as a 600 × 800 backplate at the scale that fits.
- **GA notes (46):** a note in a file from a test build becomes a Text annotation where it was. The example's rail note is a Text annotation.
- **Any scale:** Fit rounds up to the next half step (1:12.5 for the example's 1000 × 1600 backplate, which was 1:15).
- **Strips keep up (45):** a strip on a GA is tied to its strip name. Terminals added to it in the schematic join it at the end (existing order kept), removed ones leave it, and its length follows (along whichever side was its length) unless a real device sets its size. Opening the GA sheet marks it seen; Check reports it as *info* until then. Seen isn't an undo step.
- **Device "suits":** keys from before carry on (relay, contactor, timer, MCB, isolator, fuse, terminals, transformer, socket, block); "door devices" splits into lamp, push button and selector, and a device that suited "door" now suits any part. Earth terminals are their own entry. Contacts aren't listed: they're never placed on a GA on their own (they go with their coil's device).

**Step 7b (Annotate tools and GA)**

- **Annotate (16):** *Arrow* is placed with a click, then its tip dragged by its handle (one head or both). *Polygon* is drawn corner by corner with its own tool: click the first corner again, double-click or press Enter to close it. Both keep their corners as points, so turning or flipping turns the points and their handles stay where they're drawn. *Highlight* is a translucent marker band (yellow, green, pink, blue), sized by its corner; it prints. *Call-outs* number 1, 2, 3… on each sheet as they're placed (the next after the highest there), and the number can be changed. None of them has a label.
- **Door views:** a GA sheet is a backplate, a door front or a door back. The door (its size and one or two leaves, each with its width and hinge side) is set on the door front that has its devices. A door back is always *of* a door front and mirrors it: its devices drawn dashed from behind with their cut-outs; rail and trunking on the door go on the back. A sheet showing one leaf on its own, at its own scale, is a door front *of* that door: it shows that leaf's devices and takes dimensions only, so devices are placed in one place. Hinges are drawn on the hinge side with the usual converging swing lines.
- **Door devices** are drawn from their schematic parts: a lamp's lens in its colour, a push button's head, a selector's knob (or key slot), an isolator worked through the door (*door handle* operator) as its handle, placed as its own item while the isolator's body goes on the backplate. Where the scale makes a legend unreadable (smaller than 1.8 mm), only the tag is printed, under the device. Meters aren't drawn: there's no meter part in the schematic yet.
- **Label plates** go on door fronts only, at true size, with an engraved text height (5 mm unless set); the text is drawn at that size where it reads, never under 1.8 mm.
- **Dimensions:** click each point, then double-click (or Enter) where the line goes. Points snap to the enclosure's edges and middle and to items' edges and middles (within about a grid unit), and stay attached, so a dimension follows what it measures; one on an item that's deleted stays where it was. Chain or baseline is picked under the tool, and can be changed in the dimension's properties. Dragging a dimension moves its line. Values print in whole mm, or to 0.5 mm.
- **GA tools and Place parts…:** DIN rail, trunking, dimension and label plate are in the browser's lower section (greyed where the sheet doesn't take them). *Place parts…* is a window in the top bar listing what goes on this sheet, with search, and how many go on the other kind of sheet. The GA top bar also has *Check* and *Schedules* (for the rail fill and the bill of materials).
- **Bill of materials:** a tab in Schedules, by GA sheet: devices by the device picked from the table (or by generic size, marked *no device picked*), terminals each, door handles, label plates by size with their text, DIN rail and trunking in metres.
- **Rail fill:** a device is on a rail when it sits across the rail's centre line; fill is the length they take, clipped to the rail, in mm and %. Check lists each rail's fill (info) and warns of devices that overlap or run off the end; a rail's properties show it too. **Trunking fill isn't worked out:** it needs wire sizes and routes, which the GA doesn't have. Trunking is counted by length in the bill of materials.
- **Cut-outs** are a field on door devices ("22.3" round, or "92 x 92"), printed on the door back.
- **Example:** the main isolator is worked through the door, and the example gains a two-leaf door front (sheet 14) and its back (sheet 15), with a label plate, cut-outs and dimensions. Its notes sheet is now 16.

**Step 8a (field IO for plant, and expectations; [controller.md](controller.md) phases 1 and 2)**

- **Split:** step 8 is three PRs. 8a: IO points for plant, expectations, the simulation panel, the field IO checks and their MCP tools (phase 2, the link workflow, came in step 5). 8b: controllers (phase 3) with their MCP tools. 8c: the logo sketches.
- **Pins:** a plant item's terminals are its pin numbers, in order; each pin's id and group are kept beside them (`pins`), shown when present. A number used in two points is told apart by its point (`R2.C`) and printed as `C`, as before.
- **Quick entry** stays (`Mains: L N E | Run: 1 2 | R1: C NO NC`) and guesses each point's form: C/NO/NC a contact; L/N or +V/-V a supply in; a command name (Run, Enable, Start…) a powered input; 0-10V, Speed… analogue in; RS485, Modbus… comms; any other pair a contact (volt-free). Editing it keeps what unchanged points had (form, what they follow, distributions). *Pins and points…* is the full table.
- **On the box:** a pin's id goes in a row of boxes under its number; each run of pins is labelled by its group, else its point's name (what the plant groups showed before).
- **Which pins do what:** a contact's common, NO and NC are found by name (C or COM, NO, NC), else in order C, NO, NC; two unnamed pins are a volt-free NO pair. Inputs, powered outputs and supplies use their first pin as the signal (or live side) and the second as the common.
- **Each pin is the device's own:** in simulation a pin shown on two views is one terminal, so a point works whichever views show its pins.
- **Plant without points doesn't simulate.** Before, plant with no groups acted as one volt-free contact across its terminals; now that's a contact point, set in the table or by quick entry. The example's plant has points, and expectations: the fire alarm's monitoring inputs should be on when each fan's running relay is in, and duty and standby are never enabled together.
- **Supply out** picks a distribution per pin (the live side, and the return if it has one), so an inverter's L and N can feed `L (EPS)` and `N (EPS)`. A distribution fed by plant isn't stood in for by its busbars.
- **"Should be on when …" means both ways:** on when the conditions hold, off when they don't (an input stuck on is as wrong as one that never comes on). It can say *off* instead. An input with no expectation is grey.
- **Waiting:** an expectation isn't judged while a timer between its input and its conditions is running (a DPS proving 5 s after its fan runs, a timer relay in the path); the simulation panel shows it dashed meanwhile. Timers upstream of both don't hold it, so an unrelated fail timer timing doesn't grey everything out.
- **Check logic** searches each expectation over only the inputs that can affect it (those with the same inputs together), so one sheet's fans don't multiply the sequences tried for another's. The example's six are all searched in full.
- **Things a condition can name:** coils and timers (energised), lamps (lit), contacts (closed; named by their terminals, `K3-12 13-14`, since they share their coil's tag), push buttons (pressed), selectors (out of 0), isolators (closed), fuses (intact) and plant points (on).
- **Renaming a point** carries the expectations and conditions that name it.
- **Analogue against digital** compares signal pins only: an analogue 0 V sharing a DI common is normal and isn't flagged.
- **Files from the test builds:** plant groups become points (inputs, outputs and their follows), and logic rules become *never* statements, on load (with the rest of `preRelease()`, removed at release).

**Step 8c (logo; done before 8b, which is the largest piece left)**

- **Chosen from sketches (23/11/26):** a crimp ferrule on the diagonal, which fills a square icon better than a flat side view; a red collar, as on a 1 mm² ferrule, red being the one colour the app uses (live in Simulate); straight-walled collar with a shoulder down to the sleeve, about 40% of the length, as on a real ferrule; copper at the tip; a black cable cut at a slant, its cut face a lighter sliver with the copper core in it, with no outline round the face. Set aside: a side view (plainest), a ferrule going into a terminal (too busy at 16 px), a flared collar, a grey cable, a break-line cable end.
- **Three drawings, one design:** full detail for 48 px and up, simplified for 24–32 px (one crimp mark, no shoulder line), flat shapes for 16 px (no outlines; the cable's cut face is just its copper core). Each size of the .ico is drawn from the right one rather than scaled from the largest.
- **On a tile** the colour of the sheet on screen (#FAF8F3), rounded, so the icon reads on dark tabs and taskbars.
- **Where it's used:** the browser tab, the project list's heading, the README, and the exe's icon.
- **The exe icon needs Windows:** Bun only sets an exe's icon when it's built on Windows, so CI's exe job now runs on Windows. Builds made elsewhere (including the one sent with each PR from here) work the same, with Bun's default icon; the one attached to the CI run has the logo.
