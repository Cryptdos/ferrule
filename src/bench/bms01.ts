/**
 * Fixture BMS-01 (design-v0.4.x §3, step 0): a generic BMS panel, invented
 * throughout, standing in for the private drawing the v0.4.x findings came
 * from. It reproduces the structures those findings were about, so each step
 * of the sprint has a before and after picture:
 *
 * - an incomer, a 24 V power supply and a battery drawn as plant inside the
 *   panel, feeding the 24DC and 0V distributions;
 * - three fire alarm interface relays and an enable circuit two relays deep;
 * - two drives on a serial bus, two fans, two dampers with end switches;
 * - a controller (host, power supply module, DI-16, UIO-16, AO-8, DO-8), each
 *   module on its own sheet with its field devices below the boundary;
 * - comms-only meters on a second bus;
 * - long project tags and four-word descriptions;
 * - two interlocks, one of which needs an exception (all of two conditions);
 * - a door and a backplate GA.
 *
 * Laid out from coordinates and left untidied on purpose: it's the "before"
 * picture. Not shipped in the exe; written to a file by scripts/build-bms01.ts.
 */
import type { Avoid } from "libavoid-js";
import { refreshConductors } from "../core/conductors";
import { addController, addModule, placeModulesOnGa } from "../core/controllers";
import { addInterlock, addInterlockCondition, addSystem, allocate, setPlantDesign, updateInterlock } from "../core/design";
import { ENCL, fitScale, gaCandidates } from "../core/ga";
import type { Vec } from "../core/geometry";
import { type Distribution, type Element, type IoPoint, type Page, type ParamValue, type PlantItem, type Project, newProject } from "../core/model";
import { addNetwork, placeNetworkSheet, putOnNetwork } from "../core/network";
import {
  addDistribution,
  addElement,
  addGaDim,
  addGaItem,
  addGaPage,
  addPage,
  addPlant,
  addSection,
  connect,
  linkContact,
  placePlantView,
  setBoundary,
  updateProjectInfo,
  updateRevision,
} from "../core/ops";
import { pointRef } from "../core/points";
import { renumber } from "../core/renumber";
import { routePage } from "../core/routing";

type End = [Element, string];

export interface Bms01 {
  project: Project;
  /** Plant by a short name, for tests. */
  plant: Record<string, PlantItem>;
  /** Controller modules by type. */
  modules: Record<"host" | "psu" | "di" | "uio" | "ao" | "do", PlantItem>;
}

export function buildBms01(avoid: Avoid | null): Bms01 {
  const p = newProject("bms-01", "Example Office Building");
  updateProjectInfo(p, {
    panelName: "BMS-01 AIR HANDLING CONTROL PANEL",
    client: "Example Client",
    jobNo: "J0002",
    drawingNo: "BMS01-E",
    drawnBy: "FERRULE",
    drawnDate: "24/11/26",
  });
  updateRevision(p, 0, { date: "24/11/26", drawnBy: "FERRULE", description: "First issue" });

  // --- Systems and plant ------------------------------------------------------
  const AHU = addSystem(p, "AHU-01 Air handling unit");
  const FIRE = addSystem(p, "Fire alarm interface");
  const METERS = addSystem(p, "Energy metering");
  const sys = (it: PlantItem, s: string) => {
    setPlantDesign(p, it.id, { system: s });
    return it;
  };
  const pt = (name: string, form: IoPoint["form"], pins: string[], more: Partial<IoPoint> = {}): IoPoint => ({ name, form, pins, ...more });

  // Inside the panel: the power supply and its battery, drawn as plant (there's no supply symbol).
  const PSU = addPlant(p, "PSU-01", "24 V DC power supply unit", ["L", "N", "+", "-", "B+", "B-"], {
    points: [pt("Mains", "supply-in", ["L", "N"]), pt("24V out", "supply-out", ["+", "-"]), pt("Battery", "powered-out", ["B+", "B-"])],
  });
  const BAT = addPlant(p, "BAT-01", "Sealed lead acid standby battery", ["+", "-"], { points: [pt("Charge", "supply-in", ["+", "-"])] });
  // Both are in the panel (T3): not field plant.
  setPlantDesign(p, PSU.id, { inPanel: true });
  setPlantDesign(p, BAT.id, { inPanel: true });

  // Fire alarm interface (by others) and the firemans override.
  const FA = sys(
    addPlant(p, "FA-IF-01", "Fire alarm interface unit by others", ["1", "2", "3", "4"], {
      points: [pt("Healthy", "contact", ["1", "2"]), pt("Stage two", "contact", ["3", "4"])],
      powerByOthers: true,
    }),
    FIRE,
  );
  const FOS = sys(addPlant(p, "FOS-01", "Firemans override key switch", ["1", "2"], { points: [pt("Override", "contact", ["1", "2"])] }), FIRE);

  // Drives and fans.
  const driveTerms = ["DI1", "DCOM", "RO1C", "RO1A", "RO2C", "RO2A", "AI1", "AGND", "A+", "B-", "U", "V", "W", "PE"];
  const drive = (tag: string, desc: string) =>
    sys(
      addPlant(p, tag, desc, driveTerms, {
        // Its comms terminals are a serial port (M7).
        pins: { "A+": { group: "Modbus", port: true }, "B-": { group: "Modbus", port: true } },
        points: [
          pt("Enable", "powered-in", ["DI1", "DCOM"]),
          pt("Run", "contact", ["RO1C", "RO1A"]),
          pt("Fault", "contact", ["RO2C", "RO2A"]),
          pt("Speed", "analogue-in", ["AI1", "AGND"]),
          pt("Modbus", "comms", ["A+", "B-"]),
        ],
      }),
      AHU,
    );
  const SFD = drive("AHU-01-SF-01-VSD", "Supply fan variable speed drive");
  const EFD = drive("AHU-01-EF-01-VSD", "Extract fan variable speed drive");
  // Running follows the enable, so proofs have something to follow.
  for (const d of [SFD, EFD]) d.points!.find((x) => x.name === "Run")!.follows = [{ ref: pointRef(d.id, "Enable"), on: true }];
  const SF = sys(addPlant(p, "AHU-01-SF-01", "Supply air fan motor", ["U", "V", "W", "PE"]), AHU);
  const EF = sys(addPlant(p, "AHU-01-EF-01", "Extract air fan motor", ["U", "V", "W", "PE"]), AHU);

  // Dampers: 24 V spring return, open when powered, with end switches that follow.
  const damper = (tag: string, desc: string) => {
    const it = sys(
      addPlant(p, tag, desc, ["1", "2", "S1", "S2", "S4", "S5"], {
        points: [pt("Power", "supply-in", ["1", "2"]), pt("Open", "contact", ["S1", "S2"]), pt("Closed", "contact", ["S4", "S5"])],
      }),
      AHU,
    );
    const pw = pointRef(it.id, "Power");
    it.points![1]!.follows = [{ ref: pw, on: true }];
    it.points![1]!.delay = 5;
    it.points![2]!.follows = [{ ref: pw, on: false }];
    return it;
  };
  const DMP1 = damper("AHU-01-DMP-01", "Supply air shutoff damper actuator");
  const DMP2 = damper("AHU-01-DMP-02", "Extract air shutoff damper actuator");

  // Sensors, a valve and the airflow switches. Long tags, on purpose.
  const sensor = (tag: string, desc: string) => sys(addPlant(p, tag, desc, ["S", "C"], { points: [pt("Value", "analogue-out", ["S", "C"], { signal: "thermistor" })] }), AHU);
  const TT1 = sensor("AHU-01-TT-01", "Supply air temperature sensor");
  const TT2 = sensor("AHU-01-TT-02", "Extract air temperature sensor");
  const TT3 = sensor("AHU-01-TT-03", "Outside air temperature sensor");
  const HT1 = sensor("AHU-01-HT-01", "Extract air humidity sensor");
  const dps = (tag: string, desc: string) => sys(addPlant(p, tag, desc, ["C", "NO"], { points: [pt("Proven", "contact", ["C", "NO"], { signal: "volt-free" })] }), AHU);
  const DPS1 = dps("AHU-01-DPS-25-44", "Supply fan airflow pressure switch");
  const DPS2 = dps("AHU-01-DPS-25-45", "Extract fan airflow pressure switch");
  const FLT = dps("AHU-01-DPS-25-46", "Supply filter dirty pressure switch");
  const VLV = sys(
    addPlant(p, "AHU-01-VLV-01", "Heating coil valve actuator", ["24", "0", "Y"], {
      points: [pt("Power", "supply-in", ["24", "0"]), pt("Position", "analogue-in", ["Y", "0"], { signal: "0–10 V" })],
    }),
    AHU,
  );

  // Comms only: meters on their own bus. No pins.
  const meter = (tag: string, desc: string) => {
    const it = sys(addPlant(p, tag, desc), METERS);
    setPlantDesign(p, it.id, { connects: "comms", protocol: "Modbus RTU" });
    return it;
  };
  const M1 = meter("EM-01", "Main incoming energy meter");
  const M2 = meter("EM-02", "Mechanical services energy meter");

  // Networks.
  const drivesBus = addNetwork(p, "bus", "Modbus RTU");
  drivesBus.name = "Drives bus";
  for (const d of [SFD, EFD]) setPlantDesign(p, d.id, { connects: "both", protocol: "Modbus RTU" });
  putOnNetwork(p, [SFD.id, EFD.id], drivesBus.id);
  const metersBus = addNetwork(p, "bus", "Modbus RTU");
  metersBus.name = "Meters bus";
  putOnNetwork(p, [M1.id, M2.id], metersBus.id);

  // --- The controller ------------------------------------------------------------
  const ctrl = addController(p, "Building controller", "A");
  const modules = {
    host: addModule(p, ctrl.id, { type: "host", maker: "Generic", model: "HC-100" }),
    psu: addModule(p, ctrl.id, { type: "psu", maker: "Generic", model: "PS-24" }),
    di: addModule(p, ctrl.id, { type: "di", channels: 16, maker: "Generic", model: "DI-16X" }),
    uio: addModule(p, ctrl.id, { type: "uio", channels: 16, maker: "Generic", model: "UIO-16X" }),
    ao: addModule(p, ctrl.id, { type: "ao", channels: 8, maker: "Generic", model: "AO-8X" }),
    do: addModule(p, ctrl.id, { type: "do", channels: 8, maker: "Generic", model: "DO-8X" }),
  };
  // The host's two serial ports: terminals with nothing to simulate.
  modules.host.terminals = ["1", "2", "3", "4", "5", "6"];
  modules.host.pins = {
    "1": { id: "A+", group: "COM A" },
    "2": { id: "B-", group: "COM A" },
    "3": { id: "GND", group: "COM A" },
    "4": { id: "A+", group: "COM B" },
    "5": { id: "B-", group: "COM B" },
    "6": { id: "GND", group: "COM B" },
  };
  for (const pin of Object.values(modules.host.pins)) pin.port = true;
  // The universal inputs taking sensors are analogue.
  for (const q of modules.uio.points!.slice(0, 4)) q.form = "analogue-in";
  // Points used in the panel's own circuits, not on a channel.
  const panelOnly = (it: PlantItem, ...names: string[]) => {
    for (const q of it.points ?? []) if (names.includes(q.name)) q.goesTo = "panel";
  };
  panelOnly(PSU, "Battery");
  panelOnly(FA, "Healthy", "Stage two");
  panelOnly(FOS, "Override");
  panelOnly(SFD, "Enable");
  panelOnly(EFD, "Enable");
  panelOnly(DMP2, "Open");
  // Each bus is on one of the host's serial ports (T5).
  drivesBus.port = { plant: modules.host.id, group: "COM A" };
  metersBus.port = { plant: modules.host.id, group: "COM B" };
  const ch = (m: PlantItem, name: string) => ({ module: m.id, point: name });
  const al = (it: PlantItem, point: string, m: PlantItem, channel: string) => allocate(p, it.id, point, ch(m, channel));
  al(SFD, "Run", modules.di, "DI1");
  al(SFD, "Fault", modules.di, "DI2");
  al(EFD, "Run", modules.di, "DI3");
  al(EFD, "Fault", modules.di, "DI4");
  al(DPS1, "Proven", modules.di, "DI5");
  al(DPS2, "Proven", modules.di, "DI6");
  al(DMP1, "Open", modules.di, "DI7");
  al(DMP1, "Closed", modules.di, "DI8");
  al(DMP2, "Closed", modules.di, "DI10");
  al(TT1, "Value", modules.uio, "IO1");
  al(TT2, "Value", modules.uio, "IO2");
  al(TT3, "Value", modules.uio, "IO3");
  al(HT1, "Value", modules.uio, "IO4");
  al(FLT, "Proven", modules.uio, "IO5");
  al(SFD, "Speed", modules.ao, "AO1");
  al(EFD, "Speed", modules.ao, "AO2");
  al(VLV, "Position", modules.ao, "AO3");

  // --- Distributions -------------------------------------------------------------
  const D = {
    L: addDistribution(p, { name: "L", kind: "line", voltage: "230 V", colour: "Bn", function: "L" }),
    N: addDistribution(p, { name: "N", kind: "neutral", voltage: "", colour: "Bu", function: "N" }),
    V24: addDistribution(p, { name: "24DC", kind: "dc+", voltage: "24 V DC", colour: "Rd", function: "24V DC" }),
    V0: addDistribution(p, { name: "0V", kind: "dc0", voltage: "0 V", colour: "Wh", function: "0V" }),
  };
  PSU.points![1]!.follows = [{ ref: pointRef(PSU.id, "Mains"), on: true }];
  PSU.points![2]!.follows = [{ ref: pointRef(PSU.id, "Mains"), on: true }];
  // What the supplies give and the loads take (M11).
  PSU.points![0]!.accepts = [{ v: 230, ac: true }];
  PSU.points![1]!.gives = { v: 24, ac: false };
  for (const it of [DMP1, DMP2, VLV]) it.points![0]!.accepts = [{ v: 24, ac: true }, { v: 24, ac: false }];
  modules.psu.points![0]!.accepts = [{ v: 24, ac: false }];

  // --- Drawing helpers -------------------------------------------------------------
  let page: Page = p.pages[0]!;
  const add = (symbol: string, x: number, y: number, opts: { rot?: 0 | 90 | 180 | 270; label?: string; params?: Record<string, ParamValue> } = {}) =>
    addElement(p, page.id, symbol, [x, y], opts);
  const w = (a: End, b: End) => connect(p, page.id, [a[0].id, a[1]], [b[0].id, b[1]]);
  const tap = (rail: Element, x: number): End => [rail, String(x - rail.pos[0])];
  const bus = (d: Distribution, x: number, y: number, length: number) => add("busbar", x, y, { params: { dist: d.id, length } });
  const rail = (d: Distribution, x: number, y: number, length: number) => add("rail", x, y, { params: { dist: d.id, length, bothEnds: true } });
  const term = (x: number, y: number) => add("terminal", x, y);
  const view = (it: PlantItem, x: number, y: number, show?: string[]) => placePlantView(p, page.id, it.id, [x, y], show);
  const tag = (it: PlantItem) => `{plant:${it.id}.tag}`;
  /** A field device's two pins, out through two boundary terminals to two ends in the panel. */
  const field = (a: End, b: End, dev: Element, pa: string, pb: string, x: number) => {
    const ta = term(x, 70);
    const tb = term(x + 2, 70);
    w(a, [ta, "1"]);
    w([ta, "2"], [dev, pa]);
    w([dev, pb], [tb, "2"]);
    w([tb, "1"], b);
  };
  /** A module channel's two pins. */
  const chPins = (m: PlantItem, name: string) => m.points!.find((x) => x.name === name)!.pins;

  // ===========================================================================
  // Sheet 1: incoming supply and 24 V DC. No boundary: the power supply and
  // battery are inside the panel.
  page.title = "Incoming supply and 24 V DC";
  addSection(p, page.id, "INCOMING SUPPLY AND 24 V DC", [2, 2, 146, 84]);
  const inc = add("supply", 14, 8, { label: "230V 1PH+N 50Hz SUPPLY", params: { system: "1ph-n", gives: "230 V AC" } });
  const qMain = add("isolator", 14, 18, { label: "32A MAIN ISOLATOR", params: { poles: 2, aux: 0, operator: "door" } });
  w([inc, "L"], [qMain, "1"]);
  w([inc, "N"], [qMain, "3"]);
  const bL = bus(D.L, 10, 28, 60);
  const bN = bus(D.N, 10, 31, 60);
  w([qMain, "2"], tap(bL, 14));
  w([qMain, "4"], tap(bN, 17));
  const fPsu = add("isolator", 30, 38, { label: "6A TYPE C", params: { function: "breaker", poles: 2, operator: "none" } });
  w(tap(bL, 30), [fPsu, "1"]);
  w(tap(bN, 33), [fPsu, "3"]);
  const psu = view(PSU, 30, 52);
  w([fPsu, "2"], [psu, "L"]);
  w([fPsu, "4"], [psu, "N"]);
  const bat = view(BAT, 70, 52);
  w([psu, "B+"], [bat, "+"]);
  w([psu, "B-"], [bat, "-"]);
  const r24 = rail(D.V24, 20, 70, 120);
  const r0 = rail(D.V0, 20, 80, 120);
  w([psu, "+"], tap(r24, 34));
  w([psu, "-"], tap(r0, 36));
  const h24 = add("lamp", 100, 75, { label: "24V DC HEALTHY", params: { colour: "Gn" } });
  w(tap(r24, 100), [h24, "+V"]);
  w([h24, "-V"], tap(r0, 100));
  const fSock = add("isolator", 52, 38, { label: "10A TYPE C", params: { function: "breaker", poles: 2, operator: "none" } });
  w(tap(bL, 52), [fSock, "1"]);
  w(tap(bN, 55), [fSock, "3"]);
  const sock = add("socket", 52, 50, { label: "13A SOCKET" });
  w([fSock, "2"], [sock, "L"]);
  w([fSock, "4"], [sock, "N"]);
  const pe = add("earth", 60, 50, { params: { type: "protective" } });
  w([sock, "E"], [pe, "E"]);

  // ===========================================================================
  // Sheet 2: fire alarm interface. Three relays, and the enable two relays deep.
  page = addPage(p, "Fire alarm interface and enables");
  setBoundary(p, page.id, 70);
  addSection(p, page.id, "FIRE ALARM INTERFACE AND AHU-01 ENABLES", [2, 2, 146, 66]);
  let c24 = rail(D.V24, 4, 6, 140);
  let c0 = rail(D.V0, 4, 62, 140);
  const faView = view(FA, 12, 76);
  const fosView = view(FOS, 36, 76);
  const kfHealthy = add("coil", 12, 52, { label: "FIRE ALARM\nHEALTHY RELAY" });
  const kfStage2 = add("coil", 24, 52, { label: "FIRE ALARM\nSTAGE TWO RELAY" });
  const kfOverride = add("coil", 36, 52, { label: "FIREMANS\nOVERRIDE RELAY" });
  field(tap(c24, 12), [kfHealthy, "A1"], faView, "1", "2", 12);
  field(tap(c24, 16), [kfStage2, "A1"], faView, "3", "4", 16);
  field(tap(c24, 36), [kfOverride, "A1"], fosView, "1", "2", 36);
  for (const k of [kfHealthy, kfStage2, kfOverride]) w([k, "A2"], tap(c0, k.pos[0]));
  // AHU-01 enable: BMS enable relay, then (fire alarm healthy OR firemans override), then the enable relay.
  const kcBms = add("contact", 56, 14);
  const kfH = add("contact", 56, 26);
  const kfO = add("contact", 64, 26);
  const keAhu = add("coil", 56, 52, { label: "AHU-01\nENABLE RELAY" });
  w(tap(c24, 56), [kcBms, "13"]);
  w([kcBms, "14"], [kfH, "13"]);
  w([kcBms, "14"], [kfO, "13"]);
  w([kfH, "14"], [keAhu, "A1"]);
  w([kfO, "14"], [keAhu, "A1"]);
  w([keAhu, "A2"], tap(c0, 56));
  linkContact(p, kfH.id, kfHealthy.id);
  linkContact(p, kfO.id, kfOverride.id);
  const hFire = add("contact", 80, 26);
  const hFireLamp = add("lamp", 80, 52, { label: "FIRE ALARM\nACTIVATED", params: { colour: "Rd" } });
  w(tap(c24, 80), [hFire, "13"]);
  w([hFire, "14"], [hFireLamp, "+V"]);
  w([hFireLamp, "-V"], tap(c0, 80));
  linkContact(p, hFire.id, kfStage2.id);
  const fireSheet = page;

  // ===========================================================================
  // Sheet 3: supply and extract fans, their drives, and the dampers.
  page = addPage(p, `${tag(SFD)} and ${tag(EFD)}: drives and dampers`);
  setBoundary(p, page.id, 70);
  addSection(p, page.id, "AHU-01 SUPPLY AND EXTRACT FANS, DAMPERS", [2, 2, 146, 66]);
  c24 = rail(D.V24, 4, 6, 140);
  c0 = rail(D.V0, 4, 62, 140);
  const sfd = view(SFD, 14, 76, ["DI1", "DCOM"]);
  const efd = view(EFD, 54, 76, ["DI1", "DCOM"]);
  const d1 = view(DMP1, 100, 76, ["1", "2"]);
  const d2 = view(DMP2, 120, 76, ["1", "2"]);
  // Dampers open from the AHU enable relay.
  const keD1 = add("contact", 100, 20);
  const keD2 = add("contact", 120, 20);
  field([keD1, "14"], tap(c0, 104), d1, "1", "2", 100);
  field([keD2, "14"], tap(c0, 124), d2, "1", "2", 120);
  w(tap(c24, 100), [keD1, "13"]);
  w(tap(c24, 120), [keD2, "13"]);
  linkContact(p, keD1.id, keAhu.id);
  linkContact(p, keD2.id, keAhu.id);
  // Supply drive: AHU enable. Extract drive: AHU enable and its damper proven open (the damper's own end switch, on sheet 4).
  const keS = add("contact", 14, 20);
  w(tap(c24, 14), [keS, "13"]);
  field([keS, "14"], tap(c0, 18), sfd, "DI1", "DCOM", 14);
  linkContact(p, keS.id, keAhu.id);
  const keE = add("contact", 54, 14);
  const kdOpen = add("contact", 54, 28);
  w(tap(c24, 54), [keE, "13"]);
  w([keE, "14"], [kdOpen, "13"]);
  field([kdOpen, "14"], tap(c0, 58), efd, "DI1", "DCOM", 54);
  linkContact(p, keE.id, keAhu.id);
  // Fans: drawn below the boundary, on their drives' motor terminals.
  const sfv = view(SF, 40, 76);
  const efv = view(EF, 80, 76);
  const sfdM = view(SFD, 26, 76, ["U", "V", "W", "PE"]);
  const efdM = view(EFD, 66, 76, ["U", "V", "W", "PE"]);
  for (const t of ["U", "V", "W", "PE"]) {
    w([sfdM, t], [sfv, t]);
    w([efdM, t], [efv, t]);
  }

  // ===========================================================================
  // Sheet 4: damper end switches to the open relay (the extract fan waits for it).
  page = addPage(p, `${tag(DMP2)} proven open`);
  setBoundary(p, page.id, 70);
  addSection(p, page.id, "EXTRACT DAMPER PROVEN OPEN", [2, 2, 146, 66]);
  c24 = rail(D.V24, 4, 6, 60);
  c0 = rail(D.V0, 4, 62, 60);
  const d2s = view(DMP2, 20, 76, ["S1", "S2"]);
  const kd = add("coil", 20, 52, { label: `${tag(DMP2)}\nOPEN RELAY` });
  field(tap(c24, 20), [kd, "A1"], d2s, "S1", "S2", 20);
  w([kd, "A2"], tap(c0, 20));
  // Its contact is on sheet 3, in the extract drive's enable.
  linkContact(p, kdOpen.id, kd.id);

  // ===========================================================================
  // Sheet 5: the controller map, host and power supply module.
  page = addPage(p, "Controller: map, host and power supply");
  addSection(p, page.id, "BUILDING CONTROLLER", [2, 2, 146, 84]);
  add("ctrlmap", 6, 8, { params: { ctrl: ctrl.id, width: 120 } });
  c24 = rail(D.V24, 4, 60, 80);
  c0 = rail(D.V0, 4, 64, 80);
  setBoundary(p, page.id, 70);
  const host = view(modules.host, 14, 40);
  // COM A: the drives' bus, daisy-chained from the host through the boundary.
  const sfc = view(SFD, 20, 76, ["A+", "B-"]);
  const efc = view(EFD, 40, 76, ["A+", "B-"]);
  const xa = [term(14, 70), term(16, 70)];
  w([host, "1"], [xa[0]!, "1"]);
  w([host, "2"], [xa[1]!, "1"]);
  w([xa[0]!, "2"], [sfc, "A+"]);
  w([xa[1]!, "2"], [sfc, "B-"]);
  w([sfc, "A+"], [efc, "A+"]);
  w([sfc, "B-"], [efc, "B-"]);
  const psuM = view(modules.psu, 40, 40);
  const psuPins = chPins(modules.psu, modules.psu.points![0]!.name);
  w([psuM, psuPins[0]!], tap(c24, 40));
  w([psuM, psuPins[1]!], tap(c0, 44));

  // ===========================================================================
  // Sheets 6–9: one module each, field devices below the boundary.
  const moduleSheet = (m: PlantItem, title: string, wires: { dev: PlantItem; point: string; channel: string; pins?: [string, string] }[]) => {
    page = addPage(p, title);
    setBoundary(p, page.id, 70);
    addSection(p, page.id, title.toUpperCase(), [2, 2, 146, 66]);
    const mv = view(m, 8, 30);
    let x = 6;
    for (const wd of wires) {
      const [sig, com] = chPins(m, wd.channel);
      const dp = wd.dev.points!.find((q) => q.name === wd.point)!;
      const pins = wd.pins ?? [dp.pins[0]!, dp.pins[1]!];
      const dv = view(wd.dev, x, 76, pins);
      field([mv, sig!], [mv, com!], dv, pins[0], pins[1], x);
      x += 14;
    }
    return page;
  };
  moduleSheet(modules.di, "Controller: digital inputs", [
    { dev: SFD, point: "Run", channel: "DI1" },
    { dev: SFD, point: "Fault", channel: "DI2" },
    { dev: EFD, point: "Run", channel: "DI3" },
    { dev: EFD, point: "Fault", channel: "DI4" },
    { dev: DPS1, point: "Proven", channel: "DI5" },
    { dev: DPS2, point: "Proven", channel: "DI6" },
    { dev: DMP1, point: "Open", channel: "DI7" },
    { dev: DMP1, point: "Closed", channel: "DI8" },
    { dev: DMP2, point: "Closed", channel: "DI10" },
  ]);
  moduleSheet(modules.uio, "Controller: universal inputs", [
    { dev: TT1, point: "Value", channel: "IO1" },
    { dev: TT2, point: "Value", channel: "IO2" },
    { dev: TT3, point: "Value", channel: "IO3" },
    { dev: HT1, point: "Value", channel: "IO4" },
    { dev: FLT, point: "Proven", channel: "IO5" },
  ]);
  const aoSheet = moduleSheet(modules.ao, "Controller: analogue outputs", [
    { dev: SFD, point: "Speed", channel: "AO1" },
    { dev: EFD, point: "Speed", channel: "AO2" },
    { dev: VLV, point: "Position", channel: "AO3", pins: ["Y", "0"] },
  ]);
  // The valve's 24 V on the same sheet, from the panel's rails.
  {
    page = aoSheet;
    c24 = rail(D.V24, 4, 6, 140);
    c0 = rail(D.V0, 4, 62, 140);
    const vv = view(VLV, 60, 76, ["24"]);
    const t = term(60, 70);
    w(tap(c24, 60), [t, "1"]);
    w([t, "2"], [vv, "24"]);
    void c0;
  }
  // DO-8: DO1 switches the BMS enable relay that heads the AHU enable.
  page = addPage(p, "Controller: digital outputs");
  setBoundary(p, page.id, 70);
  addSection(p, page.id, "CONTROLLER: DIGITAL OUTPUTS", [2, 2, 146, 66]);
  c24 = rail(D.V24, 4, 6, 140);
  c0 = rail(D.V0, 4, 62, 140);
  const dov = view(modules.do, 8, 30);
  const [doC, doNo] = chPins(modules.do, "DO1");
  const kc = add("coil", 60, 52, { label: "AHU-01\nBMS ENABLE RELAY" });
  w(tap(c24, 60), [dov, doC!]);
  w([dov, doNo!], [kc, "A1"]);
  w([kc, "A2"], tap(c0, 60));
  linkContact(p, kcBms.id, kc.id);

  // ===========================================================================
  // Sheet 10: the network diagram.
  placeNetworkSheet(p);

  // --- Interlocks ---------------------------------------------------------------
  // The supply fan drive is never enabled while the fire alarm isn't healthy,
  // unless the firemans override is on: two conditions, all of them (T1).
  const ilSf = addInterlock(p, SFD.id, "Enable", { ref: pointRef(FA.id, "Healthy"), on: false });
  addInterlockCondition(p, SFD.id, ilSf.id, { ref: pointRef(FOS.id, "Override"), on: false });
  updateInterlock(p, SFD.id, ilSf.id, { join: "and" });
  // The extract fan drive is never enabled before its damper is open.
  addInterlock(p, EFD.id, "Enable", { ref: pointRef(DMP2.id, "Open"), on: false });

  // ===========================================================================
  // Sheets 11–12: the backplate and the door, at true scale.
  {
    const encl = { w: 800, h: 1200 };
    const back = addGaPage(p, "General arrangement: backplate", { scale: fitScale(encl.w, encl.h), enclosure: encl, view: "backplate" }, p.pages[p.pages.length - 1]!.id);
    addGaItem(p, back.id, { kind: "trunking", x: 20, y: 20, w: 40, h: 1160 });
    addGaItem(p, back.id, { kind: "trunking", x: 740, y: 20, w: 40, h: 1160 });
    const rails = [160, 420, 680, 940];
    for (const y of rails) {
      addGaItem(p, back.id, { kind: "rail", x: 80, y: y - 17.5, w: 640, h: 35 });
      addGaItem(p, back.id, { kind: "trunking", x: 80, y: y + 70, w: 640, h: 60 });
    }
    const cands = gaCandidates(p, () => "").filter((c) => !c.door && !c.modules);
    let r = 0;
    let x = 90;
    for (const c of cands) {
      if (x + c.w > 710) {
        r++;
        x = 90;
      }
      if (r >= rails.length) break;
      addGaItem(p, back.id, { kind: "device", x, y: rails[r]! - c.h / 2, w: c.w, h: c.h, refs: c.refs });
      x += c.w + 5;
    }
    // The controller's modules on the last rail, in rail order.
    placeModulesOnGa(p, back.id, Object.values(modules).map((m) => m.id), [90, rails[3]!]);
    const front = addGaPage(
      p,
      "General arrangement: door front",
      { scale: fitScale(encl.w, encl.h), enclosure: encl, view: "door-front", leaves: [{ w: 800, hinge: "left" }] },
      back.id,
    );
    const door = gaCandidates(p, (el) => el.tag).filter((c) => c.door && !c.part);
    door.forEach((c, i) => addGaItem(p, front.id, { kind: "device", x: 120 + i * 80, y: 400, w: c.w, h: c.h, refs: c.refs, cutout: "22.3" }));
    addGaItem(p, front.id, { kind: "label", x: 120, y: 200, w: 400, h: 60, text: "BMS-01\nAIR HANDLING CONTROL PANEL", textMm: 10 });
    const items = (p.pages.find((x) => x.id === front.id)!.gaItems ?? []).filter((it) => it.kind === "device");
    if (items.length)
      addGaDim(p, front.id, {
        axis: "h",
        style: "chain",
        points: [{ v: 0, item: ENCL, edge: "start" }, ...items.map((it) => ({ v: it.x + it.w / 2, item: it.id, edge: "mid" as const }))],
        at: 340,
      });
  }

  // --- Finish ---------------------------------------------------------------------
  void fireSheet;
  for (const pg of p.pages) routePage(avoid, pg);
  renumber(p);
  refreshConductors(p);
  return {
    project: p,
    plant: { PSU, BAT, FA, FOS, SFD, EFD, SF, EF, DMP1, DMP2, TT1, TT2, TT3, HT1, DPS1, DPS2, FLT, VLV, M1, M2 },
    modules,
  };
}
