/**
 * Drawn annotations built from text or from the project: formatted notes
 * (a small Markdown), the revision list and the symbol legend.
 */
import { lineUnits, type Vec } from "./geometry";
import type { Element, Project } from "./model";
import { getSymbol, listSymbols, localGeometry, type Prim } from "./symbols";
import { CAP_HEIGHT, textWidth } from "./textwidth";

const THIN = lineUnits("thin");
const RULE = lineUnits("thick");

/** A prim moved by (dx, dy). */
export function movePrim(p: Prim, dx: number, dy: number): Prim {
  const m = (v: Vec): Vec => [v[0] + dx, v[1] + dy];
  switch (p.t) {
    case "line":
    case "poly":
      return { ...p, pts: p.pts.map(m) };
    case "circle":
    case "ellipse":
      return { ...p, c: m(p.c) };
    case "arc":
      return { ...p, from: m(p.from), to: m(p.to) };
    case "text":
      return { ...p, at: m(p.at) };
  }
}

const txt = (x: number, y: number, s: string, size: number, bold = false, anchor: "start" | "middle" | "end" = "start"): Prim => ({
  t: "text",
  at: [x, y],
  text: s,
  size,
  anchor,
  role: "label",
  ...(bold ? { bold: true } : {}),
});
const hline = (x0: number, x1: number, y: number, w = THIN): Prim => ({ t: "line", pts: [[x0, y], [x1, y]], w });
const vline = (x: number, y0: number, y1: number, w = THIN): Prim => ({ t: "line", pts: [[x, y0], [x, y1]], w });

// ---------------------------------------------------------------------------
// Notes: a small Markdown

type Run = { text: string; bold: boolean; italic?: boolean; strike?: boolean };

const sameStyle = (a: Run, b: Omit<Run, "text">) => a.bold === b.bold && !!a.italic === !!b.italic && !!a.strike === !!b.strike;

/**
 * Inline Markdown in a line (v0.2.1 note 8): `***bold italic***`, `**bold**`
 * or `__bold__`, `*italic*` or `_italic_`, `~~struck~~`, `` `code` `` (as
 * written), links `[text](url)` and images `![alt](file)` as their text, and
 * `\*` for a character that would otherwise be a mark.
 */
function runsOf(s: string, bold = false): Run[] {
  const out: Run[] = [];
  const st = { bold, italic: false, strike: false };
  let buf = "";
  const flush = () => {
    if (!buf) return;
    const last = out[out.length - 1];
    if (last && sameStyle(last, st)) last.text += buf;
    else out.push({ text: buf, bold: st.bold, ...(st.italic ? { italic: true } : {}), ...(st.strike ? { strike: true } : {}) });
    buf = "";
  };
  // Links and images read as their text.
  const src = s.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1");
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    const next = src[i + 1];
    if (c === "\\" && next && /[\\`*_{}[\]()#+\-.!|~>]/.test(next)) {
      buf += next;
      i++;
      continue;
    }
    if (c === "`") {
      const end = src.indexOf("`", i + 1);
      if (end > i) {
        buf += src.slice(i + 1, end);
        i = end;
        continue;
      }
    }
    if (c === "~" && next === "~") {
      flush();
      st.strike = !st.strike;
      i++;
      continue;
    }
    if (c === "*" || c === "_") {
      // An underscore inside a word (a_b) is just a character.
      if (c === "_" && /\w/.test(src[i - 1] ?? "") && /\w/.test(next ?? "")) {
        buf += c;
        continue;
      }
      let n = 1;
      while (src[i + n] === c && n < 3) n++;
      flush();
      if (n >= 2) st.bold = !st.bold;
      if (n !== 2) st.italic = !st.italic;
      i += n - 1;
      continue;
    }
    buf += c;
  }
  flush();
  return out;
}

/** Runs broken into lines no wider than `width`, word by word. */
function wrap(runs: Run[], size: number, width: number): Run[][] {
  const words: (Run & { space: boolean })[] = [];
  for (const r of runs) {
    const bits = r.text.split(/(\s+)/);
    for (const b of bits) {
      if (!b) continue;
      if (/^\s+$/.test(b)) {
        if (words.length) words[words.length - 1]!.space = true;
      } else words.push({ ...r, text: b, space: false });
    }
  }
  const lines: Run[][] = [];
  let cur: Run[] = [];
  let w = 0;
  const space = textWidth(" ", size);
  for (const word of words) {
    const ww = textWidth(word.text, size);
    if (cur.length && w + ww > width) {
      lines.push(cur);
      cur = [];
      w = 0;
    }
    const { space: sp, ...style } = word;
    const last = cur[cur.length - 1];
    if (last && sameStyle(last, style)) last.text += word.text;
    else cur.push({ ...style });
    w += ww;
    if (sp) {
      cur[cur.length - 1]!.text += " ";
      w += space;
    }
  }
  if (cur.length) lines.push(cur);
  return lines.length ? lines : [[]];
}

/** Text prims for one line of runs, starting at x on a baseline. Struck runs get a line through them. */
function runPrims(line: Run[], x: number, baseline: number, size: number): Prim[] {
  const out: Prim[] = [];
  for (const r of line) {
    const t = r.text.replace(/\s+$/, "");
    if (t) {
      const p = txt(x, baseline, t, size, r.bold);
      out.push(r.italic && p.t === "text" ? { ...p, italic: true } : p);
      if (r.strike) out.push(hline(x, x + textWidth(t, size), baseline - size * CAP_HEIGHT * 0.45));
    }
    x += textWidth(r.text, size);
  }
  return out;
}

const isTableRow = (s: string) => /^\s*\|.*\|\s*$/.test(s);
const cellsOf = (s: string) =>
  s
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
const isDivider = (cells: string[]) => cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
const plainWidth = (s: string, size: number) => runsOf(s).reduce((a, r) => a + textWidth(r.text, size), 0);

/**
 * Formatted notes, top-left at (0, 0), in Markdown (v0.2.1 note 8): all of
 * its basic syntax and some extended. Headings `#` (Title), `##` (Heading),
 * `###` and below (Note, bold); bold, italic, struck and code spans; links
 * and images as their text; `>` quotes; `-`, `*` or `+` bullets, `1.`
 * numbered lists and `- [ ]` / `- [x]` task lists (two spaces indent a
 * level); fenced code blocks; `|` tables (a `|---|` line under the first row
 * makes it a heading row); `---` rules. Each line of the source is a line
 * on the drawing; long lines wrap to `width`. `size` is the body text size.
 */
export function notesLayout(md: string, size: number, width: number): { prims: Prim[]; w: number; h: number } {
  const prims: Prim[] = [];
  const lh = size * 1.45;
  const base = size * (0.5 + CAP_HEIGHT / 2) + size * 0.25;
  let y = 0;
  let maxW = width;
  const lines = md.replace(/\r/g, "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const line = raw.trimEnd();
    if (!line.trim()) {
      y += lh * 0.5;
      continue;
    }
    // Fenced code: its lines as written, in a thin box.
    if (/^\s*(```|~~~)/.test(line)) {
      const fence = line.trim().slice(0, 3);
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trim().startsWith(fence)) code.push(lines[i++]!.replace(/\t/g, "  "));
      const pad = size * 0.5;
      const top = y + size * 0.2;
      const w = Math.min(width, Math.max(size * 4, ...code.map((c) => textWidth(c, size) + pad * 2)));
      code.forEach((c, k) => {
        if (c.trim()) prims.push(txt(pad, top + pad + k * lh + base - size * 0.25, c, size));
      });
      const h = code.length * lh + pad * 2;
      prims.push({ t: "line", pts: [[0, top], [w, top], [w, top + h], [0, top + h], [0, top]], w: THIN });
      y = top + h + size * 0.4;
      continue;
    }
    // Table: this row and the ones after it.
    if (isTableRow(line)) {
      const rows: string[][] = [];
      let header = 0;
      while (i < lines.length && isTableRow(lines[i]!)) {
        const cells = cellsOf(lines[i]!);
        if (isDivider(cells)) header = rows.length;
        else rows.push(cells);
        i++;
      }
      i--;
      const cols = Math.max(...rows.map((r) => r.length));
      const pad = size * 0.5;
      const colW = Array.from({ length: cols }, (_, c) => Math.max(size * 2, ...rows.map((r) => plainWidth(r[c] ?? "", size) + pad * 2)));
      const rowH = size * 1.7;
      const total = colW.reduce((a, b) => a + b, 0);
      maxW = Math.max(maxW, total);
      const top = y + size * 0.2;
      rows.forEach((r, ri) => {
        const ry = top + ri * rowH;
        let x = 0;
        r.forEach((cell, ci) => {
          const bold = ri < header;
          prims.push(...runPrims(runsOf(cell, bold), x + pad, ry + rowH / 2 + (size * CAP_HEIGHT) / 2, size));
          x += colW[ci]!;
        });
        prims.push(hline(0, total, ry, ri === 0 || ri === header ? RULE : THIN));
      });
      const bottom = top + rows.length * rowH;
      prims.push(hline(0, total, bottom, RULE));
      let x = 0;
      prims.push(vline(0, top, bottom, RULE));
      for (const cw of colW) {
        x += cw;
        prims.push(vline(x, top, bottom, x >= total - 0.01 ? RULE : THIN));
      }
      y = bottom + size * 0.6;
      continue;
    }
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      prims.push(hline(0, width, y + lh * 0.45, RULE));
      y += lh;
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const k = h[1]!.length;
      // # Title (5 mm), ## Heading (3.5 mm), ### and below the body size in bold, with body text at Note (2.5 mm).
      const s = size * (k === 1 ? 2 : k === 2 ? 1.4 : 1);
      if (y > 0) y += s * 0.3;
      for (const l of wrap(runsOf(h[2]!.replace(/\s+#+\s*$/, ""), true), s, width)) {
        prims.push(...runPrims(l, 0, y + s * (0.5 + CAP_HEIGHT / 2) + s * 0.25, s));
        y += s * 1.45;
      }
      continue;
    }
    // A quote: indented, with a rule down its left side.
    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      const ind = size * 1.2;
      const top = y;
      for (const l of wrap(runsOf(quote[1]!), size, Math.max(size * 4, width - ind))) {
        prims.push(...runPrims(l, ind, y + base, size));
        y += lh;
      }
      prims.push(vline(size * 0.35, top + size * 0.15, y - size * 0.15, RULE));
      continue;
    }
    const indent = Math.floor((raw.length - raw.trimStart().length) / 2) * size * 1.3;
    const task = /^\s*[-*+]\s+\[( |x|X)\]\s+(.*)$/.exec(raw);
    const bullet = task ? null : /^\s*[-*+]\s+(.*)$/.exec(raw);
    const numbered = /^\s*(\d+|[a-z])[.)]\s+(.*)$/i.exec(raw);
    if (task || bullet || numbered) {
      const hang = indent + size * (numbered ? 1.8 : task ? 1.6 : 1.3);
      const body = task ? task[2]! : bullet ? bullet[1]! : numbered![2]!;
      const wrapped = wrap(runsOf(body), size, Math.max(size * 4, width - hang));
      const mid = y + base - size * CAP_HEIGHT * 0.45;
      if (task) {
        // A box, crossed when it's done.
        const b = size * 0.7;
        const x0 = indent + size * 0.15;
        prims.push({ t: "line", pts: [[x0, mid - b / 2], [x0 + b, mid - b / 2], [x0 + b, mid + b / 2], [x0, mid + b / 2], [x0, mid - b / 2]], w: THIN });
        if (task[1] !== " ") prims.push({ t: "line", pts: [[x0 + b * 0.2, mid], [x0 + b * 0.42, mid + b * 0.28], [x0 + b * 0.85, mid - b * 0.32]], w: RULE });
      } else if (bullet) prims.push({ t: "circle", c: [indent + size * 0.45, mid], r: size * 0.13, fill: true });
      else prims.push(txt(indent, y + base, `${numbered![1]}.`, size));
      for (const l of wrapped) {
        prims.push(...runPrims(l, hang, y + base, size));
        y += lh;
      }
      continue;
    }
    for (const l of wrap(runsOf(line.trim()), size, Math.max(size * 4, width - indent))) {
      prims.push(...runPrims(l, indent, y + base, size));
      y += lh;
    }
  }
  return { prims, w: maxW, h: Math.max(y, lh) };
}

// ---------------------------------------------------------------------------
// Revision list

/** Column widths, in multiples of the text size, so the table keeps its shape at any size. */
export const REV_COLUMNS = [
  { key: "rev", title: "REV", w: 3.5 },
  { key: "date", title: "DATE", w: 7 },
  { key: "description", title: "DESCRIPTION", w: 32 },
  { key: "drawnBy", title: "BY", w: 7 },
] as const;

/** The project's revisions as table rows, oldest first. */
export function revisionRows(project: Project): string[][] {
  return project.revisions.map((r) => [r.rev, r.date, r.description, r.drawnBy]);
}

/** A revision list: heading row and one row per revision, with blank rows to make up `min` rows. */
export function revisionTable(rows: string[][], min: number, size: number): { prims: Prim[]; w: number; h: number } {
  const rowH = size * 1.8;
  const cols = REV_COLUMNS.map((c) => ({ ...c, w: c.w * size }));
  const total = cols.reduce((a, c) => a + c.w, 0);
  const all = [...rows];
  while (all.length < min) all.push(["", "", "", ""]);
  const prims: Prim[] = [];
  const n = all.length + 1;
  const mid = (r: number) => r * rowH + rowH / 2 + (size * CAP_HEIGHT) / 2;
  let x = 0;
  cols.forEach((c, ci) => {
    prims.push(txt(x + size * 0.5, mid(0), c.title, size, true));
    all.forEach((r, ri) => {
      let s = r[ci] ?? "";
      // Long descriptions are cut to the column.
      while (s && textWidth(s, size) > c.w - size) s = s.slice(0, -2) + "…";
      if (s) prims.push(txt(x + size * 0.5, mid(ri + 1), s, size));
    });
    x += c.w;
    prims.push(vline(x, 0, n * rowH, ci === REV_COLUMNS.length - 1 ? RULE : THIN));
  });
  prims.push(vline(0, 0, n * rowH, RULE));
  for (let r = 0; r <= n; r++) prims.push(hline(0, total, r * rowH, r === 0 || r === 1 || r === n ? RULE : THIN));
  return { prims, w: total, h: n * rowH };
}

// ---------------------------------------------------------------------------
// Symbol legend

/** The params that make a part look different (and mean something different). */
const VARIANT_KEYS = ["function", "type", "system", "operator", "kind", "contact", "mode", "style"];

export interface LegendEntry {
  name: string;
  /** A stand-in element to draw: one of the project's own, without its tag or label. */
  el: Element;
}

function variantName(el: Element): string {
  const def = getSymbol(el.symbol);
  if (!def) return el.symbol;
  for (const key of VARIANT_KEYS) {
    const p = def.params.find((x) => x.key === key);
    if (!p || p.type !== "select") continue;
    const v = el.params[key] ?? p.default;
    const opt = p.options?.find((o) => o.value === v);
    if (!opt || /^(none|default|plain)$/i.test(String(opt.value))) continue;
    const variant = opt.label.split(/[(,]/)[0]!.trim();
    // "Isolator / MCB / contactor: Circuit breaker" reads better as just "Circuit breaker".
    if (["isolator", "coil", "earth"].includes(el.symbol)) {
      const n = /coil/i.test(def.name) && !/coil/i.test(variant) ? `${variant} coil` : variant;
      return n.charAt(0).toUpperCase() + n.slice(1);
    }
    return `${def.name}: ${variant}`;
  }
  return def.name;
}

/** One of each kind of part used on the drawing (not annotations, junctions or plant views), by name. */
export function legendEntries(project: Project): LegendEntry[] {
  const order = new Map(listSymbols().map((d, i) => [d.id, i]));
  const seen = new Map<string, LegendEntry>();
  for (const page of project.pages) {
    if (page.ga) continue;
    for (const el of page.elements) {
      const def = getSymbol(el.symbol);
      if (!def || def.bench === "annotate" || el.symbol === "junction" || el.symbol === "plant-view") continue;
      const name = variantName(el);
      if (seen.has(name)) continue;
      const params = { ...el.params };
      delete params.xrefDx;
      delete params.xrefDy;
      delete params.onBlock;
      // Rails and busbars are drawn short: the line is the symbol.
      if (el.symbol === "busbar") {
        params.length = 10;
        delete params.name;
        delete params.dist;
      }
      seen.set(name, { name, el: { ...el, tag: "", label: "", rot: 0, links: [], params } });
    }
  }
  // In the palette's order (contacts, operators, coils, protection…), as an engineer reads them.
  return [...seen.values()].sort((a, b) => (order.get(a.el.symbol) ?? 999) - (order.get(b.el.symbol) ?? 999) || a.name.localeCompare(b.name));
}

/** The legend: name on the left, the symbol on the right, in `cols` columns. */
export function legendTable(entries: LegendEntry[], cols: number, size: number): { prims: Prim[]; w: number; h: number } {
  const prims: Prim[] = [];
  const nameW = Math.max(size * 8, ...entries.map((e) => textWidth(e.name.toUpperCase(), size))) + size;
  const drawn = entries.map((e) => {
    const g = localGeometry(e.el, { tag: "", xref: "", label: "" });
    // Just the symbol and its terminal numbers: no tag, label or cross-reference text.
    const ps = g.prims.filter((p) => p.t !== "text" || p.role === "term");
    return { e, g, ps };
  });
  const symW = Math.max(6, ...drawn.map((d) => d.g.bbox.w)) + 2;
  const colW = nameW + symW + 4;
  const perCol = Math.ceil(drawn.length / Math.max(1, cols));
  let maxH = 0;
  for (let c = 0; c < cols; c++) {
    let y = 0;
    for (const d of drawn.slice(c * perCol, (c + 1) * perCol)) {
      const h = Math.max(size * 1.6, d.g.bbox.h) + size * 0.7;
      const x0 = c * colW;
      const cy = y + h / 2;
      prims.push(txt(x0 + nameW, cy + (size * CAP_HEIGHT) / 2, d.e.name.toUpperCase(), size, false, "end"));
      const sx = x0 + nameW + size + 1 - d.g.bbox.x;
      const sy = cy - (d.g.bbox.y + d.g.bbox.h / 2);
      for (const p of d.ps) prims.push(movePrim(p, sx, sy));
      y += h;
    }
    maxH = Math.max(maxH, y);
  }
  return { prims, w: cols * colW - 4, h: maxH };
}
