# Wire labels and link ends

Design note for v0.5.0-pre. Agreed in discussion, 26 Nov 2026. Nothing here is built. It follows on from `design-wire-numbering.md`, which says what a wire's number is; this says how a wire shows it and how a wire carries on to another sheet.

## 1. The principle

**A wire is the connection between two terminals, however it's drawn.** Its number, its colour and its markers belong to the connection, not to the lines or symbols used to draw it.

Three things follow, and they're the rest of this note: a wire has one label; a wire that carries on to another sheet ends in a *link end*, which is part of the wire and not a part of its own; and markers are counted per connection.

## 2. The wire's label

A wire's number and colour become **one label**.

- **Number first, then colour**, in the reading direction: `8-23A Bn`. The number is 2.5 mm, the colour 1.8 mm, with the small gap between them that's there now.
- **No separator.** The difference in size separates them; a symbol between them would be clutter.
- **It reads one way.** Left to right on a horizontal run, bottom up on a vertical one.
- **The wire underlines it.** The label sits just above a horizontal run and just left of a vertical one, so there's no doubt which wire it describes.
- **It drags as one piece** along its wire. *Back to its place* puts it back.

| Now | Becomes |
|---|---|
| Number and colour are two pieces of text, each dragged by itself | One label, one drag |
| Their order depends on which end the wire was drawn from (`1 Bn` on one wire, `Bn 8-23A` on another) | Always number, then colour |
| The wire's function prints with them (`24V DC`) | It doesn't print. See below |
| *Other end* chooses which end the text starts at | Removed. The label is dragged to where it's wanted |

- **The function no longer prints on the wire.** With supply tags it repeats what the number already says. The *Function* field stays in the wire's properties, because it's how a wire takes its colour from *Wire colours by function*. A wire that needs more said about it gets a Text annotation.
- **A wire that shows only one of the two prints that one.** Earth and field wires print no number unless *Show number* is ticked, so their label is the colour alone.
- **Wires one grid unit apart.** The number is taller than that gap, so a label overlaps the wire beside it. They're dragged to stagger, as now.

## 3. Link ends

Today a wire carries on to another sheet through a **link arrow**: a part picked from the list and placed, which a wire is then drawn to, or which is dropped straight onto a terminal. The part goes. A wire can instead end, or start, on bare paper, and that end is a **link end**.

### Drawing one

- **A source:** start the wire on a terminal and finish it on bare paper. The wire leaves the sheet there.
- **A destination:** click bare paper first, then finish on a terminal. The wire arrives there.

The direction it's drawn follows the signal.

- **A link end is always the end of a wire.** There's nothing to drop onto a terminal, so a wire can't exist as two symbols and no line. The wire can be as short as one grid unit.
- **A link end is selected by itself** and has its own properties: its label, its partner (*Continues at*, *Link…*, *Go to*), the *Source* tick, and *Same label as its source*.
- **The *Source* tick swaps the pair,** as it does on the arrow today. Drawing one backwards is fine; the tick puts it right.

### Linking

- **Click to link**, as now: select a link end, choose *Link…*, and click its partner on any sheet.
- **Or carry on in one move:** with a source selected, choose *Link…* and click bare paper on another sheet. That starts the arriving wire, already linked, to be finished on a terminal. This replaces *Link to a new arrow*.
- **Linking two of the same kind** makes the one linked from the source and its partner the destination, as now.
- **Every destination has a matching source.** A link end can't be set to a supply and can't carry a typed reference (`design-wire-numbering.md` §3).
- **Double-clicking** a link end jumps to its partner, as now.

### What it prints

- **The wire's label** (number, then colour), since on a wire one unit long there's no room for it on the wire itself.
- **Its own label**, such as `FAN FAIL`. A destination shows its source's label unless *Same label as its source* is unticked.
- **Its partner's place in brackets**, `(9-18)`. Brackets always mean a place; a bare number is always a wire.

The wire keeps its number and its colour across the pair: it's one wire.

### How it looks

See `mockups\link-ends.png`.

- **Source:** the outline of an arrowhead, pointing away from the wire.
- **Destination:** the outline of an arrow's tail, notched at the back, pointing into the wire.
- **Both are outlines.** Today's destination is a solid black arrowhead, which is too heavy on the sheet. The two are told apart by shape, and both point the way the signal runs: together they're one arrow cut in two.
- **Not linked yet:** the same shape with a line struck through it, and no place in brackets. It's struck through on paper as well as on screen, and *Check* reports it, as it reports an unpaired arrow today.

## 4. Markers

**A link end isn't a place a marker goes.** A wire that runs across two sheets is one wire with two ends, each on a terminal, and has two markers.

Today the Markers schedule is built from the lines as drawn, so it counts a marker at each link arrow. In the QA project that's 34 rows too many, one for each of its 34 arrows. (A wire made of two arrows dropped on terminals, with no line, gets no markers at all; that case goes away with §3.)

Markers are counted per connection: once at each real end.

## 5. Existing drawings

**Nothing is carried over.** Ferrule is a pre-release in progress, and there's no requirement for a drawing made in one build to open in the next (ruled 26 Nov 2026). No conversion is written for this change, and no special handling for an arrow sitting on a terminal.

- The built-in examples are made by scripts, and are rebuilt in any build that needs it.
- As it happens, this change needn't break a drawing whose arrows all have a wire drawn to them: what's underneath a link end is what was underneath the arrow. That's a convenience, not a promise.

## 6. Settled

1. *(Settled 26 Nov 2026: the two shapes take the footprint of today's arrow.)*
2. *(Settled 26 Nov 2026: the* Source *tick stays on a link end, as the arrow has it today. Drawing one backwards is acceptable, and the tick swaps the pair.)*
3. *(Settled 26 Nov 2026, for testing: a wire that ends in a link end and is too short for its label prints none of its own; the link end prints it.)*
4. *(Dropped 26 Nov 2026: no backwards compatibility. See §5.)*
5. *(Dropped 26 Nov 2026: Claude's tools simply change to match; nothing is kept for old use.)*
6. *(Settled 26 Nov 2026: the strike-through on an unlinked end is the diagonal slash in `mockups\link-ends.png`.)*

## 7. To look at in QA, once built

The points where this design could read worse than what it replaces. Judge them on a printed sheet, not on screen.

- **Label length.** The joined label is longer than the number or the colour alone, so a tight spot gets tighter. Look at short drops off a rail, and at wires one grid unit apart.
- **Bare supply tags beside terminal numbers.** A wire tagged `1` landing by pin 1 of a breaker (`design-wire-numbering.md` §2a and §6). Tags can be dragged; a box round every wire number was raised as a further step.
- **A link end carrying the label for a short wire** (§6, point 3). Is it clear the label belongs to the wire, with the link end's own label and bracketed place beside it?
- **The two shapes at print size.** Do the outline head and the notched tail tell apart at the footprint of today's arrow, and does the strike-through read as "not linked"?
