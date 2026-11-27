import { describe, expect, test } from "bun:test";
import { AvoidLib } from "libavoid-js";
import { newProject } from "./model";
import { addElement, connect, deleteElements, deleteSegments, resetRoute, setManualRoute, wire } from "./ops";
import { routePage } from "./routing";
import { dragLeg, isOrthogonal, refitManual, simplifyRoute, connectionDots } from "./wires";
import { moveElements } from "./ops";
import type { Vec } from "./geometry";

await AvoidLib.load();
const avoid = AvoidLib.getInstance();

function setup() {
  const p = newProject("t");
  const pg = p.pages[0]!.id;
  return { p, pg, page: p.pages[0]! };
}

describe("route helpers", () => {
  test("simplify drops repeats and straight-through points", () => {
    expect(simplifyRoute([[0, 0], [0, 0], [0, 5], [0, 9], [4, 9]])).toEqual([[0, 0], [0, 9], [4, 9]]);
  });

  test("dragging a middle leg moves it sideways", () => {
    const r = dragLeg([[0, 0], [0, 5], [10, 5], [10, 10]], 1, [3, 2]);
    expect(r).toEqual([[0, 0], [0, 7], [10, 7], [10, 10]]);
  });

  test("dragging an end leg adds a jog and keeps the end on its terminal", () => {
    const r = simplifyRoute(dragLeg([[0, 0], [0, 10]], 0, [4, 0]));
    expect(r[0]).toEqual([0, 0]);
    expect(r[r.length - 1]).toEqual([0, 10]);
    expect(isOrthogonal(r)).toBe(true);
    expect(r).toContainEqual([4, 0]);
  });

  test("manual routes follow their terminals", () => {
    const r = refitManual([[0, 0], [0, 5], [10, 5], [10, 10]], [2, 0], [10, 12]);
    expect(r).toEqual([[2, 0], [2, 5], [10, 5], [10, 12]]);
  });
});

describe("wiring", () => {
  test("connect refuses bad terminals, self-wires and duplicates", () => {
    const { p, pg } = setup();
    const k = addElement(p, pg, "coil", [10, 20]);
    const h = addElement(p, pg, "lamp", [20, 20]);
    expect(() => connect(p, pg, [k.id, "X9"], [h.id, "+V"])).toThrow();
    expect(() => connect(p, pg, [k.id, "A1"], [k.id, "A2"])).toThrow();
    connect(p, pg, [k.id, "A1"], [h.id, "+V"]);
    expect(() => connect(p, pg, [h.id, "+V"], [k.id, "A1"])).toThrow(/already/);
  });

  test("a straight rung routes straight", () => {
    const { p, pg, page } = setup();
    const rail = addElement(p, pg, "busbar", [0, 10], { params: { length: 100 } });
    const s = addElement(p, pg, "contact", [20, 20]);
    const k = addElement(p, pg, "coil", [20, 30]);
    connect(p, pg, [rail.id, "20"], [s.id, "13"]);
    connect(p, pg, [s.id, "14"], [k.id, "A1"]);
    routePage(avoid, page);
    expect(page.segments.map((w) => w.points)).toEqual([
      [[20, 10], [20, 17]],
      [[20, 23], [20, 27]],
    ]);
  });

  test("a cable screen is drawn over the cores: wires go straight through it", () => {
    const { p, pg, page } = setup();
    const a = addElement(p, pg, "contact", [20, 20]);
    const b = addElement(p, pg, "coil", [20, 40]);
    const c = addElement(p, pg, "contact", [23, 20]);
    const d = addElement(p, pg, "coil", [23, 40]);
    addElement(p, pg, "screen", [20, 30], { params: { span: 3 } });
    connect(p, pg, [a.id, "14"], [b.id, "A1"]);
    connect(p, pg, [c.id, "14"], [d.id, "A1"]);
    routePage(avoid, page);
    expect(page.segments.map((w) => w.points)).toEqual([
      [[20, 23], [20, 37]],
      [[23, 23], [23, 37]],
    ]);
  });

  test("auto routes are square, on the grid, and avoid symbol bodies", () => {
    const { p, pg, page } = setup();
    const a = addElement(p, pg, "coil", [10, 20]);
    const b = addElement(p, pg, "coil", [30, 40]);
    addElement(p, pg, "motor", [20, 30]); // in the way
    connect(p, pg, [a.id, "A2"], [b.id, "A1"]);
    routePage(avoid, page);
    const pts = page.segments[0]!.points;
    expect(pts[0]).toEqual([10, 23]);
    expect(pts[pts.length - 1]).toEqual([30, 37]);
    expect(isOrthogonal(pts)).toBe(true);
    expect(pts.every(([x, y]) => Number.isInteger(x) && Number.isInteger(y))).toBe(true);
    // Never through the motor (circle radius 3 about 20,30).
    for (let i = 0; i < pts.length - 1; i++) {
      const [p0, p1] = [pts[i]!, pts[i + 1]!];
      for (let t = 0; t <= 1; t += 0.05) {
        const x = p0[0] + (p1[0] - p0[0]) * t;
        const y = p0[1] + (p1[1] - p0[1]) * t;
        expect(Math.hypot(x - 20, y - 30) > 2.9 || Math.abs(x - 20) > 2.5).toBe(true);
      }
    }
  });

  test("routes follow moved symbols; manual routes are kept", () => {
    const { p, pg, page } = setup();
    const a = addElement(p, pg, "coil", [10, 20]);
    const b = addElement(p, pg, "lamp", [30, 40]);
    const w = connect(p, pg, [a.id, "A2"], [b.id, "+V"]);
    routePage(avoid, page);
    const manual: Vec[] = [[10, 23], [10, 30], [30, 30], [30, 37]];
    setManualRoute(p, pg, w.id, manual);
    moveElements(p, pg, [b.id], [4, 0]);
    routePage(avoid, page);
    expect(w.route).toBe("manual");
    expect(w.points).toEqual([[10, 23], [10, 30], [34, 30], [34, 37]]);
    resetRoute(p, pg, [w.id]);
    routePage(avoid, page);
    expect(w.route).toBe("auto");
    expect(w.points[w.points.length - 1]).toEqual([34, 37]);
  });

  test("manual routes must be square and on the terminals", () => {
    const { p, pg, page } = setup();
    const a = addElement(p, pg, "coil", [10, 20]);
    const b = addElement(p, pg, "lamp", [30, 40]);
    const w = connect(p, pg, [a.id, "A2"], [b.id, "+V"]);
    routePage(avoid, page);
    expect(() => setManualRoute(p, pg, w.id, [[10, 23], [30, 37]])).toThrow();
    expect(() => setManualRoute(p, pg, w.id, [[11, 23], [11, 30], [30, 30], [30, 37]])).toThrow();
  });
});

describe("tees and conductors", () => {
  test("teeing into a wire adds a junction and keeps one conductor", () => {
    const { p, pg, page } = setup();
    const a = addElement(p, pg, "lamp", [10, 20]);
    const b = addElement(p, pg, "lamp", [10, 60]);
    const c = addElement(p, pg, "lamp", [30, 40]);
    const w = connect(p, pg, [a.id, "-V"], [b.id, "+V"]);
    routePage(avoid, page);
    wire(p, pg, { wire: w.id, at: [10, 40] }, { terminal: [c.id, "+V"] });
    routePage(avoid, page);
    const j = page.elements.find((e) => e.symbol === "junction")!;
    expect(j.pos).toEqual([10, 40]);
    expect(page.segments).toHaveLength(3);
    expect(new Set(page.segments.map((s) => s.conductor)).size).toBe(1);
    expect(p.conductors).toHaveLength(1);
    expect(p.conductors[0]!.terminals).toHaveLength(4);
  });

  test("removing the tee joins the wire back up", () => {
    const { p, pg, page } = setup();
    const a = addElement(p, pg, "lamp", [10, 20]);
    const b = addElement(p, pg, "lamp", [10, 60]);
    const c = addElement(p, pg, "lamp", [30, 40]);
    const w = connect(p, pg, [a.id, "-V"], [b.id, "+V"]);
    routePage(avoid, page);
    const t = wire(p, pg, { wire: w.id, at: [10, 40] }, { terminal: [c.id, "+V"] });
    deleteSegments(p, pg, [t.id]);
    expect(page.elements.some((e) => e.symbol === "junction")).toBe(false);
    expect(page.segments).toHaveLength(1);
    expect([page.segments[0]!.from[0], page.segments[0]!.to[0]].sort()).toEqual([a.id, b.id].sort());
  });

  test("components and busbars break conductors; terminals carry them", () => {
    const { p, pg } = setup();
    const rail = addElement(p, pg, "busbar", [0, 10], { params: { length: 100 } });
    const x1 = addElement(p, pg, "terminal", [20, 15]);
    const s = addElement(p, pg, "contact", [20, 25]);
    const h = addElement(p, pg, "lamp", [40, 25]);
    connect(p, pg, [rail.id, "20"], [x1.id, "1"]);
    connect(p, pg, [x1.id, "2"], [s.id, "13"]);
    connect(p, pg, [rail.id, "40"], [h.id, "+V"]);
    const w = connect(p, pg, [s.id, "14"], [h.id, "-V"]);
    // Terminal X1 carries its wire through to the contact's 13; the busbar's
    // other tap (to the lamp) is its own conductor, and 14 → lamp is another.
    expect(p.conductors).toHaveLength(3);
    const before = p.conductors.find((c) => c.id === w.conductor)!;
    before.number = "11-22";
    deleteElements(p, pg, [x1.id]);
    // The 14 → N conductor survives with its number.
    expect(p.conductors.find((c) => c.id === w.conductor)?.number).toBe("11-22");
  });

  test("connection dots on rail taps and three-way meetings", () => {
    const { p, pg, page } = setup();
    const rail = addElement(p, pg, "busbar", [0, 10], { params: { length: 100 } });
    const h = addElement(p, pg, "lamp", [20, 20]);
    connect(p, pg, [rail.id, "20"], [h.id, "+V"]);
    routePage(avoid, page);
    expect(connectionDots(page)).toEqual([[20, 10]]);
  });
});

describe("rail taps", () => {
  test("a rail tap follows its symbol along the rung", () => {
    const { p, pg, page } = setup();
    const rail = addElement(p, pg, "busbar", [0, 70], { params: { length: 100 } });
    const h = addElement(p, pg, "lamp", [40, 60]);
    const w = connect(p, pg, [h.id, "-V"], [rail.id, "40"]);
    routePage(avoid, page);
    moveElements(p, pg, [h.id], [10, 0]);
    routePage(avoid, page);
    expect(w.to).toEqual([rail.id, "50"]);
    expect(w.points).toEqual([[50, 63], [50, 70]]);
  });
});
