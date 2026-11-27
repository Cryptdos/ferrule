# Ferrule v0.5.0-pre: advancements

The list for v0.5.0-pre: every change that comes out of QA on the v0.4.x builds, and every advancement decided on the way. It takes over from *Fixes and tweaks for v0.4.x* in `design-v0.4.md` §13, which is finished.

QA is worked against `functional-specification.md` in this folder. An entry here gives the statement it's about (`SH-15`), so the two can be read together.

**It's built from `design-v0.5.md`,** the sprint's plan: the order of work, how each entry is built, and the points that have a recommended answer. This list says what's wanted. Where the two disagree, this list wins and the plan is corrected.

**Testing of build 0.4.5 stopped on 27 Nov 2026.** v0.5 changes too much of it for more testing to be worth the time. Every check that was waiting has been closed from the code, made an entry, or carried to QA on v0.5: see *Checks*.

## How entries are written

- **A-numbers** are given in order and never reused. Tick an entry when its PR is merged, and give the PR number.
- **Kind** says what sort of change it is:

  | Kind | Meaning |
  |---|---|
  | Fix | The build doesn't do what the specification says |
  | Tweak | It does what's specified, but that isn't what's wanted. The specification changes when it's built |
  | Missing | Nothing covers it yet |
  | Docs | The build is right; a document or a piece of on-screen text is out of date |

- **Build** is the version it was found on.
- An entry built changes its statement in the specification in the same PR. Until then the specification describes the build as it is.

A note from testing can go in as roughly as it comes (`DR-31, 0.4.5: wire kept its old number after Renumber`); it's written up as an entry afterwards.

---

## From the functional specification (25 Nov 2026)

Found while writing the specification from the 0.4.5 source, and ruled on the same day. None has been tested by running the build.

- [ ] **A1. Client in the title block.** *Tweak. SH-15, PR-1. Build 0.4.5.* Client is entered under *Project…* but printed nowhere unless a text uses `{project:client}`. The title block's *Sheet* and *Job no.* cells are made narrower, leaving room for a third cell, *Client*, beside them on the same row. It's filled from the project's Client on every sheet.
  - The three cells are equal widths (ruled 26 Nov 2026). Today the row is 72 mm, split into two cells of 36 mm, so three of 24 mm.

- ~~**A2. `Ctrl+S`.**~~ *Withdrawn 25 Nov 2026.* It's already there and does no harm, so it's left as it is: it saves at once in Design, Draft and Annotate, and isn't handled in Layout or Simulate.

- [x] **A3. Clear lamp colour: README.** *Built: PR 118.* *Docs. PT-8. Build 0.4.5.* Clear has been removed as a lamp colour; the build offers Rd, Ye, Gn, Bu and Wh, with white for a clear lens. The README's editor guide still lists *Cl* among the colour codes. Take it out.

- [x] **A4. IO schedule's empty message.** *Built: PR 119.* *Fix, text. SC-6. Build 0.4.5.* With no controller, Schedules → IO points reads *No controllers yet (Controllers… in Draft)*. The controller has been made in Design since v0.4, and a panel has one. Reword it to how it works now, for example *No controller yet (Design → Controller)*.

- [x] **A13. Lamp test terminal's label.** *Built: PR 119.* *Fix, text. PT-8. Build 0.4.5.* The terminal is LT, and has been for some time. The lamp's setting still reads *Lamp test terminal (T)*. Change the label to *(LT)*.

- ~~**A15. The Controller… window in the singular.**~~ *Withdrawn 27 Nov 2026.* The window goes (A67). What's left of the point: wording in the Controller view speaks of one controller, as *Add the controller* already does.

- [x] **A18. README: status line.** *Built: PR 118.* *Docs. Build 0.4.5.* The download line near the top reads *Status: **0.1.0 preview**, for feature testing*; the build is 0.4.5.
  - Proposed: take the number out of the sentence (*Status: preview, for feature testing*), so it can't go out of date again. The release page and Settings → Status give the version.

- [x] **A19. README: socket earth.** *Built: PR 118.* *Docs. PT-10. Build 0.4.5.* The editor guide's *Earth* line says the socket has *E out to the side*. Since v0.4.x the earth is at the top, beside L and N. Correct the line.

- [x] **A20. Design record: 75 columns.** *Built: PR 118.* *Docs. SH-11. Build 0.4.5.* `docs/DESIGN.md` speaks of a *100-column* grid in two places (the summary near the top and §8, numbering). The page has 75 columns. Correct both.

A3, A18, A19 and A20 are all corrections to documents and can go in one PR.

---

## Running Ferrule, files and the server (25 Nov 2026)

Decided in discussion. The aim: Ferrule runs the same way on a desk or on one central machine, so the drawings live in one place and are reached from any browser on the home network or over the VPN.

- [ ] **A5. One Ferrule at a time.** *Fix. ST-1, ST-3. Build 0.4.5.* Started while a Ferrule is already running, the exe starts a second copy on the next port (4811…) working on the same projects folder. Instead, if a Ferrule answers on the port, the new one opens the browser at it, says so in its console and exits. This is also how a lost page is reopened: run the exe again.
  - The console says which version it found, so a newer exe run against an older Ferrule still running is plain to see.
  - A port taken by something that isn't Ferrule still moves on to the next free one, as now.

- ~~**A6. One projects folder.**~~ *Withdrawn 25 Nov 2026.* *Open file…*, *Save as…* and the folder browser stay. Ferrule can be run from anywhere (a downloads folder, say) while a project is kept where it's backed up (Documents, a job's folder), so a project lives wherever its file is. The browser isn't a concern on a central Ferrule, since that's only ever reached on the local network.

- ~~**A7. The file is named after the project.**~~ *Withdrawn 25 Nov 2026.* The file keeps the name it's given today: the project's name made safe for a file name (lower case, hyphens, 48 characters at most), set when the project is created.

- [ ] **A8. No second project by the same name.** *Tweak. ST-5, ST-8. Build 0.4.5.* Creating a project whose file name is already in the projects folder isn't done: *A file by that name already exists*. Today the second file is quietly numbered (`-2`).
  - Names are compared as file names, so `LSP 01` and `lsp-01` are the same.
  - It follows that adding the LSP-01 example a second time is refused the same way.
  - *Duplicate* asks for the copy's name. A copy is made for a reason, and its name says what that is. Today it makes `<name> copy` without asking.

- [ ] **A9. Upload.** *Missing. ST-8.* *Open file…* browses the machine Ferrule runs on. On a central Ferrule that isn't the machine you're sitting at, so the project list also gets *Upload*: pick a `.ferrule` file on your own machine and it's added to the projects folder. It's checked as a Ferrule project, as opening one is, and refused if a file by that name is there (A8). With *Download*, this is how files move on and off a central Ferrule.

- [ ] **A10. Claude on a central Ferrule.** *Missing. MC-1, MC-2.* Claude works the same whether Ferrule is on this machine or another. `ferrule.exe --mcp` already relays Claude Desktop to a running Ferrule, but only on the same machine: let it be given the address of the Ferrule to relay to. Every tool stays, PDF export included.
  - Known limits on a central machine: Claude's view of a sheet needs Chrome or Chromium installed there, and its PDF export writes into that machine's `exports` folder.
  - The endpoint is as open as the page: whoever can reach the server can edit drawings through it. Accepted for a server on the home network or VPN.

- [x] **A11. Linux build.** *Built: PR 120.* *Missing. ST-1.* The build script already has a Linux target; CI publishes only the Windows exe. Publish `ferrule-linux` as well, test it end to end, and add a short note on running it as a service (`--host`, `--no-open`).

- [ ] **A12. Rolling backups.** *Missing. PR-1 to PR-7, ST-8.* Set under *Project…*, per project: **how often** a copy is taken and **how many** are kept. Ferrule keeps dated copies of the project as it's worked on, the oldest going when the count is reached.
  - The copies go in a `Backups` folder beside the project's file. For a project in the projects folder that's `projects\Backups`, next to `Deleted`; for a project kept elsewhere it's beside that file, so the copies follow the project and are picked up by whatever backs up that folder.
  - Restoring is from the project list: a button beside each project opens its copies by date, and one is restored **into a new project**, leaving the current one alone. It asks for the new project's name, as restoring a deleted project does (A16).
  - After *Save as…* the new file starts its own run of copies and the old file keeps the ones it had. The settings are in the project, so they carry over.
  - To settle: a copy only when something has changed since the last; the starting values for a new project.
  - The single `.bak` of the previous save (ST-14) stays as it is: it's one save back, and guards against a save going wrong.

- [ ] **A16. Deleted projects.** *Missing. ST-8.* *Delete* already moves a project's file into `Deleted` inside the projects folder, with the date and time in its name, but nothing in Ferrule shows them. The project list gets a button that opens the list of deleted projects, each with *Restore* and *Delete permanently*.
  - *Delete permanently* asks first: it can't be undone.
  - *Restore* asks for the name to restore it as, starting from the name it had, and is refused if a file by that name is there (A8).
  - It's restored into the projects folder, whichever folder it was deleted from: where it came from isn't recorded.

- [ ] **A21. Rename.** *Missing. ST-8.* With A17 the file's name is what a project is known by, and nothing in Ferrule renames a file. The project list gets *Rename* beside *Duplicate*, *Download* and *Delete*: it asks for the new name, which must be a legal file name (A17) and not already taken (A8).
  - It's on the list, not under *Project…*: those settings are what's inside the file, and the file's name isn't. Renaming from the list also avoids renaming a file out from under the editor that has it open.
  - The project's backups (A12) are renamed with it, so they aren't left behind.

- [ ] **A17. A project is created from a file name.** *Tweak. ST-5. Build 0.4.5.* Today *Create project* asks for a title, and the file's name is worked out from it behind the scenes. Instead it asks for the **file name**, and that's all it needs. The project's title, with the rest of its details, is entered under *Project…* once it exists. What you type is the file you get, as *Save as…*, *Duplicate* (A8) and *Restore* (A16) already work or will.
  - What follows: a new project has no title, so the project list and the top bar show the file name, with the title beside it once there is one. The title block's *Project* cell is empty until it's filled in.
  - Any legal file name is allowed and kept exactly as typed, capitals and spaces included, as in any other program. A name that isn't legal is refused with the reason, not quietly changed.
  - This replaces today's lower-case-and-hyphens naming for new files. Existing files keep their names.
  - To settle while building: which rules count as legal on Linux, where almost anything is allowed. Proposed: Windows' rules everywhere (none of `\ / : * ? " < > |`), so a file made on one machine can always be downloaded to another. Claude's tool for creating a project takes the file name the same way.

---

## Drawing (25 Nov 2026)

- [x] **A14. `Ctrl`+click keeps the part.** *Built: PR 119.* *Tweak. DR-1, WN-20. Build 0.4.5.* Each click made with `Ctrl` held places the part and keeps it ready for the next. The first click without `Ctrl` places one and ends it, back to Select.
  - The *Keep placing until Esc* setting stays. Some will prefer it, and it's there to be seen for anyone who doesn't use shortcuts.

- [ ] **A23. Wire numbering by supply.** *Tweak, large. NU-5, NU-7, DR-48 to DR-53, SC-5. Build 0.4.5.* Found on the QA project: a wire off a block or rail gets its own number, so one supply carries a different number on every wire (0 V: 122 wires, 122 numbers), and the same circuit looped device to device is numbered differently. Each supply gets a numerical tag and every wire on it carries that tag; terminals keep their own numbers. With it: the control rail becomes the power rail, drawn by voltage; a distribution block's ways are counted from its wires.
  - The design, the rulings and the mock-ups are in `design-wire-numbering.md`. Build from that, not from this line.
  - Big enough for a sprint step of its own, and it changes the numbers on every existing drawing at the next Renumber.

- [ ] **A26. One label for a wire.** *Tweak. DR-23 to DR-26. Build 0.4.5.* A wire's number and colour are two pieces of text, dragged separately, in an order that depends on which end the wire was drawn from. They become one label: number then colour, no separator, dragged as one, the wire underlining it. The function stops printing on the wire (the field stays, for colour), and *Other end* goes.
  - The design is in `design-wire-labels-and-links.md` §2.

- [ ] **A27. Link ends in place of the link arrow.** *Tweak, large. DR-40 to DR-47, PT-18. Build 0.4.5.* The link arrow is a part that's placed, and can be dropped straight onto a terminal, which leaves a wire with no line: nothing to select to set its colour, and no markers. The part goes. A wire ends or starts on bare paper, and that end is a link end: a source when the wire is drawn out to it, a destination when the wire is drawn from it. New outline shapes for the two, struck through until linked.
  - The design and the shapes are in `design-wire-labels-and-links.md` §3 and `mockups\link-ends.png`. Build from that, not from this line.
  - Goes with A23: a link end can't be set to a supply or carry a typed reference.

- [ ] **A28. Markers counted at link arrows.** *Fix. SC-5. Build 0.4.5.* The Markers schedule is built from the lines as drawn, so it puts a marker at each link arrow, where none goes. A wire across two sheets is one wire with two ends and two markers. Count markers per connection, once at each real end.
  - Found by running the schedule on the QA project, 26 Nov 2026: 34 rows too many, one for each of its 34 arrows.

- [ ] **A29. Text that can be turned.** *Missing. AN-2, AN-3. Build 0.4.5.* A Text annotation can't be drawn turned, so a note can't run up the sheet beside a vertical wire. With the function no longer printed on wires (A26), a note is how a wire gets extra description, so text needs to turn in 90° steps like a part. Turned text reads bottom up.
  - From reading the code, 26 Nov 2026: pressing R stores a rotation on the text, but nothing draws the text turned. Whoever builds it confirms that first.

- [x] **A30. Drop the old-files rule.** *Built: PR 118.* *Docs, with a small fix. ST-18. Build 0.4.5.* The repo's working notes say old project files must open unchanged at every step, and keep a mapping for files from test builds. Both go: there's no backwards compatibility before release.
  - The built-in examples (LSP-01, BMS-01) are made by scripts in the repo; a build that changes the file format reruns them.
  - **An older file that no longer fits isn't opened, and says what it needs:** *Not opened. This file needs Ferrule {the version it was last saved in}.* That version is in the file: since v0.4.x every save writes the Ferrule version that made it. Old versions stay downloadable, so the file can still be opened in the one named.
  - A file from before v0.4.x doesn't hold the version. It says the file is from an older Ferrule and can't be opened.
  - Today's message for an older file is fixed text that names Ferrule 0.1 whatever the file is. It's replaced by the above.
  - For this to work, a build that changes what a file must hold moves the file format number on. That's the one duty a format change carries.

---

## How builds are delivered (25 Nov 2026)

- [x] **A22. Builds published automatically.** *Built: PR 120.* *Missing. Confirmed 25 Nov 2026.* Each build should be somewhere to pick up, Windows and Linux, with no need to send it at the end of a chat.
  - CI puts each build on GitHub's download page for the repo, one entry per version, holding `ferrule-windows-v<version>.zip` and `ferrule-linux-v<version>`. A build is then at `…/releases/tag/v<version>`, and all of them are listed at `…/releases`. Nothing to send.
  - These are **test builds, not releases**. GitHub calls the page *Releases*, but every build goes up marked *pre-release*. A version is only the release when you call it that, and it's then marked as such by hand.
  - Builds are kept, not pruned: old versions stay downloadable, which is what stands in for file compatibility before 1.0.
  - To settle: the README's download link goes to `…/releases/latest`, which only ever shows a version you've called the release, never a test build. That suits the public; for testing you'd use the list.
  - Why not a folder in the repo, as first asked: the Windows zip is about 55 MB. GitHub warns on files over 50 MiB and blocks them over 100 MiB, and a repo keeps every file ever committed, so each build would add its full size to every clone for good. `dist/` is the build's own output folder and is ignored by git for that reason.
  - **A build is a batch, not a PR, and is made on your word.** Publishing is meant to slow the pace: a build goes up when a worthwhile set of QA fixes and changes is in and ready to test, not after every small change. You say when; nothing is published otherwise.
  - **The version still moves with every PR.** The last number counts the PRs under the version: `v0.5.12` is the twelfth PR under 0.5. A published build carries the number of the PR it was made at, so the builds skip numbers (0.5.4, then 0.5.12).
  - What changes with it: CI builds Linux too (A11); the rule in `CLAUDE.md` to build and send the zip after each PR is replaced by building when asked. The rule to move the version on with each PR stays.

---

## Windows and sheets (26 Nov 2026)

Decided while going through the specification's window and sheet sections.

- [x] **A32. Windows and prompts.** *Built: PR 121.* *Tweak. WN-18. Build 0.4.5.* Everything that opens is a window, a prompt or a panel, and the kind decides whether it docks. Today eight windows dock, picked by name, and nothing says why those eight.
  - **A window** is kept open and worked beside. It shows or edits the project, and the only way out of it is to close it. **Every window docks into a tile.**
  - **A prompt** is one step of an action. It asks, and a button finishes it: *Apply*, *Accept*, *OK*, *Cancel*, yes or no. **A prompt always floats, and never docks.**
  - **A panel** isn't opened: it comes up by itself with what you're doing. There are two: Properties, which follows the selection, and the Simulation panel, which comes up on entering Simulate. **A panel floats, and never docks** (both ruled 26 Nov 2026).
  - The test for anything new: did a button on the row open it, and is closing it the only way out? Then it's a window, and it docks. Anything else floats.
  - What's in build 0.4.5, sorted by that test (from reading the code, 26 Nov 2026; checked as it's built):

    | Kind | What | Docks today |
    |---|---|---|
    | Window | Plant, Templates (Draft), Schedules, Table, Controller…, Distribution, Expectations…, Check | Yes |
    | Window | Device table…, *Pins and points…*, Place parts… (Place detail…), Project…, Settings, help | No: these are what A32 changes |
    | | **Changed 27 Nov 2026:** *Controller…* and *Device table…* go, and *Pins and points…* becomes *Terminals…* (A67, A70). So what A32 makes dock is *Terminals…*, Place parts…, Project…, Settings and help | |
    | Panel | Properties, with a sheet's settings in it; the Simulation panel | No, and they stay that way |
    | Prompt | Renumber (*Apply n changes*), Suggest… (*Accept ticked*), Duplicate ×n, Open file… and Save as…, New GA sheet, `+ Point`, a name to type, a yes-or-no question, a message such as Export PDF's | No, and they stay that way |

  - To settle:
    - **Design's *Templates…*.** It has *Cancel* and *Insert* and closes on Insert, so today it behaves as a prompt, while Draft's *Templates* is a window that docks. One of them changes; it goes with the check on the two Templates lists.
  - Already in its favour: every window and most prompts are built from the same part, so this is a change to which ones may dock, not a new window handler. Yes-or-no questions use the browser's own box.

- [x] **A33. GA sheet in the add menu.** *Built: PR 122.* *Missing. SH-1, LA-1. Build 0.4.5.* There are three kinds of sheet, and `▾` beside `+` offers two: *Sheet* and *Spare sheet*. A GA sheet can only be made from inside Layout. The menu gets the third, *GA sheet*, which opens the same prompt Layout uses: the view, the enclosure's width and height, and the scale. Each kind of sheet is then made from the one place.
  - To settle while building: whether Layout's own *New GA sheet* stays as a second way in. It's what the browser offers there when the sheet open isn't a GA, so it does no harm.
  - **Found on the build, 26 Nov 2026: a detail sheet is awkward to make.** On a GA sheet the view couldn't be changed to *Detail* in the sheet's settings. The only way found was to leave for a sheet that isn't a GA, use *New GA sheet* there to pick Detail, then move the new sheet to where it belongs. With GA sheet in the add menu it's made from any sheet and lands after the one that's open. Two things go with it: an empty GA sheet can be changed to any view in its settings, and a view that can't be picked says why, as Door back does (*pick its sheet*).
  - To confirm before building: exactly what the settings did when Detail was chosen, so the right thing is fixed.

---

## From v0.4.x testing

Findings from testing the v0.4.x builds go here, in the order they're found.

- [x] **A24. Colour through a controller's relay output.** *Built: PR 125.* *Missing. DR-27. Build 0.4.5.* A new wire takes the colour of the wire on the other side of a fuse, contact, isolator pole, push button, selector or terminal. A controller module isn't on that list, nor is plant: a wire drawn from a relay output's normally open terminal doesn't take the colour of the wire on its common, though it's switched power in the same way (`design-wire-numbering.md` §2a). Carry the colour between the pins of one on/off point.
  - Found by reading the code, 26 Nov 2026. Whoever builds it confirms the cause on the BMS fixture first.

- [x] **A25. Colour through a push button's other poles.** *Built: PR 119.* *Fix. DR-27, PT-2. Build 0.4.5.* A push button carries a wire's colour through only between 13 and 14, and between 21 and 22. A first pole set normally closed (11, 12), a second pole set normally open (23, 24), and a third or fourth pole (33, 34 and 41, 42) carry nothing through.
  - Found by running the core code, 26 Nov 2026: a 4-pole push button pairs 13 with 14 and 21 with 22, and nothing else.

- [ ] **A31. A part with no draw is a warning.** *Tweak. CK-19, SM-24. Build 0.4.5.* A part with no draw set counts as nothing towards its supply. *Check* mentions how many there are only as information, so a supply's worst-case figure can sit under its rating while half its relays have no draw. Raise it to a warning: the supply's total isn't accurate until every part it feeds says what it draws.
  - With A38 and A70 a thing's draw comes from its device, so this is the warning for a part, module or plant item that has no device yet.

### Tested on build 0.4.5, 26 Nov 2026

From the notes written into the QA copy of the specification (`v0.4.0-pre Notes\QA`) and from testing talked through the same day.

- [x] **A34. One order for row two.** *Built: PR 122.* *Tweak. WN-2. Build 0.4.5.* Row two is to be in one standard order on every workbench: undo and redo | Fit and Split | align and distribute | Select | the workbench's own tools. Today Select comes before the align icons.
  - A button that only one workbench has stays with its group: *Colour check* with Fit and Split, *Wire* with Select.
  - To settle: the order of the menus the workbenches share (Check, Schedules, Expectations…), which is the rest of the check below.

- [x] **A35. A workbench is greyed out on a sheet it can't work on.** *Built: PR 122.* *Fix. WN-5, SH-8. Build 0.4.5.* Only *Draft* on a spare sheet is greyed out today. Two more, found by testing:
  - *Draft* is greyed out on a GA sheet. It isn't on this build.
  - *Layout* is greyed out on a spare sheet.
  - To settle: *Layout* on a schematic sheet. Today it's allowed, and the browser offers *New GA sheet* there (LA-1); with A33 that button has another home.

- [x] **A36. One Contact part.** *Built: PR 123.* *Tweak. PT-1. Build 0.4.5.* Normally open, normally closed and changeover are three parts in the list. They become one, **Contact**, with the kind picked in its properties, as a push button's and a selector's poles already are.
  - ***Belongs to* is removed.** It chooses Relay, Contactor or Timer, but a contact takes that from the coil it's linked to, and once linked the choice can't be made anyway. Unlinked, a contact is K.
  - **The greyed-out *Instantaneous* is removed.** It shows on every contact and can't be used until the contact is on a timer coil, where it becomes a tick box. Only the tick box stays, and only on a timer's contact.

- [x] **A37. One Coil part.** *Built: PR 123.* *Tweak. PT-6, PT-7. Build 0.4.5.* *Relay / contactor coil* and *Timer coil* are two parts. They become one, **Coil**, with *Type*: Relay, Contactor or Timer. The symbol changes with the type, as it does on other parts.
  - The timer's settings (function, time, maker's function code) show only when the type is Timer.
  - Tags follow the type: K for a relay and a timer, Q for a contactor.
  - Contacts linked to it follow: change a coil to Timer and its contacts are timed, since that already comes from the link.

- [ ] **A38. What a thing takes, gives and draws belongs to its device.** *Tweak. PT-6, PT-7, PT-8, SM-20, LA-33, CK-15, CK-16, DE-22, DE-52. Build 0.4.5. Ruled 26 and 27 Nov 2026.* Voltages and loads are typed on the part in Draft (*Takes* and *Draw* on a coil, timer coil and lamp), on the point and the module in Design, and on the device. They're facts about the real device, so the device is the one place they're set, and they come off everywhere else.
  - Build from `design-design-workbench.md` §4 and §8, with A70. A thing gets its device in Design's Devices view, plant in the field included.
  - A thing with no device has neither supply nor draw, which is the truth, and Check says so (A31).
  - Settled 27 Nov 2026: the Incoming supply isn't a device, so it keeps *Gives* and loses *Rating (VA)* (A72). A transformer's go to its device like the rest.

- [x] **A39. Rotate comes off parts that sit in a drop.** *Built: PR 123.* *Tweak. DR-3, DR-8, PT-11. Build 0.4.5.* Rotating a contact or a coil puts its tag and label over each other, and a part turned on its side goes against how a sheet is laid out. Rotate is removed from: contacts, coils, push buttons, selectors, isolators and breakers, fuses, lamps, the transformer, the motor and the connector block. Flip stays on all of them.
  - Rotate stays on the earth and the cable screen.
  - To settle: the parts not ruled on. Terminal, socket outlet, connector (plug and socket), incoming supply, blocks and rails, terminal strip line, and plant and module views (which choose a side for their terminals instead).

- [x] **A40. Flip turns the symbol only.** *Built: PR 119.* *Fix. DR-8. Build 0.4.5.* Flipping a part puts its tag below its label. The symbol flips; the tag stays above the label.

- [x] **A41. A selector's pole choices fit its positions.** *Built: PR 124.* *Fix. PT-3. Build 0.4.5.* On a 2 position selector the pole list still offers the 3 position choices (*closed in II*, *closed in I and II*, *opened in II*). The list shows only what's valid for the positions set.
  - Changing a selector from 3 positions to 2 puts a pole that was on a 3 position choice back to the default. The symbol shows what it now is, which is notice enough.
  - From reading the code: the drawing and the simulator already fall back this way, but the properties keep showing the 3 position choice.
  - *Changeover* leaves the pole list altogether (A43), and its long label with it: *Changeover (2 position: 12 in 0, 14 in I; 3 position: …)*.

- [x] **A42. A selector's poles drawn as they are in Simulate.** *Built: PR 124.* *Fix. PT-3, SM-3, SM-5. Build 0.4.5.* Found on the build: a 3 position selector with pole 2 set *NO, closed in II*. In position I the pole is drawn closed, and nothing through it is energised. A pole set *NC, opened in II* is likewise drawn open in I.
  - From reading the code: the circuit is right and the drawing is wrong. In Simulate the whole switch is treated as operated whenever it's off 0, and every NO and NC pole is drawn from that one fact. Each pole should be drawn from the positions it's set to. A 3 position changeover is already drawn properly.

- [x] **A43. Two terminals with one number on a selector, and the wire tool goes blind.** *Built: PR 124.* *Fix, serious. PT-3, DR-18. Build 0.4.5.* Found on the build: in one project the wire tool still drew wires but showed no terminals and no mark where the wire started, through a reload and a restart of Ferrule. A new project was fine.
  - **Cause, found in that project's file (`test1.ferrule`):** a 3 position selector with 4 poles, pole 1 normally open and pole 4 a changeover. A 3 position changeover is numbered as makers do, pole 4 being 15, 14, 13, and pole 1's contact is 13, 14. The part has two terminals numbered 13 and two numbered 14.
  - The wire tool draws its terminal dots by number within each part, and falls over on the repeat. Everything it draws on that sheet goes with it: dots, the start mark and the line being drawn. Reproduced on a two-part test sheet, 26 Nov 2026.
  - It isn't one unlucky set-up: 252 selector set-ups clash, among them any with pole 1 normally closed and pole 3 a changeover (two 11s). No other part can do it.
  - **Ruled 26 Nov 2026: changeover is a setting of the whole switch, not of a pole.** A real selector isn't a changeover on one pole and a plain contact on another. Ticked, every pole is a changeover, numbered as makers do; unticked, each pole picks from the normally open and normally closed choices, which can be mixed as now. Changeover poles never share a number with each other, so the clash can't be made.
  - Also to fix: the wire tool mustn't fail on a repeated number, and Check reports a part with two terminals of one number, so nothing like it can hide again.
  - On this build: change pole 4 (or pole 1) on that selector and the terminals come back.

- ~~**A44. Incoming supply: *System* first.**~~ *Withdrawn 26 Nov 2026.* The pickers it was to sit above are removed (A57), which leaves *System* as the first choice there anyway.

- [x] **A45. Delete leaves the backup behind.** *Built: PR 119.* *Fix. ST-8, ST-14. Build 0.4.5.* *Delete* moves a project's file into `Deleted` and leaves its `.bak` in the projects folder. Seen in the test folder, 26 Nov 2026 (`test1-copy.ferrule.bak`), and the code agrees: only the file itself is moved. The `.bak` goes with it.

- [x] **A46. Selector: its name, and a fourth position.** *Built: PR 124.* *Tweak. PT-3. Build 0.4.5.*
  - The part is called **Selector**. *Selector / keyswitch* says the same thing twice: *Key operated* is already a tick box.
  - **4 position** is added to 2 and 3. Its positions are 1, 2, 3 and 4, with no off position.
  - On a 4 position selector each pole is closed in exactly one position, picked from a list of four. A pole closed in more than one would defeat the switch.
  - A 4 position selector can't be a changeover (A43).

- [x] **A47. An isolator's operator can't be *None*.** *Built: PR 119.* *Tweak. PT-4. Build 0.4.5.* *Operator* offers rotary handle, door handle, key and *none (worked by something else)*. Nothing in Ferrule works one isolator from another, so *none* gives a switch that nothing operates, and on this build it can still be clicked in Simulate. *None* comes off the list.

- [x] **A48. Connector block: columns.** *Built: PR 125.* *Tweak. PT-11. Build 0.4.5.* The block always lays its terminals out in two columns. It gets a *Columns* setting beside *Terminals*, and sizes itself from the two. *Terminals* is the total: four terminals in two columns is two rows. Two columns stays the default.

- [x] **A49. A new project is dated.** *Built: PR 119.* *Missing. ST-5, PR-1, PR-7. Build 0.4.5.* A new project's *Drawn date* and the date of revision A, *First issue*, are empty. Both are filled with the day the project is made.
  - *Add revision* dates a new revision with the current date in the same way (ruled 26 Nov 2026). It does already (from the code, 27 Nov 2026), so there's nothing to build for it.

- [ ] **A50. Position numbering only.** *Tweak. PR-3, NU-11, NU-13. Build 0.4.5.* *Project…* offers a second numbering scheme, Sequential (K1, K2…, wires 100, 101…). Position numbering is part of the design, and a lot of work has gone into it: if it falls short it's fixed, not swapped for a backup. The Sequential scheme and the *Numbering scheme* setting are removed.

- [ ] **A51. Terminal strips follow on.** *Tweak. PR-4, NU-12. Build 0.4.5.* The *Terminal strips* setting (One, or By section) is removed. One rule takes its place: a terminal is on the same strip as the terminal before it, by sheet then left to right, until a strip is typed on one; every terminal after that follows the new strip, until the next one typed.
  - So with nothing typed everything is X1. Type X2 on the third terminal, and the third and all after it are X2 until one is made X3.
  - The terminals after it follow at the next Renumber, as tags and wire numbers do, not the moment the strip is typed (ruled 26 Nov 2026).

- [ ] **A52. Wire colours by function moves into Distribution.** *Tweak. PR-5, DR-28, DR-48. Build 0.4.5.* The table is under *Project…*, where nobody drafting would look for it. It becomes a section of the Distribution window, so all wire colour is set in one place.
  - Whether the rules earn their keep at all is a check below.

- [x] **A53. `Esc` while dragging a window leaves the highlight behind.** *Built: PR 119.* *Fix. WN-12, WN-18. Build 0.4.5.* Found on the build: drag a window that docks until a tile lights up blue, and press `Esc` with the mouse still down. The window closes, and the blue highlight stays on the tile with no way to clear it. `Esc` during a drag should cancel the drag: the highlight goes and the window stays open where it was.

- [x] **A54. Align to the last one clicked.** *Built: PR 119.* *Tweak. WN-2. Build 0.4.5.* Aligning lines everything up with the first thing clicked. It feels more natural to line up with the last. Things selected by dragging a box have no click order and align as they do now.
  - The specification doesn't say what align lines up with. It's added when this is built.

- [x] **A55. The symbol legend.** *Built: PR 125.* *Fix and tweak. AN-15. Build 0.4.5.* Three things, found on the build:
  - **One entry for each kind used.** With a motor and a pump on the sheet the legend shows only one of them. A part whose setting changes its symbol gets an entry for each kind in use, under its own name: motor, fan and pump; the earth types; the terminal types; and the coil and contact kinds once A36 and A37 are built.
  - **Parts that stretch are drawn at a fixed length.** A terminal strip line is drawn in the legend as long as the one on the sheet. In the legend it's about 10 units, whatever is drawn. The same for blocks, rails and the cable screen.
  - **Large symbols are drawn smaller.** The motor is far bigger than its importance. Nothing connects to a symbol in the legend, so one over a set size is scaled down to fit its cell. On the sheet it stays as it is, so it still lines up under a contactor.

- [x] **A56. A motor is named for what it is.** *Built: PR 125.* *Tweak. PT-14. Build 0.4.5.* A motor's *Picture* setting chooses motor, fan or pump, but the part is called Motor whichever is picked. The setting is renamed *Type*, as on the coil (A37), and the name follows it: a pump reads Pump in its properties and in the legend.

- [ ] **A57. An incoming supply is joined only by its wires.** *Tweak. PT-21, DR-50, CK-20, SM-16. Build 0.4.5.* Each terminal of an incoming supply can pick a distribution, which joins it to every block and rail on that distribution with no wire drawn. That's a connection nothing on the drawing shows, the same thing removed from link arrows (A23, A27), and it can bypass an isolator drawn in between. The pickers are removed: the supply is wired to its block like anything else.
  - Check's warning about the bypass (CK-20) has nothing left to find and goes with them.
  - Blocks and rails still pick a distribution. With no Incoming supply part drawn, they're still the supply in Simulate (SM-15).
  - Ruled 27 Nov 2026: the same goes for a plant's supply out. Its *feeds* pickers are removed (SM-16), so a power supply, inverter or UPS is wired to its block like anything else.
  - For whoever builds it: with no Incoming supply drawn, a distribution's blocks stand in as its supply unless a supply out *feeds* it. That exception has to follow the wires instead: a distribution that a supply out reaches by wire is supplied by that plant and isn't stood in for, or switching the power supply off won't take its rail down.

- [ ] **A58. A backplate sheet is sized by its enclosure.** *Tweak. LA-1, LA-8, §10. Build 0.4.5.* A new Backplate sheet asks for *the enclosure width and height*, and draws a plate of that size: type 600 × 800 and the plate is 600 × 800. You'd give the size of the panel you're working on.
  - The size typed is the **enclosure's**. Its outline is drawn, and the **backplate is drawn inside it, 25 mm in from each edge** (a 600 × 800 enclosure gives a 550 × 750 plate). That agrees with a maker's figures looked up on the day, and with what *Add a backplate for each door* already takes off.
  - The plate's size can be typed over, for an enclosure whose plate differs.
  - **Positions and dimensions are measured from the plate's top-left corner**, not the enclosure's: the plate is what's marked out and drilled. The enclosure's outline is for reference only: nothing snaps to it or measures from it.

- [x] **A59. Place parts… closes off a GA sheet.** *Built: PR 119.* *Fix. LA-11. Build 0.4.5.* Found on the build: with *Place parts…* open, moving to a sheet that isn't a GA leaves it open, where it has nothing to place onto. It closes when the sheet in view stops being a GA.
  - It doesn't dock today and will (A32).

- [ ] **A60. *Fit* fills the sheet.** *Tweak. LA-3, LA-28. Build 0.4.5.* *Fit* picks the first standard scale at which the enclosure fits (1:1, 1:2, 1:2.5, 1:5, 1:10…), so a door that would fit at 1:5.5 is drawn at 1:10 with half the sheet empty, and pressing Fit again changes nothing. The scale isn't being used to measure from, so Fit takes the largest scale that fits, whatever the number, to one decimal place (1:5.5).
  - A detail's frame gets *Fit* as well. A new frame starts at the largest scale that fits, but once the scale is changed there's no way back to it.

- [x] **A61. Properties never scrolls sideways.** *Built: PR 119.* *Fix. WN-7, LA-5. Build 0.4.5.* Found on the build: a column of doors has so many *Split* and *Join* buttons in the sheet's settings that the panel has to be scrolled left and right. Buttons wrap onto another row. The panel isn't made wider, which would cover the drawing.

- ~~**A62. Generate… on a module with no channels.**~~ *Folded into A67, 27 Nov 2026.* Generate shows only on IO modules, in the Terminals window; a pattern can leave a terminal out; *Shared by* is put in plain words; and it's plain which box is the controller's description. All in `design-design-workbench.md` §4 and §7.

- ~~**A63. *Add pin* numbers the pin itself.**~~ *Folded into A67, 27 Nov 2026.* *Add terminal* numbers the row itself, and numbers never change by themselves. In `design-design-workbench.md` §7. To check before building: that deleting a pin on build 0.4.5 already leaves the others' numbers alone.

- [x] **A64. A window docks only at an edge.** *Built: PR 121.* *Tweak. WN-18. Build 0.4.5.* Found on the build: dragging a window across the middle of the screen lights the whole tile up, as it's ready to be dropped there, when all that was wanted was to move it. Docking becomes splitting only: a window docks when it's dragged close to an edge of a tile, and anywhere else it just moves.
  - Dropping in the middle to replace what's in a tile is given up. On this build it splits the tile anyway, which isn't what WN-18 says.

- [ ] **A65. A new network asks what kind it is.** *Tweak. DE-59, DE-66. Build 0.4.5.* Found on the build: *+ Network* makes a LAN with a switch straight away, when a bus off the controller was wanted, and it had to be deleted and made again. Proposed: it asks the kind first, or the kind is plainly the first thing to set. Also noted: *Place as sheet* adds a sheet at one click, easily pressed by mistake.

- [ ] **A66. A plant's mark: a picture, or letters you type.** *Tweak. DE-16. Build 0.4.5. Ruled 27 Nov 2026.* A mark in a plant's view tells you at a glance what kind of thing it is. Today it's a fixed list of nine, and four of those are only a letter in a circle (T, P, H, ΔP), so a CO2 or air quality sensor has nothing to pick.
  - **The list holds pictures only:** None, Fan, Pump, Valve, Damper, Meter, Power supply, Battery. Fan and pump are new, taken from the motor part's pictures; the fan is the one with small blades. Meter stays, as kWh in a box.
  - **The marks that were only letters are removed:** Temperature, Pressure, Humidity and ΔP switch. They're typed.
  - **Other** is the last choice on the list. Picking it shows a box to type **up to four letters**: T, RH, ΔP, CO2, IAQ, OAQ.
  - One or two letters sit in the circle as now. Three or four widen it into a lozenge of the same height, so a row of marks still lines up.
  - The preview is `mockups\plant-marks.png`. Where it sits in a plant's Properties is in `design-design-workbench.md` §4.

- [ ] **A67. The Terminals window, and the Controller… window goes.** *Tweak, large. DE-18, DE-37 to DE-55, DR-63, DR-67. Build 0.4.5. Ruled 27 Nov 2026.* *Pins and points…* is clunky, and a controller is split between a view and a window. One Terminals window, for plant and for modules, lays out terminals and groups them into points, with Generate in it on IO modules only and the one-line entry at its foot. A module's details are in Properties when it's picked on the rail in the Controller view, where every module is shown and added, so the *Controller…* window goes.
  - Build from `design-design-workbench.md` §3, §4, §6 and §7. Build from that, not from this line.
  - Takes in A62 and A63.
  - Ruled 27 Nov 2026: *Save model* (DE-53) stays, as *Save as device* in a module's Properties. It's the only way a module's terminals and points carry to the next one, since a plant template doesn't hold modules. The name is confirmed (27 Nov 2026).

- [ ] **A68. Adapter modules.** *Missing. DE-46, DE-47. Build 0.4.5. Ruled 27 Nov 2026.* A controller's IO sometimes needs a module that carries the bus, and often power, on to further modules. *Adapter* is added to the module types: no channels, terminals entered by hand, placed and drawn like any other module. It doesn't split the rail; that's for Layout. Its power is set by hand, supply out following supply in.
  - Build from `design-design-workbench.md` §6. Mock-up: `mockups\terminals-3-controller-adapter.png`.

- [ ] **A69. Design: pick a thing, and Properties shows that thing.** *Tweak, large. DE-3, DE-4, DE-12, DE-19 to DE-23, DE-75. Build 0.4.5. Ruled 27 Nov 2026.* A point is edited in three places today, and a plant's Properties runs to about forty boxes. A plant row picked shows the plant only; a point row picked shows the point, and is the one place a point is edited. `+ Point` adds an empty row as `+ Plant` does; the forms keep their names and say in plain words what they are; interlocks sit on the point; *Enabled by* and *Source* go. Design's first view is renamed from *Table* to **Plant**.
  - Build from `design-design-workbench.md` §2, §4 and §5. Build from that, not from this line.

- [ ] **A70. Devices are picked in Design.** *Tweak, large. LA-19, LA-33, LA-34, DR-39, DE-12, SC-8. Build 0.4.5. Ruled 27 Nov 2026.* A real device is picked for a part only in Layout, for something placed on a GA: a leftover from before Design existed. Design gets a fifth view, *Devices*, listing everything that needs a device: one row for each drawn part once it's been added in Draft, each terminal strip, each module and each plant item, in the field or in the panel. Each is given its device from a drop-down, several at a time if wanted. The Device table window in Layout goes, and Layout places what's been picked.
  - Build from `design-design-workbench.md` §8 and §9. Build from that, not from this line.
  - Ruled 27 Nov 2026: in Layout a part's device is only shown, in its Properties, with a link to it in Design. On a device, *Takes* is a value with V AC, V DC or both beside it, and the *Relay pins* line goes.
  - Ruled 27 Nov 2026: Draft numbers a relay's terminals itself and a device doesn't change them. A device that suits a coil has *Poles*, a count that only Check reads: it warns when a relay's contacts use more poles than its device has. The views run Plant, Controller, Devices, Network, To draw.
  - Ruled 27 Nov 2026: the bill of materials stays counted from the GA sheets, since it's for building the panel (a table of it on a GA sheet is A71). A part's device isn't shown in Draft. Draft's Plant window stays, cut down to picking plant and placing it.
  - Nothing around it is left to settle. That note's §11 lists how each point was ruled.

- [ ] **A71. A bill of materials table on a GA sheet.** *Missing. SC-8, AN-1. Build 0.4.5. Ruled 27 Nov 2026.* The bill of materials is a tab in *Schedules* that exports to CSV, and it can't be put on a drawing. A *Bill of materials* table can be placed on a GA sheet. It lists what the Schedules tab lists, everything placed on the GA sheets, and keeps itself up to date as the other tables do.
  - It's placed from the *Tables* list beside Revision list, Controller map, Network diagram and Symbol legend, so there's one place tables come from (confirmed 27 Nov 2026).

- [ ] **A72. The Incoming supply has no rating.** *Tweak. PT-21, SM-21, SM-22, CK-18. Build 0.4.5. Ruled 27 Nov 2026.* The Incoming supply is the site's supply, not a device, and counts as unlimited. *Rating (VA)* is removed from it, so its load is never over and Check never warns about it. Its load is still shown beside it.
  - *Gives* stays on it, as the one supply whose voltage isn't on a device, written as a value with V AC or V DC beside it (as A70).

### From the checks, 27 Nov 2026

Checks whose intended behaviour was already ruled, where the code shows the build does something else.

- [x] **A73. Where a window was put isn't remembered.** *Built: PR 121.* *Tweak. WN-7, WN-11, WN-19. Build 0.4.5. Ruled 26 Nov 2026.* Settings are remembered and layout isn't. Today each window's place, and whether it's folded, is kept for the browser, as are Properties' and help's, so they come back after a reload. They stop being kept: a project opens with its windows closed, and a window opened starts in its usual place. Within a session a window still stays where it's put.
  - Still remembered, as settings: theme, button style, *Keep placing until Esc*, whether the browser panel and its sections are shown, whether the overview is shown, and the last folder browsed.

- [x] **A74. Copies from *Duplicate ×n* start with no description.** *Built: PR 119.* *Tweak. DE-30. Build 0.4.5. Ruled 26 Nov 2026.* Copies keep the description as it is, so three copies of *Supply fan 1* are all *Supply fan 1*. A copy's description comes out empty, ready to type, since it's always different. Everything else about a copy is as now.

- [ ] **A75. Interlocks are proved on entering Simulate.** *Tweak. DE-74, DE-79, DE-80. Build 0.4.5. Direction ruled 26 Nov 2026.* Proving is a button to remember. It happens by itself when Simulate is entered, for any interlock whose proof is out of date, as long as it doesn't hold Simulate up.
  - Time *Prove all* on the BMS fixture first. If it's quick, it runs on entering Simulate, and only when the drawing has changed since the last proof. If it's slow, Simulate says which interlocks are stale and proving stays a choice.
  - Only an electrical change (a wire, a part, a link) makes a proof stale. Dragging a label or adding a note doesn't. If the build drops a proof for those, that's fixed here.
  - *Prove* and *Prove all* stay.

---

## Checks

Testing of build 0.4.5 stopped on 27 Nov 2026. Each check that was waiting is in one of three places: closed from the code, made an entry, or carried to QA on v0.5. **Nothing in this section is to be built from.**

### Closed from reading the code, 27 Nov 2026

Each does what was intended, so there's nothing to build. Where the specification was short it's been corrected.

- [x] **Where *Keep placing until Esc* is kept.** *WN-20, WN-23.* For the browser, with theme and button style. WN-23 now says so.
- [x] **The wheel on number boxes.** *WN-26.* It steps only the box that has the focus, so scrolling past one changes nothing.
- [x] **Duplicating and deleting a sheet.** *SH-2.* The copy lands straight after the sheet it was made from, with its tags cleared, and Delete asks first. SH-2 now says both.
- [x] **`PgUp` and `PgDn`.** *SH-3.* Always the very next sheet, whatever its kind, and the workbench doesn't change. SH-3 now says so.
- [x] **Changing a sheet's type.** *SH-9.* A sheet can't change to a kind that can't hold what's on it: it's refused with how many things are in the way, and nothing offers to clear it. That covers a schematic sheet with parts changed to Spare, which SH-9 now says.
- [x] **Draft on a GA sheet.** *WN-5, LA-1.* Tested 26 Nov 2026: it isn't greyed out. A35.
- [x] **What *Enabled by* is for.** *DE-12.* Nothing uses it or *Source*. Both go (A69).
- [x] **`+ Plant` and `+ Point`.** *DE-3, DE-4.* Both add an empty row (A69).
- [x] **The names of the point forms.** *DE-20.* The names stay, each with what it is in plain words and the channel it needs (A69).
- [x] **The Controller view and the Controller… window.** *DE-38, DE-45.* The window goes (A67).

### Made entries, 27 Nov 2026

- [x] **What's remembered.** *WN-7, WN-11, WN-19.* A73.
- [x] **Descriptions on *Duplicate ×n*.** *DE-30.* A74.
- [x] **Proving interlocks.** *DE-74, DE-79, DE-80.* A75.

### Carried to QA on v0.5

These want judging in use, on the build, and nothing is decided until then. Anything found becomes an entry on the next list.

- [ ] **Order of the shared menus.** *WN-2.* The order of row two's groups is ruled (A34). The order of the menus the workbenches share (Check, Expectations…, Schedules) is built to the recommended answer in `design-v0.5.md` §4, and judged on the build.
- [ ] **Which windows dock.** *WN-18.* Go down A32's table on the build: does each one dock or not as the table says, and is anything that opens missing from it? Draft's were done on 0.4.5, 26 Nov 2026, and were right.
- [ ] **The order `Esc` works in.** *WN-12.* `Esc` cancels what's being drawn, then closes the window on top, then clears the selection. With windows open and something selected, pressing `Esc` to deselect loses a window first. Should the selection clear before a window closes? And does `Esc` close a window docked in a tile?
- [ ] **What a sheet's list shows.** *SH-4.* `▸` on a sheet lists what's on it for the workbench in use. Open it in each workbench and note what's listed, what's shown for things with no tag (rails, earths, link ends, cable screens), and that clicking a line goes to the item. Then decide what Simulate should list.
- [ ] **Find.** *SH-5.* What it searches (tags and labels, wire numbers, terminal numbers, the text of notes), whether that's everything or only what the workbench in use edits, how it's reached and how results are shown. The idea to weigh afterwards: `Ctrl+F` opens a small floating search box, as in a spreadsheet.
- [ ] **A GA sheet's settings.** *SH-6.* SH-6 lists only what a schematic sheet has. Whoever builds the Layout step writes down what a GA sheet of each view shows and corrects SH-6 to match.
- [ ] **Clouds from an earlier revision.** *SH-10, AN-11.* Only the latest revision's clouds are drawn. Cloud something, then add a revision: is the cloud still in the sheet's settings, and does the list say which revision each belongs to?
- [ ] **Tapping `Space`.** *SH-16.* Holding `Space` and dragging pans; tapping it fits the sheet. Does a short press meant as a pan jump back to fit?
- [ ] **A whole system, start to finish.** Build one real system in the reworked Design, from plant and points through the controller, its terminals and devices, drawing it, to proving it in Simulate.
- [ ] **A terminals line typed wrong.** *DE-18.* In the Terminals window (A67): a point name that doesn't exist (`enabel: 1 2`), no colon (`enable 1 2`), a point with no terminals (`enable: | fault: 11 14`). Is each refused with a reason, ignored, or does it make something? And does the box show the syntax?
- [ ] **Two lists called Templates.** *DE-36, DR-77, DR-83.* Design's templates are saved straight into the shared library; Draft's are saved in the project and reach the library only with *To library*. Save and reuse one of each, in a second project too, and decide which rule both should follow. Whether Design's *Templates…* stays a prompt (A32) goes with it.
- [ ] **Wire colours by function in use.** *PR-5, DR-28.* A colouring rule saves typing a colour on each wire, and can put the wrong colour on a wire without anyone choosing it. Use the rules on a real panel and judge which it does more of.
- [ ] **Hole centres on door fittings.** *LA-17.* From the code, 27 Nov 2026: a label plate is an item of its own and a dimension snaps to an item's edges and middle, so a lamp's middle should be its hole. To see on a door front.
- [ ] **Bill of materials.** *SC-8, CK-41.* Everything placed on a GA sheet is on it, and nothing else; and the table of it on a GA sheet (A71) agrees with the Schedules tab.
- [ ] **Network view.** *DE-59 to DE-67.* First pass on 0.4.5 looked good. Still to do: a LAN, more devices than the view shows, and order taken from the drawing. Two ideas are held back until it has been tested: a switch in the panel being ordinary plant that a LAN picks, in place of the drawn-only switch (DE-67); and a printed note that device order along a bus is indicative.
- [ ] **Wire numbers on short drops.** A number running over a part's pin number, made longer by the joined label (A26). The full list of things to judge on paper is in `design-wire-labels-and-links.md` §7 and `design-wire-numbering.md` §2a.

### Passed on a first look, 26 Nov 2026

Tried on build 0.4.5 and found sound. None is a full test, and none is changed by v0.5 except where an entry says so.

- Tiling and docking, bar A53 and A64.
- A fuse blown and replaced in Simulate (SM-4).
- Doors: one leaf, two leaves and columns of doors, hinge sides, *Size from its door* (LA-5 to LA-8). The column of doors wants a full check.
- Label plates: the nine-place text position picker, and a second line centring itself (LA-16).
- A detail frame at 2:1, for showing something small larger (LA-28).
- Plant views: width, *Fit to sheet*, dragging the label, terminals on any side and per group (DR-68, DR-69).
- Module views: placed from To draw, terminals along the bottom, the title row, the width dragged out (DR-73, DR-74).
- *Label back to its place* (DR-16).

---

## Decided: nothing to build

So these aren't raised again.

- **No backwards compatibility before release** (ruled 26 Nov 2026). Ferrule is a pre-release in progress: a drawing made in one build needn't open in the next, and no change carries a cost for old files. The built-in examples are rebuilt whenever a build needs it, and test drawings aren't protected either: the QA project was a test bench for v0.4 and there'll be others. This may change once Ferrule is released. See A30 for what it replaces.
- **The console stays.** No launcher window and no hidden-console build. The console is the log and shows the address; closing it stops Ferrule (ST-2 stands). Ferrule is an engineering tool: what matters is that it works well.
- **No code signing.** Ferrule is provided as is. Windows warns about the exe because it's an unrecognised download; anyone concerned can build it themselves.
- **No co-working.** One panel is one engineer's job. A central Ferrule is for one person reaching the same drawings from several machines, which the present save guard already covers.
- **The central Ferrule is unsecured.** No sign-in. It's for a home network or a VPN, never the open internet.
- **Export PDF stays,** the button and Claude's tool: one click is worth keeping.
- **`Ctrl+A` isn't added to Layout** (was Q3). `Ctrl`+click and box-select are enough.
- **Projects live wherever their file is** (was A6). *Open file…* and *Save as…* stay.
- **`Ctrl+S` is left as it is** (was A2).
- **No Check or Schedules in Annotate** (was Q6).
- **Save as… is left as it is** (ST-16): it asks before replacing a file, as every other program does. Familiar is consistent.
- **`Ctrl+A` is left as it is** (was Q8): select all in Draft and Annotate. It's there and it works.
- **A colour printed on every run of a wire is left as it is** (26 Nov 2026). A supply looped across a selector's poles prints *Bn* on each run between junctions. Each is correct, and *Show colour* on a wire takes off the ones not wanted.
- **A connector's tag and a terminal's number can look alike, and are left** (26 Nov 2026). A connector at sheet 1, column 16 is `X1-16`; a terminal there on strip X1 is `X1:1-16`. They're written differently, so there's no clash.
- **GA stays the name of the sheet type** (26 Nov 2026), for general arrangement.
- **The align and distribute icons stay as they are** (26 Nov 2026).
- **A wire's colour is taken when it's drawn, and never changed afterwards** (26 Nov 2026). Colour the first wire, then draw on from it. A wire drawn before the one feeding it was coloured isn't updated: going back over someone's drawing could change what they meant.
- **Dropping one terminal on another doesn't join them** (held, 26 Nov 2026). It would make a connection with no line: nothing to select, no colour, no number, no markers. Looked at again only if a real need turns up.
- **Connector (plug and socket) stays** (26 Nov 2026). It's for a flying lead: a removable battery on a fused lead, for one.
- **A transformer doesn't print its device's details** (26 Nov 2026). What it takes, gives and is rated at would have to come back from the device table to the drawing. Extra information on a sheet is an annotation, and the transformer's own *Rating* text already prints.
- **Windows don't pop out** into browser windows of their own (26 Nov 2026). They float or dock.
- **A timer's *Maker's function code* stays** (26 Nov 2026). It's a setting of that one timer, printed by the coil so whoever builds the panel knows what the dial is set to.
- **A relay base's own terminal numbers aren't printed** (27 Nov 2026). Draft numbers a relay itself. An *Override terminal numbering* tick box on a device, with the base's numbers typed in, was thought about and dropped: it gets complicated once selectors and the like want the same. Looked at again only if a real need calls for it.
- **The bill of materials is counted from the layout sheets** (27 Nov 2026). It's for building the panel. Plant in the field isn't on it.
- **A part's device isn't shown in Draft** (27 Nov 2026). It isn't relevant at that workbench.
- **Draft's Plant window stays** (27 Nov 2026), as a small window to pick plant and place it.
- **Draft's Plant window and Design's Plant view share a name, and it's left** (27 Nov 2026). Both list the same plant, one to place it and one to make it, and they're never on screen together.

---

## Awaiting a ruling

Nothing at present. A question that needs a ruling goes here as Q-numbered, and becomes an entry above, or is struck out, once ruled on. Q1 to Q8 are all closed.
