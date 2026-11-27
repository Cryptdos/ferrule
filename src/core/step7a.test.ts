/** v0.2 step 7a: GA and simulation. */
import { describe, expect, test } from "bun:test";
import { controlBusbars } from "./testing";
import { newProject } from "./model";
import { addElement, addGaItem, addGaPage, addPage, connect, setPageType } from "./ops";
import { compile, initialState, toggle } from "./sim";
import { changedGaStrips, fitScale, gaCandidates, markGaSeen, scaleText, suitsKey, syncGaStrips } from "./ga";
import { parseProject } from "./validate";
import { localGeometry } from "./symbols";

describe("simulation", () => {
  test("click a fuse to blow it, again to replace it; it's drawn broken while blown (49)", () => {
    const p = newProject("t");
    const pg = p.pages[0]!.id;
    const { cct, ov } = controlBusbars(p, pg, 10, 80);
    const f = addElement(p, pg, "fuse", [20, 30]);
    const h = addElement(p, pg, "lamp", [20, 60]);
    connect(p, pg, [cct.id, "20"], [f.id, "1"]);
    connect(p, pg, [f.id, "2"], [h.id, "+V"]);
    connect(p, pg, [h.id, "-V"], [ov.id, "20"]);
    const c = compile(p);
    let s = initialState(c);
    expect(s.lamps[h.id]).toBe(true);
    s = toggle(c, s, f.id);
    expect(s.lamps[h.id]).toBe(false);
    const blown = localGeometry({ ...f, params: { ...f.params, __op: true } }, "F1");
    const whole = localGeometry(f, "F1");
    expect(blown.prims.filter((x) => x.t === "line").length).toBeGreaterThan(whole.prims.filter((x) => x.t === "line").length);
    s = toggle(c, s, f.id);
    expect(s.lamps[h.id]).toBe(true);
  });
});

describe("GA sheets", () => {
  test("Fit gives the largest scale that fits, to one decimal place (v0.5 A60), never larger than 1:1", () => {
    expect(fitScale(1000, 1600)).toBe(12.2);
    expect(fitScale(800, 1200)).toBe(9.2);
    expect(fitScale(100, 100)).toBe(1);
    // What it gives fits; a tenth less wouldn't.
    for (const [w, h] of [[1000, 1600], [800, 1200], [400, 500], [2400, 1000]] as const) {
      const s = fitScale(w, h);
      expect(Math.round(s * 10)).toBe(s * 10);
      expect(fitScale(w / (s / (s - 0.1)), h / (s / (s - 0.1)))).toBeLessThanOrEqual(s - 0.1 + 1e-9);
    }
    expect(scaleText(7.5)).toBe("1:7.5");
    expect(scaleText(12)).toBe("1:12");
  });

  test("sheet type: an empty sheet becomes a GA and back; a used one doesn't (12)", () => {
    const p = newProject("t");
    const pg = addPage(p, "Two");
    setPageType(p, pg.id, "ga");
    expect(pg.ga?.view).toBe("backplate");
    setPageType(p, pg.id, "spare");
    expect(pg.ga).toBeUndefined();
    expect(pg.spare).toBe(true);
    setPageType(p, pg.id, "schematic");
    expect(pg.spare).toBeUndefined();
    addElement(p, p.pages[0]!.id, "coil", [20, 20]);
    expect(() => setPageType(p, p.pages[0]!.id, "ga")).toThrow();
  });

  test("a GA note from a test build becomes a Text annotation (46)", () => {
    const p = newProject("t");
    const ga = addGaPage(p, "", { scale: 10, enclosure: { w: 600, h: 800 }, view: "backplate" });
    const raw = JSON.parse(JSON.stringify(p));
    raw.pages[1].gaItems.push({ id: "g_note", kind: "note", x: 100, y: 700, w: 100, h: 10, text: "RAIL 35 MM" });
    const back = parseProject(raw);
    const page = back.pages.find((x) => x.id === ga.id)!;
    expect(page.gaItems!.length).toBe(0);
    expect(page.elements.find((e) => e.id === "g_note")?.label).toBe("RAIL 35 MM");
  });

  test("a placed strip grows with the schematic, and Check says so until the GA is opened (45)", () => {
    const p = newProject("t");
    const pg = p.pages[0]!.id;
    const t1 = addElement(p, pg, "terminal", [20, 30]);
    const t2 = addElement(p, pg, "terminal", [24, 30]);
    const ga = addGaPage(p, "", { scale: 10, enclosure: { w: 600, h: 800 }, view: "backplate" });
    const cand = gaCandidates(p, () => "").find((c) => c.refs.includes(t1.id))!;
    const it = addGaItem(p, ga.id, { kind: "device", x: 50, y: 50, w: cand.w, h: cand.h, refs: cand.refs });
    expect(it.strip).toBe("X1");
    const w0 = it.w;
    addElement(p, pg, "terminal", [28, 30]);
    expect(syncGaStrips(p)).toBe(true);
    expect(it.refs!.length).toBe(3);
    expect(it.w).toBeGreaterThan(w0);
    expect(gaCandidates(p, () => "").some((c) => c.refs.includes(t2.id))).toBe(false);
    expect(changedGaStrips(p).map((c) => c.added)).toEqual([1]);
    markGaSeen(ga);
    expect(changedGaStrips(p)).toEqual([]);
  });

  test("a device suits schematic parts: lamps, push buttons and terminal types apart", () => {
    const p = newProject("t");
    const pg = p.pages[0]!.id;
    expect(suitsKey(p, addElement(p, pg, "lamp", [10, 10]))).toBe("lamp");
    expect(suitsKey(p, addElement(p, pg, "pushbutton", [20, 10]))).toBe("pushbutton");
    expect(suitsKey(p, addElement(p, pg, "terminal", [30, 10], { params: { function: "earth" } }))).toBe("earthTerminal");
    expect(suitsKey(p, addElement(p, pg, "fuse", [40, 10]))).toBe("fuse");
  });
});
