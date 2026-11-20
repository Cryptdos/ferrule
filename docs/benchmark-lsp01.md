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

- A3 landscape, columns 0–9 across the top, rows A–E down the side.
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
6. The set exports to a clean A3 PDF with the title block filled from project data.
