# Design note: the Design workbench

For v0.5.0-pre. Ruled 27 Nov 2026, from testing build 0.4.5 and working through mock-ups.

This note is the one place to build from for entries **A38, A66, A67, A68, A69 and A70** in `advancements-v0.5.md`; A57, A71 and A72 came out of settling it. The order they're built in is `design-v0.5.md` step 8. A62 and A63 are folded into A67, and A15 is withdrawn. Where an entry and this note disagree, this note is right.

## 1. Why

Design is the hardest part of the work for an engineer, so it carries only what's needed to design the plant and the controller, and each thing is set in one place.

On build 0.4.5 that isn't so:

- A point is edited in three places: its channel in the table, its form in the plant's Properties, and its form again, with how it simulates, in *Pins and points…*.
- A plant's Properties runs to about forty boxes for a drive with five points.
- A controller is split between a view and a *Controller…* window, with Generate opening as a row inside the window's table.
- A real device can only be picked in Layout, for something already placed on a GA. That's left over from before Design existed.
- Voltages and loads are typed in Draft, in Design and on the device.

## 2. The rule

1. **Pick a thing, and Properties shows that thing.** Nothing else is in it.
2. **Nothing is set in two places.** Where a value is shown somewhere it isn't set, it's shown as text with a way to get to where it's set.
3. **A thing has at most three parts:** its Properties, its terminals (plant and modules), and its device.

## 3. The views and their buttons

Design has five views, in this order along the bar: **Plant, Controller, Devices, Network, To draw.** *Devices* is new, and the first is renamed Plant: it was *Table*, which said nothing of what's in it.

| View | Row two, after the views, Check and Export points schedule |
|---|---|
| Plant (was Table) | `+ System`, `+ Plant`, `+ Point`, *Duplicate ×n…*, *Templates…* |
| Controller | `+ Module ▾`, *Unallocate*, *Suggest…* |
| Devices | `+ Device`, *From the library…*, *Set picked to…* |
| Network | As now |
| To draw | As now |

Windows that **go**: *Controller…*; *Pins and points…*; *Device table…* in Layout.

Windows that open from Design: *Terminals…* (new, a window, so it docks under A32) and *Templates…*. *Duplicate ×n* and *Suggest…* are prompts as now.

## 4. What Properties shows

| Picked | Where | Properties holds |
|---|---|---|
| A system | Plant view | As now: name, move up and down, delete |
| A plant item | Plant view: click its tag or description | Tag, description, prefix, system, connects by (with protocol and network when it has comms), mark (A66), information, *In the panel*, *Power by others*. **Shown, not set:** its device. Buttons: *Terminals…*, *Duplicate ×n…*, *Save as template…*, *Delete plant* |
| A point of plant | Plant view: click from the point's name across | Name, form, signal, goes to, channel and whether it's wired to it. **Shown, not set:** its terminals, with *Terminals…*. In Simulate: clicked, or follows (what, on or off, after how long). Its interlocks and expectations. *Delete point* |
| The controller | Controller view: click its heading | Description, prefix, delete |
| A module | Controller view: click it on the rail | Type, channels, address, commons linked, where it's drawn. **Shown, not set:** its device. Buttons: *Terminals…*, *Save as device*, move left and right, *Delete module* |
| A channel, or a point of a module | Controller view: click it in the module's column | As a point of plant, less what doesn't apply. A channel also shows the point allocated to it, with *Unallocate*, and its label |
| A device | Devices view: click a row | The device that row has: name, maker, part number, what it suits, size, what it takes and draws, for a supply what it gives with its rating and efficiency, for a relay its number of poles, datasheets and pictures. *Takes* is a value with a choice beside it: V AC, V DC or both. *To library*, *Delete device* |

Removed from Properties in Design altogether:

- ***Enabled by* and *Source*.** Nothing reads them: they aren't drawn, exported or checked.
- **The pins line.** It's in *Terminals…* only.
- **Voltages and loads:** a point's *Takes*, *Draw VA*, *Gives*, *Rating VA* and *Efficiency %*, and a module's *Draw (VA)*. They're on the device.
- **A module's *Maker* and *Model*.** They're its device's.

## 5. The Plant view

- **A plant and its first point share a line.** Clicking the tag or description picks the plant; clicking from the point's name across picks the point.
- **`+ Point` works as `+ Plant` does:** it adds an empty row under the picked plant, picked and ready to fill in from Properties. No prompt first. A point with no form yet is marked in the table until it has one.
- **The nine forms keep their names.** In the list, and under the box once one is picked, each says in plain words what it is and shows the channel it needs:

  | Form | Says | Needs |
  |---|---|---|
  | Contact | The device switches it: a fault, a status | DI |
  | Powered output | The device puts out a voltage | DI |
  | Dry input | On when the panel closes its loop: an enable | DO |
  | Powered input | On when the panel puts a voltage on it | DO |
  | Analogue output | A signal from the device | AI |
  | Analogue input | A signal to the device | AO |
  | Supply in | Power to the device | none |
  | Supply out | Power from the device | none |
  | Comms | RS485, Modbus… | none |

- **An interlock is on the point it's about,** in that point's Properties, not in the plant's.
- **A plant's mark** is a picture from a short list, or *Other* with up to four letters typed (A66, `mockups\plant-marks.png`).

## 6. The Controller view

- **Every module is on the rail,** drawn along the top in rail order: the host, the power supply and adapters as well as IO modules. On build 0.4.5 only IO modules show in this view.
- **`+ Module ▾`** adds one: a type and a channel count, an adapter, a module saved before as a device, or a spare slot.
- **A module is saved for next time with *Save as device*** in its Properties (it was *Save model* in the Controller… window). The device keeps the module's type, channels, terminals and points, so the next one of that model is added whole, on this job or from the shared library on another. It stays because nothing else does this: a plant template doesn't hold modules.
- **A module is dragged along the rail** to move it. Its address follows rail order unless set by hand, as now.
- **Each module has a column.** An IO module's lists its channels, as now. A module with no channels lists its points (supply in, a serial port).
- **An adapter is a new type of module** (A68). It has no channels; its terminals are entered by hand; it's drawn and laid out like any other module. It doesn't split the rail: which DIN rail a module sits on is decided in Layout, by where it's put. Power through it is set by hand, with its supply out following its supply in, the way a DC power supply is made as plant.

## 7. The Terminals window

One window, for a plant item and for a module. It takes the place of *Pins and points…*, and "pins" become "terminals" wherever they're spoken of.

It lays out the terminals and groups them into points. Nothing about a point is edited in it.

- **The list:** a grip, *Number*, *Id*, *Group*, *Point*, delete.
- ***Add terminal*** adds a row numbered one more than the highest. The number is changed in the row.
- **Rows are dragged to reorder.** The order of the list is the order they're drawn along the view.
- **Numbers never change by themselves,** after a delete or a reorder. There's no button to renumber.
- ***Point*** says which point the terminal belongs to. A name that isn't a point yet makes one, which shows in the Plant view, or in the module's column, marked until its form is set.
- **A group can be ticked as a serial port,** as now.
- **The one line** is at the bottom: `Enable: 1 2 | Run: 11 14`. It follows the list, and typing or pasting into it changes the list. It's the only place the line exists.

On an **IO module** only, a *Generate* section sits above the list. It isn't shown for plant, or for a host, power supply or adapter.

- Fields: channels; one channel's terminals; first terminal number; form; names, with `#` for the channel; counting from; a shared terminal, and how many channels it serves.
- A dash in the pattern uses up a terminal number without making a terminal.
- It says what it will make before anything changes: *Makes 16 channels and 4 shared terminals, numbered 1 to 36*.
- *Generate* replaces the list, and asks first if any of its terminals are wired.

## 8. The Devices view

Everything in the job that needs a real device, in one list, each with the device it is.

- **One row for each drawn part,** since relays aren't all the same. A part shows in the list once it's been added in Draft.
- **Terminals are listed by strip,** one row a strip, not a row a terminal.
- **Modules and plant are in the same list.** Plant in the field is there as well as plant in the panel, whether or not it's ever drawn on a GA.
- **Rows are grouped** by what they are (coils, breakers and isolators, lamps, terminal strips, the controller, plant) and groups fold. The heading counts what's left: *3 left of 25*.
- **A row's device is picked from a drop-down** of the job's devices that suit it.
- **Several rows are set at once:** tick them, or a whole group, then *Set picked to…*.
- **`+ Device`** makes a device; *From the library…* brings one in from the shared library.
- **Picking a row shows its device in Properties,** which is where a device is edited.

What follows from it:

- ***Takes* is a value and a kind,** not free text: a number, with V AC, V DC or both chosen beside it. *Gives* on a supply is the same, less *both*.
- **Draft numbers a relay's terminals, and a device doesn't change them.** A1 and A2 on the coil, 11, 12, 14 and so on by pole on its contacts, as Draft does today with no device picked. The numbers are there so the drawing reads; which pin on a real base does what is for whoever wires it.
- **A device that suits a coil has *Poles*,** a count and nothing more. It's there for Check, which warns when a relay's contacts use more poles than its device has. Nothing is drawn from it.
- **The device is the one source of what a thing takes, gives and draws** (A38). *Takes* and *Draw (VA)* come off the coil, timer coil and lamp in Draft, and voltages and loads come off Design (§4).
- **Layout places what's been picked.** A part's size comes from its device, and Layout doesn't change which device it is. In Layout a part's device is seen only in its Properties when the part is picked, for information, with a link to it in Design. A part with no device keeps the generic size it has today.
- **The bill of materials is still counted from the GA sheets.** It's for building the panel, so what's placed is what's on it. Plant in the field has a device and isn't on it.
- **A part's device isn't shown in Draft.** It has no use there.
- **A thing with no device has no draw,** and Check says so as a warning (A31).
- The device table itself stays as the store, in the project and in the shared library. What goes is its window in Layout. Other notes that speak of the device table mean this.

## 9. What comes out

For whoever builds it, the full list of what's removed, so nothing is left behind or built twice:

- The *Controller…* window, and its inline Generate row.
- The *Pins and points…* window, including its *Points* half and the *New pin number* box.
- The *Device table…* window, and its button on Layout's row.
- *Device* as a choice in a GA item's Properties. It's shown there, not set.
- The *Relay pins* line on a device (`A1 A2 | 11 12 14 | 21 22 24`), and with it a base's own numbers printed on the coil, its contacts and its contact table (DR-39). A pin map saved in an old project is ignored.
- The pins line in a plant's Properties and in Draft's Plant window, and *Pins and points…* in that window. What's left of Draft's Plant window is the list of plant and *Place view*: a small window to pick plant and place it.
- The *feeds* pickers on a plant's supply out (A57).
- *Rating (VA)* on the Incoming supply (A72).
- *Enabled by* and *Source* on plant.
- *Takes*, *Draw VA*, *Gives*, *Rating VA* and *Efficiency %* on a point; *Draw (VA)*, *Maker* and *Model* on a module; *Takes* and *Draw (VA)* on a coil, timer coil and lamp.
- The prompt that `+ Point` opens.
- The interlocks list in a plant's Properties.
- The marks Temperature, Pressure, Humidity and ΔP switch.

## 10. Mock-ups

In `mockups\`. Each is numbered in its own heading; the numbers below are those.

| No. | File | Shows |
|---|---|---|
| 1 | `terminals-1-plant.png` | The Terminals window for a plant item |
| 2 | `terminals-2-io-module.png` | The same window on an IO module, with Generate |
| 3 | `terminals-3-controller-adapter.png` | The Controller view with an adapter, and one of its points picked |
| 4 | `terminals-4-module-properties.png` | The Controller view with a module picked |
| 5 | `plant-1-plant-picked.png` | The Plant view with a plant picked |
| 6 | `plant-2-point-picked.png` | The Plant view with a point picked, and the Form list |
| 7 | `design-devices.png` | The Devices view |
| | `plant-marks.png` | The marks, as built and as ruled |

They're drawings of the idea, not of the finished screen: spacing, wording of buttons and what's folded can change in the building. What they show being set where is what's ruled.

## 11. Settled

All seven points that were open here were ruled on 27 Nov 2026:

1. **The bill of materials** stays counted from the GA sheets (§8). A table of it can be placed on a GA sheet: A71.
2. ***Save model*** stays, as *Save as device* in a module's Properties (§6).
3. **A plant supply out's *feeds*** go. A power supply is wired to its block: A57.
4. **The Incoming supply** counts as unlimited. Its *Rating (VA)* goes and its *Gives* stays: A72.
5. **Draft's Plant window** stays, cut down to picking plant and placing it (§9).
6. **A part's device isn't shown in Draft** (§8).
7. **Draft's Plant window and Design's Plant view share a name,** and that's left: both list the same plant, and they're never on screen together.

Nothing is left to confirm: the name *Save as device* and placing the bill of materials table from the Tables list (A71) were both confirmed the same day.
