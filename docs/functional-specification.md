# Ferrule functional specification

**Operations reference for QA. Build 0.4.5** (repo `main` at `88e8375`, 25 Nov 2026). Revision 13, 27 Nov 2026: what v0.5 changes is crossed through, with the entry that changes it, up to A75. WN-23, SH-2, SH-3 and SH-9 are filled out from the code.

Kept in `v0.5.0-pre Notes` beside `advancements-v0.5.md`, the list that findings and changes go on.

## 1. About this document

This says what every part of Ferrule is meant to do, as numbered statements you can test against. Each statement is one behaviour: do the thing, and what's written should happen. If it doesn't, the statement's ID is the reference for the finding.

- **What it's built from:** the README's editor guide, the design record and sprint plans in `docs/`, and the source itself. Names of buttons, settings, messages and limits are taken from the code of this build.
- **What it isn't:** a tutorial, or a statement of what Ferrule should become. Ideas not yet built are left out.
- **Where the documents and the build disagree,** the build is described here and the difference is listed in §17 for you to rule on.
- **It describes the build under test.** A ruling or an advancement doesn't change a statement until it's built; the statement then changes in the same PR, keeping its ID. Until then, what the entry will change is crossed through, so it isn't tested for nothing.

### Using it in QA

A finding falls into one of three kinds, and it helps to say which:

| Kind | Meaning | In `advancements-v0.5.md` |
|---|---|---|
| Doesn't operate as specified | The build doesn't do what the statement says | a **fix** |
| Operates as specified, wrong result | It does what's written, but what's written isn't what's wanted | a **tweak**, and this document changes when it's built |
| Nothing here covers it | The behaviour isn't specified at all | **missing**, or a gap in this document |

### What's crossed through

~~Crossed through~~ with an entry's number after it, *(v0.5: A26)*, means that entry in `advancements-v0.5.md` changes it in v0.5. **Don't test it on this build.**

- A whole statement crossed through is replaced. Where only a clause is, the rest stands and is tested as written.
- A note in the same brackets with nothing crossed through names the one case not to test.
- An entry that only adds something (Upload, backups, a Linux build) crosses nothing through: what's there today is still tested.
- A statement with a check waiting isn't crossed through. The checks are in the advancements list, under *Checks waiting*, and are done with this document open.
- When the entry is built, the statement is rewritten in the same PR and the crossing-through goes.

Suggested note format: `DR-31, 0.4.5: wire kept its old number after Renumber` (ID, build, what happened instead).

### IDs

| Prefix | Section | Prefix | Section |
|---|---|---|---|
| ST | Starting, files and saving | AN | Annotate |
| WN | The window | LA | Layout |
| SH | Sheets and the page | SM | Simulate |
| DE | Design | CK | Check |
| DR | Draft | SC | Schedules and output |
| PT | Parts (Draft) | PR | Project settings |
| NU | Numbering and references | MC | Claude (MCP) |

IDs are kept when the document is revised: a withdrawn statement is struck through and marked *withdrawn*, not renumbered. None is withdrawn at present; everything crossed through here is waiting on v0.5.

### Terms

| Term | Meaning |
|---|---|
| Sheet | One A4 landscape page of the set |
| Column | One of the 75 numbered divisions across a sheet; a position is written sheet-column, `3-16` |
| Unit | The drawing grid: 150 × 90 units per sheet, 2 units per column, 1 unit ≈ 1.85 mm on paper |
| Part | Anything placed in Draft (a contact, a coil, a terminal) |
| Plant | Equipment the panel connects to or contains that's defined by its pins and points: a fan, a sensor, a power supply. Anything outside the panel is plant, even another controller |
| Point | One signal of a plant item or one channel of a module (a fault contact, an enable input) |
| View | One drawing of a plant item or module on a sheet, showing the terminals ticked for that sheet |
| Controller | The panel's outstation or PLC: its modules in rail order. One per panel |
| Distribution | A named supply (L1, N, CCT, 0V) that blocks and rails pick, joined on every sheet |
| GA | General arrangement: a Layout sheet drawn to scale |
| Window | A floating panel opened from a menu button (Plant, Check, Schedules…) |
| Tile | One pane of the drawing area, showing a sheet or a docked window |

---

## 2. Starting, files and saving (ST)

- **ST-1** Double-clicking `ferrule.exe` opens a console window that shows the address, and opens the browser on the project list. Nothing is installed.
- **ST-2** Closing the console window stops Ferrule. *Quit Ferrule* under Settings → Status does the same, and the page then reads *Ferrule has stopped. Start it again from ferrule.exe; this page can be closed.*
- **ST-3** The address is `http://127.0.0.1:4810/` unless changed. If that port is taken, the next free one is used, up to 19 higher; the console shows which. Options: `--port <n>`, `--host <address>` (to reach it from another machine), `--projects <folder>`, `--no-open` (don't open the browser), `--mcp` (MCP over stdio), `--help`. *(v0.5: A5. Starting Ferrule while one is running will open that one, not start a second on the next port. Don't test that case)*
- **ST-4** Folders, all made as needed:

  | Folder | Holds |
  |---|---|
  | `projects` (beside the .exe) | New projects, one `.ferrule` file each |
  | `projects/Deleted` | Project files removed with *Delete* |
  | `library` (beside `projects`) | Draft templates sent *To library* |
  | `library/devices` | The shared device table, with datasheets and pictures |
  | `library/design` | Design templates |
  | `exports` (beside `projects`) | PDFs exported by Claude over MCP |

- **ST-5** ~~*Create project* with a title makes a project and opens it.~~ *(v0.5: A17)* A new project is bare: one empty schematic sheet titled *Sheet 1*, revision A *First issue*, position numbering, no distributions, plant, controller or templates. It's dated the day it's made: its *Drawn date* and revision A's date.
- **ST-6** *Use the shared device library for GA sheets* (ticked by default) decides whether the new project's device table offers library devices. It can be changed later under *Project…*.
- **ST-7** *Open file…* browses folders and lists `.ferrule` files; clicking one opens it. The file stays where it is and is remembered on the project list, shown with its path.
- **ST-8** Each project on the list shows its title, sheet count and when it was saved, with ~~*Duplicate* (a copy beside it)~~ *(v0.5: A8)*, *Download* (the `.ferrule` file) and *Delete* (the file moves to `projects/Deleted`, its `.bak` with it). A file opened from elsewhere also has *Remove from list*, which leaves the file alone.
- **ST-9** A project file that can't be read is listed with its error; the rest of the list still loads.
- **ST-10** *add the LSP-01 example* adds a life safety panel, drawn with Ferrule's own tools, to the list.
- **ST-11** A project opens in Draft, on one tile.
- **ST-12** Saving is automatic. After a change the status at the top right reads *Unsaved changes*, then *Saving…*, then *Saved*, within about a second. *Save failed* shows in red if it can't be written.
- **ST-13** Nothing needs saving by hand on any workbench. `Ctrl+S` also saves at once in Design, Draft and Annotate; nothing depends on it.
- **ST-14** Each save keeps the previous one as `<file>.bak` beside it.
- **ST-15** Closing or leaving the tab with unsaved changes saves them; the browser may ask to confirm leaving.
- **ST-16** *Save as…* (top bar) writes the project to a new file anywhere and carries on in that file. Saving over an existing file asks first, and the file that was there is kept as `.bak`.
- **ST-17** One `.ferrule` file holds everything, pictures included: copying the file copies the whole project.
- **ST-18** A file of any other format than this build's isn't opened, older or newer: there's no backwards compatibility before release. It's listed with the reason, *Not opened. This file needs Ferrule 0.4.5*, naming the Ferrule that last saved it (*0.9.1 or later* for a newer file), with the address of the builds. A file too old to say which Ferrule saved it reads *Not opened. This file is from an older Ferrule and can't be opened in this one*. A build that changes what a file must hold moves the format number on.
- **ST-19** Undo and redo cover the last 200 changes in the open session. An align or distribute, a Renumber *Apply* and a Suggest *Accept ticked* are each one step.
- **ST-20** Builds are on the repository's releases page, one entry for each, named `v<version>` and marked pre-release, holding `ferrule-windows-v<version>.zip` and `ferrule-linux-v<version>`. A build is made only when asked for, by running *Publish a build* by hand; nothing is published on a merge, and a version already published is refused. Old builds stay there.
- **ST-21** `ferrule-linux` is the same program for Linux. Started with `--host 0.0.0.0 --no-open`, it serves Ferrule to any browser that can reach the machine, with no browser of its own.

---

## 3. The window (WN)

### Top bar

- **WN-1** Row one, left to right: back to the project list, the project title, the workbenches (**Design, Draft, Annotate, Layout, Simulate**), then *Project…*, *Save as…*, *Export PDF*, *Print*, help, *Settings*, and the save status.
- **WN-2** Row two is in the same order on every workbench: undo and redo; the view (*Fit*, *Split*, and in Draft *Colour check*); the eight align and distribute icons; the tools (*Select*, and in Draft *Wire*); then the workbench's own buttons, starting with the menus the workbenches share in the order *Check*, *Expectations…*, *Schedules*.

  | Workbench | Row two after undo/redo |
  |---|---|
  | Design | Views *Plant, Controller, Network, To draw* *(v0.5: A70. Devices comes after Controller)*; *Check*; *Export points schedule*; then the view's own buttons (§5) |
  | Draft | Fit, Split, Colour check; align/distribute; Select, Wire; *Check, Expectations…, Schedules, Renumber, Templates, Plant, Distribution, Table* |
  | Annotate | Fit, Split; align/distribute; Select |
  | Layout | Fit, Split; Select; align/distribute; *Check, Schedules, Place parts…* (*Place detail…* on a detail sheet), *Device table…* |
  | Simulate | Fit, Split; a note that editing is off; *Expectations…* (no undo/redo) |

- **WN-3** Hovering any icon shows its name. A menu's button opens its window; clicked again, it closes it.
- **WN-4** Switching workbench clears the selection and returns to the Select tool. Leaving Simulate ends the simulation.
- **WN-5** A workbench is greyed out on a sheet it can't work on, with a tip that says why: *Draft* on a spare sheet and on a GA sheet; *Layout* on any sheet that isn't a GA (a schematic sheet's tip says to add a GA sheet from `▾`). Moving to a sheet the workbench in use can't work on takes you to the one that can.

### Panels over the drawing

- **WN-6** **Browser** (left): *Sheets*, and the parts or tools of the workbench in use. Each section folds (▸/▾); `«` folds the whole browser away and a button brings it back.
- **WN-7** **Properties** (right) shows when something is selected, or a sheet's settings are opened. Dragged by its title bar it stays where it's put; `–` folds it to its title. It scrolls up and down only: a row of buttons too long for it wraps onto another row. Design has its own Properties beside its table.
- **WN-8** **Overview** (top right of the active tile) shows the whole sheet with the visible part outlined, and the sheet number. Dragging the outline, or clicking anywhere on it, moves the view. `–` hides it.
- **WN-9** On screen the sheet is a warm off-white; print and PDF are white.

### Windows

- **WN-10** Plant, Templates, Schedules, Table, Controller…, Distribution, Expectations…, Check, Settings and the rest open as windows: dragged by the title bar, `–` minimises to the title, `×` or `Esc` closes.
- **WN-11** Windows don't block the drawing: you can scroll, select and edit behind them, and several can be open at once. Each stays where it was put for the session: reopened, it comes back there. After a reload every window, Properties and help start in their usual place; where they were isn't kept.
- **WN-12** `Esc` on the drawing cancels what's being drawn or placed first; then closes the window on top; then clears the selection. While a window is being dragged, `Esc` cancels the drag and nothing else: the window goes back where it was, still open, and no tile stays lit.
- **WN-13** With the keyboard focus in a text box or inside a window, the drawing's shortcuts (R, F, W, Del…) don't act on the drawing.

### Tiles

- **WN-14** *Split* puts the active tile's sheet in a new tile beside it. Each tile has a bar with its sheet, *split right*, *split down* and *close*. The last sheet tile can't be closed.
- **WN-15** Dragging a divider shares the space between tiles.
- **WN-16** Each tile has its own sheet, zoom and pan; the same sheet can be open in two tiles.
- **WN-17** Clicking a tile makes it active: it's outlined, and the browser, Properties, sheet list, overview, *Fit* and `PgUp`/`PgDn` follow it.
- **WN-18** Everything that opens is a window, a prompt or a panel, and the kind decides whether it docks. A **window** is opened from a button and kept open to work beside, and closing it is the only way out: Plant, Templates, Schedules, Table, Controller…, Distribution, Expectations…, Check, Place parts…, Project…, Settings and help. A window dragged by its title bar close to the edge of a tile docks there, splitting the tile on that side; dragged anywhere else it just moves. Dragging the tile's bar out floats it again. A **prompt** is one step of an action, finished by a button (Renumber, Suggest…, Duplicate ×n, Open file… and Save as…, New GA sheet, a name to type, a question, a message), and always floats. A **panel** comes up by itself with what you're doing (Properties, the Simulation panel), and always floats.
- **WN-19** Tiles aren't saved: a project opens with one.

### Settings and help

- **WN-20** *Keep placing until Esc*: off (default), a part is placed once and the tool returns to Select; on, the same part is placed at each click until `Esc`. With it off, each click made with `Ctrl` held places the part and keeps it for the next; the first click without `Ctrl` places one and ends it.
- **WN-21** *Dark interface*: the interface goes to dark greys; the sheet stays paper-coloured and the drawing black.
- **WN-22** *Buttons*: *Labels* (default), *Labels and icons*, or *Icons* (name on hover). The align icons are always icons.
- **WN-23** Theme, button style and *Keep placing until Esc* are kept for this browser, not in the project.
- **WN-24** *Status* shows the version, the projects folder, the address, whether Claude is connected (and its last tool), the settings to paste into Claude Desktop and Claude Code with *Copy* buttons, and *Quit Ferrule*.
- **WN-25** The help button opens a floating summary of keyboard and mouse use.
- **WN-26** In any number box, scrolling steps the value; `Shift`+scroll steps by ten.
- **WN-27** Align (Draft, Annotate and Layout): one thing picked lines up with the sheet's usable space (inside the border, above the title block); two or more line up with the last one clicked, which stays put; picked with a box, they have no click order and line up with the outline around them all. Distribute (three or more) keeps the outer two and makes the gaps between them equal.

---

## 4. Sheets and the page (SH)

### The sheet list

- **SH-1** `+` adds a schematic sheet after the current one. `▾` beside it offers the three kinds: *Sheet*, *Spare sheet* or *GA sheet…* (LA-1).
- **SH-2** The buttons beside it duplicate the sheet, move it up, move it down and delete it. Sheet numbers follow the order. A copy lands straight after the sheet it was made from, with its tags cleared. Delete asks first, naming the sheet.
- **SH-3** `PgUp`/`PgDn` go to the previous and next sheet in every workbench except Design. It's always the very next sheet, whatever its kind, and the workbench doesn't change.
- **SH-4** `▸` on a sheet lists what's on it for the workbench in use, in column order, each with its tag. Clicking a line selects that item and brings it into view.
- **SH-5** *Find…* searches every sheet's contents and titles.
- **SH-6** The `⚙` on a sheet, or double-clicking its name, opens its settings in Properties: *Sheet title*, *Sheet type* (Schematic, Spare, GA) and, on a schematic sheet, *Panel boundary*.
- **SH-7** A spare sheet is badged *spare* and a GA sheet *GA* in the list.
- **SH-8** A spare sheet holds annotations only (notes, tables, pictures). Draft and Layout are unavailable on it.
- **SH-9** *Sheet type* changes a sheet's kind. Only an empty sheet can become a GA (otherwise it says how many things are on it), and a GA sheet with things laid out can't change type until they're deleted. A sheet with parts or wires on it can't become a spare sheet either: it says how many are in the way.
- **SH-10** A sheet with revision clouds lists them in its settings (*Cloud 1, columns 12–30*) with *Remove*.

### The page

- **SH-11** Every sheet is A4 landscape with a frame, 75 columns numbered below the frame every ten (10, 20 … 70) with ticks every five, and unlabelled ticks up the sides. There are no rows.
- **SH-12** The drawing area is 150 × 90 units. Parts snap to the grid.
- **SH-13** All drawing text is osifont. Sizes on paper: title 5 mm, heading 3.5 mm, tags, labels and terminal, pin and wire numbers 2.5 mm, notes 2.5 mm, detail (cross-references, pin ids, colours, ratings, contact tables) 1.8 mm. Nothing prints smaller than 1.8 mm.
- **SH-14** Line weights on paper: symbols and wires 0.25 mm; a power rail 0.35 mm on an extra-low-voltage supply (up to 50 V AC or 120 V DC, as BS 7671) and 0.5 mm on a low-voltage one; the terminal block and plant outlines 0.5 mm; distribution blocks and the frame 0.7 mm.
- **SH-15** The title block along the bottom shows the logo; *Project*, *Panel name* and the sheet's title; then three rows: *Sheet x of y*, job no. and checked by and date (three equal cells), drawing ref. and drawn by and date (two equal cells), and client (the whole width); and the latest four revisions with the newest at the bottom.

### Moving about

- **SH-16** Scroll zooms. Middle-drag, or holding `Space` and dragging, pans. Tapping `Space` (or *Fit*) fits the sheet in the tile.

---

## 5. Design (DE)

Design lists what the panel has before anything is drawn: systems, plant and points in the Plant view, the controller and its allocation, and the networks. Its views run Plant, Controller, Network, To draw. Nothing is drawn here. A project with no plant and no controller works in Draft alone, and Design shows an empty table.

### The Plant view

- **DE-1** *+ System* adds a system (a name that groups plant). Picking its row shows its name, *Move up*, *Move down* and *Delete system* in Properties.
- **DE-2** Deleting a system leaves its plant in the table under *No system*. Renaming one keeps its plant with it.
- **DE-3** *+ Plant* adds an empty plant row in the picked system, after the picked plant.
- **DE-4** *+ Point* is available with one plant, or one of its points, picked. It adds an empty point under that plant, named *Point n* and picked, ready to fill in from Properties; there's no prompt. Until its form is chosen it's marked ● with *–* for its form, and it needs no channel and doesn't simulate.
- **DE-5** A point with no pins is marked ○. It gets pins when the plant's pins are given or it's placed.
- **DE-6** Columns: Tag, Description, Point, Form, Signal, Type, Channel. A plant item with several points takes one line per point, its tag and description on the first.
- **DE-7** Systems fold (▸) and show a count when folded.
- **DE-8** `Ctrl`+click and `Shift`+click pick several plant rows. With several picked, Properties offers *Move to system*, *Duplicate ×n…*, *Save as template…* and *Delete*.
- **DE-9** Plant marked *In the panel* is listed in a group of its own, **Panel**, not under a system.
- **DE-10** Plant from projects older than v0.4 is listed under *No system*.
- **DE-11** `Esc` lets go of what's picked. `Ctrl+Z`/`Ctrl+Y` undo and redo.
- **DE-85** A plant shares a line with its first point. Clicking its tag or description picks the plant; clicking from a point's name across picks that point. Properties shows the one thing picked and nothing else.

### A plant item's Properties

- **DE-12** Fields: *Tag*; *Description*; *Prefix*; *System*; *Connects by* (Hardwired, Comms, Hardwired and comms); *Mark*; *Information* (printed under its box on the drawing); *In the panel*; *Power by others*; ~~*Pins, from the datasheet*~~ *(v0.5: A67)*. Buttons: *Terminals…*, *Duplicate ×n…*, *Save as template…*, *Delete plant*. Its points aren't listed here: each is picked in its own row (DE-19).
- **DE-13** With the tag left empty, Renumber tags the plant from its prefix and where its first view is drawn (prefix `P` at sheet 3, column 12: `P3-12`; default prefix `U`). A typed tag is kept.
- **DE-14** Choosing *Comms* or *Hardwired and comms* adds *Protocol* (free text) and *Network*.
- **DE-15** *In the panel* (a power supply, UPS or battery) lists the plant under Panel, draws it above the boundary with solid, numbered wiring, and lets it be placed on a GA sheet like any panel part.
- **DE-16** *Mark* puts a small picture in its view: ~~Temperature, Pressure, Humidity, ΔP switch,~~ *(v0.5: A66: typed as letters)* Valve, Damper, Meter, Power supply, Battery, or None.
- **DE-17** *Power by others* draws a break on the left of its view.
- **DE-18** *Pins* is one line, each point and its pins with `|` between: `enable: 1 2 | fault: 11 14`. Points not named in the line keep the pins they have. The same pin number can be in two points (a shared common). *(v0.5: A67. The line is in the Terminals window only)*
- **DE-19** A point is edited in one place, its own Properties, by picking its row: its **name**, **form**, **signal** (free text; suggested: volt-free, 24 V, 230 V, 0–10 V, 4–20 mA, thermistor, pulse), **goes to** and **channel**, with how it's wired to its channel (DE-23). Shown, not set there: its terminals, with *Terminals…*. For an output, *In Simulate*: clicked, or follows (what, on or off, after how long). Its interlocks and expectations, with *+ Interlock* and *Expectations…*. *Delete point*.
- **DE-20** Forms, from the plant's side, and the controller channel type each needs. In the list, and under the box once one is picked, each says in plain words what it is and the channel it needs:

  | Form | Meaning | Type needed |
  |---|---|---|
  | Contact | The device switches it: a fault, a status | DI |
  | Powered output | The device puts out a voltage | DI |
  | Dry input | On when the panel closes its loop: an enable | DO |
  | Powered input | On when the panel puts a voltage on it | DO |
  | Analogue output | A signal from the device | AI |
  | Analogue input | A signal to the device | AO |
  | Supply in | Power to the device | none |
  | Supply out | Power from the device | none |
  | Comms | RS485, Modbus… | none |

- **DE-21** *Goes to*: **Channel** (wired straight to a controller channel), **Channel, via relay** (the plant switches a relay whose contact switches the channel, or the reverse for an output), or **Panel only** (used in the panel's own circuits; never needs a channel).
- **DE-22** ~~A supply out point takes *Gives*, *Rating VA* and *Efficiency %*; a supply in point takes *Takes* and *Draw VA* (see SM-20 to SM-23).~~ *(v0.5: A38)*
- **DE-23** An allocated point shows how it's wired to its channel: *✓ Wired straight to its channel*; *✓ Wired to its channel via K…*; *✓ Wired: confirmed by hand* (with *Undo*); *Not wired straight to its channel: check the drawing* (with *Confirm by hand*); or *Not drawn yet*.

### The Needs line

- **DE-24** Along the bottom of the table, **Needs** counts the points that go to a channel (straight or via a relay) by type: DI, DO, AI, AO. Panel-only points aren't counted.
- **DE-25** With no controller it reads *No controller yet: these are the channels the panel needs.*
- **DE-26** With a controller it adds **Have** and **Spare**. A shortfall shows in red (*DI short 2*). Universal channels cover a shortfall of any type, and what's left of them shows as *UIO n*.

### Duplicate ×n

- **DE-27** *Duplicate ×n…* copies the picked row or rows n times, after the last of them. The window shows each copy's tags before anything is made.
- **DE-28** Tags step by the *Step* given on **the last number** (P1 → P2, P3; `AHU-01` → `AHU-02`), on **the first number** (`P1-12` → `P2-12`), or are **left blank** for Renumber.
- **DE-29** A tag that's already taken is shown as taken and left empty on that copy.
- **DE-30** Copies keep their points and signals. Links between rows of the copied group follow the copies. Copies aren't on any channel and aren't drawn. A copy's description starts empty, ready to type.

### Design templates

- **DE-31** *Templates…* lists your Design templates. None are built in.
- **DE-32** *Save selection as template…* saves the picked rows under a name.
- **DE-33** Picking a template shows what it inserts: its rows, their points, and the DI, DO, AI and AO it needs in total, multiplied by *Copies*. *Insert* puts them into the chosen system with tags stepping by *Tags step by*.
- **DE-34** A tag already taken in the project is left empty, and the window says how many.
- **DE-35** Inserted rows are ordinary plant: nothing links back to the template.
- **DE-36** Design templates are kept in `library/design`, so every project lists them. They're a separate list from Draft's templates: neither shows the other's.

### Controller view

- **DE-37** With no controller the view says so and offers *Add the controller*. A panel has one controller; a file from before v0.4 with more than one shows them all.
- **DE-38** The view shows the points still to allocate on the left (*Unallocated (n)*), and the controller's modules in rail order, each channel with the point on it or spare, and *n of m used* per module. *(v0.5: A67. Every module is shown on the rail, and picked there)*
- **DE-39** **Allocation is by hand.** Dragging a point onto a channel allocates it. While dragging, only channels that can take the point light up. A universal (UIO) channel takes any type.
- **DE-40** The channel can also be picked in the table's *Channel* column or in Properties; both offer only free channels of the right type.
- **DE-41** Dragging a point back to *Unallocated*, or picking it and pressing *Unallocate*, takes it off its channel.
- **DE-42** A point no channel can take says why in red (*the panel has no analogue outputs*).
- **DE-43** A *via relay* point counts as allocated once it has a channel. A *panel only* point never appears as unallocated.
- **DE-44** A channel's label follows the point on it (plant tag and point name, *DPS1 flow*) on the drawing and in the IO schedule, and changes when the point or plant is renamed or retagged. Taken off, the channel shows the label typed by hand again.

### Controller… (the window)

- **DE-45** ~~*Controller…* describes the controller (description, prefix) and lists its slots in rail order: address, tag, type, channels, maker, model, where drawn.~~ *(v0.5: A67: the window goes)*
- **DE-46** Module types: Power supply (PSU), Host, Digital inputs (DI), Digital outputs (DO), Universal IO (UIO), Analogue inputs (AI), Analogue outputs (AO). The IO types take a channel count and are written `DI-8`, `UIO-16`. *(v0.5: A68. Adapter is added)*
- **DE-47** *Add module* adds one of a type; *Add a saved model…* adds one entered before; *Add spare slot* leaves a slot for later. *(v0.5: A67. These are under `+ Module` on Design's row)*
- **DE-48** A slot's bus address follows rail order unless set by hand (to match DIP switches). Clearing a hand-set address returns it to rail order.
- **DE-49** *Generate…* fills a module's pins from a pattern: pin ids per channel (`VO RET CO`, `IO C`, `Y ⊥`), first pin number, names with `#` for the channel number (`AO#` → AO1, AO2…), the first channel's number, any shared pin and how many channels share it, and the form. *(v0.5: A67. Generate is in the Terminals window, on IO modules only)*
- **DE-50** ~~*Pins and points…* edits a module's pins and each point's label by hand.~~ *(v0.5: A67)*
- **DE-51** *Commons linked* joins the module's commons (C, RET, 0 V) inside it: one return serves them all in Simulate and in the wiring check, and the view shows the link.
- **DE-52** ~~*Draw (VA)* on a module is counted on the controller's power supply module in Simulate.~~ *(v0.5: A38)*
- **DE-53** *Save model* keeps a module, pins and all, in the device table (and from there the shared library). *(v0.5: A67. It's Save as device, in the module's Properties)*
- **DE-54** ~~The arrows move a module left or right along the rail; delete removes the module and every view of it.~~ *(v0.5: A67: dragged along the rail)*
- **DE-55** A module is tagged by where its first view is drawn, prefix **A**: at sheet 3, column 23 it's `A3-23`, and its points are `A3-23:DI2`. With a controller map in the set, modules take their tags from their place on the map.

### Suggest…

- **DE-56** *Suggest…* proposes a channel for each point still to allocate, in table order: the first free channel of its type in rail order, a module of the point's own type before a universal one.
- **DE-57** Each line can be unticked or given another channel. *Accept ticked* allocates only the ticked lines, as one undo step. *Throw away* changes nothing.
- **DE-58** It never runs by itself, and points already on channels aren't moved. A point with no room reads *no free channel of its type*.

### Network view

- **DE-59** *+ Network* adds a network (*LAN 1*, *Bus 1*…) with a name, a protocol (free text) and a kind: **LAN, off a switch** or **Bus, off the controller**.
- **DE-60** Comms plant is put on a network in the plant's Properties (*Network*) or from the network's list (*Put a device on it…*).
- **DE-61** Devices are in table row order, which is the order along a bus. ↑ ↓ moves a device, and its row in the table moves with it.
- **DE-62** Deleting a network leaves its devices on none.
- **DE-63** The view draws the controller and a switch along the top (the switch only when there's a LAN), each LAN as a trunk off the switch with its devices, each bus as a chain from the controller. Past sixteen devices on a LAN or eight on a bus the rest are counted (*… FCU-17 to FCU-19 (3 more)*).
- **DE-64** A bus can name its **Port**: a group of pins marked as a serial port in the controller's (or a device's) *Pins and points*. The sheet prints it at the controller end (*COM A: Drives bus*).
- **DE-65** Once that port has wires on it, the bus's devices and their order come from the drawing (*from the drawing*, no ↑ ↓), followed from the port to each device's serial port and on.
- **DE-66** *Place as sheet* adds a spare sheet titled *Network diagram* at the end of the set, with a Network diagram on it that's redrawn whenever the networks change.
- **DE-67** The switch is drawn only: it has no tag or ports. Addresses aren't held.

### To draw

- **DE-68** *To draw* lists what Design has that isn't on a sheet: **Panel** plant, **Field plant** and **Modules**, each with a red dot until drawn. What's drawn is ticked, with its sheets. The header counts *n left of m*.
- **DE-69** Comms-only plant with no wired points isn't listed as to draw; it's shown under **On the network**, with *Show* opening the Network view.
- **DE-70** *Place on sheet* opens Draft with the item ready to drop on the open sheet, or the nearest schematic sheet, with its tag, pins and channel labels from the data.
- **DE-71** A point with no pins gets them first: Ferrule suggests numbered pins (`enable: 1 2 | fault: 3 4`) to correct to the datasheet's, then *Give pins, then place*.
- **DE-72** Drawn plant and modules offer *Place another view*, to split them across sheets.
- **DE-73** Plant not fully allocated can still be placed; the line reads *not all allocated*.
- **DE-74** **Interlocks** are listed with their state, and *Prove all* proves them one at a time, showing progress (*Proving 2 of 4…*) with *Cancel*.

### Interlocks

- **DE-75** *+ Interlock* in a point's Properties makes *this point is never on while that condition holds*: a condition is any on/off point in the table, on or off. A point's interlocks are listed in its Properties.
- **DE-76** An interlock takes several conditions, joined by **all of** (only while every condition holds) or **any of**. *+ Condition* adds one.
- **DE-77** Each interlock makes a *never* expectation, shown in Expectations… as made by an interlock. It can't be edited or deleted there, only in Design.
- **DE-78** The expectation follows: renaming either point or duplicating the plant keeps it right; deleting the interlock removes it.
- **DE-79** *Prove* (Properties), *Prove all* (To draw) or *Check logic* (Simulate) tries every sequence that can affect it. Results: **Proved**; **fails** (Check logic shows how); **never on: is it powered?** (its point can't come on, so nothing is proved); **not drawn** (a point it names isn't on a sheet); **not proved: too many sequences**; or **not proved yet**.
- **DE-80** A proof is for the drawing as it was. Change the drawing and the interlock reads *not proved yet* until proved again. ~~Proving is asked for, never run on each edit.~~ *(v0.5: A75. Proved on entering Simulate)*

### Export points schedule

- **DE-81** *Export points schedule* downloads `<drawing ref. or project id> points schedule.csv` and confirms the row count.
- **DE-82** Columns: System, Tag, Description, Point, Form, Signal, Type, Goes to, Controller, Module, Channel, Via, Wired. Rows are by system, in table order.
- **DE-83** Unallocated points are listed with the channel empty. Plant with no points is a row of its own.
- **DE-84** *Via* names the relay when the check traced one. *Wired* is one of: direct, via, confirmed, to review, not drawn; it agrees with Properties.

---

## 6. Draft (DR)

The electrical drawing: parts, wires, rails, plant views, numbering and links. In Draft only drawing parts can be selected; annotations are drawn grey and can't be picked.

### Placing

- **DR-1** Picking a part in the browser and clicking on the sheet places it, snapped to the grid. The tool then returns to Select, unless *Keep placing* is on or the click was made with `Ctrl` held, which keeps the part for the next click (WN-20).
- **DR-2** Typing in *Find a part…* narrows the list by name or group; `Enter` picks the first match; `Esc` clears it.
- **DR-3** While placing, `F` flips the part before it's dropped, and `R` turns one that turns (DR-8).
- **DR-4** Picking the active part again, or `S` or `Esc`, returns to Select.
- **DR-5** Parts are grouped: Contacts, Operators, Coils, Protection, Loads, Connection.

### Selecting and editing

- **DR-6** Click selects. Dragging on empty paper box-selects. `Shift`/`Ctrl`+click adds to the selection. `Ctrl+A` selects everything this workbench edits on the sheet.
- **DR-7** Dragging moves the selection on the grid, its wires following.
- **DR-8** `R` rotates 90° the parts that turn: the earth, the cable screen, terminals, the socket outlet, the connector, the incoming supply, blocks and rails, the terminal strip line, and plant and module views. Contacts, coils, push buttons, selectors, isolators and breakers, fuses, lamps, the transformer, the motor and the connector block don't: they sit in a drop and are drawn the way the sheet runs, so *Rotate* isn't offered and `R` says so. `F` flips top to bottom; a flipped contact's numbers still read the right way up. Only the symbol turns over: its tag stays above its label.
- **DR-9** Arrow keys nudge by 1 unit, `Shift`+arrow by 2.
- **DR-10** `Ctrl+D` duplicates the selection 4 units to the right and selects the copies.
- **DR-11** `Del` or `Backspace` deletes selected parts, wires, sections and clouds.
- **DR-12** `Ctrl+Z` undoes, `Ctrl+Y` or `Ctrl+Shift+Z` redoes.
- **DR-13** Properties for one part shows its name, sheet, column and position; *Tag* and *Tag fixed*; *Label* and *Label width*; its own settings; *Rotation*; and on a sheet with a boundary, *In panel* or *Field (below boundary)*.
- **DR-14** A setting that doesn't apply to the part as it's set is greyed and reads what it's fixed to.
- **DR-15** A label is one line unless *Label width* is set, which wraps it.
- **DR-16** A part's labels (tag, label, rating; a plant view's text under its box) move as one block: select the part and drag them. *Label back to its place* undoes it.
- **DR-17** With several things selected, Properties gives the count; with terminals among them, *Terminal strip* and *Show the strip identifier beside them* for them all; with hand-routed wires among them, *Reset wire routes*.

### Wires

- **DR-18** `W` or *Wire* starts the wire tool: click a terminal, then another. `S` or `Esc` returns to Select.
- **DR-19** Clicking part-way along a wire tees into it and adds a junction dot.
- **DR-20** A wire to a distribution block or rail drops straight onto it.
- **DR-21** Wires route themselves at right angles around parts, and keep a clear unit off terminal strips and module pin rows.
- **DR-22** Selecting a wire and dragging a leg adjusts the route by hand (*Route: adjusted by hand*); the ends stay on their terminals. *Reset route* hands it back to the router.
- **DR-23** A wire's Properties: *Wire number* and *Lock number*; *Core colour*; *Function* (suggested: 0V, 24V, 24V AC, 24V DC, 230V, L, N, L1–L3, PE, 0-10V, SIG, COM, FE, plus the project's own); *Kind*; *Show number*; *Show colour*.
- **DR-24** A wire's number and colour print as one label, number then colour (`8-23A Bn`), with no separator: the number at 2.5 mm, the colour at 1.8 mm. It reads left to right just above a horizontal run and bottom up just left of a vertical one, so the wire underlines it, whichever end the wire was drawn from. It sits in the middle of the longest run; too long for a short wire that lands on a block or rail, it runs away from the block instead of across it. A wire that shows only one of the two prints that one. The function doesn't print: it's how the wire takes its colour (DR-28), and a Text note says anything more.
- **DR-25** A wire's number prints once per sheet, on its longest run. Earth and field wires don't print theirs unless *Show number* is ticked.
- **DR-26** The label is dragged along its own wire as one piece. *Label back to its place* undoes it.
- **DR-27** A new wire takes its colour from the block or rail it leaves, or from the wire on the other side of the fuse, contact or terminal it's drawn from. A push button carries it between the two terminals of each pole, normally open or closed; a plant or module view between the pins of a point that switches (a relay output's common and NO, a plant's fault contact).
- **DR-28** A wire with no colour of its own takes its function's colour from *Wire colours by function* in the Distribution window (DR-48); its function comes from its distribution when it's on one, else from the function set on the wire. Properties says where the colour came from.
- **DR-29** A wire goes straight onto a terminal and keeps its number through it.
- **DR-30** *Kind*: **Automatic** (by the panel boundary), **Panel wiring**, or **Field wire** (dashed).
- **DR-31** A wire is field wiring automatically only when it's below the panel boundary. Plant drawn above the boundary, or on a sheet with no boundary, has solid, numbered panel wiring.
- **DR-32** Wires from a cable screen are dashed.
- **DR-33** *Colour check* (beside Split) draws every wire, block and rail in its core colour with a dark edge, and grey dashes where no colour is set. Print and PDF stay black.

### Links and cross-references

- **DR-34** Selecting a contact and picking its coil under *Driven by coil* (listed by tag and description) links it: it takes the coil's tag and the next pole number (13/14, 23/24, 31/32…).
- **DR-35** A linked coil gets a **contact table** to its right, with the coil's tag above it, listing each contact, its type and where it is. Dragging moves the table; *Put the contact table back beside the coil* undoes it; clicking a row jumps to that contact.
- **DR-36** Double-clicking a contact jumps to its coil; a coil, to its first contact; a link end, to its partner. Where you land is highlighted until something else is selected.
- **DR-37** References are always in full (`11-06`), on the same sheet too.
- **DR-38** A contact linked to a timer coil is timed by it: it draws the delay mark for the timer's function and takes 17-18 (NO), 15-16 (NC) or 15-16/18 (changeover). *Instantaneous* keeps it a plain contact switching with the coil. Unlinking returns it to a plain contact.
- **DR-39** ~~A coil placed as a device with *Relay pins* (LA-33) prints that base's terminal numbers on the coil, its contacts and its contact table, in place of A1/A2 and 11/12/14.~~ *(v0.5: A70)*

### Link ends

- **DR-40** A wire carries on to another sheet from a **link end**, the end of a wire on bare paper. A wire drawn from a terminal and finished on bare paper ends in a **source** (it leaves the sheet there); one started on bare paper and finished on a terminal begins at a **destination** (it arrives there). It points along its wire. A link end isn't a part: it's not in the parts list, can't be placed or dropped on a terminal, is the end of one wire only, and goes when its wire does.
- **DR-41** A link end is selected by itself. Its properties: its label, *Continues at* (its partner, from a list), *Link…*, *Go to* the partner, *Source*, and *Same label as its source*. Ticking or unticking *Source* swaps the pair, so one drawn backwards is put right.
- **DR-42** *Link…* then a click on another link end, on any sheet, pairs them: the one linked from is the source and the one clicked its destination. *Link…* from a source then a click on bare paper carries the wire on in one move: it starts the arriving wire there, already linked, to be finished on a terminal. A bar across the top says what's being linked; `Esc` cancels.
- **DR-43** A source is the outline of an arrowhead pointing away from its wire; a destination the outline of an arrow's tail, notched at the back, pointing into its wire. One not linked yet is struck through, on paper as on screen, and has no place in brackets.
- **DR-44** A link end prints its label, then its partner's place in brackets, `(9-18)`: past its far end, on the wire's line. A destination shows its source's label unless *Same label as its source* is unticked. Brackets always mean a place; a bare number always a wire.
- **DR-45** The wire keeps its number and colour across the pair: it's one wire. A wire too short for its own label (DR-24) prints none, and its link end prints it: number then colour, above a horizontal end, left of a vertical one.
- **DR-46** An unlinked link end carries no reference: there's nothing to type, and *Check* reports it (CK-4).
- **DR-47** A link end can't pick a distribution: a wire reaches a supply only by being drawn onto its block or rail.

### Distribution blocks, rails and distributions

- **DR-48** *Distribution* (top bar) lists the project's supplies: name, **tag** (a whole number, given from 1 in the order they're added, changeable, 0 allowed), kind (AC line, AC neutral, DC +, DC 0 V, Earth), voltage, colour, function, and the sheets each is used on. New projects start with none. Below the list, **Wire colours by function**: a table of functions (phase, neutral, earth, 24 V +, 0 V, DC signal, AC signal, external supply, and any added) and their colours, empty to start. Colours are IEC codes: Bk, Bn, Rd, Og, Ye, Gn, Bu, Vt, Gy, Wh, Pk, Tq, GnYe.
- **DR-49** A **Distribution block** is the physical busbar or block: drawn heavy, tagged W, placed on the GA, counted in the bill of materials. A **Power rail** is the common of a drawing, not a part: no tag, not on the GA or the bill of materials, no ways. Its weight is read from its supply's voltage (SH-14), with no setting on the rail; on no supply, or one whose voltage has no number in it, it's drawn as extra-low voltage, and Properties says which.
- **DR-50** A block or rail picks a distribution. Everything on the same distribution is joined on every sheet. Nothing else picks one: an incoming supply or a plant's supply out is wired to its block or rail like any other part, so an isolator drawn in between switches what's after it.
- **DR-51** A block or rail on no distribution is *local* and joins nothing else. Deleting a distribution makes its blocks and rails local.
- **DR-52** A block or rail's name sits at its left end beside its tag; on a supply it's the supply's name and number (`CCT 4`). *Name at both ends* prints it at both.
- **DR-53** Length is 2 to 150 units. Colour and function come from the distribution unless set on the part.
- **DR-90** A distribution block's **ways** are counted from the drawing: each wire drawn onto it needs one, a wire to a link end or a rail included. Nothing is typed in and there's no setting for spares; Properties shows *5 wires: needs at least 5 ways*. Each drawn block is its own part with its own ways, and a block doesn't span sheets.

### The panel boundary and terminals

- **DR-54** Ticking *Panel boundary* in a sheet's settings draws the boundary as a **terminal block** across the sheet, with white space at each end.
- **DR-55** A terminal placed on the block, or dropped within a unit of it, becomes a cell of the block with its number written up the cell.
- **DR-56** Each cell is one column wide. A terminal dropped closer than that to another moves along to the next free place.
- **DR-57** The strip name (`X1`) is at the left end of the block and again wherever the strip changes along it; the cells carry only the number (`3-13`).
- **DR-58** Dragging the block between terminals moves it, and its terminals with it.
- **DR-59** Everything above the block is in the panel; everything below is field equipment, and wires to it are dashed field cables.
- **DR-60** Terminal *Type*: Terminal; Fused terminal (a fuse on the panel side, on top of the terminal); Disconnect (an open knife link); Switched fuse (the knife with the fuse on its blade); Earth (the earth sign, and no number printed in its cell).
- **DR-61** A terminal away from the boundary is a small circle and can show its strip identifier beside it.
- **DR-62** A **Terminal strip line** drawn through a group of terminals puts them all on its strip; it's drawn over the terminals it crosses.

### Plant views

- **DR-63** Draft's *Plant* window lists the plant made in Design, ~~with its pins line,~~ *(v0.5: A67)* the sheets it's on, *Place view* and *Pins and points…*. Plant isn't created or deleted here. *(v0.5: A67. *Pins and points…* becomes *Terminals…*)*
- **DR-64** *Place view* is available once the plant has pins.
- **DR-65** A view shows the terminals ticked under *Terminals shown on this sheet*. Hidden terminals give the box a break line.
- **DR-66** Pins sit in boxes along the view's edge with each point's name in capitals under them. The tag, description and information lines print under the box, wrapping to within about 1–2 units of the box's width.
- **DR-67** ~~*Pins and points…* is the full table: each pin's **number** (what's wired), **id** (C, Y1, VO) and **group** (IO1, AO1), drawn when present; and each point's form, label and how it simulates (*Clicked in Simulate* or *Follows …*). A group can be ticked as a serial port.~~ *(v0.5: A67: the Terminals window)*
- **DR-68** A view takes a **Width**: typed, dragged by its right edge, or *Fit to sheet*. Its groups of terminals then spread with equal gaps.
- **DR-69** *Terminals on*: the top, bottom, left or right, for the whole view; with more than one group, each group can face its own side.
- **DR-70** All plant views are at least as tall as a five-character pin name, so they line up.
- **DR-71** Editing a placed view from Draft changes the same data Design shows.
- **DR-72** Labels can hold `{plant:…}` fields (the *+ field* picker), which always show the plant's current tag.

### Module views

- **DR-73** A module view placed from To draw goes at the top of a schematic sheet with its terminals along the bottom.
- **DR-74** It has a title row (`A3-23 · Module 9 · DI-8 · part of A2-5, AHU-1 outstation`), the type heading, and for each channel its name, pin ids and numbers, with each point's label along its wire. The title wraps to the view's width.
- **DR-75** *Channels shown on this sheet* splits a module across views; a view that leaves channels out has a break at that edge.
- **DR-76** A split module keeps one tag, from its first view. A continuation says where it carries on from, and a point drawn there is referred to with where it is: `A3-23:DO5 (4-10)`.

### Templates (Draft)

- **DR-77** *Templates* saves the current sheet (*Save this sheet*), or a selected section box and what's in it (*Save selected section*), under a name.
- **DR-78** *Stamp…* makes a copy for other plant: for each plant in the template, pick existing plant, *The same plant*, or *New plant item…* with a tag. The copy gets fresh tags.
- **DR-79** A sheet template goes in as a new sheet (with a *New sheet title*); a section template goes where you click.
- **DR-80** A contact on a coil outside the template stays on that coil. A link end's link out of the stamp is dropped, and the stamped link ends are listed to link again.
- **DR-81** After a stamp, *Links out of the stamp* lists the links kept and the link ends and contacts to link again; each is a click to select.
- **DR-82** Stamped copies don't change when the template does.
- **DR-83** *To library* saves a copy in the `library` folder; *Import into project* brings one in from it.

### Table

- **DR-84** *Table* lists every element in the project: sheet, column, tag, type, label, *Tag fixed*.
- **DR-85** It filters by type, by plant, and by text in tag, type or label, and shows the row count.
- **DR-86** Tags and labels are edited in place. A linked contact's tag can't be edited (it takes its coil's).
- **DR-87** Ticked rows can be find-and-replaced in tags or labels, and have their tags fixed or unfixed in bulk.
- **DR-88** *Show* goes to the element on its sheet.
- **DR-89** The table is for Draft; opened elsewhere it says so.

---

## 7. Parts (PT)

Tag prefixes follow IEC 81346-2 as applied in `docs/designations.md`. Untagged parts show `K?`, `S?`… until Renumber.

| ID | Part | Prefix | Settings | Expected |
|---|---|---|---|---|
| **PT-1** | Contact | K, Q (from its coil) | *Contact*: normally open, normally closed or changeover; *Instantaneous*, shown only on a contact linked to a timer | One part, its kind picked in its properties. Unlinked, it's a K: terminals 13-14, 21-22 or 11-12/14 by its kind. Linked: its coil's tag and pole numbers, and timed when the coil is a timer |
| **PT-2** | Push button | S | Poles 1–4; each pole NO or NC | One head. Pole *n* is numbered *n*3/*n*4 when NO and *n*1/*n*2 when NC (13/14 or 11/12, 23/24 or 21/22…) |
| **PT-3** | Selector | S | *Positions*: 2 (0–I), 3 (I–0–II) or 4 (1–2–3–4, no off); poles 1–4; *Changeover* (2 or 3 position): every pole a changeover; otherwise each pole picks from the choices its positions have: on 2, NO closed in I or NC opened in I; on 3, NO closed in I, in II or in both, NC opened in I or II; on 4, closed in one position, 1 to 4; *Key operated*; a name per position | Position names print under the head as `SUPPLY 1 – OFF – SUPPLY 2`. A pole is numbered *n*3/*n*4 when NO and *n*1/*n*2 when NC; a changeover *n*1 common, *n*2, *n*4 on a 2-position switch, and as makers do on a 3 (common 2, to 3 in I, to 1 in II; the next pole 7, 6, 5). Changing the positions puts a pole on a choice they don't have back to its default |
| **PT-4** | Isolator / MCB / contactor | Q or F | *Function*: Isolator (Q), Contactor main contacts (Q), Circuit breaker / MCB (F), RCD / RCBO (F); main poles 1–4; aux NO 0–3; aux NC 0–3; *Operator* (an isolator only): rotary handle, door handle or key; every isolator has one | Contactor poles are worked by the coil picked under *Driven by coil*. A breaker draws no operator. An RCD carries the residual current mark |
| **PT-5** | Fuse / fuse carrier | F | Poles 1–4; *Rating* | Rating prints beside it |
| **PT-6** | Coil | K for a relay or timer, Q for a contactor | *Type*: Relay, Contactor or Timer; ~~*Takes (supply)*; *Draw (VA)*~~ *(v0.5: A38)* | One part: the symbol changes with the type. Terminals A1, A2; contact table once contacts are linked. Its contacts follow the type: set to Timer, they're timed |
| **PT-7** | Coil set to Timer | K | Shown only when the type is Timer: *Function*: TON, TOF, TON+TOF, TP, Flasher ON first, Flasher OFF first; *Time* (`500ms`, `5s`, `1.5s`, `2min`); *Maker's function code*; ~~*Takes*; *Draw*~~ *(v0.5: A38)* | Function, time and code print by the coil; the simulator runs it |
| **PT-8** | Indicator lamp | P | *Colour*: Rd, Ye, Gn, Bu, Wh; *Lamp test terminal (LT)*; ~~*Takes*; *Draw*~~ *(v0.5: A38)* | Terminals +V and −V; with lamp test, a third, LT. Every lamp has a colour (white covers a clear lens) |
| **PT-9** | Terminal | (number only) | *Terminal strip* (default X1); *Type*; *Show the strip identifier beside it* | See DR-55 to DR-61 |
| **PT-10** | Socket outlet | X | none | A box with L and N on top, 3 units apart to line up under an MCB, and E beside them |
| **PT-11** | Connector block | X | *Terminals* 2–12 (the total); *Columns* 1–12, default 2 | A box of terminals all at one potential (an earth, 0 V or screen block), sized from the two: two columns are a pair to a row, in on the left and out on the right; one column has every terminal on the left; three or more make a wide block of two rows, its terminals along the top and bottom (widening to fit, so 12 in 4 columns is drawn 6 across). Doesn't turn (DR-8) |
| **PT-12** | Connector (plug and socket) | X | *Ways* 1–12 | Each way a plug pin and a socket contact, for flying leads |
| **PT-13** | Transformer | T | *Earthed screen*; *Rating*; *Gives*; *Rating (VA)* | Terminals P1, P2, S1, S2 at switch pole pitch; a supply in Simulate once its primary is energised |
| **PT-14** | Motor | M | *Rating*; *Phases*: three (U V W) or single (L N); *Type*: motor, fan or pump | Terminals at pole pitch, so it wires straight down from the contactor above. The type changes the picture and the name: a pump reads *Pump* in its properties and in the legend |
| **PT-15** | Distribution block | W | See DR-48 to DR-53 | |
| **PT-16** | Power rail | none | As the block | Drawn by its supply's voltage (DR-49) |
| **PT-17** | Earth | none | *Type*: earth, protective (PE), functional (FE), chassis, equipotential | The IEC 60417 symbol for the type |
| **PT-18** | Link end | none | Not a part: the end of a wire on bare paper. See DR-40 to DR-47 | |
| **PT-19** | Terminal strip line | none | *Terminal strip*; length | See DR-62 |
| **PT-20** | Cable screen | none | *Width across the cores* 1–60 units; *Dashed* | No tag; its drain wire attaches at either end |
| **PT-21** | Incoming supply | none | *System*: 3-phase + N, 3-phase, single phase, DC; *Gives*; ~~*Rating (VA)*~~ *(v0.5: A72)* | Where the simulator's power comes from. It picks no distribution: it's wired to its blocks (DR-50) |

- **PT-22** Multi-terminal parts keep the switch pole pitch (3 units) between terminals.
- **PT-23** Text fields such as *Rating* show an example as greyed placeholder text.

---

## 8. Numbering and references (NU)

- **NU-1** New parts and wires aren't numbered until **Renumber** is pressed. Numbers never change by themselves while drawing.
- **NU-2** *Renumber* first shows a table of what would change (What, Where, Now, Becomes) for tags, plant, terminals and wire numbers, with a filter. Nothing changes until *Apply n changes*. With nothing to change it says so.
- **NU-3** **Position scheme** (default): a tag is its prefix plus the sheet-column where the part is (`K3-16`); a terminal's number is its sheet-column (`3-13`).
- **NU-4** Where several items share a column, the highest on the sheet keeps the plain number and the rest, working down, get A, B, C (`3-22`, `3-22A`, `3-22B`).
- **NU-5** **A wire on a terminal takes the terminal's number,** unless it's on a supply (NU-7). If it reaches several, it takes the first along the strip, by sheet then left to right. The terminal keeps its own number either way.
- **NU-6** Any other wire is numbered from its highest end (`3-22`).
- **NU-7** **A wire on a supply carries the supply's tag**, before any other rule: every wire drawn onto a block or rail assigned that supply, and every wire looped on from it, on every sheet. A supply ends at the first part: the wire leaving a breaker, fuse or contact is a new potential, numbered by terminal or position. A block or rail on no supply gives no number.
- **NU-8** A contact linked to a coil takes the coil's tag; it isn't numbered separately.
- **NU-9** *Tag fixed* on a part, or *Lock number* on a wire, keeps it through Renumber.
- **NU-10** Plant is tagged prefix plus the sheet-column of its first view (`SEF-3-13`; `U3-13` with the default prefix) unless its tag was typed in Design.
- **NU-11** Numbering is by position only (NU-3): there's no other scheme, and no setting for one.
- **NU-12** Terminal strips follow on: a terminal is on the same strip as the terminal before it, by sheet then left to right, until a strip is typed on one (in its properties, or by a strip line); every terminal after that follows the new strip, until the next one typed. With nothing typed, everything is X1. A locked terminal keeps its strip.
- **NU-13** The terminals after a strip typed follow it at the next Renumber, as tags and wire numbers do, not the moment it's typed.
- **NU-14** Call-outs number 1, 2, 3… on their sheet in the order placed while *Auto* is ticked; unticked, the number is set by hand.

---

## 9. Annotate (AN)

Text, boxes, pictures, sections and clouds that explain the drawing. In Annotate only annotations can be selected; the drawing is grey and can't be picked. Selecting, moving, nudging, duplicating, deleting, aligning and undo work as in Draft (DR-6 to DR-12).

- **AN-1** The parts list: under *Drawing*, Section, Revision cloud, Text, Box, Arrow, Highlight, Call-out, Polygon, Picture; under *Tables*, Revision list, Controller map, Network diagram, Symbol legend.
- **AN-2** **Text** is Markdown, with buttons for the usual marks: `# Title` (5 mm), `## Heading` (3.5 mm), `### Small heading` (bold), bold, italic, struck, code, bullets, numbered lists, task lists, quotes, fenced code, tables (a `|---|` row under the first makes it the heading row), and `---` for a line across. Links print as their text. Body text is 2.5 mm.
- **AN-3** Text aligns left, centre or right, and wraps at the width set (0: no wrapping).
- **AN-4** Text can hold fields that fill themselves in: any project detail as `{project:title}`, `{project:panelName}`, `{project:client}`, `{project:jobNo}`, `{project:drawingNo}`…; `{sheets}` (the number of sheets); `{rev}` (the latest revision); and plant fields (a plant's tag or description).
- **AN-5** Text left empty is removed when you click away.
- **AN-6** **Box**: width, height, *Dashed*, *Heavy line*. Boxes and sections are picked by their edge, so parts inside can still be clicked.
- **AN-7** **Arrow**: head at the tip or both ends; dashed; heavy. Dragging a corner's square moves it.
- **AN-8** **Highlight**: a translucent marker in yellow, green, pink or blue; the drawing under it still reads and prints. Dragging the corner square sizes it.
- **AN-9** **Polygon**: click each corner; clicking the first corner again, double-clicking or `Enter` closes it.
- **AN-10** **Section** (`B`, or from the list): drag out a dashed section box with a title. Dragging its label moves it; an edge or corner resizes that side.
- **AN-11** **Revision cloud**: drag round a change to cloud it for the latest revision. The triangle carries the revision letter; dragging the triangle moves the cloud, an edge resizes it. Only the latest revision's clouds are drawn.
- **AN-12** **Picture**: placed like a part, then a file chosen in its properties; or pasted (`Ctrl+V`); or a PNG or JPEG dragged in from Explorer. Dragging the corner sizes it. Pictures are stored in the project, scaled to 2400 px at most; one over 25 MB is refused.
- **AN-13** A Picture switched to *The project's logo* shows the logo set under Project….
- **AN-14** **Revision list** fills itself from the project's revisions, with blank rows to spare (*Rows at least*).
- **AN-15** **Symbol legend** draws one of each kind of part used in the project with its name, in 1 to 4 columns, and keeps itself up to date. A part whose setting changes its symbol gets an entry for each kind in use, under its own name: contacts NO, NC and changeover; relay, contactor and timer coils (a timer by its function); motor, fan and pump; the earth and terminal types. A part that stretches (a block, rail, terminal strip line or cable screen) is drawn about 10 units long, and a symbol taller than a contact or wider than a four-pole isolator is drawn smaller to fit, its text at full size.
- **AN-16** **Controller map**: the controller's modules in rail order, one box each with its tag, its bus address in a circle, maker, model, type and every sheet-column it's drawn at; spare slots dashed. It wraps onto more rows to fit its width and keeps up by itself.
- **AN-17** **Network diagram**: Design's networks (DE-63), redrawn as they change; its width is set in its properties.
- **AN-18** `R`, or *Read up the page* in its properties, turns a Text to read up the page, its first line on the left, to run beside a vertical wire; `R` again (*Level*) sets it level. It turns no other way.

---

## 10. Layout (LA)

General arrangement (GA) sheets drawn to scale. Positions and sizes are in millimetres, measured from the enclosure's top-left corner as the sheet sees it.

### Sheets

- **LA-1** A GA sheet is added from `▾` beside `+` in Sheets: *GA sheet…* asks for the view, the enclosure width and height, and the scale, adds the sheet after the current one and opens it in Layout. *(v0.5: A58. On a backplate sheet the size is the enclosure's, with the plate drawn inside it)*
- **LA-2** Views: **Backplate**, **Door front**, **Door back**, **Detail**.
- **LA-3** The scale is any number typed (1:7.5, 1:12). ~~Left empty, or with *Fit* in the sheet's settings, it's the first of 1:1, 1:2, 1:2.5, 1:5, 1:10, 1:20, 1:25 and 1:50 at which the enclosure fits the sheet.~~ *(v0.5: A60)*
- **LA-4** A **door back** is drawn from its door front: seen from inside, mirrored, with the front's devices dashed with their cut-outs. The door front must exist first.
- **LA-5** A door has **one leaf**, **two leaves**, or **columns of doors**: each column a width, each door in it a name, a height (the last takes what's left) and a hinge side; a door can be split in two up-and-down or side-by-side, or joined with the one below.
- **LA-6** A device belongs to the door its centre is on and is dimensioned from that door's edges.
- **LA-7** *Shows*: the whole door, both leaves, either leaf, or any one door, on a sheet of its own.
- **LA-8** *Add a backplate for each door* makes a backplate sheet behind each door that hasn't one, sized from the door less 25 mm all round. A backplate's *Behind* says which door it's behind; *Size from its door* resizes it.

### Tools and items

- **LA-9** Layout tools: **DIN rail** (drag along where it goes; 35 mm), **Trunking** (drag out its size), **Dimension**, **Label plate**, **Device (no schematic part)**, **Detail**. `Esc` stops a tool.
- **LA-10** Rail and trunking go on a backplate or door back; label plates go on a door front. A tool that doesn't suit the sheet is unavailable and says why.
- **LA-11** *Place parts…* lists every part from the schematic not yet on a GA (relays, timers, breakers, terminal strips, the controller's modules), with a search. Pick one and click to place it. Parts that belong on another kind of sheet are counted, not offered. It closes when the sheet in view stops being a GA.
- **LA-12** A placed part keeps its schematic tag and snaps onto a rail.
- **LA-13** A controller's modules go side by side in rail order.
- **LA-14** On a door, lamps, push buttons, keyswitches and an isolator's handle are drawn from their schematic parts.
- **LA-15** A **Device (no schematic part)** takes its own name (for the bill of materials), tag, size and door cut-out (`22.3` round, or `92 x 92`).
- **LA-16** **Label plates** are at true size; text may have a second line; *Engraved text height* in mm; the text sits in the middle or at any of eight places round the edge.
- **LA-17** **Dimensions**: click each point (snapping to edges and middles), then double-click where the line goes. *Chain* gives the gaps along a run; *Baseline* each distance from the first point. A dimension follows the items it's on when they move.
- **LA-18** Dragging moves an item in 5 mm steps (`Shift`: 1 mm). Arrow keys nudge 5 mm, `Shift`+arrow 1 mm. `R` rotates. `Del` removes it from the GA (not from the schematic).
- **LA-19** An item's Properties gives X, Y, width, height, *Rotate*, *Delete*, a link to the schematic part on its sheet, ~~and its *Device*~~ *(v0.5: A70: shown there, set in Design)*.
- **LA-20** Labels sit in the middle of each device, across or along it, whichever is longer. On very small devices the text shrinks, but stays readable on an A4 print.
- **LA-21** A selected rail shows its fill: *n of m mm (x%), k devices*, with overlaps and overhangs counted.
- **LA-22** A placed terminal strip keeps up with the schematic: add a terminal to X1 and the strip on the GA grows.
- **LA-23** *Split here* on a strip puts that terminal and the rest on a second item on the next rail down; each prints its range (*X1: 1–48*). Deleting the second joins them again.
- **LA-24** Earth terminals are green-yellow on the GA; fused and disconnect terminals take their own, wider sizes.
- **LA-25** Notes on a GA are ordinary Text annotations, added in Annotate.

### Details

- **LA-26** The **Detail** tool drags a dashed box round an area on any GA sheet. Boxes are lettered A, B, C… across the project, take a title, and are labelled with the sheet they're shown on: `A (13)`.
- **LA-27** A GA sheet whose view is Detail has no enclosure and no scale of its own. *Place detail…* puts each detail in a **frame**.
- **LA-28** A frame shows what's inside its box, cut off at the frame's edge, at the frame's own scale: 2:1, 1:1, 1:2 or 1:5 (the largest that fits, by default), with a caption `DETAIL A: SUPPLY FAN, 1:1 (12)` naming the sheet it's drawn on.
- **LA-29** Moving or sizing the box changes the frame.
- **LA-30** You can work through a frame: pick, move, size and edit what it shows, and add rail, trunking or label plates in it. The change is made on the sheet the detail is drawn on and shows in both; Properties says which sheet.
- **LA-31** A dimension drawn in a frame belongs to the frame and shows only there.
- **LA-32** A detail is shown in one frame.

### Device table

- **LA-33** *Device table…* holds real devices: name, maker, part number, the part each suits, width × height × depth, ~~*Relay pins* (`A1 A2 | 11 12 14 | 21 22 24`),~~ *Draw (VA)*, *Ways* for a distribution block, and notes. *(v0.5: A70. The device table is reached from Design's Devices view, gains what a device takes and gives, and has a count of poles in place of Relay pins)*
- **LA-34** Sizes are generic per kind of part until a device is picked under *Device* in a part's properties. *Generic sizes…* in the sheet's settings sets them for the project; parts already placed keep their size. *(v0.5: A70. A device is picked in Design)*
- **LA-35** Devices in the **shared library** can be used by any project and hold datasheets (PDF) and pictures, added with *Add files…* or dropped on the device.
- **LA-36** A project keeps a copy of each library device it uses, so it opens anywhere. When the library entry changes, *Update* takes the new details.
- **LA-37** A part sized by hand keeps its size; Properties shows the table's size and *Back to the table size*.
- **LA-38** *To library* puts a project device in the shared library. *Remove* takes one out of the project; parts that are that device keep their size.
- **LA-39** With the shared library switched off for the project, only the project's own devices are offered; devices already in use stay.
- **LA-40** A GA sheet's *View* is changed in its settings. An empty sheet changes to any view, *Detail* included; one holding things the new view can't take is refused, and the message says why (*Only an empty sheet changes to a detail sheet: delete what's on it first*; a door back without its door: *pick its sheet*).

---

## 11. Simulate (SM)

The same sheets, live. Editing is off. Entering Simulate starts from everything off with isolators and breakers closed, at time zero; leaving it ends the simulation.

### Operating

- **SM-1** Clicking a switch, selector, isolator, breaker or plant output on the drawing operates it. Operable things are outlined in orange.
- **SM-2** A push button is held while the mouse is down; `Shift`+click latches it until clicked again.
- **SM-3** A selector steps to its next position at each click; the position it's in is boxed, and each of its poles is drawn open or closed as it is in that position.
- **SM-4** Clicking a fuse blows it, drawn broken; clicking again replaces it.
- **SM-5** Coils pull in, contacts move, lamps glow in their colour, and energised parts, live wires, blocks and rails turn red.
- **SM-6** A timing timer shows its countdown. Functions run as set: TON, TOF, TON+TOF, TP, and both flashers.
- **SM-7** `PgUp`/`PgDn` and double-click links work as in Draft.
- **SM-8** Every tile is live and shares one simulation.
- **SM-9** A door GA sheet shows its lamps lit in their colour when their schematic lamps are lit (unlit ones dim), in detail frames too. The door is for seeing only; the panel is worked through the circuit.

### The simulation panel

- **SM-10** The floating panel shows the clock with *Run*/*Pause*, a clock speed, *Next timer* (jumps to when the next timer finishes) and *Reset*.
- **SM-11** It lists *Supplies*, *Plant points* (inputs that don't see what's expected first), *Inputs*, *Coils and lamps* and *Expectations*, each with its live state and sheet; clicking a name shows it on the drawing.
- **SM-12** A short reads *Short circuit: the supply is shorted to 0V through closed contacts.* A circuit that won't settle reads *The circuit doesn't settle: relays chatter.*

### Power

- **SM-13** Power comes from **Incoming supply** parts and from transformers once their primaries are energised. Phases are kept separate.
- **SM-14** A short between phases, or two supplies feeding one conductor, is reported.
- **SM-15** With no Incoming supply part, blocks and rails on an AC line or DC + distribution are the supply and those on an AC neutral or DC 0 V distribution the return, except a distribution that a plant's supply out reaches by wire (through fuses and switches, whichever way they're set): that plant is its source, so switching it off takes those rails down.
- **SM-16** A plant **supply out** feeds what it's wired to, like any other source: an inverter, PSU or UPS is wired to its block or rail, and picks no distribution. Two sources wired to one distribution (a battery and the UPS it backs) feed it together, which isn't a short.

### Plant

- **SM-17** A plant **output** (contact, powered output, supply out) is clicked, or *follows* up to two conditions joined with and/or, after a delay (*Airflow proven follows SF-01 Run on, after 5 s*).
- **SM-18** A plant **input** senses its pins: a dry input is on when its loop is closed; a powered input or supply in when there's a voltage across it.
- **SM-19** A view's terminal boxes are filled when the point is on; green or red when the point has an expectation and does or doesn't see it. Analogue and comms points are drawn and scheduled, not simulated.

### Supply load

- **SM-20** Loads say what they draw: *Draw (VA)* ~~on coils, timer coils and lamps,~~ *(v0.5: A38)* on a device in the device table, on a plant's supply in, and on a controller's modules. A part with no draw of its own takes its device's. *(v0.5: A38. The device is the only place a draw is set)*
- **SM-21** Supplies say what they can give: *Rating (VA)* on ~~an Incoming supply,~~ *(v0.5: A72)* a transformer, or a plant's supply out (with its efficiency). *(v0.5: A38. A transformer's and a plant supply's are on their device)*
- **SM-22** Each supply shows its load beside it on the sheet and in the panel: **live** (what's energised now) and **worst case** (everything it can reach), in amps at its own voltage. A figure over the rating is red.
- **SM-23** A power supply's load is passed up to what feeds it, divided by its efficiency.
- **SM-24** Parts with no draw set count as nothing, and the panel says how many.

### Expectations and Check logic

- **SM-25** *Expectations…* (Draft and Simulate) keeps the list. **Should be on (or off) when …** is for an input, a plant's or a controller's (`A3-23:DI2`). **Never …** can name anything. Each takes a note.
- **SM-26** *Should be* is judged only at rest: an input following a few seconds behind isn't red while its timers run.
- **SM-27** A *never* that comes true raises a warning in the panel (*…: it's happened.*) with its parts ringed red.
- **SM-28** An expectation naming something no longer on the drawing says so.
- **SM-29** **Check logic** tries every sequence of operations, plant outputs and timers, and for each expectation reports the shortest sequence that breaks it, plus any that short the supply or make relays chatter, each with *Replay*.
- **SM-30** *Also try opening isolators and breakers* is off by default.
- **SM-31** The result gives the states explored. The search stops at a limit (20,000 states) and then says not every sequence was tried.
- **SM-32** With everything held it reads *Every expectation held, no shorts, no chatter.*

---

## 12. Check (CK)

*Check* opens a list of findings, each marked error, warning or info, with *Show* to go to it. A Design finding's *Show* opens the row in the table. The header reads *No problems found* or counts errors and warnings. Layout's Check adds rail fill.

### Drawing

| ID | Level | Finding |
|---|---|---|
| **CK-1** | warning | A wire crosses the panel boundary without a terminal |
| **CK-2** | warning | A contact isn't driven by a coil |
| **CK-3** | warning | A coil has no contacts |
| **CK-4** | warning | A link end isn't linked to another |
| **CK-5** | warning | Linked link ends are both sources, or both destinations |
| **CK-6** | warning | A part isn't connected, or has terminals not connected |
| **CK-7** | warning | A tag is used more than once (with the sheets) |
| **CK-8** | warning | A plant or module terminal isn't shown on any sheet |
| **CK-9** | warning | A plant or module terminal is shown on more than one sheet |
| **CK-10** | info | *n* items not numbered yet: press Renumber |
| **CK-11** | info | A part's label overlaps another part: drag the label clear |
| **CK-12** | warning | A locked wire number disagrees with the terminal it lands on |
| **CK-13** | info | A wire lands on a terminal and its number doesn't match yet: Renumber |
| **CK-14** | warning | One wire number is on several wires through different terminals |
| **CK-50** | error | A part has two terminals of one number (a wire to it can't say which) |
| **CK-51** | error | Two supplies have the same tag |
| **CK-52** | info | A block or rail is on no supply, so its wires are numbered by position (as is right for switched power after a part) |
| **CK-53** | warning | A wire joins blocks or rails on different supplies, straight or through terminals: joined, they're one supply |

### Supplies and loads

| ID | Level | Finding |
|---|---|---|
| **CK-15** | warning | A load takes one supply and is fed from another (*… takes 24 V DC; it's fed from …, 230 V AC*), traced through relays and terminals |
| **CK-16** | info | *n* loads don't say what supply they take, so can't be compared |
| **CK-17** | warning | A distribution feeds parts and nothing supplies it |
| **CK-18** | warning | A supply's worst-case load is over its rating *(v0.5: A72. Never an Incoming supply)* |
| **CK-19** | ~~info~~ *(v0.5: A31)* | *n* parts have no draw set, so count as nothing |
| **CK-20** | none | No check for a supply bypassing its isolator: an incoming supply picks no distribution, so there's nothing to bypass one (DR-50) |

### Plant, controller and Design

| ID | Level | Finding |
|---|---|---|
| **CK-21** | warning | A plant input isn't wired to anything |
| **CK-22** | info | A plant output isn't wired to anything (spare) |
| **CK-23** | error | A dry input is wired to a live conductor |
| **CK-24** | warning | A conductor joins an analogue point to a digital one |
| **CK-25** | error | An expectation names something that isn't on the drawing |
| **CK-26** | info | The controller has no modules yet |
| **CK-27** | error | Two slots are at one bus address |
| **CK-28** | warning | A module isn't drawn on any sheet (reported once, not also terminal by terminal) |
| **CK-29** | warning | A module has no pins |
| **CK-30** | info | Plant in Design's table isn't drawn yet (comms-only plant excepted) |
| **CK-31** | warning | A point goes to a channel and has none (once there's a controller) |
| **CK-32** | warning | An allocated point isn't wired straight to its channel: check, then *Confirm by hand* |
| **CK-33** | warning | Plant marked *In the panel* is drawn below the boundary |
| **CK-34** | info | Equipment drawn in the field isn't plant in Design's table (local isolators excepted) |
| **CK-35** | warning / info | An interlock fails; is never on; isn't proved yet; isn't drawn; or has too many sequences |
| **CK-36** | warning | A device is on a bus in Design but the wiring from the port doesn't reach it, or is wired on it and isn't on it in Design |

Design's findings appear only once a project uses Design.

### Wired to its channel (CK-32 in detail)

- **CK-37** **Direct:** the point's wire reaches the channel's own pin. Supply rails and an input's shared common don't count.
- **CK-38** **Via one relay:** the point's wire reaches a relay's coil and a contact of that same relay reaches the channel's own pin (or the reverse for an output). Shown as *✓ via K8-37*.
- **CK-39** **To review:** anything else: two relays in a row, a switch or timer between, contacts combined.
- **CK-40** *Confirm by hand* marks a to-review point as wired. The confirmation is kept against the wiring at both ends as it was: change either end and it's back to review by itself; changes elsewhere leave it alone.

### Layout

| ID | Level | Finding |
|---|---|---|
| **CK-41** | info | *n* schematic parts aren't on a layout sheet, so aren't on the bill of materials |
| **CK-42** | info | Each rail's fill: *n of m mm (x%), k devices* |
| **CK-43** | warning | Two devices overlap on a rail; a device runs off the end of a rail |
| **CK-44** | warning | An item lies outside the backplate or door; across both leaves; or across two doors |
| **CK-45** | info | A terminal strip has changed since its GA was last opened |
| **CK-46** | warning | A detail isn't shown on a detail sheet; a frame shows a deleted detail |
| **CK-47** | warning | A door back has no door front |
| **CK-48** | info | A backplate is larger than its door's opening, or its door has gone |
| **CK-49** | warning | A device or module on the GA is no longer on the schematic |
| **CK-54** | warning | A distribution block has more wires than the device picked for it has ways |

---

## 13. Schedules and output (SC)

- **SC-1** *Schedules* has tabs, each with its row count and *Download CSV*: Terminals, Field cables, Markers, IO points, Plant points, Bill of materials.
- **SC-2** CSV files are named `<drawing ref., or the project id> <schedule>.csv`.
- **SC-3** **Terminals:** Strip, Terminal, Sheet-col, Wire, Internal, External. A terminal is listed as `X1:3-13`.
- **SC-4** **Field cables:** Plant, Description, Plant terminal, Wire, Panel terminal, Sheet-col; and below, **cores per device** (how many cores each field device needs and on which terminals), with its own CSV.
- **SC-5** **Markers:** one at each real end of a wire, where it lands on a terminal or a part; not at a tee or a link end, so a wire carried across two sheets has two. A panel wire on a supply says the supply's number; any other panel wire says the terminal it lands on, or its own number when it reaches none. A field core's say the terminal at the panel end and the device's tag at the field end. *Group duplicates* gives each marker once with a count. Renumber first.
- **SC-6** **IO points:** Controller, Module, Point, Form, Pins, Label, Wired to (followed through link ends). With no controller it says *No controller yet (Design → Controller)*.
- **SC-7** **Plant points:** Device, Description, Point, Form, Pins, Wired to.
- **SC-8** **Bill of materials:** GA sheet, Item, Maker, Part number, Qty, Unit, Tags. It's counted from the GA sheets only: devices by the device picked (or their generic size), each distribution block on a line of its own saying the ways it needs (*needs at least 5 ways*), terminals each, label plates, and DIN rail and trunking by length. A schematic part never placed on a GA isn't on it (CK-41). *(v0.5: A71. Also as a table placed on a GA sheet)*
- **SC-9** **Export PDF** saves first, then downloads every sheet as one A4 landscape PDF on white, with osifont embedded.
- **SC-10** PDF export uses Edge, or Chrome, in the background (or the browser named by `FERRULE_BROWSER`). If it can't, it says why and offers *Print → Save as PDF*, which makes the same sheets.
- **SC-11** **Print** opens the same sheets in a new tab and opens the print dialog.
- **SC-12** Print and PDF show the drawing as drawn: no simulation state, no colour check, no selection, nothing greyed out. Highlights, pictures, the logo and lamp and earth colours on GA sheets keep their colour.

---

## 14. Project settings (PR)

- **PR-1** *Project…* sets the project's details: Project, Panel name, Client, Job no., Drawing ref., Drawn by, Drawn date (a new project's is the day it's made), Checked by, Checked date. They fill every sheet's title block; sheet titles are set per sheet.
- **PR-2** **Logo:** chosen, dropped in, or pasted (`Ctrl+V`) while the window is open; *Remove* clears it. It prints in every title block.
- **PR-3** There's no numbering setting: numbering is by position (NU-11).
- **PR-4** There's no terminal strips setting: strips follow on (NU-12).
- **PR-5** *Wire colours by function* isn't under *Project…*: it's in the Distribution window, with all wire colour (DR-48).
- **PR-6** **GA devices:** *Use the shared device library* (LA-39).
- **PR-7** **Revisions:** Issue, Date, Drawn, Description; *Add revision*; remove. The latest four show in the title block, newest at the bottom.

---

## 15. Claude (MC)

- **MC-1** Ferrule is an MCP server at `http://127.0.0.1:4810/mcp`, or over stdio with `ferrule.exe --mcp`.
- **MC-2** With `--mcp`, Ferrule relays to a Ferrule already running on port 4810, so the editor and Claude share one server; if none is running it starts one without opening a browser.
- **MC-3** Settings → Status shows whether Claude is connected, the client's name, and the last tool it used and when.
- **MC-4** Everything Claude does is an ordinary edit through the same operations as the editor.
- **MC-5** An open editor tab follows Claude's changes: it reloads the project and says so. Undo history is cleared on that reload.
- **MC-6** If you were mid-edit when Claude saved, your unsaved change is refused, not written over Claude's, and the tab reloads with a message.
- **MC-7** The endpoint listens on 127.0.0.1 only unless started with `--host`, and refuses requests from web pages served by other sites.
- **MC-8** Tools: `list_projects`, `create_project`, `project_info`, `update_project_info`, `list_symbols`, `get_page`, `view_page`, `add_page`, `update_page`, `delete_page`, `add_element`, `update_element`, `move_element`, `delete_element`, `connect`, `disconnect`, `label_wire`, `link`, `add_distribution`, `add_plant`, `place_plant_view`, `add_section`, `controller`, `add_module`, `place_controller`, `save_template`, `apply_template`, `renumber`, `check`, `schedules`, `simulate`, `set_expectation`, `check_logic`, `export_pdf`. What each does is in `docs/mcp.md`.

---

## 16. Keyboard and mouse

| Key | Draft / Annotate | Layout | Simulate | Design |
|---|---|---|---|---|
| `Ctrl+Z` / `Ctrl+Y` (or `Ctrl+Shift+Z`) | Undo / redo | Undo / redo | – | Undo / redo |
| `Ctrl+S` | Save now | – | – | Save now |
| `Ctrl+A` | Select all on this workbench | – | – | – |
| `Ctrl+D` | Duplicate | – | – | – |
| `Ctrl+V` | Paste a picture (Annotate) | – | – | – |
| `Del` / `Backspace` | Delete | Remove from the GA | – | – |
| `R` | Rotate a part that turns (or turn one being placed) | Rotate | – | – |
| `F` | Flip (or flip the part being placed) | – | – | – |
| Arrows | Nudge 1 unit (`Shift`: 2) | Nudge 5 mm (`Shift`: 1 mm) | – | – |
| `W` | Wire tool (Draft) | – | – | – |
| `B` | Section tool (Annotate) | – | – | – |
| `S` | Select tool | – | – | – |
| `Enter` | Close a polygon | Finish a dimension | – | – |
| `Esc` | Cancel, then close the top window, then clear the selection | The same | Close the top window | Close the top window, then let go of what's picked |
| `PgUp` / `PgDn` | Previous / next sheet | The same | The same | – |
| `Space` | Tap: fit. Hold and drag: pan | The same | The same | – |

| Mouse | Does |
|---|---|
| Click | Select; place; operate (Simulate) |
| `Shift`/`Ctrl`+click | Add to the selection |
| Drag on a part | Move |
| Drag on empty paper | Box-select |
| Double-click a contact, coil or link end | Jump to its partner |
| Scroll | Zoom; in a number box, step the value (`Shift`: ten steps) |
| Middle-drag | Pan |
| `Shift`+click a push button (Simulate) | Latch it |

---

## 17. To confirm

Places where the documents, the on-screen text and the build don't agree, found while writing this. None has been tested by running the build. Rulings are recorded here; what's to be built from each is in `advancements-v0.5.md` under the reference given.

| # | What | Where | Ruling |
|---|---|---|---|
| 1 | The README lists lamp colour **Cl** (clear). The build offers Rd, Ye, Gn, Bu, Wh, with white covering a clear lens | README, *Lamps* | **25 Nov 2026:** clear has been removed. The build is right; the README is corrected (A3) |
| 2 | The lamp's setting reads *Lamp test terminal (T)*; the terminal itself is named and drawn **LT** | Lamp properties | **25 Nov 2026:** LT is right; the setting's label is corrected (A13) |
| 3 | The IO points tab, when empty, reads *No controllers yet (Controllers… in Draft)*. The controller is made in Design since v0.4 | Schedules → IO points | **25 Nov 2026:** the message is updated to how it works now (A4) |
| 4 | The README's download line says *Status: 0.1.0 preview*; the build is 0.4.5 | README, top | **25 Nov 2026:** the README is corrected (A18) |
| 5 | `Ctrl+S` saves in Design, Draft and Annotate but isn't handled in Layout or Simulate, where the browser's own *Save page* may open | ST-13 | **25 Nov 2026:** saving is automatic; `Ctrl+S` is left as it is |
| 6 | `Ctrl+A` selects all in Draft and Annotate but does nothing in Layout | §16 | **25 Nov 2026:** intended. Not added to Layout; left as it is in Draft and Annotate |
| 7 | The design record's numbering section still speaks of a *100-column grid*; the page is 75 columns | `docs/DESIGN.md` §8 | **25 Nov 2026:** the design record is corrected (A20) |
| 8 | The Controller… window is titled *Controllers* and describes *a controller* in general; a panel has one | Design → Controller… | **25 Nov 2026:** reworded to the singular (A15) |
| 9 | Annotate has no Check or Schedules button on its row; they're reached from Draft, Layout or Design | WN-2 | **25 Nov 2026:** intended; Annotate has neither |
| 10 | *Client* is entered under Project… but isn't printed in the title block; it shows only where a text uses `{project:client}` | PR-1, SH-15 | **25 Nov 2026:** Client goes in the title block, in a column beside Sheet and Job no., which are made narrower to fit it (A1) |
| 11 | The README's editor guide says the socket's earth is *out to the side*; since v0.4.x it's drawn beside L and N at the top (PT-10 follows the build) | README, *Earth* | **25 Nov 2026:** the README is corrected (A19) |

## 18. Not in this version

So a missing feature isn't logged as a fault:

- Importing a points schedule; device addresses on networks.
- Cables as objects (cable types stay as notes or plant information).
- Analogue values, motors and power flow in Simulate (analogue and comms points are drawn and scheduled only).
- A 3D layout; A3 or other page sizes; fonts other than osifont.
- A Generate tool, recipes or built-in plant types; a door view in Design; automatic allocation.
- More than one controller per panel.
- Opening project files of another format, or upgrading formats, before release.
- A symbol editor; BS 3939 designations; two-letter IEC class codes.
- Remembering tiles between sessions.
