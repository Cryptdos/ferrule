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
import { type Distribution, type Element, type Page, type ParamValue, type Project, newProject } from "../core/model";
import {
  addDistribution,
  addCloud,
  addElement,
  addGaDim,
  addGaItem,
  addGaPage,
  addSparePage,
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
import { ENCL, fitScale, gaCandidates, gaToSheet, type GaCandidate } from "../core/ga";
import { routePage } from "../core/routing";
import { saveSheetTemplate, stampTemplate } from "../core/templates";
import { placePlantView, setExpectation } from "../core/ops";
import { pointRef } from "../core/points";

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
  // Points (controller.md §3): the airflow switch and the fire alarm's interlock are
  // contacts clicked in Simulate; the fire alarm's monitoring inputs sense the
  // panel's volt-free running contacts, with expectations to say what they should see.
  const dpsTerms = ["C", "NO"];
  const dps = (tag: string, desc: string) =>
    addPlant(p, tag, desc, dpsTerms, { points: [{ name: "Airflow proven", form: "contact", pins: ["C", "NO"] }] });
  const DPS = {
    SF1: dps("DPS-SF-01", "Supply airflow proving, SF-01"),
    SF2: dps("DPS-SF-02", "Supply airflow proving, SF-02"),
    EF1: dps("DPS-EF-01", "Extract airflow proving, EF-01"),
    EF2: dps("DPS-EF-02", "Extract airflow proving, EF-02"),
  };
  const FA = addPlant(p, "FA", "Fire alarm system interlock (by others)", ["1", "2"], {
    points: [{ name: "Fire alarm", form: "contact", pins: ["1", "2"] }],
  });
  const monitoring = (tag: string, desc: string, a: string, b: string) =>
    addPlant(p, tag, desc, ["1", "2", "3", "4"], {
      points: [
        { name: `${a} running`, form: "dry-in", pins: ["1", "2"] },
        { name: `${b} running`, form: "dry-in", pins: ["3", "4"] },
      ],
    });
  const FAM_SF = monitoring("FA-SF", "Fire alarm monitoring, supply fans (by others)", "SF-01", "SF-02");
  const FAM_EF = monitoring("FA-EF", "Fire alarm monitoring, extract fans (by others)", "EF-01", "EF-02");
  const tag = (id: string) => `{plant:${id}.tag}`;

  // --- Distributions: what the busbars, arrows and the incoming supply carry ---
  const D = {
    L1: addDistribution(p, { name: "L1", kind: "line", voltage: "230 V", colour: "Bn", function: "L1" }),
    L2: addDistribution(p, { name: "L2", kind: "line", voltage: "230 V", colour: "Bk", function: "L2" }),
    L3: addDistribution(p, { name: "L3", kind: "line", voltage: "230 V", colour: "Gy", function: "L3" }),
    N: addDistribution(p, { name: "N", kind: "neutral", voltage: "", colour: "Bu", function: "N" }),
    CCT: addDistribution(p, { name: "CCT", kind: "line", voltage: "24 V AC", colour: "Rd", function: "24V AC" }),
    OV: addDistribution(p, { name: "0V", kind: "neutral", voltage: "0 V", colour: "Wh", function: "0V" }),
  };

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
  // Busbars: distribution (thick) for power, control (thin) for CCT and 0V; on a
  // distribution, or local (null) when they join nothing else.
  const bus = (d: Distribution | null, x: number, y: number, length: number, label = "") =>
    add("busbar", x, y, { label, params: { dist: d?.id ?? "", length } });
  const ctl = (d: Distribution | null, x: number, y: number, length: number, name = "") =>
    add("busbar", x, y, { params: { style: "control", dist: d?.id ?? "", name, length, bothEnds: true } });
  const arrowOut = (x: number, y: number, label = "") => add("offpage", x, y, { label });
  const arrowIn = (x: number, y: number, label = "") => add("offpage", x, y, { rot: 180, label, params: { source: false } });
  const text = (x: number, y: number, s: string, size = "note", align = "start") =>
    add("text", x, y, { label: s, params: { size, align } });
  const box = (x: number, y: number, bw: number, bh: number, label = "", dashed = false) =>
    add("box", x, y, { label, params: { w: bw, h: bh, dashed } });
  const plate = (x: number, y: number, bw: number, bh: number, label: string, size = "note") =>
    add("plate", x, y, { label, params: { w: bw, h: bh, size } });
  const at = (pg: Page, symbol: string, x: number, y: number) => {
    const el = pg.elements.find((e) => e.symbol === symbol && e.pos[0] === x && e.pos[1] === y);
    if (!el) throw new Error(`Nothing (${symbol}) at ${x},${y} on sheet ${pg.number}`);
    return el;
  };

  // ===========================================================================
  // Sheet 1: cover
  page.title = "Cover sheet";
  box(8, 4, 134, 76);
  // The company logo (set under Project…) shows here as well as in the title block.
  addElement(p, page.id, "image", [14, 9], { params: { asset: "@logo", w: 27, h: 12 } });
  text(75, 32, "{project:title}", "title", "middle");
  text(75, 40, "{project:panelName}", "heading", "middle");
  text(75, 47, "ELECTRICAL SCHEMATIC DRAWINGS", "heading", "middle");
  text(20, 62, "CLIENT: {project:client}\nJOB No.: {project:jobNo}");
  text(86, 62, "DRAWING No.: {project:drawingNo}\nSHEETS: {sheets}   REVISION: {rev}");

  // ===========================================================================
  // Sheet 2: main incoming section
  page = addPage(p, "Main incoming section");
  addSection(p, page.id, "MAIN INCOMING SECTION", [2, 2, 146, 70]);
  // Where the power comes in: the simulator's source.
  // Wired through the main isolator to the busbars, so the supply itself is on no
  // distribution: if it were, the isolator would be bypassed.
  const incoming = add("supply", 22, 11, { label: "415V 3PH+N 50Hz SUPPLY (BY OTHERS)", params: { system: "3ph-n" } });
  const x0 = [22, 25, 28, 31].map((x, i) => add("terminal", x, 14, { label: ["L1", "L2", "L3", "N"][i], params: { strip: "X0" } }));
  x0.forEach((t, i) => w([incoming, ["L1", "L2", "L3", "N"][i]!], [t, "1"]));
  const qMain = add("isolator", 22, 24, { label: "63A DOOR\nINTERLOCKED", params: { poles: 4, aux: 0, operator: "door" } });
  x0.forEach((t, i) => w([t, "2"], [qMain, String(2 * i + 1)]));
  const busL1 = bus(D.L1, 14, 34, 124, "80A DISTRIBUTION BLOCKS");
  const busL2 = bus(D.L2, 14, 38, 124);
  const busL3 = bus(D.L3, 14, 42, 124);
  const busN = bus(D.N, 14, 46, 124);
  [busL1, busL2, busL3, busN].forEach((b, i) => w([qMain, String(2 * i + 2)], tap(b, 22 + 3 * i)));
  const fPower = add("fuse", 112, 56, { params: { rating: "4A" } });
  const hPower = add("lamp", 112, 66, { label: "POWER ON", params: { colour: "Ye" } });
  w(tap(busL1, 112), [fPower, "1"]);
  w([fPower, "2"], [hPower, "+V"]);
  w([hPower, "-V"], tap(busN, 118));
  text(64, 54, "L1, L2, L3 AND N CONTINUE TO THE FAN\nSTARTER SECTIONS, SHEETS 3–6");

  // ===========================================================================
  // Sheet 3: fan starter for SF-01 (the starter template)
  page = addPage(p, `${tag(SF1.id)} starter section`);
  setBoundary(p, page.id, 64);
  addSection(p, page.id, `${tag(SF1.id)} STARTER SECTION`, [2, 2, 146, 60]);
  // Power: 3 poles at x 18, 21, 24; the isolator's auxiliary poles at 28 and 31.
  const L = [bus(D.L1, 12, 6, 12), bus(D.L2, 12, 9, 12), bus(D.L3, 12, 12, 12)];
  const qFan = add("isolator", 18, 25, { label: "40A DOOR\nINTERLOCKED", params: { poles: 3, aux: 2, operator: "turn" } });
  const fuses = add("fuse", 18, 35, { params: { poles: 3, rating: "10A" } });
  const km = add("isolator", 18, 45, { params: { function: "contactor", poles: 3 } });
  const xFan = [18, 21, 24].map((x) => add("terminal", x, 64));
  const qLocal = add("isolator", 18, 70, { label: "LOCAL ISOLATOR", params: { poles: 3, aux: 0, operator: "turn" } });
  const fan = placePlantView(p, page.id, SF1.id, [18, 76]);
  for (let i = 0; i < 3; i++) {
    const [a, b] = [String(2 * i + 1), String(2 * i + 2)];
    w(tap(L[i]!, 18 + 3 * i), [qFan, a]);
    w([qFan, b], [fuses, a]);
    w([fuses, b], [km, a]);
    w([km, b], [xFan[i]!, "1"]);
    w([xFan[i]!, "2"], [qLocal, a]);
    w([qLocal, b], [fan, ["U", "V", "W"][i]!]);
  }
  // Control circuit, through the isolator's auxiliary poles.
  const cctIn = arrowIn(28, 16);
  const ovIn = arrowIn(31, 19);
  w([cctIn, "1"], [qFan, "13"]);
  w([ovIn, "1"], [qFan, "23"]);
  // After the isolator's auxiliary poles: this starter's own control busbars.
  const cctLocal = add("busbar", 36, 30, { params: { style: "control", length: 50 } });
  const ovLocal = add("busbar", 36, 58, { params: { style: "control", length: 50 } });
  w([qFan, "14"], tap(cctLocal, 36));
  w([qFan, "24"], tap(ovLocal, 36));
  // Destinations show their source's label, so the starter's arrows say whose they are.
  const enOut = arrowOut(46, 33, `${tag(SF1.id)}\nENABLE`);
  const enIn = arrowIn(46, 40, "ENABLE");
  const kmCoil = add("coil", 46, 50, { label: `${tag(SF1.id)}\nCONTACTOR`, params: { type: "contactor" } });
  w(tap(cctLocal, 46), [enOut, "1"]);
  w([enIn, "1"], [kmCoil, "A1"]);
  w([kmCoil, "A2"], tap(ovLocal, 46));
  linkContact(p, km.id, kmCoil.id);
  const kmRun = add("contact-no", 62, 35);
  const hRun = add("lamp", 62, 50, { label: `${tag(SF1.id)}\nRUNNING`, params: { colour: "Gn" } });
  w(tap(cctLocal, 62), [kmRun, "13"]);
  w([kmRun, "14"], [hRun, "+V"]);
  w([hRun, "-V"], tap(ovLocal, 62));
  linkContact(p, kmRun.id, kmCoil.id);
  const kmSig = add("contact-no", 78, 35);
  const runOut = arrowOut(78, 45, `${tag(SF1.id)}\nRUN`);
  w(tap(cctLocal, 78), [kmSig, "13"]);
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
  setBoundary(p, page.id, 70);
  addSection(p, page.id, "CONTROLS SECTION: SUPPLIES", [2, 2, 146, 66]);
  const sL1 = bus(D.L1, 11, 6, 29);
  const sN = bus(D.N, 11, 9, 29);
  const cmcb = add("isolator", 12, 17, { label: "6A TYPE D", params: { function: "breaker", poles: 2, operator: "none" } });
  const socket = add("socket", 12, 30, { label: "13A SOCKET\n(LAPTOP)" });
  w(tap(sL1, 12), [cmcb, "1"]);
  w(tap(sN, 15), [cmcb, "3"]);
  w([cmcb, "2"], [socket, "L"]);
  w([cmcb, "4"], [socket, "N"]);
  // The socket's earth goes out of its side to a protective earth.
  const pe = add("earth", 20, 30, { params: { type: "protective" } });
  w([socket, "E"], [pe, "E"]);
  const pmcb = add("isolator", 28, 17, { label: "6A TYPE D", params: { function: "breaker", poles: 2, operator: "none" } });
  const tx = add("transformer", 28, 28, { label: "TX1", params: { rating: "240/24V 300VA", screen: true } });
  w(tap(sL1, 28), [pmcb, "1"]);
  w(tap(sN, 31), [pmcb, "3"]);
  w([pmcb, "2"], [tx, "P1"]);
  w([pmcb, "4"], [tx, "P2"]);
  const smcb = add("isolator", 28, 39, { label: "10A TYPE D", params: { function: "breaker", poles: 1, operator: "none" } });
  w([tx, "S1"], [smcb, "1"]);
  const cct = ctl(D.CCT, 36, 46, 110);
  const ov = ctl(D.OV, 36, 66, 110);
  w([smcb, "2"], tap(cct, 38));
  w([tx, "S2"], tap(ov, 38));
  const hHealthy = add("lamp", 48, 58, { label: "CONTROL CCT\nHEALTHY", params: { colour: "Wh", testPin: true } });
  w(tap(cct, 48), [hHealthy, "+V"]);
  w([hHealthy, "-V"], tap(ov, 48));
  const faView = placePlantView(p, page.id, FA.id, [56, 76]);
  const xFa = [56, 57].map((x) => add("terminal", x, 70));
  const fr = add("coil", 70, 58, { label: "FIRE ALARM\nRELAY" });
  w(tap(cct, 56), [xFa[0]!, "1"]);
  w([xFa[0]!, "2"], [faView, "1"]);
  w([faView, "2"], [xFa[1]!, "2"]);
  w([xFa[1]!, "1"], [fr, "A1"]);
  w([fr, "A2"], tap(ov, 70));
  const frLamp = add("contact-no", 86, 51);
  const hFire = add("lamp", 86, 60, { label: "FIRE ALARM\nACTIVATED", params: { colour: "Rd", testPin: true } });
  w(tap(cct, 86), [frLamp, "13"]);
  w([frLamp, "14"], [hFire, "+V"]);
  w([hFire, "-V"], tap(ov, 86));
  linkContact(p, frLamp.id, fr.id);
  const sLt = add("pushbutton", 98, 51, { label: "LAMP TEST" });
  const lt = ctl(null, 98, 57, 6, "LT");
  w(tap(cct, 98), [sLt, "13"]);
  w([sLt, "14"], tap(lt, 98));
  // Lamp test: the LT rail feeds each lamp's test terminal.
  w(tap(lt, 98), [hFire, "LT"]);
  w([hFire, "LT"], [hHealthy, "LT"]);
  // CCT and 0V out to the four starters and the two controls sheets.
  const cctOuts = [108, 114, 120, 126, 132, 138].map((x) => {
    const a = arrowOut(x, 51);
    w(tap(cct, x), [a, "1"]);
    return a;
  });
  const ovOuts = [111, 117, 123, 129, 135, 141].map((x) => {
    const a = arrowIn(x, 61);
    w([a, "1"], tap(ov, x));
    return a;
  });
  text(106, 41, "CCT AND 0V TO SHEETS 3–6, 8 AND 9");
  const supplies = page;

  // ===========================================================================
  // Sheet 8: supply fans duty/standby (the controls template)
  page = addPage(p, `Controls section: ${tag(SF1.id)}/${tag(SF2.id)} duty/standby`, supplies.id);
  setBoundary(p, page.id, 70);
  addSection(p, page.id, `${tag(SF1.id)} / ${tag(SF2.id)} DUTY/STANDBY CONTROL`, [2, 1, 146, 65]);
  const c = ctl(D.CCT, 4, 6, 143);
  const o = ctl(D.OV, 4, 62, 143);
  const cIn = arrowIn(147, 2);
  const oIn = arrowOut(147, 66);
  w([cIn, "1"], tap(c, 147));
  w(tap(o, 147), [oIn, "1"]);
  // Enable: AUTO/TEST (fire alarm or test), fans-fail latch, duty selector.
  const sAt = add("selector", 10, 13, { label: "AUTO/TEST", params: { key: true, legend: "AUTO TEST" } });
  const frEn = add("contact-no", 16, 13);
  const ffEn = add("contact-nc", 10, 24);
  const sDuty = add("selector", 10, 35, { rot: 180, label: "DUTY\nSELECTOR", params: { pole1: "co", key: true, legend: "1  2" } });
  const er1 = add("coil", 10, 56, { label: `${tag(SF1.id)}\nENABLE` });
  const er2 = add("coil", 20, 56, { label: `${tag(SF2.id)}\nENABLE` });
  w(tap(c, 10), [sAt, "13"]);
  w([sAt, "14"], [ffEn, "21"]);
  w(tap(c, 16), [frEn, "13"]);
  tee([frEn, "14"], [ffEn, "21"], [10, 19]);
  w([ffEn, "22"], [sDuty, "11"]);
  w([sDuty, "14"], [er1, "A1"]);
  w([sDuty, "12"], [er2, "A1"]);
  w([er1, "A2"], tap(o, 10));
  w([er2, "A2"], tap(o, 20));
  // Enable loops out to the starters, one above the other.
  const enLoop = (y: number, er: Element, fanTag: string) => {
    const a = arrowIn(28, y, `${fanTag}\nENABLE`);
    const k = add("contact-no", 28, y + 7);
    const b = arrowOut(28, y + 14, `${fanTag}\nENABLE`);
    w([a, "1"], [k, "13"]);
    w([k, "14"], [b, "1"]);
    linkContact(p, k.id, er.id);
  };
  enLoop(11, er1, tag(SF1.id));
  enLoop(31, er2, tag(SF2.id));
  // Running relays, from each starter's run signal.
  const runRelay = (x: number, fanTag: string) => {
    const a = arrowIn(x, 44, `${fanTag}\nRUN`);
    const k = add("coil", x, 56, { label: `${fanTag}\nRUNNING` });
    w([a, "1"], [k, "A1"]);
    w([k, "A2"], tap(o, x));
    return k;
  };
  const rr1 = runRelay(45, tag(SF1.id));
  const rr2 = runRelay(55, tag(SF2.id));
  // Volt-free running signals to the fire alarm system, below the enable loops.
  const fam = placePlantView(p, page.id, FAM_SF.id, [31, 76]);
  const xm = [31, 32, 33, 34].map((x) => add("terminal", x, 70));
  xm.forEach((t, i) => w([t, "2"], [fam, String(i + 1)]));
  const monitor = (x: number, rr: Element, xa: Element, xb: Element) => {
    const k = add("contact-no", x, 56);
    w([xa, "1"], [k, "14"]);
    w([k, "13"], [xb, "1"]);
    linkContact(p, k.id, rr.id);
  };
  monitor(32, rr1, xm[0]!, xm[1]!);
  monitor(37, rr2, xm[2]!, xm[3]!);
  // Airflow proving and fail timers, one set per fan.
  const proving = (x: number, er: Element, dps: string, fanTag: string) => {
    const k1 = add("contact-no", x, 13);
    const xa = add("terminal", x, 70);
    const xb = add("terminal", x + 1, 70);
    const view = placePlantView(p, page.id, dps, [x, 76]);
    const pr = add("coil", x + 7, 56, { label: `${fanTag}\nPROVEN` });
    w(tap(c, x), [k1, "13"]);
    w([k1, "14"], [xa, "1"]);
    w([xa, "2"], [view, "C"]);
    w([view, "NO"], [xb, "2"]);
    w([xb, "1"], [pr, "A1"]);
    w([pr, "A2"], tap(o, x + 7));
    linkContact(p, k1.id, er.id);
    const k2 = add("contact-no", x + 17, 13);
    const prNc = add("contact-nc", x + 17, 25);
    const t = add("timer-coil", x + 17, 56, { label: `${fanTag}\nFAIL TIMER`, params: { mode: "on", time: "10s" } });
    w(tap(c, x + 17), [k2, "13"]);
    w([k2, "14"], [prNc, "21"]);
    w([prNc, "22"], [t, "A1"]);
    w([t, "A2"], tap(o, x + 17));
    linkContact(p, k2.id, er.id);
    linkContact(p, prNc.id, pr.id);
    return t;
  };
  const t1 = proving(66, er1, DPS.SF1.id, tag(SF1.id));
  const t2 = proving(93, er2, DPS.SF2.id, tag(SF2.id));
  // Fans-fail latch.
  // Contacts of the fail timers: timed by their coils (the delay mark is drawn for them).
  const t1c = add("contact-no", 120, 13);
  const t2c = add("contact-no", 127, 13);
  const ffHold = add("contact-no", 133, 13);
  const sReset = add("pushbutton", 120, 33, { label: "FANS TRIP\nRESET", params: { contact: "nc" } });
  const ff = add("coil", 120, 56, { label: "FANS\nFAIL" });
  w(tap(c, 120), [t1c, "13"]);
  w([t1c, "14"], [sReset, "21"]);
  w(tap(c, 127), [t2c, "13"]);
  tee([t2c, "14"], [sReset, "21"], [120, 21]);
  w(tap(c, 133), [ffHold, "13"]);
  tee([ffHold, "14"], [sReset, "21"], [120, 23]);
  w([sReset, "22"], [ff, "A1"]);
  w([ff, "A2"], tap(o, 120));
  linkContact(p, t1c.id, t1.id);
  linkContact(p, t2c.id, t2.id);
  linkContact(p, ffHold.id, ff.id);
  linkContact(p, ffEn.id, ff.id);
  // Tripped lamps.
  const tripped = (x: number, t: Element, fanTag: string) => {
    const k = add("contact-no", x, 25);
    const h = add("lamp", x, 56, { label: `${fanTag}\nTRIPPED`, params: { colour: "Rd" } });
    w(tap(c, x), [k, "13"]);
    w([k, "14"], [h, "+V"]);
    w([h, "-V"], tap(o, x));
    linkContact(p, k.id, t.id);
  };
  tripped(137, t1, tag(SF1.id));
  tripped(146, t2, tag(SF2.id));
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
  for (const sh of [controlsSheet, efSheet]) linkContact(p, at(sh, "contact-no", 16, 13).id, fr.id);
  // CCT and 0V from the supplies sheet to every section that uses them.
  const fed = [...starters.map((s) => s.page), controlsSheet, efSheet];
  fed.forEach((sh, i) => {
    const isStarter = i < 4;
    linkOffpage(p, cctOuts[i]!.id, at(sh, "offpage", isStarter ? 28 : 147, isStarter ? 16 : 2).id);
    linkOffpage(p, ovOuts[i]!.id, at(sh, "offpage", isStarter ? 31 : 147, isStarter ? 19 : 66).id);
  });
  // Enable loops and run signals between each starter and its controls sheet.
  starters.forEach((s, i) => {
    const sh = i < 2 ? controlsSheet : efSheet;
    const y = i % 2 === 0 ? 11 : 31;
    linkOffpage(p, at(s.page, "offpage", 46, 33).id, at(sh, "offpage", 28, y).id);
    linkOffpage(p, at(sh, "offpage", 28, y + 14).id, at(s.page, "offpage", 46, 40).id);
    linkOffpage(p, at(s.page, "offpage", 78, 45).id, at(sh, "offpage", i % 2 === 0 ? 45 : 55, 44).id);
  });
  void starterSheet;

  // --- Expectations (controller.md §6) -------------------------------------------
  // The fire alarm should see each fan running exactly when its running relay is in;
  // and a duty/standby pair is never enabled together.
  for (const [sh, mon, a, b] of [
    [controlsSheet, FAM_SF, "SF-01", "SF-02"],
    [efSheet, FAM_EF, "EF-01", "EF-02"],
  ] as const) {
    setExpectation(p, { kind: "should", point: pointRef(mon.id, `${a} running`), when: [{ ref: at(sh, "coil", 45, 56).id, on: true }] });
    setExpectation(p, { kind: "should", point: pointRef(mon.id, `${b} running`), when: [{ ref: at(sh, "coil", 55, 56).id, on: true }] });
    setExpectation(p, {
      kind: "never",
      when: [
        { ref: at(sh, "coil", 10, 56).id, on: true },
        { ref: at(sh, "coil", 20, 56).id, on: true },
      ],
      join: "and",
      note: "Duty and standby never run together",
    });
  }

  // ===========================================================================
  // Sheet 10: general arrangement (not to scale)
  page = addPage(p, "General arrangement", efSheet.id);
  text(8, 5, "GENERAL ARRANGEMENT — FRONT VIEW (NOT TO SCALE)", "heading");
  const sections: [string, number][] = [
    ["MAIN SECTION", 36],
    [tag(SF1.id), 16],
    [tag(SF2.id), 16],
    [tag(EF1.id), 16],
    [tag(EF2.id), 16],
    ["CONTROLS", 36],
  ];
  const widths = ["1000", "400", "400", "400", "400", "1000"];
  let gx = 7;
  sections.forEach(([name, bw], i) => {
    box(gx, 10, bw, 62, "", false);
    text(gx + bw / 2, 14, name, "note", "middle");
    text(gx + bw / 2, 76, widths[i]!, "note", "middle");
    if (i === 0) {
      box(gx + 13, 32, 10, 8, "MAIN ISOL.");
      plate(gx + 11, 19, 14, 5, "POWER ON");
    } else if (i < 5) {
      box(gx + 3, 32, 10, 8, "ISOL.");
      plate(gx + 2, 19, 12, 6, `${name}\nRUNNING`);
    } else {
      plate(gx + 3, 19, 30, 4, "CONTROL CIRCUIT HEALTHY");
      plate(gx + 3, 25, 14, 4, "LAMP TEST");
      plate(gx + 19, 25, 14, 4, "FIRE ALARM");
      plate(gx + 3, 32, 30, 4, `${tag(SF1.id)}/${tag(SF2.id)} CONTROLS`);
      plate(gx + 3, 38, 30, 4, `${tag(EF1.id)}/${tag(EF2.id)} CONTROLS`);
    }
    gx += bw;
  });
  text(7, 83, "OVERALL PANEL DEPTH 800 mm. DIMENSIONS IN mm.");

  // ===========================================================================
  // Sheet 11: door labels, power section
  page = addPage(p, "Door labels: power section", page.id);
  text(8, 5, "DOOR LABELS — POWER SECTION", "heading");
  plate(8, 11, 68, 8, "{project:panelName}", "title");
  plate(8, 22, 45, 6, "POWER SECTION", "heading");
  plate(8, 31, 68, 10, "DANGER 400V\nISOLATE ELSEWHERE BEFORE OPENING DOOR", "heading");
  plate(8, 44, 22, 5, "POWER ON");
  [SF1, SF2, EF1, EF2].forEach((f, i) => plate(8 + i * 26, 53, 22, 6, `${tag(f.id)}\nRUNNING`));

  // ===========================================================================
  // Sheet 12: door labels, controls section
  page = addPage(p, "Door labels: controls section", page.id);
  text(8, 5, "DOOR LABELS — CONTROLS SECTION", "heading");
  plate(8, 11, 37, 5, "CONTROL CIRCUIT HEALTHY");
  plate(48, 11, 22, 5, "LAMP TEST");
  plate(73, 11, 33, 5, "FIRE ALARM ACTIVATED");
  [[SF1, SF2], [EF1, EF2]].forEach(([a, b], i) => {
    const y = 25 + i * 26;
    text(8, y, `${tag(a!.id)} / ${tag(b!.id)}`, "heading");
    plate(8, y + 3, 30, 7, "AUTO / TEST");
    plate(41, y + 3, 30, 7, `DUTY SELECTOR\n${tag(a!.id)}   ${tag(b!.id)}`);
    plate(74, y + 3, 22, 7, `${tag(a!.id)}\nTRIPPED`);
    plate(99, y + 3, 22, 7, `${tag(b!.id)}\nTRIPPED`);
    plate(124, y + 3, 22, 7, "FANS TRIP\nRESET");
  });

  // ===========================================================================
  // Sheet 13: general arrangement of the controls backplate, at true scale.
  // DIN rails and trunking, and the relays, timers and terminals from the
  // schematic sized from the generic library; the rest wait in the GA
  // workbench's list to be placed.
  {
    const encl = { w: 1000, h: 1600 };
    const gaPg = addGaPage(p, "General arrangement: controls backplate", { scale: fitScale(encl.w, encl.h), enclosure: encl, view: "backplate" }, p.pages[p.pages.length - 1]!.id);
    addGaItem(p, gaPg.id, { kind: "trunking", x: 20, y: 20, w: 40, h: 1560 });
    addGaItem(p, gaPg.id, { kind: "trunking", x: 940, y: 20, w: 40, h: 1560 });
    const rails = [180, 480, 780, 1080];
    rails.forEach((y, i) => {
      addGaItem(p, gaPg.id, { kind: "rail", x: 80, y: y - 17.5, w: 840, h: 35 });
      addGaItem(p, gaPg.id, { kind: "trunking", x: 80, y: y + 80 + (i === rails.length - 1 ? 40 : 0), w: 840, h: 60 });
    });
    // A note on a GA is an ordinary Text annotation (note 46).
    addElement(p, gaPg.id, "text", gaToSheet(gaPg.ga!, [80, 1490]), { label: "35 mm DIN RAIL. TRUNKING 60 × 60.", params: { size: "detail" } });
    // Relays and timers on the first two rails, terminals on the last; the rest left to place by hand.
    const wanted = (c: GaCandidate) => {
      const el = p.pages.flatMap((pg) => pg.elements).find((e) => e.id === c.refs[0]);
      return el && (el.symbol === "coil" || el.symbol === "timer-coil" || el.symbol === "terminal") && !c.door;
    };
    const cands = gaCandidates(p, () => "").filter(wanted);
    // Fill the first two rails with relays and timers, the bottom rail with terminal strips.
    let rail = 0;
    let x = 90;
    let tx = 90;
    for (const c of cands) {
      const strip = p.pages.flatMap((pg) => pg.elements).find((e) => e.id === c.refs[0])?.symbol === "terminal";
      if (strip) {
        if (tx + c.w > 910) continue;
        addGaItem(p, gaPg.id, { kind: "device", x: tx, y: rails[3]! - c.h / 2, w: c.w, h: c.h, refs: c.refs });
        tx += c.w + 10;
        continue;
      }
      if (x + c.w > 910) {
        rail++;
        x = 90;
      }
      if (rail > 1) continue;
      addGaItem(p, gaPg.id, { kind: "device", x, y: rails[rail]! - c.h / 2, w: c.w, h: c.h, refs: c.refs });
      x += c.w + 5;
    }
  }

  // ===========================================================================
  // Sheets 14 and 15: the door, front and back. Two leaves; the lamps, push
  // buttons and keyswitches drawn from the schematic parts on the left leaf,
  // the main isolator's handle on the right, a label plate at true size, and
  // dimensions setting out the rows. The back is the same door from inside,
  // mirrored, with the 22.3 mm cut-outs.
  {
    const encl = { w: 1000, h: 1600 };
    const last = p.pages[p.pages.length - 1]!.id;
    const front = addGaPage(
      p,
      "General arrangement: door front",
      {
        scale: fitScale(encl.w, encl.h),
        enclosure: encl,
        view: "door-front",
        leaves: [
          { w: 500, hinge: "left" },
          { w: 500, hinge: "right" },
        ],
      },
      last,
    );
    const door = gaCandidates(p, (el) => el.tag).filter((c) => c.door);
    const rows = [300, 420, 540, 660];
    const xs = [100, 160, 220, 280, 340];
    const placed: string[] = [];
    door
      .filter((c) => !c.part)
      .forEach((c, i) => {
        const x = xs[i % xs.length]!;
        const y = rows[Math.floor(i / xs.length)];
        if (y === undefined) return;
        placed.push(addGaItem(p, front.id, { kind: "device", x, y, w: c.w, h: c.h, refs: c.refs, cutout: "22.3" }).id);
      });
    const handle = door.find((c) => c.part === "handle");
    let handleId = "";
    if (handle) handleId = addGaItem(p, front.id, { kind: "device", x: 720, y: 300, w: handle.w, h: handle.h, refs: handle.refs, part: "handle", cutout: "22.5" }).id;
    addGaItem(p, front.id, { kind: "label", x: 100, y: 150, w: 300, h: 60, text: "LSP-01\nLIFE SAFETY PANEL", textMm: 12 });
    // Dimensions: the columns across the top row from the door's edge, and the rows from its top.
    const top = (p.pages.find((x) => x.id === front.id)!.gaItems ?? []).filter((it) => placed.includes(it.id) && it.y === rows[0]);
    addGaDim(p, front.id, {
      axis: "h",
      style: "chain",
      points: [{ v: 0, item: ENCL, edge: "start" }, ...top.map((it) => ({ v: it.x + it.w / 2, item: it.id, edge: "mid" as const }))],
      at: 250,
    });
    const firstCol = (p.pages.find((x) => x.id === front.id)!.gaItems ?? []).filter((it) => placed.includes(it.id) && it.x === xs[0]);
    addGaDim(p, front.id, {
      axis: "v",
      style: "chain",
      points: [{ v: 0, item: ENCL, edge: "start" }, ...firstCol.map((it) => ({ v: it.y, item: it.id, edge: "start" as const }))],
      at: -90,
    });
    if (handleId) {
      addGaDim(p, front.id, {
        axis: "h",
        style: "chain",
        points: [
          { v: 500, item: handleId, edge: "mid" },
          { v: 1000, item: ENCL, edge: "end" },
        ],
        at: 420,
      });
    }
    addGaPage(p, "General arrangement: door back", { scale: fitScale(encl.w, encl.h), enclosure: encl, view: "door-back", of: front.id }, front.id);
  }

  // --- Revision B: the proving and timer area on sheet 8 is clouded ----------
  addRevision(p, { date: "21/11/26", drawnBy: "FERRULE", description: "Airflow proving revised" });
  addCloud(p, controlsSheet.id, [63, 10, 55, 52]);

  // --- Sheet 14: notes, revisions and the symbol legend (annotations only) ---
  {
    const notes = addSparePage(p, p.pages[p.pages.length - 1]!.id);
    notes.title = "Notes, revisions and symbols";
    addElement(p, notes.id, "text", [4, 4], {
      params: { width: 70 },
      label: [
        "## General notes",
        "1. Control wiring **1.0 mm²** tri-rated, Bu for 24V DC, Bk for 230V AC controls.",
        "2. Field cables LSF, sizes as below unless the fire strategy says otherwise.",
        "3. All terminals numbered as drawn; wire numbers at both ends.",
        "",
        "| Circuit | Cable | Size |",
        "|---|---|---|",
        "| Supply fans | 4C SWA | 2.5 mm² |",
        "| Extract fans | 4C SWA | 2.5 mm² |",
        "| Fire alarm interface | 2C FP200 | 1.5 mm² |",
        "| Airflow proving | 2C screened | 0.75 mm² |",
      ].join("\n"),
    });
    addElement(p, notes.id, "revtable", [82, 4], { params: { rows: 6, size: "detail" } });
    addElement(p, notes.id, "legend", [4, 46], { params: { cols: 4, size: "detail" } });
  }

  // --- Finish: number everything, route every wire ---------------------------
  for (const pg of p.pages) routePage(avoid, pg);
  renumber(p);
  refreshConductors(p);
  return { project: p, starterTemplate: starter.id, controlsTemplate: controls.id };
}
