import { describe, expect, test } from "bun:test";
import { newProject } from "./model";
import {
  addElement,
  addPage,
  addRevision,
  connect,
  deletePage,
  duplicatePage,
  movePage,
  renamePage,
  updateProjectInfo,
} from "./ops";
import { titleBlock, REVISION_ROWS } from "./titleblock";

describe("pages", () => {
  test("add, move and delete keep sheet numbers in order", () => {
    const p = newProject("t");
    const first = p.pages[0]!;
    const b = addPage(p, "Controls");
    const c = addPage(p, "Supplies", first.id);
    expect(p.pages.map((x) => x.title)).toEqual(["Sheet 1", "Supplies", "Controls"]);
    expect(p.pages.map((x) => x.number)).toEqual([1, 2, 3]);
    movePage(p, b.id, 0);
    expect(p.pages.map((x) => x.id)).toEqual([b.id, first.id, c.id]);
    expect(b.number).toBe(1);
    deletePage(p, first.id);
    expect(p.pages.map((x) => x.number)).toEqual([1, 2]);
    renamePage(p, c.id, "  Power  ");
    expect(c.title).toBe("Power");
  });

  test("the last page can't be deleted", () => {
    const p = newProject("t");
    expect(() => deletePage(p, p.pages[0]!.id)).toThrow();
  });

  test("duplicate copies elements and wires with new ids", () => {
    const p = newProject("t");
    const pg = p.pages[0]!.id;
    const a = addElement(p, pg, "coil", [10, 10], { tag: "K1" });
    const b = addElement(p, pg, "lamp", [20, 10]);
    connect(p, pg, [a.id, "A2"], [b.id, "N"]);
    const copy = duplicatePage(p, pg);
    expect(copy.number).toBe(2);
    expect(copy.elements).toHaveLength(2);
    expect(copy.elements[0]!.id).not.toBe(a.id);
    expect(copy.elements[0]!.tag).toBe("");
    expect(copy.segments).toHaveLength(1);
    expect(copy.segments[0]!.from[0]).toBe(copy.elements[0]!.id);
    expect(p.conductors).toHaveLength(2);
  });
});

describe("title block", () => {
  test("is filled from project data, with the sheet title and number from the page", () => {
    const p = newProject("t", "Riverside Offices");
    updateProjectInfo(p, { panelName: "LSP-01", jobNo: "J1234", drawingNo: "LSP-01-E-001", drawnBy: "AB", drawnDate: "20/11/26" });
    addPage(p, "Controls");
    const tb = titleBlock(p, p.pages[1]!);
    const val = (label: string) => tb.cells.find((c) => c.label === label)?.value;
    expect(val("Project")).toBe("Riverside Offices");
    expect(val("Panel")).toBe("LSP-01");
    expect(val("Sheet title")).toBe("Controls");
    expect(val("Sheet")).toBe("2 of 2");
    expect(val("Job no.")).toBe("J1234");
    expect(val("Drawn")).toBe("AB  20/11/26");
    expect(val("Drawing ref.")).toBe("LSP-01-E-001");
  });

  test("revision table shows the latest issues, latest at the bottom", () => {
    const p = newProject("t");
    for (let i = 0; i < 5; i++) addRevision(p, { date: `0${i + 1}/01/27` });
    expect(p.revisions.map((r) => r.rev)).toEqual(["A", "B", "C", "D", "E", "F"]);
    const rows = titleBlock(p, p.pages[0]!).revisions.rows;
    expect(rows).toHaveLength(REVISION_ROWS);
    expect(rows[rows.length - 1]![0]).toBe("F");
  });

  test("the block fits the page width", () => {
    const p = newProject("t");
    const tb = titleBlock(p, p.pages[0]!);
    const right = tb.revisions.x + tb.revisions.cols.reduce((s, c) => s + c.w, 0);
    expect(right).toBeCloseTo(tb.w);
    for (const c of tb.cells) expect(c.x + c.w).toBeLessThanOrEqual(tb.w + 1e-9);
  });
});
