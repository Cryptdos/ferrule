/** v0.5 step 6: wire numbers by supply (design-wire-numbering.md). */
import { describe, expect, test } from "bun:test";
import { newProject } from "./model";
import { addDistribution, addElement, connect, updateDistribution } from "./ops";
import { renumber } from "./renumber";
import { checkProject } from "./checks";
import { wireMarkers } from "./schedules";
import { elementTexts } from "./tags";
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

  test("a block or rail on no supply gives no number, and Check says so; a link arrow can't be set to a supply or carry a typed reference", async () => {
    const { requireSymbol } = await import("./symbols");
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
