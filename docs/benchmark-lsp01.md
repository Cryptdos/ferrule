# Benchmark: LSP-01 Life Safety Panel

The gold-standard test for the tool. The tool must reproduce this 12-sheet drawing set, fully tool-assisted, with every tag, wire number, cross-reference and label generated rather than typed.

**The control logic in the original is not trusted.** The panel is believed to have had functional bugs. Treat sheets 8–9 as a layout and drafting reference, not a correct design.

This is a sanitised description of a real panel. The original drawing is **not** to be stored in this repo. All project names, company names, people, drawing numbers and dates have been removed. Plant has been renamed, and relay and terminal numbers are left for the tool to generate.

## Plant

| Tag | Description |
|---|---|
| LSP-01 | Life safety panel (the panel being drawn) |
| SF-01 | Supply fan 1, 1.73 kW, 3.48 A FLC, 3-phase |
| SF-02 | Supply fan 2, same as SF-01 |
| EF-01 | Extract fan 1, same rating |
| EF-02 | Extract fan 2, same rating |
| DPS-SF-01 / DPS-SF-02 | Differential pressure switches proving supply airflow |
| DPS-EF-01 / DPS-EF-02 | Differential pressure switches proving extract airflow |
| FA | Fire alarm system (volt-free interlock contact, by others) |

Each fan has a local isolator in the field.

## Drawing conventions

- The original is A3 landscape, with columns 0–9 across the top and rows A–E down the side. Ferrule reproduces it on A4 landscape using its own grid (DESIGN.md §4a).
- Title block along the bottom: status ticks (Provisional / For approval / Issued for construction / As built / As fitted), revision table, drawing number, sheet x of y, title, panel title, client.
- A thick horizontal bar near the bottom of each sheet is the terminal rail and the panel boundary. Panel internals sit above it, field plant below it, joined by dashed field cables.
- Each functional area is enclosed in a dashed **section box** with a label in the top-left corner.
- Power rails L1, L2, L3, N run across the top of power sheets. Control rails CCT (24 V AC) and 0V run across the top and bottom of control sheets.
- Relay coils sit in a row on the 0V rail, and their contacts hang above them.
- Lamps show a colour letter (A amber, G green, R red, W white) and a lamp-test (LT) link.
- Revisions are marked with a revision cloud.

## Sheets

**1. Cover sheet.** Logo, project, title, client, engineer, date, drawing number, sheet count and revision.

**2. Main incoming section.** 415 V 3-phase + N incoming supply from the top. Door-interlocked main isolator, 63 A. 80 A distribution blocks on L1, L2, L3 and N. Rails continue to the next sheets. A 4 A fuse feeds an amber "POWER ON" lamp from L1–N.

**3–6. Fan starter sections, one sheet per fan** (SF-01, SF-02, EF-01, EF-02). These are identical apart from tags, so the tool should stamp them from one section template.
- Door-interlocked 40 A isolator, with auxiliary poles breaking CCT and 0V to the section.
- Three 10 A fuses, then a 3-pole contactor, then terminals to the field local isolator and motor.
- The contactor coil is driven by an enable signal from the controls section via a terminal pair.
- A green "RUNNING" lamp is switched by a contactor auxiliary contact.
- A second auxiliary contact gives a run signal back to the controls section via a terminal pair.
- The section box label and motor label must come from the fan's tag.

**7. Controls section: supplies.**
- CMCB1, 6 A type D, double pole, feeding a 13 A single socket for a portable computer.
- PMCB1, 6 A type D, double pole, feeding TX1, a 240/24 V 300 VA transformer with an earthed screen. SMCB1, 10 A type D, on the secondary side creates the CCT and 0V rails.
- White "CONTROL CIRCUIT HEALTHY" lamp across CCT–0V.
- Fire alarm relay FR coil, fed through the field fire alarm interlock terminals.
- Red "FIRE ALARM ACTIVATED" lamp via an FR contact.
- "LAMP TEST" push button from CCT to the LT rail.

**8. Controls section: supply fans duty/standby.**
- Running relays, one per fan, energised by each fan's run signal.
- Enable relays, one per fan, selected through an AUTO/TEST keyswitch and a SF-01/SF-02 duty selector keyswitch, with an FR contact and the fans-fail latch in the path. *(Exact keyswitch wiring to be confirmed against the original.)*
- Airflow proving: each enable relay feeds that fan's DPS. The DPS energises a "proven" relay. While a fan is enabled but not proven, a delay-on timer (10 s) runs.
- Fans-fail latch: either timer's contact, or the latch's own contact, energises a fans-fail relay through a normally closed "FANS TRIP RESET" push button.
- Red "SF-01 TRIPPED" and "SF-02 TRIPPED" lamps.
- Terminal outputs: enable signals and running signals to sheets 3 and 4, plus volt-free fire alarm system monitoring contacts per fan.
- The proving and timer area is revision-clouded.

**9. Controls section: extract fans duty/standby.** Identical to sheet 8 for EF-01 and EF-02, linked to sheets 5 and 6.

**10. General arrangement.** Panel 800 mm wide, with a 1000 mm main section, 400 mm fan sections and a 1000 mm controls section. Shows door-mounted lamps, switches, labels and isolator handles.

**11. Door labels: power section.** Panel name, "POWER SECTION", a "DANGER 400V – ISOLATE ELSEWHERE BEFORE OPENING DOOR" warning label, the POWER ON lamp, and a RUNNING lamp plate for each fan with its tag.

**12. Door labels: controls section.** CONTROL CIRCUIT HEALTHY, LAMP TEST, FIRE ALARM ACTIVATED, plus for each fan group: the AUTO/TEST keyswitch, duty selector, both TRIPPED lamps and FANS TRIP RESET.

## Pass criteria

1. All 12 sheets are reproduced with the same layout and readability.
2. Every tag, wire number, terminal number and cross-reference is generated by the tool.
3. Section titles, motor labels and door labels come from plant tags. Copy-paste tag mismatches must be impossible.
4. Sheets 3–6 come from one section template, and sheets 8–9 from one controls template.
5. The simulator runs the duty/standby, airflow-proving, timer trip and fans-fail latch logic as drawn, and exposes any faults in it. Finding real bugs in the original counts as a pass for the simulator, not a failure of the drawing test.
6. The set exports to a clean A4 PDF with the title block filled from project data.

## Status (milestone 9)

The set is rebuilt in [`src/bench/lsp01.ts`](../src/bench/lsp01.ts), using only Ferrule's core operations (the same ones behind the editor and the MCP tools). Open it in Ferrule from the project picker (*add the LSP-01 example*), or write it to a file with `bun scripts/build-lsp01.ts projects/lsp-01.ferrule.json`.

It was built from this sanitised description alone. The original drawings stayed out of the session, so layout matches the description rather than the original sheets.

| Criterion | Result |
|---|---|
| 1. All 12 sheets, same layout and readability | 12 sheets in the original order, A4. Readability judged on the exported PDF. Needs a side-by-side look against the original. |
| 2. Every tag, wire number, terminal number and cross-reference generated | Yes. Nothing is typed; renumbering again changes nothing (tested). |
| 3. Section titles, motor labels, door labels from plant tags | Yes. Every plant name on every sheet is a `{plant:…}` field (tested: no literal plant tags in any label, title or section). |
| 4. Sheets 3–6 from one template, 8–9 from one | Yes ("Fan starter section", "Fans duty/standby controls"). Cross-sheet links (CCT/0V feeds, enable loops, run signals, the fire alarm relay's contacts) are made after stamping. |
| 5. Simulator runs the logic and exposes faults | Yes (milestone 10). Duty/standby, airflow proving, the 10 s fail timer and the fans-fail latch run as drawn across sheets 3–9 (tested). The search proves SF-01 and SF-02 are never enabled together. It also exposes a fault: see below. |
| 6. Clean A4 PDF, title block from project data | Yes, including revision B with a cloud on sheet 8. |

`check` reports nothing: no errors and no warnings.

### Assumptions to confirm against the original

- **Keyswitches (sheets 8–9).** Enable path drawn as: CCT → (AUTO/TEST keyswitch in TEST, *or* fire alarm relay FR energised) → fans-fail relay NC → duty selector (changeover: position 1 → fan 1 enable relay, position 2 → fan 2).
- **Fire alarm relay.** FR is taken to be energised when the fire alarm is active (its contact lights FIRE ALARM ACTIVATED), so in AUTO the fans run on alarm.
- **Enable and run signals** between controls and starter sheets are drawn as paired off-page arrows rather than terminal pairs, because both ends are inside the panel.
- **Tripped lamps** are lit by each fan's fail timer contact, as the description reads.

### Fault found by the simulator

With the fire alarm active and the duty fan's airflow not proven, the fail timer runs out after 10 s and the fans-fail relay latches, as intended. But the latch also drops the enable relays, which resets the fail timer, and the TRIPPED lamp is driven by that timer's contact. **So the TRIPPED lamp lights for an instant and goes straight out: the operator never sees which fan failed.** The standby fan isn't started either, because the latch opens the common enable path. If the original works like the description, this is a real bug. A per-fan trip latch would fix it, driving its own TRIPPED lamp and changing over to the standby fan.
- **Lamp test.** The LAMP TEST button feeds an LT rail on sheet 7; per-lamp test links aren't drawn yet.
- **Volt-free fire alarm monitoring** contacts (running relay NO per fan) are on sheets 8–9, to separate fire-alarm interface plant FA-SF / FA-EF.
- **General arrangement (sheet 10)** shows the section widths given (1000 / 4×400 / 1000 mm) and door items. No heights were given, so it's not to scale.
