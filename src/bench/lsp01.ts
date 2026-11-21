/**
 * Benchmark LSP-01 (docs/benchmark-lsp01.md): the 12-sheet life safety
 * panel set, drawn entirely through the core operations — the same ones the
 * editor and the MCP tools use. Nothing is typed that the tool can
 * generate: tags, terminal and wire numbers come from Renumber, and every
 * label that names plant uses a {plant:…} field.
 *
 * Sheets 3–6 are stamped from one starter template; sheets 8–9 from one
 * controls template.
 *
 * The control logic follows the sanitised description, which says the
 * original is believed to have bugs; the keyswitch wiring on sheets 8–9 is
 * marked "to be confirmed" there and is a sensible guess here.
 */
import type { Avoid } from "libavoid-js";
import { refreshConductors } from "../core/conductors";
import type { Vec } from "../core/geometry";
import { type Element, type Page, type ParamValue, type Project, newProject } from "../core/model";
import {
  addCloud,
  addElement,
  addPage,
  addPlant,
  addRevision,
  addSection,
  connect,
  linkContact,
  linkOffpage,
  setBoundary,
  updateProjectInfo,
  updateRevision,
  wire,
} from "../core/ops";
import { renumber } from "../core/renumber";
import { routePage } from "../core/routing";
import { saveSheetTemplate, stampTemplate } from "../core/templates";
import { placePlantView } from "../core/ops";

type End = [Element, string];

export interface Lsp01 {
  project: Project;
  /** Ids of the two templates, for checking where sheets came from. */
  starterTemplate: string;
  controlsTemplate: string;
}

export function buildLsp01(avoid: Avoid | null): Lsp01 {
  const p = newProject("lsp-01", "Example Building");
  updateProjectInfo(p, {
    panelName: "LSP-01 LIFE SAFETY PANEL",
    client: "Example Client",
    jobNo: "J0001",
    drawingNo: "LSP01-E",
    drawnBy: "FERRULE",
    drawnDate: "20/11/26",
  });
  updateRevision(p, 0, { date: "20/11/26", drawnBy: "FERRULE", description: "First issue" });

  // --- Plant -----------------------------------------------------------------
  const fanTerms = ["U", "V", "W", "PE"];
  const SF1 = addPlant(p, "SF-01", "Supply fan 1, 1.73 kW, 3.48 A FLC", fanTerms);
  const SF2 = addPlant(p, "SF-02", "Supply fan 2, 1.73 kW, 3.48 A FLC", fanTerms);
  const EF1 = addPlant(p, "EF-01", "Extract fan 1, 1.73 kW, 3.48 A FLC", fanTerms);
  const EF2 = addPlant(p, "EF-02", "Extract fan 2, 1.73 kW, 3.48 A FLC", fanTerms);
  const dpsTerms = ["C", "NO"];
  const DPS = {
    SF1: addPlant(p, "DPS-SF-01", "Supply airflow proving, SF-01", dpsTerms),
    SF2: addPlant(p, "DPS-SF-02", "Supply airflow proving, SF-02", dpsTerms),
    EF1: addPlant(p, "DPS-EF-01", "Extract airflow proving, EF-01", dpsTerms),
    EF2: addPlant(p, "DPS-EF-02", "Extract airflow proving, EF-02", dpsTerms),
  };
  const FA = addPlant(p, "FA", "Fire alarm system interlock (by others)", ["1", "2"]);
  const FAM_SF = addPlant(p, "FA-SF", "Fire alarm monitoring, supply fans (by others)", ["1", "2", "3", "4"]);
  const FAM_EF = addPlant(p, "FA-EF", "Fire alarm monitoring, extract fans (by others)", ["1", "2", "3", "4"]);
  const tag = (id: string) => `{plant:${id}.tag}`;

  // --- Drawing helpers -----------------------------------------------------------
  let page: Page = p.pages[0]!;
  const add = (symbol: string, x: number, y: number, opts: { rot?: 0 | 90 | 180 | 270; label?: string; params?: Record<string, ParamValue> } = {}) =>
    addElement(p, page.id, symbol, [x, y], opts);
  const w = (a: End, b: End) => connect(p, page.id, [a[0].id, a[1]], [b[0].id, b[1]]);
  const tee = (from: End, to: End, at: Vec) => {
    const seg = page.segments.find((s) => s.to[0] === to[0].id && s.to[1] === to[1]);
    if (!seg) throw new Error("No wire to tee into");
    return wire(p, page.id, { terminal: [from[0].id, from[1]] }, { wire: seg.id, at });
  };
  const tap = (rail: Element, x: number): End => [rail, String(x - rail.pos[0])];
  const rail = (name: string, x: number, y: number, length: number) => add("rail", x, y, { params: { name, length } });
  const bus = (name: string, x: number, y: number, length: number, label = "") =>
    add("busbar", x, y, { label, params: { name, length } });
  const arrowOut = (x: number, y: number, label = "") => add("offpage", x, y, { label });
  const arrowIn = (x: number, y: number, label = "") => add("offpage", x, y, { rot: 180, label, params: { source: false } });
  const text = (x: number, y: number, s: string, size = "normal", align = "start") =>
    add("text", x, y, { label: s, params: { size, align } });
  const box = (x: number, y: number, bw: number, bh: number, label = "", dashed = false) =>
    add("box", x, y, { label, params: { w: bw, h: bh, dashed } });
  const plate = (x: number, y: number, bw: number, bh: number, label: string, size = "small") =>
    add("plate", x, y, { label, params: { w: bw, h: bh, size } });
  const at = (pg: Page, symbol: string, x: number, y: number) => {
    const el = pg.elements.find((e) => e.symbol === symbol && e.pos[0] === x && e.pos[1] === y);
    if (!el) throw new Error(`Nothing (${symbol}) at ${x},${y} on sheet ${pg.number}`);
    return el;
  };

  // ===========================================================================
  // Sheet 1: cover
  page.title = "Cover sheet";
  box(10, 6, 180, 98);
  box(20, 12, 36, 16, "LOGO");
  text(100, 40, "{project:title}", "title", "middle");
  text(100, 52, "{project:panelName}", "large", "middle");
  text(100, 62, "ELECTRICAL SCHEMATIC DRAWINGS", "normal", "middle");
  text(30, 80, "CLIENT: {project:client}\nJOB No.: {project:jobNo}", "normal");
  text(120, 80, "DRAWING No.: {project:drawingNo}\nSHEETS: {sheets}   REVISION: {rev}", "normal");

  // ===========================================================================
  // Sheet 2: main incoming section
  page = addPage(p, "Main incoming section");
  addSection(p, page.id, "MAIN INCOMING SECTION", [2, 2, 196, 86]);
  text(26, 5, "415V 3PH+N 50Hz SUPPLY (BY OTHERS)", "small");
  const x0 = [30, 33, 36, 39].map((x, i) => add("terminal", x, 10, { label: ["L1", "L2", "L3", "N"][i], params: { strip: "X0" } }));
  const qMain = add("isolator", 30, 22, { label: "63A DOOR INTERLOCKED", params: { poles: 4, aux: 0, operator: "turn" } });
  x0.forEach((t, i) => w([t, "2"], [qMain, String(2 * i + 1)]));
  const busL1 = bus("L1", 14, 36, 170, "80A DISTRIBUTION BLOCKS");
  const busL2 = bus("L2", 14, 40, 170);
  const busL3 = bus("L3", 14, 44, 170);
  const busN = bus("N", 14, 48, 170);
  [busL1, busL2, busL3, busN].forEach((b, i) => w([qMain, String(2 * i + 2)], tap(b, 30 + 3 * i)));
  const fPower = add("fuse", 150, 62, { params: { rating: "4A" } });
  const hPower = add("lamp", 150, 76, { label: "POWER ON", params: { colour: "Ye" } });
  w(tap(busL1, 150), [fPower, "1"]);
  w([fPower, "2"], [hPower, "V+"]);
  w([hPower, "V-"], tap(busN, 156));
  text(110, 56, "L1, L2, L3 AND N CONTINUE TO THE FAN\nSTARTER SECTIONS, SHEETS 3–6", "small");

  // ===========================================================================
  // Sheet 3: fan starter for SF-01 (the starter template)
  page = addPage(p, `${tag(SF1.id)} starter section`);
  setBoundary(p, page.id, 90);
  addSection(p, page.id, `${tag(SF1.id)} STARTER SECTION`, [2, 2, 196, 86]);
  // Power: 3 poles at x 24, 27, 30; the isolator's auxiliary poles at 34 and 37.
  const L = [rail("L1", 4, 6, 26), rail("L2", 4, 9, 26), rail("L3", 4, 12, 26)];
  const qFan = add("isolator", 24, 22, { label: "40A DOOR INTERLOCKED", params: { poles: 3, aux: 2, operator: "turn" } });
  const fuses = add("fuse", 24, 34, { params: { poles: 3, rating: "10A" } });
  const km = add("isolator", 24, 48, { params: { function: "contactor", poles: 3 } });
  const xFan = [24, 27, 30].map((x) => add("terminal", x, 90));
  const qLocal = add("isolator", 24, 97, { label: "LOCAL ISOLATOR", params: { poles: 3, aux: 0, operator: "turn" } });
  const fan = placePlantView(p, page.id, SF1.id, [24, 104]);
  for (let i = 0; i < 3; i++) {
    const [a, b] = [String(2 * i + 1), String(2 * i + 2)];
    w(tap(L[i]!, 24 + 3 * i), [qFan, a]);
    w([qFan, b], [fuses, a]);
    w([fuses, b], [km, a]);
    w([km, b], [xFan[i]!, "1"]);
    w([xFan[i]!, "2"], [qLocal, a]);
    w([qLocal, b], [fan, ["U", "V", "W"][i]!]);
  }
  // Control circuit, through the isolator's auxiliary poles.
  const cctIn = arrowIn(34, 9);
  const ovIn = arrowIn(37, 14);
  w([cctIn, "1"], [qFan, "13"]);
  w([ovIn, "1"], [qFan, "23"]);
  const cctLocal = add("rail", 46, 30, { params: { name: "", length: 148 } });
  const ovLocal = add("rail", 46, 84, { params: { name: "", length: 148 } });
  w([qFan, "14"], tap(cctLocal, 46));
  w([qFan, "24"], tap(ovLocal, 46));
  const enOut = arrowOut(66, 40, "ENABLE");
  const enIn = arrowIn(66, 52, "ENABLE");
  const kmCoil = add("coil", 66, 70, { label: `${tag(SF1.id)} CONTACTOR`, params: { type: "contactor" } });
  w(tap(cctLocal, 66), [enOut, "1"]);
  w([enIn, "1"], [kmCoil, "A1"]);
  w([kmCoil, "A2"], tap(ovLocal, 66));
  linkContact(p, km.id, kmCoil.id);
  const kmRun = add("contact-no", 86, 45);
  const hRun = add("lamp", 86, 70, { label: `${tag(SF1.id)} RUNNING`, params: { colour: "Gn" } });
  w(tap(cctLocal, 86), [kmRun, "13"]);
  w([kmRun, "14"], [hRun, "V+"]);
  w([hRun, "V-"], tap(ovLocal, 86));
  linkContact(p, kmRun.id, kmCoil.id);
  const kmSig = add("contact-no", 106, 45);
  const runOut = arrowOut(106, 60, "RUN SIGNAL");
  w(tap(cctLocal, 106), [kmSig, "13"]);
  w([kmSig, "14"], [runOut, "1"]);
  linkContact(p, kmSig.id, kmCoil.id);
  const starterSheet = page;
  const starter = saveSheetTemplate(p, page.id, "Fan starter section");

  // Sheets 4–6: stamped for the other fans.
  let after = page;
  for (const target of [SF2, EF1, EF2]) {
    const r = stampTemplate(p, starter.id, {
      afterPageId: after.id,
      plant: { [SF1.id]: { plant: target.id } },
    });
    after = r.page;
  }
  const starters = [SF1, SF2, EF1, EF2].map((f, i) => ({ plant: f, page: p.pages[2 + i]! }));

  // ===========================================================================
  // Sheet 7: controls section, supplies
  page = addPage(p, "Controls section: supplies", after.id);
  setBoundary(p, page.id, 94);
  addSection(p, page.id, "CONTROLS SECTION: SUPPLIES", [2, 2, 196, 90]);
  const sL1 = rail("L1", 4, 6, 50);
  const sN = rail("N", 4, 9, 50);
  const cmcb = add("isolator", 14, 18, { label: "6A TYPE D", params: { function: "breaker", poles: 2, operator: "none" } });
  const socket = add("socket", 14, 34, { label: "13A SOCKET (LAPTOP)" });
  w(tap(sL1, 14), [cmcb, "1"]);
  w(tap(sN, 17), [cmcb, "3"]);
  w([cmcb, "2"], [socket, "L"]);
  w([cmcb, "4"], [socket, "N"]);
  // The socket's earth goes out of its side to a protective earth.
  const pe = add("earth", 24, 34, { params: { type: "protective" } });
  w([socket, "E"], [pe, "E"]);
  const pmcb = add("isolator", 34, 18, { label: "6A TYPE D", params: { function: "breaker", poles: 2, operator: "none" } });
  const tx = add("transformer", 34, 32, { label: "TX1", params: { rating: "240/24V 300VA", screen: true } });
  w(tap(sL1, 34), [pmcb, "1"]);
  w(tap(sN, 37), [pmcb, "3"]);
  w([pmcb, "2"], [tx, "P1"]);
  w([pmcb, "4"], [tx, "P2"]);
  const smcb = add("isolator", 34, 46, { label: "10A TYPE D", params: { function: "breaker", poles: 1, operator: "none" } });
  w([tx, "S1"], [smcb, "1"]);
  const cct = rail("CCT", 44, 56, 150);
  const ov = rail("0V", 44, 88, 150);
  w([smcb, "2"], tap(cct, 48));
  w([tx, "S2"], tap(ov, 48));
  const hHealthy = add("lamp", 56, 72, { label: "CONTROL CIRCUIT HEALTHY", params: { colour: "Wh", testPin: true } });
  w(tap(cct, 56), [hHealthy, "V+"]);
  w([hHealthy, "V-"], tap(ov, 56));
  const faView = placePlantView(p, page.id, FA.id, [70, 100]);
  const xFa = [70, 73].map((x) => add("terminal", x, 94));
  const fr = add("coil", 80, 74, { label: "FIRE ALARM RELAY" });
  w(tap(cct, 70), [xFa[0]!, "1"]);
  w([xFa[0]!, "2"], [faView, "1"]);
  w([faView, "2"], [xFa[1]!, "2"]);
  w([xFa[1]!, "1"], [fr, "A1"]);
  w([fr, "A2"], tap(ov, 80));
  const frLamp = add("contact-no", 104, 64);
  const hFire = add("lamp", 104, 76, { label: "FIRE ALARM ACTIVATED", params: { colour: "Rd", testPin: true } });
  w(tap(cct, 104), [frLamp, "13"]);
  w([frLamp, "14"], [hFire, "V+"]);
  w([hFire, "V-"], tap(ov, 104));
  linkContact(p, frLamp.id, fr.id);
  const sLt = add("pb-no", 118, 64, { label: "LAMP TEST" });
  const lt = rail("LT", 118, 74, 16);
  w(tap(cct, 118), [sLt, "13"]);
  w([sLt, "14"], tap(lt, 118));
  // Lamp test: the LT rail feeds each lamp's test terminal.
  w(tap(lt, 118), [hFire, "T"]);
  w([hFire, "T"], [hHealthy, "T"]);
  // CCT and 0V out to the four starters and the two controls sheets.
  const cctOuts = [140, 150, 160, 170, 180, 190].map((x) => {
    const a = arrowOut(x, 62);
    w(tap(cct, x), [a, "1"]);
    return a;
  });
  const ovOuts = [143, 153, 163, 173, 183, 193].map((x) => {
    const a = arrowIn(x, 82);
    w([a, "1"], tap(ov, x));
    return a;
  });
  text(138, 50, "CCT AND 0V TO SHEETS 3–6, 8 AND 9", "small");
  const supplies = page;

  // ===========================================================================
  // Sheet 8: supply fans duty/standby (the controls template)
  page = addPage(p, `Controls section: ${tag(SF1.id)}/${tag(SF2.id)} duty/standby`, supplies.id);
  setBoundary(p, page.id, 92);
  addSection(p, page.id, `${tag(SF1.id)} / ${tag(SF2.id)} DUTY/STANDBY CONTROL`, [2, 1, 196, 89]);
  const c = rail("CCT", 4, 6, 192);
  const o = rail("0V", 4, 84, 192);
  const cIn = arrowIn(196, 2);
  const oIn = arrowOut(196, 88);
  w([cIn, "1"], tap(c, 196));
  w(tap(o, 196), [oIn, "1"]);
  // Enable: AUTO/TEST (fire alarm or test), fans-fail latch, duty selector.
  const sAt = add("selector", 14, 16, { label: "AUTO/TEST", params: { key: true, legend: "AUTO TEST" } });
  const frEn = add("contact-no", 20, 16);
  const ffEn = add("contact-nc", 14, 28);
  const sDuty = add("selector", 14, 40, { rot: 180, label: "DUTY SELECTOR", params: { contact: "co", key: true, legend: "1  2" } });
  const er1 = add("coil", 14, 80, { label: `${tag(SF1.id)} ENABLE` });
  const er2 = add("coil", 26, 80, { label: `${tag(SF2.id)} ENABLE`, params: { xrefDx: 1.9, xrefDy: -13 } });
  w(tap(c, 14), [sAt, "13"]);
  w([sAt, "14"], [ffEn, "21"]);
  w(tap(c, 20), [frEn, "13"]);
  tee([frEn, "14"], [ffEn, "21"], [14, 22]);
  w([ffEn, "22"], [sDuty, "11"]);
  w([sDuty, "14"], [er1, "A1"]);
  w([sDuty, "12"], [er2, "A1"]);
  w([er1, "A2"], tap(o, 14));
  w([er2, "A2"], tap(o, 26));
  // Enable loops out to the starters, one above the other.
  const enLoop = (y: number, er: Element, fanTag: string) => {
    const a = arrowIn(42, y, `${fanTag} ENABLE`);
    const k = add("contact-no", 42, y + 8);
    const b = arrowOut(42, y + 16, `${fanTag} ENABLE`);
    w([a, "1"], [k, "13"]);
    w([k, "14"], [b, "1"]);
    linkContact(p, k.id, er.id);
  };
  enLoop(14, er1, tag(SF1.id));
  enLoop(40, er2, tag(SF2.id));
  // Running relays, from each starter's run signal.
  const runRelay = (x: number, fanTag: string) => {
    const a = arrowIn(x, 62, `${fanTag} RUN`);
    const k = add("coil", x, 80, { label: `${fanTag} RUNNING` });
    w([a, "1"], [k, "A1"]);
    w([k, "A2"], tap(o, x));
    return k;
  };
  const rr1 = runRelay(56, tag(SF1.id));
  const rr2 = runRelay(70, tag(SF2.id));
  // Volt-free running signals to the fire alarm system, below the enable loops.
  const fam = placePlantView(p, page.id, FAM_SF.id, [34, 100]);
  const xm = [34, 37, 40, 43].map((x) => add("terminal", x, 92));
  xm.forEach((t, i) => w([t, "2"], [fam, String(i + 1)]));
  const monitor = (x: number, rr: Element, xa: Element, xb: Element) => {
    const k = add("contact-no", x, 76);
    w([xa, "1"], [k, "14"]);
    w([k, "13"], [xb, "1"]);
    linkContact(p, k.id, rr.id);
  };
  monitor(34, rr1, xm[0]!, xm[1]!);
  monitor(40, rr2, xm[2]!, xm[3]!);
  // Airflow proving and fail timers, one set per fan.
  const proving = (x: number, er: Element, dps: string, fanTag: string) => {
    const k1 = add("contact-no", x, 16);
    const xa = add("terminal", x, 92);
    const xb = add("terminal", x + 3, 92);
    const view = placePlantView(p, page.id, dps, [x, 98]);
    const pr = add("coil", x + 10, 72, { label: `${fanTag} PROVEN` });
    w(tap(c, x), [k1, "13"]);
    w([k1, "14"], [xa, "1"]);
    w([xa, "2"], [view, "C"]);
    w([view, "NO"], [xb, "2"]);
    w([xb, "1"], [pr, "A1"]);
    w([pr, "A2"], tap(o, x + 10));
    linkContact(p, k1.id, er.id);
    const k2 = add("contact-no", x + 26, 16);
    const prNc = add("contact-nc", x + 26, 32);
    const t = add("timer-coil", x + 26, 72, { label: `${fanTag} FAIL TIMER`, params: { mode: "on", time: "10s" } });
    w(tap(c, x + 26), [k2, "13"]);
    w([k2, "14"], [prNc, "21"]);
    w([prNc, "22"], [t, "A1"]);
    w([t, "A2"], tap(o, x + 26));
    linkContact(p, k2.id, er.id);
    linkContact(p, prNc.id, pr.id);
    return t;
  };
  const t1 = proving(80, er1, DPS.SF1.id, tag(SF1.id));
  const t2 = proving(118, er2, DPS.SF2.id, tag(SF2.id));
  // Fans-fail latch.
  const t1c = add("timer-contact", 158, 16);
  const t2c = add("timer-contact", 166, 16);
  const ffHold = add("contact-no", 174, 16);
  const sReset = add("pb-nc", 158, 40, { label: "FANS TRIP RESET" });
  const ff = add("coil", 158, 72, { label: "FANS FAIL" });
  w(tap(c, 158), [t1c, "17"]);
  w([t1c, "18"], [sReset, "21"]);
  w(tap(c, 166), [t2c, "17"]);
  tee([t2c, "18"], [sReset, "21"], [158, 26]);
  w(tap(c, 174), [ffHold, "13"]);
  tee([ffHold, "14"], [sReset, "21"], [158, 28]);
  w([sReset, "22"], [ff, "A1"]);
  w([ff, "A2"], tap(o, 158));
  linkContact(p, t1c.id, t1.id);
  linkContact(p, t2c.id, t2.id);
  linkContact(p, ffHold.id, ff.id);
  linkContact(p, ffEn.id, ff.id);
  // Tripped lamps.
  const tripped = (x: number, t: Element, fanTag: string) => {
    const k = add("timer-contact", x, 30);
    const h = add("lamp", x, 72, { label: `${fanTag} TRIPPED`, params: { colour: "Rd" } });
    w(tap(c, x), [k, "17"]);
    w([k, "18"], [h, "V+"]);
    w([h, "V-"], tap(o, x));
    linkContact(p, k.id, t.id);
  };
  tripped(182, t1, tag(SF1.id));
  tripped(194, t2, tag(SF2.id));
  const controlsSheet = page;
  const controls = saveSheetTemplate(p, page.id, "Fans duty/standby controls");

  // Sheet 9: stamped for the extract fans.
  const efSheet = stampTemplate(p, controls.id, {
    afterPageId: page.id,
    plant: {
      [SF1.id]: { plant: EF1.id },
      [SF2.id]: { plant: EF2.id },
      [DPS.SF1.id]: { plant: DPS.EF1.id },
      [DPS.SF2.id]: { plant: DPS.EF2.id },
      [FAM_SF.id]: { plant: FAM_EF.id },
    },
  }).page;

  // --- Links between sheets ----------------------------------------------------
  // The fire alarm relay drives the AUTO path on both controls sheets.
  for (const sh of [controlsSheet, efSheet]) linkContact(p, at(sh, "contact-no", 20, 16).id, fr.id);
  // CCT and 0V from the supplies sheet to every section that uses them.
  const fed = [...starters.map((s) => s.page), controlsSheet, efSheet];
  fed.forEach((sh, i) => {
    const isStarter = i < 4;
    linkOffpage(p, cctOuts[i]!.id, at(sh, "offpage", isStarter ? 34 : 196, isStarter ? 9 : 2).id);
    linkOffpage(p, ovOuts[i]!.id, at(sh, "offpage", isStarter ? 37 : 196, isStarter ? 14 : 88).id);
  });
  // Enable loops and run signals between each starter and its controls sheet.
  starters.forEach((s, i) => {
    const sh = i < 2 ? controlsSheet : efSheet;
    const y = i % 2 === 0 ? 14 : 40;
    linkOffpage(p, at(s.page, "offpage", 66, 40).id, at(sh, "offpage", 42, y).id);
    linkOffpage(p, at(sh, "offpage", 42, y + 16).id, at(s.page, "offpage", 66, 52).id);
    linkOffpage(p, at(s.page, "offpage", 106, 60).id, at(sh, "offpage", i % 2 === 0 ? 56 : 70, 62).id);
  });
  void starterSheet;

  // ===========================================================================
  // Sheet 10: general arrangement (not to scale)
  page = addPage(p, "General arrangement", efSheet.id);
  text(10, 6, "GENERAL ARRANGEMENT — FRONT VIEW (NOT TO SCALE)", "normal");
  const sections: [string, number][] = [
    ["MAIN SECTION", 50],
    [tag(SF1.id), 20],
    [tag(SF2.id), 20],
    [tag(EF1.id), 20],
    [tag(EF2.id), 20],
    ["CONTROLS", 50],
  ];
  const widths = ["1000", "400", "400", "400", "400", "1000"];
  let gx = 10;
  sections.forEach(([name, bw], i) => {
    box(gx, 12, bw, 80, "", false);
    text(gx + bw / 2, 17, name, "small", "middle");
    text(gx + bw / 2, 97, widths[i]!, "small", "middle");
    if (i === 0) {
      box(gx + 18, 40, 14, 10, "MAIN ISOL.");
      plate(gx + 15, 24, 20, 5, "POWER ON");
    } else if (i < 5) {
      box(gx + 4, 40, 12, 10, "ISOL.");
      plate(gx + 2, 24, 16, 6, `${name}\nRUNNING`);
    } else {
      plate(gx + 4, 24, 42, 5, "CONTROL CIRCUIT HEALTHY");
      plate(gx + 4, 31, 20, 5, "LAMP TEST");
      plate(gx + 26, 31, 20, 5, "FIRE ALARM");
      plate(gx + 4, 40, 42, 5, `${tag(SF1.id)}/${tag(SF2.id)} CONTROLS`);
      plate(gx + 4, 48, 42, 5, `${tag(EF1.id)}/${tag(EF2.id)} CONTROLS`);
    }
    gx += bw;
  });
  text(10, 104, "OVERALL PANEL DEPTH 800 mm. DIMENSIONS IN mm.", "small");

  // ===========================================================================
  // Sheet 11: door labels, power section
  page = addPage(p, "Door labels: power section", page.id);
  text(10, 6, "DOOR LABELS — POWER SECTION", "normal");
  plate(10, 14, 90, 10, "{project:panelName}", "large");
  plate(10, 28, 60, 8, "POWER SECTION", "normal");
  plate(10, 40, 90, 14, "DANGER 400V\nISOLATE ELSEWHERE BEFORE OPENING DOOR", "normal");
  plate(10, 58, 30, 6, "POWER ON");
  [SF1, SF2, EF1, EF2].forEach((f, i) => plate(10 + i * 34, 70, 30, 8, `${tag(f.id)}\nRUNNING`));

  // ===========================================================================
  // Sheet 12: door labels, controls section
  page = addPage(p, "Door labels: controls section", page.id);
  text(10, 6, "DOOR LABELS — CONTROLS SECTION", "normal");
  plate(10, 14, 50, 6, "CONTROL CIRCUIT HEALTHY");
  plate(64, 14, 30, 6, "LAMP TEST");
  plate(98, 14, 44, 6, "FIRE ALARM ACTIVATED");
  [[SF1, SF2], [EF1, EF2]].forEach(([a, b], i) => {
    const y = 30 + i * 36;
    text(10, y, `${tag(a!.id)} / ${tag(b!.id)}`, "normal");
    plate(10, y + 4, 40, 8, "AUTO / TEST");
    plate(54, y + 4, 40, 8, `DUTY SELECTOR\n${tag(a!.id)}   ${tag(b!.id)}`);
    plate(98, y + 4, 30, 8, `${tag(a!.id)}\nTRIPPED`);
    plate(132, y + 4, 30, 8, `${tag(b!.id)}\nTRIPPED`);
    plate(166, y + 4, 30, 8, "FANS TRIP\nRESET");
  });

  // --- Revision B: the proving and timer area on sheet 8 is clouded ----------
  addRevision(p, { date: "21/11/26", drawnBy: "FERRULE", description: "Airflow proving revised" });
  addCloud(p, controlsSheet.id, [74, 9, 76, 70]);

  // --- Finish: number everything, route every wire ---------------------------
  for (const pg of p.pages) routePage(avoid, pg);
  renumber(p);
  refreshConductors(p);
  return { project: p, starterTemplate: starter.id, controlsTemplate: controls.id };
}
