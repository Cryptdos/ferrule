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
