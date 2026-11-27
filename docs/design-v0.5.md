# Ferrule v0.5: the sprint plan

The plan for building v0.5 from everything prepared in this folder. Written 27 Nov 2026, against `main` at build 0.4.5.

`advancements-v0.5.md` says **what** is wanted and why: 68 entries, A1 to A75 less the seven withdrawn. Three design notes hold the design of the large ones. This document says **in what order** they're built, what each step has to know, and what has to be true when it's done. Where this plan and the list disagree on what's wanted, the list wins and this plan is corrected. Where an entry and its design note disagree, the design note wins.

## 1. What to read

| File | What it is | Read it for |
|---|---|---|
| `advancements-v0.5.md` | The list: every entry, the checks, and what was decided against | Every step |
| `functional-specification.md` | What build 0.4.5 does, as numbered statements. What v0.5 changes is crossed through with its entry | Every step: it's rewritten as the build goes |
| `design-wire-numbering.md` | A wire on a supply carries the supply's number; distribution blocks; power rails | Step 6 (A23) |
| `design-wire-labels-and-links.md` | One label for a wire; link ends in place of the link arrow; markers | Step 7 (A26, A27, A28) |
| `design-design-workbench.md` | The Design workbench reworked: Properties, the Terminals window, adapter modules, devices | Step 8 (A38, A66 to A70) |
| `mockups\` | Pictures for the three notes | With the note that names them |

The four changes that reach furthest, so they're known from the start:

1. **Parts merge** (step 4): one Contact, one Coil, a reworked Selector. Symbol names change, and everything that reads them.
2. **Wires** (steps 6 and 7): numbers by supply, one label, link ends in place of the link arrow part.
3. **Design** (step 8): what Properties shows, a Terminals window, the Controller… window gone, and devices picked in Design in place of Layout.
4. **Files and builds** (steps 0, 2, 10, 11): no backwards compatibility, builds published when asked for, the project list's new buttons, a central Ferrule.

## 2. Ground rules

- **No backwards compatibility** (A30, built first). A step that changes what a file must hold moves the file format number on, and that's all it owes old files. The examples (`lsp01`, `bms01`) are rebuilt by their scripts whenever a step needs it.
- **Build from the design note where the entry says so.** A23, A26, A27, A38 and A66 to A70 are pointers on the list; the note has the design.
- **A mock-up shows what's where and how it's worded.** It isn't a style guide: use Ferrule's own parts, spacing and look.
- **One place for each thing.** If building an entry leaves a value that can be set in two places, or a button that does what another already does, that's a fault in the step. Note it under §6 and take the second one out.
- **Nothing is built in.** New parts are parts like any other; new settings start empty or as today.
- **The specification moves with the code.** In the PR that builds an entry, each statement it changes is rewritten to say what the build now does, keeping its ID, and the strike-through and its *(v0.5: …)* note come off. A new behaviour gets a new ID at the end of its section. When the sprint ends nothing is left crossed through.
- **Not to be built from:** the *Checks* section of the list, *Decided: nothing to build*, and the withdrawn entries (A2, A6, A7, A15, A44, A62, A63).
- **Each step ends with:** tests for its rules; a look at the result on the fixtures (print pictures or the browser); the README and the decisions table in `docs/DESIGN.md` brought up to date; its entries ticked on the list with the PR number; the version moved on by one for each PR; and the documents synced back to this folder.
- **Builds are made when asked for,** not after each PR (A22). Until step 2 is in, a build that's asked for is made and sent as before.
- **Judgement calls** go under §6, *Changed during build*. A point in §5 that hasn't been answered when its step starts is built to the recommended answer, and the PR says so.

## 3. Order of work

Groundwork first; then the small and safe; then parts, since the legend, the wires and Design all lean on them; then wires; then Design, the largest; then Layout, files and running.

| Step | Entries | What | Size |
|---|---|---|---|
| 0 | A30, A3, A18, A19, A20 | Start: version, documents in, the old-files rule dropped, document corrections | Small |
| 1 | A4, A13, A14, A25, A40, A45, A47, A49, A53, A54, A59, A61, A74 | Small fixes | Small, one or two PRs |
| 2 | A22, A11 | Builds published when asked for, Windows and Linux | Medium |
| 3 | A32, A64, A73, A34, A35, A33 | Windows and prompts, row two, sheets | Medium, two PRs |
| 4a | A36, A37, A39 | One Contact, one Coil, rotate off parts in a drop | Large |
| 4b | A41, A42, A43, A46 | The Selector | Medium |
| 4c | A48, A56, A55, A24 | Connector block, motor, the legend, colour through a relay output | Medium |
| 5 | A50, A51, A52, A1 | Project settings: numbering, strips, wire colours, the title block | Medium |
| 6 | A23, A57 | Wire numbers by supply; supplies joined only by wires | Large, three PRs |
| 7a | A26, A29 | One label for a wire; text that turns | Medium |
| 7b | A27 | Link ends | Large |
| 7c | A28 | Markers counted per connection | Small |
| 8a | A69 | Design: the Plant view and what Properties shows | Large |
| 8b | A67 | The Terminals window; the Controller… window goes | Large |
| 8c | A68, A66 | Adapter modules; plant marks | Medium |
| 8d | A70, A38, A31, A72 | Devices picked in Design; the device holds what a thing takes, gives and draws | Large, two PRs |
| 8e | A65, A75 | A new network asks its kind; interlocks proved on entering Simulate | Small |
| 9 | A58, A60, A71 | Layout: backplate sizing, Fit, the bill of materials table | Medium |
| 10a | A17, A8 | A project is made from a file name; no second by the same name | Medium |
| 10b | A21, A16, A9 | Rename, deleted projects, Upload | Medium |
| 10c | A12 | Rolling backups | Medium |
| 11 | A5, A10 | One Ferrule at a time; Claude on a central Ferrule | Medium |
| 12 | none | Close: the specification clean, README and pictures, the report | Small |

## 4. The steps

File and line pointers are from `main` at 0.4.5 and are there to save a search. Check them before leaning on them.

### Step 0: start

- **Version.** The first PR under 0.5 is `0.5.1`; every PR after moves the last number on.
- **Documents in.** Copy from `C:\Temp\eCAD\v0.5.0-pre Notes\` into `docs\` under the same names: this plan, the list, the specification and the three design notes. Copy `mockups\` to `docs\mockups\`, **leaving out the two `numbering-sheet8-` pictures**, which hold a real project's title block and never go in the repo. The notes name pictures as `mockups\…`, so that still reads true.
- **`CLAUDE.md`** is rewritten for this sprint: the plan and the list it works from; the old-files rule and the test-build file mapping gone; a build made and sent after each PR replaced by builds when asked for; the sync after each PR pointed at this folder.
- **A30.** `src/core/validate.ts` holds the format number and the messages. An older file isn't opened and says which Ferrule it needs. `preRelease()` goes.
- **A3, A18, A19, A20** are corrections to the README and `docs/DESIGN.md`.

### Step 1: small fixes

Thirteen entries with nothing between them. Each is as its entry says.

- A45: `remove()` in `src/server/storage.ts` moves the file and leaves its `.bak`.
- A74: `duplicatePlant()` in `src/core/design.ts` clones the description.
- A49: *Add revision* already dates itself (`ProjectDialog.svelte`). What's left is the new project's *Drawn date* and revision A.
- A25: where a colour is carried through a part is in `src/core/wirecolours.ts`.
- A53: `Esc` during a window drag has to cancel the drag before anything closes.
- A59 closes *Place parts…* off a GA sheet. Making it dock is step 3.

### Step 2: builds

- **A11** adds a Linux job to CI and tests the result end to end. **A22** publishes builds to the repo's releases page, each marked pre-release, and only when asked for (§5, D5).
- The README's download link is §5, D4.
- From here a build is asked for by name and nothing is sent at the end of a chat.

### Step 3: windows, row two, sheets

- **A32.** Windows and most prompts are already one part: `Modal.svelte` with `docking.svelte.ts`, which lets eight dock, picked by name. The change is to which may dock, by the test in the entry. Properties and the Simulation panel are `FloatBox` and never dock; help is a window and docks, as the list has it (corrected 27 Nov 2026: this line first had help among the panels). *Device table…* and *Pins and points…* go in step 8, so don't make them dock here; the Terminals window docks when it's built.
- **A64** makes docking edge-only. **A73** stops window places being kept: they're in the browser's storage today, from `Modal.svelte` and `FloatBox.svelte`. Settings stay kept (`settings.svelte.ts`).
- **A34.** Row two is laid out in `EditorView.svelte`. The order of the groups is in the entry; the order of the shared menus is §5, D8. Design's row changes again in step 8.
- **A35 and A33** go together: which workbench is greyed out on which sheet, and a GA sheet made from the add menu. Before building A33, reproduce on the build what a GA sheet's settings do when *Detail* is chosen, so the right thing is fixed. §5, D7 settles Layout on a schematic sheet.

### Step 4a: one Contact, one Coil

The widest ripple of the sprint. Three contact parts become one and two coil parts become one, so their symbol names change, and with them everything that asks what a part is: linking a contact to its coil, cross-references and contact tables, the simulator, the checks, the schedules, the legend, Claude's tools, and both example scripts. The file format number moves on.

- A contact's kind is a setting, as a push button's poles are. A coil's *Type* is Relay, Contactor or Timer.
- *Takes* and *Draw (VA)* are still on the coil after this step. They come off in step 8d (A38).
- **A39** takes Rotate off the parts named in its entry. The parts it doesn't name are §5, D9.

### Step 4b: the Selector

Four entries on one part, built together: the pole choices fit the positions (A41); each pole is drawn in Simulate from the positions it's set to (A42); changeover is a setting of the whole switch (A43); the part is named Selector and gains 4 positions (A46).

- `selectorPoles` in `src/core/symbols.ts` holds the choices. `src/core/sim.ts`, near line 199, treats the whole switch as operated whenever it's off 0, and the drawing takes every pole from that.
- A43 has two more parts that outlast the selector fix: the wire tool must not fail on a repeated terminal number (`Canvas.svelte` keys its terminal dots by name), and Check reports any part with two terminals of one number.

### Step 4c: connector block, motor, legend, colour

- A55 comes after 4a and A56, since the legend gets an entry for each kind of contact, coil and motor in use.
- A24 was logged from reading the code. Confirm the cause on the BMS fixture before fixing it.

### Step 5: project settings

- **A50** removes Sequential numbering and the setting that chose it. **A51** replaces the *Terminal strips* setting with one rule, applied at Renumber. **A52** moves *Wire colours by function* into the Distribution window. **A1** puts Client in the title block as a third equal cell.
- A52 comes before step 6, which adds to the same window.

### Step 6: wire numbers by supply

Build from `design-wire-numbering.md`. Suggested split:

1. **A supply's tag.** Each distribution gets a number in the Distribution window; every wire on it carries that number; the order of the numbering rules (§2 of the note); Check for a block or rail on no supply.
2. **Blocks and rails.** The control rail becomes the power rail, drawn by voltage (LV or ELV); a distribution block's ways are counted from its wires; line weights (§3, §4 of the note).
3. **A57.** The distribution pickers come off the Incoming supply and off a plant's supply out, and Check's bypass warning goes. A point's `dists` is read in `sim.ts`, `conductors.ts` and `checks.ts`, and set in `PointsDialog.svelte`. Mind the note in the entry: with no Incoming supply drawn, a distribution that a supply out reaches by wire is supplied by that plant and isn't stood in for by its blocks.

- The two `numbering-sheet8-` mock-ups are in the PC folder only. Look at them there.
- Every existing drawing's supply wires renumber at the next Renumber. The examples are rebuilt.

### Step 7: wire labels and link ends

Build from `design-wire-labels-and-links.md`.

- **7a.** A26: number and colour are one label, the function stops printing, *Other end* goes. A29 goes with it, since a turned note is how a wire now gets extra description. A29 was logged from the code (a rotation is stored and nothing draws it): confirm first.
- **7b.** A27: the link arrow part goes and a wire's free end is a link end. Shapes are in `mockups\link-ends.png`. Claude's tools change to match and nothing is kept for old use.
- **7c.** A28: `wireMarkers()` in `src/core/schedules.ts` counts a marker at each real end of a connection.

### Step 8: Design

Build from `design-design-workbench.md`. Its §9, *What comes out*, is the list to check off: when step 8 is done, nothing on it is left in the build. Its §10 names the mock-up for each part.

- **8a, A69.** The first view is renamed Plant; the views run Plant, Controller, Devices, Network, To draw (Devices arrives in 8d). Pick a row and Properties shows that thing and nothing else. `+ Point` adds an empty row. Interlocks sit on the point. *Enabled by* and *Source* go. Today's Properties is `DesignProps.svelte`.
- **8b, A67.** One Terminals window for plant and for modules, in place of *Pins and points…* (`PointsDialog.svelte`): the list, *Add terminal* numbering itself, drag to reorder, the one line at its foot, Generate on IO modules only. Every module is on the rail in the Controller view and is added there, a module's details are in Properties, and the *Controller…* window (`ControllersDialog.svelte`) goes. *Save model* becomes *Save as device* in a module's Properties (`saveModuleDevice()` in `src/core/controllers.ts`). Check before building that deleting a pin on 0.4.5 leaves the others' numbers alone, which the design relies on.
- **8c, A68 and A66.** Adapter is a module type with no channels. Plant marks are pictures plus *Other* with up to four typed letters (`markPrims()` in `src/core/symbols.ts`; preview in `mockups\plant-marks.png`).
- **8d, A70, A38, A31, A72.** Suggested as two PRs:
  1. The Devices view: one row for each drawn part, each terminal strip, each module and each plant item; a device picked per row or for several at once; a row picked shows its device in Properties. The Device table window (`DevicesDialog.svelte`) goes from Layout, and Layout only shows a part's device, with a link to Design (`GaProps.svelte` is where one is picked today).
  2. The device is the one source of what a thing takes, gives and draws. *Takes* is a value with V AC, V DC or both. Those boxes come off the coil and lamp in Draft, off points and modules in Design, and a part with no device is a warning in Check (A31). *Relay pins* goes (`relayPins`, and `relayPinMarks()` in `src/core/xref.ts`); a device that suits a coil gets *Poles*, read only by a new warning in Check. The Incoming supply keeps *Gives* in the new form and loses *Rating (VA)* (A72).
- **8e, A65 and A75.** A65 is §5, D10. For A75, time *Prove all* on the BMS fixture first (`proveInterlocks()` in `src/core/interlocks.ts`); §5, D12 says what counts as quick.

### Step 9: Layout

- **A58.** The size typed for a Backplate sheet is the enclosure's; the plate is drawn 25 mm in from each edge and is what positions and dimensions are measured from.
- **A60.** *Fit* takes the largest scale that fits, to one decimal place, and a detail's frame gets *Fit*.
- **A71.** A *Bill of materials* table in the Tables list, from the same rows as the Schedules tab (`billOfMaterials()` in `src/core/schedules.ts`). The count itself doesn't change: it's what's placed on the GA sheets.
- While here, write down what a GA sheet's settings show for each view and correct SH-6 to match.

### Step 10: files and the project list

- **10a.** A17: *Create project* asks for a file name and nothing else. A8: a name already taken is refused, and *Duplicate* asks for the copy's name. Legal names are §5, D2.
- **10b.** A21 *Rename*, A16 the deleted projects list with *Restore* and *Delete permanently*, A9 *Upload*. All are on the project list, and all refuse a name that's taken.
- **10c.** A12 rolling backups, with restore into a new project. Its starting values are §5, D1.

### Step 11: running

- **A5.** Started while a Ferrule is running, the exe opens the browser at it and exits.
- **A10.** `--mcp` is given the address of the Ferrule to relay to.

### Step 12: close

- Read the specification through: nothing crossed through, every entry's statements say what the build does, its heading says 0.5.
- README screenshots retaken where the interface changed.
- The report: each step's PRs, what's under *Changed during build*, anything left unticked and why, and the §5 points that were built to the recommended answer.

## 5. Points with a recommended answer

Each is small and has an answer that can be built. If one hasn't been answered when its step starts, the recommended answer is built and the PR says so.

| | Entry | The point | Recommended |
|---|---|---|---|
| D1 | A12 | When a backup is taken, and what a new project starts with | A copy only when the project has changed since the last one. A new project starts at every 30 minutes, 10 kept |
| D2 | A17 | Which file names are legal on Linux | Windows' rules everywhere (none of `\ / : * ? " < > \|`), so a file made on one machine can be moved to another |
| D3 | A18 | The README's status line | The number comes out of the sentence |
| D4 | A22 | The README's download link | To the list of builds until a version is called the release, then to the latest release. The latest-release page shows nothing until there is one |
| D5 | A22 | How a build is asked for | A CI job run by hand: it builds Windows and Linux at that commit and publishes them as `v<version>`, marked pre-release. Nothing is published on a merge |
| D6 | A32 | Design's *Templates…*, a prompt, and Draft's *Templates*, a window | Both stay as they are until the two Templates lists are looked at in QA |
| D7 | A35, A33 | Layout on a schematic sheet | Greyed out, as Draft is on a GA sheet, with a tip that says to add a GA sheet from `▾`. Layout's own *New GA sheet* offer goes with it, since it can no longer be reached |
| D8 | A34 | The order of the menus the workbenches share | Check, Expectations…, Schedules, in that order, first in the workbench's own group. That's where Layout and Design have them already, so only Draft's row moves |
| D9 | A39 | Rotate on the parts not ruled on (terminal, socket outlet, connector, incoming supply, blocks and rails, terminal strip line, plant and module views) | Stays on all of them |
| D10 | A65 | How a new network gets its kind | `+ Network ▾` offers the kinds, as `+ Module ▾` does. *Place as sheet* is left as it is |
| D11 | A73 | What counts as a setting and is still remembered | As listed in the entry |
| D12 | A75 | What counts as quick enough to prove on entering Simulate | About a second for *Prove all* on the BMS fixture. Slower than that, Simulate says what's stale and proving stays a choice |

## 6. Changed during build

Judgement calls made while building, by step, with the reason.

### Step 0

- **The file format moves to 4 now** (A30). Taking out `preRelease()` changes what a format 3 file must hold: a file from the 0.2 test builds would no longer be mapped, and would half-open with its renamed terminals unwired. Moving the number on refuses it cleanly instead, which is the one duty A30 gives a format change. Files saved by 0.4.5 are refused by 0.5 with *Not opened. This file needs Ferrule 0.4.5*; step 4a would have done the same.
- **One message for older and newer files.** A30 words the older file's message. A newer file gets the same form (*Not opened. This file needs Ferrule 0.9.1 or later*), replacing the v0.4.x T19 wording, so there's one way of saying it. Both add the address of the builds, since that's where the version named is found. A file that doesn't say which Ferrule saved it says it's from an older, or a newer, Ferrule.
- **The other old-file code in the parser stays for now.** A few lines in `parseProject` still tidy fields from older files (a socket's earth, busbars split in v0.3, the door front's old name). Format 4 means no real file reaches them, and they also tidy hand-written files, so they're left; each goes when the step that reworks its part comes to it.
- **The LSP-01 example's sheet count.** The start page, the README and ST-10 called it a 16-sheet panel; it's 14 sheets. Like A18, the number comes out of the sentence so it can't go out of date again.

### Step 1

- **A40: the label block moves whole.** Flipped, a part's tag, cross-reference and label keep their order and spacing, and the block moves to where flipping would have put it, so it stays on the same side of the symbol as before.
- **A47: an isolator that still says *none*** (a hand-written file, or Claude) is drawn with a rotary handle, so no isolator is ever without one.
- **A49: the date is written day first** (27/11/2026), as *Add revision* writes it, and only a project made from the project list (or by Claude) is dated. The built-in examples are made by their scripts and keep empty dates.
- **A53: the window goes back where it was** when the drag is cancelled, rather than staying where it had been dragged to.
- **A61: rows of buttons wrap** in Properties, and the panel never scrolls sideways at all, whatever is in it.
- **A74: only *Duplicate ×n* empties the description.** Inserting a Design template keeps the template's descriptions, since that's a copy of something saved on purpose, not of the row beside it.
- **One PR for the step.** The thirteen entries went in together rather than as two PRs: they're small and nothing between them depends on another.

### Step 2

- **D4 and D5 built to the recommended answer.** The README links to the list of builds; a build is a CI job run by hand, at the commit picked, published as `v<version>` and marked pre-release.
- **A *dry run* tick on the publish job.** It builds and smoke-tests both without publishing, so the job can be checked without putting a build up that wasn't asked for. It was run once that way after this step merged.
- **The end-to-end test is a script, run on both builds.** `scripts/smoke-test.ts` starts a build on a scratch folder and works it over HTTP: the version, the page served from inside the binary, a project created and opened, the example added and opened, a sheet printed. CI runs it on every PR for Windows and Linux, and the publish job before publishing.
- **The Linux build is the bare file,** `ferrule-linux-v<version>`, as the entry names it. A download loses the file's executable bit, so the README and the release notes say `chmod +x`.
- **A version already published is refused.** Every PR moves the version on, so a second build at the same number would be of the same commit.

### Step 3

- **Help docks** (A32). The plan first had it as a `FloatBox` panel; the list has it among the windows, opened from a button and closed only by closing it, so the list won and the plan was corrected. It's a window of its own now (`HelpDialog.svelte`), and its text says `Ctrl`+click keeps the part (A14).
- **How close to an edge docks** (A64): within 80 px of a tile's edge, or a quarter of the tile when it's smaller than that. Anywhere else a dragged window just moves.
- **Places are kept for the session** (A73), in memory, as WN-11's note said: a window reopened comes back where it was left, and a reload starts everything in its usual place. The places older builds kept in the browser are cleared on loading.
- **Window titles in a tile's bar** follow the window's own (*Project details*, *Place parts*).
- **A33, checked on the build before building it:** in a GA sheet's settings the *Detail* view was disabled on every sheet that wasn't already one, and every other view disabled on a detail sheet, with nothing saying why; the core refused the change outright (*A detail sheet is added as one, and stays one*). Now an empty sheet changes to and from Detail like any other view, a detail sheet's scale becoming 1, and a refused change flashes its reason and puts the list back.
- **The New GA sheet prompt is the form Layout's browser had,** moved whole: the same fields and defaults, with *Cancel*. It opens Layout on the new sheet.
- **D7 and D8 built to the recommended answer:** Layout greyed on a schematic sheet, with a tip to add a GA sheet from `▾`, and its own *New GA sheet* gone; Draft's row puts *Check, Expectations…, Schedules* first in its own group.
- **Leaving a sheet a workbench can't work on:** in Layout, moving to a schematic sheet goes to Draft and to a spare sheet goes to Annotate, as moving to a GA sheet in Draft already went to Layout.

### Step 4a

- **The Contact's setting is called *Contact*** (normally open, normally closed, changeover), each choice with its terminal numbers in brackets, as a push button's and a selector's poles already pick NO or NC. It's stored as `params.contact`, a key the legend already reads as a kind.
- ***Instantaneous* isn't shown at all** off a timer's contact, rather than greyed: a setting can now hide when it doesn't apply (`hideOff`), and the timer's own settings on a Coil use the same.
- **A part that doesn't turn:** *Rotate* isn't offered in its Properties, `R` while placing it says it doesn't turn, and `R` on a selection turns what turns and leaves the rest. With nothing that turns, it says why. A hand-written file's turn on such a part is read as upright.
- **The connector block doesn't turn**, though v0.4.x made it rotatable: A39 names it, so the list wins. A48's *Columns* (step 4c) gives the wide layout rotation was for.
- **LSP-01's duty selector** was placed turned half round, which a selector can't be now. It's redrawn flipped, its common on top, at column 20, and the two enable relays swap columns so its wires don't cross (their tags swap with them). Every other sheet of both examples prints as before, checked sheet by sheet against 0.4.5.
- **The legend** names the kinds *Contact NO*, *Contact NC*, *Changeover contact*, *Relay coil*, *Contactor coil* and *Timer coil: <function>*, and keeps them in that order. The rest of A55 is step 4c.
- **D9 built to the recommended answer:** Rotate stays on every part A39 doesn't name.
- **File format 5.**

### Step 4b

- **A 4 position selector at rest** is drawn with every pole open: it has no off position, and each pole is closed in one of the four. In Simulate it starts in 1 and each pole is drawn as it is in the position the switch is in.
- **Pole choices come from the positions** (`optionsFor`), and a change of positions tidies the poles at once (A41), rather than leaving a choice the list no longer shows.
- ***Changeover* is greyed on a 4 position selector**, with the reason, rather than hidden, so it's plain why it can't be ticked; the pole lists hide while it's ticked.
- **Names on a 4 position selector** are typed in *Position 1 (I)*, *Position 2 (II)*, *Position 3* and *Position 4*; *Off / mid position (0)* hides.
- **CK-50 is an error,** since a wire to a repeated number can't say which terminal it means. No part can be set up that way now; it's there so nothing like it can hide again (A43).
- **LSP-01's duty selector** is set with *Changeover* ticked in place of its first pole's old changeover choice: it prints as before.
- **File format 6.**

### Step 4c

- **A48, how columns lay out.** Two columns are the block as it was. One column puts every terminal on the left. Three or more make a wide block: two rows, the top row's terminals up and the bottom row's down, E1 and E2 at its ends, as the turned block used to be. A wide block can't have a middle row (its terminals would land on the same points as the outer rows'), so it widens to hold them in two: 12 terminals in 4 columns are drawn 6 across. Judge in QA whether a wide block of more than two rows is ever wanted.
- **A24, which points carry colour:** only a point that switches, the *Contact* form, on a module (a relay output's common and NO) or on plant (a fault contact). A powered point's two pins are different potentials, so nothing carries through them. Confirmed first on the BMS fixture: its DO module's channels are contact points, and nothing carried.
- **A55, the size limit:** a symbol is drawn smaller in the legend when it's taller than a contact (6 units) or wider than a four-pole isolator (14). The motor and the transformer are; nothing else in the examples is. Text keeps its size, since nothing prints under 1.8 mm. A motor's *M* and *3~* are drawn with it, since they're the symbol.
- **A56:** the setting's key in the file is `type` now, as the coil's is. **File format 7.**

### Step 5

- **A51, what counts as typed.** A terminal placed with no strip given is marked as following; typing a strip in its properties, or drawing a strip line through it, makes it typed, and it starts a run. Typing X1 on a terminal counts: the terminals after it go back to X1. The order is by sheet, then left to right, then top down for terminals in one column.
- **A51, the examples.** LSP-01 types X0 on its four incoming terminals, so its first fan terminal now has X1 typed, or every terminal after X0 would follow it. Its strips are as they were. BMS-01 types none and is all X1, as before.
- **A50:** Claude's `update_project_info` loses its `numbering` field, and the project's details no longer report a scheme.
- **A52:** the table moved as it was, below the list of distributions.
- **A1:** a client name longer than its 24 mm cell is squeezed to fit, as every title block cell already is.
- **File format 8** (the numbering settings are gone from the file).

### Step 6

- **A rail or block on no supply is reported as information, not a warning** (design-wire-numbering §4a says only that Check reports it). LSP-01 has nine on purpose: each fan starter's own CCT and 0 V rails after its isolator's auxiliary poles, and the lamp test rail. They carry switched power, which §2a numbers by position, and a warning would flag a drawing that's right.
- **A link arrow loses its distribution and its typed reference in 6a** (§3 of the note), ahead of step 7b replacing the arrow, so no wire reaches a supply except by being drawn onto its block or rail.
- **A tag is a whole number from 0 to 999**, typed in the Distribution window. An empty box isn't allowed: every supply has a tag, given from 1 when it's added.
- **Markers follow the number** (note §5): a panel wire on a supply says the supply's tag at both ends, terminal or not; a field core still says its terminal at the panel end.
- **The terminal checks leave supply wires alone:** a supply wire landing on a terminal isn't *a wire whose number doesn't match its terminal*, and one tag on many wires isn't *one number on several wires*.
- **A rail's band is read from the first number in its supply's voltage**, DC when the voltage says DC or the supply is a DC kind. A rail on no supply, or on one whose voltage is empty or has no number in it, is drawn as extra-low voltage (today's weight), and its Properties say why. The examples' rails are all extra-low (24 V AC, 24 V DC, 0 V).
- **A block's ways count every wire drawn onto it on its sheet**, a wire to a tee counted once at the block. Properties shows the count under the distribution.
- **Each drawn block is its own line on the bill of materials** (note §3), even when two have the same device and need the same ways: the line says *needs at least n ways*. Other devices still share a line when they're the same.
- **A block's *Ways* go in the device table** beside the other columns, shown only for a device that suits a distribution block. *Suits*' *Busbar (distribution block)* is now *Distribution block*, the part's own name.
- **Blocks and rails on different supplies joined by a wire is a warning, not an error**, and it follows the wire through terminals (a terminal doesn't end a wire; a part does). A drawing may bond the controls' 0 V to an earth bar on purpose, which this reports; it can't be told from a mistake.
- **A device's ways moved the file format to 10.**
- Placeholders and test data in the device table that named a real maker and part number are now generic.
- **A57: "reaches by wire" follows every switch and fuse, whichever way it's set.** A power supply's output through a fuse, or a rail switched from it by a contact, is still that supply's: standing its blocks in would keep the rail live with the supply off, which is what the entry's note warns of. A part that isn't a switch (a coil, a lamp, a transformer) ends the reach.
- **A supply out's distribution for the short check is the first one its wiring reaches**, in place of the one it was set to, so a battery and the UPS output it backs, both wired to one bus, still aren't a short.
- **Removing the pickers moved the file format to 11.** CK-20 keeps its ID, saying there's no such check now.

### Step 7

- **A wire's label sits in the middle of its longest run** (the note says what it is, not where). That was the number's place; the colour used to start at the source end, which depended on the way the wire was drawn. A label too long for a short wire that lands on a block or rail runs away from the block, as the number did.
- **A wire whose number prints on another of its runs** shows its colour alone on this one, as before.
- **A29 confirmed from the code before building:** R stored a quarter turn on a Text and the text stayed level, its lines shuffled along one baseline. A text now has two ways, level and turned to read up the page (stored as 270), and R swaps them; a file or a placement asking for any other turn gets the nearest of the two. *Rotate (R)* reads *Read up the page (R)* or *Level (R)* for one text.
- **Dragging the label moved the file format to 12:** a wire keeps one `labelAt` in place of the number's and the colour's.
- **A27: a link end is kept as a small element of its own (`link`) at the wire's free end,** not as data on the wire. It behaves as the note says: it's made only by drawing a wire to or from bare paper, isn't in the parts list or Claude's symbols, takes one wire, goes when its wire does, and isn't joined to a pin it happens to sit on. Kept this way, conductors, simulation, cross-references and checks carry on working through it unchanged.
- **Which way it points** is set when it's made, from where its wire's other end is, and R turns it like a part.
- **Bare paper** is anywhere that isn't a terminal, a wire or a part's body. A wire started there and finished there too is refused: *finish on a terminal*.
- **Carrying on in one move** (*Link…* from a source, then bare paper) starts the wire tool there with the arriving end already linked. Clicking a link end instead pairs as before. *Link to a new arrow* is gone.
- **When the link end prints its wire's label:** when the wire ends at it and the label is longer than the wire's longest run, unless the label has been dragged by hand. It prints above a horizontal end and left of a vertical one, reading left to right.
- **The legend** shows a link end in each of its two shapes, linked.
- **A28: a marker goes at each real end of a connection,** where a wire lands on a terminal or a part, never at a tee or a link end. LSP-01's schedule loses 48 rows, one for each of its link ends. A field core whose panel side runs through a link end still has its panel-end marker at the terminal and its field-end one at the device.
- **README pictures:** the drafting, simulating, notes, terminal block and printed sheet pictures are retaken here, having fallen behind the interface since v0.4.x. Design, Controller, Network and Layout's are retaken in steps 8 to 11, which rework those views.
- **Link ends moved the file format to 13.** Claude's `connect` takes `{x, y}` for a bare end (with a label, and `link` to carry a source on); `link` pairs two link ends; `add_element` refuses one.

### Step 8

- **8a: a point with no form yet has the form *none*** (shown *–*, marked ● in the table). It needs no channel, can't take an interlock and doesn't simulate, so nothing has to guess what it is. Choosing a form clears it.
- **8a: a point's Properties keeps *Gives*, *Takes*, *Draw VA*, *Rating VA* and *Efficiency %* until 8d,** which moves them to the device (A38). The plant's *Pins, from the datasheet* line stays until 8b's Terminals window takes it.
- **8a: the form list is the browser's own list,** each form with its plain words and the channel it needs in brackets; under the box, the words again with the channel's badge.
- **8a: *Terminals…* opens today's *Pins and points…* window** until 8b replaces it.
- **8a: dropping *Enabled by* and *Source* moved the file format to 14.**
- **8b: a module's *Draw VA* stays in its Properties until 8d** moves it to the device (A38). *Maker* and *Model* aren't edited on the module any more: the device it was made from is shown, and *Save as device* makes one from it.
- **8b: a module point that isn't a channel (a supply in, a bus) is picked from its module's column** and named and given its form in Properties; a channel's Properties shows its type and the point allocated to it, or its label when it has none.
- **8b: the Terminals window docks** as the windows it replaces did (A32), under the name *Terminals*.
- **8b: a dash in a Generate pattern uses up a number** without making a terminal (`I - C` makes 1, 3 for the first channel), so a module's gaps are typed rather than mended by hand after.
- **8b: a group that is a channel's isn't offered as a serial port** in the Terminals window; only the other groups are (a comms group, a host's ports).
- **8b, left as it was: the one line shows a terminal shared by two points under the first only,** since a number repeated across points there means two terminals (`Run: 11 14 | Fault: 11 14`). Typing a module's line back loses the sharing, so on a module with shared commons the table and Generate are the way to change it. For QA.
- **8b: the Controller view keeps three columns:** the plant points on the left to allocate from, the rail and module columns in the middle, Properties on the right. A module is moved along the rail by dragging it or with *← Move* and *Move →* in its Properties.
- **8c: an adapter has a generic GA size of its own,** 22.5 × 90 mm (*Controller adapter* in the sizes), used until a device is picked, as the host and power supply have.
- **8c: a host and an adapter are added with no terminals;** a power supply still comes with its supply in. An adapter's supply out is made to follow its supply in from the point's *In Simulate*, as for any supply out.
- **8c: the fan and pump marks are the motor part's pictures drawn small** in the mark's circle; the letters keep the detail size (1.8 mm). The lozenge is as wide as its letters plus a margin, the same height as the circle.
- **8c: a mark's letters are stored only with *Other*,** and a picture chosen after it clears them. A file with one of the four removed marks is a file of an older format, refused as all are. File format 15.
- **8c: a module whose type has no channels never has any** (`channelTypes`), whatever its points' forms: an adapter's *Bus* typed in as a contact isn't counted as a DO. On 0.4.5 a host's or power supply's point with an IO form was counted as a channel.
- **8c: a module with no channels lists each point's form and terminals** in its column (*supply in · 1 2*), as in mock-up 3.

- **8d1: a device is kept on what it's for:** on a drawn part's element (a relay's coil, not its contacts), on each terminal strip by its name (`Project.stripDevices`), and on the plant item, modules included. A GA item's own device and a module's are gone: what's placed is what was picked. File format 16.
- **8d1: a strip's device is one terminal,** so the strip is as long as its terminals times the device's width. A strip with fused and plain terminals takes one device for all of them; the generic sizes still tell them apart when it has none.
- **8d1: a part's device counts wherever it's drawn,** placed on a GA or not: its draw in Simulate, its relay pins and a block's ways (CK-54 now points at the block on its schematic sheet, not at the GA).
- **8d1: `+ Device` gives the new device to the picked row when it had none,** suited to it and at the size it has now, so one button makes and assigns it. With no row picked it makes a device suited to anything.
- **8d1: devices no row has are listed last, under *Devices not used yet*,** so one made and not yet given, or one left over, can still be picked, edited or deleted. Not in the mock-up.
- **8d1: plant devices suit *Plant*** (a new entry in the list of what a device suits), modules *Controller module*.
- **8d1: a library device is edited in its Properties and the change goes to the library,** this project's copy following; new library devices are made with `+ Device` and *To library*. *From the library…* lists the library to bring one in, or delete one from it.
- **8d1: the group names** are Coils; Breakers, isolators and fuses; Lamps, push buttons and selectors; Blocks, transformers and sockets; Terminal strips; Controller; Plant. A contactor drawn without a coil is with the breakers.
- **8d1: the MCP server has a `devices` tool,** the Devices view's rows and the device table, to make a device and give things one.

- **8d2: *Takes* is a value with *V AC*, *V DC* or *V AC or DC*; *Gives* the same less *either*.** A device shows what it says by what it suits: a load *Takes* and *Draw*, a supply *Gives* with *Rating* and *Efficiency %* (shown once it gives something), a relay, timer or contactor *Poles*, a block *Ways*; a device for anything shows all of them.
- **8d2: a plant item draws through its first supply in or powered in,** and its device's *Gives* is what each of its supply outs gives. A plant with two different outputs needs two plant items. A controller's power supply module carries every module's draw, its own included.
- **8d2: the Incoming supply's *Gives* is two boxes,** a number and *V AC* / *V DC*, kept as the part's own (it isn't a device). File format 17.
- **8d2: a contactor's poles counted by Check** are its main contacts' poles and auxiliaries and each linked contact; a relay's, each linked contact.
- **8d2: A31's warning is one line for the project,** once it has a device at all: *n of m things have no device yet*, naming the first few, with *Show* to the first in the Devices view. A project that never uses devices isn't told about every part.
- **8d2: a module's maker and model are its device's,** shown in its title row and the controller map from the device's maker and part number; *Save as device* names the device by type (*DI-16 module*).
- **8d2: sheet, section and Design templates carry the devices their parts and plant are,** and bring them into a project that hasn't got them, as a distribution comes with a template.
- **8d2: the BMS fixture gives its modules, power supply and actuators devices** (their makers and models moved there), so its drawings print as before.

- **8e: *Prove all* on the BMS fixture took about a quarter of a second** (two interlocks, 140 to 250 ms), well inside D12's second, so entering Simulate proves what's out of date, in the background, one at a time; the Simulation panel shows the progress with *Cancel*, then *n of m proved*. Built to D12's recommended answer.
- **8e: a proof's key is the circuit only:** each part's id, symbol, zone, links and params less those that only describe it (description, information, mark, printed rating, colour…); each wire's two ends; each plant item's terminals, points' forms, pins and what they follow, its interlocks and commons; each distribution's kind. On 0.4.5 the key was the whole drawing, so dragging a label, moving a part or a wire's route, or renumbering, dropped every proof: fixed here, as the entry asks.
- **8e: `+ Network ▾` picks the new network** in the Network view, as `+ Module ▾` picks the new module. *Place as sheet* is left as it is (D10).

### Step 9

- **A58: the plate sits in the middle of its enclosure** when its size is typed over, so the margin is shared equally; typed larger than the enclosure, it's refused, and an enclosure made smaller than a typed plate puts it back to 25 mm in. The enclosure's outline is drawn thin and dashed, the plate as the panel's outline was, and the sheet's title gives both sizes.
- **A58: a backplate behind a door takes the door's opening as its enclosure** and the plate 25 mm in, as the entry says *Add a backplate for each door* already took off. *Size from its door* does the same.
- **A58: the fixtures' backplates are laid out again on their plates** (positions measured from the plate's corner), so nothing lies outside them. File format 18.
- **A60: *Fit* never goes larger than 1:1.** A frame's *Fit* gives the largest of its scales (2:1, 1:1, 1:2, 1:5) that fits a detail sheet, as a new frame starts: a frame shares its sheet with others, so it isn't made to fill it.
- **A71: the table has a *Size* and nothing else to set**, and lists every GA sheet's rows with the sheet in its first column, as the Schedules tab does. Its text starts at the detail size, since the list is long. It can be placed on any sheet, as the other tables can.
- **SH-6 written out** with what a GA sheet's settings show for each view.

### Step 10

- **10a: names compare by their letters and digits, whatever the case** (`fileKey`), which makes `LSP 01` and `lsp-01` the same as the entry asks; that key is also the project's id in the app's addresses, so a file's own name can be anything legal. Built to D2's recommended answer: Windows' rules everywhere, plus no name Windows keeps for devices (CON, NUL, COM1…), none starting with a space, and 120 characters at most.
- **10a: a new project has no title,** so the title block's *Project* cell is empty until it's typed under *Project…*; the list and the top bar show the file name and the title beside it in grey.
- **10a: *Duplicate…* asks for the name in its row,** starting from `<name> copy`, rather than in a separate prompt.
- **10a: the LSP-01 example is added as `LSP-01.ferrule`.** A PDF with no drawing number or title is named after the file.
- **10a: the smoke test** that CI runs on both builds now makes its project from a name.
- **10b: *Rename…* is refused while the project is open in an editor,** as the entry's reason for putting it on the list suggests: an editor still holding the old name would otherwise save to a file of that name and bring it back. Ferrule tells an editor is open by its connection for live updates, which closes when the editor goes back to the list or its tab is closed. A tab left on the editor and navigated away keeps it open until the browser lets it go.
- **10b: *Rename…* changes a file opened from elsewhere in its own folder,** refusing a name another `.ferrule` file there has; one in the projects folder is checked against the whole list as *Create project* is. A change of capitals alone is allowed.
- **10b: *Deleted projects…* is a link under the project list,** opening a window. *Restore…* asks for the name in its row, as *Duplicate…* does. The sheet count is read from the file; a deleted file that can't be opened in this build is listed with the reason and can still be restored or deleted.
- **10b: *Upload…* sits beside *Open file…*,** and a name that's taken is refused rather than asked again: *Rename…* on the one already there, or on the file before uploading, settles it.
- **10b: *Delete* moves a file across drives by copying it and removing the original,** where it used to leave the original renamed `.deleted`, using the same move as *Rename…* and *Restore…*.
- **10c: built to D1's recommended answer.** A copy is taken on a save, when the last is at least *every* minutes old and the file differs from it, so nothing is copied while a project sits unchanged. A new project starts at every 30 minutes, 10 kept. *Every* is 1 to 1440 minutes; *keep* is 0 to 100, and 0 takes no copies without removing those there.
- **10c: the copies are named `<file name> <time>.ferrule`,** in the same form as a deleted file, and a project's are the ones with its exact file name. A copy that goes wrong is logged, and the save still succeeds.
- **10c: *Backups…* is a button beside each project, opening a window.** *Restore…* starts from `<name> <date> <hh.mm>`, since the project's own name is taken.
- **10c: *Delete* leaves a project's copies in `Backups`.** The entry doesn't say what happens to them, and leaving them means a project restored under its old name has its copies again.
- **10c: file format 19.** A project holds its backup settings.
- **10c: in passing,** *Use the shared device library* under *Project…* has its tick beside its words again, as the backup settings do.

### Step 11

- **A5: Ferrule is found by asking the port,** with the `/api/health` the `--mcp` relay already used, which also gives its version. The check is made when a port turns out taken, so a Ferrule that moved on to 4811 earlier (with 4810 taken by something else) is found too.
- **A5: the console stays up four seconds** after opening the browser, long enough to read before the window closes. With `--no-open` it stops at once.
- **A5: the smoke test runs the build twice** and checks that the second one points at the first and stops, so CI checks this on the Windows exe as well.
- **A10: the address follows `--mcp` as its own argument** (`--mcp server`), as the plan has it. Without a scheme it's `http://`, and without a port it's 4810, or `--port`'s. Given an address, Ferrule starts no server of its own. One that isn't answering is still relayed to, so Claude sees *Ferrule isn't reachable* on each request rather than a server that won't start, and carries on once the Ferrule is up.
- **A10: Settings → Status opened from another computer shows that computer's Claude Desktop settings,** `--mcp` with the address the page was opened at, and a path to fill in. Claude Code's command uses the same address.

### Title block (ruled 27 Nov 2026, before step 7)

- **A1 laid out again:** *Sheet*, *Job no.* and *Checked* in three equal cells (24 mm); *Drawing ref.* and *Drawn* in two (36 mm); *Client* across the row (72 mm). A long *Checked* name and date is squeezed to fit its cell, as every cell's value is.

## 7. After the build

What QA on v0.5 starts from:

- The specification as rewritten, statement by statement.
- *Carried to QA on v0.5* in the list's Checks section: sixteen things to judge in use.
- §7 of `design-wire-labels-and-links.md` and §2a of `design-wire-numbering.md`: the places where the new wire design could read worse than the old, to be judged on a printed sheet.
- The §5 points built to the recommended answer.
- One real system built start to finish in the reworked Design, which is the test of step 8.

Findings go on the next list in the same way.
