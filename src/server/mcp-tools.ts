/**
 * MCP tools (DESIGN.md §12). Each tool loads a project, calls the same core
 * operations as the UI, re-routes wires, saves, and reports back. Pages are
 * named by sheet number; elements and wires by id (get_page lists them).
 */
import type { Avoid } from "libavoid-js";
import { checkProject } from "../core/checks";
import { refreshConductors } from "../core/conductors";
import { resolveFields } from "../core/fields";
import { AREA_UNITS, columnOf, type Vec } from "../core/geometry";
import type { Element, Page, ParamValue, Project } from "../core/model";
import * as op from "../core/ops";
import { renumber } from "../core/renumber";
import { routePage } from "../core/routing";
import { cableSchedule, terminalSchedule } from "../core/schedules";
import { listSymbols, localGeometry } from "../core/symbols";
import { displayTag, elementTexts } from "../core/tags";
import { saveSectionTemplate, saveSheetTemplate, stampTemplate, type PlantMapping } from "../core/templates";
import { contactTable, isMaster, masterOf, partnerOf } from "../core/xref";
import { advance, compile, describeAction, initialState, press, search, toggle, type Action, type SimState } from "../core/sim";
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
    numbering: p.numbering.scheme,
    sheets: p.pages.map((pg) => ({
      sheet: pg.number,
      title: resolveFields(pg.title, p),
      elements: pg.elements.length,
      wires: pg.segments.length,
    })),
    plant: p.plant.map((x) => ({ id: x.id, tag: x.tag, description: x.description, terminals: x.terminals })),
    templates: p.templates.map((t) => ({ id: t.id, name: t.name, kind: t.kind, plant: t.plant.map((x) => x.tag) })),
    revisions: p.revisions.map((r) => ({ rev: r.rev, date: r.date, drawnBy: r.drawnBy, description: r.description })),
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
    return out;
  });
}

// ---------------------------------------------------------------------------
// Schemas

const project = { type: "string", description: "Project id (see list_projects)" };
const sheet = { type: "integer", description: "Sheet number, 1-based" };
const xy = {
  x: { type: "number", description: "Grid units across, 0–200 (2 units per column; column = floor(x/2)+1)" },
  y: { type: "number", description: "Grid units down, 0–120" },
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
      "Set title block fields: title, panelName, client, jobNo, drawingNo, drawnBy, drawnDate, checkedBy, checkedDate. Also numbering ('position' or 'sequential').",
    inputSchema: obj(
      {
        project,
        fields: { type: "object", additionalProperties: { type: "string" } },
        numbering: { type: "string", enum: ["position", "sequential"] },
      },
      ["project"],
    ),
    run: async (a, ctx) =>
      edit(ctx, str(a, "project"), (p) => {
        if (a.fields && typeof a.fields === "object") op.updateProjectInfo(p, a.fields as Record<string, string>);
        if (a.numbering === "position" || a.numbering === "sequential") op.setNumberingScheme(p, a.numbering);
        return projectInfo(p).details;
      }),
  },
  {
    name: "list_symbols",
    description:
      "The symbol library: ids, settings (params) and terminal names. Symbols are drawn vertical by default (current flows top to bottom); rot 90/180/270 turns them clockwise.",
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
              : s.id === "rail" || s.id === "busbar"
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
      "Add a sheet (after a given sheet, or at the end). Optionally with a panel boundary at height boundaryY.",
    inputSchema: obj({ project, title: { type: "string" }, after: sheet, boundaryY: { type: "number" } }, ["project"]),
    run: async (a, ctx) =>
      edit(ctx, str(a, "project"), (p) => {
        const after = a.after !== undefined ? pageByNumber(p, a.after).id : undefined;
        const page = op.addPage(p, str(a, "title", false), after);
        if (typeof a.boundaryY === "number") op.setBoundary(p, page.id, a.boundaryY);
        return { sheet: page.number };
      }),
  },
  {
    name: "update_page",
    description: "Rename a sheet, move it, or set/remove its panel boundary (boundaryY: null removes it).",
    inputSchema: obj(
      { project, sheet, title: { type: "string" }, moveTo: sheet, boundaryY: { type: ["number", "null"] } },
      ["project", "sheet"],
    ),
    run: async (a, ctx) =>
      edit(ctx, str(a, "project"), (p) => {
        const page = pageByNumber(p, a.sheet);
        if (typeof a.title === "string") op.renamePage(p, page.id, a.title);
        if ("boundaryY" in a) op.setBoundary(p, page.id, typeof a.boundaryY === "number" ? a.boundaryY : null);
        if (typeof a.moveTo === "number") op.movePage(p, page.id, a.moveTo - 1);
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
      "Wire two ends together on a sheet. Each end is {element, terminal} (rails: terminal is the tap offset along the rail, e.g. '30') or {wire, x, y} to tee into an existing wire at that grid point. Routing is automatic.",
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
        groups: {
          type: "array",
          description: "Named groups of its terminals, shown in capitals over the terminal boxes, e.g. [{name: 'R1', terminals: ['C','NO','NC']}]",
          items: { type: "object" },
        },
        info: { type: "string", description: "More lines under the box: model, rating, supply…" },
      },
      ["project"],
    ),
    run: async (a, ctx) =>
      edit(ctx, str(a, "project"), (p) => {
        const groups = Array.isArray(a.groups)
          ? a.groups.map((g) => {
              const o = (g ?? {}) as Record<string, unknown>;
              return { name: String(o.name ?? ""), terminals: Array.isArray(o.terminals) ? o.terminals.map(String) : [] };
            })
          : undefined;
        const info = typeof a.info === "string" ? a.info : undefined;
        const prefix = typeof a.prefix === "string" ? a.prefix : undefined;
        const powerByOthers = typeof a.powerByOthers === "boolean" ? a.powerByOthers : undefined;
        if (typeof a.plant === "string") {
          const item = plantByRef(p, a.plant);
          op.updatePlant(p, item.id, {
            tag: typeof a.tag === "string" ? a.tag : undefined,
            description: typeof a.description === "string" ? a.description : undefined,
            terminals: Array.isArray(a.terminals) ? a.terminals.map(String) : undefined,
            groups,
            info,
            prefix,
            powerByOthers,
          });
          return item;
        }
        const item = op.addPlant(
          p,
          typeof a.tag === "string" ? a.tag : "",
          str(a, "description", false),
          Array.isArray(a.terminals) ? a.terminals.map(String) : [],
          { groups, info, prefix, powerByOthers },
        );
        if (item.tag) item.locked = true;
        return item;
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
      "Place a view of a plant item showing some of its terminals (default all). Terminals sit along the top, 3 units apart.",
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
      return checkProject(p).map((f) => ({
        level: f.level,
        message: f.message,
        ids: f.ids.length ? f.ids : undefined,
      }));
    },
  },
  {
    name: "schedules",
    description: "Terminal schedule and field cable schedule, generated from the drawing.",
    inputSchema: obj({ project, kind: { type: "string", enum: ["terminals", "cables"] } }, ["project", "kind"]),
    run: async (a, ctx) => {
      const p = await ctx.storage.load(str(a, "project"));
      return a.kind === "cables" ? cableSchedule(p) : terminalSchedule(p);
    },
  },
  {
    name: "simulate",
    description:
      "Run the relay logic as drawn (DESIGN.md §9). Start with everything off (isolators and breakers on), apply actions in order — {toggle: id} for switches, selectors, isolators and field plant contacts (a plant view acts as a volt-free contact), {press: id} for push buttons, {wait: seconds} for timers — and report which coils are energised and which lamps are lit after each step. Supply is any rail named CCT…, return the 0V rail.",
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
      const report = (s: SimState) => ({
        t: Math.round(s.t * 10) / 10,
        energised: Object.entries(s.energised).filter(([, v]) => v).map(([k]) => tagOf.get(k) ?? k),
        lit: Object.entries(s.lamps).filter(([, v]) => v).map(([k]) => tagOf.get(k) ?? k),
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
      return { inputs: c.inputs.map((i) => ({ id: i.el, kind: i.kind, name: tagOf.get(i.el), label: i.label })), steps };
    },
  },
  {
    name: "check_logic",
    description:
      "Search every sequence of operations (and waiting for timers) for one that breaks a rule, e.g. two contactors that must never both be on (an ATS paralleling supplies). Uses the project's saved rules plus any given here; also reports shorts and relays that chatter.",
    inputSchema: obj(
      {
        project,
        neverBoth: { type: "array", items: { type: "array", items: { type: "string" } }, description: "Pairs of coil/lamp ids" },
        never: { type: "array", items: { type: "string" } },
        limit: { type: "integer", description: "States to explore (default 20000)" },
        includeIsolators: { type: "boolean", description: "Also try opening isolators and breakers (default false)" },
      },
      ["project"],
    ),
    run: async (a, ctx) => {
      const p = await ctx.storage.load(str(a, "project"));
      const c = compile(p);
      const rules = [...p.rules];
      for (const [x, y] of (a.neverBoth as string[][]) ?? []) rules.push({ id: `nb${rules.length}`, kind: "never-both", a: x!, b: y });
      for (const x of (a.never as string[]) ?? []) rules.push({ id: `n${rules.length}`, kind: "never", a: x });
      const tagOf = (id: string) => {
        for (const pg of p.pages) {
          const el = pg.elements.find((e) => e.id === id);
          if (el) return displayTag(el, p) || el.symbol;
        }
        return id;
      };
      const r = search(c, initialState(c), rules, {
        limit: typeof a.limit === "number" ? a.limit : 20000,
        includeIsolators: a.includeIsolators === true,
      });
      return {
        explored: r.states,
        complete: !r.truncated,
        broken: r.violations.map((v) => ({
          rule: v.rule.kind === "never" ? `never ${tagOf(v.rule.a)}` : `never both ${tagOf(v.rule.a)} and ${tagOf(v.rule.b!)}`,
          after: v.path.map((x) => describeAction(c, x)),
        })),
        faults: r.faults.map((f) => ({ fault: f.kind, after: f.path.map((x) => describeAction(c, x)) })),
        coils: p.pages.flatMap((pg) => pg.elements.filter((e) => isMaster(e)).map((e) => ({ id: e.id, tag: displayTag(e, p) }))),
      };
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
];

export const INSTRUCTIONS = `Ferrule drafts control panel schematics on A4 landscape sheets.

Coordinates are grid units: x 0–${AREA_UNITS.w} across (100 columns, 2 units each), y 0–${AREA_UNITS.h} down. Every terminal sits on a whole unit. Symbols are vertical by default (current flows top to bottom), so a ladder rung is a column of symbols between a CCT rail at the top and a 0V rail at the bottom: wire terminal to terminal down the column.

Typical flow: create_project or pick one from list_projects → add_element (rails, contacts, coils, lamps, terminals) → connect → link contacts to their coils → add_plant / place_plant_view for field equipment below a panel boundary (update_page boundaryY), with terminals on the boundary → renumber → check → view_page to look at the result → export_pdf.

Never type tags or wire numbers: renumber generates them from position (e.g. K3-16 = sheet 3, column 16). Labels can use fields such as {plant:SF-01.tag} so they follow the plant. Use templates (save_template / apply_template) for repeated sheets such as one starter per fan.`;

export { ArgError };
