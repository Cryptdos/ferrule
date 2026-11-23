# Field IO and controllers: design

**Status:** agreed design (reviewed 22/11/26). Phases 1 and 2 are built (step 8a; phase 2 came with step 5). Phase 3 was built in step 8b (8b1 and 8b2), with its MCP tools (phase 4). Network drawings (phase 5) are for later. Builds on [design-v0.2.md](design-v0.2.md) §8 and §9. The decisions taken in review are listed in [§11](#11-decisions-from-review).

## 1. What this is for

Two things bring signals into a control panel and take them out:

- **Plant:** field equipment by others: fans, dampers, lifts, fire alarm interfaces, pressure switches.
- **Controllers:** the BMS outstation or PLC in the panel, built from modules of inputs and outputs.

Both get **one model: IO points**, so they're drawn, wired, scheduled and simulated the same way. A controller is a device that lives in the panel and is built from modules.

**What simulation is for here:** proving the drawing is wired and linked right before the panel is built. It's not a controller emulator: no analogue values, no strategy. Outputs are clicked; inputs say whether they see what you expected, in green or red.

## 2. Terms

| Term | Meaning |
|---|---|
| **Device** | A plant item or a controller. Has a tag, a description and points. |
| **Module** | Part of a controller: power supply, host, or an IO card. Has a type, a channel count and a GA size. |
| **Pin** | One terminal on the device: a **number** (`61`), an optional **id** (`Y1`, `C`, `VO`) and an optional **group** (`IO1`, `AO1`). |
| **Point** | One signal made of pins, e.g. `DI2` (pins 3 and C1) or `Airflow proven` (C, NO). |
| **Direction** | **In**: the device senses it (a controller DI, a starter's run input). **Out**: the device switches it (a DO, a DPS contact). Always from the device's side. |

## 3. Pins and points

### Three layers on a pin

Real kit labels its terminals in up to three layers, and the drawing should show the same:

| Layer | Trend IQ5 IO module | Siemens DXR2 | Schneider AO module | Required? |
|---|---|---|---|---|
| Group | `IO1` | | `AO1` | No |
| Id | `IO1`, `C` | `D1`, `X1`, `⊥`, `V+` | `VO`, `RET`, `CO` | No |
| Number | `1`, `2` | `31`, `33` | `1`, `2`, `3` | **Yes** |

The pin **number** is what's wired, so it's always there. The id and group are shown when present. A device with only numbers (most plant) just shows numbers.

### Forms

| Form | Direction | Pins | Example |
|---|---|---|---|
| Contact | Out | C + NO, C + NC, or C + NO + NC | DPS, lift fault relay, relay DO |
| Powered output | Out | Output + common | 24 V DO, triac DO |
| Dry input | In | Input + common | DI sensing a volt-free contact |
| Powered input | In | Input + common | 24 V DI, a starter's 230 V run input |
| Analogue | In or out | Signal + common | AI, AO, UI used for 0–10 V, 4–20 mA, NTC. Drawn and scheduled, **not simulated** |
| Supply in | In | L/N/E, +V/-V, 24 V AC | Power to the device |
| Supply out | Out | L/N, +V/-V, 24 V AC | Power **from** the device: an inverter's EPS output, a PSU's 24 V, a controller's 24 V auxiliary output for powering DIs and field devices |
| Comms | — | A, B, screen; or a port | RS485, BACnet MS/TP, Modbus, KNX |

- **Shared commons** (`⊥`, `C1`) are one pin used by several points, drawn once.
- **Universal IO (UIO, UI)** is set per point to one of the forms above, as on the real kit.
- **Supply out points are sources.** Each picks a distribution from the project's list (design-v0.2 §2), e.g. `L (EPS)` or `24V DC aux`, and in simulation energises it. It's live when the device is on: clicked on and off like an output, or following the device's own supply in (a PSU is on when its input is). This replaces drawing a stand-in *Incoming supply* next to plant that provides power, as was needed for the inverter on ATS-1.
- **PSUs, DC UPSs and batteries are plant**, built from ordinary points: no special part, no special type. They need nothing new beyond one thing, *follows* using the same plain conditions as expectations (up to two, joined with **and** / **or**), so one condition language serves both. For example, a DC UPS with a separate battery:

  | Plant | Point | Form | Behaviour |
  |---|---|---|---|
  | DC UPS | Mains (L, N, PE) | Supply in | |
  | | Battery (BAT+, BAT-) | Powered input | |
  | | Output (+V, -V) | Supply out, `24V DC` | Follows: **Mains on or Battery on** |
  | | AC fail | Contact C/NO/NC | Follows: **Mains off** |
  | | DC OK | Contact | Follows: **Output on** |
  | | Battery low, Charger fail | Contact | Clicked (faults to test with) |
  | Battery | +, - | Supply out, `24V DC` | Clicked: on = charged, off = flat |

  The battery is wired to the UPS's BAT terminals like any other circuit, so a fuse in BAT+ simulates naturally: blow it and the UPS loses its backup. Charging and discharging aren't modelled; a battery is charged or flat, by click. The battery and the UPS output share their distribution, so feeding the same DC bus from both is not a short.

  **Ethos check:** everything here is points, forms, *follows* and wiring that plant already uses. A PSU is the same with no battery points; a controller's 24 V auxiliary output is just a supply out point. If a device ever needs more than this to simulate, the answer is to wire it from simpler plant, not to add options.
- **Inputs and sources.** A dry input needs no source: the controller senses its own loop. A powered input needs one, usually the controller's own 24 V auxiliary output (a supply out point) or a PSU, wired round through the field contact like any other circuit.

## 4. Building devices

### Plant

Plant keeps what it has: prefix tag, description, information lines, views, power by others. Its terminal groups become points. The quick entry (`L N E | R1: C NO NC | R2: C NO NC`) stays for speed. Behind it is a **pins table** (number, id, group, point, form), which is the real editor and the one that suits controllers.

### Controllers

A controller is a device of kind **controller**:

- **Prefix A.** A project decision: IEC 81346-2 would class a controller as K, but A is what reads naturally for an outstation on these drawings. It's overridable per project like any prefix, and noted in [designations](designations.md).
- **Modules** in rail order, each from one of the **generic module types** Ferrule ships:

| Type | Channels | Notes |
|---|---|---|
| Power supply | — | Supply in, supply out (a controller's own power module; stand-alone PSUs and UPSs are plant) |
| Host | — | The controller's base: supply, comms ports, often some IO |
| DI-*n* | *n* dry or powered inputs | |
| DO-*n* | *n* contacts or powered outputs | |
| UIO-*n* | *n* universal | Each set to a form |
| AI-*n* | *n* analogue inputs | |
| AO-*n* | *n* analogue outputs | |

- ***n* is a setting**, like a contactor's poles: one DI module type gives DI-4, DI-8, DI-16.
- **The module generator** fills the pins table from a pattern, so a module takes seconds:
  - channels: *n*;
  - pins per channel and their ids, e.g. `VO RET CO`, or `IO C`, or `Y ⊥` with the `⊥` shared by two channels;
  - the first pin number, and the group name pattern (`AO#` → AO1, AO2…).

  After generating, the table can be edited by hand for oddities (the DXR2's `V+`, a shared `⊥`).
- **From datasheets.** Real models (a Trend IQ5-IO/16UIO, a DXR2.E18) are entered once from the datasheet with the generator and table, then saved in the device library with their GA size and datasheet. Ferrule ships no makers' data.
- **Every module has its own tag**, by where its view is drawn, like any other part: a DI module drawn at sheet 3, column 23 is `A3-23`. The tag tells you straight away which sheet to turn to.
- **Point references** are `module tag:point`, e.g. `A3-23:DI2`. That works whether the maker numbers channels per module (Trend) or per controller (Siemens), and matches how it's said on site: "this controller, DI2", with the tag saying where it is.
- **A reference always lands where the point is.** Engineers learn to read `A3-23` as "sheet 3, column 23" and expect to find what they're after right there; that must never fail. So when a point is drawn on a continuation of its module (a split view, below), every reference to it adds where *that point* is drawn: `A3-23:DO5 (4-10)`. That applies on link arrows, contact tables, expectations and the IO schedule, and double-clicking jumps there. Points on the module's first view need nothing extra: `A3-23:DO2` is at 3-23.
- **One module, one tag.** A split module is still one physical module with one label, so it keeps one tag (from its first view) on the GA, its label and the schedule. The continuation's title row says where it carries on from: `A3-23 · DO-8 · DO5–8, continued from 3-23`. (Considered and set aside for now: giving each part of a split module its own tag. It makes references land in the right place too, but names one module two ways. To be revisited if B doesn't work out in use.)
- **The controller as a whole** is its modules together. It has a description (e.g. *AHU-1 outstation*) and is identified by its host module's tag; the modules list it in their title row (*part of A2-5, AHU-1 outstation*). The GA places its modules together.

## 5. On the drawing

### Controller views: top of the sheet, terminals underneath

A controller view sits **at the top of the sheet**, with its **terminals along the bottom**: the reverse of plant, whose terminals are along the top. Wires drop straight down from the controller and rise straight up to the plant. The layout follows common practice for controller module sheets:

```
 A2-23            MODULE 3             SCHNEIDER ELECTRIC   SXWAOVBXX10001
┌──────────────────────────────────────────────────────────────────────┐
│                          ANALOGUE OUTPUTS                             │
│      AO1             AO2             AO3            AO4   …           │
│  VO  RET  CO     VO  RET  CO     VO  RET  CO    …                     │
│   1   2    3      4   5    6      7   8    9    …                     │
└───o───o────o──────o───o────o──────o───o────o─────────────────────────┘
```

- **Title row:** the module's tag, its type, maker and model when known, and the controller it belongs to (`A3-23 · DI-8 · part of A2-5, AHU-1 outstation`).
- **Group heading** (e.g. *Analogue outputs*, *Universal IO*), then per channel: group, pin ids, pin numbers, terminals.
- **Point labels** (what each one does on this job) under the terminals, along the wire: `TPEF/09/01 E/FAN SPEED CONTROL`.
- **Views show chosen channels**, like plant views. A module can be split across as many views and sheets as it needs to keep sheets well spaced: a DO-8 with all its terminals might take two sheets, DO1–4 on one and DO5–8 on the next. A split view shows a break mark at its cut edge, as in the Trend example. The module's tag comes from its first view.
- In simulation each channel's terminal boxes are coloured by its state (§6).

### Controller map (Annotate)

A **Controller map** table, from Annotate's *Tables* next to the revision list and symbol legend, draws a controller's modules in rail order, one box per module:

```
┌────────────────┐┌────────────────┐┌────────────────┐┌ ─ ─ ─ ─ ─ ─ ─ ┐
│ A3-23       ③  ││ A4-10       ④  ││ A5-2        ⑤  │    SPARE   ⑥
│ SCHNEIDER      ││ SCHNEIDER      ││ SCHNEIDER      │    I/O
│ SXWDI16XX10001 ││ SXWDO12X10001  ││ SXWUI16XX10001 │
│ DI-16          ││ DO-12          ││ UIO-16         │
│ 3-23, 4-10     ││ 4-10           ││ 5-2            │
└────────────────┘└────────────────┘└────────────────┘└ ─ ─ ─ ─ ─ ─ ─ ┘
```

- Each box: the module's tag, its **address** in a circle (its position on the controller's bus, from rail order unless set by hand to match the DIP switches), maker, model and type, and **where it's drawn**: every view's sheet-column, so a split module lists both parts.
- **Spare slots** are part of the controller's module list and drawn dashed (*Spare I/O*).
- It fills itself from the controller and keeps up to date, like the legend. Wraps onto more rows to fit its width.
- Usually placed on the controller's first sheet, or a spare sheet of its own.

This answers "where's that module?" at a glance, so day-to-day work can go by terminals while the tags stay consistent for anyone who wants them.

### All connections go to the module

Every point's wiring is drawn **at the module**, outputs included. A DO that enables a fan starter is wired from the module's DO pins out through a **link arrow** to the starter circuit, and switched there. On site you check a controller by looking at its modules, so every one of its connections should be on that sheet. It's the same reason plant shows all its cores. (This replaces the first draft's "contacts linked to the output".)

### Linking, made quicker

All that linking has to be easy (also design-v0.2 §6):

- Select a link arrow and click **Link…** in its properties.
- Navigate anywhere: other sheets, zoom, pan. A bar says *Linking from 9-41: click the arrow to link to. Esc cancels.*
- Click the target arrow. They're paired; the target becomes the destination, and takes the source's label (default on).
- Also **Link to a new arrow**: drop a fresh partner arrow wherever you click, already paired.

## 6. Simulation: proving wiring and logic

### Outputs: click them

- **Controller DOs:** click to toggle. The contact closes or opens (or the powered output goes live), and the circuit reacts.
- **Plant outputs** (a DPS, a fault relay, a UPS output): click to toggle, or **follow** up to two conditions joined with and/or, with an optional delay ("proven 5 s after SF-01 runs", "on when Mains on or Battery on"). The conditions are written exactly like expectations. Following is the only automatic behaviour.
- Analogue outputs aren't simulated.

### Expectations: one way to check the whole drawing

An **expectation** is a plain statement about how the drawing should behave. It's checked live while you simulate, and exhaustively by **Check logic**. It replaces the separate "never both on" rules: one checking idea for everything.

Two kinds:

> **`A3-23:DI2` should be on when `K3-12` is energised**
>
> **Never: `K3-23` energised and `K3-56` energised**

- **Should be … when …** belongs to an input: a controller DI (or a UI used as one), or a **plant input**, such as SF-01's run input should be on when K3-34 is energised. That checks plant against controllers and panel logic, as well as controllers against plant.
- **Never …** can name anything: two contactors of a changeover, a fan running while its fire damper is shut.
- *Things and states:* a coil (energised), a contact (closed), a point or DO (on), a lamp (lit). Up to two conditions joined with **and** or **or**. No maths and no timers.
- Expectations are kept with the project in one list (**Expectations…** beside Check), and each input also shows its own in its properties.

While simulating:

| | Means |
|---|---|
| Input terminal **green** | It sees what its expectation says |
| Input terminal **red** | It doesn't: something is wired, linked or drafted wrong |
| Input terminal grey | No expectation: on or off only |
| **Never** statement comes true | Warning bar with the statement, and the parts involved ringed red |

An input's sensed state comes from the circuit: a dry input is on when its loop to its common is closed; a powered input when its pin is live.

**Check logic** tries every combination of outputs, plant states and operator inputs, and reports any expectation that can fail, with the shortest way to get there and a replay.

### Seeing it

- **Terminal boxes are coloured** by state at the module: filled when on, green or red when the point has an expectation. No separate LED dots.
- The simulation panel lists every device's points by module, with live states and colours. Red inputs come first. Clicking one jumps to it.

## 7. Points list

An **IO schedule** (the job's points list) exported as CSV with the terminal and cable schedules:

| Controller | Module | Point | Form | Pins | Label | Wired to |
|---|---|---|---|---|---|---|
| A2-5 AHU-1 outstation | A3-23 (DI-8) | DI2 | Dry input | 3, C1 | SF-01 running | SF-01:Running (9-41) |
| A2-5 AHU-1 outstation | A4-10 (DO-8) | DO1 | Contact | 11, 12 | SF-01 enable | via link 4-12 → 3-34 |

Plant points have a schedule of their own: device, point, pins, what they're wired to.

## 8. GA

A controller is placed on the GA as its modules side by side on a rail, sized from their library entries (or generic sizes per type and channel count). *To place* lists the controller as one item that places all its modules.

## 9. Comms

RS485 and other comms are **pins and groups only**: drawn on the module and plant views, wired like anything else, listed in the schedules, not simulated.

**For later: network drawings.** A sheet type that draws a bus as a flow diagram: controller → plant A → plant B → terminals, with the termination resistor and screen continuity marked, built from the comms wiring already on the schematic. Worth designing once controllers are in use.

## 10. Checks

- A dry input wired to a live conductor (voltage onto a volt-free input): **error**.
- An expectation naming something that doesn't exist: **error**.
- An input wired to nothing: **warning**.
- A DO wired to nothing: **info** (spare).
- An analogue point wired to a digital one: **warning**.

## 11. Decisions from review

| Question | Decision |
|---|---|
| Vendor data | Generic module types only; makers' models entered from datasheets into the library |
| Controller position | Top of the sheet, terminals along the bottom (the reverse of plant) |
| Pin labelling | Three layers: number (always), id, group |
| Outputs that switch panel circuits | Wired at the module, out through link arrows: every connection on the module's sheet |
| Prefix | A (project decision, noted in designations) |
| References | Modules tagged by where they're drawn; points `A3-23:DI2`; a point drawn on a continuation adds its own position, `A3-23:DO5 (4-10)`, so a reference always lands where the point is |
| Simulation | A wiring and logic check, not an emulator: click outputs, follow with delay, no analogue, no rules language |
| Expectations | One system: "should be … when …" for inputs (controller and plant), "never …" for anything; replaces "never both on" rules |
| Module views | Split across views and sheets as needed, like plant |
| State display | Colour the terminal boxes |
| Finding modules | A Controller map table (Annotate): modules in rail order with tag, bus address, maker, model, type, where each is drawn, and spare slots |
| Comms | Pins and groups only; network drawings later |

## 12. Phases

1. **IO points for plant and expectations:** pins table and quick entry, forms, click and follow, expectations (should be / never) with green/red, the simulation panel. Replaces plant groups and the "never both on" rules.
2. **Link workflow** (§5): useful everywhere, and needed before controllers multiply the arrows.
3. **Controllers:** generic module types, the generator, library models, module views at the top of the sheet, references, the controller map, the IO schedule, GA placement, checks, Check logic for red inputs.
4. **MCP tools** for all of the above.
5. **Later:** network drawings for comms.
