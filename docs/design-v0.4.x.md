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
| 2 | M11, F2, F1 | What a supply gives; unpowered distributions; honest proofs | Medium |
| 3 | T1, T11 | Interlocks with several conditions; proving shows progress | Small |
| 4 | F7, T3 | Panel wiring and panel devices | Medium |
| 5 | F4, F5 | View text wraps | Small |
| 6 | T14, T7, T13 | Labels and wire labels can be moved | Medium |
| 7a | T2 | A view spans a chosen width | Medium |
| 7b | T15 | Terminal groups on any side | Large |
| 8 | F6 | Routing clear of strips and pin rows | Medium |
| 9a | M9, T17, M8 | Connector block, socket, motors | Medium |
| 9b | M1, M5 | Remaining symbols; door devices | Medium |
| 10a | M6, T9 | Module commons; module tags | Small |
| 10b | M7, T5 | Serial ports build their network | Large |
| 11 | T4 | Terminal strips by section | Medium |
| 12 | T18, M10, T20 | Cable cores, wire markers, enclosure fit | Small |
| 13 | T6, T8, T12 | Stamp links, Duplicate's step, label plate text | Small |
| 14 | M12 | Supply load in Simulate | Medium |
| 15a | M3, M4 | Wire colour by function; relay pins from the part | Medium |
| 15b | M2 | Cables as objects | Large |

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

**M1.** New symbols, each plain and parameter-light:

| Symbol | Terminals | Notes |
|---|---|---|
| Power supply | L N E in; + − out | A source for Simulate: its output *gives* (M11) and follows its input. Rating text. |
| Battery | + − | A source, always on. |
| RCD | as the two-pole breaker | A *function* of the existing isolator part, with the RCD mark. |
| Resistor | 1 2 | Value as its label (120 Ω). A closed link in Simulate. |
| Connector | plug and socket pair, 1–12 ways | For flying leads. |

A DC UPS is a panel device (T3) with points, not a symbol: too many variants. Field device marks: a plant item gets an optional *Mark* (temperature, pressure, humidity, ΔP switch, valve, damper, meter) drawn small inside its view's box.

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
| A field core | 2, one at each end | Panel end: the number of the boundary terminal it goes into. Field end: what identifies the cable outside the panel: the device's tag, or the cable's own tag once cables are objects (M2). |

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

### Step 15a: wire colours and relay pins

**M3. Wire colour by function.** A project table, *function → colour*, empty to start: phase, neutral, earth, 24 V +, 0 V, DC signal, AC signal, external supply, and any the user adds. A conductor's function comes from its distribution when it's on one; otherwise it's set by hand on a wire (*Function* in Properties) and applies to the whole conductor. Colour from the table prints as today's colour codes do. No inference from the circuit in this sprint.

**M4. Relay pins from the part.** A device library entry (`devices.ts`) can carry a pin map: the coil's two terminals and, per pole, common, NC and NO. A coil whose device has one prints those numbers in place of A1/A2 and 11/12/14, on the coil, its contacts and its contact table. No map, IEC numbers as now.

### Step 15b: cables

**M2.** A cable is an object: tag (W1), type, cores, screened or not. Field wires are put on a cable by selecting them and choosing *Cable…*; a cable mark is drawn across them with its tag and type. The cable schedule lists cables with their cores used and spare; devices with no cable fall back to T18's row. The existing *Cable screen* symbol attaches to a cable.

This is the largest entry and the least specified. Before it starts, write its design up in this section and stop for the user.

## 4. Decisions for the user

| # | Entry | Question | Answer |
|---|---|---|---|
| 1 | F7 | Old drawings: plant on a sheet with no boundary turns from dashed to solid wiring with numbers. Accept? | **Decided:** yes |
| 2 | M9 | Connector block grows taller in pairs, or wider in rows? | **Decided:** taller, and it rotates |
| 3 | T9 | Module tags from the controller map when there is one? | **Decided:** yes |
| 4 | M10 | Wire markers: how many, and what text? | **Decided:** two per panel wire and two per field core, one at each end; a marker matches the boundary terminal its wire goes into; a core's field end carries the cable's identity |
| 5 | M1 | DC UPS as a panel device with points, not a symbol? | Open. Recommended: yes |
| 6 | M2 | Cables as objects in this sprint, or after it? | Open. Recommended: after the rest, with its own design |

## 5. Changed during build

*(Empty. Judgement calls made while building go here, step by step.)*
