/**
 * Title block (DESIGN.md §4a). A simple block along the bottom of the
 * sheet, filled from project data; only the sheet title and number come
 * from the page. Laid out in millimetres, relative to the block's top-left.
 */
import { TITLE_BLOCK_MM } from "./geometry";
import type { Page, Project } from "./model";

export interface TitleCell {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  value: string;
  /** Larger text for the main fields. */
  big?: boolean;
}

export interface TitleBlock {
  w: number;
  h: number;
  logo: { x: number; y: number; w: number; h: number };
  cells: TitleCell[];
  revisions: {
    x: number;
    y: number;
    w: number;
    rowH: number;
    cols: { label: string; w: number }[];
    rows: string[][];
  };
}

/** How many revisions fit in the table; older ones drop off the top. */
export const REVISION_ROWS = 4;

export function titleBlock(project: Project, page: Page): TitleBlock {
  const { w, h } = TITLE_BLOCK_MM;
  const info = project.project;
  const logoW = 40;
  const projW = 110;
  const sheetW = 72;
  const revW = w - logoW - projW - sheetW;
  const third = h / 3;
  const sx = logoW + projW;
  const half = sheetW / 2;
  const sheetNo = `${page.number} of ${project.pages.length}`;
  const drawn = [info.drawnBy, info.drawnDate].filter(Boolean).join("  ");
  const checked = [info.checkedBy, info.checkedDate].filter(Boolean).join("  ");

  const cells: TitleCell[] = [
    { x: logoW, y: 0, w: projW, h: third, label: "Project", value: info.title, big: true },
    { x: logoW, y: third, w: projW, h: third, label: "Panel", value: info.panelName, big: true },
    { x: logoW, y: 2 * third, w: projW, h: third, label: "Sheet title", value: page.title, big: true },
    { x: sx, y: 0, w: half, h: third, label: "Sheet", value: sheetNo },
    { x: sx + half, y: 0, w: half, h: third, label: "Job no.", value: info.jobNo },
    { x: sx, y: third, w: half, h: third, label: "Drawn", value: drawn },
    { x: sx + half, y: third, w: half, h: third, label: "Checked", value: checked },
    { x: sx, y: 2 * third, w: sheetW, h: third, label: "Drawing ref.", value: info.drawingNo },
  ];

  const rows = project.revisions.slice(-REVISION_ROWS).map((r) => [r.rev, r.date, r.drawnBy]);
  return {
    w,
    h,
    logo: { x: 0, y: 0, w: logoW, h },
    cells,
    revisions: {
      x: logoW + projW + sheetW,
      y: 0,
      w: revW,
      rowH: h / (REVISION_ROWS + 1),
      cols: [
        { label: "Issue", w: 12 },
        { label: "Date", w: 22 },
        { label: "Drawn", w: revW - 34 },
      ],
      rows,
    },
  };
}
