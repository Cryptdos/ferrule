# Wire numbering by supply

Design note for v0.5.0-pre. Agreed in discussion, 25 Nov 2026, and fully settled: §7 keeps the record of each point. Nothing here is built.

Since 26 Nov 2026 the link arrow is to become a *link end* of a wire, and a wire's number and colour one label: see `design-wire-labels-and-links.md`. Where this note says *link arrow*, read *link end*.

## 1. What's wrong today

Ferrule treats a distribution block or a control rail as a joint: every wire leaving it is its own wire with its own number, taken from the terminal it lands on or from where it starts. A wire looped from one device to the next is one wire with one number. So the same circuit is numbered two ways depending on how it's drawn, and a supply has no number of its own.

In the QA project, as drawn:

| Supply | Wires on it | Different numbers | Sheets |
|---|---|---|---|
| 0V | 122 | 122 | 25 |
| 24DC | 37 | 37 | 11 |
| L | 3 | 3 | 1 |
| N | 4 | 4 | 1 |

166 of the project's 318 wires are on a supply, and none of their numbers says so. A wire marked `25-11` doesn't tell anyone it's 0 V.

## 2. The rule

**A wire on a supply carries the supply's number.**

- A supply (a *distribution*: L, N, 24DC, 0V) has a **numerical tag**: 1, 2, 3, 4. It's set once in the Distribution window, beside the supply's name, kind, voltage, colour and function.
- A distribution block or power rail is assigned a supply, as now. It shows the supply's name and tag (`CCT 4`); the tag isn't edited on the part.
- Every wire on that supply carries that number, on every sheet: off a distribution block, off a power rail, or carried on to another sheet through a pair of link arrows.
- **Terminals keep their own numbers.** A boundary terminal is still numbered by where it is (`8-25`). A supply wire landing on it is still the supply's number.
- Drawn with a block, with a rail, or looped device to device, the wires get the same number.

So with CCT tagged `4`, every wire in the panel marked `4` is a 24 V CCT wire.

### One tag per supply

The tag is a number, as panel drawings usually have it. Names as tags (`L`, `24DC`) were considered and dropped, 25 Nov 2026.

- **One supply per potential.** Anything that's a different potential is a different supply with its own tag. Three phases are three supplies (L1, L2, L3), with N and PE. A panel with both 24 V DC and 24 V AC has a supply for each, and one for each return. The Incoming supply part already takes a supply per terminal.
- **A supply ends at the first part.** After a breaker, fuse, contact or fused terminal the wire is a new potential and is numbered by terminal or position, as now. On sheet 8 the feed to a breaker is `1` and the wire leaving it is `8-12A`.
- **Tags are given from 1.** Each new supply takes the next free number, in the order the supplies are listed, and it can be changed. **0 is allowed**, and is meant for the controls' 0 V.
- **Tags are unique.** *Check* reports two supplies with the same tag.
- **What a tag means is read at the rail or block,** which carries the supply's name beside it, and in the Distribution window.

### Order of the rules

A wire's number is, in this order:

1. the **supply's number**, if it's on a supply;
2. *(Settled 25 Nov 2026: it can't happen. A link arrow can no longer be set to a supply; every destination arrow has a matching source. See §3.)*
3. otherwise its **position** (sheet-column of its highest point), as now.

Rule 1 is new. Rules 2 and 3 are today's, unchanged.

## 2a. Why two kinds of number

Added 26 Nov 2026, from discussion. The rule is in §2; this is the reasoning, so it's on record when the rule is built.

### The test

**A number should send you to the drawing only when the drawing has something to tell you.**

- **A supply tag means "this is common: check the source".** A wire marked `4` is 24 V from that transformer, and that's all there is to know about it, when building or when fault finding. Which other `4` it's looped from is the panel builder's choice and isn't worth recording. A panel has three to five of these to remember.
- **A position number means "this is specific: look it up".** A wire marked `12-16` is one particular wire, and its number is the sheet and column where the drawing shows what switches it and what it feeds.
- **The two can't be confused.** A bare number is always a supply. A sheet-column is always a place.
- **A supply ends at the first part**, so a fuse is always traceable: past a fuse the wire has a position number that leads back to that fuse.

### Worked example

A switch feeding a relay coil from the 24 V rail (`4`), returning to 0 V (`0`):

| Wire | Number | Why |
|---|---|---|
| Rail to the switch, terminal 13 | `4` | On the supply |
| Switch, terminal 14, to the coil's A1 | `12-16` | A new potential, numbered by where it is |
| Coil's A2 back to the rail | `0` | On the supply |

### Three kinds of wire

Ferrule numbers a wire one of two ways. With its colour, that tells three kinds of wire apart:

| Kind | Number | Colour | Example |
|---|---|---|---|
| Supply | The supply's tag | The supply's | `4`, orange |
| Switched power | Position or terminal | Still the supply's | `12-16`, orange |
| Signal | Position or terminal | The signal colour, from its function | Pink |

- **Switched power stays power.** It's the same voltage, live only when something upstream lets it be. A wire drawn from one side of a switch, fuse or contact takes the colour of the wire on the other side, so orange in gives orange out.
- **A controller's relay output is switched power too.** It's a contact that happens to be inside the controller: `4` into the common, and what leaves the normally open terminal is switched power with a position number.
- **A true signal** is what a controller generates or senses itself: analogue wires such as 0 to 10 V, and the like. It takes its colour from its function in *Wire colours by function*.
- **The grey area** is a digital input fed from 24 V through a contact. That's switched power landing on a controller. Whether it's called a signal is the engineer's choice, made when its function is set.

### Against using one system throughout

- **Everything in sequence** (102, 103, 104): no number tells you anything, so every lookup is a hunt through the set.
- **Everything by position:** every number points somewhere, but a supply ends up with a hundred numbers that point nowhere useful. That's the 122 numbers on 0 V in §1.

Using each where it suits removes both faults.

### What it costs

- **Position numbers want to change when a circuit moves sheet.** A sequence number doesn't. If that happens after a panel is built, its markers disagree with the drawing.
  - Ferrule's answer is the life cycle: a panel is designed, laid out and tested before it's built, so changes of that kind are rare.
  - For a change after build, use a **spare sheet**. It already holds a sheet number in the set, so nothing after it shifts: change its type to Schematic and draw the addition there. Every existing number stays as it is. Inserting a new sheet part-way through the set is the move to avoid, since it pushes on every sheet after it.
  - *Lock number* and *Tag fixed* keep a number through Renumber where one must not change.
- **Position markers are longer to print** than a sequence number.

### To look at in QA, once built

- **Bare tags on paper.** A `1` or `4` beside a part's own terminal numbers (§6). Tags can be dragged clear. Putting a box round the tag was raised; if it's done, it's done for every wire number, so supply tags aren't treated differently. Decide on seeing a printed sheet.

## 3. Distribution blocks

A distribution block is a real part in the panel: a feed in, loads out. It's for wiring too heavy to loop from terminal to terminal (4 mm² and up), which is common for power.

- **It stays a bar.** It's drawn as now, a heavy line that wires are pulled from wherever they're needed. Drawing it as a box of terminals was considered and dropped: a bar is far neater to draft.
- **Ways are counted from the drawing.** Each wire that lands on the block needs a way. Nothing is typed in. Properties shows it: *5 wires: needs at least 5 ways*.
- **Each drawn block is its own part**, as now: its own tag (W8-4), its own place on the layout, its own line on the bill of materials, its own ways. Two blocks drawn on one supply are two real blocks.
- **Blocks joined by a wire share a supply.** A wire straight from one block to another makes them one potential, so they must be assigned the same supply; there's no case where they're joined and it differs. The joining wire carries the supply's tag and takes a way on each block. *Check* reports a wire that joins blocks or rails assigned to different supplies.
- **A block doesn't span sheets.** To take a block's supply to another sheet without clutter, draw a wire from the block to a link arrow and pick it up on the other sheet: that wire is on the block, so it's counted as a way like any other. A supply that genuinely runs across many sheets is what a power rail is for.
- **A link arrow can't be set to a supply.** Today an arrow can pick a distribution in place of a partner, which joins its wire to the supply without saying where it lands. That goes. Every destination arrow has a matching source arrow, and the wire at the source is drawn onto the block or rail, where it's counted and tagged.
- **Nor can it carry a typed reference.** Today an arrow with no partner can have a reference typed in by hand (`8-34`). That goes too: an arrow shows its partner's place, and there's nothing to set by hand. An arrow is either paired or it's unfinished, and *Check* reports every unpaired arrow, as it does now.
- **The count is a minimum.** There's no setting for spare ways. Five wires need five ways or more; the smallest you can buy may be a 6-way.
- **On the layout it's a default size.** It isn't sized from its ways: a real block's size depends on too much else. It keeps one default size until a real device is picked for it, and then takes that device's size.
- **The device table gets *Ways*** for distribution blocks. *Check* warns when the device picked has fewer ways than the block needs.
- **The bill of materials** says how many ways the block needs.
- **L and N are separate blocks**, as now.
- **A rail on the same supply isn't a way.** If the block feeds a rail, that wire is drawn onto the block and counted like any other.

## 4. Power rails

The control rail becomes the **power rail**. It's the common of a drawing, not a part: no tag, not on the layout, not on the bill of materials, no ways. The wirer loops it from terminal to terminal in whatever order suits.

- **Its thickness follows its supply's voltage.** Low voltage (230 V) is drawn thicker, extra-low voltage (24 V) thinner. It's read from the supply; there's no setting on the rail.
- Its wires carry the supply's number (§2).

Where the order of connection matters, or there's a real part to buy and mount, draw a distribution block.

### 4a. Assigned to no supply

A block or rail assigned to no supply just sits there. It gives out no tag: its wires are numbered as they would be anyway, by terminal or position. *Check* reports it, so it isn't left that way by accident.

### 4b. Line weights

| Line | Weight on paper |
|---|---|
| Wire | 0.25 mm, as now |
| Power rail, extra-low voltage | 0.35 mm (today's control rail) |
| Power rail, low voltage | 0.5 mm |
| Distribution block | 0.7 mm, the weight of the sheet frame |

- A block can carry the heaviest line because it's short.
- Extra-low and low voltage are as BS 7671: extra-low is up to 50 V AC or 120 V ripple-free DC; above that, up to 1000 V AC or 1500 V DC, is low voltage.
- A rail's weight is read from its supply's voltage. A block is one weight whatever it carries.

## 5. What else changes

| Now | Becomes |
|---|---|
| Each wire off a block or rail has its own number (NU-7) | Each carries the supply's number |
| A wire on a terminal takes the terminal's number (NU-5) | Still true, unless the wire is on a supply |
| Markers: a panel wire's say the terminal it lands on (SC-5) | A supply wire's say the supply's number. Others as now |
| v0.4.x: a marker matches the terminal it goes into | Still true for every wire that isn't on a supply, and for field cores |
| Terminals schedule: *Wire* often equals *Terminal* | For supply wires, *Wire* is the supply's number |
| A distribution block is 60 × 50 mm on the layout whatever is on it | Unchanged, until a device is picked |
| A link arrow can be set to a supply in place of a partner (DR-47) | Removed. Arrows are always in pairs |
| An arrow with no partner can carry a typed reference (DR-46) | Removed. *Check* reports any unpaired arrow |

- **Nothing is carried over from older builds** (ruled 26 Nov 2026): Ferrule is a pre-release in progress, and no conversion or special handling is written for drawings made before this change. The built-in examples are rebuilt by their scripts.
- **Old drawings change at the next Renumber.** In the QA project, 166 wire numbers become one of four. Locked numbers are kept, as always.
- **Simulation is untouched.** It already treats a supply as one potential.
- **The Markers schedule gets shorter:** one marker text per supply, with a count, in place of one per wire.

### What's given up

- One 0 V wire can't be told from another by its marker. They're interchangeable, so it doesn't matter which lands where; which wire goes to which terminal is read from the drawing.
- A wire off a block no longer says in its number where it goes. Today `8-12` is the feed to Q8-12; it becomes `L`.

## 6. Mock-ups

In `mockups\`, sheet 8 (power distribution) of the QA project, drawn by Ferrule's own print page:

- `numbering-sheet8-before.png`: as it is today. The L block's wires are 8-7A, 8-12 and 8-23; the N block's are 8-8A, 8-13, 8-24 and 8-21.
- `numbering-sheet8-after.png`: the same sheet with the supplies tagged L 1, N 2, 24DC 3, 0V 4 and every supply wire renumbered by hand to its tag. The wires after each breaker (8-12A, 8-13A, 8-23A, 8-24A) are unchanged.

What the *after* sheet doesn't show: the rails aren't restyled by voltage and don't carry their tag beside their name. The tag printed on every drop is as designed.

One thing it does show: a bare `1` or `2` on a wire sits close to a breaker's own terminal numbers (1, 2, 3, 4). The wire's number is the larger text (2.5 mm against 1.8 mm), but they're easy to confuse at a glance.

These two files hold a real project's title block. They're for this folder only, never the repo.

## 7. To settle

Every point raised is settled or dropped. Nothing is open.

1. *(Settled 25 Nov 2026: the tag prints on every drop, as in the* after *mock-up. Each wire off a rail or block shows its tag, the way every wire shows its number today.)*
2. *(Dropped: it can't happen. A link end can't be set to a supply, so a wire is always drawn onto the block or rail it's counted on. See §3.)*
3. *(Settled: each drawn block is its own part. See §3.)*
4. *(Settled 25 Nov 2026: a rail on the same supply isn't counted as a way. If the block feeds the rail, the wire is drawn and counted like any other. See §3.)*
5. *(Settled 25 Nov 2026: a block or rail assigned to no supply does nothing. See §4a.)*
6. *(Settled 25 Nov 2026: the block goes heavier. See §4b.)*
7. *(Settled 25 Nov 2026: as BS 7671. See §4b.)*
8. *(Settled: the number is set in the Distribution window. See §2.)*
9. *(Dropped with names as tags.)*
10. *(Settled 25 Nov 2026: given from 1, changeable, and 0 is allowed. See §2.)*
11. *(Dropped 25 Nov 2026: no key table. The drawing already says it: the rail reads `CCT 4`, and what feeds it, a transformer say, shows what it carries.)*
12. *(Settled 25 Nov 2026: tags can be dragged along their wire, as wire numbers can today, so one that sits against a terminal number is moved clear.)*
