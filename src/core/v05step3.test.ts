/** v0.5 step 3: windows, row two, sheets (design-v0.5.md §4). */
import { describe, expect, test } from "bun:test";
import { newProject } from "./model";
import { addGaItem, addGaPage, OpError, setGaSettings } from "./ops";

describe("v0.5 step 3", () => {
  test("A33: an empty GA sheet changes to any view, Detail included; one with things on it says why", () => {
    const p = newProject("t");
    const ga = addGaPage(p, "", { scale: 5, enclosure: { w: 600, h: 800 }, view: "backplate" });
    setGaSettings(p, ga.id, { view: "detail" });
    expect(ga.ga).toMatchObject({ view: "detail", scale: 1 });
    setGaSettings(p, ga.id, { view: "door-front" });
    expect(ga.ga!.view).toBe("door-front");
    setGaSettings(p, ga.id, { view: "backplate" });
    addGaItem(p, ga.id, { kind: "rail", x: 50, y: 50, w: 200, h: 35 });
    expect(() => setGaSettings(p, ga.id, { view: "detail" })).toThrow(OpError);
    expect(() => setGaSettings(p, ga.id, { view: "detail" })).toThrow("Only an empty sheet changes to a detail sheet: delete what's on it first");
    expect(ga.ga!.view).toBe("backplate");
  });
});

describe("v0.5 step 4b: the Selector", () => {
  const setup = () => {
    const p = newProject("s");
    return { p, pg: p.pages[0]!.id };
  };

  test("A41: a pole's choices fit the positions; changing 3 to 2 puts a 3 position choice back to the default", async () => {
    const { addElement, updateElement } = await import("./ops");
    const { requireSymbol, selectorPoles } = await import("./symbols");
    const { p, pg } = setup();
    const s = addElement(p, pg, "selector", [40, 30], { params: { positions: "3", poles: 2, pole1: "I+II", pole2: "nc-II" } });
    const pole1 = requireSymbol("selector").params.find((x) => x.key === "pole1")!;
    expect(pole1.optionsFor!(s).map((o) => o.value)).toEqual(["I", "II", "I+II", "nc-I", "nc-II"]);
    updateElement(p, pg, s.id, { params: { positions: "2" } });
    expect(pole1.optionsFor!(s).map((o) => o.value)).toEqual(["I", "nc-I"]);
    expect(s.params.pole1).toBeUndefined();
    expect(s.params.pole2).toBeUndefined();
    expect(selectorPoles(s).map((x) => [x.kind, x.closed])).toEqual([["no", [1]], ["no", [1]]]);
    // Changeover leaves the pole list (A43): it's a tick box of its own.
    const sel = requireSymbol("selector").params;
    expect(sel.flatMap((x) => x.options ?? []).some((o) => /changeover/i.test(o.label))).toBe(false);
    expect(sel.find((x) => x.key === "changeover")?.type).toBe("bool");
  });

  test("A42: in Simulate each pole is drawn from the positions it's set to", async () => {
    const { addElement } = await import("./ops");
    const { localGeometry } = await import("./symbols");
    const { p, pg } = setup();
    const s = addElement(p, pg, "selector", [40, 30], { params: { positions: "3", poles: 2, pole1: "I", pole2: "II" } });
    // A pole's blade: NO open slants to x - 1.2, closed to x - 0.25 (pole 1 at x 0, pole 2 at x 3).
    const blades = (pos: number | null) =>
      localGeometry({ ...s, params: { ...s.params, ...(pos === null ? {} : { __pos: pos }) } }, "S1")
        .prims.filter((x) => x.t === "line" && x.pts.length === 2 && x.pts[0]![1] === 1.5 && x.pts[1]![1] < 0)
        .map((x) => (x.t === "line" ? Math.round((x.pts[1]![0] - x.pts[0]![0]) * 100) / 100 : 0));
    expect(blades(null)).toEqual([-1.2, -1.2]);
    expect(blades(1)).toEqual([-0.25, -1.2]);
    expect(blades(2)).toEqual([-1.2, -0.25]);
    expect(blades(0)).toEqual([-1.2, -1.2]);
  });

  test("A43: changeover is the whole switch, so no set-up gives two terminals one number; Check names any that does", async () => {
    const { addElement } = await import("./ops");
    const { terminalNames } = await import("./symbols");
    const { p, pg } = setup();
    const choices: Record<string, string[]> = { "2": ["I", "nc-I"], "3": ["I", "II", "I+II", "nc-I", "nc-II"], "4": ["p1", "p2", "p3", "p4"] };
    let n = 0;
    for (const positions of ["2", "3", "4"])
      for (const changeover of [false, true])
        for (const a of choices[positions]!)
          for (const b of choices[positions]!) {
            const s = addElement(p, pg, "selector", [10 + (n++ % 60), 30], { params: { positions, poles: 4, changeover, pole1: a, pole2: b, pole3: a, pole4: b } });
            const names = terminalNames(s);
            expect(new Set(names).size).toBe(names.length);
          }
  });

  test("A46: called Selector; 4 positions 1 to 4, no off, each pole closed in one; no changeover", async () => {
    const { addElement } = await import("./ops");
    const { requireSymbol, selectorNames, selectorPoles, localGeometry } = await import("./symbols");
    const { compile, initialState, toggle } = await import("./sim");
    expect(requireSymbol("selector").name).toBe("Selector");
    const { p, pg } = setup();
    const s = addElement(p, pg, "selector", [40, 30], { params: { positions: "4", poles: 4, changeover: true, pos3: "AUTO" } });
    expect(s.params.changeover).toBeUndefined();
    expect(selectorPoles(s).map((x) => x.closed)).toEqual([[0], [1], [2], [3]]);
    expect(selectorNames(s).map((x) => x.name)).toEqual(["1", "2", "AUTO", "4"]);
    expect(localGeometry(s, "S1").terminals.map((t) => t.name)).toEqual(["13", "14", "23", "24", "33", "34", "43", "44"]);
    const c = compile(p);
    expect(c.inputs.find((i) => i.el === s.id)!.positions).toEqual(["1", "2", "3", "4"]);
    let st = initialState(c);
    for (let i = 0; i < 4; i++) st = toggle(c, st, s.id);
    expect(st.inputs[s.id]).toBe(0);
  });
});
