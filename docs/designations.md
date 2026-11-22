# Designation prefixes

Ferrule tags components with a letter prefix from a selected standard, followed by the position address (DESIGN.md §8), e.g. `K10-16`.

## IEC 81346-2:2019 (default)

### Source and limits

Built from Table 1 (entry classes) of IEC 81346-2:2019. The copy available to us is the 15-page public preview, so:

- **Single-letter classes:** complete. Every entry class is listed below.
- **Two-letter subclasses:** only the B (sensing) and C (storing) groups are covered by the preview. The K, Q, F, S, P, M, T, W and X subclasses are in Table 2/3 of the full standard, which we don't have.

So v1 uses **single-letter prefixes**. The standard allows an object to be designated by its entry class alone. Two-letter codes can be added when we have the full standard.

### Entry classes

Class names are summarised, not quoted. See the standard for the definitions.

| Code | Class | In short |
|---|---|---|
| B | Sensing | Picks up information (sensors, switches driven by a quantity) |
| C | Storing | Stores energy, matter or information |
| E | Emitting | Emits heat, light, radiation |
| F | Protecting | Protects against dangerous or unwanted conditions |
| G | Generating | Provides a controllable flow |
| H | Matter processing | Treats matter |
| K | Information processing | Treats input signals, gives an output |
| M | Driving | Provides mechanical movement or force |
| N | Covering | Encloses another object |
| P | Presenting | Provides perceptible information |
| Q | Controlling | Controls access or flow (of energy, matter) |
| R | Restricting | Restricts or stabilises |
| S | Human interaction | Detects a human action and responds |
| T | Transforming | Transforms |
| U | Holding | Holds other objects in place |
| W | Guiding | Leads from one place to another |
| X | Interfacing | Interfaces one object to another |

- **Never used:** A, I and O. (Ferrule uses A for controllers as a project decision: see the mapping below.)
- **Reserved:** D, J, L, V, Y and Z are reserved for future standardisation. Ferrule must not offer them.

### Ferrule symbol mapping

This is our application of the class definitions to the v1 symbol set (DESIGN.md §5). Objects are classed by the function they serve in the design. The standard's examples list circuit breakers under Q, but in Ferrule's control circuits MCBs, RCBOs and RCDs are there for overcurrent and earth-fault protection, so they are F. Devices whose job is switching power (contactors, isolators) are Q.

| Symbol | Prefix | Reasoning |
|---|---|---|
| Control relay coil and its contacts | K | Processes a signal and gives an output |
| Timer relay coil and its contacts | K | As above, with time behaviour |
| Contactor (power) and its contacts | Q | Controls the flow of energy to a load |
| Isolator / switch-disconnector | Q | Controls energy flow |
| Fuse | F | Protecting |
| MCB / RCBO / RCD | F | Used for protection in control circuits (project decision; the standard's examples list breakers under Q) |
| Surge protective device | F | Listed under F |
| Push button | S | Detects a human action |
| Selector switch / keyswitch | S | Detects a human action |
| Indicator lamp | P | Indicator lights are P. Lighting lamps would be E (emitting), but those aren't in our symbol set |
| Motor | M | Driving |
| Transformer | T | Transforming |
| Terminal | X | Interfacing |
| Socket outlet | X | Interfacing |
| Earth terminal | X | Interfacing (terminals). Not listed explicitly |
| Distribution block / busbar | W | Guiding (leads energy from one place to another) |
| Cable | W | Guiding |
| Controller (BMS outstation, PLC) and its modules | **A** | **Project decision, not IEC:** the standard would class a controller as K (information processing), but A reads naturally for an outstation on these drawings. A is otherwise unused by IEC 81346-2, so there's no clash. Overridable per project |
| Differential pressure switch | B (BP) | Sensing; BP is pressure sensing, listed in the preview |
| Temperature sensor/switch | B (BT) | Sensing; BT is temperature sensing, listed in the preview |

Not tagged with a class letter:

- **Off-page / continuation arrow:** a drawing feature, not an object.
- **Plant views:** plant keeps its own user-defined tag (e.g. `SF-01`), shown on every view. If a class letter is wanted later, fans and pumps are G and actuators are M.

## BS 3939

Not yet available. BS 3939 is the older British standard and is largely superseded by the BS EN / IEC series. We need a copy of the relevant part (the letter-code tables) before writing this table. It's commonly used on older and UK-local drawings, so it's worth supporting as an option.

## Custom overrides

Per DESIGN.md §8, a project can override a prefix (e.g. `R` for relays), but this sits behind an "advanced" option and the project shows that it deviates from its standard. Overrides may not use A, I or O.
