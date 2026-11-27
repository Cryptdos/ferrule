/**
 * MCP tools (DESIGN.md §12). Each tool loads a project, calls the same core
 * operations as the UI, re-routes wires, saves, and reports back. Pages are
 * named by sheet number; elements and wires by id (get_page lists them).
 */
import { syncGaStrips } from "../core/ga";
import type { Avoid } from "libavoid-js";
import { checkProject } from "../core/checks";
import { proveInterlocks } from "../core/interlocks";
import { refreshConductors } from "../core/conductors";
import { resolveFields } from "../core/fields";
import { AREA_UNITS, columnOf, type Vec } from "../core/geometry";
import type { Element, Page, ParamValue, Project } from "../core/model";
import * as op from "../core/ops";
import { renumber } from "../core/renumber";
import { routePage } from "../core/routing";
import { billOfMaterials, cableSchedule, ioSchedule, plantPointsSchedule, terminalSchedule, pointsSchedule } from "../core/schedules";
import { listSymbols, localGeometry } from "../core/symbols";
import { displayTag, elementTexts } from "../core/tags";
import { saveSectionTemplate, saveSheetTemplate, stampTemplate, type PlantMapping } from "../core/templates";
import { contactTable, isMaster, masterOf, partnerOf } from "../core/xref";
import { advance, compile, describeAction, initialState, judge, press, search, toggle, type Action, type Circuit, type SimState } from "../core/sim";
import { describeExpectation, findThing, parseQuickEntry, pointRef, things } from "../core/points";
import { POINT_FORMS, type Condition, type Controller, type IoPoint, type ModuleType, type PinInfo, type PlantItem, type PointForm } from "../core/model";
import { addModuleFromDevice, placeModulesOnGa, saveModuleDevice, addController, addModule, addSpareSlot, deleteController, generateModule, moveSlot, removeSlot, updateController, updateModule } from "../core/controllers";
import { MODULE_TYPES, modulesOf, controllerById, controllerTag, defaultPattern, moduleTypeName, pointLabel, slotAddress, viewsOf, type ModulePattern } from "../core/modules";
import type { Library, Storage } from "./storage";

export interface ToolContext {
  storage: Storage;
  library?: Library;
  avoid: () => Promise<Avoid | null>;
  /** Render a PDF of the project; returns where it was saved. */
  exportPdf?: (projectId: string) => Promise<string>;
  /** PNG of one sheet, for Claude to look at. */
  viewPage?: (projectId: string, pageNumber: number) => Promise<Uint8Array>;
}

export type Content = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };

export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run(args: Record<string, unknown>, ctx: ToolContext): Promise<Content[] | string | object>;
}

// ---------------------------------------------------------------------------
// Argument helpers

class ArgError extends Error {}

const str = (a: Record<string, unknown>, k: string, required = true): string => {
  const v = a[k];
  if (typeof v === "string" && v) return v;
  if (required) throw new ArgError(`"${k}" is required`);
  return "";
};
const num = (a: Record<string, unknown>, k: string, fallback?: number): number => {
  const v = a[k];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (fallback !== undefined) return fallback;
  throw new ArgError(`"${k}" must be a number`);
};
const strs = (a: Record<string, unknown>, k: string): string[] => {
  const v = a[k];
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string") return [v];
  throw new ArgError(`"${k}" must be a list`);
};

function pageByNumber(p: Project, n: unknown): Page {
  const page = p.pages[(typeof n === "number" ? n : Number(n)) - 1];
  if (!page) throw new ArgError(`No sheet ${String(n)} (the project has ${p.pages.length})`);
  return page;
}

function pageOfElement(p: Project, id: string): Page {
  const page = p.pages.find((pg) => pg.elements.some((e) => e.id === id) || pg.segments.some((s) => s.id === id));
  if (!page) throw new ArgError(`No element or wire "${id}"`);
  return page;
}

/** Conditions given as [{thing: "K3-12", on: true}] or [{ref, on}]: things by tag, points as "SF-01 Running". */
function conditionsArg(p: Project, v: unknown): Condition[] {
  const list = things(p);
  return (Array.isArray(v) ? v : []).map((raw) => {
    const o = (raw ?? {}) as Record<string, unknown>;
    const name = String(o.thing ?? o.ref ?? "");
    const t = findThing(p, name, list);
    if (!t) throw new ArgError(`Nothing called "${name}": name a coil, contact, lamp or switch by tag, or a point as "<plant tag> <point>"`);
    return { ref: t.ref, on: o.on !== false };
  });
}

/** Points given to add_plant: [{name, form, pins, follows?, join?, delay?, dists?}]. */
function pointsArg(p: Project, v: unknown, own?: { id: string; points: IoPoint[] }): IoPoint[] {
  const forms = new Set(POINT_FORMS.map((f) => f.value));
  return (Array.isArray(v) ? v : []).map((raw) => {
    const o = (raw ?? {}) as Record<string, unknown>;
    const form = String(o.form ?? "contact") as PointForm;
    if (!forms.has(form)) throw new ArgError(`Point form must be one of ${[...forms].join(", ")}`);
    const pt: IoPoint = { name: String(o.name ?? ""), form, pins: Array.isArray(o.pins) ? o.pins.map(String) : [] };
    if (typeof o.label === "string" && o.label.trim()) pt.label = o.label.trim();
    if (Array.isArray(o.follows) && o.follows.length) {
      // A point of the same device can be named by its name alone.
      const list = (o.follows as Record<string, unknown>[]).map((f) => {
        const name = String(f.thing ?? f.ref ?? "");
        if (own && !name.includes(" ") && !name.startsWith("plant:")) {
          const mine = (Array.isArray(v) ? v : []).some((x) => (x as Record<string, unknown>)?.name === name) || own.points.some((x) => x.name === name);
          if (mine) return { ref: pointRef(own.id, name), on: f.on !== false };
        }
        return conditionsArg(p, [f])[0]!;
      });
      pt.follows = list;
      if (o.join === "or") pt.join = "or";
      if (typeof o.delay === "number") pt.delay = o.delay;
    }
    if (o.dists && typeof o.dists === "object") {
      const d: Record<string, string> = {};
      for (const [pin, name] of Object.entries(o.dists as Record<string, unknown>)) {
        const dist = p.distributions.find((x) => x.id === name || x.name === name);
        if (!dist) throw new ArgError(`No distribution "${String(name)}"`);
        d[pin] = dist.id;
      }
      pt.dists = d;
    }
    return pt;
  });
}

/** Expectations broken just now, in words (for simulate's report). */
function brokenNow(c: Circuit, s: SimState, p: Project, list: ReturnType<typeof things>): { broken?: string[] } {
  const bad = p.expectations.filter((e) => judge(c, s, e) === "bad").map((e) => describeExpectation(p, e, list));
  return bad.length ? { broken: bad } : {};
}

function plantByRef(p: Project, ref: string) {
  const item = p.plant.find((x) => x.id === ref) ?? p.plant.find((x) => x.tag === ref);
  if (!item) throw new ArgError(`No plant item "${ref}"`);
  return item;
}

// ---------------------------------------------------------------------------
// Descriptions returned to Claude

function describeElement(p: Project, page: Page, el: Element) {
  const g = localGeometry(el, elementTexts(el, p));
  const master = masterOf(p, el);
  const partner = partnerOf(p, el);
  return {
    id: el.id,
    symbol: el.symbol,
    tag: displayTag(el, p),
    label: resolveFields(el.label, p) || undefined,
    pos: el.pos,
    column: columnOf(el.pos[0]),
    rot: el.rot || undefined,
    zone: page.boundaryY !== null ? el.zone : undefined,
    params: Object.keys(el.params).length ? el.params : undefined,
    terminals:
      g.terminals.length > 12
        ? `${g.terminals.length} taps (0–${g.terminals.length - 1}) along its length`
        : g.terminals.map((t) => ({ name: t.name, at: [el.pos[0] + t.at[0], el.pos[1] + t.at[1]] })),
    coil: master ? master.el.id : undefined,
    contacts: el.links.length && !master && !partner ? contactTable(p, el) : undefined,
    pairedWith: partner ? partner.el.id : undefined,
  };
}

function describePage(p: Project, page: Page) {
  const wireNo = new Map(p.conductors.map((c) => [c.id, c.number]));
  const cond = new Map(p.conductors.map((c) => [c.id, c]));
  const name = (ref: [string, string]) => {
    const el = page.elements.find((e) => e.id === ref[0]);
    return el ? `${displayTag(el, p) || el.symbol}:${ref[1]}` : ref.join(":");
  };
  return {
    sheet: page.number,
    title: resolveFields(page.title, p),
    boundaryY: page.boundaryY,
    sections: page.sections.map((s) => ({ id: s.id, label: resolveFields(s.label, p), rect: s.rect })),
    elements: page.elements.filter((e) => e.symbol !== "junction").map((e) => describeElement(p, page, e)),
    junctions: page.elements.filter((e) => e.symbol === "junction").map((e) => ({ id: e.id, pos: e.pos })),
    wires: page.segments.map((s) => ({
      id: s.id,
      from: s.from,
      to: s.to,
      between: `${name(s.from)} → ${name(s.to)}`,
      number: wireNo.get(s.conductor) || undefined,
      colour: cond.get(s.conductor)?.colour,
      function: cond.get(s.conductor)?.function,
      route: s.route === "manual" ? "manual" : undefined,
    })),
  };
}

function projectInfo(p: Project) {
  return {
    id: p.id,
    details: p.project,
    sheets: p.pages.map((pg) => ({
      sheet: pg.number,
      title: resolveFields(pg.title, p),
      elements: pg.elements.length,
      wires: pg.segments.length,
    })),
    plant: p.plant.filter((x) => !x.module).map((x) => ({ id: x.id, tag: x.tag, description: x.description, terminals: x.terminals })),
    controllers: (p.controllers ?? []).map((c) => describeController(p, c)),
    templates: p.templates.map((t) => ({ id: t.id, name: t.name, kind: t.kind, plant: t.plant.map((x) => x.tag) })),
    revisions: p.revisions.map((r) => ({ rev: r.rev, date: r.date, drawnBy: r.drawnBy, description: r.description })),
  };
}

/** A controller and its rail: each slot's address, and each module's tag, type, points and where it's drawn. */
function describeController(p: Project, c: Controller) {
  return {
    id: c.id,
    tag: controllerTag(p, c),
    description: c.description,
    prefix: c.prefix,
    slots: c.slots.map((s, i) => {
      const item = s.module ? p.plant.find((x) => x.id === s.module) : undefined;
      if (!item?.module) return { slot: i, address: slotAddress(p, c, i), spare: true };
      return {
        slot: i,
        address: slotAddress(p, c, i),
        module: item.id,
        tag: item.tag || `${item.prefix || "A"}?`,
        type: moduleTypeName(item.module),
        maker: item.module.maker,
        model: item.module.model,
        drawn: viewsOf(p, item.id).map((v) => v.address),
        points: (item.points ?? []).map((pt) => ({
          name: pt.name,
          ref: pointLabel(p, item, pt),
          form: pt.form,
          pins: pt.pins.map((t) => (item.pins?.[t]?.id ? `${t} (${item.pins[t]!.id})` : t)),
          ...(pt.label ? { label: pt.label } : {}),
        })),
      };
    }),
  };
}

function controllerByRef(p: Project, ref: string): Controller {
  const list = p.controllers ?? [];
  const c = list.find((x) => x.id === ref) ?? list.find((x) => controllerTag(p, x) === ref) ?? list.find((x) => x.description === ref);
  if (!c) throw new ArgError(`No controller "${ref}"`);
  return c;
}

function patternArg(type: ModuleType, channels: number | undefined, v: unknown): ModulePattern {
  const base = defaultPattern(type, channels ?? 8);
  if (!v || typeof v !== "object") return base;
  const o = v as Record<string, unknown>;
  const n = (k: string) => (typeof o[k] === "number" ? (o[k] as number) : undefined);
  const forms = new Set(POINT_FORMS.map((f) => f.value));
  if (o.form !== undefined && !forms.has(o.form as PointForm)) throw new ArgError(`Pattern form must be one of ${[...forms].join(", ")}`);
  return {
    ...base,
    ...(n("channels") !== undefined ? { channels: n("channels")! } : {}),
    ...(typeof o.ids === "string" ? { ids: o.ids } : {}),
    ...(n("first") !== undefined ? { first: n("first")! } : {}),
    ...(typeof o.group === "string" ? { group: o.group } : {}),
    ...(n("start") !== undefined ? { start: n("start")! } : {}),
    ...(typeof o.shared === "string" ? { shared: o.shared } : {}),
    ...(n("shareBy") !== undefined ? { shareBy: n("shareBy")! } : {}),
    ...(o.form !== undefined ? { form: o.form as PointForm } : {}),
  };
}

/** Edit a project: run the change, re-route the sheets it touched, save. */
async function edit<T>(ctx: ToolContext, projectId: string, fn: (p: Project) => T): Promise<T> {
  const avoid = await ctx.avoid();
  return ctx.storage.edit(projectId, (p) => {
    const before = new Map(p.pages.map((pg) => [pg.id, JSON.stringify([pg.elements, pg.segments])]));
    const out = fn(p);
    for (const pg of p.pages) {
      if (before.get(pg.id) !== JSON.stringify([pg.elements, pg.segments])) routePage(avoid, pg);
    }
    refreshConductors(p);
    // Placed terminal strips follow the schematic.
    syncGaStrips(p);
    return out;
  });
}

// ---------------------------------------------------------------------------
// Schemas

const project = { type: "string", description: "Project id (see list_projects)" };
const sheet = { type: "integer", description: "Sheet number, 1-based" };
const xy = {
  x: { type: "number", description: `Grid units across, 0–${AREA_UNITS.w} (2 units per column; column = floor(x/2)+1)` },
  y: { type: "number", description: `Grid units down, 0–${AREA_UNITS.h}` },
};
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

export const TOOLS: Tool[] = [
  {
    name: "list_projects",
    description: "List the projects in Ferrule's projects folder.",
    inputSchema: obj({}),
    run: async (_a, ctx) => ctx.storage.list(),
  },
  {
    name: "create_project",
    description: "Create a new project with one empty sheet. Returns its id.",
    inputSchema: obj({ title: { type: "string" } }, ["title"]),
    run: async (a, ctx) => {
      const p = await ctx.storage.create(str(a, "title"));
      return { id: p.id };
    },
  },
  {
    name: "project_info",
    description: "Title block details, sheets, plant, templates and revisions of a project.",
    inputSchema: obj({ project }, ["project"]),
    run: async (a, ctx) => projectInfo(await ctx.storage.load(str(a, "project"))),
  },
  {
    name: "update_project_info",
    description:
      "Set title block fields: title, panelName, client, jobNo, drawingNo, drawnBy, drawnDate, checkedBy, checkedDate.",
    inputSchema: obj(
      {
        project,
        fields: { type: "object", additionalProperties: { type: "string" } },
      },
      ["project"],
    ),
    run: async (a, ctx) =>
      edit(ctx, str(a, "project"), (p) => {
        if (a.fields && typeof a.fields === "object") op.updateProjectInfo(p, a.fields as Record<string, string>);
        return projectInfo(p).details;
      }),
  },
  {
    name: "list_symbols",
    description:
      "The symbol library: ids, settings (params) and terminal names. Symbols are drawn vertical by default (current flows top to bottom); rot 90/180/270 turns them clockwise, except parts that sit in a drop (contacts, coils, switches, protection, lamps, transformer, motor, connector block), which don't turn.",
    inputSchema: obj({}),
    run: async () =>
      listSymbols()
        .filter((s) => s.id !== "junction")
        .map((s) => {
          const el: Element = {
            id: "x",
            symbol: s.id,
            tag: "",
            label: "",
            pos: [0, 0],
            rot: 0,
            zone: "internal",
            params: Object.fromEntries(s.params.map((p) => [p.key, p.default])),
            links: [],
          };
          const terms =
            s.id === "plant-view"
              ? "the plant's ticked terminals, along the top"
              : s.id === "busbar" || s.id === "rail"
                ? "taps '0'…'length' along it"
                : localGeometry(el, "").terminals.map((t) => `${t.name}@${t.at.join(",")}`);
          return {
            id: s.id,
            name: s.name,
            group: s.group,
            params: s.params.map((p) => ({
              key: p.key,
              type: p.type,
              default: p.default,
              options: p.options?.map((o) => o.value),
              min: p.min,
              max: p.max,
            })),
            terminals: terms,
          };
        }),
  },
  {
    name: "get_page",
    description: "Everything on a sheet: elements (with terminal positions), wires, sections and the panel boundary.",
    inputSchema: obj({ project, sheet }, ["project", "sheet"]),
    run: async (a, ctx) => {
      const p = await ctx.storage.load(str(a, "project"));
      return describePage(p, pageByNumber(p, a.sheet));
    },
  },
  {
    name: "view_page",
    description: "A picture of a sheet as it prints, to check layout. Needs Edge or Chrome on this machine.",
    inputSchema: obj({ project, sheet }, ["project", "sheet"]),
    run: async (a, ctx) => {
      if (!ctx.viewPage) throw new ArgError("Viewing pages isn't available here");
      const p = await ctx.storage.load(str(a, "project"));
      const page = pageByNumber(p, a.sheet);
      const png = await ctx.viewPage(p.id, page.number);
      return [
        { type: "image", data: Buffer.from(png).toString("base64"), mimeType: "image/png" },
        { type: "text", text: `Sheet ${page.number} of ${p.pages.length}: ${resolveFields(page.title, p)}` },
      ];
    },
  },
  {
    name: "add_page",
    description:
      "Add a sheet (after a given sheet, or at the end). Optionally with a panel boundary at height boundaryY. spare: true makes a spare sheet, for annotations only (notes, revision list, symbol legend).",
    inputSchema: obj({ project, title: { type: "string" }, after: sheet, boundaryY: { type: "number" }, spare: { type: "boolean" } }, ["project"]),
    run: async (a, ctx) =>
      edit(ctx, str(a, "project"), (p) => {
        const after = a.after !== undefined ? pageByNumber(p, a.after).id : undefined;
        const page = a.spare === true ? op.addSparePage(p, after) : op.addPage(p, str(a, "title", false), after);
        if (a.spare === true && typeof a.title === "string" && a.title.trim()) op.renamePage(p, page.id, a.title);
        if (typeof a.boundaryY === "number") op.setBoundary(p, page.id, a.boundaryY);
        return { sheet: page.number };
      }),
  },
  {
    name: "update_page",
    description:
      "Rename a sheet, move it, set/remove its panel boundary (boundaryY: null removes it), mark it spare (annotations only), or set its type (schematic, spare, or ga: an empty sheet becomes a GA backplate).",
    inputSchema: obj(
      { project, sheet, title: { type: "string" }, moveTo: sheet, boundaryY: { type: ["number", "null"] }, spare: { type: "boolean" }, type: { type: "string", enum: ["schematic", "spare", "ga"] } },
      ["project", "sheet"],
    ),
    run: async (a, ctx) =>
      edit(ctx, str(a, "project"), (p) => {
        const page = pageByNumber(p, a.sheet);
        if (typeof a.title === "string") op.renamePage(p, page.id, a.title);
        if ("boundaryY" in a) op.setBoundary(p, page.id, typeof a.boundaryY === "number" ? a.boundaryY : null);
        if (typeof a.moveTo === "number") op.movePage(p, page.id, a.moveTo - 1);
        if (typeof a.spare === "boolean") op.setPageSpare(p, page.id, a.spare);
        if (a.type === "schematic" || a.type === "spare" || a.type === "ga") op.setPageType(p, page.id, a.type);
        return { sheet: page.number, title: page.title, boundaryY: page.boundaryY };
      }),
  },
  {
    name: "delete_page",
    description: "Delete a sheet and everything on it.",
    inputSchema: obj({ project, sheet }, ["project", "sheet"]),
    run: async (a, ctx) =>
      edit(ctx, str(a, "project"), (p) => {
        op.deletePage(p, pageByNumber(p, a.sheet).id);
        return { sheets: p.pages.length };
      }),
  },
  {
    name: "add_element",
    description:
      "Place a symbol on a sheet. Leave tag empty: renumber generates it. Returns its id and terminal positions. Labels may contain fields like {plant:SF-01.tag}.",
    inputSchema: obj(
      {
        project,
        sheet,
        symbol: { type: "string", description: "Symbol id from list_symbols" },
        ...xy,
        rot: { type: "integer", enum: [0, 90, 180, 270] },
        label: { type: "string" },
        tag: { type: "string" },
        params: { type: "object", additionalProperties: { type: ["string", "number", "boolean"] } },
      },
      ["project", "sheet", "symbol", "x", "y"],
    ),
    run: async (a, ctx) =>
      edit(ctx, str(a, "project"), (p) => {
        const page = pageByNumber(p, a.sheet);
        const el = op.addElement(p, page.id, str(a, "symbol"), [num(a, "x"), num(a, "y")], {
          rot: [0, 90, 180, 270].includes(a.rot as number) ? (a.rot as 0) : 0,
          label: str(a, "label", false),
          tag: str(a, "tag", false),
          params: (a.params as Record<string, ParamValue>) ?? {},
        });
        return describeElement(p, page, el);
      }),
  },
  {
    name: "update_element",
    description:
      "Change an element's label, tag, rotation or settings (params). Set params.locked true to keep its tag on renumber.",
    inputSchema: obj(
      {
        project,
        id: { type: "string" },
        label: { type: "string" },
        tag: { type: "string" },
        rot: { type: "integer", enum: [0, 90, 180, 270] },
        params: { type: "object", additionalProperties: { type: ["string", "number", "boolean"] } },
      },
      ["project", "id"],
    ),
    run: async (a, ctx) =>
      edit(ctx, str(a, "project"), (p) => {
        const id = str(a, "id");
        const page = pageOfElement(p, id);
        op.updateElement(p, page.id, id, {
          label: typeof a.label === "string" ? a.label : undefined,
          tag: typeof a.tag === "string" ? a.tag : undefined,
          rot: [0, 90, 180, 270].includes(a.rot as number) ? (a.rot as 0) : undefined,
          params: (a.params as Record<string, ParamValue>) ?? undefined,
        });
        return describeElement(p, page, page.elements.find((e) => e.id === id)!);
      }),
  },
  {
    name: "move_element",
    description: "Move elements: either by dx/dy, or one element to x/y. Wires follow.",
    inputSchema: obj(
      {
        project,
        ids: { type: "array", items: { type: "string" } },
        dx: { type: "number" },
        dy: { type: "number" },
        ...xy,
      },
      ["project", "ids"],
    ),
    run: async (a, ctx) =>
      edit(ctx, str(a, "project"), (p) => {
        const ids = strs(a, "ids");
        const page = pageOfElement(p, ids[0]!);
        let d: Vec = [num(a, "dx", 0), num(a, "dy", 0)];
        if (typeof a.x === "number" && typeof a.y === "number") {
          const el = page.elements.find((e) => e.id === ids[0])!;
          d = [a.x - el.pos[0], a.y - el.pos[1]];
        }
        op.moveElements(p, page.id, ids, d);
        return ids.map((id) => ({ id, pos: page.elements.find((e) => e.id === id)?.pos }));
      }),
  },
  {
    name: "delete_element",
    description: "Delete elements (and their wires), wires, or section boxes, by id.",
    inputSchema: obj({ project, ids: { type: "array", items: { type: "string" } } }, ["project", "ids"]),
    run: async (a, ctx) =>
      edit(ctx, str(a, "project"), (p) => {
        const ids = strs(a, "ids");
        for (const pg of p.pages) {
          const els = pg.elements.filter((e) => ids.includes(e.id)).map((e) => e.id);
          const segs = pg.segments.filter((s) => ids.includes(s.id)).map((s) => s.id);
          const secs = pg.sections.filter((s) => ids.includes(s.id)).map((s) => s.id);
          if (secs.length) op.deleteSections(p, pg.id, secs);
          if (segs.length) op.deleteSegments(p, pg.id, segs);
          if (els.length) op.deleteElements(p, pg.id, els);
        }
        return { deleted: ids.length };
      }),
  },
  {
    name: "connect",
    description:
      "Wire two ends together on a sheet. Each end is {element, terminal} (distribution blocks and control rails: terminal is the tap offset along the bar, e.g. '30') or {wire, x, y} to tee into an existing wire at that grid point. Routing is automatic.",
    inputSchema: obj(
      {
        project,
        sheet,
        from: { type: "object", description: "{element, terminal} or {wire, x, y}" },
        to: { type: "object", description: "{element, terminal} or {wire, x, y}" },
      },
      ["project", "sheet", "from", "to"],
    ),
    run: async (a, ctx) =>
      edit(ctx, str(a, "project"), (p) => {
        const page = pageByNumber(p, a.sheet);
        const end = (v: unknown): op.WireEnd => {
          const o = (v ?? {}) as Record<string, unknown>;
          if (typeof o.element === "string") return { terminal: [o.element, String(o.terminal ?? "")] };
          if (typeof o.wire === "string") return { wire: o.wire, at: [num(o, "x"), num(o, "y")] };
          throw new ArgError("Each end needs {element, terminal} or {wire, x, y}");
        };
        const seg = op.wire(p, page.id, end(a.from), end(a.to));
        return { wire: seg.id, conductor: seg.conductor };
      }),
  },
  {
    name: "disconnect",
    description: "Remove wires by id.",
    inputSchema: obj({ project, wires: { type: "array", items: { type: "string" } } }, ["project", "wires"]),
    run: async (a, ctx) =>
      edit(ctx, str(a, "project"), (p) => {
        const ids = strs(a, "wires");
        for (const pg of p.pages) {
          const mine = pg.segments.filter((s) => ids.includes(s.id)).map((s) => s.id);
          if (mine.length) op.deleteSegments(p, pg.id, mine);
        }
        return { removed: ids.length };
      }),
  },
  {
    name: "link",
    description:
      "Link a contact (NO/NC/changeover/timer contact, or contactor main contacts) to the coil that drives it, or pair two off-page arrows. coil/other null unlinks.",
    inputSchema: obj(
      {
        project,
        contact: { type: "string" },
        coil: { type: ["string", "null"] },
        arrow: { type: "string" },
        other: { type: ["string", "null"] },
      },
      ["project"],
    ),
    run: async (a, ctx) =>
      edit(ctx, str(a, "project"), (p) => {
        if (typeof a.contact === "string") op.linkContact(p, a.contact, typeof a.coil === "string" ? a.coil : null);
        else if (typeof a.arrow === "string") op.linkOffpage(p, a.arrow, typeof a.other === "string" ? a.other : null);
        else throw new ArgError("Give contact (+ coil) or arrow (+ other)");
        return { ok: true };
      }),
  },
  {
    name: "add_plant",
    description:
      "Define a plant item (field equipment) with all its terminals, or update one (give its tag or id as 'plant').",
    inputSchema: obj(
      {
        project,
        plant: { type: "string", description: "Existing plant tag or id, to update" },
        tag: { type: "string", description: "Fixed tag (locked). Leave out to let Renumber tag it as prefix + sheet-column of its first view, e.g. SEF-3-13" },
        prefix: { type: "string", description: "Tag prefix, e.g. SEF for a safety extract fan (default U)" },
        description: { type: "string" },
        terminals: { type: "array", items: { type: "string" } },
        powerByOthers: { type: "boolean", description: "Draw the 'power by others' break on the left of its views" },
        quick: {
          type: "string",
          description:
            "Pins and points in one line, as in the Plant window: 'Mains: L N E | Run: 1 2 | Running: C NO NC'. Forms are guessed (C/NO/NC a contact, L/N a supply in, ENABLE/START/RUN a powered input); set them with points. Replaces terminals",
        },
        points: {
          type: "array",
          items: { type: "object" },
          description:
            "Its signals (controller.md §3), replacing any it had: [{name, form, pins, follows?, join?, delay?, dists?}]. form: contact, powered-out, dry-in, powered-in, analogue-in, analogue-out, supply-in, supply-out, comms. An output (contact, powered-out, supply-out) is clicked in simulation unless it follows up to two conditions [{thing, on}] (thing: a coil/contact/lamp/switch tag, '<plant tag> <point>', or one of this device's own point names), joined by join 'and'/'or', after delay seconds. A supply out's dists maps pin → distribution name, e.g. {'+V': '24V DC'}",
        },
        pins: { type: "object", description: "Pin labels beyond the number, by pin: {'61': {id: 'C', group: 'R1'}}" },
        info: { type: "string", description: "More lines under the box: model, rating, supply…" },
      },
      ["project"],
    ),
    run: async (a, ctx) =>
      edit(ctx, str(a, "project"), (p) => {
        const quick = typeof a.quick === "string" ? parseQuickEntry(a.quick) : undefined;
        const terminals = quick?.terminals ?? (Array.isArray(a.terminals) ? a.terminals.map(String) : undefined);
        const pins = a.pins && typeof a.pins === "object" ? (a.pins as Record<string, PinInfo>) : undefined;
        const info = typeof a.info === "string" ? a.info : undefined;
        const prefix = typeof a.prefix === "string" ? a.prefix : undefined;
        const powerByOthers = typeof a.powerByOthers === "boolean" ? a.powerByOthers : undefined;
        if (typeof a.plant === "string") {
          const item = plantByRef(p, a.plant);
          const points = Array.isArray(a.points) ? pointsArg(p, a.points, { id: item.id, points: item.points ?? [] }) : quick?.points;
          op.updatePlant(p, item.id, {
            tag: typeof a.tag === "string" ? a.tag : undefined,
            description: typeof a.description === "string" ? a.description : undefined,
            terminals,
            points,
            pins,
            info,
            prefix,
            powerByOthers,
          });
          return item;
        }
        const item = op.addPlant(p, typeof a.tag === "string" ? a.tag : "", str(a, "description", false), terminals ?? [], {
          points: quick?.points,
          pins,
          info,
          prefix,
          powerByOthers,
        });
        if (Array.isArray(a.points)) op.updatePlant(p, item.id, { points: pointsArg(p, a.points, { id: item.id, points: [] }) });
        if (item.tag) item.locked = true;
        return item;
      }),
  },
  {
    name: "controller",
    description:
      "Controllers (controller.md §4): an outstation or PLC is its modules in rail order, with any spare slots. With no other arguments, lists them (each module's tag, type, points as A3-23:DI2, and where it's drawn). Give description (and prefix, default A) to add one; give 'controller' (id, tag or description) to update it, or with delete: true to remove it with its modules and views. Add modules with add_module. Draw a controller map (its modules in rail order with tag, bus address, maker, model, type and where each is drawn) with add_element symbol 'ctrlmap', params {ctrl: <controller id>}. place_controller lays its modules out on a GA sheet.",
    inputSchema: obj(
      {
        project,
        controller: { type: "string", description: "Existing controller: id, tag (its host module's, e.g. A2-5) or description" },
        description: { type: "string", description: "e.g. AHU-1 outstation" },
        prefix: { type: "string", description: "Letters its modules' tags start with (default A)" },
        delete: { type: "boolean" },
      },
      ["project"],
    ),
    run: async (a, ctx) =>
      edit(ctx, str(a, "project"), (p) => {
        const s = (k: string) => (typeof a[k] === "string" ? (a[k] as string) : undefined);
        if (typeof a.controller === "string") {
          const c = controllerByRef(p, a.controller);
          if (a.delete === true) {
            deleteController(p, c.id);
            return { deleted: c.id, controllers: (p.controllers ?? []).map((x) => describeController(p, x)) };
          }
          updateController(p, c.id, { description: s("description"), prefix: s("prefix") });
          return describeController(p, c);
        }
        if (s("description") !== undefined || s("prefix") !== undefined) {
          const c = addController(p, s("description") ?? "", s("prefix") ?? "A");
          return describeController(p, c);
        }
        return (p.controllers ?? []).map((x) => describeController(p, x));
      }),
  },
  {
    name: "add_module",
    description:
      "Add a module to a controller's rail, or change one (give 'module': its tag or id). type: psu, host, di, do, uio, ai, ao; channels is its count (a DI-8 is type di, channels 8). Its pins are generated from pattern {channels, ids, first, group, start, shared, shareBy, form} (default: the type's usual one): ids are each channel's pin ids in order ('VO RET CO', 'IO C', 'Y ⊥'), first the first pin number, group the name pattern ('DI#' → DI1, DI2…), start the first channel's number (for numbering across a controller), shared ids shared by shareBy channels (a common), form each channel's point form. Giving pattern to an existing module regenerates its pins (points that keep their name keep their form and label). labels sets what each point does on this job: {DI1: 'SF-01 running'}, printed along its wire. spare: true adds a spare slot instead. Fine-tune pins with add_plant (plant: the module's tag) and its pins/points. Place its views with place_plant_view, near the top of a sheet: a module view's terminals are along its bottom edge.",
    inputSchema: obj(
      {
        project,
        controller: { type: "string", description: "Controller id, tag or description (for a new module or spare slot)" },
        module: { type: "string", description: "Existing module's tag or id, to change" },
        type: { type: "string", enum: MODULE_TYPES.map((t) => t.value) },
        channels: { type: "number" },
        maker: { type: "string" },
        model: { type: "string" },
        address: { type: ["number", "null"], description: "Bus address set by hand (DIP switches); null: from rail order" },
        at: { type: "number", description: "Slot index on the rail (0 is first); a spare slot there is filled. Default: the end" },
        pattern: { type: "object", description: "How to generate its pins (see above)" },
        labels: { type: "object", description: "Point name → its job label" },
        spare: { type: "boolean", description: "Add a spare slot (Spare I/O) at 'at' instead of a module" },
        device: { type: "string", description: "Add the module from a saved model in the project's device table (its name or id): type, channels and pins as entered" },
        saveModel: { type: "boolean", description: "With module: save it as a model in the device table (pins and all), sized for the GA" },
        move: { type: "number", description: "With module: move it to this slot index" },
        delete: { type: "boolean", description: "With module: delete it and its views" },
      },
      ["project"],
    ),
    run: async (a, ctx) =>
      edit(ctx, str(a, "project"), (p) => {
        const n = (k: string) => (typeof a[k] === "number" ? (a[k] as number) : undefined);
        const s = (k: string) => (typeof a[k] === "string" ? (a[k] as string) : undefined);
        const types = new Set(MODULE_TYPES.map((t) => t.value as string));
        const type = s("type");
        if (type !== undefined && !types.has(type)) throw new ArgError(`type must be one of ${[...types].join(", ")}`);
        let item: PlantItem;
        if (typeof a.module === "string") {
          item = plantByRef(p, a.module);
          if (!item.module) throw new ArgError(`${a.module} isn't a controller's module`);
          const c = controllerById(p, item.module.controller)!;
          if (a.delete === true) {
            removeSlot(p, c.id, c.slots.findIndex((x) => x.module === item.id));
            return describeController(p, c);
          }
          updateModule(p, item.id, {
            type: type as ModuleType | undefined,
            channels: n("channels"),
            maker: s("maker"),
            model: s("model"),
            ...(a.address !== undefined ? { address: typeof a.address === "number" ? a.address : null } : {}),
          });
          if (a.pattern !== undefined) generateModule(p, item.id, patternArg(item.module.type, item.module.channels, a.pattern));
          if (n("move") !== undefined) moveSlot(p, c.id, c.slots.findIndex((x) => x.module === item.id), n("move")!);
          if (a.saveModel === true && !item.module.device) saveModuleDevice(p, item.id);
        } else {
          const c = controllerByRef(p, str(a, "controller"));
          if (a.spare === true) {
            addSpareSlot(p, c.id, n("at"));
            return describeController(p, c);
          }
          if (typeof a.device === "string") {
            const dev = p.devices?.find((d) => d.id === a.device || d.name === a.device);
            if (!dev?.module) throw new ArgError(`No controller module model "${a.device}" in the device table`);
            addModuleFromDevice(p, c.id, dev, n("at"));
            return describeController(p, c);
          }
          if (!type) throw new ArgError("Give the module's type");
          const t = type as ModuleType;
          item = addModule(p, c.id, {
            type: t,
            channels: n("channels"),
            maker: s("maker"),
            model: s("model"),
            at: n("at"),
            pattern: a.pattern !== undefined ? patternArg(t, n("channels"), a.pattern) : t === "host" ? null : undefined,
          });
          if (typeof a.address === "number") updateModule(p, item.id, { address: a.address });
        }
        if (a.labels && typeof a.labels === "object") {
          for (const [name, label] of Object.entries(a.labels as Record<string, unknown>)) {
            if (!item.points?.some((x) => x.name === name)) throw new ArgError(`${item.tag || "The module"} has no point ${name}`);
            op.updatePoint(p, item.id, name, { label: String(label ?? "") });
          }
        }
        return describeController(p, controllerById(p, item.module!.controller)!);
      }),
  },
  {
    name: "place_controller",
    description:
      "Lay a controller's modules out on a GA sheet (backplate or door back), side by side in rail order from x, y (mm from the enclosure's top-left corner: the left end and top), snapped onto a DIN rail they sit across. Each is sized by its model from the device table, else generically by type and channels. Modules already on a GA are left where they are.",
    inputSchema: obj(
      { project, sheet, controller: { type: "string", description: "Controller id, tag or description" }, x: { type: "number" }, y: { type: "number" } },
      ["project", "sheet", "controller", "x", "y"],
    ),
    run: async (a, ctx) =>
      edit(ctx, str(a, "project"), (p) => {
        const page = pageByNumber(p, a.sheet);
        const c = controllerByRef(p, str(a, "controller"));
        const placed = new Set(p.pages.flatMap((pg) => (pg.gaItems ?? []).map((it) => it.module).filter(Boolean)));
        const ids = modulesOf(p, c).filter((m) => !placed.has(m.id)).map((m) => m.id);
        if (!ids.length) throw new ArgError("All its modules are on a GA already");
        return placeModulesOnGa(p, page.id, ids, [num(a, "x"), num(a, "y")]).map((it) => ({ id: it.id, module: p.plant.find((x) => x.id === it.module)?.tag, x: it.x, y: it.y, w: it.w, h: it.h }));
      }),
  },
  {
    name: "label_wire",
    description:
      "Set what's printed along a wire's conductor: its number (locked so Renumber keeps it), core colour (IEC 60757 code, e.g. Bu, Bn, GnYe) and function (e.g. 0V, 24V AC). Empty strings clear.",
    inputSchema: obj(
      {
        project,
        wire: { type: "string", description: "Wire (segment) id from get_page" },
        number: { type: "string" },
        colour: { type: "string" },
        function: { type: "string" },
      },
      ["project", "wire"],
    ),
    run: async (a, ctx) =>
      edit(ctx, str(a, "project"), (p) => {
        const seg = p.pages.flatMap((pg) => pg.segments).find((x) => x.id === a.wire);
        if (!seg) throw new ArgError(`No wire "${String(a.wire)}"`);
        if (typeof a.number === "string") op.setConductorNumber(p, seg.conductor, a.number, true);
        op.setConductorInfo(p, seg.conductor, {
          colour: typeof a.colour === "string" ? a.colour : undefined,
          function: typeof a.function === "string" ? a.function : undefined,
        });
        const c = p.conductors.find((x) => x.id === seg.conductor)!;
        return { conductor: c.id, number: c.number, colour: c.colour, function: c.function };
      }),
  },
  {
    name: "place_plant_view",
    description:
      "Place a view of a plant item or a controller's module showing some of its terminals (default all), x, y being its first terminal. Plant's terminals are along the top of its box, 1 unit apart; a module's are along the bottom (its view goes near the top of the sheet, wires dropping from it). Split a module across views and sheets by giving each view some channels' pins.",
    inputSchema: obj(
      {
        project,
        sheet,
        plant: { type: "string", description: "Plant tag or id" },
        ...xy,
        terminals: { type: "array", items: { type: "string" } },
      },
      ["project", "sheet", "plant", "x", "y"],
    ),
    run: async (a, ctx) =>
      edit(ctx, str(a, "project"), (p) => {
        const page = pageByNumber(p, a.sheet);
        const item = plantByRef(p, str(a, "plant"));
        const el = op.placePlantView(
          p,
          page.id,
          item.id,
          [num(a, "x"), num(a, "y")],
          Array.isArray(a.terminals) ? a.terminals.map(String) : undefined,
        );
        return describeElement(p, page, el);
      }),
  },
  {
    name: "add_section",
    description:
      "Draw a labelled dashed section box. The label may contain fields, e.g. '{plant:SF-01.tag} STARTER SECTION'.",
    inputSchema: obj(
      { project, sheet, label: { type: "string" }, ...xy, w: { type: "number" }, h: { type: "number" } },
      ["project", "sheet", "label", "x", "y", "w", "h"],
    ),
    run: async (a, ctx) =>
      edit(ctx, str(a, "project"), (p) => {
        const page = pageByNumber(p, a.sheet);
        return op.addSection(p, page.id, str(a, "label", false), [num(a, "x"), num(a, "y"), num(a, "w"), num(a, "h")]);
      }),
  },
  {
    name: "save_template",
    description: "Save a whole sheet, or one section box on it (give the section id), as a template.",
    inputSchema: obj({ project, sheet, name: { type: "string" }, section: { type: "string" } }, [
      "project",
      "sheet",
      "name",
    ]),
    run: async (a, ctx) =>
      edit(ctx, str(a, "project"), (p) => {
        const page = pageByNumber(p, a.sheet);
        const t =
          typeof a.section === "string"
            ? saveSectionTemplate(p, page.id, a.section, str(a, "name"))
            : saveSheetTemplate(p, page.id, str(a, "name"));
        return { id: t.id, name: t.name, kind: t.kind, plant: t.plant.map((x) => x.tag) };
      }),
  },
  {
    name: "apply_template",
    description:
      "Stamp a template (by name or id). plant maps each template plant tag to a tag: an existing plant item, or a new one created with the template plant's terminals. Sheet templates become a new sheet (after 'after'); section templates go on 'sheet' with their top-left at x,y. Tags are cleared; run renumber after.",
    inputSchema: obj(
      {
        project,
        template: { type: "string" },
        plant: { type: "object", additionalProperties: { type: "string" }, description: 'e.g. {"SF-01": "SF-02"}' },
        title: { type: "string" },
        after: sheet,
        sheet,
        ...xy,
      },
      ["project", "template"],
    ),
    run: async (a, ctx) =>
      edit(ctx, str(a, "project"), (p) => {
        const ref = str(a, "template");
        const t = p.templates.find((x) => x.id === ref) ?? p.templates.find((x) => x.name === ref);
        if (!t) throw new ArgError(`No template "${ref}"`);
        const mapping: PlantMapping = {};
        for (const [from, to] of Object.entries((a.plant as Record<string, string>) ?? {})) {
          const src = t.plant.find((x) => x.tag === from || x.id === from);
          if (!src) throw new ArgError(`Template ${t.name} has no plant ${from}`);
          const existing = p.plant.find((x) => x.tag === to || x.id === to);
          mapping[src.id] = existing ? { plant: existing.id } : { newTag: to };
        }
        const r = stampTemplate(p, t.id, {
          plant: mapping,
          title: typeof a.title === "string" ? a.title : undefined,
          afterPageId: a.after !== undefined ? pageByNumber(p, a.after).id : undefined,
          pageId: a.sheet !== undefined ? pageByNumber(p, a.sheet).id : undefined,
          at: typeof a.x === "number" ? [a.x, num(a, "y", 0)] : undefined,
        });
        return { sheet: r.page.number, elements: r.elementIds.length };
      }),
  },
  {
    name: "renumber",
    description: "Generate all tags, terminal numbers, contact pole numbers and wire numbers. Locked ones are kept.",
    inputSchema: obj({ project }, ["project"]),
    run: async (a, ctx) => edit(ctx, str(a, "project"), (p) => renumber(p)),
  },
  {
    name: "check",
    description:
      "Rule checks: boundary crossings, loose contacts, coils without contacts, duplicate tags, unpaired arrows, unconnected terminals, plant terminals shown nowhere or twice.",
    inputSchema: obj({ project }, ["project"]),
    run: async (a, ctx) => {
      const p = await ctx.storage.load(str(a, "project"));
      // Interlocks are proved here, as Check logic would (design-v0.4 §6).
      return checkProject(p, { proofs: proveInterlocks(p) }).map((f) => ({
        level: f.level,
        message: f.message,
        ids: f.ids.length ? f.ids : undefined,
      }));
    },
  },
  {
    name: "schedules",
    description:
      "Schedules generated from the drawing: terminals, field cables, io (every controller's points: controller, module, point (with where it's drawn if on a continuation), form, pins, label, wired to), plant (plant's points and what they're wired to), bom (bill of materials from the GA sheets), or points (Design's points schedule, by system: tag, point, form, signal, type, goes to, controller, module, channel, via, wired).",
    inputSchema: obj({ project, kind: { type: "string", enum: ["terminals", "cables", "io", "plant", "bom", "points"] } }, ["project", "kind"]),
    run: async (a, ctx) => {
      const p = await ctx.storage.load(str(a, "project"));
      switch (a.kind) {
        case "cables":
          return cableSchedule(p);
        case "io":
          return ioSchedule(p);
        case "plant":
          return plantPointsSchedule(p);
        case "bom":
          return billOfMaterials(p);
        case "points":
          return pointsSchedule(p);
        default:
          return terminalSchedule(p);
      }
    },
  },
  {
    name: "simulate",
    description:
      "Run the relay logic as drawn (DESIGN.md §9, controller.md §6). Start with everything off (isolators and breakers on), apply actions in order — {toggle: id} for switches, selectors, isolators, fuses and plant outputs that are clicked (id plant:<plant id>:<point>, listed in inputs), {press: id} for push buttons, {wait: seconds} for timers — and report after each step which coils are energised, which lamps lit, which plant points on, and expectations that are broken. Supply is the Incoming supply part, transformers and plant supply out points; with none drawn, busbars on a line or DC + distribution supply and those on a neutral or DC 0 V distribution return.",
    inputSchema: obj(
      {
        project,
        actions: { type: "array", items: { type: "object" }, description: "e.g. [{\"toggle\": \"e_x\"}, {\"wait\": 10}, {\"press\": \"e_y\"}]" },
      },
      ["project"],
    ),
    run: async (a, ctx) => {
      const p = await ctx.storage.load(str(a, "project"));
      const c = compile(p);
      const tagOf = new Map<string, string>();
      for (const pg of p.pages) for (const el of pg.elements) tagOf.set(el.id, `${displayTag(el, p)}${el.label ? " " + resolveFields(el.label, p) : ""}`.trim());
      const list = things(p);
      const report = (s: SimState) => ({
        t: Math.round(s.t * 10) / 10,
        energised: Object.entries(s.energised).filter(([k, v]) => v && !c.points.has(k) && !k.endsWith(":f")).map(([k]) => tagOf.get(k) ?? k),
        lit: Object.entries(s.lamps).filter(([, v]) => v).map(([k]) => tagOf.get(k) ?? k),
        pointsOn: [...c.points.keys()].filter((k) => c.states.get(k)?.(s)).map((k) => c.names.get(k) ?? k),
        ...brokenNow(c, s, p, list),
        ...(s.short ? { short: true } : {}),
        ...(s.unstable ? { unstable: true } : {}),
      });
      let s = initialState(c);
      const steps: object[] = [{ step: "start", ...report(s) }];
      for (const raw of Array.isArray(a.actions) ? (a.actions as Record<string, unknown>[]) : []) {
        let act: Action;
        if (typeof raw.toggle === "string") act = { do: "toggle", el: raw.toggle };
        else if (typeof raw.press === "string") act = { do: "press", el: raw.press };
        else if (typeof raw.wait === "number") act = { do: "wait", seconds: raw.wait };
        else throw new ArgError("Each action is {toggle: id}, {press: id} or {wait: seconds}");
        if (act.do !== "wait" && !c.inputs.some((i) => i.el === act.el)) throw new ArgError(`${act.el} isn't something you can operate`);
        s = act.do === "wait" ? advance(c, s, act.seconds) : act.do === "press" ? press(c, s, act.el) : toggle(c, s, act.el);
        steps.push({ step: describeAction(c, act), ...report(s) });
      }
      return { inputs: c.inputs.map((i) => ({ id: i.el, kind: i.kind, name: tagOf.get(i.el) ?? c.names.get(i.el), label: i.label })), steps };
    },
  },
  {
    name: "check_logic",
    description:
      "Check the drawing's expectations (controller.md §6) exhaustively: try every sequence of operations, plant outputs clicked and waiting for timers, and report each expectation that can fail, with the shortest way there. Also reports shorts and relays that chatter. Uses the project's expectations (see set_expectation) plus any 'never' statements given here.",
    inputSchema: obj(
      {
        project,
        never: {
          type: "array",
          items: { type: "array", items: { type: "string" } },
          description: "Extra 'never' statements, each one or two things that must never be on together, by tag: [['K3-23', 'K3-56']]",
        },
        limit: { type: "integer", description: "States to explore (default 20000)" },
        includeIsolators: { type: "boolean", description: "Also try opening isolators and breakers (default false)" },
      },
      ["project"],
    ),
    run: async (a, ctx) => {
      const p = await ctx.storage.load(str(a, "project"));
      const c = compile(p);
      const list = things(p);
      const rules = [...p.expectations];
      for (const pair of (a.never as string[][]) ?? []) {
        rules.push({ id: `n${rules.length}`, kind: "never", when: conditionsArg(p, pair.map((t) => ({ thing: t }))), join: "and" });
      }
      const r = search(c, initialState(c), rules, {
        limit: typeof a.limit === "number" ? a.limit : 20000,
        includeIsolators: a.includeIsolators === true,
      });
      return {
        explored: r.states,
        complete: !r.truncated,
        expectations: rules.length,
        broken: r.violations.map((v) => ({ expectation: describeExpectation(p, v.rule, list), after: v.path.map((x) => describeAction(c, x)) })),
        faults: r.faults.map((f) => ({ fault: f.kind, after: f.path.map((x) => describeAction(c, x)) })),
      };
    },
  },
  {
    name: "set_expectation",
    description:
      "Add, replace or delete an expectation (controller.md §6). kind 'should': an input point should be on (or off, on: false) when the conditions hold, and the other way when they don't, e.g. point 'SF-01 Run' should be on when [{thing: 'K3-34', on: true}]. kind 'never': the conditions must never hold, e.g. [{thing: 'K3-23'}, {thing: 'K3-56'}] joined by 'and'. Things are named by tag (coil, contact, lamp, switch) or as '<plant tag> <point>'. Give id to replace one, or id with delete: true to remove it. With no kind, lists the expectations.",
    inputSchema: obj(
      {
        project,
        id: { type: "string" },
        delete: { type: "boolean" },
        kind: { type: "string", enum: ["should", "never"] },
        point: { type: "string", description: "'should': the input point, '<plant tag> <point>'" },
        on: { type: "boolean", description: "'should': on (default) or off when the conditions hold" },
        when: { type: "array", items: { type: "object" }, description: "One or two conditions: [{thing, on}]" },
        join: { type: "string", enum: ["and", "or"] },
        note: { type: "string" },
      },
      ["project"],
    ),
    run: async (a, ctx) => {
      const list = (p: Project) => p.expectations.map((e) => ({ id: e.id, text: describeExpectation(p, e) }));
      if (!a.kind && !a.delete) return list(await ctx.storage.load(str(a, "project")));
      return edit(ctx, str(a, "project"), (p) => {
        if (a.delete === true) {
          op.deleteExpectation(p, str(a, "id"));
          return list(p);
        }
        const point = typeof a.point === "string" ? findThing(p, a.point) : undefined;
        if (a.kind === "should" && !point) throw new ArgError(`No point "${String(a.point)}"`);
        const id = op.setExpectation(p, {
          ...(typeof a.id === "string" ? { id: a.id } : {}),
          kind: a.kind === "never" ? "never" : "should",
          point: point?.ref,
          on: a.on !== false,
          when: conditionsArg(p, a.when),
          join: a.join === "or" ? "or" : "and",
          note: typeof a.note === "string" ? a.note : undefined,
        });
        return { id, expectations: list(p) };
      });
    },
  },
  {
    name: "export_pdf",
    description: "Export every sheet as one A4 landscape PDF. Returns where the file was saved.",
    inputSchema: obj({ project }, ["project"]),
    run: async (a, ctx) => {
      if (!ctx.exportPdf) throw new ArgError("PDF export isn't available here");
      return { saved: await ctx.exportPdf(str(a, "project")) };
    },
  },
  {
    name: "add_distribution",
    description:
      "Add a distribution (a supply the project distributes: L1, N, CCT, 0V…), or update one (give its name or id as 'distribution'). Busbars, link arrows and the incoming supply pick one with params.dist (supply: params.dist_<terminal>, e.g. dist_L1); everything on the same distribution is joined on every sheet. A busbar with no distribution is local. Returns the list.",
    inputSchema: obj(
      {
        project,
        distribution: { type: "string", description: "Existing distribution name or id, to update" },
        name: { type: "string" },
        kind: { type: "string", enum: ["line", "neutral", "dc+", "dc0", "earth"] },
        voltage: { type: "string", description: "As written, e.g. 230 V or 24 V DC" },
        colour: { type: "string", description: "Core colour code, e.g. Bn, Bu, Wh" },
        function: { type: "string", description: "e.g. L, N, +24V, 0V" },
      },
      ["project"],
    ),
    run: async (a, ctx) =>
      edit(ctx, str(a, "project"), (p) => {
        const s = (k: string) => (typeof a[k] === "string" ? (a[k] as string) : undefined);
        const kind = s("kind") as "line" | "neutral" | "dc+" | "dc0" | "earth" | undefined;
        const patch = { name: s("name"), kind, voltage: s("voltage"), colour: s("colour"), function: s("function") };
        if (typeof a.distribution === "string") {
          const d = p.distributions.find((x) => x.id === a.distribution || x.name === a.distribution);
          if (!d) throw new ArgError(`No distribution "${a.distribution}"`);
          op.updateDistribution(p, d.id, patch);
        } else {
          op.addDistribution(p, { ...patch, name: str(a, "name") });
        }
        return p.distributions;
      }),
  },
];

export const INSTRUCTIONS = `Ferrule drafts control panel schematics on A4 landscape sheets.

Coordinates are grid units: x 0–${AREA_UNITS.w} across (${AREA_UNITS.w / 2} columns, 2 units each), y 0–${AREA_UNITS.h} down. Every terminal sits on a whole unit. Symbols are vertical by default (current flows top to bottom), so a ladder rung is a column of symbols between a CCT control rail (symbol 'rail') at the top and a 0V rail at the bottom, each on its distribution: wire terminal to terminal down the column. Power busbars are distribution blocks (symbol 'busbar', tagged W, placed on the GA); control rails are a drawing convention with no tag.

Typical flow: create_project or pick one from list_projects → add_distribution (CCT, 0V…) → add_element (distribution blocks and control rails with params.dist, contacts, coils, lamps, terminals) → connect → link contacts to their coils → add_plant / place_plant_view for field equipment below a panel boundary (update_page boundaryY), with terminals on the boundary → controller / add_module for an outstation or PLC, its module views placed at the top of a sheet and every one of a module's connections wired there (outputs that switch panel circuits go out through link arrows) → renumber → check → view_page to look at the result → export_pdf.

Never type tags or wire numbers: renumber generates them from position (e.g. K3-16 = sheet 3, column 16). Labels can use fields such as {plant:SF-01.tag} so they follow the plant. Use templates (save_template / apply_template) for repeated sheets such as one starter per fan.`;

export { ArgError };
