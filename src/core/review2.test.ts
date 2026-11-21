/** Second review: rails across sheets, plant tags, renumber preview, link arrows, field wires, parts. */
import { describe, expect, test } from "bun:test";
import { newProject } from "./model";
import { addElement, addPage, addPlant, connect, linkContact, linkOffpage, placePlantView, updateElement } from "./ops";
import { renumber, renumberPreview } from "./renumber";
import { slideRailTaps } from "./routing";
import { localGeometry, terminalNames } from "./symbols";
import { parseProject } from "./validate";
import { isFieldWire } from "./wires";
import { contactTable, xrefText } from "./xref";

function project() {
  const p = newProject("t");
  const pg = p.pages[0]!.id;
  return { p, pg };
}

describe("control rails across sheets", () => {
  test("rails with the same name are one conductor, and each shows the other sheets", () => {
    const { p, pg } = project();
    const pg2 = addPage(p, "Two").id;
    const a = addElement(p, pg, "rail", [0, 80], { params: { name: "0V", length: 100 } });
    const b = addElement(p, pg2, "rail", [0, 80], { params: { name: "0V", length: 100 } });
    const k1 = addElement(p, pg, "coil", [20, 60]);
    const k2 = addElement(p, pg2, "coil", [20, 60]);
    connect(p, pg, [k1.id, "A2"], [a.id, "20"]);
    connect(p, pg2, [k2.id, "A2"], [b.id, "20"]);
    const cond = (id: string) => p.conductors.find((c) => c.terminals.some(([x, t]) => x === id && t === "A2"))!.id;
    expect(cond(k1.id)).toBe(cond(k2.id));
    expect(xrefText(p, a, "")).toBe("/2");
    expect(xrefText(p, b, "")).toBe("/1");
  });
});

describe("link arrows", () => {
  test("ticking Source on one makes its partner the destination", () => {
    const { p, pg } = project();
    const a = addElement(p, pg, "offpage", [10, 10]);
    const b = addElement(p, pg, "offpage", [50, 10]);
    linkOffpage(p, a.id, b.id);
    expect([a.params.source, b.params.source]).toEqual([true, false]);
    updateElement(p, pg, b.id, { params: { source: true } });
    expect(a.params.source).toBe(false);
  });

  test("on the same sheet a reference is just the column", () => {
    const { p, pg } = project();
    const a = addElement(p, pg, "offpage", [10, 10]);
    const b = addElement(p, pg, "offpage", [50, 10]);
    linkOffpage(p, a.id, b.id);
    expect(xrefText(p, a, "")).toBe("26");
  });

  test("older files: direction in/out becomes the Source tick", () => {
    const { p, pg } = project();
    const a = addElement(p, pg, "offpage", [10, 10]);
    const old = JSON.parse(JSON.stringify(p));
    old.pages[0].elements.find((e: { id: string }) => e.id === a.id).params = { direction: "in" };
    expect(parseProject(old).pages[0]!.elements[0]!.params.source).toBe(false);
  });
});

describe("plant tags", () => {
  test("prefix + where the first view is, like every other tag", () => {
    const { p, pg } = project();
    const sef = addPlant(p, "", "Safety extract fan", ["1", "2"], { prefix: "SEF" });
    const u = addPlant(p, "", "Damper", ["1", "2"], { prefix: "U" });
    placePlantView(p, pg, sef.id, [24, 100]);
    placePlantView(p, pg, u.id, [60, 100]);
    renumber(p);
    expect(sef.tag).toBe("SEF-1-13");
    expect(u.tag).toBe("U1-31");
  });

  test("older plant tags give their prefix", () => {
    const { p } = project();
    const old = JSON.parse(JSON.stringify(p));
    old.plant = [{ id: "p1", tag: "SF-01", description: "", terminals: [] }];
    expect(parseProject(old).plant[0]!.prefix).toBe("SF");
  });
});

describe("renumber preview", () => {
  test("lists only what would change, and changes nothing", () => {
    const { p, pg } = project();
    const k = addElement(p, pg, "coil", [20, 60]);
    const s = addElement(p, pg, "contact-no", [40, 30]);
    linkContact(p, s.id, k.id);
    renumber(p);
    expect(renumberPreview(p).changes).toEqual([]);
    updateElement(p, pg, k.id, { tag: "K99" });
    const { changes } = renumberPreview(p);
    expect(changes).toEqual([{ kind: "Tag", where: "1-11", from: "K99", to: "K1-11" }]);
    expect(k.tag).toBe("K99");
    void contactTable;
  });
});

describe("rail taps", () => {
  test("don't slide under a terminal that points away from the rail", () => {
    const { p, pg } = project();
    const page = p.pages[0]!;
    const bus = addElement(p, pg, "busbar", [10, 10], { params: { length: 60, name: "L" } });
    const h = addElement(p, pg, "lamp", [20, 45]);
    const down = connect(p, pg, [h.id, "V-"], [bus.id, "24"]); // V- points down, the bar is above
    const up = connect(p, pg, [h.id, "V+"], [bus.id, "30"]); // V+ points up at the bar
    slideRailTaps(page);
    expect(down.to[1]).toBe("24");
    expect(up.to[1]).toBe("10");
  });
});

describe("field wires", () => {
  test("decided by the panel boundary unless set by hand", () => {
    const { p, pg } = project();
    const page = p.pages[0]!;
    const x = addElement(p, pg, "terminal", [20, 80]);
    const k = addElement(p, pg, "coil", [20, 100]);
    k.zone = "external";
    const s = connect(p, pg, [x.id, "2"], [k.id, "A1"]);
    expect(isFieldWire(page, s)).toBe(true);
    s.field = false;
    expect(isFieldWire(page, s)).toBe(false);
  });
});

describe("parts", () => {
  test("socket: L and N at the pole pitch, earth out of the side", () => {
    const { p, pg } = project();
    const s = addElement(p, pg, "socket", [20, 20]);
    const g = localGeometry(s, "");
    const at = (n: string) => g.terminals.find((t) => t.name === n)!;
    expect(at("N").at[0] - at("L").at[0]).toBe(3);
    expect(at("E").dir).toBe("right");
  });

  test("earth types draw differently", () => {
    const { p, pg } = project();
    const shapes = ["earth", "protective", "functional", "chassis", "equipotential"].map((type) =>
      JSON.stringify(localGeometry(addElement(p, pg, "earth", [20, 20], { params: { type } }), "").prims),
    );
    expect(new Set(shapes).size).toBe(5);
    expect(terminalNames(addElement(p, pg, "earth", [30, 20], { params: { type: "chassis" } }))).toEqual(["E"]);
  });

  test("amber lamps become yellow", () => {
    const { p, pg } = project();
    const h = addElement(p, pg, "lamp", [20, 20], { params: { colour: "AM" } });
    expect(h.params.colour).toBe("Ye");
  });
});
