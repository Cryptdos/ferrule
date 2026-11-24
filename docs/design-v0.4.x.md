# Ferrule v0.4.x: the revision sprint

The plan for the sprint that works through the master list in `docs/design-v0.4.md` §13, *Fixes and tweaks for v0.4.x*: every F, T and M entry there, and its tests. That list says **what** is wanted and why; this document says **how** each one is to be built, in what order, and what has to be true when it's done. Where the two disagree on what's wanted, the list wins and this document is corrected.

The version stays `0.4.0-pre` through the sprint. The working agreement in `CLAUDE.md` holds: one step, one PR, a build per code PR, the list ticked with the PR number, both documents synced after each PR.

## 1. Ground rules for the sprint

- **Old files open unchanged.** Every new field is optional and unset means "as before". Where a fix changes how an old drawing *looks* (F7 is the one case), it's noted under *Changed during build*.
- **Nothing is built in.** New parts are symbols like any other; new settings start empty or at today's behaviour.
- **Intuitive or transparent.** When Ferrule decides something from context (a wire is panel wiring, a common is linked inside a module), the result shows on the sheet.
- **A generic fixture first.** The findings came from a private drawing that can't be in the repo. Step 0 builds a generic stand-in so each step has a before and after picture.
- **Each step ends with:** tests for its rules, a print screenshot of the sheets it changes (from the fixture), the README and the decisions table in `docs/DESIGN.md` updated, and its entries ticked in §13.
- **Judgement calls** go under §5 *Changed during build* here. Anything marked **Decide** in §3 is the user's call: if it hasn't been answered when the step starts, build the recommended option and say so in the PR.

## 2. Order of work

Small and safe first; then the data other steps need; then layout, where three entries have to be designed together; then parts, the controller and exports.

| Step | Entries | What | Size |
|---|---|---|---|
| 0 | — | A generic BMS panel fixture (`src/bench/bms01.ts`) | Small |
| 1 | F3, F8, T10, T16, T19, T21 | Small fixes | Small |
| 1b | M13 | Modular doors: columns of stacked doors, each with its own backplate | Medium, two PRs |
| 2 | M11, F2, F1 | What a supply gives; unpowered distributions; honest proofs | Medium |
| 3 | T1, T11 | Interlocks with several conditions; proving shows progress | Small |
| 4 | F7, T3 | Panel wiring and panel devices | Medium |
| 5 | F4, F5 | View text wraps | Small |
| 6 | T14, T7, T13 | Labels and wire labels can be moved | Medium |
| 7a | T2 | A view spans a chosen width | Medium |
| 7b | T15 | Terminal groups on any side | Large |
| 8 | F6 | Routing clear of strips and pin rows | Medium |
| 9a | M9, T17, M8 | Connector block, socket, motors | Medium |
| 9b | M1, M5 | RCD function, connector, plant marks; door devices | Small |
| 10a | M6, T9 | Module commons; module tags | Small |
| 10b | M7, T5 | Serial ports build their network | Large |
| 11 | T4 | Terminal strips by section | Medium |
| 12 | T18, M10, T20 | Cable cores, wire markers, enclosure fit | Small |
| 13 | T6, T8, T12 | Stamp links, Duplicate's step, label plate text | Small |
| 14 | M12 | Supply load in Simulate | Medium |
| 15 | M3, M4 | Wire colour by function; relay pins from the part | Medium |

Steps 5, 6 and 7 touch the same code (`plantViewLayout`, `moduleViewLayout`, `drawModuleView` in `src/core/symbols.ts`) and are built in that order, one after another, not in parallel. Step 8 comes after 7 because sides and widths remove much of what the router gets wrong today.

## 3. The steps

### Step 0: a generic fixture

`src/bench/bms01.ts`, built like `lsp01.ts`, with a script `scripts/build-bms01.ts`. Invented names throughout (AHU-1, EF-1, TT-1…), nothing from any reference. It must reproduce the structures the findings came from:

- an incomer, a 24 V power supply and battery drawn as plant inside the panel, feeding 24DC and 0V distributions;
- three fire alarm interface relays and an enable circuit two relays deep;
- two drives on a serial bus, two fans, two dampers with end switches;
- a controller: host, power supply module, one DI-16, one UIO-16, one AO-8, one DO-8, each on its own module sheets with field devices below a boundary;
- comms-only meters on a second bus;
- long project tags (`AHU-01-DPS-25-44`) and four-word descriptions;
- two interlocks, one of which needs an exception (T1);
- a door and a backplate GA.

Laid out from coordinates, untidied, on purpose: it's the "before" picture. Not shipped in the exe.

### Step 1: small fixes

**F3. Comms-only plant isn't "not drawn".** Plant with `connects: "comms"` and no point that has pins belongs on the network sheet. In `toDraw` (`design.ts`) and the *not drawn yet* finding (`checks.ts`): leave it out of the count and the red list. In To draw it shows under its own heading, *On the network*, with its network's name, or amber *not on a network* when it has none.

**F8. The terminal block fits its numbers.** `fitBlock` (`blocks.ts`) already sizes cells to the longest number, but only `routePage` calls it, so numbers that change after routing (Renumber, a typed number) are cut off until the next route. Call it wherever terminal numbers change: Renumber, a terminal's number edited, a stamp. Also raise `BLOCK_HALF` enough that a five-character number fits without growing. Test: renumber a sheet into five-character numbers and assert each cell is at least `cellHalfFor` its numbers.

**T10. GA fit scale.** `fitScale` (`ga.ts`) returns half steps (1:9.5). Return the smallest standard scale that fits: 1, 2, 2.5, 5, 10, 20, 25, 50. Existing sheets keep the scale they have.

**T16. A module view says which module it is.** The number is the one in the module's circle on the controller map. Title row becomes *MODULE 9 · DO-8 · maker model*. Step 5 wraps it.

**T19. A file says which Ferrule saved it.** Write `savedBy: "<version>"` at the top level on every save (`storage.ts`); `validate.ts` reads it and otherwise ignores it. When a file's format is newer than the build's, the message becomes *Saved by Ferrule 0.5.1 (format 4). This is 0.4.0 (format 3). Open it in 0.5.1 or later:* with the releases link. A file with no `savedBy` gives today's message.

**T21. README.** Under the download line: *Ferrule is provided free, as is, with no support. Issues and pull requests are welcome, with no promise of a response.*

### Step 1b: modular doors

**M13.** Brought forward: the user needs it to draw a panel door for QA.

A door today is one or two leaves, side by side, each the enclosure's full height (`GaSettings.leaves`, `doorLeaves` and `sheetLeaves` in `ga.ts`). A modular door is columns of stacked doors, each its own piece of steel with its own hinge.

**Model.** `GaSettings.columns?: DoorColumn[]`, on a door-front sheet:

```ts
interface DoorColumn { w: number; doors: DoorPane[] }           // left to right from the front
interface DoorPane { h: number; hinge: "left" | "right"; name?: string }  // top to bottom
```

- Column widths add up to the enclosure's width; the last column takes what's left. A column's door heights add up to the enclosure's height; its last door takes what's left.
- Unset, the door is its `leaves`, as now: a leaf is a column with one door. Old files aren't rewritten.
- Up to 6 columns and 8 doors in a column.
- A sheet that shows one door of a door laid out elsewhere names it by column and row (`GaSettings.pane?: [col, row]`); `leaf` keeps working and means that column's only door.

**Drawing.** Each door is drawn with its own outline and hinge marks, and its name if it has one, small, at its top left. The door-back view mirrors the columns left to right, as it mirrors two leaves now.

**Devices and plates.** An item on the door belongs to the door its centre is on. Drill centres and dimensions are taken from that door's own edges, by the rule a leaf uses today, so each door can be drilled as a separate piece. Check warns when an item lies across two doors (with T20, when it lies outside its door).

**Setting it out.** In the door sheet's settings, where leaves are set now: a list of columns with their widths, and under each its doors with height, hinge and name. Two quick tools on the sheet: *Split this door* (across or down, at the pointer) and *Join with the door below*.

**Compartment backplates.** In a sectioned panel each door has its own mounting plate behind it. A backplate sheet already has its own size (each GA sheet carries its own `enclosure`), so a project can already hold several plates; what's missing is the tie between a plate and its door.

- A backplate sheet can say which door it's behind: `GaSettings.behind?: { sheet: string; pane: [col, row] }`, the door-front sheet and the door on it. Unset, it's the panel's one backplate, as now.
- Its size starts as that door's width and height, less a margin all round (25 mm, editable), and is then the user's to set: the plate is rarely the door's exact size.
- Its title starts as *Backplate:* and the door's name; the door on the front sheet prints a small reference to its plate's sheet, and the plate's sheet names its door, so the two can be found from each other.
- *Add a backplate for each door* on a door-front sheet makes the sheets in one go, in column then row order; doors that already have one are skipped.
- Changing a door's size afterwards doesn't resize a plate that's been set; Check gives an info line when a plate is larger than its door's opening.
- Rails, trunking, devices, the rail fit and the enclosure fit (T20) all work per plate, as they do per backplate sheet now. The bill of materials already lists by sheet, so it reads per compartment.
- Deleting a door, or joining two, leaves their plates as ordinary backplate sheets with nothing behind them, and Check says so. Nothing on a plate is deleted.

Built as two PRs: the doors; then the plates behind them.

**Not in this entry.** An interior elevation showing every compartment's plate in place, with the doors open. Each plate is its own sheet.

Tests: a door of two columns, three doors each, of different heights: every door's outline, an item's owner, and a dimension from its own door's edge; the door back mirrored; an old two-leaf sheet draws exactly as before; a plate made for each door has that door's size less the margin and names its door; joining two doors leaves both plates, flagged.

### Step 2: supplies

**M11. What a supply gives and what a load takes.** One small type, used everywhere:

```ts
/** 24 V DC, 230 V AC… */
interface SupplyType { v: number; ac: boolean }
```

- **Gives** (one value): the Incoming supply part; a transformer's secondary; a plant point of form `supply-out`.
- **Accepts** (a list, so *24 V AC/DC* is two entries): coils, timer coils and lamps; a plant point of form `supply-in` or `powered-in`; a power supply module.
- Chosen from a short list (24 V AC, 24 V DC, 230 V AC, 400 V AC, 12 V DC) or typed. Unset is allowed on both sides and means *not stated*.
- A distribution's `voltage` text stays as its printed label; it isn't parsed.

**The check** (`checks.ts`, using what `compile` in `sim.ts` already traces): for each load, find the supplies that can reach it through any closed path. Warning when a load states what it accepts and a supply that reaches it gives something else: *K3 takes 24 V AC; it's fed from G1, 24 V DC.* One info line counts loads that don't state what they accept. Nothing is reported for a load no supply reaches (that's F2).

**F2. A distribution with loads and no source.** Warning when a distribution's conductors carry loads and no supply reaches them: *24DC feeds 14 parts and nothing supplies it.* The legacy rule stays quiet: a drawing with no Incoming supply part is fed by rails named CCT or 24V against 0V, as `sim.ts` has it.

**F1. Honest proofs.** A *never* rule is trivially true if its point can never be on. In `proveInterlocks` (`interlocks.ts`), first ask whether the interlocked point is reachable: one search for *point on*. If it never is, the result is a new value, `never-on`, shown amber as *never on: is it powered?*, in Design, To draw, Properties and Check. `Proofs.results` gains the value; `proofsFromSearch` does the same from a Check logic run. Test: the fixture with its power supply deleted gives `never-on` for every interlock and F2's warning.

### Step 3: interlocks

**T1. Several conditions.** The model already has it: `Interlock.when` is a list and `join` is `and` or `or`. `interlockExpectations` ignores `join` and writes one *never* per condition, which is `or`. Honour it:

- `or` or unset: one expectation per condition, as now (ids `x_<il>_<i>`).
- `and`: one expectation, *point on and every condition holds* (id `x_<il>_0`).

*Never enabled while the fire alarm isn't healthy, unless the override is on* is then *never on while fire alarm healthy off **and** override off*. In the interlock editor: add a condition, and an *all of / any of* switch when there are two or more. `describeInterlock` joins with *and* or *or* to match. This replaces step 8's judgement call (one condition per interlock) in `design-v0.4.md`; note it there.

**T11. Proving shows progress.** Prove one interlock at a time, yielding to the interface between them; each result appears as it lands; a Cancel button. Keep the search limit. No worker thread unless that turns out simpler.

### Step 4: panel wiring

**F7. A wire is field wiring only below the boundary.** Today a plant view is placed with `zone: "external"`, and on a sheet with no boundary it keeps it, so every wire to it is dashed and unnumbered (`isFieldWire`, `numberByDefault` in `wires.ts`; `updateZones`, `placePlantView` in `ops.ts`). The rule becomes:

- a part is external only when it sits below a sheet's boundary;
- on a sheet with no boundary, nothing is external, plant views included;
- `Segment.field` set by hand still wins.

So plant drawn above the boundary, or on a sheet without one, has solid, numbered wires. **This changes how old drawings look (accepted by the user):** a plant view on a boundary-less sheet turns from dashed to solid and shows its wire numbers. Note it under *Changed during build*.

**T3. Panel devices.** A plant item can be marked *In the panel* (`PlantItem.inPanel`). It's still plant (points, pins, a view), and:

- Design lists it under a fixed group, *Panel*, above the systems, not under the unnamed group;
- To draw counts it separately from field plant (*Panel: 2 of 3 drawn*);
- its view may only be placed above the boundary; Check warns if it's below;
- the points schedule leaves it out unless one of its points is on a channel;
- it's offered to the GA and the bill of materials like any panel part (it takes a size).

### Step 5: view text

**F4. Text under a plant view wraps.** In the plant view's `draw` (`symbols.ts`), the tag, description and information lines wrap to a width of *the box plus 1.5 units each side*, and never less than 12 units. Words break at spaces; a tag breaks only at a hyphen and only when it's wider than the limit by itself. Lines are centred under the box. The view's `bbox` grows with the lines, so the router and F6 see them. Width is measured with `textWidth` (`textwidth.ts`), not the character count the code uses now.

**F4, text size.** The description and information lines under a plant view are drawn at the detail size, 1.8 mm. They become 2.5 mm, the same as the tag (`TAG` in place of `DETAIL` for those lines). Pin ids and contact tables stay at 1.8 mm. Wrapping is measured at the new size.

**F4, group names.** A group's name over its terminals (*FIRE ALARM HEALTHY* over two pins) is drawn on one line today, and `plantViewLayout` pushes the next group along to make room, which is what makes views so wide. Instead the name wraps to its group's width plus one unit each side, and never to less than 8 units; the room under the boxes for group names (`PLANT.below`, `MODULE.groups`) grows with the tallest name. Groups then sit as close as their terminals allow, or where T2's span puts them.

**F5. A module view's title wraps.** The same rule for the title row (tag · module number and type · maker model · *part n of m*): wrap at the separators to the view's width, the heading band growing by a line each time. Two module views side by side never overprint.

### Step 6: movable labels

**T14. A part's labels move as one block.** `Element.labelAt?: Vec`, an offset from where the block is drawn today. The block is everything `tagAndLabel` draws for a part (tag, label, rating), and for a plant view its tag, description and information. In Draft the block has a drag handle when the part is selected; *Label back to its place* clears the offset. The coil's contact table keeps its own position as now. Templates and stamps carry the offset. The router's label obstacles move with it.

**T7. A hint, not a solver.** Check gains an info finding when a part's label block overlaps another part's body or label block: *K3's label overlaps K4.* Nothing moves by itself.

**T13. Wire labels slide.** `Segment.numberAt?: number` and `colourAt?: number`, each a fraction 0–1 along the wire's drawn length. Dragging a number or colour moves it along its own wire only; it can't leave the wire. Unset is today's place. A fraction survives re-routing. To show the number on a different wire of the same conductor, use *Show number* there, as now.

### Step 7a: a view spans a width

**T2.** A plant or module view gets `params.span`, a width in grid units. When set and wider than the view's natural width, the groups of terminals (the runs in `plantViewLayout`) are spread so the gaps between groups are equal and the first and last sit a margin in from the ends. Within a group the pitch stays 2. Unset is today's packing. In Draft: a handle on the view's right edge, a *Width* field in Properties, and *Fit to sheet* (the usable width from where it stands). Wires on its pins follow as pins move, re-routed like any moved part.

Test: an eight-channel module view at span 130 has channel groups at least 14 units apart; at no span it's unchanged from today, pin for pin.

### Step 7b: terminal groups on any side

**T15.** Built in two PRs.

1. **Whole view.** `params.side`: `top`, `bottom`, `left` or `right`. Default: plant `top`, module `bottom` (today). The terminal boxes sit along that edge; `terminalDir` follows; the text block (T14) sits on the opposite side by default, below for left and right. On left and right the terminals stack down the side at pitch 2 with their numbers reading across, and the box's height grows with them.
2. **Per group.** `params.sides`: a map from group name to side, overriding the view's. Groups on the same side keep their order. T2's span applies along top and bottom.

Acceptance: on the fixture, a field device's view below the boundary with terminals on top and a module above with terminals on the bottom route with no loops; a drive's view with power terminals on top and control terminals on the bottom has no wire crossing its body.

### Step 8: routing

**F6.** With steps 7a and 7b in, re-measure before changing the router. Then, in `routing.ts`:

- a terminal block is one obstacle across its cells, so nothing runs along its top or bottom edge except the stub into a cell;
- a view's pin row is treated the same way;
- a wire leaves a pin in the pin's direction for at least one unit before turning (`dirFlags`).

Acceptance, on the fixture's module and damper sheets: no route lies within one unit of a terminal block edge or a pin row for more than the stub's length; no wire passes under a view to reach a pin on its far side.

### Step 9a: connector block, socket, motors

**M9. Connector block** (symbol `connector-block`). Parameters: *Terminals* (2–12, default 2) and a label (*EARTH BLOCK*, *0V*, *SCREENS*). The box is one column wide and grows by a row for every two terminals: odd-numbered terminals enter at the top edge, even at the bottom, in line, so a conductor passes straight through. Two connection points on the border, centre left and centre right. Every point is one potential: one node in Simulate, one conductor for numbering. Designated as a terminal (X). On the GA its length follows its terminal count.

Decided: it grows taller, in pairs, and it can be rotated like any part, so turned a quarter it's a wide block with its terminals left and right. Its label and terminal numbers stay upright at every rotation.

**T17. Socket.** Redrawn: a solid box with three socket contacts side by side (each a cup open downwards), L, N and E entering from the top. L and N stay where they are today (0 and 3 units), E at 6. Label under the box. Old drawings: the E end of its wire moves from the side to the top; an auto route re-routes, a manual route has its last point moved and is flagged once in Check.

**M8. Motors.** The motor gains *Phases* (three: U V W, as now; single: L N) and *Picture* (motor, fan, pump). Picture changes the drawing only. Old motors are three-phase motors.

### Step 9b: symbols and door devices

**M1.** Decided: **no supply symbols.** A power supply, a battery and a DC UPS are plant, marked *In the panel* (T3), with their terminals named and their points set up by the user: a `supply-in`, and a `supply-out` that follows it and says what it gives (M11). The setup is done once and kept as a Design template. So a Design template must carry everything that makes such plant work: *In the panel*, each point's *gives* or *accepts*, what a `supply-out` follows, and its draw and rating (M12). Test: save the fixture's power supply as a Design template, insert it into an empty project, and it supplies 24 V in Simulate with nothing more set.

What M1 still adds:

| Part | Terminals | Notes |
|---|---|---|
| RCD | as the breaker it is | Not a new symbol: one more choice in the existing switch part's *Function* list (isolator, breaker, contactor…), *RCD*, which draws the residual current mark on it. Tagged and simulated as a breaker. |
| Connector | plug and socket pair, 1–12 ways | For flying leads. |

Field device marks: a plant item gets an optional *Mark* (temperature, pressure, humidity, ΔP switch, valve, damper, meter, power supply, battery) drawn small inside its view's box. The picture only; nothing depends on it.

**M5. Door devices with no schematic part.** In Layout, *Add device* places a device that isn't on any schematic: a name, a tag, a size and an optional cutout. It prints its tag and is on the bill of materials. For an operator screen and the like.

### Step 10a: module commons and tags

**M6. Commons linked inside a module.** `ModuleInfo.commons`: lists of pins joined inside the module. A module made from a pattern with a shared return gets one list with every such pin, and a tick in the module's settings, *Commons are linked inside the module*, on for new modules and off for modules in old files. When on:

- Simulate treats the pins as one node;
- the wiring check accepts a return that reaches any pin in the list;
- Check doesn't ask for a wire on each;
- the module view shows it: a thin link line under the joined pins. (Transparent: the drawing says they're common.)

Wire numbers aren't merged: each drawn wire keeps its own.

**T9. Module tags.** When the project has a controller map sheet, modules take their tags from their place on it; with no map, from their first view, as now.

Decided: the map wins when there is one.

### Step 10b: serial ports

**M7, T5.** A group of terminals on a module or plant can be marked a **serial port** (`PinInfo.port` on the group's pins; in the pattern editor, a tick on the group). A network gains `port: { plant, group }`.

- **Drawn:** when a network's port has wires on it, the network's devices and their order come from the drawing: follow the conductors from the port's pins to the next device's comms pins, and on from there. Design's network view shows the order as *from the drawing* and doesn't let it be dragged.
- **Not drawn:** as today, the order is set by hand in Design.
- **Check:** a device on the network in Design that the chain doesn't reach, and a device on the chain that isn't on the network.
- The network sheet prints the port's name at the controller end.

Ethernet and USB: no special handling. An ordinary pin named `ETH0`.

Two PRs: the port and the network's `port` field; then the chain from the drawing.

### Step 11: terminal strips

**T4.** Two parts.

- **Strips by section.** In the numbering settings: *Terminal strips: one (X1) / by section*. By section, each section's terminals take a strip of their own, X1, X2… in section order across the sheets; terminals outside any section stay on X1. A strip set by hand on a terminal wins.
- **A strip wraps on the GA.** A placed strip that's longer than its rail can be split: *Split here* on a terminal puts the rest on a second GA item, which can go on the next rail. Both print the strip's name and their range (*X1: 1–48*).

### Step 12: exports and fit

**T18. Cores per device.** The cable schedule gains a second table, one row per field device: tag, description, cores (its wired terminals, earth included), and the terminals. Exported as its own CSV.

**M10. Wire and core markers.** A CSV for a marker supplier, one marker per line, with an option to group duplicates into *text, count*. A marker always matches the terminal its wire goes into.

| What | Markers | Text |
|---|---|---|
| A panel wire | 2, one at each end | The number of the boundary terminal it lands on. With no boundary terminal on it, the wire's own number, which comes from where the wire starts. |
| A field core | 2, one at each end | Panel end: the number of the boundary terminal it goes into. Field end: what identifies the cable outside the panel: the device's tag. |

So a boundary terminal feeding plant accounts for four markers: two on the panel wire and two on the field core. The terminal's number, from the sheet and column it's placed at, is the authority.

No numbering change is needed: Renumber already gives a wire on a terminal that terminal's number (`renumber.ts`), so the wire's number on the sheet and its marker agree. The export reads the terminal's number directly, so a wire whose number was typed by hand still gets the terminal's. Check gains an info line when a wire's number differs from the boundary terminal it lands on.

A column says what each line is (*wire*, *core, panel end*, *core, field end*), so they can be ordered separately.

**T20. Enclosure fit.** Check warns when a GA item lies outside its enclosure (backplate) or its leaf (door). Arithmetic only.

**Test (bill of materials):** it lists only what's on a GA. Add a Check info line: *N schematic parts aren't on a layout sheet, so aren't on the bill of materials.*

### Step 13: stamping, Duplicate, label plates

**T6. Stamping keeps links out.** A contact in a template whose coil isn't in the template keeps pointing at that coil when stamped (a shared relay, such as a fire alarm relay, is the common case). Arrows are one to one, so a stamped arrow's link out is dropped as now. After a stamp, a short list shows the links kept and the arrows to re-link, each one a click to select.

**T8. Duplicate's step.** The Duplicate dialog gains *Step: the last number / the first number / leave tags blank*. Blank leaves them to Renumber.

**T12. Label plate text.** `GaItem.textAt`: one of nine places, top, middle or bottom by left, middle or right. Default middle middle, as now.

### Step 14: supply load

**M12.** Builds on M11.

- **Draw:** `va` on coils, timer coils and lamps (a parameter), on modules (`ModuleInfo.va`), on a plant `supply-in` point, and on a device library entry as the default for parts that use it. Set on the placed part, it overrides the library's.
- **Rating:** `ratingVa` on the Incoming supply, a transformer and a power supply; a power supply also has an efficiency (default 85%).
- **In Simulate:** beside each supply, *live* (what's energised now) and *worst case* (everything that supply can reach). A supply's total is passed up to what feeds it, divided by its efficiency. Sums are in VA; each figure is shown in amps at that supply's voltage. Over its rating, the figure is red.
- Parts with no draw count as zero, and one info line says how many.

### Step 15: wire colours and relay pins

**M3. Wire colour by function.** A project table, *function → colour*, empty to start: phase, neutral, earth, 24 V +, 0 V, DC signal, AC signal, external supply, and any the user adds. A conductor's function comes from its distribution when it's on one; otherwise it's set by hand on a wire (*Function* in Properties) and applies to the whole conductor. Colour from the table prints as today's colour codes do. No inference from the circuit in this sprint.

**M4. Relay pins from the part.** A device library entry (`devices.ts`) can carry a pin map: the coil's two terminals and, per pole, common, NC and NO. A coil whose device has one prints those numbers in place of A1/A2 and 11/12/14, on the coil, its contacts and its contact table. No map, IEC numbers as now.

**M2, cables as objects, is not being built.** Decided by the user: cabling is outside the panel and installers don't work from it. Cable types stay as notes on the sheet or in a plant item's information.

## 4. Decisions for the user

| # | Entry | Question | Answer |
|---|---|---|---|
| 1 | F7 | Old drawings: plant on a sheet with no boundary turns from dashed to solid wiring with numbers. Accept? | **Decided:** yes |
| 2 | M9 | Connector block grows taller in pairs, or wider in rows? | **Decided:** taller, and it rotates |
| 3 | T9 | Module tags from the controller map when there is one? | **Decided:** yes |
| 4 | M10 | Wire markers: how many, and what text? | **Decided:** two per panel wire and two per field core, one at each end; a marker matches the boundary terminal its wire goes into; a core's field end carries the cable's identity |
| 5 | M1 | Power supply, battery and UPS: symbols or plant? | **Decided:** all three are panel plant, set up once and kept as a Design template; no supply symbols |
| 6 | M2 | Cables as objects in this sprint, or after it? | **Decided:** not at all; it's outside the panel |

## 5. Changed during build

Judgement calls made while building, step by step.

**Step 0 (the fixture).**
- Twelve sheets: supply and 24 V; fire alarm interface and enables; drives and dampers; the extract damper's open relay; the controller (map, host with two serial ports, power supply module, the drives' bus daisy-chained through the boundary); one sheet each for DI-16, UIO-16, AO-8 and DO-8; the network diagram; the backplate GA; the door GA (one leaf).
- The enable is two relays deep: DO1 → *BMS enable* relay → (*fire alarm healthy* or *firemans override*) → *AHU-01 enable* relay, whose contacts enable both drives and open both dampers. The extract drive also waits for its damper's open relay.
- Dampers are 24 V spring return: *Open* follows *Power* after 5 s and *Closed* follows it off, so proofs have something to follow. A drive's *Run* follows its *Enable*.
- The supply drive's interlock (*never on while fire alarm healthy off*) fails, as the real design's override bypasses it: that's T1's "before". The extract drive's (*never on while its damper's open off*) is proved.
- The host's serial ports are pin groups *COM A* and *COM B* with no points; the UIO channels taking sensors are set to analogue.

**Step 1 (small fixes).**
- F3: comms-only plant (`onNetworkOnly`: connects by comms, no point with pins) is in `toDraw().network`, not the field plant, and Check's *not drawn yet* skips it. To draw shows it under *On the network* with its network ticked, or amber *not on a network*; *Show* opens Design's Network view. It no longer counts in To draw's *left of* total.
- F8: `BLOCK_HALF` is 2 (cells 4 units tall), so five characters fit without growing. **This changes how old drawings look:** every terminal block is a unit taller, and a wire's end on a cell moves from half a unit to a whole unit off the boundary. `fitBlock` now also runs after Renumber (every sheet), when a terminal is edited (`updateElement`) and after a stamp.
- T10: `fitScale` picks from `STANDARD_SCALES` (1, 2, 2.5, 5, 10, 20, 25, 50); past 1:50 it rounds up to a multiple of 50. A 1000 × 1600 enclosure is 1:20 (it was 1:10.5). No 2:1: detail frames fitted with *Fit* are 1:1 at the largest. Sheets keep the scale they have.
- T16: the number is `slotAddress` (the map's circle: the bus address if set, else rail order), after the tag: *A9-5 · Module 6 · DO-8 · Generic DO-8X · part of …*. Continuation views say it too.
- T19: `stampSaved` (storage) writes `savedBy` after `format` and `version` on every save and on *Download*; `parseProject` reads it only for the newer-file message. `VERSION` and `RELEASES_URL` moved to `src/core/version.ts`.

**Step 1b, first PR (modular doors).**
- `GaSettings.columns` and `pane` as planned. `doorColumns` sizes them to fit (last column and last door in each take what's left); leaves read as columns of one door, so every door view goes through `doorPanes` / `sheetPanes`. A door front only gets `columns` when it's more than one plain door: setting it back to one unnamed door clears them (and keeps a right hinge as a one-leaf `leaves`).
- `gaFrame` gains `y0`, for a sheet showing one door lower down; `gaToSheet`, `sheetToGa`, the canvas and the layer all take it.
- Dimensions: on a sheet showing one door (or one leaf), *the enclosure*'s edges are that door's own edges (`dimFrame`). On any door view each door's edges are snap targets too, as `@pane:col:row`, so a dimension can run from the door an item is on. This also changes old leaf sheets: there the enclosure's start was the whole door's left edge, off the sheet for the right leaf; now it's the leaf's.
- *Split this door* is a button per door in Sheet settings, splitting at the door's middle (sizes are then typed), not at the pointer. ⇕ splits it into two stacked doors; ⇔ splits its **column** into two side by side (columns are full height, so a door can't be split down on its own). *Join ↓* joins it with the one below; sheets showing a door further down the column move up with it.
- Choosing *Columns of doors…* on a plain door splits it into two stacked doors to start from.
- Each door is drawn with its own swing lines, hinge marks and joint lines; its name, if it has one, at its top left at the detail size. Hinge marks sit at a quarter and three quarters of a door 300 mm or shorter.
- Check: *a device lies across two doors (C1 R1, Controls)* when an item on a modular door front overlaps two.

**Step 1b, second PR (a backplate behind each door).**
- `GaSettings.behind` is `{ sheet, pane }`, with `pane` null once its door is joined to another or gone (its column removed, or the door front set back to plain): the sheet stays an ordinary backplate and keeps everything on it, and Check gives an info line until a door is picked again or *Behind* is cleared. Splitting a door moves the plates of the doors after it with them (the split door's plate stays with its top or left half).
- *Add a backplate for each door* (door front, Sheet settings) makes the sheets after the last GA sheet, in column then row order, each at its door's size less 25 mm all round, scale fitted, titled *Backplate:* and the door's name (or *C2 R1*). The margin isn't asked for each time: the size is then the user's, and *Size from its door* puts it back.
- A backplate's Sheet settings have *Behind*: the whole panel, or any door of any door front.
- The door front prints *BACKPLATE: SHEET n* small at each door's bottom left; the plate's title reads *BACKPLATE BEHIND Controls, DOOR ON SHEET 1*.
- Check: an info line when a plate is larger than its door.

**Step 2 (supplies).**
- M11: `SupplyType` on plant points (`gives`, `accepts`), typed in Design's point Properties; on parts it's a text param, `gives` on the Incoming supply and the transformer and `accepts` (*Takes*) on coils, timer coils and lamps, parsed by `parseSupply` / `parseSupplies` (*24 V AC, 24 V DC* or *24 V AC/DC*). A controller's power supply module takes through its supply-in point's `accepts` (set in data; there's no field for it in the controller window yet).
- M11's check runs over what `compile` traces with every switch closed: a load is fed by a supply when either end shares a node with one of the supply's phases. A plant supply out's name in the message is its point's (*PSU-01 24V out*).
- The info line counting loads that don't say what they take only appears once something in the project says what it gives or takes, so drawings that don't use it aren't told about every coil.
- F2: a distribution's conductors are those on its busbars, rails and arrows; it's supplied when a supply's phase or return shares a node with them. A plant supply out's `dists` join it to its distributions even with no view drawn, so the fixture's F2 test deletes the power supply plant, not its view.
- F1: `neverOn` is one search for the interlocked point being on, run before each interlock's own search (and after a Check logic run, for each interlock that came out proved). An unknown (too many sequences) isn't never on. `never-on` is amber in To draw and Properties and a warning in Check.

**Step 3 (interlocks).**
- T1: up to six conditions (`MAX_CONDITIONS`); `addInterlockCondition`, `removeInterlockCondition`, and `updateInterlock` with `at` (which condition) and `join`. A second condition starts as *any of* (`or`), which is what two interlocks were. The *all of / any of* switch shows from two conditions. `parseConditions` keeps up to six for interlocks (still two for a point's *follows*). The fixture's supply drive interlock is now *never on while fire alarm healthy off and override off*, and is proved; the step 8 judgement call in `design-v0.4.md` is marked replaced.
- T11: `provingJob` gives a step per interlock, run by `editor.proveInterlocks`, which yields 20 ms between them, merges each result into `editor.proofs` as it lands and shows *Proving 2 of 4…* with Cancel (stops after the one running) in Properties and To draw. `proveInterlocks` runs the same steps in one go. No worker.

**Step 4 (panel wiring and panel devices).**
- F7: `updateZones` makes everything internal on a sheet with no boundary, plant views included, and `placePlantView` places a view as internal and lets `updateZones` decide. `parseProject` sets every element on a boundary-less sheet internal, so old files open with those plant views solid and numbered (accepted, decision 1). Below a boundary nothing changes; `Segment.field` set by hand still wins.
- T3: `PlantItem.inPanel`, *In the panel* in Design's Properties. `systemGroups` puts panel devices in a fixed first group, *Panel* (`panel: true`), whatever their system; the table shows it as a group header that can't be renamed or picked. `toDraw().panel` counts them apart (*Panel: 2 of 3 drawn*). Placing a view below the boundary is refused, marking plant that's drawn below as in the panel is refused, and Check warns about one moved below. The points schedule leaves one out unless a point of it is on a channel.
- T3 on the GA: a panel device is offered in *Place parts…* once drawn, one item each, placed the way a controller's modules are (`GaItem.module` names the plant item), at a generic *Panel device* size (50 × 90 mm, editable in *Generic sizes…*). The bill of materials lists it by that size's name until a device is picked.
- The fixture's power supply and battery are now in the panel, so sheet 1's wiring is solid and numbered.

**Step 5 (view text).**
- F4: the plant view's tag, description and information lines are centred and wrapped to `max(box + 3, 12)` units, measured with `textWidth` at 2.5 mm (the description and information lines moved from 1.8 mm to the tag size). The tag is measured from the drawn tag (`GeometryText.tag`): when it fits it stays the `{tag}` field; when it doesn't, `wrapTag` breaks it after hyphens into literal lines. The old left-aligned layout for text wider than the box is gone: everything under a view is centred.
- F4, group names: `plantViewLayout` wraps each group's name to `max(span + 2, 8)` and packs groups by the wrapped width; the band under the boxes grows with the tallest name (half-unit steps). A module's channel names wrap the same way at their own size, its band growing with them.
- F5: `wrapTitle` breaks the module title row after its ` · ` separators to the view's width; extra lines go upwards, so the box and its terminals stay where they are.
- README screenshots weren't retaken: the drawings in them change only where text was long enough to wrap.

**Step 6 (movable labels).**
- T14: `Element.labelAt`, applied in `localGeometry` to every text prim of the label block: role `tag` or `label`, or marked `block` (the `{xref}` under a contact's tag, ratings, a plant view's lines under its box). A module view's title row is role `tag`, so it moves too. Offsets snap to half units. In Draft the selected part's block shows a dashed outline; dragging inside it moves the block (a dashed preview while dragging); *Label back to its place* in Properties clears it. Templates and stamps copy elements whole, so they carry the offset; the router's text obstacles come from `localGeometry`, so they move with it.
- `labelBlockRect` measures text with `textBounds` (font widths, cap height): `primBounds` leaves text out of hit areas, as before. A plant view's lines under its box are now part of its bounding box (F4 said they should be), so they count for the drawing area: two LSP-01 sheets had plant views low enough that their wrapped text ran off the bottom, and those views are placed 2 units higher.
- T7: `labelOverlaps` (info): a label block over another part's body or label block, rails, terminals and annotations not counting as bodies. The LSP-01 benchmark's sheets 8 and 9 get such hints; its "checks are clean" test lets them through.
- T13: `Segment.numberAt` / `colourAt` (0–1), set by dragging the text (`data-wiretext` on the printed text) and `setWireTextAt`; `wireTexts` places a slid part centred at that fraction of the drawn length, on whichever leg it falls, the rest as usual. The colour carries its function with it. *Number and colour back to their place* in a wire's Properties.

**Step 7a (a view's width).**
- T2: `params.span` on a plant or module view, read by `plantViewLayout` (so `moduleViewLayout` too): wider than its natural width, the runs of terminals are spread with equal gaps between their extents (each run as wide as its terminals or its wrapped group name), the first and last 0.5 unit plus half a pitch in from the ends, as at its natural width, and each run's first pin on a whole unit. Unset (or narrower than it needs) it's packed as before, pin for pin.
- Setting it: a handle at the middle of the selected view's right edge (a dashed line shows the edge while dragging); *Width* and *Fit to sheet* in Properties (`setViewSpan`, which stores nothing when the width asked for is no wider than natural). *Fit to sheet* is the usable width from the view's left edge to 2 units short of the drawing area's right edge.
- Wires follow the pins like any change to the part: the editor re-routes the sheet after the change.
- `span` isn't one of the keys cleared from parts that aren't plant views: the cable screen part has a parameter of the same name.

**Step 7b, first PR (a whole view on a side).**
- T15: `params.side` (top, bottom, left, right; unset is the usual side, plant top, module bottom). A view on its usual side is drawn by the old code, pin for pin; one that isn't goes through a new layout, `sideViewLayout` / `drawSideView`, which places every group by its side (so the per-group setting of the second PR is the same code). In that layout the view's origin is the box's top-left corner, so a view jumps when its side is first changed; its wires follow its pins.
- Along the top and bottom, terminals are boxes 2 apart with numbers reading up, group names inside; down the left and right they stack 2 apart, numbers reading across in boxes as wide as the longest, ids beside them, group names beyond. The box is as wide and tall as its sides need. A module's heading sits inside the top unless terminals are there; its jobs run out along each point's first wire.
- The text block (a plant view's tag and lines, a module's title row) is opposite the view's side, below for left and right. A break mark for a view showing only some terminals isn't drawn in this layout.
- *Terminals on* in a view's Properties (`setViewSide`). T2's width applies along the top and bottom.

**Step 7b, second PR (sides per group).**
- `params.sides`: a JSON map from group name (the pin's group, else its point) to side, set from *Groups* in a view's Properties (`setGroupSide`); a group on the view's own side isn't stored. Groups on the same side keep their order; each side's groups are centred along it, or spread along the top and bottom when the view has a width (T2). The box is as wide as its widest top or bottom run, or its left and right depths with 4 units between, and as tall as its tallest side run, or its top and bottom depths.
- Acceptance as written: on the fixture's controller sheets every route is loop-free; a drive with its mains on top and its control on the bottom, wired up to a breaker and down to the boundary, has no wire crossing its body.

**Step 8 (routing).**
- Re-measured after 7a and 7b, before changing the router: on the fixture's controller, drives and damper sheets, wires still ran along the terminal block's edge (14 units on the DI sheet alone) and along pin rows.
- F6: the terminal block is one obstacle (`blockRect`), its whole drawn length, out past its cells to just short of the stub (`ROW_CLEAR`, 0.7, so with the router's 0.25 buffer a wire keeps 0.95 off and only the 1-unit stub crosses). Its cells are no longer obstacles one by one. A plant or module view's obstacle is pushed out the same distance on every side that has pins, in place of being pulled in.
- The repair pass (`judge`) leaves each route's stubs out when checking it against obstacles (`lessStubs`), since a stub is meant to cross that clearance.
- Wires already left a pin in its direction for a unit (`stubPoint`, `dirFlags`); unchanged.

**Step 9a (connector block, socket, motors).**
- M9, reading decision 2 (*taller, and it rotates*) with the list's *a conductor passes through in line* and *two connection points on the border*: upright, `connector-block` is a column 4 units wide, a row 2 units tall for each pair, the odd terminal of a row entering on the left and the even one leaving on the right, in line. Its border points, E1 and E2, are at the middle of its top and bottom. Turned a quarter, it's the wide block the list describes: terminals along its top and bottom (in line with L and N above it), E1 and E2 at its ends. Its numbers, tag and label are placed for each rotation and stay upright.
- M9: every terminal and E1, E2 are one conductor (`bridged`), so one node in Simulate and one number; designated X (kind `terminal`), but not a cell of the terminal block or a strip. On the GA it's *Connector block, per 2 terminals* (6 × 45 mm per pair).
- T17: the socket is a 9 × 3 box with three cups open downwards at 0, 3 and 6, each terminal entering from the top 4 units up; its tag beside it, its label under it. A socket from an older file (no `etop`) gets `etop` when opened; if its earth wire was routed by hand, `eMoved` is set and Check says so (info) until that wire is re-routed (*Reset route* or dragged). An automatic route simply re-routes.
- M8: `phases` (three: U V W; single: L N, 1.5 either side of centre, 3 apart) and `picture` (motor: M with 3~ or 1~; fan: two blades; pump: the pump's triangle). Old motors are three-phase motors.

**Step 9b (symbols and door devices).**
- M1, supplies as plant: nothing needed adding to a Design template for a power supply to work in another project: it already carries `inPanel`, each point's `gives` / `accepts`, `follows` (remapped to the copy) and `delay`. Inserting now drops a supply out's `dists` that name distributions the project doesn't have. Draw and rating (M12) will ride along the same way. Tested: the fixture's power supply saved as a template, inserted into an empty project and wired from an incoming supply to a lamp lights it, with nothing else set.
- M1, RCD: `function: "rcd"` on the switch part: the breaker's crosses and a residual current core (a thin ellipse round the poles' leads below the contacts, dashed to the operating line). Kind `breaker`, so tagged F, sized as an MCB, simulated as a breaker. An *RCD socket* is this part feeding a socket.
- M1, connector: `plug-socket`, *Ways* 1–12, pitch 3 like poles; each way a socket contact (`S1`…, in from above) and a plug pin (`P1`…, out below), joined (`bridged`) per way. Tagged X. On the GA a generic *Connector (plug and socket)* size.
- M1, screened cable with its screen earthed: already a part (*Cable screen*, v0.2.1), so nothing new.
- M1, marks: `PlantItem.mark` (the nine in the plan), set in Design's Properties, passed to views as `pmark` and drawn inside the view's box at its right end, which grows 3.4 units to make room. Drawn on views in their usual layout; a view with terminals on chosen sides (T15) doesn't draw its mark yet.
- M5: the Layout tool *Device (no schematic part)* places a `device` GA item with no `refs` (`addGaDevice`): its name is `text`, its tag `GaItem.tag` (printed on it), its size and optional cut-out. The bill of materials lists it by name with its tag.

**Step 10a (module commons and tags).**
- M6: `ModuleInfo.commons` (lists of pins), one list of the module's shared pins (`sharedPins`: pins in more than one point, which is what a pattern's shared return makes). `addModule` sets it for a new module with shared pins; `generateModule` keeps it in step with new pins; a module from an older file has none (off). The tick is *Commons linked* on the module's row in the controller window (`setModuleCommons`), shown only when the module has shared pins.
- M6 in Simulate: fixed links between the listed pins' nodes; in the wiring check (`Nets`): the pins are one net, so a return or a via-relay trace through any of them counts. Check never asked for a wire on each common (the *isn't wired* check already looks at a point's own pins only), so nothing changed there. Each drawn wire keeps its own number.
- M6 on the view: a thin line 0.6 under the joined pins with a dot on each, inside the band F6 keeps clear of wires, so only wire stubs cross it. Drawn in the usual module layout; a module view on another side (T15) doesn't draw it yet.
- T9: Renumber gives each module of a controller with a map (`ctrlmap`, the controller named on it or the first) the address of its box's middle on the map (`controllerMapSlots`), in place of its first view's. Without a map, from the first view, as before. The fixture's modules are now A5-*.

**Step 10b, first PR (the port).**
- M7: `PinInfo.port` on each pin of the group (`setGroupPort`); the tick is *Serial ports* in a plant's or module's pins window (the same window serves both, so it's the pattern editor's tick the plan names). Only a pin with a group can carry it.
- T5: `Network.port = { plant, group }`, set from *Port* in Design's network view, which lists every device's groups marked as ports (`portGroups`); the field isn't limited to the controller, since a LAN's switch or a gateway can be the head end. Unticking a port clears it from any network on it.
- The network sheet prints the port's name before the network's at the controller end (*COM A: Drives bus · Modbus RTU · 2 devices*).
- The fixture's host has COM A and COM B ports, its drives' Modbus groups are ports, and its two buses name their ports.

**Step 10b, second PR (the chain from the drawing).**
- `networkChain`: from the port's pins, along wires, bridged terminals (and other bridged parts), arrows on pins and linked arrows, and plant views to their device's pins, the same joins as conductors. Busbars don't carry it, as they don't carry a conductor. A device counts when it's reached at a pin of one of its own serial ports; its port's pins then lead on to the next. A pin that isn't a serial port ends the trail, so a shared 0 V or GND doesn't pull in everything on it, and a device whose comms pins aren't marked isn't reached. A module isn't a network device and ends the trail too.
- Order: by the number of devices the conductors pass through to reach it, then path length, then row order (so devices wired in a star from one terminal keep their row order).
- *Drawn* means a wire on one of the port's pins on a plant view of its device. Then the network sheet and Design's network view use the chain: its devices, in its order. A device on the chain but not on the network in Design is drawn on the sheet too (and is no longer counted as loose); a device on the network in Design that the chain doesn't reach isn't drawn. In the view the order says *from the drawing*, ↑ ↓ are gone (and `moveOnNetwork` refuses), a chained device not on the network has a + to put it on, and the unreached ones are listed below with ×.
- Not drawn: as before, Design's order, moved with ↑ ↓.
- Check (warnings, in Design's checks): *X is on Drives bus in Design, but the wiring from COM A doesn't reach it (at a pin of a serial port)*; *X is wired on Drives bus from COM A, but isn't on it in Design*.
- On the fixture: the drives bus is wired COM A → boundary terminals → supply drive → extract drive, so its order is from the drawing; the meters bus has no wires and keeps Design's order.

**Step 11 (terminal strips).**
- Strips by section: `numbering.strips: "section"` (*Terminal strips* in the project's numbering settings), applied at Renumber (`stripsBySection`). Sections are ordered by sheet, then left edge, then top. A terminal below every section, in the panel boundary's block, belongs to the nearest section above it across its width: that's where the block sits on a sheet with sections (the fixture's sections all stop above the boundary). Sections with the same name share one strip, so a section carried on to the next sheet stays one strip. Only sections with terminals take a name.
- Every terminal carries `strip: "X1"` from its defaults, so X1 counts as not set by hand. Any other strip set in Properties or by a strip line wins, and its name is skipped when sections are named. A terminal whose strip Renumber gave is marked `stripAuto`; setting the strip by hand clears that. A locked terminal keeps its strip. Back to *one*, Renumber puts the `stripAuto` terminals back on X1.
- Terminals outside every section stay on X1; when there are any, the first section takes X2.
- Split on the GA: *Split here* in a placed strip's Properties (`splitGaStrip`). That terminal and the rest go on a new item, placed on the next horizontal rail down from its left end, or beside an upright strip. Each part's length follows its terminals unless a real device sets it.
- Parts keep up with the schematic: each part runs from the first of its terminals still on the strip to the next part's start (`syncGaStrips`). Deleting a part gives its terminals back to the part before, which is how to join a strip again.
- A strip in parts prints *X1: first–last* on each part (`stripLabel`); one part still prints *X1*. The bill of materials counts the parts together.
