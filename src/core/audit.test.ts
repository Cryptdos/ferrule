/** The parts audit (design-v0.2 §3, §4). */
import { describe, expect, test } from "bun:test";
import { newProject } from "./model";
import { addElement, connect, flipElements, linkContact } from "./ops";
import { advance, compile, initialState, toggle } from "./sim";
import { listSymbols, localGeometry, terminalNames, terminalPoint } from "./symbols";
import { elementTexts } from "./tags";
import { controlBusbars } from "./testing";
import { parseProject } from "./validate";
import { contactTable } from "./xref";

function ladder() {
  const p = newProject("t");
  const pg = p.pages[0]!.id;
  const { cct, ov } = controlBusbars(p, pg, 10, 80);
  const add = (s: string, x: number, y: number, params = {}) => addElement(p, pg, s, [x, y], { params });
  const w = (a: [string, string], b: [string, string]) => connect(p, pg, a, b);
  return { p, pg, add, w, top: (x: number): [string, string] => [cct.id, String(x)], bottom: (x: number): [string, string] => [ov.id, String(x)] };
}

describe("parts list", () => {
  test("timer contact, push button NO/NC and Notes are gone; one Push button and one Text", () => {
    const ids = listSymbols().map((s) => s.id);
    for (const gone of ["timer-contact", "pb-no", "pb-nc", "notes"]) expect(ids).not.toContain(gone);
    for (const kept of ["pushbutton", "text", "selector", "busbar"]) expect(ids).toContain(kept);
  });
});

describe("contacts follow their timer (6, 32, 76)", () => {
  test("a contact on a TON timer closes after the delay, shows the delay mark and prints 17-18; Instantaneous doesn't", () => {
    const { p, add, w, top, bottom } = ladder();
    const sw = add("selector", 20, 30);
    const t = add("coil", 20, 70, { type: "timer", time: "5s", mode: "on" });
    w(top(20), [sw.id, "13"]);
    w([sw.id, "14"], [t.id, "A1"]);
    w([t.id, "A2"], bottom(20));
    const timed = add("contact", 40, 30);
    const inst = add("contact", 60, 30, { instant: true });
    const h1 = add("lamp", 40, 60);
    const h2 = add("lamp", 60, 60);
    for (const [k, h, x] of [[timed, h1, 40], [inst, h2, 60]] as const) {
      w(top(x), [k.id, "13"]);
      w([k.id, "14"], [h.id, "+V"]);
      w([h.id, "-V"], bottom(x));
      linkContact(p, k.id, t.id);
    }
    const c = compile(p);
    let s = toggle(c, initialState(c), sw.id);
    expect([s.lamps[h1.id], s.lamps[h2.id]]).toEqual([false, true]);
    s = advance(c, s, 5);
    expect(s.lamps[h1.id]).toBe(true);
    // The mark (two stems and an arc) on the timed contact only.
    const arcs = (el: typeof timed) => localGeometry(el, elementTexts(el, p)).prims.filter((x) => x.t === "arc").length;
    expect([arcs(timed), arcs(inst)]).toEqual([1, 0]);
    expect(contactTable(p, t).map((r) => r[1])).toEqual(["17-18", "13-14"]);
  });
});

describe("push button", () => {
  test("NO, NC, or both worked by one head", () => {
    const { p, add, w, top, bottom } = ladder();
    const b = add("pushbutton", 20, 30, { contact: "both" });
    expect(terminalNames(b)).toEqual(["13", "14", "21", "22"]);
    const h1 = add("lamp", 20, 60);
    const h2 = add("lamp", 40, 60);
    w(top(20), [b.id, "13"]);
    w([b.id, "14"], [h1.id, "+V"]);
    w([h1.id, "-V"], bottom(20));
    w(top(23), [b.id, "21"]);
    w([b.id, "22"], [h2.id, "+V"]);
    w([h2.id, "-V"], bottom(40));
    const c = compile(p);
    const s = initialState(c);
    expect([s.lamps[h1.id], s.lamps[h2.id]]).toEqual([false, true]);
    // Held down: NO made, NC broken.
    const held = toggle(c, s, b.id);
    expect([held.lamps[h1.id], held.lamps[h2.id]]).toEqual([true, false]);
  });
});

describe("selector (33, 35, 75)", () => {
  test("3 position, two poles: I closes 13-14, II closes 23-24; an NC pole and a changeover", () => {
    const { p, add, w, top, bottom } = ladder();
    const s3 = add("selector", 20, 30, { positions: "3", poles: 2, pole1: "I", pole2: "II" });
    expect(terminalNames(s3)).toEqual(["13", "14", "23", "24"]);
    const h1 = add("lamp", 20, 60);
    const h2 = add("lamp", 40, 60);
    w(top(20), [s3.id, "13"]);
    w([s3.id, "14"], [h1.id, "+V"]);
    w([h1.id, "-V"], bottom(20));
    w(top(23), [s3.id, "23"]);
    w([s3.id, "24"], [h2.id, "+V"]);
    w([h2.id, "-V"], bottom(40));
    const c = compile(p);
    let s = initialState(c);
    expect([s.lamps[h1.id], s.lamps[h2.id]]).toEqual([false, false]);
    s = toggle(c, s, s3.id); // I
    expect([s.lamps[h1.id], s.lamps[h2.id]]).toEqual([true, false]);
    s = toggle(c, s, s3.id); // II
    expect([s.lamps[h1.id], s.lamps[h2.id]]).toEqual([false, true]);
    s = toggle(c, s, s3.id); // back to 0
    expect([s.lamps[h1.id], s.lamps[h2.id]]).toEqual([false, false]);
    expect(c.inputs.find((i) => i.el === s3.id)?.positions).toEqual(["0", "I", "II"]);
    // An NC pole numbers 11-12, an NO 13-14; up to four poles. Changeover is the whole switch (v0.5 A43): k1, k2, k4 on every pole.
    expect(terminalNames(add("selector", 80, 30, { poles: 4, pole1: "nc-I", pole2: "I", pole3: "I", pole4: "I" }))).toEqual(["11", "12", "23", "24", "33", "34", "43", "44"]);
    expect(terminalNames(add("selector", 100, 30, { poles: 2, changeover: true }))).toEqual(["12", "14", "11", "22", "24", "21"]);
  });

  test("the legend sits under the head, clear of the terminal numbers (34)", () => {
    const { add } = ladder();
    const s = add("selector", 20, 30, { positions: "3", changeover: true });
    const g = localGeometry(s, "S1");
    // The legend is the position names, I – 0 – II; a 3-position changeover is numbered 3, 2 (common), 1.
    const legend = g.prims.find((x) => x.t === "text" && x.text === "II");
    const twelve = g.prims.find((x) => x.t === "text" && x.text === "3");
    expect(legend && legend.t === "text" && twelve && twelve.t === "text" ? legend.at[1] - twelve.at[1] : 0).toBeGreaterThan(3);
  });
});

describe("flip (31, 39)", () => {
  test("F flips a part top to bottom: its terminals swap ends; twice puts it back", () => {
    const { p, pg, add } = ladder();
    const k = add("contact", 20, 30);
    expect(terminalPoint(k, "13")).toEqual([20, 27]);
    flipElements(p, pg, [k.id]);
    expect(terminalPoint(k, "13")).toEqual([20, 33]);
    expect(localGeometry(k, "K1").terminals.find((t) => t.name === "13")!.dir).toBe("down");
    flipElements(p, pg, [k.id]);
    expect(k.flip).toBeUndefined();
  });
});

describe("text", () => {
  test("Text is formatted (headings, lists) and can be centred about its point", () => {
    const { add } = ladder();
    const t = add("text", 75, 20, { align: "middle" });
    t.label = "## Title\nA line";
    const g = localGeometry(t, { tag: "", label: t.label });
    const texts = g.prims.filter((x) => x.t === "text");
    expect(texts.find((x) => x.t === "text" && x.text === "Title" && x.bold)).toBeTruthy();
    // Centred: each line straddles the origin.
    for (const x of texts) if (x.t === "text") expect(x.at[0]).toBeLessThan(0);
  });
});

describe("terminal names (30, 44)", () => {
  test("lamps have +V, -V and LT; a DC supply +V and -V", () => {
    const { add } = ladder();
    expect(terminalNames(add("lamp", 20, 40, { testPin: true }))).toEqual(["LT", "+V", "-V"]);
    expect(terminalNames(add("supply", 40, 4, { system: "dc" }))).toEqual(["+V", "-V"]);
  });
});
