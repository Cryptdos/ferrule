/** v0.2 step 7b: Annotate tools and GA (door views, dimensions, label plates, bill of materials, rail fill). */
import { describe, expect, test } from "bun:test";
import { newProject } from "./model";
import { addElement, addGaDim, addGaItem, addGaPage, deleteGaItems, flipElements, moveGaItems, rotateElements, setGaSettings, setPartPoints } from "./ops";
import {
  dimLayout,
  dimValue,
  doorOwner,
  drawnGaItems,
  ENCL,
  gaCandidates,
  gaFrame,
  parseCutout,
  cutoutText,
  railFill,
  sheetLeaves,
  sheetTakes,
} from "./ga";
import { localGeometry, partPoints } from "./symbols";
import { parseProject } from "./validate";
import { billOfMaterials } from "./schedules";
import { checkProject } from "./checks";

describe("Annotate tools (16)", () => {
  test("call-outs are numbered 1, 2, 3… on each sheet", () => {
    const p = newProject("t");
    const pg = p.pages[0]!.id;
    const a = addElement(p, pg, "callout", [10, 10]);
    const b = addElement(p, pg, "callout", [20, 10]);
    const c = addElement(p, pg, "callout", [30, 10], { params: { n: 7 } });
    const d = addElement(p, pg, "callout", [40, 10]);
    expect([a, b, c, d].map((e) => e.params.n)).toEqual([1, 2, 7, 8]);
    const g = localGeometry(a, "");
    expect(g.prims.some((x) => x.t === "text" && x.text === "1")).toBe(true);
  });

  test("an arrow's tip and a polygon's corners move; turning and flipping turns the points", () => {
    const p = newProject("t");
    const pg = p.pages[0]!.id;
    const arrow = addElement(p, pg, "arrow", [10, 10]);
    expect(partPoints(arrow)).toEqual([
      [10, 10],
      [22, 10],
    ]);
    setPartPoints(p, pg, arrow.id, [
      [10, 10],
      [10, 20],
    ]);
    expect(arrow.params.pts).toBe("0,10");
    rotateElements(p, pg, [arrow.id]);
    expect(arrow.rot).toBe(0);
    expect(partPoints(arrow)![1]).toEqual([0, 10]);
    expect(() =>
      setPartPoints(p, pg, arrow.id, [
        [5, 5],
        [5, 5],
      ]),
    ).toThrow();
    const poly = addElement(p, pg, "polygon", [30, 30], { params: { pts: "10,0 10,6" } });
    flipElements(p, pg, [poly.id]);
    expect(poly.params.pts).toBe("10,0 10,-6");
    expect(() =>
      setPartPoints(p, pg, poly.id, [
        [0, 0],
        [1, 1],
      ]),
    ).toThrow();
    const g = localGeometry(poly, "");
    const outline = g.prims.find((x) => x.t === "line");
    expect(outline && outline.t === "line" ? outline.pts.length : 0).toBe(4);
  });

  test("a highlight is a translucent band", () => {
    const p = newProject("t");
    const h = addElement(p, p.pages[0]!.id, "highlight", [10, 10], { params: { colour: "green" } });
    const band = localGeometry(h, "").prims[0]!;
    expect(band.t === "poly" && band.tint).toContain("rgba");
  });
});

function doorProject() {
  const p = newProject("t");
  const pg = p.pages[0]!.id;
  const lamp = addElement(p, pg, "lamp", [20, 20], { params: { colour: "Gn" } });
  const pb = addElement(p, pg, "pushbutton", [30, 20]);
  const q = addElement(p, pg, "isolator", [40, 20], { params: { operator: "door" } });
  const k = addElement(p, pg, "coil", [50, 20]);
  const front = addGaPage(p, "", { scale: 10, enclosure: { w: 800, h: 1000 }, view: "door-front", leaves: [
    { w: 400, hinge: "left" },
    { w: 400, hinge: "right" },
  ] });
  return { p, pg, lamp, pb, q, k, front };
}

describe("GA door views", () => {
  test("a door has one or two leaves; the back mirrors the front's devices and leaves", () => {
    const { p, lamp, front } = doorProject();
    expect(sheetLeaves(p, front).map((l) => [l.x, l.w, l.hinge])).toEqual([
      [0, 400, "left"],
      [400, 400, "right"],
    ]);
    const it = addGaItem(p, front.id, { kind: "device", x: 50, y: 100, w: 30, h: 40, refs: [lamp.id] });
    const back = addGaPage(p, "", { scale: 10, enclosure: { w: 1, h: 1 }, view: "door-back", of: front.id });
    expect(back.ga!.enclosure).toEqual({ w: 800, h: 1000 });
    expect(doorOwner(p, back)?.id).toBe(front.id);
    const drawn = drawnGaItems(p, back);
    expect(drawn.length).toBe(1);
    expect(drawn[0]!.own).toBe(false);
    expect(drawn[0]!.it.x).toBe(800 - 50 - 30);
    // From inside, the front's left leaf is on the right, hinged on the other side.
    expect(sheetLeaves(p, back).map((l) => [l.index, l.x, l.hinge])).toEqual([
      [1, 0, "left"],
      [0, 400, "right"],
    ]);
    void it;
  });

  test("a door sheet can show one leaf, at its own scale", () => {
    const { p, lamp, front } = doorProject();
    addGaItem(p, front.id, { kind: "device", x: 500, y: 100, w: 30, h: 40, refs: [lamp.id] });
    const right = addGaPage(p, "", { scale: 5, enclosure: { w: 1, h: 1 }, view: "door-front", of: front.id, leaf: 1 });
    expect(gaFrame(p, right)).toEqual({ scale: 5, x0: 400, w: 400, h: 1000 });
    expect(drawnGaItems(p, right).length).toBe(1);
    const left = addGaPage(p, "", { scale: 5, enclosure: { w: 1, h: 1 }, view: "door-front", of: front.id, leaf: 0 });
    expect(drawnGaItems(p, left).length).toBe(0);
    // Its devices are laid out on the door's own sheet; this one takes dimensions only.
    expect(sheetTakes(p, right, "device")).toBe(false);
    expect(sheetTakes(p, right, "dim")).toBe(true);
    expect(() => addGaItem(p, right.id, { kind: "label", x: 0, y: 0, w: 60, h: 15 })).toThrow();
  });

  test("label plates go on the door front; rail and trunking don't", () => {
    const { p, front } = doorProject();
    const plate = addGaItem(p, front.id, { kind: "label", x: 100, y: 50, w: 60, h: 15 });
    expect(plate.text).toBe("LABEL");
    expect(plate.textMm).toBe(5);
    expect(() => addGaItem(p, front.id, { kind: "rail", x: 0, y: 0, w: 300, h: 35 })).toThrow();
    const bp = addGaPage(p, "", { scale: 10, enclosure: { w: 600, h: 800 }, view: "backplate" });
    expect(() => addGaItem(p, bp.id, { kind: "label", x: 0, y: 0, w: 60, h: 15 })).toThrow();
    expect(() => setGaSettings(p, front.id, { view: "backplate" })).toThrow();
  });

  test("an isolator worked through the door puts its handle on the door, its body on the backplate", () => {
    const { p, q, front } = doorProject();
    const cands = gaCandidates(p, () => "Q1").filter((c) => c.refs[0] === q.id);
    expect(cands.map((c) => [c.door, c.part ?? ""])).toEqual([
      [false, ""],
      [true, "handle"],
    ]);
    addGaItem(p, front.id, { kind: "device", x: 300, y: 300, w: 65, h: 65, refs: [q.id], part: "handle" });
    expect(gaCandidates(p, () => "").filter((c) => c.refs[0] === q.id).length).toBe(1);
    expect(() => addGaItem(p, front.id, { kind: "device", x: 0, y: 0, w: 65, h: 65, refs: [q.id], part: "handle" })).toThrow();
  });

  test("door cut-outs read round or rectangular", () => {
    expect(parseCutout("22.3")).toEqual({ d: 22.3 });
    expect(parseCutout("Ø22,5")).toEqual({ d: 22.5 });
    expect(parseCutout("92 x 92")).toEqual({ w: 92, h: 92 });
    expect(cutoutText("45×45")).toBe("45 × 45");
    expect(parseCutout("")).toBeNull();
  });

  test("door views, leaves, plates and dimensions survive saving; a 0.2 test build's 'door' is the door front", () => {
    const { p, lamp, front } = doorProject();
    const it = addGaItem(p, front.id, { kind: "device", x: 50, y: 100, w: 30, h: 40, refs: [lamp.id], cutout: "22.3" });
    addGaItem(p, front.id, { kind: "label", x: 100, y: 50, w: 60, h: 15, text: "MAIN\nPANEL" });
    addGaDim(p, front.id, { axis: "h", style: "chain", points: [{ v: 0, item: ENCL, edge: "start" }, { v: 50, item: it.id, edge: "start" }], at: -20 });
    const back = addGaPage(p, "", { scale: 10, enclosure: { w: 1, h: 1 }, view: "door-back", of: front.id, leaf: 0 });
    const raw = JSON.parse(JSON.stringify(p));
    const again = parseProject(raw);
    const f = again.pages.find((x) => x.id === front.id)!;
    expect(f.ga!.leaves?.length).toBe(2);
    expect(f.gaItems!.map((x) => x.kind).sort()).toEqual(["device", "dim", "label"]);
    expect(f.gaItems!.find((x) => x.kind === "device")!.cutout).toBe("22.3");
    expect(f.gaItems!.find((x) => x.kind === "label")!.text).toBe("MAIN\nPANEL");
    const b = again.pages.find((x) => x.id === back.id)!;
    expect(b.ga).toMatchObject({ view: "door-back", of: front.id, leaf: 0 });
    raw.pages[1].ga = { scale: 10, enclosure: { w: 600, h: 800 }, view: "door" };
    expect(parseProject(raw).pages[1]!.ga!.view).toBe("door-front");
  });
});

describe("Dimensions", () => {
  test("a dimension follows the items it's attached to, and keeps its place when one goes", () => {
    const p = newProject("t");
    const bp = addGaPage(p, "", { scale: 10, enclosure: { w: 600, h: 800 }, view: "backplate" });
    const rail = addGaItem(p, bp.id, { kind: "rail", x: 50, y: 100, w: 500, h: 35 });
    const d = addGaDim(p, bp.id, {
      axis: "v",
      style: "baseline",
      points: [
        { v: 0, item: ENCL, edge: "start" },
        { v: 117.5, item: rail.id, edge: "mid" },
      ],
      at: -20,
    });
    const items = new Map((bp.gaItems ?? []).map((x) => [x.id, x] as const));
    expect(dimValue(d.dim!.points[1]!, "v", items, { w: 600, h: 800 })).toBe(117.5);
    moveGaItems(p, bp.id, [rail.id], [0, 50]);
    expect(dimValue(d.dim!.points[1]!, "v", items, { w: 600, h: 800 })).toBe(167.5);
    const lay = dimLayout(p, bp, d);
    expect(lay.texts.map((t) => t.text)).toEqual(["167.5"]);
    expect(lay.texts[0]!.vertical).toBe(true);
    // Moving the dimension moves its line, not what it measures.
    moveGaItems(p, bp.id, [d.id], [-10, 30]);
    expect(d.dim!.at).toBe(-30);
    deleteGaItems(p, bp.id, [rail.id]);
    expect(d.dim!.points[1]!.item).toBeUndefined();
    expect(dimLayout(p, bp, d).texts[0]!.text).toBe("117.5");
  });

  test("chain gives each gap; baseline each distance from the first point, stacked", () => {
    const p = newProject("t");
    const bp = addGaPage(p, "", { scale: 10, enclosure: { w: 600, h: 800 }, view: "backplate" });
    const pts = [{ v: 0 }, { v: 100 }, { v: 250 }];
    const chain = addGaDim(p, bp.id, { axis: "h", style: "chain", points: pts, at: -20 });
    const base = addGaDim(p, bp.id, { axis: "h", style: "baseline", points: pts, at: -20 });
    expect(dimLayout(p, bp, chain).texts.map((t) => t.text)).toEqual(["100", "150"]);
    const b = dimLayout(p, bp, base);
    expect(b.texts.map((t) => t.text)).toEqual(["100", "250"]);
    expect(b.texts[1]!.at[1]).toBeLessThan(b.texts[0]!.at[1]);
  });
});

describe("Rail fill and the bill of materials", () => {
  test("rail fill: devices across the rail's line, in mm and %; overlaps are flagged", () => {
    const p = newProject("t");
    const pg = p.pages[0]!.id;
    const k1 = addElement(p, pg, "coil", [20, 20]);
    const k2 = addElement(p, pg, "coil", [30, 20]);
    const bp = addGaPage(p, "", { scale: 10, enclosure: { w: 600, h: 800 }, view: "backplate" });
    addGaItem(p, bp.id, { kind: "rail", x: 50, y: 100, w: 200, h: 35 });
    addGaItem(p, bp.id, { kind: "device", x: 60, y: 77.5, w: 16, h: 80, refs: [k1.id] });
    addGaItem(p, bp.id, { kind: "device", x: 70, y: 77.5, w: 16, h: 80, refs: [k2.id] });
    const [f] = railFill(bp);
    expect(f!.length).toBe(200);
    expect(f!.used).toBe(32);
    expect(f!.overlaps.length).toBe(1);
    const found = checkProject(p);
    expect(found.some((x) => x.level === "info" && /rail 1: 32 of 200 mm used \(16%\)/.test(x.message))).toBe(true);
    expect(found.some((x) => x.level === "warning" && /overlap/.test(x.message))).toBe(true);
  });

  test("bill of materials: devices by device table entry or generic size, terminals each, plates, rail by length", () => {
    const p = newProject("t");
    const pg = p.pages[0]!.id;
    const k1 = addElement(p, pg, "coil", [20, 20]);
    addElement(p, pg, "terminal", [20, 40]);
    addElement(p, pg, "terminal", [24, 40]);
    const lamp = addElement(p, pg, "lamp", [40, 20]);
    p.devices = [{ id: "dev_r", name: "Relay 2CO 24V DC", maker: "Maker", part: "R-2CO", kind: "relay", w: 16, h: 80, d: 70, library: false }];
    const bp = addGaPage(p, "", { scale: 10, enclosure: { w: 600, h: 800 }, view: "backplate" });
    addGaItem(p, bp.id, { kind: "rail", x: 50, y: 100, w: 500, h: 35 });
    addGaItem(p, bp.id, { kind: "device", x: 60, y: 77.5, w: 16, h: 80, refs: [k1.id], device: "dev_r" });
    const strip = gaCandidates(p, () => "").find((c) => c.refs.length === 2)!;
    addGaItem(p, bp.id, { kind: "device", x: 200, y: 95, w: strip.w, h: strip.h, refs: strip.refs });
    const front = addGaPage(p, "", { scale: 10, enclosure: { w: 600, h: 800 }, view: "door-front" });
    addGaItem(p, front.id, { kind: "device", x: 60, y: 60, w: 30, h: 40, refs: [lamp.id] });
    addGaItem(p, front.id, { kind: "label", x: 100, y: 20, w: 80, h: 20, text: "CONTROL PANEL" });
    const bom = billOfMaterials(p);
    const row = (s: string) => bom.find((r) => r.item.includes(s));
    expect(row("Relay 2CO")).toMatchObject({ maker: "Maker", part: "R-2CO", quantity: 1, sheet: String(bp.number) });
    expect(row("DIN rail")).toMatchObject({ quantity: 0.5, unit: "m" });
    expect(row("Terminal (each)")!.quantity).toBe(2);
    expect(row("Door device")!.quantity).toBe(1);
    expect(row("Label plate 80 × 20")!.tags).toBe("CONTROL PANEL");
  });
});
