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
    updateElement,
    updateSection,
    wire,
    type WireEnd,
  } from "../../core/ops";
  import { localGeometry, defaultParams, type Geometry } from "../../core/symbols";
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
      if (el.symbol === "junction") continue;
      const g = geoms.get(el.id);
      if (g && pointInRect([pt[0] - el.pos[0], pt[1] - el.pos[1]], g.bbox, 0.5)) return el;
    }
    return null;
  }

  function hitWire(pt: Vec, tolerance = 0.6): { seg: Segment; leg: number } | null {
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
      // Simulate: clicking an input operates it; nothing is edited.
      const hit = hitElement(pt);
      if (hit && sim.isInput(hit.id)) sim.operate(hit.id);
      else gesture = { kind: "pan", client: [e.clientX, e.clientY], start: { x: view.x, y: view.y } };
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
    if (!hit && !wireHit && page.boundaryY !== null && Math.abs(pt[1] - page.boundaryY) < 0.6) {
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
    } else if (g.kind === "secmove" || g.kind === "secsize") {
      g.delta = snapVec([pointer[0] - g.start[0], pointer[1] - g.start[1]]);
    } else if (g.kind === "table") {
      // Half-unit steps: the table is text, it doesn't need to sit on the grid.
      g.delta = [Math.round((pointer[0] - g.start[0]) * 2) / 2, Math.round((pointer[1] - g.start[1]) * 2) / 2];
    } else if (g.kind === "boundary") {
      g.y = Math.round(Math.max(0, Math.min(AREA_UNITS.h, pointer[1])));
    }
  }

  function onPointerUp() {
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
          if (el.symbol === "junction") return false;
          const gm = geoms.get(el.id);
          return gm && rectsIntersect(r, offsetRect(gm.bbox, el.pos));
        })
        .map((el) => el.id);
      // Wires are boxed only when they lie wholly inside.
      const hitSegs = page.segments.filter((s) => routeOf(page, s).every((p) => pointInRect(p, r))).map((s) => s.id);
      const hits = [...hitEls, ...hitSegs];
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

  function onDblClick(e: MouseEvent) {
    if (sim || editor.tool !== "select") return;
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
    if (hitTable(pointer)) return "move";
    const s = hitSection(pointer);
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
  function lampColour(c: unknown): string {
    return { Gn: "#3cc85a", Rd: "#ff4a4a", Wh: "#e8e8e8", Cl: "#f4f4f4", Bu: "#4a8cff", Ye: "#ffe04a" }[String(c)] ?? "#ffe04a";
  }

  const cursorClass = $derived(
    gesture?.kind === "pan" || spaceDown
      ? "grab"
      : editor.tool !== "select"
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
  >
    {#snippet under()}
      {#if sim}
        {#each page.elements as el (el.id)}
          {@const g = geoms.get(el.id)}
          {#if g}
            {@const lit = !!sim.state.energised[el.id] || !!sim.state.lamps[el.id]}
            {#if lit}
              <rect
                class="sim-on"
                style:fill={el.symbol === "lamp" ? lampColour(el.params.colour) : undefined}
                x={el.pos[0] + g.body.x - 0.5}
                y={el.pos[1] + g.body.y - 0.5}
                width={g.body.w + 1}
                height={g.body.h + 1}
              />
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
      {#each page.segments as seg (seg.id)}
        {#if selected.has(seg.id)}
          {@const pts = previewRoutes?.get(seg.id) ?? routeOf(page, seg)}
          <polyline class="sel-wire" points={pts.map((p) => p.join(",")).join(" ")} />
        {/if}
      {/each}
    {/snippet}
    {#snippet over()}
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
    fill: rgba(60, 200, 90, 0.55);
    stroke: none;
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
