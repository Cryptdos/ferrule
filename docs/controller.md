# Field IO and controllers: design

**Status:** draft, second round. Builds on [design-v0.2.md](design-v0.2.md) §8 and §9. Decisions from the first review (22/11/26) are folded in; what's still open is in [§11](#11-still-to-decide).

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
| Supply | — | L/N/E, +V/-V, 24 V AC | Power to the device |
| Comms | — | A, B, screen; or a port | RS485, BACnet MS/TP, Modbus, KNX |

- **Shared commons** (`⊥`, `C1`) are one pin used by several points, drawn once.
- **Universal IO (UIO, UI)** is set per point to one of the forms above, as on the real kit.

## 4. Building devices

### Plant

Plant keeps what it has: prefix tag, description, information lines, views, power by others. Its terminal groups become points. The quick entry (`L N E | R1: C NO NC | R2: C NO NC`) stays for speed. Behind it is a **pins table** (number, id, group, point, form), which is the real editor and the one that suits controllers.

### Controllers

A controller is a device of kind **controller**:

- **Prefix A.** A project decision: IEC 81346-2 would class a controller as K, but A is what reads naturally for an outstation on these drawings. It's overridable per project like any prefix, and noted in [designations](designations.md).
- **Modules** in rail order, each from one of the **generic module types** Ferrule ships:

| Type | Channels | Notes |
|---|---|---|
| Power supply | — | Supply in, supply out |
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
- **Point references** are `tag:module.point`, e.g. `A2-23:3.DI2`, so channels numbered per module (Trend) and per controller (Siemens) both work. A controller with one module drops the module: `A2-23:DI2`.

## 5. On the drawing

### Controller views: top of the sheet, terminals underneath

A controller view sits **at the top of the sheet**, with its **terminals along the bottom**: the reverse of plant, whose terminals are along the top. Wires drop straight down from the controller and rise straight up to the plant. The layout follows the Schneider/Lloret module sheets:

```
 A2-23            MODULE 3             SCHNEIDER ELECTRIC   SXWAOVBXX10001
┌──────────────────────────────────────────────────────────────────────┐
│                          ANALOGUE OUTPUTS                             │
│      AO1             AO2             AO3            AO4   …           │
│  VO  RET  CO     VO  RET  CO     VO  RET  CO    …                     │
│   1   2    3      4   5    6      7   8    9    …                     │
└───o───o────o──────o───o────o──────o───o────o─────────────────────────┘
```

- **Title row:** controller tag, module number and type, maker and model when known.
- **Group heading** (e.g. *Analogue outputs*, *Universal IO*), then per channel: group, pin ids, pin numbers, terminals.
- **Point labels** (what each one does on this job) under the terminals, along the wire: `TPEF/09/01 E/FAN SPEED CONTROL`.
- **One view per module** is the usual case. A module too wide for the sheet **continues** on the next with a break mark, as in the Trend example.
- In simulation each channel shows its state where the Trend drawing has its LEDs (§6).

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
- **Plant outputs** (a DPS, a fault relay): click to toggle, or **follow** another thing with an optional delay ("proven 5 s after SF-01 runs"). Following is the only automatic behaviour.
- Analogue outputs aren't simulated.

### Inputs: expected or not

Each input (a controller DI, or a UI used as one; or a plant input) can have an **expectation**: when it should be on. While simulating, its terminal shows:

| Colour | Means |
|---|---|
| **Green** | It sees what was expected (on when it should be, off when it shouldn't) |
| **Red** | It doesn't: something is wired, linked or drafted wrong |
| Grey | No expectation set: shows on or off only |

**Expectations are one plain sentence**, chosen from lists:

> `A2-23:3.DI2` should be **on** when **K3-12** is **energised**

- *Things*: a coil (energised), a contact (closed), a plant point or DO (on), a lamp (lit).
- Two conditions can be joined with **and** or **or**. Nothing more: no maths, no timers.
- An input's sensed state comes from the circuit: a dry input is on when its loop to its common is closed; a powered input when its pin is live.

**Check logic** gains a mode that tries every combination of outputs and plant states and reports any input that goes red, with the shortest way to get there and a replay.

### Seeing it

- Channels show their state at the module (a dot, as in the Trend LEDs: filled when on).
- The simulation panel lists every device's points by module, with live states and colours. Red inputs come first. Clicking one jumps to it.

## 7. Points list

An **IO schedule** (the job's points list) exported as CSV with the terminal and cable schedules:

| Controller | Module | Point | Form | Pins | Label | Wired to | Sheet |
|---|---|---|---|---|---|---|---|
| A2-23 | 3: DI-8 | DI2 | Dry input | 3, C1 | SF-01 running | SF-01:Running | 9-41 |
| A2-23 | 4: DO-8 | DO1 | Contact | 11, 12 | SF-01 enable | via 9-41 → 3-34 | 3-34 |

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

## 11. Still to decide

1. **Module numbering in references:** `A2-23:3.DI2` (module number, then point) as proposed, or would you write it differently on site?
2. **Expectations for plant inputs** (e.g. "SF-01's run input should be on when K3-34 is energised"): useful as well, or controllers only?
3. **Module view width:** one module per view, continuing onto the next sheet when wide. Or would you sometimes want a whole controller's modules side by side across one sheet?
4. **Channel state dots** on the drawing during simulation (like the Trend LEDs), or colour the terminals only?

## 12. Phases

1. **IO points for plant:** pins table and quick entry, forms, click and follow, expectations with green/red, the simulation panel. Replaces plant groups.
2. **Link workflow** (§5): useful everywhere, and needed before controllers multiply the arrows.
3. **Controllers:** generic module types, the generator, library models, module views at the top of the sheet, references, the IO schedule, GA placement, checks, Check logic for red inputs.
4. **MCP tools** for all of the above.
5. **Later:** network drawings for comms.
