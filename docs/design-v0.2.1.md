# Ferrule v0.2.1: design

**Status:** agreed in discussion (23/11/26) from the QA notes in `v0.2.1-pre Notes/working-points.md`. Version `0.2.1-pre`. Split view and tiling, alignment tools and icon-only buttons have moved to v0.3 (`v0.3.0-pre Notes/design-v0.3.md`).

Numbers in brackets are the note numbers in `working-points.md`.

## 1. Windows and the top bar

- **Toggle (10):** clicking a window's button while it's open closes it.
- **Esc (13):** closes the topmost window.
- **Table (16):** opens as a window like the others, from a labelled **Table** button among the menus.
- **Draft top bar (15):** undo, redo | fit, split | select, wire | Renumber, Templates, Plant, Controllers, Distribution, Table, Check, Expectations…, Schedules.
- **Icons (12):** terminal strip line, text, box and symbol legend get icons in the parts list (drawn placeholders where the part has no fixed look).
- **Dark theme (14):** a dark grey rather than black, for better contrast with the text.
- **Label width (from discussion):** always shown in properties, not hidden while a part has no label. The default stays 0 (one line) (21).

## 2. Parts and Annotate

- **Lamp colours (4):** *none* and *clear* go; white covers clear. Lamps in old files with either become white.
- **Call-outs (6):** an **Auto** tick, on by default: numbered 1, 2, 3… as placed. Untick to set the number by hand.
- **Logo (7):** the *Logo* part goes from Annotate; *Picture* switches to the project's logo in its properties.
- **Label plates (3):** on GA sheets only (the GA's own label plate). The Annotate label plate goes; you can annotate on a GA page anyway. The example's door label sheets move to label plates on its door GA.
- **Text and Markdown (8):** the *Size* dropdown goes: body text is Note (2.5 mm); `#`, `##`, `###` give Title, Heading and Note-bold. All of Markdown's basic syntax: headings, bold, italic, bold italic, blockquotes, ordered and unordered lists (nested), inline code and code blocks, horizontal rules, links (printed as text) and images (from the project's pictures). Extended: tables (already in), strikethrough and task lists.
- **No line breaks in labels (18):** wrapping is by label width only. Line breaks in existing labels become spaces.
- **Push buttons (24):** a poles count, like the selector, each pole NO or NC.
- **Selector (23):** a **position table**: each position has a name (POSITION 1 / MID / POSITION 2, with what it does, e.g. *Supply 1*, *Off*, *Supply 2*). A 2-position switch has no middle. The legend is drawn as the names, `POS1 · MID · POS2`, with the current position highlighted in Simulate.
  - **Changeover pole on a 3-position switch** (agreed), as on a maker's 2-pole drawing: a common in the middle and a contact either side, closed to the I side in I, open in 0, closed to the II side in II. Numbered by pole: pole 1 is 3, 2, 1 (common 2); pole 2 is 7, 6, 5 (common 6). This replaces today's k1/k2/k4 numbering for this pole type.
- **Cable screen (25):** no tag. Its drain tail goes: wires attach at points on its left and right.
- **Earth symbol (26):** the PE symbol redrawn with its lines centred.
- **Incoming supply flip (30):** labels in the right place when flipped (revert step 5's change for flips if that's the cause).
- **Placing (35):** `R` and `F` turn and flip a part while it's following the pointer, before it's placed.
- **Plant minimum height (36):** every plant view is at least as tall as a terminal box holding a 5-character pin name, so plant views line up.
- **Terminal strip line (1):** drawn over the terminals it crosses.
- **Colour check (31):** a button in Draft, next to Split: every wire and busbar drawn in its core colour (white with a dark edge), to check the colours are set up right. Print and PDF stay black.

## 3. Busbars split in two (22)

A distribution busbar and a control rail are different things: one is a physical part, the other a drawing convention. They become two parts:

- **Distribution block:** the physical busbar or distribution block (IEC class W). Tagged W, on a distribution, placed on the GA and counted in the bill of materials. Drawn heavy as today.
- **Control rail:** a common rail on the drawing (CCT, 0V). No tag, not a GA part. Drawn as today's control style.

Both join everything on the same distribution, as now. Existing busbars become one or the other by their style. Fixes a bug found while checking this: control busbars were offered in *Place parts…* as distribution blocks.

## 4. Terminals and numbering

- **2-unit terminals (34):** terminals on a boundary (the terminal block) and the pins of plant and controller module views are 2 units apart, not 1. Each terminal gets its own column, so two terminals no longer share one and get an `A` (29: on the example's sheet 7, 7-29 and 7-29A). It leaves room for 2.5 mm text (below) and a centred earth symbol.
- **Text sizes (37):** terminal numbers, pin numbers and wire numbers go to 2.5 mm. Contact tables and cross-references stay at 1.8 mm. Checked with a test print in the PR.
- **Earth terminals (27):** on a boundary they print no number, with the earth symbol centred in the cell.
- **Terminal order on the GA (28):** a placed strip lists its terminals by sheet, then left to right along the boundary: how it's built. Earth terminals keep a hidden position address, so schedules can still name them, and fall into place on the strip.
- **Terminals drive wire numbers (from discussion):** a wire that lands on a terminal takes that terminal's number; a wire on no terminal is numbered from its highest end, as now. One rule, applied the same way everywhere (33: no option to flip a wire's numbering source). Where a conductor reaches more than one terminal, the first along the strip wins.
  - A terminal and the wire on it always agree: you can't have terminal 7-30 with wire 7-36 coming from it. Terminals are numbered by where they are and drive the wire's number, so on sheet 7 both become the terminal's number.
- **Link arrows (17, 19, 20, 32, and 10 from discussion):** an arrow's partner reference and a wire number can read the same (an arrow showing `4-24` beside a wire numbered `4-24A`), so a technician could follow the wrong path. Agreed: we always need the wire number (it's what's physically connected), and references are vital for reading and searching, so both are shown, written differently.
  - The arrow shows the **wire number** it carries, inline with the arrow and always horizontal: before a destination arrow, after a source arrow.
  - The partner reference is written in brackets, `(4-24)`, the same way Ferrule already writes where something is drawn (`A3-23:DO5 (4-10)`). Brackets always mean "where", a bare number always means a wire.
  - Compared with other tools: they usually print the partner reference on the connector and the wire number on the wire beside it. This is the same, with the reference in a form that can't be mistaken for a wire number.
  - An arrow dropped straight onto a part's pin (no wire between) shows the number of the conductor it's on.
- **Cable screen and earth (13 from discussion):** the screen's tail goes (above); the earth terminal on a boundary loses its tag; the earth symbol part is fixed.

## 5. The logo (2)

The cable comes off: just the ferrule, its red collar, the crimped sleeve and copper at the tip. Redrawn at all three sizes.

## 6. Files

Ferrule keeps no backwards compatibility before 1.0. Drawings from 0.2 builds still open: busbars become distribution blocks or control rails, lamps with no colour or clear become white, and line breaks in labels become spaces. Terminals at 1-unit spacing move apart to 2 units along their boundary, which may need tidying by hand. The example is redrawn.

## 7. Order of work

Each step is one PR with a build (`ferrule-windows-v0.2.1-pre.zip`), as in the v0.2 sprint.

1. **Windows and top bar** (§1). First, so v0.3's tiling work can build on it.
2. **Parts and Annotate** (§2), with the logo (§5).
3. **Busbars split** (§3).
4. **Terminals and numbering** (§4): 2-unit terminals and text sizes first (with the test print), then terminal-driven wire numbers, then link arrows.

## 8. Moved to v0.3

Split view and tiling windows (9), alignment tools (5), icon-only buttons (11). See `design-v0.3.md`.

## 9. Changed during build

**Step 1 (windows and top bar)**

- **Esc on the drawing** cancels what's in progress first (a wire being drawn, a part being placed, a link being made), then closes the window on top, then clears what's picked. With the focus in a window, `Esc` closes that window, as before.
- **Table** opens as a window while in Draft; *Show* on a row goes to that part and leaves the table open.
- **Select and Wire** sit after Fit and Split on every workbench (Select only, outside Draft).
- **Dark theme:** the interface is turned dark and its contrast toned down, so white becomes a dark grey (about #1f) and black text a soft white. Pictures and previews inside are turned back as they were.
- **Icons:** Text, Symbol legend and Controller map are drawn as small pictures of what they are; Box and Terminal strip line are drawn at a small size so their lines show.
