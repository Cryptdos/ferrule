# Field IO and controllers: design

**Status:** draft for review. Builds on [design-v0.2.md](design-v0.2.md) §8 (field IO) and §9 (simulation). Open questions are collected in [§12](#12-open-questions); answers go back into the sections above them.

## 1. What this is for

Two things bring signals into a control panel and take them out:

- **Plant:** field equipment by others: fans, dampers, lifts, fire alarm interfaces, pressure switches.
- **Controllers:** the BMS outstation or PLC in the panel (Trend IQ, Siemens PXC, a generic PLC), with modules of inputs and outputs.

Both are drawn, wired, scheduled, laid out on the GA and simulated. Today plant has terminals in named groups with a few simulation settings, and controllers don't exist. This doc gives both **one model: IO points**, so they're drawn, checked and simulated the same way, and a controller is simply a plant item that lives in the panel and has modules.

**Ethos check.** No new kind of drawing object is needed: a controller is drawn with views like plant, its outputs reuse the contact part, and everything else reuses terminals, wires, schedules and the GA.

## 2. Terms

| Term | Meaning |
|---|---|
| **Device** | A plant item or a controller. Has a tag, a description and points. |
| **Module** | Part of a controller: the CPU/base, an IO card, a power supply. Has a model, points and a GA size. |
| **Point** | One signal or connection, e.g. `DO3`, `Airflow proven`, `24V supply`. Owns the terminals it uses. |
| **Direction** | **In**: the panel drives it, the device sees it (a run command, a controller DI). **Out**: the device drives it, the panel sees it (a DPS contact, a controller DO). Always from the device's side. |
| **Form** | How the point is wired electrically (§3). |
| **Behaviour** | How an out point decides its state in simulation (§7). |

## 3. Points

### Forms

| Form | Direction | Terminals | Example |
|---|---|---|---|
| Volt-free contact | Out | C + NO, C + NC, or C + NO + NC | DPS proving switch, lift fault relay, controller relay DO |
| Powered output | Out | Output + common (0V/N) | 24 V DC DO, triac DO, lamp driver |
| Dry input | In | Input + common | Controller DI sensing a volt-free contact; plant "enable" input |
| Powered input | In | Input + common | 230 V coil input of a starter by others; 24 V DI |
| Analogue in | In | Signal + common | Controller AI/UI: 0–10 V, 4–20 mA, NTC/PT1000 |
| Analogue out | Out | Signal + common | Controller AO: 0–10 V to a damper or valve |
| Supply | — | L/N/E, +V/-V | Power to the device |
| Comms | — | A/B/screen, or a port | RS485, BACnet MS/TP, Modbus |

- **Shared commons.** Several points can share a common terminal (most DI cards: eight inputs, one or two commons). A point names its common, and the common terminal is drawn once.
- **Terminal names** come from the device (`11`, `14`, `C`, `NO`, or the maker's numbering), so the drawing matches the kit.
- **Universal inputs (UI)** are configured per point as dry input or analogue in. That's what a UI is on real kit.

### Point fields

```ts
interface Point {
  id: string;
  name: string;          // "DO3", "Airflow proven", "24V supply"
  label: string;         // what it does on this job: "SF-01 run command"
  dir: "in" | "out" | "none";
  form: "contact" | "powered-out" | "dry-in" | "powered-in" | "analog-in" | "analog-out" | "supply" | "comms";
  terminals: string[];   // e.g. ["C", "NO", "NC"] or ["13", "14"]
  common?: string;       // a shared common terminal, if any
  signal?: string;       // analogue: "0-10V", "4-20mA", "NTC10k", "PT1000"
  range?: [number, number]; units?: string;  // analogue: 0–100 %, 0–50 °C
  sim?: Behaviour;       // §7, out points only
}
```

## 4. Plant under the new model

Plant keeps everything it has (prefix tag, description, information lines, views, power by others). **Terminal groups become points.** The plant dialog's terminal field (`L N E | R1: C NO NC | R2: C NO NC`) stays as the quick way in: each group becomes a point, and you then set its form and direction in the points table.

| Plant | Points |
|---|---|
| Lift | `R1 Fault` (out, contact C/NO/NC), `R2 Running` (out, contact), supply (by others) |
| DPS | `Airflow proven` (out, contact C/NO, follows its fan's run command after 5 s) |
| Fire alarm interface | `Fire` (out, contact C/NC, manual) |
| Fan starter by others | `Run` (in, dry input), `Running` (out, contact, follows Run), `Fault` (out, contact, manual) |
| Damper actuator | `Command` (in, analogue 0–10 V), `Open` (out, contact, follows Command > 90 %) |

Today's group roles, follows, delay and invert settings map directly onto points, so nothing is lost. They're replaced, not kept alongside (no compatibility before 1.0).

## 5. Controllers

### Building one

A controller is a device of kind **controller**:

- Tag prefix **K** (information processing, per [designations](designations.md)). Tagged like everything else: prefix plus sheet-column of its first view, e.g. `K12-3`, or a typed tag.
- **Modules**, in order on its rail: the base/CPU first, then IO cards. Each module comes from a **model** and gets a GA size from it.
- **Points** come from the modules: an 8 DI card gives `DI1`…`DI8` with their terminals and shared commons.
- Point references are `tag:point`, e.g. `K12-3:DO3`. That's how other parts, schedules and rules refer to them.

### Models live in the device library

A controller or IO module model is a **device library entry** (design-v0.2 §8) with a channel layout added:

```
Model: Generic 8DI/8DO/8UI/4AO      size 105 × 90 × 60 mm
  DI1–DI8:  dry input,  terminals 1–8,   common C1 (terminal 9)
  DO1–DO8:  contact,    terminals 11/12 … 25/26 (C/NO)
  UI1–UI8:  universal,  terminals 31–38, common 0V (39)
  AO1–AO4:  analogue out 0–10V, terminals 41–44, common 0V (45)
  Supply:   24V AC/DC, terminals G, G0
  Comms:    RS485 A, B, screen
```

- Writing a model once makes it available to every project that uses the library, with its datasheet attached.
- Ferrule ships **generic models only** (a base with mixed IO, 8 DI, 8 DO, 8 UI, 4 AO cards). Makers' models are entered by users from their datasheets; I'd rather not ship and maintain vendor data, and terminal numbering is easy to get subtly wrong.
- A project that doesn't use the library builds its controller from generic modules, or describes channels by hand, as plant points are.

## 6. On the drawing

### Controller views

A controller is drawn with **views**, like plant: a view shows one module, or chosen points, on a sheet. It sits **above the panel boundary** (it's in the panel). The layout follows the plant views:

- terminal boxes along the top, with point names over them (`DI1 DI2 … C1`);
- the point's label under each point (`SF-01 RUN`, `AHU FROST`);
- the module and controller tag under the box (`K12-3 · Module 2: 8DI`);
- hidden points give the box a break line, as plant views do.

Field wiring runs from the view's terminals to the terminal block and out to the plant, like any other wiring.

### Outputs that switch panel circuits

A BMS output usually *enables* something inside the panel, e.g. a DO's contact in a fan starter circuit. There are two ways to draw that:

- **A. Everything on the view.** The DO's terminals are on the controller view, and wires run from there to the starter circuit. Simple, but a sheet's wiring crosses to wherever the controller view is.
- **B. Contacts linked to the output (recommended).** The DO's contact is drawn *in the circuit it switches*, as an ordinary contact linked to `K12-3:DO3`, exactly like a relay contact linked to its coil. The contact takes the DO's terminal numbers. The controller view shows `DO3` with a cross-reference to where its contact is (`→ 9-41`) instead of terminals.

B is how relays already work in Ferrule (coil in one place, contacts where they act, cross-referenced both ways), so it adds no new idea and gives cleaner sheets. A DO not drawn elsewhere just shows its terminals on the view (A). Inputs are always drawn on the view: a field contact is wired to them.

### Analogue

Sensors (temperature, pressure) are plant: a `BT` temperature sensor with a `Signal` point (analogue, NTC10k), wired to the controller's UI. No new symbols: plant views show them as plant boxes, as today.

## 7. Simulation

### What a digital point does

| Form | In simulation |
|---|---|
| Contact (out) | Its contacts are open or closed by its state, like a relay's |
| Powered output (out) | When on, its output terminal is live at its supply's voltage |
| Dry input (in) | On when its terminal and its common are connected through a closed circuit (a field contact) |
| Powered input (in) | On when its terminal is live relative to its common |
| Analogue in (in) | Reads a value you set (slider, in its units) |
| Analogue out (out) | Its value is set by its behaviour or by hand |

### Behaviour of out points

Each out point has one behaviour:

| Behaviour | Settings | Example |
|---|---|---|
| **Manual** | — | Fire alarm contact, a fault relay: you click it |
| **Follows** | Point, on delay, off delay, invert | DPS: proven 5 s after the run command, drops 2 s after |
| **Rule** | An expression | Controller DO: `DO1 = DI3 and not DI4` |

**Rules** stay deliberately small. They simulate a controller's basic strategy; they don't replace its real program:

```
value  :=  point | number | true | false | ( value )
test   :=  value [ = != > < >= <= ] value
expr   :=  test | not expr | expr and expr | expr or expr
rule   :=  expr [ after 5s ] [ for 2s ]
```

- `after` delays turning on; `for` holds on after the expression goes false.
- Points are named by their own name on the same device (`DI3`) or `tag:point` anywhere else (`K12-3:AI1`, `SF-01:Running`).
- An analogue out's rule gives a number: `AO1 = 100 if DI1 else 0`. Anything richer is out of scope.

### Forcing and seeing it

- **Force** any out point on or off (or to a value), as on a BMS front end. A forced point is outlined on the drawing and listed at the top of the simulation panel with its forced value, until released.
- The simulation panel groups points by device and module, with live states. Clicking one jumps to its view.
- **Check logic** treats manual points as inputs to try, and follows/rule points as part of the logic.

## 8. Schedules

An **IO schedule**, exported as CSV with the terminal and cable schedules:

| Device | Module | Point | Type | Terminals | Label | Wired to | Sheet |
|---|---|---|---|---|---|---|---|
| K12-3 | 2: 8DI | DI3 | Dry input | 3, C1 | SF-01 running | SF-01:Running | 9-41 |
| K12-3 | 3: 8DO | DO1 | Contact | 11, 12 | SF-01 enable | Contact at 3-34 | 3-34 |

For a BMS engineer this is the points list for the job, and it comes straight off the drawing.

## 9. GA

A controller is placed on the GA as its modules side by side on a rail, each sized from its model. Parts not yet on a GA (design-v0.2 §8) list the controller as one item that places all its modules together.

## 10. Checks

- A dry input wired to a live conductor (voltage onto a volt-free input): **error**.
- An out point with a rule that names a point that doesn't exist: **error**.
- A powered input with nothing able to energise it, or an in point wired to nothing: **warning**.
- A DO with no contact drawn and no wiring: **info** (spare output).
- An analogue point wired to a digital point: **warning**.

## 11. MCP

New tools for Claude: `add_controller` (model and modules), `set_point` (form, label, behaviour), `place_controller_view`, `link_contact_to_point`, and `io_schedule`. `add_plant` takes points.

## 12. Open questions

1. **Outputs that switch panel circuits:** B (contacts linked to the output, cross-referenced like relays) as recommended, with A for outputs not drawn elsewhere?
2. **Prefix K** for controllers, or would you rather a different letter on your drawings?
3. **Generic models only**, makers' models entered by users from datasheets? Or should Ferrule ship a few common ones (e.g. Trend IQ4 and its IO modules, Siemens PXC)? Shipping them means keeping their terminal numbering right.
4. **Rules:** is this small expression language enough for what you'd want to try on a drawing, or do you need timers and latches inside rules (e.g. a run-on after stop)?
5. **Comms** (RS485 and so on): just terminals on the view for now, with no network drawing or simulation. OK?
6. **Analogue simulation** comes after digital (phase 3 below). OK to wait?

## 13. Phases

1. **IO points for plant.** The model, the points table in the plant dialog, the three behaviours, forcing, the new simulation panel. Replaces plant groups.
2. **Controllers, digital.** Devices of kind controller, modules from the library, views, contacts linked to outputs, dry and powered DIs, the IO schedule, GA placement, checks.
3. **Analogue.** AI/AO/UI values, sliders, thresholds in rules, analogue plant (sensors, actuators).
4. **MCP tools** for all of the above.
