# Ferrule v0.4: design

Status: **the plan to build.** Written 24 Nov 2026 from a day's discussion; the background is in `systems-workbench.md` (assessment), `systems-workbench-concepts.md` (sketches and workflows) and `mockups/`. **Where those disagree with this file, this file wins.** They were written while ideas were still moving and still mention things since dropped (a Generate tool, a Door view, a fascia note, the name "Systems").

v0.4 adds a **Design** workbench in front of Draft, moves the controller and plant into it, renames GA to **Layout**, and takes in the network drawing that v0.3 deferred (controller.md §9).

Version `0.4.0-pre`. All examples are generic.

---

## 1. Workbenches and the order of a panel

Tabs, in order: **Design, Draft, Annotate, Layout, Simulate.**

```
  DESIGN  -->  DRAFT  -->  LAYOUT  -->  SIMULATE
  what the     the         the general  prove it
  panel has    schematic   arrangement
```

- **Design** is where things are sourced and specified: the controller with its modules, and plant with its points. Nothing is drawn there.
- **Draft** draws what Design lists. **Layout** places it. **Simulate** proves it.
- **Annotate** isn't a stage. It adds to what Draft or Layout has drawn, and keeps its place between them.
- **Layout is the workbench that was called GA.** An acronym didn't fit the other names. The sheet it makes is still a *general arrangement*: sheet titles, the print and the data (`ga` in files and code) don't change. Only the name people see for the workbench does.
- **One project is one panel.** A description of operations covers a building or a floor; Design holds this panel's slice of it and nothing else.

### Principles

1. **Everything in the field is plant, on its own row.** A pump is plant. The pressure switch that proves its flow is plant too, with its own tag and point, tied to nothing.
2. **Plant is built from parts, not picked from a catalogue.** A row, its points and the point forms are the only building blocks. No built-in plant types, no tool that knows what a pump set or an air handling unit is. A tailored tool can only make what it was written for; extra drafting time is an acceptable price for modularity.
3. **Design records decisions; it doesn't make them.** Which channel a point lands on is the engineer's choice. Where a lamp sits is decided in Layout.
4. **One table, a few views of it.** The controller, the network and the to-draw list read from the same rows. The points schedule is an export of them.

---

## 2. Design: the table

Three levels: **system → plant → point.**

- A **system** is a name on plant that groups it ("Chilled water", "Ventilation"). It is not a new kind of object. Systems fold.
- **Plant** is the plant Ferrule already has (`PlantItem`). Plant made in Design is the plant Draft places.
- A **point** is the point Ferrule already has (`IoPoint`), with a few additions.

### Columns

| Column | On | Notes |
|---|---|---|
| Tag, description | plant | as now |
| Connects by | plant | hardwired, comms, or both |
| Protocol, network | plant | for comms: free text protocol ("BACnet IP", "Modbus RTU"), and the name of a network (§7) |
| Enabled by | plant | free text: "ventilation time zone" |
| Source | plant | free text: where in the client's document it came from |
| Interlocks | plant | §6 |
| Point, form | point | the existing forms, **from the plant's side** as now: a fault is a *contact*, an enable is a *powered* or *dry input* |
| Signal | point | free text with suggestions: volt-free, 24 V, 0–10 V, thermistor, pulse |
| Type | point | shown, not stored: what the controller needs for it (DI, DO, AI, AO), worked out from the form. A plant contact needs a DI; a plant input needs a DO; a plant analogue out needs an AI; a plant analogue in needs an AO |
| Goes to | point | §4: channel, channel via relay, or panel only |
| Channel | point | §4: the module channel it's allocated to; empty until allocated |

- **A point can exist before it has pins.** Pins arrive when the plant is specified or drawn. Today a point always has pins; that changes.
- **Comms plant** is one row per device. Listing a comms device's points is optional; when wanted they are points of form *comms* with a name.
- **Plant on other panels isn't entered.** Something outside the panel that this panel talks to is plant here, even if it is itself a controller.
- Selecting a row shows its **properties** at the side, as elsewhere.
- **The Needs line** is always shown along the bottom: *Needs DI 8 · DO 3 · AI 2 · AO 1; Have …; Spare …*, with a shortfall in red. *Needs* counts points that go to a channel (§4). *Have* counts the controller's channels (§3). Before a controller exists it answers the first question on a job: how many modules of what kind.

---

## 3. Building plant: parts, Duplicate, templates

Three general tools. None knows what kind of plant it handles.

1. **Parts.** `+ System`, `+ Plant` (an empty row), `+ Point` (pick a form, name it, give its signal).
2. **Duplicate ×n.** Works on any selection of rows: one item, or a group. Tags step.
3. **Design templates.** *Save selection as template* keeps any selected rows. *Templates…* inserts a copy into a chosen system, with copies and a tag step.
   - **The list starts empty.** Nothing is built in.
   - **A list of its own**, separate from Draft's templates: Design templates hold plant rows, Draft templates stay drawing fragments.
   - No options and no tick-boxes. A variant is an insert followed by adding or deleting rows, or a second template.
   - Nothing links back. Inserted rows are ordinary plant.

---

## 4. The controller, in Design

**The controller is built in Design**, not in Plant or Draft. It's the main piece of kit and the system is built around it.

- **One controller per panel.** Anything outside the panel is plant, so a project never needs a second. New projects can add one. A file made earlier with more than one keeps them all and shows them one under another; nothing is removed on opening.
- The **Controller view** is where you choose it, describe it, add modules in rail order, set addresses and spares, and put points on channels. It replaces the **Controllers** window in Draft, which goes.
- **Modules stop being listed as plant.** The Plant list is field plant only. Inside the file modules stay as they are.
- **Draft only draws it.** Module views are placed from the To draw list (§8), carrying their channel labels.

### Allocation is manual

- Put a point on a channel by **dragging it onto the channel** in the Controller view, or by **picking the channel in the table's Channel column**. Both show the same thing.
- **Nothing is allocated for you.** Grouping, spares and which module takes what are design decisions.
- A channel only takes a point whose form it can serve.
- **A module channel's label follows its point** ("DPS1 flow") instead of being typed. A label typed by hand on a channel with no point is kept.
- **Suggest…** (last step, may slip): proposes a layout as a proposal to accept, change or throw away. It never runs by itself.

### Where a point goes

Each point has one of three:

| Goes to | Meaning | Counted in Needs | Listed as unallocated |
|---|---|---|---|
| **Channel** | wired straight to a controller channel | yes | until given a channel |
| **Channel, via relay** | the plant switches a relay; the relay's contact switches the channel (and the reverse for outputs) | yes | until given a channel |
| **Panel only** | used in the panel's own circuits; never reaches the controller | no | never |

- **Allocation is what you intend, not what the wire touches.** A point via a relay is allocated the moment it has a channel.
- **A signal the panel makes** from several contacts (a common fault) is a point of its own on a plant row for the panel, with its channel. The contacts feeding it are *panel only*.

---

## 5. Checks

Check gains these findings. Each jumps to what it names.

- A point that goes to a channel and has none.
- Plant in the table that isn't drawn; plant drawn that isn't in the table.
- A module in the controller that isn't drawn.
- An interlock that isn't proved (§6).
- **A point not wired to its channel**, decided like this, never by guessing:

| Result | When | Shown as |
|---|---|---|
| **Direct** | the point's wire reaches the channel's own pin | ✓ |
| **Via one relay** | the point's wire reaches a relay coil, and a contact of *that* relay reaches the channel's own pin | ✓ via K5 |
| **To review** | anything else: two relays, a switch or timer between, contacts combined | a note, with **Confirm by hand** |

- **One hop is strict on purpose.** It uses the nets Ferrule already works out and the coil-to-contact tie it already has. Supply rails and an input's shared common don't count as reaching. If the pattern isn't exactly coil then contact, Check says *to review*. It may ask for a confirmation that wasn't needed; it must not pass something wrong.
- **Two hops or more are always by hand.**
- **Confirm by hand doesn't go stale.** The confirmation is kept against the wiring at both ends as it was when confirmed (the point's wires and the channel's wires). Change either and it drops back to *to review* by itself. Unrelated edits leave it alone.
- **Order of building:** direct; then confirm by hand; then the one-hop trace, proved on the example project before it's trusted. If one hop proves unreliable it's left out and those points are confirmed by hand. Nothing else depends on it.

---

## 6. Interlocks

A hardwired interlock is a contact in an enable circuit, and that is an expectation Ferrule already has.

- A plant item has a list of **interlocks**: *this point is never on while that condition holds*. "P1 enable never on while PU1 fault." "EF1 enable never on while fire."
- The condition is picked from points already in the table, in the same condition language expectations use.
- Each interlock **generates an expectation**, marked as generated so it follows the interlock when that's edited or removed. Hand-written expectations are untouched.
- **Simulate proves them** as it proves any expectation. An interlock whose expectation fails, or whose points aren't drawn yet, shows as not proved in Check and in To draw.

---

## 7. Network

The network drawing deferred from v0.3 (controller.md §9), generated from Design.

- A **network** has a name, a protocol and a kind: a LAN off a switch, or a bus off the controller. `+ Network` adds one.
- Comms plant names its network. Order on a bus is the row order, changeable.
- The **Network view** draws it: controller, switch, each network with its devices in order, long runs shortened with a count.
- **Place as sheet** makes it a sheet in the set, redrawn from the data like the terminal and controller views.
- Addresses aren't held in v0.4.
- For a panel that is mostly a controller, a switch and forty networked devices, this view is most of the job. Such panels are near enough identical: set one up, duplicate the project.

---

## 8. To draw, and Draft

- **To draw** lists what Design has that isn't on a sheet: field plant, modules, and interlocks not yet proved. Pick a line and place it on the open sheet; tag, pins and channel label come from the data.
- The **Plant** window in Draft becomes placing only: plant is made and edited in Design. Editing a placed plant item's properties from Draft still works; it's the same data.
- A panel with no controller still lists its field plant in Design; its Controller and Network views stay empty. A panel with neither goes straight to Draft, which works without Design as it does now.
- **Old files open unchanged.** Plant with no system sits under an unnamed group.

---

## 9. Points schedule

The IO schedule (controller.md §7) becomes an export of Design: CSV, by system.

| System | Tag | Description | Point | Form | Signal | Type | Goes to | Controller | Module | Channel | Via | Wired |
|---|---|---|---|---|---|---|---|---|---|---|---|---|

*Via* is the relay when the check found one or it was confirmed by hand. *Wired* is direct, via, confirmed, to review, or not drawn. Unallocated points are listed, with the channel empty. Import is not in v0.4.

---

## 10. Order of work

Each step is one PR with a build, `ferrule-windows-v0.4.0-pre.zip`. The working agreement is in the repo's CLAUDE.md.

1. **Start:** version `0.4.0-pre`; this doc into the repo as `docs/design-v0.4.md`; CLAUDE.md pointed at it. Then **GA renamed Layout** in the interface, README and docs (§1); data unchanged. The doc fix carried from v0.3: "jump ring" becomes "highlight" in `DESIGN.md` and `design-v0.3.md`.
2. **Model** (§2, §4, §6, §7): `system`, connects-by, protocol, network, enabled-by and source on plant; points without pins; signal, goes-to and channel on a point; interlocks; networks. Old files load unchanged. No interface yet beyond what breaks.
3. **Design workbench: the table** (§2): tab, tree and table, properties, `+ System`, `+ Plant`, `+ Point`, the Needs line.
4. **Duplicate ×n and Design templates** (§3).
5. **Controller in Design** (§4): the Controller view, modules, manual allocation in the view and in the table, labels following points. The Controllers window leaves Draft; modules leave the plant list.
6. **To draw, and Draft placing only** (§8).
7. **Checks** (§5): the plain findings and direct wiring; confirm by hand; then one hop.
8. **Interlocks** (§6).
9. **Network** (§7): networks, the view, the sheet. More than one PR if that keeps each reviewable.
10. **Points schedule export** (§9).
11. **Suggest** (§4), if there's time.

README screenshots are retaken when the interface changes. Small judgement calls go under *Changed during build*. Anything costly to reverse: push-notify and wait.

### Changed during build

(Small judgement calls made while building, step by step, go here.)

**Step 1 (start, Layout, highlight)**

- **What's renamed:** the workbench, and what speaks of it: its tab, *Layout tools* in the browser, the *Layout workbench* heading in Properties, and the messages that send you there. What it makes is still a GA sheet: *New GA sheet*, the *GA* badge in the sheet list, *Sheet type: GA (general arrangement)*, *GA device table*, the bill of materials' *GA sheet* column, Check's "not on a GA yet" and the MCP tools are left as they are, as §1 says the sheet keeps its name.
- **Docs:** README, `DESIGN.md` (§11 and two rows of the decisions log) and `controller.md` (§8's heading) say Layout. The earlier plans (`design-v0.2.md`, `design-v0.2.1.md`, `design-v0.3.md`) are records of what was planned and keep "GA", apart from the highlight fix.
- **Highlight** replaces "jump ring" in `DESIGN.md`, `design-v0.3.md` and the README (which said "ringed"). The director's note quoted in `design-v0.3.md` §11 already says highlight.
- **`controller.md`** named makers and models in its examples (the pin layers table, the datasheet line, per-module or per-controller numbering). They're now generic (a universal IO module, a room controller, an analogue output module), as the no-professional-references rule asks.
- **README's top-bar paragraph** was headed *Layout:*; it's now *The window:*, so it isn't read as the workbench.

**Step 2 (the model)**

- **Unset means the usual:** a plant item with no `connects` is hardwired; a point with no `goesTo` goes straight to a channel. Earlier files have neither, so they read as they always did, and nothing is written for them.
- **Systems are names, with an order kept beside them** (`Project.systems`). A system is still only a name on plant (§2), but `+ System` has to make one before any plant is in it, and systems fold in an order of their own. A name on plant that isn't in the list is added at the end.
- **A channel is a module and one of its points** (`channel: { module, point }`): a module's channels are already its points. A channel takes one point. A universal (UIO) channel takes any of DI, DO, AI, AO; others take the one their form serves (a module input takes a plant contact, and so on).
- **The Needs line** counts universal channels apart and lets them cover a shortfall, DI first, then DO, AI, AO. Supplies and comms points need no channel and aren't counted.
- **Points with no pins:** a point made with none is kept through every edit. One whose pins all go (taken off the device, or moved to another point in the pin table) still goes with them, as in Draft today. Check doesn't call a point with no pins unwired: it isn't drawn, and saying so is step 7's.
- **What's gone is let go, never guessed:** on opening and after edits, a network, channel or interlock naming something that no longer exists is cleared; a renamed channel or point is followed. An expectation made by an interlock that's gone stays, as a hand-written one, rather than vanishing.
- **Copies aren't allocated:** Draft templates keep plant without channels, and plant stamped from one starts unallocated, as allocation is by hand (§4).
- **No format change:** every addition is optional, so the format number stays 3. A file saved by a v0.4 build and opened in a v0.3 build loses only its Design fields.

**Step 3 (the Design table)**

- **Design is a view, not a sheet:** it takes the whole main area (no tiles, no browser), with its Properties beside the table rather than floating. Projects still open in Draft, so older projects open as they always did.
- **Goes to and Channel share a column:** the channel, with *via relay* after it, or *panel only*. A Goes to column said "channel" on nearly every row.
- **+ Point** opens a small form in Properties (name, form, signal) that stays open for the next one, so a plant item's points go in one after another; an empty name gets *Point n*.
- **+ Plant** goes in the picked system, after the picked plant; with nothing picked, at the end of the unnamed group. Its tag is empty (shown *U?*): typed, or given by Renumber from where it's drawn, as plant always has been.
- **Deleting a system** keeps its plant, under *No system*. Deleting plant that's drawn says which sheets, then removes its views as the Plant window does.
- **The unnamed group** shows only when it has plant, or when there are no systems at all (then the table has no group headings). It comes after the systems.
- **Interlocks** aren't in Properties yet: the field comes with step 8, where they're made.
- **Modules aren't rows:** the table is field plant only from the start, ahead of step 5 taking modules out of Draft's Plant list.

**Step 4 (Duplicate ×n, Design templates)**

- **Where templates live:** in the shared library, `library/design` beside the projects folder (one `.ferrule-design.json` file each), not in the project. They're the engineer's own and move from job to job; Draft's templates live in the project and are imported from the library, and Design's are a separate list in a separate folder, so the two never mix.
- **Tags step on their last number**, keeping leading zeros (`AHU-01` → `AHU-02`). A tag with no number gives an empty copy (*U?*), for typing or Renumber. **A tag that's taken is left empty**, not pushed on to the next free number: the window shows every copy's tags before you go, taken ones struck through in red, so a different step can be chosen.
- **Duplicate** puts copy k at the original's numbers + k × step, after the last picked row. **Insert** puts copy 1 at the template's own tags, and the next ones step on from there.
- **Only tags step.** Descriptions are copied as they are (the design says tags); they're one click away in Properties.
- **Within a group, links follow the copies:** a point that follows another row's point, and interlocks between rows of the group, point at the copies; links to rows outside the group stay. Copies are never on a channel.
- **A template keeps no system:** it's picked when inserting (*Into system*), defaulting to the picked system or the picked plant's.

**Step 5 is two PRs:** 5a the Controller view and allocation; 5b labels following points, and modules and the Controllers window leaving Draft.

**Step 5a (the Controller view, allocation)**

- **Controller… is the Controllers window**, opened from Design's Controller view: describing the controller, modules in rail order, the generator, pins and points, spares and addresses were all there already, so it's reused rather than rebuilt. No separate *+ Module* button: adding a module is in that window.
- **One controller per panel:** *Add controller* is offered only while there's none, in Design and in the window. A file with more than one shows them one under another, as §4 says, with a note.
- **Channels are shown by module**, a card each in rail order (*A3-23 DI-8, 2 of 8 used*), rather than gathered by type across modules: a module is what's on the rail, and its tag is how it's referred to.
- **The channel picker** (table and Properties) offers only free channels of a type the point needs, in rail order, so a wrong choice can't be made there either. Picking *—* takes it off.
- **A point no channel can take** is shaded red in *Unallocated* and can't be dragged; picked, it says why: *no analogue outputs*, or *every DI channel is taken*.
- **Modules show *A?*** until a view of them is drawn: they're tagged by where they're drawn, as before.

**Step 5b (labels follow points; the controller leaves Draft)**

- **A label that follows** is the point's plant tag and name as written (*DPS1 flow*), not upper-cased: typed labels keep the case they were typed in, and this matches §4's example. It changes when the plant is retagged (Renumber too) or the point renamed, and goes back to the typed label when the point is taken off.
- **The typed label is kept underneath**, so taking a point off a channel shows what was typed before. While a point is on it, *Pins and points…* shows the label greyed, saying it follows the point.
- **Modules were already out of the Plant window** and the plant schedule (v0.2 put them under Controllers); nothing more was needed for "modules stop being listed as plant".
- **The Controllers button leaves Draft;** the window is *Controller…* in Design. Its *Place view* switches to Draft to place the module's view, until To draw (step 6) takes placing over. A window left open from Draft still closes from its own ×.

**Step 6 (To draw, Draft placing only)**

- **Pins arrive at placing** when Design made points without them: *Place on sheet* first opens a one-line pin entry, pre-filled with numbered pins per point (two for most forms, three for a supply in or comms), carrying on from the plant's highest pin number. It's a start to correct from the datasheet, not a choice made for you; nothing is placed until every point has pins. Pins can also be given beforehand in Design's Properties (*Pins, from the datasheet*).
- **Quick entry keeps pinless points:** a pins line edited in Draft or Design leaves points that aren't in it and have no pins as they are. Before, they'd have gone.
- **To draw lists drawn things too,** ticked with their sheets, so another view of a plant item or module can be placed from the same place (splitting a module across sheets). Module views are placed only from here now: *Place view* has left the Controllers window.
- **Placing goes to the open sheet in Draft**, or the nearest schematic sheet when the open one is a GA or spare sheet.
- **Unallocated plant can be placed;** To draw says *not all allocated* beside it. The mockup's *Allocate first* isn't in the design, and drawing first is sometimes how a job goes.
- **Draft's Plant window** keeps *Place view*, the pins line and *Pins and points…*; tag, description, prefix, information, *power by others*, *New plant…* and delete moved to Design (prefix, information and *power by others* are new in Design's Properties).
- **Interlocks in To draw** come with step 8, where interlocks are made.

**Step 7 is two PRs:** 7a the plain findings, direct wiring and confirm by hand; 7b the one-hop trace, proved on the example project.

**Step 7a (checks: findings, direct, confirm by hand)**

- **Design's findings run once a project uses Design** (systems, a controller, networks, or plant with Design's fields), so a v0.3 project opens to the same Check as before.
- **"Goes to a channel and has none"** is reported only when there's a controller: before one exists, every point would say it, and the Needs line already counts them.
- **"Drawn in the field, not in the table"** means a part below the panel boundary that's equipment, not wiring: terminals, link arrows, junctions, busbars, the incoming supply and plant views are wiring or Design's own; **local isolators** are left out too, as they're drawn as switches at the motor and simulate as such (the example has four). It's information, not a warning.
- **Reaching** is through conductors (wire, terminals passed straight through, link arrows) and plant views to their device's pins. A net with only a shared pin in common doesn't count: a point's own pins are those it doesn't share with another point of its device, and the same for the channel.
- **What's kept for a confirmation** is a short fingerprint (`confirmed` on the point) of every terminal on the nets of the point's own pins and the channel's own pins, and which channel. Wiring added or taken away at either end changes it; anything else doesn't. Allocating it elsewhere, or taking it off, drops the confirmation.
- **Where it's shown:** each allocated point in Design's Properties says how it's wired (✓ straight, ✓ confirmed, not drawn yet, or to review with *Confirm by hand*); Check lists only what's to review. Check is in Design's top bar too.

**Step 7b (one hop)**

- **Proved on the example project** before being turned on: LSP-01 has no controller, so the tests add a DI module to sheet 8 and allocate DPS-SF-01's *Airflow proven* to DI1. The switch drives coil K8-37 (through terminal 8-35); a K8-37 contact wired to DI1 comes out *via K8-37*. A contact of a relay it doesn't drive, two relays in a row, and a plain switch between all come out *to review*; the switch case can still be confirmed by hand. The reverse (a DO channel driving a relay whose contact switches a plant input) comes out *via* too.
- **A relay is a coil or timer coil with its linked contacts**, matched exactly: the coil on one side's nets, one of its own contacts on the other's. A contactor's main poles (isolators driven by a coil) aren't counted as its contacts here; they switch power, not signals.
- **First relay found wins** if more than one would do: each would be a true one hop, so the result can't pass anything wrong.

**Step 8 (interlocks)**

- **One condition per interlock**, made a *never* expectation of two conditions: the point on, and the condition. A second condition would need three conditions in one expectation, which expectations don't have (two at most); a second interlock says it instead, and reads more plainly.
- **The condition is a point in the table** (field plant's on/off points), as §6 says; the point is one of the plant's own. Analogue and comms points can't be on or off, so they aren't offered, and a point changed to one of those loses its interlocks.
- **Generated expectations follow their interlock entirely:** rewritten when it changes, removed when it goes, made for copies. This revises step 2's call: an expectation whose interlock has gone now goes too, rather than staying as a hand-written one. They show in Expectations… greyed, and can't be edited or deleted there.
- **Proving is asked for, not run on every edit:** the search takes seconds on the example (2 s for a duty/standby interlock), too long to run as you type. So *Check logic* in Simulate, *Prove* in a plant's Properties and *Prove all* in To draw record results against a fingerprint of the drawing; Check, To draw and Properties read them, and say *not proved yet* when the drawing has changed since. The MCP `check` tool proves them as it runs.
- **Proved means no sequence breaks it**, as for any expectation in Check logic: an interlock whose point is drawn but wired to nothing is proved, since nothing can turn it on. Not drawn is reported before anything is tried.
- **Proved on the example:** *FA-SF SF-01 running never on while FA-SF SF-02 running* (duty and standby) proves; *… while FA Fire alarm off* fails.

**Step 9 is two PRs:** 9a networks and the Network view; 9b the network sheet.

**Step 9a (networks, the Network view)**

- **The switch isn't data:** it's drawn whenever there's a LAN (*Switch · 2 LANs*), with no tag or port count. A switch with a tag and ports would be plant (or a module) of its own, and nothing in v0.4 needs it; it can come with addresses.
- **One drawing for the view and the sheet:** `networkDiagram` lays it out in sheet units, and the view shows exactly what the sheet will print (step 9b), in black on the paper colour rather than the mockup's colours.
- **Shortened runs:** a LAN shows four devices a row for four rows (sixteen), a bus eight, then *… FCU-17 to FCU-19 (3 more)*. Enough to read the pattern on an A4 sheet; the table has every device.
- **Putting a device on a network** makes it comms (if it was hardwired; *both* stays both) and gives it the network's protocol if it had none. A network's protocol is its own field too, so devices and network can be told apart if they ever differ.
- **Reordering swaps rows:** ↑ ↓ on a network swaps the device with its neighbour on that network, in the table too, as §7 says the order is the row order.
- **Comms plant on no network** is listed under the drawing, so it isn't lost.

**Step 9b (the network sheet)**

- **The sheet is a spare sheet** (annotations only) titled *Network diagram*, at the end of the set, with one *Network diagram* element: like the controller map, it holds no data of its own and is redrawn from Design's networks every time. It can be moved, retitled and renumbered like any sheet, and the element is in Annotate's *Tables* to put on another sheet.
- **Placing again** asks first, when a sheet already has the diagram: two sheets would print the same thing.
- **After placing**, Annotate opens on the new sheet, so it's seen at once.
- **The drawing's code** is in `networkdraw.ts`, apart from the network ops: the symbols draw it, and importing the ops there would make a loop.

**Step 10 (points schedule)**

- **Where it is:** *Export points schedule* in Design's top bar, on every view, as the mockup has it; the MCP `schedules` tool gives it as kind `points`. The file is named like the other schedules (`<drawing number> points schedule.csv`).
- **Rows:** every point of field plant, by system in the table's order, then rows within each system. Plant with no points (a motor, a comms device with none listed) is one row, its form *comms* when it's comms plant and its protocol in *Signal*, so nothing in the table is missing from the schedule.
- **Via** is the relay when the check traced one hop. A point confirmed by hand has *confirmed* under *Wired* and *Via* empty: a confirmation doesn't say what's between.
- **Wired** is empty for a point with no channel, as there's nothing to be wired to; *Channel* is empty too, so unallocated points stand out.
- **Module** is the module's tag (*A3-23*, or *A?* until drawn); its type is in the IO schedule.

**Step 11 (Suggest)**

- **What it proposes:** the points still to allocate, in table order, each on the first free channel of its type in rail order, a module of its own type before a universal one, so universal channels are left for what nothing else can take. Points already on channels are never moved. A point with no room is shown as such, not forced.
- **A proposal, fixed when opened:** the window shows it line by line; untick a line, or pick another channel (only free channels of its type, not proposed for another line), then *Accept ticked*. *Throw away* closes it with nothing changed. Accepting is one undo step and allocates each line exactly as picking it by hand would.
- **No grouping cleverness:** it doesn't try to keep a plant item's points on one module or leave spares per module. Those are design decisions (§4); the proposal is a quick start to change.
- **Suggest…** is in the Controller view's top bar, with a controller.

---

## 11. Decisions, as discussed (24/11/26)

1. One project is one panel; work goes an area at a time, broken down by panel.
2. The client's description of operations comes first and the points schedule is built from it by hand: a requirement is read and turned into points and devices. So Design is where the schedule is built, and it's an export. (To confirm with someone who writes schedules.)
3. A field device is separate plant: the flow switch for a pump is its own entity.
4. No tailored tools: no Generate dialog, no recipes, no built-in plant types. Parts, Duplicate and the engineer's own templates.
5. Allocation of IO is manual and visible in the table. A Suggest that only proposes is acceptable.
6. No door layout in Design: the door is laid out in Layout. No fascia note on plant either; door devices are drawn in Draft and placed in Layout as now.
7. Plant may switch a relay that then switches the input: allocation is intent, with *goes to* on each point.
8. Relay checking stays simple: direct or one strict hop; anything else confirmed by hand, with no stale confirmations.
9. The controller is built in Design; one per panel; anything outside the panel is plant.
10. The workbench is called Design; GA becomes Layout; Annotate stays where it is.
11. Design templates are a list of their own.

## 12. Not in v0.4

Mode tables (a mode against what each output does: a cheaper statement of intent than a function block diagram); function block diagrams; points schedule import; addresses on the network; 24 V load and cable schedules from Design; commissioning checksheets; generated description-of-operations text.

At the v0.4 release, remove `preRelease()` in `src/core/validate.ts` as CLAUDE.md says.


## 13. Testing

Targeted checks for the v0.4 build (`ferrule-windows-v0.4.0-pre.zip`, after PR 73), to go with the v0.3 testing. Each says what to do and what should happen; tick it, or note what happened instead. Where a check is about a judgement call made while building, it says so: say whether to keep it.

### Old projects and Draft

- [ ] **An older project opens unchanged.** Open a v0.3 project (or the LSP-01 example): every sheet, wire and number as before; Check lists what it did before and nothing from Design. Its plant shows in Design under *No system*.
- [ ] **A Draft-only project still works.** A project with no plant and no controller: Draft, Annotate, Layout and Simulate as in v0.3; Design shows an empty table.
- [ ] **Saving keeps Design's data.** Make systems, plant, points, a controller, networks and an interlock; close and reopen: all there.
- [ ] **Layout is the old GA workbench.** The tab reads *Layout*, its browser section *Layout tools*; GA sheets, *New GA sheet*, the *GA* badge and the bill of materials still say GA.
- [ ] **v0.3 fix (PR 67):** a controller module not drawn yet is reported once in Check (*Module A? (DI-8) … isn't drawn*), not also as *Plant : terminal 1, 2… not shown*.

### Step 3: the Design table

- [ ] **+ System, + Plant, + Point** build a system with a plant row and points; a point added in Design shows ○ (no pins yet).
- [ ] **Properties edit everything:** tag, description, prefix, system, connects by (comms shows protocol and network), enabled by, source, information, *power by others*, pins line, and each point's name, form, signal, goes to and channel.
- [ ] **Type follows form, from the plant's side:** a contact is DI, a dry or powered input DO, an analogue out AI, an analogue in AO; supplies and comms have none.
- [ ] **The Needs line** counts points that go to a channel (not *panel only*); with a controller, *Have* and *Spare*, a shortfall in red.
- [ ] **Systems fold** (▸) with a count; renaming one moves its plant with it; deleting one leaves its plant under *No system*.
- [ ] **Judgement call:** projects still open in Draft, not Design. Keep?

### Step 4: Duplicate ×n and templates

- [ ] **Duplicate ×n** on one row and on a group (Ctrl+click): the window shows each copy's tags; copies land after the last picked row, with their points and signals, on no channel.
- [ ] **A taken tag** (duplicate P1 when P3 exists, ×3) is struck through in the window and left empty on the copy. **Judgement call:** empty rather than the next free number. Keep?
- [ ] **Templates…:** the list starts empty; *Save selection as template…*; insert into a system with copies and a step; DI/DO/AI/AO totals shown first. Inserted rows are ordinary plant: editing the template later changes nothing inserted.
- [ ] **Templates go to every project:** they're saved in `library/design` beside the projects folder. Open another project: the template is in its list. Draft's *Templates* doesn't list it.
- [ ] **Judgement call:** only tags step, not descriptions (*Pump 1* is copied as *Pump 1*). Keep?

### Step 5: the controller in Design

- [ ] **One controller per panel:** *Add the controller* in the Controller view; *Controller…* offers no second one. A file with two shows both.
- [ ] **Drag a point onto a channel:** only channels that can take it light up (a UIO channel takes any type); drop it there. Drag it back to *Unallocated* to take it off.
- [ ] **Pick the channel in the table** (Channel column) or Properties: only free channels of the right type are offered.
- [ ] **A point nothing can take** (an AO with no AO or UIO channels) is shaded and says why.
- [ ] **Labels follow points:** a placed module view's channel label reads the point's tag and name (*DPS1 flow*); it changes when the plant is retagged (Renumber too) or the point renamed; taken off, the typed label comes back. Same in the IO schedule.
- [ ] **Draft has no Controllers button;** the window opens from Design's *Controller…*.

### Step 6: To draw, and Draft placing only

- [ ] **To draw** lists plant and modules not drawn (red), and what's drawn (ticked, with sheets).
- [ ] **Place on sheet** for plant made in Design with no pins: the pins line appears with a numbered suggestion; correct it, *Give pins, then place*; Draft opens ready to drop it.
- [ ] **Place another view** of a drawn module splits it across sheets, as before.
- [ ] **Draft's Plant window** lists plant to give pins and place, with no *New plant…* or delete.
- [ ] **A pins line edited in Draft** keeps points that have no pins yet.
- [ ] **Judgement call:** unallocated plant can be placed (To draw says *not all allocated*), rather than *Allocate first*. Keep?

### Step 7: checks

- [ ] **Design's findings** once a project uses Design: a point with no channel (with a controller), plant not drawn, equipment drawn below the boundary that isn't plant. *Show* opens the row in Design.
- [ ] **Direct:** wire a point straight to its channel's pin: Properties says *✓ Wired straight to its channel*; nothing in Check.
- [ ] **A shared common doesn't count:** wire only the point's common to the module's shared common: *to review*.
- [ ] **Via one relay:** point → relay coil, a contact of that relay → the channel: *✓ via K…*. Two relays in a row, or a switch between: *to review*.
- [ ] **Confirm by hand** (Check or Properties): *✓ confirmed*. Add a wire at either end: back to *to review* by itself. Change something elsewhere: still confirmed.
- [ ] **Judgement call:** local isolators drawn below the boundary aren't reported as *not in the table* (they're drawn as switches at the motor). Keep, or should they be plant?

### Step 8: interlocks

- [ ] **+ Interlock** in a plant's Properties: its point, *never on while*, a point in the table, on or off. Expectations… shows the generated one greyed, and it can't be edited or deleted there.
- [ ] **It follows:** rename either point, or duplicate the plant: the expectation follows; delete the interlock: it goes.
- [ ] **Prove** (Properties), **Prove all** (To draw), or **Check logic** in Simulate: on the example, *FA-SF SF-01 running never on while FA-SF SF-02 running* is proved; *… while FA Fire alarm off* fails.
- [ ] **Not proved yet** after changing the drawing, until proved again; **not drawn** when a point it names isn't on a sheet.
- [ ] **Judgement call:** proving is asked for, not run on every edit (it takes seconds on a real drawing). Keep?
- [ ] **Judgement call:** one condition per interlock; a second condition is a second interlock. Keep? *Replaced by v0.4.x T1 (PR 99): an interlock takes several conditions, all of them or any of them.*

### Step 9: the network

- [ ] **+ Network** (LAN or bus, protocol); put comms plant on it from its Properties or the network's list.
- [ ] **The Network view** draws the controller, a switch when there's a LAN, each LAN's devices four to a row, each bus as a chain; past 16 (LAN) or 8 (bus) the rest are counted.
- [ ] **Order is row order:** ↑ ↓ on a bus moves the device, and its row in the table.
- [ ] **Place as sheet:** a spare sheet *Network diagram* at the end; it prints with the set and is redrawn when networks change (rename one and look).
- [ ] **Judgement call:** the switch isn't data (no tag or ports), only drawn. Keep, or should it be plant with a tag?

### Step 10: points schedule

- [ ] **Export points schedule:** a CSV with System, Tag, Description, Point, Form, Signal, Type, Goes to, Controller, Module, Channel, Via, Wired; by system; unallocated points with the channel empty; plant with no points as a row.
- [ ] **Via and Wired** agree with Properties (direct, via K…, confirmed, to review, not drawn).

### Step 11: Suggest

- [ ] **Suggest…** (Controller view) proposes channels for the unallocated points; points already on channels aren't moved; a point with no room says so.
- [ ] **Change a line** or untick it, then **Accept ticked**: only those are allocated, as one undo step. **Throw away** changes nothing.
- [ ] **It never runs by itself:** nothing is allocated until you accept.

### Fixes and tweaks for v0.4.x

How each entry is to be built, and in what order, is in `docs/design-v0.4.x.md`. The master list from here on: what testing finds, to fix in small PRs (one or a few per PR, noted under *Changed during build*), or to carry into a later version. Add to it as testing goes; tick an item when its PR is merged and give the PR number.

The first entries come from an integration test: a 36-sheet BMS panel (incomer and 24 V supply with UPS, fire alarm interface relays, fan and damper enable logic, drives, fans, a controller with eight IO modules and about 70 points) rebuilt in Ferrule through the core operations, then checked, proved, exported and compared with the original sheet by sheet. Design, allocation, module pin patterns, the wiring check, templates, cross-references, Renumber, Layout, the network sheet, the points schedule and PDF export all did the job. What didn't, or was missing:

**Fixes**

- [x] **F1. An interlock proved because nothing is powered.** With the 24 V supply drawn as boxes (no source on the 24 V distribution), every interlock came out *proved*: nothing on 24 V can ever be on. A proof whose point can never be on should say so (*never on: is it powered?*) rather than *proved*. Small; v0.4.x. *Done in PR 98.*
- [x] **F2. A distribution with loads and no source isn't reported.** Check should warn when a distribution feeds coils, lamps or plant and nothing supplies it (no incoming supply, transformer, plant supply out or busbar stand-in). Small; v0.4.x. Goes with F1. *Done in PR 98.*
- [x] **F3. Comms-only plant is reported as not drawn.** Plant connected by comms only (meters on a bus) belongs on the network sheet, not a schematic, but To draw lists it red and Check says *not drawn yet*. Leave comms-only plant with no wired points out of both (or show it as *on the network sheet*). Small; v0.4.x. *Done in PR 95.*
- [x] **F4. Plant view text wraps to the plant.** A plant view's tag, description and information lines don't wrap, so a long description runs past the box into the next view (long project tags make it worse). They should wrap so that nothing runs more than about 1–2 units past the plant's box on either side. A narrow view (one or two pins) wraps at a minimum width rather than to a word per line: about 12 units, to settle when it's built. A tag breaks only at a hyphen, and only if it has to. The same rule for any label drawn under plant. The description and information lines are 2.5 mm, not the 1.8 mm detail size. A group's name over its terminals wraps too, so it doesn't overhang its group's width by much. v0.4.x. *Done in PR 101.*
- [x] **F5. Module views side by side overprint their title rows** (tag · type · maker model · part of …). Wrap or shorten the title to the view's width. v0.4.x. *Done in PR 101.*
- [ ] **F6. Routes run along the terminal strip and module pin rows,** next to other wires' stubs, and loop round a pin that faces away (a module's supply pins face down, so a supply from the rails above loops round the module). Keep routes a clear unit off strips and pin rows. v0.4.x or later.
- [x] **F7. A wire to plant isn't field wiring unless it leaves on the terminal block.** Any wire to a plant view is drawn as field wiring (dashed) and shows no wire number, so plant inside the panel (a power supply, a DC UPS) has wires with no numbers. The rule should be: a wire is external only when it goes out through the boundary's terminal block; a wire to plant above the boundary, not through a terminal, is panel wiring, solid and numbered. Goes with T3. v0.4.x. *Done in PR 100.*
- [x] **F8. The boundary terminal block is too short for its numbers.** Five-character numbers (20-19) are cut off at the block's edges. Make the block a little taller (or fit it to its longest number at every length, not only the long ones). Small; v0.4.x. *Done in PR 95.*

**Tweaks**

- [x] **T1. Interlocks with an exception.** *Never on while A off, unless B on* (a fire alarm stop with a firemans override) can't be written: each condition is its own rule, so the real design shows as *fails*. Add AND conditions, or an *except while* clause. Revisits the step 8 judgement call (one condition per interlock). v0.5. *Done in PR 99.*
- [ ] **T2. A module view spans a chosen width.** Channel groups are packed two units apart, so eight channels take about 40 units while their field devices need 120 or more: every wire runs sideways under the module and wire numbers crowd at its pins. A module view (and any plant view with groups of terminals) should take a width, up to the usable sheet, and spread its groups with equal gaps between them, so each channel drops straight to its device. v0.4.x.
- [x] **T3. Panel devices that aren't field plant.** A power supply, DC UPS and batteries had to be plant (so the simulator has a 24 V source): their wiring draws dashed as field wiring, they count in To draw's field plant, sit under *No system* in Design and appear in the points schedule. A *panel device* kind of plant (inside the panel, solid wiring, not field), or a generic device box with pins. v0.5. *Done in PR 100.*
- [ ] **T4. Terminal strips by section.** Everything lands on X1; on the backplate one long strip runs off the end of its rail. Offer strips by section, and let a strip on a GA wrap onto the next rail. v0.5.
- [ ] **T5. Networks know their port.** A network doesn't record which controller port it's on (COM A, COM B, Ethernet); it had to go in the name. Add a port; consider end-of-line terminators and in/out on the same terminal as notes on the network sheet. v0.5.
- [ ] **T6. Stamping and links out.** A stamped sheet drops links out of the stamp (by design), so each stamped sheet's relay contacts and arrows are linked again by hand. Offer to map them while stamping (this contact → that coil). v0.5.
- [ ] **T7. Label collisions.** Coil labels collide when relays are close; arrow labels collide when arrows are under about 20 units apart. A hint in Check, or labels that move clear. v0.5.
- [ ] **T8. Duplicate steps the last number** (P1-12 → P1-13). With sheet-and-column tags the copy is always retagged; consider stepping the first number, or leaving tags to Renumber. v0.4.x (judgement call).
- [ ] **T9. Module tags.** Modules take their tag from their first view (a module sheet), and the controller's from its host; a drawing set that tags them from the controller map sheet can't. Let the map sheet give module tags, or say which view does. v0.5.
- [x] **T10. GA fit scale.** A door fitted at 1:9.5; fit to standard scales (1:5, 1:10, 1:20). v0.4.x. *Done in PR 95.*
- [x] **T11. Proving takes time on a real panel:** about 18 s for four interlocks with some 40 hand-set inputs. Show progress, or prove one interlock at a time in the background. v0.5. *Done in PR 99.*
- [ ] **T12. Label plate text position.** A label plate's text can sit at any of nine places: top, middle or bottom, by left, middle or right. v0.4.x.
- [ ] **T13. Wire labels slide along their wire.** A wire's number and colour stay snapped to the wire, but can be dragged along its length to where they read best. v0.4.x or v0.5.
- [ ] **T14. Part labels can be moved.** A lamp's, coil's or other part's label can be dragged clear by hand, as a relay's contact table can; solving every collision automatically isn't worth it. A part with several lines (a plant view's tag, description and information) moves them together as one block. Takes the place of T7's moving labels (a hint in Check can stay). v0.4.x or v0.5.
- [ ] **T15. Terminal groups face any side.** A plant view's terminals are along its top and a module view's along its bottom, fixed. Each group of terminals should be able to sit on any side of the view: top, bottom, left or right (a setting per group, with the view's own default), so plant can sit above, below or beside what it wires to, and a module below its field devices, without wires looping round. On the left and right, terminals stack down the side with their numbers reading across. It comes with movable labels: terminals leaving the bottom of a plant view run through where its tag, description and information lines sit, so those can be dragged clear, and they move together as one block, as other parts' labels do (T14). Helps F6; goes with T2 (a view's width) and M9 (the earth block's side points). v0.4.x or v0.5.
- [x] **T16. A module view says which module it is.** The view's title gives its tag, type, maker and model, but not its number on the rail (the number in the circle on the controller map, its slot or bus address). Show it by the type: *Module 9 · DO-8*. Small; v0.4.x. *Done in PR 95.*
- [ ] **T17. Socket drawn as three contacts in a box.** Draft's socket is a half-round with L and N at the top and its earth out of the side, which makes the earth awkward to wire. Redraw it as a box (a solid outline, not dashed) with three socket contacts side by side (each the female contact mark: a cup open downwards), L, N and E all entering from the top, a column apart, so the earth runs down beside L and N. The label sits under the box. Old projects keep their wires: L and N stay where they are, and the earth's wire is re-routed to its new place. v0.4.x.
- [ ] **T18. The cable schedule gives cores per device.** It lists one row per wire to a plant terminal. Add a summary per field device: how many cores it needs (four wired terminals, a four-core cable), so an installer knows what to run. Small; v0.4.x.
- [x] **T19. A file says which Ferrule saved it.** A project file records its format number only. Record the version that saved it too, so when a newer file won't open, the message names that version and points to its release, instead of only *saved by a newer Ferrule*. Small; v0.4.x. *Done in PR 95.*
- [ ] **T20. Do the parts fit the enclosure?** Check already reports each rail's use and a device running off its rail. Add the same plain arithmetic for the enclosure: rails, trunking and devices inside the backplate, door devices inside their leaf. Catches an enclosure ordered too small. No 3D view. Small; v0.4.x.
- [x] **T21. README: free, as is, no support.** A plain line saying Ferrule is provided free, as is, with no support; issues and pull requests are welcome, with no promise of a response. Small; v0.4.x. *Done in PR 95.*

**Missing**

- [ ] **M1. Symbols:** an RCD function on the existing breaker part (and RCD socket), screened cable or pair with screen earth, connector and flying leads, and marks inside plant views (temperature, ΔP, valve, damper actuator, power supply, battery). A power supply, a battery and a DC UPS are not symbols: they're plant in the panel (T3), set up once and kept as a Design template. No resistor.
- **M2. Cables as objects: not doing.** Cabling is outside the panel and installers don't work from it. Cable types stay as notes on the sheet or in a plant item's information.
- [ ] **M3. Wire colour by function,** not only from distributions: DC signal and external supply colours as the drawing's notes give them.
- [ ] **M4. Relay pin numbering from the part:** a relay base's own terminal numbers rather than IEC 11/12/14.
- [ ] **M5. Door devices with no schematic part** (a touchscreen) as GA devices with a tag, not label plates.
- [ ] **M6. A controller's commons are linked inside it.** The common, RET and 0 V terminals of a module should be joined internally (per module, as its datasheet has it), so one return can carry 0 V for all its IO: in Simulate, in the wiring check, and without each one needing its own wire for Check to be quiet. Today each is a separate pin. v0.4.x or v0.5.
- [ ] **M7. Serial ports as terminal groups.** A group of terminals on plant or a controller can be a serial comms port (RS485 and the like). It's functional: the network is built from the links drawn from that port, device to device in wiring order, so the network sheet's bus, its order and its ends come from the drawing. Takes in T5 (a network knows its port). Ethernet and USB get nothing special: where one is wanted on a controller or plant it's an ordinary pin with a name (ETH0), there for recognition, and its lead isn't drawn as wiring; the LAN is set out on the network map as now. An Ethernet switch in the panel is a plant part: it takes rail space on the GA, is on the bill of materials and draws 24 V. v0.4.x.
- [ ] **M8. Motors: single phase, and fan and pump variants.** Draft's motor is three phase only (U V W). Add a single-phase motor (L N), and variants that change only the picture: plain motor, fan, pump. For what hangs off plant whose controls are drawn separately (a drive powering a fan), and for motor plant with no controls. v0.4.x or v0.5.
- [ ] **M9. Connector block.** A general part: a box of terminals that are all one potential, labelled for what it's used as (*Earth block*, a 0 V or 24 V block, a screen connector). It has a setting for how many terminals, from 2 up to about 12, and the box grows with each one; the terminals sit along the box's opposite edges so a conductor passes through in line (in at one side, out at the other); it rotates like any part, so it works upright or on its side; and the border keeps two connection points, centre left and centre right, for an earth sign (the backplate connection) or a link on to another block. As an earth block it answers how to wire the earth from a supply in: the earth passes through it in line with L and N; today there's an earth sign with one terminal and an earth terminal in the terminal block, and neither sits in the run. Tagged as a terminal (X); appears on the GA, its size from its terminal count. v0.4.x.
- [ ] **M10. Wire and core marker export.** A CSV for a marker supplier, one marker per line, with an option to group duplicates and give a count. A marker matches the terminal its wire goes into. A panel wire has two, one at each end: the number of the boundary terminal it lands on, or its own number (from where it starts) when it reaches none. A field core has two: at the panel end the boundary terminal's number, at the field end the cable's identity outside the panel (the device's tag). The terminal's number, from its sheet and column, is the authority. Small; v0.4.x.
- [x] **M11. What a supply gives and what a load takes.** Each supply (incoming supply, transformer, power supply) states what it gives out: 24 V AC, 24 V DC, 230 V AC. Each load states what it accepts, including *24 V AC/DC* for parts that take either. Check flags a load fed from a supply it can't take, tracing through relays and terminals as Simulate does. The same data tells F2 whether a distribution has a source, so the two are built together. v0.4.x. *Done in PR 98.*
- [ ] **M12. Supply load in Simulate.** Each part has one expected draw from its data sheet, in VA (relays, modules, switches, and field devices fed from the panel, which often take the most). Each supply shows two figures beside it in Simulate: *live*, the draw in the current simulated state, and *worst case*, everything connected to it. A supply's total passes up to whatever feeds it, with a rough efficiency for a power supply's losses (85%, say); sums are in VA, shown as amps at each supply's own voltage. A supply has a rating, and its figure turns red when over. Builds on M11's data. Open: whether a draw is set on the part type, the placed part, or both; worst case is *everything connected*, not interlock-aware. v0.4.x, after M11.
- [x] **M13. Modular doors.** A door is one or two full-height leaves today. Let it be columns of stacked doors, each with its own height, hinge and name (a sectioned or compartment panel front): each door drawn with its outline, devices belonging to the door they're on, drill centres dimensioned from that door's own edges, the door back mirrored, and any one door on a sheet of its own. One- and two-leaf doors are the simple cases and old files open unchanged. Each door can have its own backplate sheet behind it (a compartment's mounting plate), sized from the door and then set by hand, with its own rails, parts, fit checks and bill of materials; a panel with one plate stays as it is. Needed to draw a QA panel's door, so built early. v0.4.x. *Done in PRs 96 and 97.*

**Tests to add**

- [ ] **Timed contacts.** A contact linked to a timer coil draws the delay mark (its arc following the timer's function) and takes terminal marks 17-18, 15-16 or 15-16/18, with its contact table matching; unlinking returns it to a plain contact; *Instantaneous* keeps it switching with the coil. On a printed sheet, check the mark sits clear of 2.5 mm text, and that linking and unlinking update both the symbol and the marks.
- [ ] **Bill of materials.** It's built from the Layout sheets, so it lists only what's placed on a GA. Check a finished panel's list against its schematic: is anything on the schematic missing because it was never placed?
