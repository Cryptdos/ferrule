# Ferrule v0.3: design

**Status:** agreed for building (23/11/26). Version `0.3.0-pre`. This is the whole plan for v0.3. It takes in what was left of v0.2.1 (busbars and terminals; see `UPCOMING/design-v0.2.1.md`), the outline reviewed on 23/11/26 with the director's notes (kept as written in §11), and the director's additions. The second review (evening of 23/11/26) settled tiling, alignment, button labels, detail sheets, door lamps and the distribution's function; its answers are in §11 too. Network drawings moved to v0.4. Where a decision was made here rather than in review, it says so. Change it in review if it's wrong.

**Where things stand:** v0.2.1 steps 1 (windows and top bar, PR 43), 2a and 2b (parts and Annotate, PRs 44 and 45) are merged. Its steps 3 (busbars) and 4 (terminals and numbering) moved here as §1 and §2, so v0.2.1 ends at step 2.

Numbers in brackets are the QA note numbers in `v0.2.1-pre Notes/working-points.md`. *D1*–*D3* are the director's additions (§11).

---

## 1. Busbars split in two (22)

A distribution busbar and a control rail are different things: one is a physical part, the other a drawing convention. They become two parts.

- **Distribution block:** the physical busbar or distribution block (IEC class W). It's tagged W, sits on a distribution, is placed on the GA and is counted in the bill of materials. It's drawn heavy, as today. Its parts list name says *Distribution block*, so it's obvious it's a block on the GA.
- **Control rail:** a common rail on the drawing (CCT, 0V). No tag and not a GA part. It's drawn as today's control style (0.35 mm).
- Both join everything on the same distribution, as now. Numbering stops at both, as now.
- **Files:** busbars become one or the other by their `style` (`control` → control rail, else distribution block). The symbol ids are `busbar` (distribution block, kept so everything that knows busbars keeps working) and `rail` (control rail). Decided here.
- **Fix:** control busbars are offered in *Place parts…* as distribution blocks today (`ga.ts sizeKey` returns `block` for any busbar). Control rails must not be.
- Everything that treats a busbar specially needs checking for the new part: wire colour from the busbar, numbering, `netJoins`, simulation sources and live drawing, Colour check, the legend, templates, MCP descriptions and the example.

## 2. Terminals and numbering

### 2-unit terminals and 2.5 mm text (34, 37, 29)

- Terminals on a boundary (the terminal block cells) and the pins of plant views and controller module views are **2 units apart**, not 1. Each terminal then has its own column, so two terminals no longer share one and get an `A` suffix. That was 7-29 / 7-29A on the example's sheet 7 (29).
- **Terminal numbers, pin numbers and wire numbers go to 2.5 mm** (`TEXT_MM.tag`). Contact tables and cross-references stay at 1.8 mm.
- Check the result with a test print of the example (a terminal block sheet, a plant sheet and a module sheet), and send it with the PR.
- **Files:** terminals at 1-unit spacing on a boundary are spread to 2 units along it, keeping their order and moving their wires' ends. Plant and module views get wider by themselves, since their layout is computed. Drawings may need tidying by hand; that's accepted. No backwards compatibility before 1.0.

### Earth terminals (27, 13)

- On a boundary an earth terminal prints **no number**, and the earth sign is centred in its cell.
- It still has a hidden position address, so schedules and the GA can name it and order it.

### Terminal order on the GA (28)

- A placed strip lists its terminals **by sheet, then left to right along the boundary**: the order it's built in (`syncGaStrips`, `gaCandidates`, `stripSize`). Earth terminals fall into place with the rest.

### Terminals drive wire numbers (33, from discussion)

- **A wire that lands on a terminal takes that terminal's number. A wire on no terminal is numbered from its highest end, as now.** That's one rule, applied everywhere, with no option to flip a wire's numbering source (33).
- A terminal and the wire on it always agree. You can't have terminal 7-30 with wire 7-36 coming from it.
- Terminals are still numbered by where they are (sheet-column), and the wire through them follows.
- Where a conductor reaches more than one terminal, the first along the strip (sheet, then left to right) wins. Decided here.
- Locked wire numbers stay as typed. Check warns when a locked wire number disagrees with its terminal's number. Decided here.

### Link arrows: wire number and reference (17, 19, 20, 32; 10 from discussion)

The problem: an arrow's partner reference and a wire number are both written sheet-column. An arrow showing `4-24` beside a wire numbered `4-24A` reads ambiguously, and a technician could follow the wrong path.

- We always need the **wire number**, because it's what's physically connected. **References** are vital for reading and searching. So both are shown, written differently.
- **At the arrow:** the wire number it carries, inline with the arrow and always horizontal. It goes before a destination arrow (wire, number, then arrow) and after a source arrow.
- **The partner reference** is written in brackets, `(4-24)`, the way Ferrule already writes where something is drawn (`A3-23:DO5 (4-10)`). Brackets always mean a place; a bare number always means a wire.
- An arrow dropped straight onto a part's pin, with no wire between (32), shows the number of the conductor it's on.
- Other tools usually print the reference on the connector and the wire number on the wire beside it. This is the same, with the reference in a form that can't be mistaken for a wire number.
- Arrows have no tag of their own (17).

## 3. Distribution colour (D3)

- In the Distribution window, **colour** becomes a select box from the core colours (`WIRE_COLOURS`) plus *None*, not free text. It's then the same as a wire's colour in Properties, which is already a select. A colour in a file that isn't on the list is kept and shown as *(as typed: …)* until changed.
- **Function stays free text**, with its list of suggestions, in the Distribution window and on a wire (director's decision, second review).
- **What function is for:** it's notation. A wire's function (0V, 24V AC, L1, PE…) is printed along the wire with its colour and number (colour, function, number), and a distribution's function is what wires drawn from its busbars get by default. Simulation, Check and schedules don't use it.

## 4. Simulation: lamps lit on the door (D2)

- While simulating, the **door GA** (door front and door back, and detail frames showing a door, §6) shows each lamp lit in its colour when its schematic lamp is lit, as the schematic does.
- **Lamps only, and for seeing only.** Other door devices are drawn as usual, and nothing on the door can be clicked. The panel is worked through the circuit, so there's one place to interact. Most interactions have to happen in the circuit anyway; only door isolators and switches could be worked from the door, and you'd keep switching between the two (director's decision, second review).
- Simulate can be on a GA sheet: watch the door in one tile while clicking the schematic in another (§7, built before this).

## 5. Alignment tools (5)

Buttons in the top bar of Draft, Annotate and GA line up what's selected.

- **Align** left, centre, right; top, middle, bottom. What it aligns to depends on what's picked, with no toggle:
  - **One item:** to the sheet. The sheet means the space you can use: inside the border, minus the title block. So "middle" on a cover sheet is the middle of the space above the title block.
  - **Two or more:** to the **first one picked**, which stays put while the rest line up to it.
  - **A box selection** has no first item, so it aligns to the outline around everything in the box.
  - Example: pick a title and centre it on the sheet in x and y; then pick the title, then a sub-heading, and centre them. The sub-heading lines up under the title.
  - A group can't be centred on the sheet in one go. That's accepted for now (director's decision, second review).
- **Distribute** evenly across or down, with three or more picked: the two outer items stay put and the gaps between bodies are made equal (not the spacing between centres), so parts of different sizes look even. Rounding to the grid can leave one gap a step off.
- **An aligned part moves exactly as if dragged:** its wires follow and reroute the same way.
- **Buttons:** one group of eight (six align, two distribute), always icons only with the name on hover, whatever the button labels setting (§8). Eight labelled buttons wouldn't fit the top bar.
- **Edges** are an element's body: the same bounds as the box shown when you jump to a part (double-click a reference), not including tags and labels.
- **Grid:** results snap to the grid; where the maths doesn't land on a grid point, round to the nearest one.
- **GA items** align in mm on the GA's own finer snap, as doors and devices are placed now.
- Align is enabled with one or more picked, distribute with three or more. Each is one undo step.

## 6. GA detail sheets (D1)

At door scale (1:12.5 and smaller) a door plaque is unreadable: the lamps and their legends are too small. Examples: *SAFETY EXTRACT FAN* with POWER, FLOW and FAILED lamps.

A detail is an area drawn on one GA sheet and shown on another at a larger scale. A detail sheet can hold several, so a dozen plaques fit on two or three A4 sheets.

**On the source sheet: the detail rectangle**

- A **Detail** tool on any GA sheet (door front, door back or backplate, e.g. a crowded terminal rail) drags a dashed rectangle around an area, in mm like any GA item.
- Each detail gets a **letter**, A, B, C…, unique across the project, given in order and changeable in Properties. It also gets a **title**, e.g. *SAFETY EXTRACT FAN*.
- On the source sheet it's drawn as the dashed box with its letter and where it's drawn: `A (12)`. Brackets mean a place, as everywhere in Ferrule.
- Moving or resizing the rectangle updates its frame.

**On a detail sheet: frames**

- A new GA view, **Detail**: a sheet with no enclosure and no scale of its own, just the border, the title block and the frames on it.
- A **frame** shows exactly what's inside one detail rectangle, at the frame's own scale, picked from a standard list (2:1, 1:1, 1:2, 1:5). It defaults to the largest scale that fits the sheet's usable space.
- **Caption** under the frame: `DETAIL A: SAFETY EXTRACT FAN, 1:1 (8)`, where the bracket is the source sheet.
- *Place detail…* on a detail sheet lists the details not yet shown. Each detail is shown in one frame only (decided here), and Check warns about a detail with no frame.
- Frames are placed, moved and aligned (§5) like any other GA item, in mm on the sheet's finer snap.

**Nothing is copied**

- A frame looks into its source sheet, so the lamps, label plates and devices in it are the real ones. An item partly inside the rectangle is cut off at the frame's edge.
- **You can edit through a frame:** move, resize, set properties and place items, using the same GA tools. The change lands on the source sheet and shows in both (director's decision, second review: laying out a plaque at 1:1 is half the reason for the sheet).
- **Dimensions** added in a frame belong to the frame and show only there, so a plaque's dimensions don't clutter the door at door scale. Decided here.
- Label plates and their text read at their true size. Lamps, push buttons and selectors are drawn as on the door, legends included.
- Lit lamps in Simulate (§4) show in frames of a door too.

**Files:** a new GA view (`detail`) and two new GA item kinds (the detail rectangle and the frame). Nothing existing changes.

## 7. Tiling windows and a live split view (9)

Today the second sheet in a split view is a picture: in Simulate it shows no live wires, states or clicks.

- The main area becomes **tiles**. Each split puts two tiles side by side or one above the other, with a divider you can drag, and any tile can be split again. A tile holds one window.
- **Sheet tiles:** a sheet view with its own sheet, zoom and pan. **Split** divides the active tile, and the new half shows the same sheet. The same sheet can be open in two tiles, say an overview and a close-up.
- A tile has a small bar with its name, split right, split down and close. The last sheet tile can't close.
- **Which windows tile:** anything that shows the project, so sheets, Plant, Templates, Schedules, Table, Controllers, Distribution, Expectations and Check. Small prompts (new sheet, confirm delete, rename) stay floating: they ask a question, they don't show the project.
- **Docking:** drag a window's title bar onto a tile. Dropping on one of its four edges splits it; dropping in the middle replaces what's there. Drag a tile out by its bar to float it again.
- **Every sheet tile is fully live** in every workbench: Simulate shows states, live wires and colours, and takes clicks, in every tile, sharing one simulation.
- **One workbench for all tiles.** A sheet that doesn't belong to the current workbench (a schematic while in GA) is shown but can't be edited, as today.
- **The active tile** is the one last clicked, outlined. There's one browser and one Properties panel, and they follow the active sheet tile. The sheet list, the overview, Fit, PgUp/PgDn, the top bar's tools and the alignment tools work on it. What's picked belongs to the active tile. Placing a part from the browser places it in the tile you click.
- **Esc** cancels what's in progress, then closes the top floating window. It never closes a tile; tiles close from their bar.
- **Not remembered:** opening a project starts with one sheet tile; leaving it forgets the layout. Tiles are quick to set up, and a simple implementation matters more (director's note).
- This replaces today's Split (`SplitPane.svelte`) and its separate overview.
- **Builds on** v0.2.1 §1: one window behaviour (toggle from its button, `Esc` closes the topmost, Table as a window).

## 8. Icons on buttons, labels optional (11)

- Every workbench and top-bar button gets an icon beside its label: Draft, Annotate, GA, Simulate; Renumber, Templates, Plant, Controllers, Distribution, Table, Check, Expectations…, Schedules, Place parts…, Device table…, Project….
- A setting, **Buttons**, is a dropdown with three choices: **Labels** (the default), **Labels and icons**, or **Icons**. In *Icons*, the name shows on hover. It's saved per browser, like the theme: a personal preference, not part of the project (director's decision, second review).
- The alignment buttons (§5) are icons only under every setting.
- Icons are drawn in the same style as today's (`src/web/icons.ts`, 24 × 24 line drawings), with no icon library added. That file's note that "Ferrule's own tools keep their names" is updated.

## 9. Moved to v0.4: network drawings (controller.md §9)

A sheet type that draws a comms bus as a flow diagram from the schematic's comms wiring: controller → plant A → plant B → terminals, with the termination resistor and screen continuity marked. Moved to v0.4 (director's decision, second review), so controllers get used on real drawings first. It needs its own short design pass before it's built.

## 10. Order of work

Each step is one PR with a build, `ferrule-windows-v0.3.0-pre.zip`. The working agreement is in the repo's CLAUDE.md.

1. **Start:** version `0.3.0-pre`; this doc into the repo as `docs/design-v0.3.md`; CLAUDE.md pointed at it; `docs/design-v0.2.1.md` marked as ending at step 2. Then distribution colour as a select (§3).
2. **Busbars split** (§1).
3. **Terminals:** 2-unit terminals, 2.5 mm text, earth terminals, strip order on the GA (§2, first three parts), with the test print.
4. **Wire numbers from terminals** (§2).
5. **Link arrows:** wire number and bracketed reference (§2).
6. **Tiling windows and the live split view** (§7). The largest; split it into more than one PR if that keeps each reviewable. It comes before the remaining steps (decided here) because they all work on the active tile, and the door lamps are only useful with the door and the schematic side by side.
7. **Icons on buttons** and the Buttons setting (§8).
8. **Alignment tools** (§5).
9. **Lamps lit on the door** in Simulate (§4).
10. **GA detail sheets** (§6).

### Changed during build

(Small judgement calls made while building, step by step, go here.)

## 11. Director notes, as written (23/11/26)

**On tiling (§7):**

> Tiles aren't remembered, leaving a project simply resets the views, views will be easy to setup, so no problem with resetting them. Simple implementation is more important here as there is a negligable hit to user flow.

**On alignment (§5):**

> Elements edges will be it's body, I believe this should work the same as the 'highlight' on double click to go to reference, this same bounds will be the same edges.
>
> Maintain snapping to grid, if the math doesn't align directly on the grid, just round to the nearest grid point.
>
> GA items, maintain the finer grid - the same as what we have now for doors etc.

**Additions:**

1. *(D1, §6)* A way to add additional GA pages, for things like door plaque layouts, say Safety Extract Fan, with three lamps in it for power, flow, failed etc. Due to the scale and the relative size of a lamp and it's label, you're unable to read them on the panel door GA, so we need a different kind of GA page, where you can just do things like door plaques, or other features, as a zoomed in reference for additional clarity.
2. *(D2, §4)* Panels lamps to illuminate as part of the simulation mode.
3. *(D3, §3)* The colour and function drop down boxes for colour and function under distribution use a dropdown input instead of a select option box, this should be a select option box (consistent, no custom values) Does function even have an applicable purpose, or is it just for notation?

**Second review, answers as written (23/11/26, evening):**

1. *(§5)* Don't worry about not being able to centre a group on the sheet for now. if I understand, selecting 1, will center it to the sheet, selecting 2 will center it to the first, this is fine.
2. *(§5)* Middle of space you can use, perfect
3. *(§5)* Distribute, good plan for it - let's give it a go
4. *(§8)* Let's do a dropdown list of options, default: just labels, then labels and icons or just icons
5. *(§6)* Being able to draw a 'detail' rectangle on a GA sheet, then show that on another GA sheet, at a different scale would be useful.
6. *(§4)* I only want the lamps to light up there for a visibility option - I feel like interacting should still be via circuitry - I only suggest this because of a lot of interactions have to happen in the circuitry, it would only be door isolators and switches that could be interacted with and then you'd be switching between interacting on the door or on the circuit
7. *(§3)* Keep function for now as free text, not an input selector in 'distribution'

Then: happy with everything proposed (tiling as in §7, detail frames as in §6, editing through a frame), network drawings v0.4.
