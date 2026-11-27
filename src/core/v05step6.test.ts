/** v0.5 step 6: wire numbers by supply (design-wire-numbering.md). */
import { describe, expect, test } from "bun:test";
import { newProject, voltageBand } from "./model";
import { addDistribution, addElement, addGaItem, addGaPage, addProjectDevice, connect, setGaItemDevice, updateDistribution, updateProjectDevice } from "./ops";
import { renumber } from "./renumber";
import { checkProject } from "./checks";
import { billOfMaterials, wireMarkers } from "./schedules";
import { displayTag, elementTexts } from "./tags";
import { localGeometry, requireSymbol } from "./symbols";
import { UNIT_MM } from "./geometry";
import { blockWays } from "./wires";
import { controlBusbars } from "./testing";

const sheet = () => {
  const p = newProject("t");
  return { p, pg: p.pages[0]!.id };
};
const numberAt = (p: ReturnType<typeof newProject>, id: string, t: string) => p.conductors.find((c) => c.terminals.some(([e, n]) => e === id && n === t))!.number;

describe("step 6a: a supply's tag", () => {
  test("tags are given from 1 in the order supplies are added; they can be changed, 0 included; Check reports two alike", () => {
    const { p } = sheet();
    const l = addDistribution(p, { name: "L", kind: "line" });
    const n = addDistribution(p, { name: "N", kind: "neutral" });
    const ov = addDistribution(p, { name: "0V", kind: "dc0" });
    expect([l.tag, n.tag, ov.tag]).toEqual([1, 2, 3]);
    updateDistribution(p, ov.id, { tag: 0 });
    expect(addDistribution(p, { name: "CCT" }).tag).toBe(3);
    expect(() => updateDistribution(p, l.id, { tag: -1 })).toThrow("whole number");
    updateDistribution(p, n.id, { tag: 1 });
    expect(checkProject(p).filter((f) => /same tag/.test(f.message)).map((f) => [f.level, f.message])).toEqual([
      ["error", "Supplies L and N have the same tag, 1: every wire on either would be numbered 1"],
    ]);
  });

  test("every wire on a supply carries its number, from a rail, a block or looped device to device; a wire past a part is numbered by position", () => {
    const { p, pg } = sheet();
    const { cct, ov } = controlBusbars(p, pg, 10, 60);
    const blk = addElement(p, pg, "busbar", [80, 10], { params: { dist: cct.params.dist as string, length: 20 } });
    const s1 = addElement(p, pg, "pushbutton", [30, 25]);
    const s2 = addElement(p, pg, "pushbutton", [40, 25]);
    const s3 = addElement(p, pg, "pushbutton", [90, 25]);
    const k1 = addElement(p, pg, "coil", [30, 45]);
    connect(p, pg, [cct.id, "30"], [s1.id, "13"]);
    // Looped from s1 to s2, not off the rail: the same supply, the same number.
    connect(p, pg, [s1.id, "13"], [s2.id, "13"]);
    connect(p, pg, [blk.id, "10"], [s3.id, "13"]);
    connect(p, pg, [s1.id, "14"], [k1.id, "A1"]);
    connect(p, pg, [k1.id, "A2"], [ov.id, "30"]);
    renumber(p);
    const cctTag = String(p.distributions.find((d) => d.name === "CCT")!.tag);
    const ovTag = String(p.distributions.find((d) => d.name === "0V")!.tag);
    expect([numberAt(p, s1.id, "13"), numberAt(p, s2.id, "13"), numberAt(p, s3.id, "13")]).toEqual([cctTag, cctTag, cctTag]);
    expect(numberAt(p, s1.id, "14")).toBe("1-16");
    expect(numberAt(p, k1.id, "A2")).toBe(ovTag);
    // The rail reads its supply's name and tag.
    expect(elementTexts(cct, p).name).toBe(`CCT ${cctTag}`);
  });

  test("a supply wire landing on a terminal keeps the supply's number, and its markers say it; the terminal keeps its own", () => {
    const { p, pg } = sheet();
    const { cct } = controlBusbars(p, pg, 10, 60);
    const t = addElement(p, pg, "terminal", [30, 30]);
    connect(p, pg, [cct.id, "30"], [t.id, "1"]);
    renumber(p);
    const tag = String(p.distributions.find((d) => d.name === "CCT")!.tag);
    expect(numberAt(p, t.id, "1")).toBe(tag);
    expect(t.tag).toBe("1-16");
    expect(wireMarkers(p).map((m) => m.text)).toEqual([tag, tag]);
    // Not reported as a wire whose number disagrees with its terminal, nor as one number on many wires.
    expect(checkProject(p).some((f) => /lands on terminal|is on \d+ wires/.test(f.message))).toBe(false);
  });

  test("a block or rail on no supply gives no number, and Check says so; a link arrow can't be set to a supply or carry a typed reference", () => {
    const { p, pg } = sheet();
    const local = addElement(p, pg, "rail", [0, 10], { params: { length: 60 } });
    const s1 = addElement(p, pg, "pushbutton", [30, 25]);
    connect(p, pg, [local.id, "30"], [s1.id, "13"]);
    renumber(p);
    expect(numberAt(p, s1.id, "13")).toBe("1-16");
    expect(checkProject(p).filter((f) => /on no supply/.test(f.message)).map((f) => f.level)).toEqual(["info"]);
    expect(requireSymbol("offpage").params.map((x) => x.key)).not.toContain("dist");
    expect(requireSymbol("offpage").params.map((x) => x.key)).not.toContain("ref");
  });
});

describe("step 6b: blocks and rails", () => {
  const weight = (p: ReturnType<typeof newProject>, el: Parameters<typeof elementTexts>[0]) => {
    const prim = localGeometry(el, elementTexts(el, p)).prims.find((x) => x.t === "line");
    return prim && prim.t === "line" ? Math.round((prim.w ?? 0) * UNIT_MM * 100) / 100 : 0;
  };

  test("a supply's voltage band: extra-low up to 50 V AC or 120 V DC, low above; DC by its words or its kind", () => {
    expect(voltageBand({ voltage: "24 V AC", kind: "line" })).toBe("elv");
    expect(voltageBand({ voltage: "50 V", kind: "line" })).toBe("elv");
    expect(voltageBand({ voltage: "110 V AC", kind: "line" })).toBe("lv");
    expect(voltageBand({ voltage: "110 V DC", kind: "line" })).toBe("elv");
    expect(voltageBand({ voltage: "110 V", kind: "dc+" })).toBe("elv");
    expect(voltageBand({ voltage: "230 V", kind: "line" })).toBe("lv");
    expect(voltageBand({ voltage: "0 V", kind: "dc0" })).toBe("elv");
    expect(voltageBand({ voltage: "", kind: "neutral" })).toBeUndefined();
    expect(voltageBand({ voltage: "mains", kind: "line" })).toBeUndefined();
  });

  test("a power rail is drawn by its supply's voltage, a distribution block at 0.7 mm whatever it carries", () => {
    const { p, pg } = sheet();
    const lv = addDistribution(p, { name: "L", kind: "line", voltage: "230 V" });
    const elv = addDistribution(p, { name: "CCT", kind: "line", voltage: "24 V AC" });
    const unset = addDistribution(p, { name: "N", kind: "neutral", voltage: "" });
    const rail = (d: string) => addElement(p, pg, "rail", [10, 10], { params: { dist: d, length: 20 } });
    expect(requireSymbol("rail").name).toBe("Power rail");
    expect(weight(p, rail(lv.id))).toBe(0.5);
    expect(weight(p, rail(elv.id))).toBe(0.35);
    expect(weight(p, rail(unset.id))).toBe(0.35);
    expect(weight(p, rail(""))).toBe(0.35);
    expect(weight(p, addElement(p, pg, "busbar", [10, 40], { params: { dist: elv.id, length: 20 } }))).toBe(0.7);
    expect(requireSymbol("rail").params.map((x) => x.key)).not.toContain("weight");
  });

  test("a block's ways are counted from the wires drawn onto it; the bill of materials says so, and Check warns when its device has fewer", () => {
    const { p, pg } = sheet();
    const l = addDistribution(p, { name: "L", kind: "line", voltage: "230 V" });
    const blk = addElement(p, pg, "busbar", [10, 10], { params: { dist: l.id, length: 40 } });
    const loads = [20, 30, 40].map((x) => addElement(p, pg, "isolator", [x, 25], { params: { function: "breaker", poles: 1 } }));
    for (const q of loads) connect(p, pg, [blk.id, String(q.pos[0] - 10)], [q.id, "1"]);
    renumber(p);
    expect(blockWays(p, blk)).toBe(3);
    const ga = addGaPage(p, "", { scale: 5, enclosure: { w: 600, h: 800 }, view: "backplate" });
    const it = addGaItem(p, ga.id, { kind: "device", x: 100, y: 100, w: 60, h: 50, refs: [blk.id] });
    const tag = displayTag(blk, p);
    expect(billOfMaterials(p).find((r) => r.tags === tag)?.item).toBe("Distribution block (no device picked), needs at least 3 ways");
    const dev = addProjectDevice(p, { name: "2-way block", maker: "", part: "", kind: "block", w: 40, h: 40, d: 0, ways: 2 });
    setGaItemDevice(p, ga.id, it.id, dev.id);
    expect(billOfMaterials(p).find((r) => r.tags === tag)?.item).toBe("2-way block, needs at least 3 ways");
    expect(checkProject(p).filter((f) => /ways$/.test(f.message)).map((f) => [f.level, f.message])).toEqual([
      ["warning", `Sheet ${ga.number}: distribution block ${tag} has 3 wires and its device, 2-way block, has 2 ways`],
    ]);
    updateProjectDevice(p, dev.id, { ways: 6 });
    expect(checkProject(p).some((f) => /ways$/.test(f.message))).toBe(false);
    // Each drawn block is its own line, even with the same device.
    const blk2 = addElement(p, pg, "busbar", [10, 50], { params: { dist: l.id, length: 20 } });
    const it2 = addGaItem(p, ga.id, { kind: "device", x: 200, y: 100, w: 60, h: 50, refs: [blk2.id] });
    setGaItemDevice(p, ga.id, it2.id, dev.id);
    renumber(p);
    expect(billOfMaterials(p).filter((r) => r.item.startsWith("2-way block")).map((r) => [r.item, r.quantity])).toEqual([
      ["2-way block, needs at least 0 ways", 1],
      ["2-way block, needs at least 3 ways", 1],
    ]);
  });

  test("Check reports a wire joining blocks or rails on different supplies, straight or through a terminal", () => {
    const { p, pg } = sheet();
    const l = addDistribution(p, { name: "L", kind: "line", voltage: "230 V" });
    const n = addDistribution(p, { name: "N", kind: "neutral", voltage: "230 V" });
    const e = addDistribution(p, { name: "PE", kind: "earth" });
    const bl = addElement(p, pg, "busbar", [10, 10], { params: { dist: l.id, length: 20 } });
    const bn = addElement(p, pg, "busbar", [10, 20], { params: { dist: n.id, length: 20 } });
    const bl2 = addElement(p, pg, "busbar", [40, 10], { params: { dist: l.id, length: 20 } });
    connect(p, pg, [bl.id, "20"], [bl2.id, "0"]);
    renumber(p);
    const joins = () => checkProject(p).filter((f) => /joins supplies/.test(f.message));
    expect(joins()).toEqual([]);
    const s = connect(p, pg, [bl.id, "5"], [bn.id, "5"]);
    renumber(p);
    expect(joins().map((f) => [f.level, f.message, f.ids])).toEqual([
      ["warning", "Sheet 1: a wire joins supplies L and N. Blocks and rails joined by a wire are one supply: put them on the same one", [s.id]],
    ]);
    const be = addElement(p, pg, "busbar", [10, 70], { params: { dist: e.id, length: 20 } });
    const t = addElement(p, pg, "terminal", [50, 40]);
    const a = connect(p, pg, [bn.id, "15"], [t.id, "1"]);
    const b = connect(p, pg, [t.id, "2"], [be.id, "10"]);
    renumber(p);
    expect(joins().map((f) => [f.message.split(".")[0], [...f.ids].sort()]).sort()).toEqual([
      ["Sheet 1: a wire joins supplies L and N", [s.id]],
      ["Sheet 1: a wire joins supplies N and PE", [a.id, b.id].sort()],
    ]);
    // Through a part it's two wires, switched: not reported.
    const f = addElement(p, pg, "fuse", [70, 30]);
    const bl3 = addElement(p, pg, "busbar", [80, 60], { params: { dist: n.id, length: 10 } });
    connect(p, pg, [bl2.id, "10"], [f.id, "1"]);
    connect(p, pg, [f.id, "2"], [bl3.id, "0"]);
    renumber(p);
    expect(joins().length).toBe(2);
  });
});
