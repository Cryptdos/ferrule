<script lang="ts">
  import { placeModulesOnGa } from "../../core/controllers";
  import { untrack } from "svelte";
  import Atlas from "./Atlas.svelte";
  import {
    AREA_MM,
    AREA_UNITS,
    SHEET_MM,
    UNIT_MM,
    type Vec,
    pointInRect,
    rectsIntersect,
    offsetRect,
    snapVec,
    clampToArea,
  } from "../../core/geometry";
  import {
    addElement,
    flipElements,
    addSection,
    addCloud,
    moveElements,
    placePlantView,
    setBoundary,
    setManualRoute,
    updateCloud,
    cloudsOn,
    addAsset,
    addImage,
    addGaItem,
    addGaDim,
    moveGaItems,
    updateGaItem,
    updateElement,
    updateSection,
    setPartPoints,
    wire,
    linkArrows,
    linkToNewArrow,
    type WireEnd,
  } from "../../core/ops";
  import { settings } from "../settings.svelte";
  import { benchOf, localGeometry, defaultParams, formatPoints, partPoints, plantViewLayout, type Geometry } from "../../core/symbols";
  import { isInputForm, parsePointRef, pointRef } from "../../core/points";
  import {
    GA_ORIGIN,
    dimLayout,
    dimTargets,
    drawnGaItems,
    gaFrame,
    gaSize,
    mmToUnits,
    nearestDimTarget,
    sheetTakes,
    sheetToGa,
    snapToRail,
    type DimTarget,
  } from "../../core/ga";
  import type { GaDimPoint, GaItem } from "../../core/model";
  import { cloudPath } from "../../core/titleblock";
  import { readImage } from "../images";
  import { elementTexts } from "../../core/tags";
  import { routePage } from "../../core/routing";
  import { stampTemplate } from "../../core/templates";
  import { distanceToRoute, dragLeg, nearestPointOnRoute, routeOf, simpleRoute, simplifyRoute } from "../../core/wires";
  import type { Element, Page, Segment } from "../../core/model";
  import type { Editor } from "../editor.svelte";
  import { getAvoid } from "../avoid";
  import { isTyping } from "../typing";
  import type { Simulator } from "../sim.svelte";
  import { contactRows, contactTableAt, contactTableRect, contactTableRowAt, isMaster, linkedTarget } from "../../core/xref";
  import Sheet from "./Sheet.svelte";
  import ElementView from "./ElementView.svelte";

  let {
    editor,
    sim = null,
    insetLeft = 0,
    atlas = false,
  }: {
    editor: Editor;
    sim?: Simulator | null;
    /** Width (px) covered by the floating browser on the left: Fit centres the sheet in the rest. */
    insetLeft?: number;
    /** Show the sheet overview in the top-right corner. */
    atlas?: boolean;
  } = $props();

  let svg: SVGSVGElement | undefined = $state();
  let box = $state({ w: 1200, h: 800 });

  // View box in sheet millimetres.
  let view = $state({ x: -5, y: -5, w: SHEET_MM.w + 10 });
  const viewH = $derived(view.w * (box.h / Math.max(1, box.w)));

  type Gesture =
    | { kind: "pan"; client: Vec; start: { x: number; y: number } }
    | { kind: "drag"; start: Vec; delta: Vec; ids: string[] }
    | { kind: "leg"; seg: string; leg: number; start: Vec; original: Vec[]; points: Vec[] }
    | { kind: "band"; start: Vec; cur: Vec; add: boolean }
    | { kind: "secnew"; start: Vec; cur: Vec; cloud?: boolean }
    | { kind: "secmove"; id: string; start: Vec; rect: Rect4; delta: Vec }
    | { kind: "secsize"; id: string; start: Vec; rect: Rect4; delta: Vec; edges: string }
    | { kind: "cloudmove"; id: string; start: Vec; rect: Rect4; delta: Vec }
    | { kind: "elsize"; id: string; start: Vec; size: Vec; delta: Vec; keepShape: boolean }
    | { kind: "point"; id: string; index: number; start: Vec; points: Vec[]; delta: Vec }
    | { kind: "gadrag"; ids: string[]; start: Vec; delta: Vec }
    | { kind: "gasize"; id: string; start: Vec; size: Vec; delta: Vec }
    | { kind: "ganew"; what: "rail" | "trunking"; start: Vec; cur: Vec }
    | { kind: "cloudsize"; id: string; start: Vec; rect: Rect4; delta: Vec; edges: string }
    | { kind: "table"; coil: string; start: Vec; at: Vec; delta: Vec; row: number }
    | { kind: "boundary"; y: number }
    | null;
  type Rect4 = [number, number, number, number];
  let gesture = $state<Gesture>(null);
  let pointer: Vec | null = $state(null);
  let spaceDown = $state(false);
  /** A tap of Space (down and up, no panning in between) fits the sheet. */
  let spaceAt = 0;
  let spacePanned = false;

  /** A polygon being drawn: its corners so far (sheet units). */
  let polyDraft: Vec[] = $state([]);

  /** A wire being drawn: where it starts. */
  type Pending = { end: WireEnd; at: Vec };
  let pending: Pending | null = $state(null);

  const page = $derived(editor.page);
  /** What can be picked: drafting (parts, wires, rails…) or annotation (text, boxes, sections, clouds…). */
  const bench = $derived(editor.mode === "annotate" ? "annotate" : "draft");
  const clouds = $derived(cloudsOn(editor.project, page.id));
  const geoms = $derived(
    new Map<string, Geometry>(page.elements.map((e) => [e.id, localGeometry(e, elementTexts(e, editor.project))])),
  );
  const selected = $derived(new Set(editor.selection));

  $effect(() => {
    // Drop a half-drawn wire when the tool or page changes.
    void editor.tool;
    void editor.pageId;
    pending = null;
    polyDraft = [];
    dimDraft = [];
  });

  export function fit(): void {
    // Fit the sheet into the part of the canvas not covered by the browser.
    const inset = insetLeft < box.w * 0.5 ? insetLeft : 0;
    const aw = Math.max(1, box.w - inset);
    const bh = Math.max(1, box.h);
    const mmPerPx = Math.max((SHEET_MM.w + 10) / aw, (SHEET_MM.h + 10) / bh);
    view = { x: SHEET_MM.w / 2 - (inset + aw / 2) * mmPerPx, y: SHEET_MM.h / 2 - (bh / 2) * mmPerPx, w: box.w * mmPerPx };
  }

  /** Cancel a wire in progress or a drag. Returns true if there was one. */
  export function cancel(): boolean {
    if (pending || gesture || polyDraft.length || dimDraft.length) {
      pending = null;
      gesture = null;
      polyDraft = [];
      dimDraft = [];
      return true;
    }
    return false;
  }

  $effect(() => {
    if (!svg) return;
    const ro = new ResizeObserver(([entry]) => {
      const first = box.w === 1200 && box.h === 800;
      box = { w: entry!.contentRect.width, h: entry!.contentRect.height };
      if (first) fit();
    });
    ro.observe(svg);
    return () => ro.disconnect();
  });

  function toMm(e: { clientX: number; clientY: number }): Vec {
    const ctm = svg!.getScreenCTM()!.inverse();
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm);
    return [p.x, p.y];
  }
  function toUnits(e: { clientX: number; clientY: number }): Vec {
    const [x, y] = toMm(e);
    return [(x - AREA_MM.x) / UNIT_MM, (y - AREA_MM.y) / UNIT_MM];
  }

  // -------------------------------------------------------------------------
  // Hit testing

  function hitElement(pt: Vec): Element | null {
    // A terminal strip line runs over its terminals: they're picked first, the line only where it's clear of them.
    return hitElementIn(pt, false) ?? hitElementIn(pt, true);
  }

  function hitElementIn(pt: Vec, stripLines: boolean): Element | null {
    const els = page.elements;
    for (let i = els.length - 1; i >= 0; i--) {
      const el = els[i]!;
      if (el.symbol === "junction" || benchOf(el) !== bench || (el.symbol === "strip-line") !== stripLines) continue;
      const g = geoms.get(el.id);
      if (!g) continue;
      const local: Vec = [pt[0] - el.pos[0], pt[1] - el.pos[1]];
      const corners = partPoints(el);
      if (corners) {
        // Arrows and polygons are picked by their lines, so what's inside a polygon can still be picked.
        const ring = el.symbol === "polygon" ? [...corners, corners[0]!] : corners;
        if (distanceToRoute(pt, ring).dist < 0.7) return el;
        continue;
      }
      if (el.symbol === "box") {
        // A box is picked by its outline (or its label), so what's inside it can still be picked.
        const b = g.body;
        const inside = pointInRect(local, b, 0.6);
        const deep = pointInRect(local, { x: b.x + 0.6, y: b.y + 0.6, w: b.w - 1.2, h: b.h - 1.2 }, 0);
        const onLabel = !!el.label && local[0] < Math.min(b.w, 20) && local[1] < 2.4;
        if ((inside && !deep) || (deep && onLabel)) return el;
        continue;
      }
      if (pointInRect(local, g.bbox, 0.5)) return el;
    }
    return null;
  }

  /** The one selected element that can be sized by dragging its corner, if any. */
  function resizable(): { el: Element; size: Vec; corner: Vec } | null {
    if (sim || editor.selection.length !== 1) return null;
    const el = page.elements.find((e) => e.id === editor.selection[0]);
    if (!el || !["image", "box", "highlight"].includes(el.symbol) || el.rot !== 0) return null;
    const size: Vec = [Number(el.params.w) || 20, Number(el.params.h) || 10];
    return { el, size, corner: [el.pos[0] + size[0], el.pos[1] + size[1]] };
  }

  /** The one selected arrow or polygon, with its corners: each has a handle to drag. */
  function pointed(): { el: Element; points: Vec[] } | null {
    if (sim || bench !== "annotate" || editor.selection.length !== 1) return null;
    const el = page.elements.find((e) => e.id === editor.selection[0]);
    const points = el ? partPoints(el) : null;
    return el && points ? { el, points } : null;
  }
  function hitPoint(pt: Vec): { el: Element; index: number; points: Vec[] } | null {
    const p = pointed();
    if (!p) return null;
    const i = p.points.findIndex((q) => Math.abs(q[0] - pt[0]) < 0.9 && Math.abs(q[1] - pt[1]) < 0.9);
    return i < 0 ? null : { el: p.el, index: i, points: p.points };
  }

  /** Finish the polygon being drawn (three corners at least). */
  function finishPolygon(): void {
    const pts = polyDraft;
    polyDraft = [];
    if (pts.length < 3) {
      if (pts.length) editor.flash("A polygon needs at least three corners");
      return;
    }
    let id = "";
    const ok = editor.apply((p) => {
      const o = pts[0]!;
      id = addElement(p, editor.pageId, "polygon", o, { params: { pts: formatPoints(pts.slice(1).map((q) => [q[0] - o[0], q[1] - o[1]])) } }).id;
    });
    if (ok) editor.selection = [id];
    if (!settings.keepPlacing) editor.tool = "select";
  }

  /** A revision cloud's edge (resize that side) or its revision triangle (move it). Annotate only. */
  function hitCloud(pt: Vec): { id: string; part: "move" | "size"; edges: string } | null {
    if (bench !== "annotate") return null;
    const near = 0.9;
    for (const c of clouds) {
      const [x, y, w, h] = c.rect;
      if (pt[0] > x + w - 2.4 && pt[0] < x + w + 2.6 && pt[1] > y - 3.4 && pt[1] < y) return { id: c.id, part: "move", edges: "" };
      const inX = pt[0] > x - near && pt[0] < x + w + near;
      const inY = pt[1] > y - near && pt[1] < y + h + near;
      let edges = "";
      if (inX && Math.abs(pt[1] - y) < near) edges += "n";
      if (inX && Math.abs(pt[1] - (y + h)) < near) edges += "s";
      if (inY && Math.abs(pt[0] - x) < near) edges += "w";
      if (inY && Math.abs(pt[0] - (x + w)) < near) edges += "e";
      if (edges) return { id: c.id, part: "size", edges };
    }
    return null;
  }

  function hitWire(pt: Vec, tolerance = 0.6): { seg: Segment; leg: number } | null {
    if (bench !== "draft") return null;
    let best: { seg: Segment; leg: number; dist: number } | null = null;
    for (const seg of page.segments) {
      const { dist, leg } = distanceToRoute(pt, routeOf(page, seg));
      if (dist < tolerance && (!best || dist < best.dist)) best = { seg, leg, dist };
    }
    return best;
  }

  /**
   * What part of a section box is under the pointer: its label (move it),
   * an edge or a corner (resize that side). Edges are named n/s/e/w.
   */
  function hitSection(pt: Vec): { id: string; part: "move" | "size"; edges: string } | null {
    if (bench !== "annotate") return null;
    const near = 0.6;
    for (let i = page.sections.length - 1; i >= 0; i--) {
      const sec = page.sections[i]!;
      const [x, y, w, h] = sec.rect;
      const inX = pt[0] > x - near && pt[0] < x + w + near;
      const inY = pt[1] > y - near && pt[1] < y + h + near;
      const onLabel = pt[0] > x && pt[0] < x + Math.min(w, 24) && pt[1] > y + near && pt[1] < y + 2.6;
      if (onLabel) return { id: sec.id, part: "move", edges: "" };
      let edges = "";
      if (inX && Math.abs(pt[1] - y) < near) edges += "n";
      if (inX && Math.abs(pt[1] - (y + h)) < near) edges += "s";
      if (inY && Math.abs(pt[0] - x) < near) edges += "w";
      if (inY && Math.abs(pt[0] - (x + w)) < near) edges += "e";
      if (edges) return { id: sec.id, part: "size", edges };
    }
    return null;
  }

  /** A coil's contact table under the pointer: drag it to move it, click a row to go to that contact. */
  function hitTable(pt: Vec): { coil: Element; at: Vec; row: number } | null {
    if (bench !== "draft") return null;
    for (let i = page.elements.length - 1; i >= 0; i--) {
      const el = page.elements[i]!;
      if (!isMaster(el)) continue;
      const g = geoms.get(el.id);
      const rows = contactRows(editor.project, el).length;
      if (!g || !rows) continue;
      const at = contactTableAt(el, g.body, rows);
      const r = contactTableRect(rows, at);
      const local: Vec = [pt[0] - el.pos[0], pt[1] - el.pos[1]];
      if (pointInRect(local, r, 0.2)) return { coil: el, at, row: contactTableRowAt(rows, [local[0] - at[0], local[1] - at[1]]) };
    }
    return null;
  }

  /** The nearest terminal within reach, for wiring. Rails snap to the nearest tap. */
  function hitTerminal(pt: Vec, reach = 1.2): { ref: [string, string]; at: Vec } | null {
    let best: { ref: [string, string]; at: Vec; d: number } | null = null;
    for (const el of page.elements) {
      const g = geoms.get(el.id);
      if (!g) continue;
      for (const t of g.terminals) {
        const at: Vec = [el.pos[0] + t.at[0], el.pos[1] + t.at[1]];
        const d = Math.hypot(at[0] - pt[0], at[1] - pt[1]);
        if (d < reach && (!best || d < best.d)) best = { ref: [el.id, t.name], at, d };
      }
    }
    return best;
  }

  /** What the wire tool would connect to at this point. */
  function wireTarget(pt: Vec): Pending | null {
    const t = hitTerminal(pt);
    if (t) return { end: { terminal: t.ref }, at: t.at };
    const w = hitWire(pt, 0.8);
    if (w) {
      const at = nearestPointOnRoute(pt, routeOf(page, w.seg));
      if (at) return { end: { wire: w.seg.id, at }, at };
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // GA sheets: items in real mm

  const ga = $derived(page.ga ?? null);
  /** What part of the panel this sheet shows (a door leaf, or all of it), in its own mm. */
  const frame = $derived(page.ga ? gaFrame(editor.project, page) : null);
  /** Snap a real-mm distance: 5 mm, or 1 mm with Shift held. */
  const snapMm = (v: number, fine = false) => Math.round(v / (fine ? 1 : 5)) * (fine ? 1 : 5);
  const gaRect = (it: Pick<GaItem, "x" | "y" | "w" | "h"> & { kind?: GaItem["kind"]; dim?: GaItem["dim"]; id?: string }) => {
    if (!frame) return null;
    if (it.kind === "dim" && it.dim) return dimLayout(editor.project, page, it as GaItem).box;
    return { x: GA_ORIGIN[0] + mmToUnits(frame, it.x - frame.x0), y: GA_ORIGIN[1] + mmToUnits(frame, it.y), w: mmToUnits(frame, it.w), h: mmToUnits(frame, it.h) };
  };

  function hitGa(pt: Vec): GaItem | null {
    // This sheet's own items only: a door's devices drawn from another sheet are edited there.
    const items = page.gaItems ?? [];
    // Dimensions, then devices and label plates, over rails and trunking.
    const order = [
      ...items.filter((i) => i.kind === "dim"),
      ...items.filter((i) => i.kind === "device" || i.kind === "label"),
      ...items.filter((i) => i.kind === "rail" || i.kind === "trunking"),
    ];
    for (const it of order) {
      const r = gaRect(it);
      if (r && pointInRect(pt, r, 0.3)) return it;
    }
    return null;
  }

  /** The one selected GA item's corner handle, for sizing rails, trunking, devices and label plates. */
  function gaCorner(): { it: GaItem; at: Vec } | null {
    if (editor.selection.length !== 1) return null;
    const it = (page.gaItems ?? []).find((x) => x.id === editor.selection[0]);
    if (!it || it.kind === "dim") return null;
    const r = gaRect(it);
    return it && r ? { it, at: [r.x + r.w, r.y + r.h] } : null;
  }

  // Dimensions: click each point (it snaps to the enclosure and to items'
  // edges and middles), then double-click or Enter where the line goes.
  type DimClick = { mm: Vec; h: DimTarget | null; v: DimTarget | null };
  let dimDraft: DimClick[] = $state([]);
  let lastDimPress = 0;
  const dimReach = () => (frame ? 1.2 * UNIT_MM * frame.scale : 5);
  function dimSnap(mm: Vec): DimClick {
    const drawn = drawnGaItems(editor.project, page);
    const size = gaSize(editor.project, page);
    return {
      mm,
      h: nearestDimTarget(dimTargets(drawn, size, "h"), mm[0], mm[1], dimReach()),
      v: nearestDimTarget(dimTargets(drawn, size, "v"), mm[1], mm[0], dimReach()),
    };
  }
  /** The dimension being drawn, with its line at `across` (mm). */
  function dimFrom(clicks: DimClick[], across: number | null): GaItem | null {
    if (clicks.length < 2) return null;
    const a = clicks[0]!.mm;
    const b = clicks[1]!.mm;
    const ax = Math.abs((clicks[1]!.h?.v ?? b[0]) - (clicks[0]!.h?.v ?? a[0]));
    const ay = Math.abs((clicks[1]!.v?.v ?? b[1]) - (clicks[0]!.v?.v ?? a[1]));
    const axis: "h" | "v" = ax >= ay ? "h" : "v";
    const points: GaDimPoint[] = clicks.map((c) => {
      const t = c[axis];
      return t ? { v: t.v, item: t.item, edge: t.edge } : { v: Math.round((axis === "h" ? c.mm[0] : c.mm[1]) * 2) / 2 };
    });
    const at = across ?? (axis === "h" ? Math.min(...clicks.map((c) => c.mm[1])) - 20 : Math.min(...clicks.map((c) => c.mm[0])) - 20);
    return { id: "dim-draft", kind: "dim", x: 0, y: 0, w: 1, h: 1, dim: { axis, style: editor.gaDimStyle, points, at: Math.round(at * 2) / 2 } };
  }
  function finishDim(across: number | null): void {
    const it = dimFrom(dimDraft, across);
    dimDraft = [];
    if (!it) {
      editor.flash("A dimension needs two points: click them, then double-click where its line goes");
      return;
    }
    let id = "";
    const ok = editor.apply((p) => (id = addGaDim(p, editor.pageId, it.dim!).id));
    if (ok) editor.selection = [id];
  }
  const dimPreview = $derived.by(() => {
    if (!dimDraft.length || !pointer || !frame) return null;
    const mm = sheetToGa(frame, pointer);
    const clicks = [...dimDraft, dimSnap(mm)];
    const it = dimFrom(dimDraft.length >= 2 ? dimDraft : clicks, null);
    if (!it) return { layout: null, snap: clicks[clicks.length - 1]! };
    if (dimDraft.length >= 2) it.dim!.at = Math.round((it.dim!.axis === "h" ? mm[1] : mm[0]) * 2) / 2;
    return { layout: dimLayout(editor.project, page, it), snap: clicks[clicks.length - 1]! };
  });

  function gaPointerDown(pt: Vec, e: PointerEvent): void {
    if (!frame) return;
    const mm = sheetToGa(frame, pt);
    const fine = e.shiftKey;
    if (editor.gaPlace) {
      const pl = editor.gaPlace;
      // A controller: its modules side by side, in rail order.
      if (pl.modules?.length) {
        const at: [number, number] = [snapMm(mm[0] - pl.w / 2, fine), snapMm(mm[1] - pl.h / 2, fine)];
        let ids: string[] = [];
        const ids0 = pl.modules.map((m) => m.id);
        const ok = editor.apply((p) => {
          ids = placeModulesOnGa(p, editor.pageId, ids0, at).map((g) => g.id);
        });
        editor.gaPlace = null;
        if (ok) editor.selection = ids;
        return;
      }
      let at: Vec = [snapMm(mm[0] - pl.w / 2, fine), snapMm(mm[1] - pl.h / 2, fine)];
      const railY = snapToRail(page, { x: at[0], y: at[1], w: pl.w, h: pl.h });
      if (railY !== null) at = [at[0], railY];
      let id = "";
      const ok = editor.apply((p) => {
        id = addGaItem(p, editor.pageId, { kind: "device", x: at[0], y: at[1], w: pl.w, h: pl.h, refs: pl.refs, ...(pl.part ? { part: pl.part } : {}) }).id;
      });
      editor.gaPlace = null;
      if (ok) editor.selection = [id];
      return;
    }
    if (editor.tool === "ga-rail" || editor.tool === "ga-trunking") {
      const what = editor.tool === "ga-rail" ? "rail" : "trunking";
      if (!sheetTakes(editor.project, page, what)) {
        editor.flash(page.ga?.view === "door-front" ? "DIN rail and trunking go on the backplate or the door back" : "Nothing but dimensions goes on this sheet");
        return;
      }
      const s: Vec = [snapMm(mm[0], fine), snapMm(mm[1], fine)];
      gesture = { kind: "ganew", what, start: s, cur: s };
      return;
    }
    if (editor.tool === "ga-label") {
      if (!sheetTakes(editor.project, page, "label")) {
        editor.flash("Label plates go on a door front");
        return;
      }
      let id = "";
      const w = 60;
      const h = 15;
      const ok = editor.apply((p) => {
        id = addGaItem(p, editor.pageId, { kind: "label", x: snapMm(mm[0] - w / 2, fine), y: snapMm(mm[1] - h / 2, fine), w, h }).id;
      });
      if (ok) {
        editor.selection = [id];
        editor.tool = "select";
      }
      return;
    }
    if (editor.tool === "ga-dim") {
      const last = dimDraft[dimDraft.length - 1];
      const near = !!last && Math.hypot(last.mm[0] - mm[0], last.mm[1] - mm[1]) < dimReach() * 0.5;
      // pointerdown carries no click count: a second press soon after, in the same place, is a double-click.
      const now = performance.now();
      const double = near && now - lastDimPress < 450;
      lastDimPress = now;
      if (double) {
        // A double-click puts the line here: its first click wasn't a point.
        const clicks = near ? dimDraft.slice(0, -1) : dimDraft;
        const it = dimFrom(clicks, null);
        dimDraft = clicks;
        finishDim(it ? (it.dim!.axis === "h" ? mm[1] : mm[0]) : null);
        return;
      }
      if (!near) dimDraft = [...dimDraft, dimSnap(mm)];
      return;
    }
    const corner = gaCorner();
    if (corner && Math.abs(pt[0] - corner.at[0]) < 0.9 && Math.abs(pt[1] - corner.at[1]) < 0.9) {
      gesture = { kind: "gasize", id: corner.it.id, start: mm, size: [corner.it.w, corner.it.h], delta: [0, 0] };
      return;
    }
    const hit = hitGa(pt);
    if (hit) {
      if (e.shiftKey || e.ctrlKey) {
        editor.selection = selected.has(hit.id) ? editor.selection.filter((x) => x !== hit.id) : [...editor.selection, hit.id];
        return;
      }
      if (!selected.has(hit.id)) editor.selection = [hit.id];
      gesture = { kind: "gadrag", ids: [...editor.selection], start: mm, delta: [0, 0] };
      return;
    }
    // Annotations on a GA sheet are picked in Annotate; here, empty space pans.
    editor.selection = [];
    gesture = { kind: "pan", client: [e.clientX, e.clientY], start: { x: view.x, y: view.y } };
  }

  const gaPreview = $derived.by((): Map<string, GaItem> | null => {
    const g = gesture as Gesture;
    if (!g) return null;
    const items = page.gaItems ?? [];
    if (g.kind === "gadrag" && (g.delta[0] || g.delta[1])) {
      const moved = items.filter((i) => g.ids.includes(i.id)).map((i) => {
        // A dimension's line moves across its axis; its points stay on what they measure.
        if (i.dim) return { ...i, dim: { ...i.dim, at: i.dim.at + (i.dim.axis === "h" ? g.delta[1] : g.delta[0]) } };
        const n = { ...i, x: i.x + g.delta[0], y: i.y + g.delta[1] };
        // A lone device snaps onto a rail.
        if (g.ids.length === 1 && n.kind === "device") {
          const ry = snapToRail(page, n);
          if (ry !== null) n.y = ry;
        }
        return n;
      });
      return new Map(moved.map((i) => [i.id, i]));
    }
    if (g.kind === "gasize") {
      const it = items.find((i) => i.id === g.id);
      return it ? new Map([[it.id, { ...it, w: Math.max(5, g.size[0] + g.delta[0]), h: Math.max(5, g.size[1] + g.delta[1]) }]]) : null;
    }
    return null;
  });

  const gaNew = $derived.by(() => {
    const g = gesture as Gesture;
    if (g?.kind !== "ganew" || !frame) return null;
    const x = Math.min(g.start[0], g.cur[0]);
    const y = Math.min(g.start[1], g.cur[1]);
    const r = gaRect({ id: "", kind: "rail", x, y, w: Math.abs(g.cur[0] - g.start[0]), h: Math.abs(g.cur[1] - g.start[1]) });
    return r;
  });

  // -------------------------------------------------------------------------
  // Pointer handling

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const [mx, my] = toMm(e);
    const factor = Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
    const w = Math.min(SHEET_MM.w * 4, Math.max(20, view.w * factor));
    const k = w / view.w;
    view = { x: mx - (mx - view.x) * k, y: my - (my - view.y) * k, w };
  }

  function onPointerDown(e: PointerEvent) {
    svg!.setPointerCapture(e.pointerId);
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      if (spaceDown) spacePanned = true;
      gesture = { kind: "pan", client: [e.clientX, e.clientY], start: { x: view.x, y: view.y } };
      return;
    }
    if (e.button === 2) {
      pending = null;
      return;
    }
    if (e.button !== 0) return;
    const pt = toUnits(e);

    if (sim) {
      // Simulate: clicking an input operates it; nothing is edited. A push
      // button is held for as long as the mouse is down (Shift+click latches it).
      // Nothing is selected here, so any click ends a jump's ring.
      if (editor.highlight) {
        editor.highlight = null;
        editor.selection = [];
      }
      const hit = hitElement(pt);
      const input = hit ? simInputAt(hit, pt) : null;
      if (input && sim.isPress(input) && !e.shiftKey) {
        sim.hold(input, true);
        heldButton = input;
      } else if (input && sim.isPress(input)) {
        sim.hold(input, sim.value(input) !== 1);
      } else if (input) {
        sim.operate(input);
      } else gesture = { kind: "pan", client: [e.clientX, e.clientY], start: { x: view.x, y: view.y } };
      return;
    }

    if (editor.mode === "ga") {
      gaPointerDown(pt, e);
      return;
    }
    if (page.ga && editor.mode === "draft") {
      editor.flash("This is a GA sheet: lay it out in the GA workbench.");
      return;
    }

    if (editor.linking) {
      // Linking a link arrow (controller.md §5): click the arrow to pair with, or where the new one goes.
      const { from, mode } = editor.linking;
      if (mode === "new") {
        let id = "";
        if (editor.apply((p) => (id = linkToNewArrow(p, from, editor.pageId, clampToArea(snapVec(pt))).id))) {
          editor.linking = null;
          editor.selection = [id];
        }
        return;
      }
      const hit = hitElement(pt);
      if (hit?.symbol === "offpage" && hit.id !== from) {
        const to = hit.id;
        if (editor.apply((p) => linkArrows(p, from, to))) {
          editor.linking = null;
          editor.selection = [to];
        }
      } else editor.flash("Click the link arrow to link to (Esc cancels)");
      return;
    }

    if (editor.tool === "place" && editor.placeSymbol) {
      const symbol = editor.placeSymbol;
      const params = { ...editor.placeParams };
      let id = "";
      editor.apply((p) => {
        const at = clampToArea(snapVec(pt));
        id =
          symbol === "plant-view"
            ? placePlantView(p, editor.pageId, String(params.plant), at, String(params.show ?? "").split(",").filter(Boolean)).id
            : addElement(p, editor.pageId, symbol, at, { params, rot: editor.placeRot }).id;
        if (editor.placeFlip && symbol !== "plant-view") flipElements(p, editor.pageId, [id]);
      });
      if (id) editor.selection = [id];
      // Place one, then back to Select (note 72), unless the setting says keep placing.
      // A plant view is always placed once.
      if (symbol === "plant-view" || !settings.keepPlacing) {
        editor.tool = "select";
        editor.placeSymbol = null;
        editor.placeParams = {};
      }
      return;
    }

    if (editor.tool === "polygon") {
      // Each click is a corner; click the first corner again (or double-click, or Enter) to close it.
      const at = clampToArea(snapVec(pt));
      const first = polyDraft[0];
      if (first && polyDraft.length >= 3 && Math.hypot(at[0] - first[0], at[1] - first[1]) < 1) finishPolygon();
      else if (!polyDraft.some((q) => q[0] === at[0] && q[1] === at[1])) polyDraft = [...polyDraft, at];
      return;
    }

    if (editor.tool === "section" || editor.tool === "cloud") {
      gesture = { kind: "secnew", start: snapVec(pt), cur: snapVec(pt), cloud: editor.tool === "cloud" };
      return;
    }

    if (editor.tool === "stamp" && editor.stamp) {
      const st = editor.stamp;
      let ids: string[] = [];
      const ok = editor.apply((p) => {
        ids = stampTemplate(p, st.templateId, { pageId: editor.pageId, at: snapVec(pt), plant: st.plant }).elementIds;
      });
      editor.stamp = null;
      editor.tool = "select";
      if (ok) {
        editor.selection = ids;
        editor.flash(`Stamped ${st.name}. Press Renumber to give it tags.`);
      }
      return;
    }

    if (editor.tool === "wire") {
      const target = wireTarget(pt);
      if (!target) {
        pending = null;
        return;
      }
      if (!pending) {
        pending = target;
        return;
      }
      const start = pending;
      let segId = "";
      const ok = editor.apply((p) => {
        segId = wire(p, editor.pageId, start.end, target.end).id;
      });
      pending = null;
      if (ok) editor.selection = [segId];
      return;
    }

    // Select tool. A coil's contact table sits outside the coil, so check it first.
    const table = hitTable(pt);
    if (table) {
      gesture = { kind: "table", coil: table.coil.id, start: pt, at: table.at, delta: [0, 0], row: table.row };
      return;
    }
    // A selected arrow's or polygon's corner handles move that corner.
    const corner = hitPoint(pt);
    if (corner) {
      gesture = { kind: "point", id: corner.el.id, index: corner.index, start: snapVec(pt), points: corner.points, delta: [0, 0] };
      return;
    }
    // The corner handle of a selected picture, box or label plate sizes it.
    const sized = resizable();
    if (sized && Math.abs(pt[0] - sized.corner[0]) < 0.9 && Math.abs(pt[1] - sized.corner[1]) < 0.9) {
      gesture = { kind: "elsize", id: sized.el.id, start: pt, size: sized.size, delta: [0, 0], keepShape: sized.el.symbol === "image" };
      return;
    }
    const cloudHit = hitCloud(pt);
    if (cloudHit) {
      const c = clouds.find((x) => x.id === cloudHit.id)!;
      editor.selection = [c.id];
      gesture =
        cloudHit.part === "size"
          ? { kind: "cloudsize", id: c.id, start: pt, rect: [...c.rect], delta: [0, 0], edges: cloudHit.edges }
          : { kind: "cloudmove", id: c.id, start: pt, rect: [...c.rect], delta: [0, 0] };
      return;
    }
    const hit = hitElement(pt);
    const wireHit = hit ? null : hitWire(pt);
    const secHit = hit || wireHit ? null : hitSection(pt);
    if (secHit) {
      const sec = page.sections.find((x) => x.id === secHit.id)!;
      editor.selection = [sec.id];
      gesture =
        secHit.part === "size"
          ? { kind: "secsize", id: sec.id, start: pt, rect: [...sec.rect], delta: [0, 0], edges: secHit.edges }
          : { kind: "secmove", id: sec.id, start: pt, rect: [...sec.rect], delta: [0, 0] };
      return;
    }
    if (bench === "draft" && !hit && !wireHit && page.boundaryY !== null && Math.abs(pt[1] - page.boundaryY) < 1.6) {
      gesture = { kind: "boundary", y: page.boundaryY };
      return;
    }
    const id = hit?.id ?? wireHit?.seg.id;
    if (id) {
      if (e.shiftKey || e.ctrlKey) {
        editor.selection = selected.has(id) ? editor.selection.filter((s) => s !== id) : [...editor.selection, id];
        if (!selected.has(id)) return;
      } else if (!selected.has(id)) {
        editor.selection = [id];
      }
      if (hit) {
        const ids = editor.selectedElements.map((el) => el.id);
        gesture = { kind: "drag", start: pt, delta: [0, 0], ids };
      } else if (wireHit && editor.selection.length === 1) {
        const pts = routeOf(page, wireHit.seg);
        gesture = { kind: "leg", seg: wireHit.seg.id, leg: wireHit.leg, start: pt, original: pts, points: pts };
      }
    } else {
      gesture = { kind: "band", start: pt, cur: pt, add: e.shiftKey || e.ctrlKey };
      if (!gesture.add) editor.selection = [];
    }
  }

  function onPointerMove(e: PointerEvent) {
    pointer = toUnits(e);
    const g = gesture;
    if (!g) return;
    if (g.kind === "pan") {
      const k = view.w / box.w;
      view = { ...view, x: g.start.x - (e.clientX - g.client[0]) * k, y: g.start.y - (e.clientY - g.client[1]) * k };
    } else if (g.kind === "drag") {
      const d = snapVec([pointer[0] - g.start[0], pointer[1] - g.start[1]]);
      if (d[0] !== g.delta[0] || d[1] !== g.delta[1]) g.delta = d;
    } else if (g.kind === "leg") {
      const d = snapVec([pointer[0] - g.start[0], pointer[1] - g.start[1]]);
      g.points = dragLeg(g.original, g.leg, d);
    } else if (g.kind === "band") {
      g.cur = pointer;
    } else if (g.kind === "secnew") {
      g.cur = snapVec(pointer);
    } else if (g.kind === "secmove" || g.kind === "secsize" || g.kind === "cloudmove" || g.kind === "cloudsize") {
      g.delta = snapVec([pointer[0] - g.start[0], pointer[1] - g.start[1]]);
    } else if (g.kind === "gadrag" || g.kind === "gasize") {
      if (!frame) return;
      const mm = sheetToGa(frame, pointer);
      g.delta = [snapMm(mm[0] - g.start[0], e.shiftKey), snapMm(mm[1] - g.start[1], e.shiftKey)];
    } else if (g.kind === "ganew") {
      if (!frame) return;
      const mm = sheetToGa(frame, pointer);
      g.cur = [snapMm(mm[0], e.shiftKey), snapMm(mm[1], e.shiftKey)];
    } else if (g.kind === "point") {
      g.delta = snapVec([pointer[0] - g.start[0], pointer[1] - g.start[1]]);
    } else if (g.kind === "elsize") {
      let d = snapVec([pointer[0] - g.start[0], pointer[1] - g.start[1]]);
      // A picture keeps its shape (hold Shift to stretch it).
      if (g.keepShape && !e.shiftKey) d = [d[0], Math.round(((g.size[0] + d[0]) * g.size[1]) / g.size[0]) - g.size[1]];
      g.delta = d;
    } else if (g.kind === "table") {
      // Half-unit steps: the table is text, it doesn't need to sit on the grid.
      g.delta = [Math.round((pointer[0] - g.start[0]) * 2) / 2, Math.round((pointer[1] - g.start[1]) * 2) / 2];
    } else if (g.kind === "boundary") {
      g.y = Math.round(Math.max(0, Math.min(AREA_UNITS.h, pointer[1])));
    }
  }

  /** The simulator input under the pointer on an element: the element, or a plant view's clicked output. */
  function simInputAt(el: Element, pt: Vec): string | null {
    if (!sim) return null;
    if (sim.isInput(el.id)) return el.id;
    if (el.symbol !== "plant-view") return null;
    const item = editor.project.plant.find((p) => p.id === el.params.plant);
    const g = geoms.get(el.id);
    if (!item || !g) return null;
    // The clicked output whose pins are nearest.
    let best: { ref: string; d: number } | null = null;
    for (const t of g.terminals) {
      const p = item.points?.find((x) => x.pins.includes(t.name));
      if (!p) continue;
      const ref = pointRef(item.id, p.name);
      if (!sim.isInput(ref)) continue;
      const d = Math.hypot(pt[0] - el.pos[0] - t.at[0], pt[1] - el.pos[1] - t.at[1]);
      if (!best || d < best.d) best = { ref, d };
    }
    return best && best.d < 6 ? best.ref : null;
  }

  /**
   * Simulate: a plant view's terminal boxes coloured by state (controller.md §6):
   * filled when on, green or red when the point has an expectation.
   */
  const simPins = $derived.by(() => {
    if (!sim) return [];
    void sim.state;
    const exps = editor.project.expectations;
    const judged = sim.judged(exps);
    const out: { key: string; x: number; y: number; w: number; h: number; on: boolean; colour: string | null; clicked: boolean }[] = [];
    for (const el of page.elements) {
      if (el.symbol !== "plant-view") continue;
      const item = editor.project.plant.find((p) => p.id === el.params.plant);
      const g = geoms.get(el.id);
      if (!item || !g) continue;
      const termH = plantViewLayout(el).termH;
      for (const t of g.terminals) {
        const p = item.points?.find((x) => x.pins.includes(t.name));
        if (!p) continue;
        const ref = pointRef(item.id, p.name);
        // The box runs inwards from the terminal, against the way its wire leaves.
        const inward: Vec = t.dir === "up" ? [0, 1] : t.dir === "down" ? [0, -1] : t.dir === "left" ? [1, 0] : [-1, 0];
        const cx = el.pos[0] + t.at[0] + (inward[0] * termH) / 2;
        const cy = el.pos[1] + t.at[1] + (inward[1] * termH) / 2;
        const w = inward[0] ? termH : 1;
        const h = inward[1] ? termH : 1;
        out.push({
          key: `${el.id}:${t.name}`,
          x: cx - w / 2,
          y: cy - h / 2,
          w,
          h,
          on: sim.isOn(ref),
          colour: isInputForm(p.form) ? sim.inputColour(ref, exps, judged) : null,
          clicked: sim.isInput(ref),
        });
      }
    }
    return out;
  });

  /** Parts named by a "never" statement that has come true: ringed red. */
  const simNever = $derived.by(() => {
    if (!sim) return new Set<string>();
    void sim.state;
    const exps = editor.project.expectations.filter((e) => e.kind === "never");
    const judged = sim.judged(exps);
    const ids = new Set<string>();
    for (const e of exps) {
      if (judged.get(e.id) !== "bad") continue;
      for (const c of e.when) {
        const r = parsePointRef(c.ref);
        if (!r) ids.add(c.ref);
        else for (const el of page.elements) if (el.symbol === "plant-view" && el.params.plant === r.plant) ids.add(el.id);
      }
    }
    return ids;
  });
  let heldButton: string | null = null;

  function onPointerUp() {
    if (heldButton && sim) {
      sim.hold(heldButton, false);
      heldButton = null;
    }
    const g = gesture;
    gesture = null;
    if (!g) return;
    if (g.kind === "drag" && (g.delta[0] || g.delta[1])) {
      editor.apply((p) => moveElements(p, editor.pageId, g.ids, g.delta));
    } else if (g.kind === "leg") {
      const pts = simplifyRoute(g.points);
      if (JSON.stringify(pts) !== JSON.stringify(simplifyRoute(g.original))) {
        editor.apply((p) => setManualRoute(p, editor.pageId, g.seg, pts));
      }
    } else if (g.kind === "secnew" && g.cloud) {
      const r = bandRect(g.start, g.cur);
      if (r.w < 2 || r.h < 2) return;
      editor.apply((p) => addCloud(p, editor.pageId, [r.x, r.y, r.w, r.h]));
      editor.tool = "select";
    } else if (g.kind === "secnew") {
      const r = bandRect(g.start, g.cur);
      if (r.w < 4 || r.h < 4) return;
      let id = "";
      editor.apply((p) => {
        id = addSection(p, editor.pageId, "", [r.x, r.y, r.w, r.h]).id;
      });
      editor.tool = "select";
      if (id) editor.selection = [id];
    } else if ((g.kind === "secmove" || g.kind === "secsize") && (g.delta[0] || g.delta[1])) {
      const rect = sectionPreview(g);
      editor.apply((p) => updateSection(p, editor.pageId, g.id, { rect }));
    } else if (g.kind === "gadrag" && (g.delta[0] || g.delta[1])) {
      const moved = gaPreview;
      editor.apply((p) => {
        moveGaItems(p, editor.pageId, g.ids, g.delta);
        // Keep a device's snap onto a rail.
        if (g.ids.length === 1 && moved?.get(g.ids[0]!)) updateGaItem(p, editor.pageId, g.ids[0]!, { y: moved.get(g.ids[0]!)!.y });
      });
    } else if (g.kind === "gasize" && (g.delta[0] || g.delta[1])) {
      const w = Math.max(5, g.size[0] + g.delta[0]);
      const h = Math.max(5, g.size[1] + g.delta[1]);
      editor.apply((p) => updateGaItem(p, editor.pageId, g.id, { w, h }));
    } else if (g.kind === "ganew") {
      const x = Math.min(g.start[0], g.cur[0]);
      const y = Math.min(g.start[1], g.cur[1]);
      const dx = Math.abs(g.cur[0] - g.start[0]);
      const dy = Math.abs(g.cur[1] - g.start[1]);
      // A rail is 35 mm across; trunking as drawn (or 40 mm across if just a line).
      const horizontal = dx >= dy;
      const across = g.what === "rail" ? 35 : Math.max(40, horizontal ? dy : dx);
      const len = Math.max(20, horizontal ? dx : dy);
      let id = "";
      editor.apply((p) => {
        id = addGaItem(p, editor.pageId, {
          kind: g.what,
          x: horizontal ? x : x - (g.what === "rail" ? across / 2 : 0),
          y: horizontal ? y - (g.what === "rail" ? across / 2 : 0) : y,
          w: horizontal ? len : across,
          h: horizontal ? across : len,
        }).id;
      });
      if (id) editor.selection = [id];
    } else if (g.kind === "point" && (g.delta[0] || g.delta[1])) {
      const pts = pointPreview(g);
      editor.apply((p) => setPartPoints(p, editor.pageId, g.id, pts));
    } else if (g.kind === "elsize" && (g.delta[0] || g.delta[1])) {
      const w = Math.max(2, g.size[0] + g.delta[0]);
      const h = Math.max(2, g.size[1] + g.delta[1]);
      editor.apply((p) => updateElement(p, editor.pageId, g.id, { params: { w, h } }));
    } else if ((g.kind === "cloudmove" || g.kind === "cloudsize") && (g.delta[0] || g.delta[1])) {
      const rect = sectionPreview({ ...g, kind: g.kind === "cloudsize" ? "secsize" : "secmove" });
      editor.apply((p) => updateCloud(p, g.id, { rect }));
    } else if (g.kind === "table") {
      if (g.delta[0] || g.delta[1]) {
        const at: Vec = [g.at[0] + g.delta[0], g.at[1] + g.delta[1]];
        editor.apply((p) => updateElement(p, editor.pageId, g.coil, { params: { xrefDx: at[0], xrefDy: at[1] } }));
      } else {
        // A click on a row goes to that contact.
        const coil = page.elements.find((e) => e.id === g.coil);
        const row = coil && g.row >= 0 ? contactRows(editor.project, coil)[g.row] : undefined;
        if (row) editor.goTo(row.id);
        else editor.selection = [g.coil];
      }
    } else if (g.kind === "boundary" && g.y !== page.boundaryY) {
      const y = g.y;
      editor.apply((p) => setBoundary(p, editor.pageId, y));
    } else if (g.kind === "band") {
      const r = bandRect(g.start, g.cur);
      if (r.w < 0.2 && r.h < 0.2) return;
      const hitEls = page.elements
        .filter((el) => {
          if (el.symbol === "junction" || benchOf(el) !== bench) return false;
          const gm = geoms.get(el.id);
          return gm && rectsIntersect(r, offsetRect(gm.bbox, el.pos));
        })
        .map((el) => el.id);
      // Wires are boxed only when they lie wholly inside.
      const hitSegs = bench === "draft" ? page.segments.filter((s) => routeOf(page, s).every((p) => pointInRect(p, r))).map((s) => s.id) : [];
      const inside = (q: Rect4) => q[0] >= r.x && q[1] >= r.y && q[0] + q[2] <= r.x + r.w && q[1] + q[3] <= r.y + r.h;
      const hitBoxes =
        bench === "annotate"
          ? [...page.sections.filter((x) => inside(x.rect)).map((x) => x.id), ...clouds.filter((c) => inside(c.rect)).map((c) => c.id)]
          : [];
      const hits = [...hitEls, ...hitSegs, ...hitBoxes];
      editor.selection = g.add ? [...new Set([...editor.selection, ...hits])] : hits;
    }
  }

  function pointPreview(g: { index: number; points: Vec[]; delta: Vec }): Vec[] {
    return g.points.map((q, i): Vec => (i === g.index ? clampToArea([q[0] + g.delta[0], q[1] + g.delta[1]]) : q));
  }
  /** An arrow or polygon while a corner is dragged: drawn from the moved corners. */
  const pointGhost = $derived.by((): Element | null => {
    const g = gesture as Gesture;
    if (g?.kind !== "point") return null;
    const el = page.elements.find((e) => e.id === g.id);
    if (!el) return null;
    const pts = pointPreview(g);
    const o = pts[0]!;
    return { ...el, id: "ghost", pos: o, params: { ...el.params, pts: formatPoints(pts.slice(1).map((q) => [q[0] - o[0], q[1] - o[1]])) } };
  });

  function bandRect(a: Vec, b: Vec) {
    return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]), h: Math.abs(a[1] - b[1]) };
  }

  function sectionPreview(g: { kind: string; rect: Rect4; delta: Vec; edges?: string }): Rect4 {
    let [x, y, w, h] = g.rect;
    const [dx, dy] = g.delta;
    if (g.kind !== "secsize") return [x + dx, y + dy, w, h];
    const e = g.edges ?? "se";
    // Each dragged edge moves; the opposite edge stays put. Never smaller than 4 units.
    if (e.includes("w")) {
      const nx = Math.min(x + dx, x + w - 4);
      w += x - nx;
      x = nx;
    }
    if (e.includes("e")) w = Math.max(4, w + dx);
    if (e.includes("n")) {
      const ny = Math.min(y + dy, y + h - 4);
      h += y - ny;
      y = ny;
    }
    if (e.includes("s")) h = Math.max(4, h + dy);
    return [x, y, w, h];
  }

  /** Pictures dropped on the sheet go where they're dropped (Annotate workbench). */
  async function onDrop(e: DragEvent) {
    if (sim) return;
    const files = [...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    e.preventDefault();
    const at = clampToArea(snapVec(toUnits(e)));
    await placePictures(files, at);
  }

  /** Put pictures on the sheet, top-left at `at`, and switch to Annotate where they're edited. */
  export async function placePictures(files: Blob[], at?: Vec): Promise<void> {
    const where = at ?? clampToArea(snapVec(pointer ?? [AREA_UNITS.w / 2 - 20, AREA_UNITS.h / 2 - 10]));
    const ids: string[] = [];
    for (const [i, f] of files.entries()) {
      let img;
      try {
        img = await readImage(f);
      } catch (err) {
        editor.flash((err as Error).message);
        continue;
      }
      editor.apply((p) => {
        const asset = addAsset(p, img);
        ids.push(addImage(p, editor.pageId, asset, [where[0] + i * 4, where[1] + i * 4]).id);
      });
    }
    if (ids.length) {
      editor.mode = "annotate";
      editor.tool = "select";
      editor.selection = ids;
      editor.flash(ids.length === 1 ? "Picture added. Drag its corner to size it." : `${ids.length} pictures added.`);
    }
  }

  function onDblClick(e: MouseEvent) {
    // A dimension is finished by the double-click's second press (gaPointerDown).
    if (editor.mode === "ga" && editor.tool === "ga-dim") return;
    if (editor.tool === "polygon") {
      finishPolygon();
      return;
    }
    if (editor.tool !== "select") return;
    const hit = hitElement(toUnits(e));
    if (!hit) return;
    const target = linkedTarget(editor.project, hit);
    if (target) editor.goTo(target);
  }

  // Centre whatever we've jumped to (a part, a wire or a GA item), at the
  // current zoom, in the part of the canvas the browser doesn't cover. Only a
  // new jump (focusRequest) or the sheet appearing runs this: reading the view
  // here would pull you back to it every time you zoom or pan.
  $effect(() => {
    void editor.focusRequest;
    void page.id;
    untrack(() => {
      const id = editor.highlight;
      if (!id || !svg) return;
      const at = focusPoint(id);
      if (!at) return;
      const cx = AREA_MM.x + at[0] * UNIT_MM;
      const cy = AREA_MM.y + at[1] * UNIT_MM;
      const v = $state.snapshot(view);
      const mmPerPx = v.w / Math.max(1, box.w);
      const h = box.h * mmPerPx;
      const inset = insetLeft < box.w * 0.5 ? insetLeft : 0;
      // The middle of the uncovered area, in mm from the view's left edge.
      const midX = (inset + (box.w - inset) / 2) * mmPerPx;
      view = { ...v, x: cx - midX, y: cy - h / 2 };
    });
  });

  /** Where to centre for an element, a wire (the middle of its route) or a GA item, in sheet units. */
  function focusPoint(id: string): [number, number] | null {
    const el = page.elements.find((x) => x.id === id);
    if (el) return [el.pos[0], el.pos[1]];
    const seg = page.segments.find((x) => x.id === id);
    if (seg) {
      const pts = routeOf(page, seg);
      if (!pts.length) return null;
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    }
    const it = page.ga && page.gaItems?.find((x) => x.id === id);
    const r = it ? gaRect(it) : null;
    if (r) return [r.x + r.w / 2, r.y + r.h / 2];
    return null;
  }

  // The highlight lasts until the selection moves on.
  $effect(() => {
    if (editor.highlight && !editor.selection.includes(editor.highlight)) editor.highlight = null;
  });

  const highlighted = $derived.by(() => {
    const id = editor.highlight;
    const el = id ? page.elements.find((x) => x.id === id) : null;
    const g = el ? geoms.get(el.id) : null;
    return el && g ? { el, g } : null;
  });

  const tablePreview = $derived.by(() => {
    const g = gesture as Gesture;
    if (g?.kind !== "table" || (!g.delta[0] && !g.delta[1])) return null;
    const coil = page.elements.find((e) => e.id === g.coil);
    if (!coil) return null;
    const r = contactTableRect(contactRows(editor.project, coil).length, [g.at[0] + g.delta[0], g.at[1] + g.delta[1]]);
    return { x: coil.pos[0] + r.x, y: coil.pos[1] + r.y, w: r.w, h: r.h };
  });

  /** Resize cursors over section edges, a move cursor over labels and contact tables. */
  const hoverCursor = $derived.by(() => {
    if (sim || editor.tool !== "select" || !pointer || gesture) return "";
    const sz = resizable();
    if (sz && Math.abs(pointer[0] - sz.corner[0]) < 0.9 && Math.abs(pointer[1] - sz.corner[1]) < 0.9) return "nwse";
    if (hitPoint(pointer)) return "move";
    if (hitTable(pointer)) return "move";
    const s = hitCloud(pointer) ?? hitSection(pointer);
    if (!s) return "";
    if (s.part === "move") return "move";
    const e = s.edges;
    if ((e.includes("n") && e.includes("w")) || (e.includes("s") && e.includes("e"))) return "nwse";
    if ((e.includes("n") && e.includes("e")) || (e.includes("s") && e.includes("w"))) return "nesw";
    return e === "n" || e === "s" ? "ns" : "ew";
  });

  const sectionRects = $derived.by(() => {
    const g = gesture as Gesture;
    if (g?.kind !== "secmove" && g?.kind !== "secsize") return null;
    return new Map([[g.id, sectionPreview(g)]]);
  });
  const cloudPreview = $derived.by(() => {
    const g = gesture as Gesture;
    if (g?.kind !== "cloudmove" && g?.kind !== "cloudsize") return null;
    return sectionPreview({ ...g, kind: g.kind === "cloudsize" ? "secsize" : "secmove" });
  });
  const boundaryPreview = $derived.by(() => {
    const g = gesture as Gesture;
    return g?.kind === "boundary" ? g.y : null;
  });
  const newSection = $derived.by(() => {
    const g = gesture as Gesture;
    return g?.kind === "secnew" ? bandRect(g.start, g.cur) : null;
  });

  function offset(id: string): Vec | null {
    const g = gesture;
    return g?.kind === "drag" && g.ids.includes(id) ? g.delta : null;
  }

  /** Live routes while something is being dragged. */
  const previewRoutes = $derived.by((): Map<string, Vec[]> | null => {
    const g = gesture as Gesture;
    if (g?.kind === "leg") return new Map([[g.seg, g.points]]);
    if (g?.kind !== "drag" || (!g.delta[0] && !g.delta[1])) return null;
    const moved = new Set(g.ids);
    const tmp: Page = JSON.parse(JSON.stringify($state.snapshot(page)));
    const touched = tmp.segments.filter((s) => moved.has(s.from[0]) || moved.has(s.to[0]));
    if (!touched.length) return null;
    for (const el of tmp.elements) {
      if (moved.has(el.id)) el.pos = clampToArea([el.pos[0] + g.delta[0], el.pos[1] + g.delta[1]]);
    }
    routePage(getAvoid(), tmp, { only: new Set(touched.map((s) => s.id)) });
    return new Map(tmp.segments.map((s) => [s.id, s.points]));
  });

  // A new part to place starts upright (R and F turn and flip it before it's placed).
  $effect(() => {
    void editor.placeSymbol;
    editor.placeRot = 0;
    editor.placeFlip = false;
  });

  const ghost = $derived.by((): Element | null => {
    if (editor.tool !== "place" || !editor.placeSymbol || !pointer) return null;
    return {
      id: "ghost",
      symbol: editor.placeSymbol,
      tag: "",
      label: "",
      pos: clampToArea(snapVec(pointer)),
      rot: editor.placeRot,
      ...(editor.placeFlip ? { flip: true } : {}),
      zone: "internal",
      params: { ...defaultParams(editor.placeSymbol), ...editor.placeParams },
      links: [],
    };
  });

  const hover = $derived(editor.tool === "wire" && pointer ? wireTarget(pointer) : null);
  const rubber = $derived.by((): Vec[] | null => {
    if (!pending || !pointer) return null;
    const to = hover?.at ?? snapVec(pointer);
    return simpleRoute(pending.at, to);
  });

  const band = $derived.by(() => {
    const g = gesture as Gesture;
    return g?.kind === "band" ? g : null;
  });

  const simLive = $derived(sim ? new Set(sim.state.live) : null);
  const simOps = $derived(sim ? sim.ops : null);
  /** Each selector's position, so its legend boxes the one it's in (v0.2.1 note 23). */
  const simPositions = $derived.by(() => {
    if (!sim) return null;
    const out: Record<string, number> = {};
    for (const el of page.elements) if (el.symbol === "selector") out[el.id] = sim.state.inputs[el.id] ?? 0;
    return out;
  });
  /** Busbars on a live conductor, drawn red like live wires. */
  const liveRails = $derived.by(() => {
    if (!sim || !simLive) return [];
    const out: { x1: number; y1: number; x2: number; y2: number; bar: boolean }[] = [];
    for (const el of page.elements) {
      if (el.symbol !== "busbar") continue;
      if (!editor.project.conductors.some((x) => x.terminals.some(([id]) => id === el.id) && simLive.has(x.id))) continue;
      const len = Number(el.params.length) || 0;
      const v = el.rot === 90 ? [0, 1] : el.rot === 180 ? [-1, 0] : el.rot === 270 ? [0, -1] : [1, 0];
      out.push({ x1: el.pos[0], y1: el.pos[1], x2: el.pos[0] + v[0]! * len, y2: el.pos[1] + v[1]! * len, bar: el.params.style !== "control" });
    }
    return out;
  });
  function lampColour(c: unknown): string {
    // White lamps glow a warm white, so they show on white paper.
    return { Gn: "#3cc85a", Rd: "#ff4a4a", Wh: "#ffe9a8", Bu: "#4a8cff", Ye: "#ffd21f" }[String(c)] ?? "#ffe9a8";
  }

  const cursorClass = $derived(
    gesture?.kind === "pan" || spaceDown
      ? "grab"
      : editor.tool !== "select" || editor.gaPlace
        ? "crosshair"
        : hoverCursor || "default",
  );
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === "Enter" && polyDraft.length && !isTyping(e.target)) {
      e.preventDefault();
      finishPolygon();
    }
    if (e.key === "Enter" && dimDraft.length && !isTyping(e.target)) {
      e.preventDefault();
      const it = dimFrom(dimDraft, null);
      const mm = pointer && frame ? sheetToGa(frame, pointer) : null;
      finishDim(it && mm ? (it.dim!.axis === "h" ? mm[1] : mm[0]) : null);
    }
    if (e.code === "Space" && !isTyping(e.target)) {
      if (!spaceDown && !e.repeat) {
        spaceAt = performance.now();
        spacePanned = false;
      }
      spaceDown = true;
      e.preventDefault();
    }
  }}
  onkeyup={(e) => {
    if (e.code !== "Space") return;
    const tapped = spaceDown && !spacePanned && performance.now() - spaceAt < 400 && !isTyping(e.target);
    spaceDown = false;
    if (tapped) fit();
  }}
/>

<div class="wrap">
<svg
  bind:this={svg}
  class="canvas {cursorClass}"
  viewBox="{view.x} {view.y} {view.w} {viewH}"
  onwheel={onWheel}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  ondblclick={onDblClick}
  ondragover={(e) => {
    if (!sim && e.dataTransfer?.types.includes("Files")) e.preventDefault();
  }}
  ondrop={(e) => void onDrop(e)}
  onpointerleave={() => (pointer = null)}
  oncontextmenu={(e) => e.preventDefault()}
  role="application"
  aria-label="Drawing canvas"
>
  <defs>
    <pattern id="ferrule-grid" width="2" height="2" patternUnits="userSpaceOnUse">
      <circle cx="0" cy="0" r="0.09" fill="#9aa" />
      <circle cx="1" cy="0" r="0.05" fill="#cdd" />
      <circle cx="0" cy="1" r="0.05" fill="#cdd" />
      <circle cx="1" cy="1" r="0.05" fill="#cdd" />
    </pattern>
  </defs>
  <rect class="desk" x={view.x - 1000} y={view.y - 1000} width={view.w + 2000} height={viewH + 2000} />
  <Sheet
    project={editor.project}
    {page}
    grid={!sim}
    {offset}
    routes={previewRoutes}
    {sectionRects}
    boundary={boundaryPreview}
    live={simLive}
    ops={simOps}
    positions={simPositions}
    colourCheck={editor.colourCheck && editor.mode === "draft" && !sim}
    {gaPreview}
    focus={sim || page.ga ? null : bench}
  >
    {#snippet under()}
      {#if sim}
        {#each page.elements as el (el.id)}
          {@const g = geoms.get(el.id)}
          {#if g}
            {#if el.symbol === "lamp" && sim.state.lamps[el.id]}
              <!-- A lit lamp glows in its own colour. -->
              <circle class="sim-glow" cx={el.pos[0]} cy={el.pos[1]} r="2.6" style:fill={lampColour(el.params.colour)} />
              <circle class="sim-ring" cx={el.pos[0]} cy={el.pos[1]} r="1.9" />
              <circle cx={el.pos[0]} cy={el.pos[1]} r="1.3" style:fill={lampColour(el.params.colour)} />
            {:else if sim.state.energised[el.id]}
              <!-- An energised coil (or transformer) is filled. -->
              <rect class="sim-on" x={el.pos[0] + g.body.x} y={el.pos[1] + g.body.y} width={g.body.w} height={g.body.h} />
            {/if}
            {#if simNever.has(el.id)}
              <rect class="sim-never" x={el.pos[0] + g.bbox.x - 0.8} y={el.pos[1] + g.bbox.y - 0.8} width={g.bbox.w + 1.6} height={g.bbox.h + 1.6} rx="0.8" />
            {/if}
            {#if sim.isInput(el.id)}
              <rect
                class="sim-input"
                class:active={sim.value(el.id) === 1}
                x={el.pos[0] + g.bbox.x - 0.4}
                y={el.pos[1] + g.bbox.y - 0.4}
                width={g.bbox.w + 0.8}
                height={g.bbox.h + 0.8}
              />
            {/if}
          {/if}
        {/each}
        {#each simPins as b (b.key)}
          <rect
            class="sim-pin"
            class:on={b.on}
            class:ok={b.colour === "ok"}
            class:bad={b.colour === "bad"}
            class:clicked={b.clicked}
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
          />
        {/each}
      {/if}
      {#each page.elements as el (el.id)}
        {#if selected.has(el.id)}
          {@const g = geoms.get(el.id)}
          {@const o = offset(el.id) ?? [0, 0]}
          {#if g}
            <rect
              class="sel"
              x={el.pos[0] + o[0] + g.bbox.x - 0.5}
              y={el.pos[1] + o[1] + g.bbox.y - 0.5}
              width={g.bbox.w + 1}
              height={g.bbox.h + 1}
            />
          {/if}
        {/if}
      {/each}
      {#each page.sections as sec (sec.id)}
        {#if selected.has(sec.id)}
          {@const r = sectionRects?.get(sec.id) ?? sec.rect}
          <rect class="sel" x={r[0] - 0.3} y={r[1] - 0.3} width={r[2] + 0.6} height={r[3] + 0.6} />
          {#each [[0, 0], [1, 0], [0, 1], [1, 1]] as [fx, fy] (`${fx}${fy}`)}
            <rect class="handle" x={r[0] + fx * r[2] - 0.5} y={r[1] + fy * r[3] - 0.5} width="1" height="1" />
          {/each}
        {/if}
      {/each}
      {#each clouds as c (c.id)}
        {#if selected.has(c.id)}
          {@const r = c.rect}
          <rect class="sel" x={r[0] - 0.8} y={r[1] - 0.8} width={r[2] + 1.6} height={r[3] + 1.6} />
          {#each [[0, 0], [1, 0], [0, 1], [1, 1]] as [fx, fy] (`${fx}${fy}`)}
            <rect class="handle" x={r[0] + fx * r[2] - 0.5} y={r[1] + fy * r[3] - 0.5} width="1" height="1" />
          {/each}
        {/if}
      {/each}
      {#each page.gaItems ?? [] as it (it.id)}
        {#if selected.has(it.id)}
          {@const r = gaRect(gaPreview?.get(it.id) ?? it)}
          {#if r}
            <rect class="sel" x={r.x - 0.3} y={r.y - 0.3} width={r.w + 0.6} height={r.h + 0.6} />
            {#if editor.selection.length === 1}
              <rect class="handle" x={r.x + r.w - 0.5} y={r.y + r.h - 0.5} width="1" height="1" />
            {/if}
          {/if}
        {/if}
      {/each}
      {#each page.segments as seg (seg.id)}
        {#if selected.has(seg.id)}
          {@const pts = previewRoutes?.get(seg.id) ?? routeOf(page, seg)}
          <polyline class="sel-wire" points={pts.map((p) => p.join(",")).join(" ")} />
        {/if}
      {/each}
    {/snippet}
    {#snippet over()}
      {#each liveRails as r, i (i)}
        <line class="sim-rail" class:bar={r.bar} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} />
      {/each}
      {#if sim}
        {#each page.elements as el (el.id)}
          {#if el.symbol === "timer-coil"}
            {@const left = sim.remaining(el.id)}
            {#if left !== null}
              <!-- A timer that's timing shows its count down above it. -->
              <g class="countdown">
                <rect x={el.pos[0] - 3.2} y={el.pos[1] - 6.4} width="6.4" height="2.2" rx="0.5" />
                <text x={el.pos[0]} y={el.pos[1] - 4.75} text-anchor="middle">{left >= 10 ? left.toFixed(0) : left.toFixed(1)} s</text>
              </g>
            {/if}
          {/if}
        {/each}
      {/if}
      {#if highlighted}
        {@const { el, g } = highlighted}
        <rect
          class="jumped"
          x={el.pos[0] + g.bbox.x - 1.2}
          y={el.pos[1] + g.bbox.y - 1.2}
          width={g.bbox.w + 2.4}
          height={g.bbox.h + 2.4}
          rx="1"
        />
      {/if}
      {#if !gesture || gesture.kind === "elsize"}
        {@const sz = resizable()}
        {#if sz}
          {@const g = gesture?.kind === "elsize" ? gesture : null}
          {@const w = Math.max(2, sz.size[0] + (g?.delta[0] ?? 0))}
          {@const h = Math.max(2, sz.size[1] + (g?.delta[1] ?? 0))}
          {#if g}<rect class="band" x={sz.el.pos[0]} y={sz.el.pos[1]} width={w} height={h} />{/if}
          <rect class="handle corner" x={sz.el.pos[0] + w - 0.6} y={sz.el.pos[1] + h - 0.6} width="1.2" height="1.2" />
        {/if}
      {/if}
      {#if !gesture || gesture.kind === "point"}
        {@const pp = pointed()}
        {#if pp}
          {#if pointGhost}<g class="ghost"><ElementView el={pointGhost} project={editor.project} /></g>{/if}
          {#each pointGhost ? partPoints(pointGhost)! : pp.points as q, i (i)}
            <rect class="handle corner" x={q[0] - 0.6} y={q[1] - 0.6} width="1.2" height="1.2" />
          {/each}
        {/if}
      {/if}
      {#if polyDraft.length}
        {@const to = pointer ? clampToArea(snapVec(pointer)) : null}
        <polyline class="rubber" points={[...polyDraft, ...(to ? [to] : [])].map((q) => q.join(",")).join(" ")} />
        {#each polyDraft as q, i (i)}
          <circle class="hover" class:start={i === 0} cx={q[0]} cy={q[1]} r="0.5" />
        {/each}
      {/if}
      {#if gaNew}
        <rect class="band" x={gaNew.x} y={gaNew.y} width={Math.max(0.2, gaNew.w)} height={Math.max(0.2, gaNew.h)} />
      {/if}
      {#if dimPreview}
        {#if dimPreview.layout}
          <g class="dim-ghost">
            {#each dimPreview.layout.lines as l, i (i)}<line x1={l[0]} y1={l[1]} x2={l[2]} y2={l[3]} />{/each}
            {#each dimPreview.layout.texts as t, i (i)}
              <text x={t.at[0]} y={t.at[1]} text-anchor="middle" transform={t.vertical ? `rotate(-90 ${t.at[0]} ${t.at[1]})` : undefined}>{t.text}</text>
            {/each}
          </g>
        {/if}
        {#if frame}
          {#each dimDraft as c, i (i)}
            {@const at = gaRect({ x: c.h?.v ?? c.mm[0], y: c.v?.v ?? c.mm[1], w: 0, h: 0 })}
            {#if at}<circle class="hover start" cx={at.x} cy={at.y} r="0.5" />{/if}
          {/each}
          {@const sn = dimPreview.snap}
          {@const sp = gaRect({ x: sn.h?.v ?? sn.mm[0], y: sn.v?.v ?? sn.mm[1], w: 0, h: 0 })}
          {#if sp && (sn.h || sn.v)}<circle class="hover" cx={sp.x} cy={sp.y} r="0.5" />{/if}
        {/if}
      {/if}
      {#if editor.gaPlace && pointer && frame}
        {@const pl = editor.gaPlace}
        {@const mm = sheetToGa(frame, pointer)}
        {@const r = gaRect({ id: "", kind: "device", x: mm[0] - pl.w / 2, y: mm[1] - pl.h / 2, w: pl.w, h: pl.h })}
        {#if r}<rect class="stamp" x={r.x} y={r.y} width={r.w} height={r.h} />{/if}
      {/if}
      {#if cloudPreview}
        <path class="cloud-ghost" d={cloudPath(cloudPreview)} />
      {/if}
      {#if tablePreview}
        <rect class="band" x={tablePreview.x} y={tablePreview.y} width={tablePreview.w} height={tablePreview.h} />
      {/if}
      {#if ghost}
        <g class="ghost"><ElementView el={ghost} project={editor.project} /></g>
      {/if}
      {#if editor.tool === "wire"}
        {#each page.elements as el (el.id)}
          {@const g = geoms.get(el.id)}
          {#if g && el.symbol !== "busbar"}
            {#each g.terminals as t (t.name)}
              <circle class="term" cx={el.pos[0] + t.at[0]} cy={el.pos[1] + t.at[1]} r="0.3" />
            {/each}
          {/if}
        {/each}
        {#if rubber}
          <polyline class="rubber" points={rubber.map((p) => p.join(",")).join(" ")} />
        {/if}
        {#if hover}
          <circle class="hover" cx={hover.at[0]} cy={hover.at[1]} r="0.6" />
        {/if}
        {#if pending}
          <circle class="hover start" cx={pending.at[0]} cy={pending.at[1]} r="0.6" />
        {/if}
      {/if}
      {#if editor.tool === "stamp" && editor.stamp && pointer}
        {@const at = snapVec(pointer)}
        <rect class="stamp" x={at[0]} y={at[1]} width={editor.stamp.size[0]} height={editor.stamp.size[1]} />
      {/if}
      {#if newSection}
        <rect class="band" x={newSection.x} y={newSection.y} width={newSection.w} height={newSection.h} />
      {/if}
      {#if band}
        {@const r = bandRect(band.start, band.cur)}
        <rect class="band" x={r.x} y={r.y} width={r.w} height={r.h} />
      {/if}
    {/snippet}
  </Sheet>
</svg>
{#if atlas}
  <Atlas
    project={editor.project}
    {page}
    {view}
    {viewH}
    sheet="{editor.pageIndex + 1} / {editor.project.pages.length}"
    onmove={(x, y) => (view = { ...view, x, y })}
  />
{/if}
</div>

<style>
  .wrap {
    position: relative;
    width: 100%;
    height: 100%;
  }
  .canvas {
    /* On screen the sheet is a warm off-white (note 63); print and PDF stay white. */
    --paper: #faf8f3;
    width: 100%;
    height: 100%;
    display: block;
    touch-action: none;
    user-select: none;
  }
  .canvas.crosshair {
    cursor: crosshair;
  }
  .canvas.grab {
    cursor: grab;
  }
  .canvas.move {
    cursor: move;
  }
  .canvas.ns {
    cursor: ns-resize;
  }
  .canvas.ew {
    cursor: ew-resize;
  }
  .canvas.nwse {
    cursor: nwse-resize;
  }
  .canvas.nesw {
    cursor: nesw-resize;
  }
  .dim-ghost line {
    stroke: #1e6ee6;
    stroke-width: 0.1;
  }
  .dim-ghost text {
    fill: #1e6ee6;
    font-size: var(--detail);
    font-family: var(--drawing-font);
  }
  .cloud-ghost {
    fill: none;
    stroke: #1e6ee6;
    stroke-width: 0.25;
    stroke-dasharray: 0.8 0.5;
  }
  .jumped {
    fill: rgba(255, 170, 0, 0.12);
    stroke: #f08c00;
    stroke-width: 0.35;
    pointer-events: none;
    animation: jumped 0.9s ease-in-out 4;
  }
  @keyframes jumped {
    50% {
      stroke-width: 0.9;
      fill: rgba(255, 170, 0, 0.35);
    }
  }
  .desk {
    fill: var(--desk, #d8dcdf);
  }
  .sel {
    fill: rgba(30, 110, 230, 0.08);
    stroke: #1e6ee6;
    stroke-width: 0.12;
    stroke-dasharray: 0.5 0.3;
  }
  .sel-wire {
    fill: none;
    stroke: rgba(30, 110, 230, 0.35);
    stroke-width: 0.9;
    stroke-linejoin: round;
  }
  .stamp {
    fill: rgba(30, 160, 60, 0.08);
    stroke: #1a8f3a;
    stroke-width: 0.15;
    stroke-dasharray: 0.8 0.4;
  }
  .sim-pin {
    fill: none;
    stroke: none;
  }
  .sim-pin.clicked {
    stroke: #e08a00;
    stroke-width: 0.12;
  }
  .sim-pin.on {
    fill: rgba(90, 100, 120, 0.45);
  }
  .sim-pin.ok {
    fill: rgba(26, 143, 58, 0.25);
    stroke: #1a8f3a;
    stroke-width: 0.15;
  }
  .sim-pin.ok.on {
    fill: rgba(26, 143, 58, 0.7);
  }
  .sim-pin.bad {
    fill: rgba(198, 40, 40, 0.25);
    stroke: #c62828;
    stroke-width: 0.15;
  }
  .sim-pin.bad.on {
    fill: rgba(198, 40, 40, 0.7);
  }
  .sim-never {
    fill: none;
    stroke: #c62828;
    stroke-width: 0.3;
    stroke-dasharray: 0.8 0.4;
  }
  .sim-on {
    fill: rgba(255, 70, 70, 0.35);
    stroke: none;
  }
  .sim-glow {
    opacity: 0.45;
    filter: blur(0.6px);
  }
  .sim-ring {
    fill: none;
    stroke: #e0a000;
    stroke-width: 0.15;
    stroke-dasharray: 0.4 0.3;
  }
  .sim-rail {
    stroke: #e33;
    stroke-width: 0.3;
    stroke-linecap: square;
  }
  .sim-rail.bar {
    stroke-width: 0.6;
  }
  .countdown rect {
    fill: #1b2230;
    opacity: 0.85;
  }
  .countdown text {
    fill: #fff;
    font-size: 1.4px;
    font-family: var(--drawing-font);
  }
  .sim-input {
    fill: none;
    stroke: #e67e1e;
    stroke-width: 0.15;
    stroke-dasharray: 0.5 0.3;
    cursor: pointer;
  }
  .sim-input.active {
    fill: rgba(230, 126, 30, 0.12);
    stroke-dasharray: none;
  }
  .handle {
    fill: #fff;
    stroke: #1e6ee6;
    stroke-width: 0.15;
  }
  .band {
    fill: rgba(30, 110, 230, 0.06);
    stroke: #1e6ee6;
    stroke-width: 0.1;
  }
  .ghost {
    opacity: 0.45;
    pointer-events: none;
  }
  .term {
    fill: none;
    stroke: #1e6ee6;
    stroke-width: 0.08;
  }
  .hover {
    fill: rgba(230, 110, 30, 0.25);
    stroke: #e66e1e;
    stroke-width: 0.12;
  }
  .hover.start {
    fill: rgba(30, 160, 60, 0.3);
    stroke: #1a8f3a;
  }
  .rubber {
    fill: none;
    stroke: #e66e1e;
    stroke-width: 0.15;
    stroke-dasharray: 0.6 0.4;
  }
</style>
