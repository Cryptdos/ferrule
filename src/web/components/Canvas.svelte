<script lang="ts">
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
    moveGaItems,
    updateGaItem,
    updateElement,
    updateSection,
    wire,
    type WireEnd,
  } from "../../core/ops";
  import { benchOf, localGeometry, defaultParams, plantViewLayout, type Geometry } from "../../core/symbols";
  import { plantInputId } from "../../core/sim";
  import { GA_ORIGIN, mmToUnits, sheetToGa, snapToRail } from "../../core/ga";
  import type { GaItem } from "../../core/model";
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

  let { editor, sim = null }: { editor: Editor; sim?: Simulator | null } = $props();

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
  });

  export function fit(): void {
    const aspect = box.h / Math.max(1, box.w);
    const w = Math.max(SHEET_MM.w + 10, (SHEET_MM.h + 10) / aspect);
    view = { x: SHEET_MM.w / 2 - w / 2, y: SHEET_MM.h / 2 - (w * aspect) / 2, w };
  }

  /** Cancel a wire in progress or a drag. Returns true if there was one. */
  export function cancel(): boolean {
    if (pending || gesture) {
      pending = null;
      gesture = null;
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
    const els = page.elements;
    for (let i = els.length - 1; i >= 0; i--) {
      const el = els[i]!;
      if (el.symbol === "junction" || benchOf(el) !== bench) continue;
      const g = geoms.get(el.id);
      if (!g) continue;
      const local: Vec = [pt[0] - el.pos[0], pt[1] - el.pos[1]];
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
    if (!el || !["image", "box", "plate"].includes(el.symbol) || el.rot !== 0) return null;
    const size: Vec = [Number(el.params.w) || 20, Number(el.params.h) || 10];
    return { el, size, corner: [el.pos[0] + size[0], el.pos[1] + size[1]] };
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
  /** Snap a real-mm distance: 5 mm, or 1 mm with Shift held. */
  const snapMm = (v: number, fine = false) => Math.round(v / (fine ? 1 : 5)) * (fine ? 1 : 5);
  const gaRect = (it: GaItem) =>
    ga ? { x: GA_ORIGIN[0] + mmToUnits(ga, it.x), y: GA_ORIGIN[1] + mmToUnits(ga, it.y), w: mmToUnits(ga, it.w), h: mmToUnits(ga, it.h) } : null;

  function hitGa(pt: Vec): GaItem | null {
    const items = page.gaItems ?? [];
    // Devices and notes over rails and trunking.
    const order = [...items.filter((i) => i.kind === "device" || i.kind === "note"), ...items.filter((i) => i.kind === "rail" || i.kind === "trunking")];
    for (const it of order) {
      const r = gaRect(it);
      if (r && pointInRect(pt, it.kind === "note" ? { ...r, y: r.y - 1, h: r.h + 1, w: Math.max(r.w, (it.text?.length ?? 4) * 0.9) } : r, 0.3)) return it;
    }
    return null;
  }

  /** The one selected GA item's corner handle, for sizing rails, trunking and devices. */
  function gaCorner(): { it: GaItem; at: Vec } | null {
    if (editor.selection.length !== 1) return null;
    const it = (page.gaItems ?? []).find((x) => x.id === editor.selection[0]);
    const r = it ? gaRect(it) : null;
    return it && r ? { it, at: [r.x + r.w, r.y + r.h] } : null;
  }

  function gaPointerDown(pt: Vec, e: PointerEvent): void {
    if (!ga) return;
    const mm = sheetToGa(ga, pt);
    const fine = e.shiftKey;
    if (editor.gaPlace) {
      const pl = editor.gaPlace;
      let at: Vec = [snapMm(mm[0] - pl.w / 2, fine), snapMm(mm[1] - pl.h / 2, fine)];
      const railY = snapToRail(page, { x: at[0], y: at[1], w: pl.w, h: pl.h });
      if (railY !== null) at = [at[0], railY];
      let id = "";
      const ok = editor.apply((p) => {
        id = addGaItem(p, editor.pageId, { kind: "device", x: at[0], y: at[1], w: pl.w, h: pl.h, refs: pl.refs }).id;
      });
      editor.gaPlace = null;
      if (ok) editor.selection = [id];
      return;
    }
    if (editor.tool === "ga-rail" || editor.tool === "ga-trunking") {
      const s: Vec = [snapMm(mm[0], fine), snapMm(mm[1], fine)];
      gesture = { kind: "ganew", what: editor.tool === "ga-rail" ? "rail" : "trunking", start: s, cur: s };
      return;
    }
    if (editor.tool === "ga-note") {
      let id = "";
      editor.apply((p) => {
        id = addGaItem(p, editor.pageId, { kind: "note", x: snapMm(mm[0]), y: snapMm(mm[1]), w: 60, h: 8, text: "NOTE" }).id;
      });
      editor.tool = "select";
      if (id) editor.selection = [id];
      return;
    }
    const corner = gaCorner();
    if (corner && corner.it.kind !== "note" && Math.abs(pt[0] - corner.at[0]) < 0.9 && Math.abs(pt[1] - corner.at[1]) < 0.9) {
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
    if (g?.kind !== "ganew" || !ga) return null;
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

    if (editor.tool === "place" && editor.placeSymbol) {
      const symbol = editor.placeSymbol;
      const params = { ...editor.placeParams };
      let id = "";
      editor.apply((p) => {
        const at = clampToArea(snapVec(pt));
        id =
          symbol === "plant-view"
            ? placePlantView(p, editor.pageId, String(params.plant), at, String(params.show ?? "").split(",").filter(Boolean)).id
            : addElement(p, editor.pageId, symbol, at, { params }).id;
      });
      if (id) editor.selection = [id];
      // A plant view is placed once; other symbols can be placed again and again.
      if (symbol === "plant-view") {
        editor.tool = "select";
        editor.placeSymbol = null;
      }
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
    if (bench === "draft" && !hit && !wireHit && page.boundaryY !== null && Math.abs(pt[1] - page.boundaryY) < 0.6) {
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
      if (!ga) return;
      const mm = sheetToGa(ga, pointer);
      g.delta = [snapMm(mm[0] - g.start[0], e.shiftKey), snapMm(mm[1] - g.start[1], e.shiftKey)];
    } else if (g.kind === "ganew") {
      if (!ga) return;
      const mm = sheetToGa(ga, pointer);
      g.cur = [snapMm(mm[0], e.shiftKey), snapMm(mm[1], e.shiftKey)];
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

  /** The simulator input under the pointer on an element: the element, or a plant view's group. */
  function simInputAt(el: Element, pt: Vec): string | null {
    if (!sim) return null;
    if (sim.isInput(el.id)) return el.id;
    if (el.symbol !== "plant-view") return null;
    const lay = plantViewLayout(el);
    const x = pt[0] - el.pos[0];
    // The group whose terminals are nearest across.
    let best: { name: string; d: number } | null = null;
    for (const g of lay.groups) {
      const d = x < g.x0 - 1.5 ? g.x0 - 1.5 - x : x > g.x1 + 1.5 ? x - g.x1 - 1.5 : 0;
      if (!best || d < best.d) best = { name: g.name, d };
    }
    const item = editor.project.plant.find((p) => p.id === el.params.plant);
    const group = item?.groups?.find((g) => g.name.toUpperCase() === best?.name);
    const id = item && group ? plantInputId(item.id, group.name) : null;
    return id && sim.isInput(id) ? id : null;
  }
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
    if (editor.tool !== "select") return;
    const hit = hitElement(toUnits(e));
    if (!hit) return;
    const target = linkedTarget(editor.project, hit);
    if (target) editor.goTo(target);
  }

  // Bring an element we've jumped to into view, at the current zoom.
  $effect(() => {
    void editor.focusRequest;
    const id = editor.highlight;
    if (!id || !svg) return;
    const el = page.elements.find((x) => x.id === id);
    if (!el) return;
    const cx = AREA_MM.x + el.pos[0] * UNIT_MM;
    const cy = AREA_MM.y + el.pos[1] * UNIT_MM;
    const v = $state.snapshot(view);
    const h = v.w * (box.h / Math.max(1, box.w));
    const margin = v.w * 0.1;
    if (cx < v.x + margin || cx > v.x + v.w - margin || cy < v.y + margin || cy > v.y + h - margin) {
      view = { ...v, x: cx - v.w / 2, y: cy - h / 2 };
    }
  });

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

  const ghost = $derived.by((): Element | null => {
    if (editor.tool !== "place" || !editor.placeSymbol || !pointer) return null;
    return {
      id: "ghost",
      symbol: editor.placeSymbol,
      tag: "",
      label: "",
      pos: clampToArea(snapVec(pointer)),
      rot: 0,
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
  /** Rails and busbars on a live conductor, drawn red like live wires. */
  const liveRails = $derived.by(() => {
    if (!sim || !simLive) return [];
    const out: { x1: number; y1: number; x2: number; y2: number; bar: boolean }[] = [];
    for (const el of page.elements) {
      if (el.symbol !== "rail" && el.symbol !== "busbar") continue;
      const c = editor.project.conductors.find((x) => x.terminals.some(([id]) => id === el.id));
      if (!c || !simLive.has(c.id)) continue;
      const len = Number(el.params.length) || 0;
      const v = el.rot === 90 ? [0, 1] : el.rot === 180 ? [-1, 0] : el.rot === 270 ? [0, -1] : [1, 0];
      out.push({ x1: el.pos[0], y1: el.pos[1], x2: el.pos[0] + v[0]! * len, y2: el.pos[1] + v[1]! * len, bar: el.symbol === "busbar" });
    }
    return out;
  });
  function lampColour(c: unknown): string {
    // White and clear lamps glow a warm white, so they show on white paper.
    return { Gn: "#3cc85a", Rd: "#ff4a4a", Wh: "#ffe9a8", Cl: "#fff1c2", Bu: "#4a8cff", Ye: "#ffd21f" }[String(c)] ?? "#ffd21f";
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
    if (e.code === "Space" && !isTyping(e.target)) {
      spaceDown = true;
      e.preventDefault();
    }
  }}
  onkeyup={(e) => {
    if (e.code === "Space") spaceDown = false;
  }}
/>

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
    {gaPreview}
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
            {#if editor.selection.length === 1 && it.kind !== "note"}
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
      {#if gaNew}
        <rect class="band" x={gaNew.x} y={gaNew.y} width={Math.max(0.2, gaNew.w)} height={Math.max(0.2, gaNew.h)} />
      {/if}
      {#if editor.gaPlace && pointer && ga}
        {@const pl = editor.gaPlace}
        {@const mm = sheetToGa(ga, pointer)}
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
          {#if g && el.symbol !== "rail" && el.symbol !== "busbar"}
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

<style>
  .canvas {
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
    fill: #d8dcdf;
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
