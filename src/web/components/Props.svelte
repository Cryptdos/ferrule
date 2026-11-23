<script lang="ts">
  import { resolveFields } from "../../core/fields";
  import { columnOf } from "../../core/geometry";
  import { earthConductors, isFieldWire, numberedSegments, routeOf } from "../../core/wires";
  import {
    deleteElements,
    deleteSegments,
    linkContact,
    linkOffpage,
    setPlantViewTerminals,
    updateSection,
    deleteSections,
    deleteClouds,
    updateCloud,
    resetRoute,
    reverseSegment,
    setWireKind,
    flipElements,
    rotateElements,
    setConductorNumber,
    setConductorInfo,
    updateElement,
    type ElementPatch,
    plantLabel,
    addAsset,
    updatePoint,
  } from "../../core/ops";
  import { controllerName, moduleTitle } from "../../core/modules";
  import { readImage } from "../images";
  import { address, contactMarks, contactType, isMaster, isSlave, masterOf, partnerOf, slavesOf } from "../../core/xref";
  import { paramApplies, requireSymbol, terminalNames } from "../../core/symbols";
  import { WIRE_FUNCTIONS } from "../../core/wirecolours";
  import ColourSelect from "./ColourSelect.svelte";
  import { displayTag, tagPrefix } from "../../core/tags";
  import type { ParamValue } from "../../core/model";
  import { describeExpectation, formLabel, isInputForm, pointOfPin, pointRef, printedPin } from "../../core/points";
  import type { Editor } from "../editor.svelte";
  import FieldInput from "./FieldInput.svelte";
  import SheetProps from "./SheetProps.svelte";
  import MarkdownEditor from "./MarkdownEditor.svelte";

  let { editor }: { editor: Editor } = $props();

  const page = $derived(editor.page);
  const sel = $derived(page.elements.filter((e) => editor.selection.includes(e.id)));
  const segs = $derived(page.segments.filter((s) => editor.selection.includes(s.id)));
  const describe = (ref: [string, string]) => {
    const el = page.elements.find((e) => e.id === ref[0]);
    if (!el) return "?";
    if (el.symbol === "junction") return "junction";
    const name = el.tag || requireSymbol(el.symbol).name;
    return `${name}:${ref[1]}`;
  };
  const secs = $derived(page.sections.filter((s) => editor.selection.includes(s.id)));
  const one = $derived(sel.length === 1 ? sel[0]! : null);
  const def = $derived(one ? requireSymbol(one.symbol) : null);

  function patch(p: ElementPatch) {
    if (!one) return;
    const id = one.id;
    editor.apply((proj) => updateElement(proj, editor.pageId, id, p));
  }
  function setParam(key: string, value: ParamValue, merge?: string) {
    if (!one) return;
    const id = one.id;
    const pageId = editor.pageId;
    editor.apply((p) => updateElement(p, pageId, id, { params: { [key]: value } }), merge ? { merge } : {});
  }

  /** Every coil in the project, for the contact link dropdown. */
  const coils = $derived(
    editor.project.pages.flatMap((pg) =>
      pg.elements.filter(isMaster).map((el) => ({
        el,
        // Labels with fields ({plant:…}) read as they print.
        label: `${displayTag(el, editor.project)}  (sheet ${pg.number}, col ${columnOf(el.pos[0])})${el.label ? " " + resolveFields(el.label, editor.project) : ""}`,
      })),
    ),
  );
  const arrows = $derived(
    editor.project.pages.flatMap((pg) =>
      pg.elements
        .filter((e) => e.symbol === "offpage" && e.id !== one?.id)
        .map((el) => ({ el, label: `${address(pg, el.pos)}${el.label ? " " + resolveFields(el.label, editor.project) : ""}` })),
    ),
  );
</script>

<div class="props">
  {#if one && def}
    <h3>{def.name}</h3>
    <div class="pos">Sheet {page.number} · column {columnOf(one.pos[0])} · ({one.pos[0]}, {one.pos[1]})</div>
    {@const master = masterOf(editor.project, one)}
    {#if isSlave(one)}
      <label>
        Driven by coil
        <select
          value={master?.el.id ?? ""}
          onchange={(e) => {
            const v = e.currentTarget.value || null;
            const id = one.id;
            editor.apply((p) => linkContact(p, id, v));
          }}
        >
          <option value="">Not linked</option>
          {#each coils as c (c.el.id)}
            <option value={c.el.id}>{c.label}</option>
          {/each}
        </select>
      </label>
      {#if master}
        <button class="link-btn" onclick={() => editor.goTo(master.el.id)}>Go to coil {displayTag(master.el, editor.project)} →</button>
      {/if}
    {/if}
    {#if def.kind(one) && !master}
      <label>
        Tag
        <input
          value={one.tag}
          placeholder={one.symbol === "terminal" ? "numbered by Renumber" : `${tagPrefix(one, editor.project)}? (numbered by Renumber)`}
          onchange={(e) => patch({ tag: e.currentTarget.value })}
        />
      </label>
      <label class="check">
        <input type="checkbox" checked={one.params.locked === true} onchange={(e) => setParam("locked", e.currentTarget.checked)} />
        Tag fixed (Renumber keeps it as it is)
      </label>
    {/if}
    {#if isMaster(one)}
      {@const slaves = slavesOf(editor.project, one)}
      <div class="sub">Contacts ({slaves.length})</div>
      {#if slaves.length === 0}
        <p class="hint">None yet. Select a contact and pick this coil under “Driven by coil”.</p>
      {:else}
        <p class="hint">Drag the contact table on the drawing to move it; click a row, or double-click a contact, to jump.</p>
      {/if}
      {#each slaves as s (s.el.id)}
        <button class="link-btn" onclick={() => editor.goTo(s.el.id)}>
          {contactType(s.el)} {contactMarks(s.el)} at {address(s.page, s.el.pos)} →
        </button>
      {/each}
    {/if}
    {#if one.symbol === "offpage"}
      {@const partner = partnerOf(editor.project, one)}
      <label>
        Continues at
        <select
          value={partner?.el.id ?? ""}
          onchange={(e) => {
            const v = e.currentTarget.value || null;
            const id = one.id;
            editor.apply((p) => linkOffpage(p, id, v));
          }}
        >
          <option value="">Not linked</option>
          {#each arrows as a (a.el.id)}
            <option value={a.el.id}>{a.label}</option>
          {/each}
        </select>
      </label>
      {#if partner}
        <button class="link-btn" onclick={() => editor.goTo(partner.el.id)}>Go to {address(partner.page, partner.el.pos)} →</button>
      {/if}
      <!-- Quicker linking (controller.md §5): click the partner on any sheet, or drop a new one. -->
      <div class="buttons">
        <button onclick={() => (editor.linking = { from: one.id, address: address(editor.page, one.pos), mode: "pick" })}>Link…</button>
        <button onclick={() => (editor.linking = { from: one.id, address: address(editor.page, one.pos), mode: "new" })}>Link to a new arrow</button>
      </div>
      {#if one.params.source === false && partner && one.params.sameLabel !== false && partner.el.label}
        <p class="hint">Shows its source's label. Untick <em>Same label as its source</em> to give it its own.</p>
      {/if}
    {/if}
    {#if one.symbol === "text"}
      <div class="sub">Text</div>
      <MarkdownEditor
        value={one.label}
        oninput={(v) => {
          const id = one.id;
          editor.apply((p) => updateElement(p, editor.pageId, id, { label: v }), { merge: `notes:${id}` });
        }}
      />
    {:else if one.symbol === "revtable" || one.symbol === "legend"}
      <p class="hint">
        {one.symbol === "revtable"
          ? "Lists the project's revisions: add and edit them under Project settings."
          : "One of each part drawn in the project, by name. It keeps itself up to date."}
      </p>
    {:else if one.symbol === "image"}
      <!-- A picture is placed like any part; its file is chosen here (T2). -->
      {@const shown = String(one.params.asset ?? "")}
      <label>
        Shows
        <select
          value={shown === "@logo" ? "logo" : "picture"}
          onchange={(e) => setParam("asset", e.currentTarget.value === "logo" ? "@logo" : "")}
        >
          <option value="picture">A picture</option>
          <option value="logo">The project's logo (set under Project…)</option>
        </select>
      </label>
      {#if shown !== "@logo"}
        <label class="filepick">
          {shown && editor.project.assets?.[shown] ? `Picture: ${editor.project.assets[shown]!.name ?? "chosen"}` : "No picture chosen yet"}
          <span class="button">Choose a picture…</span>
          <input
            type="file"
            accept="image/*"
            hidden
            onchange={async (e) => {
              const f = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              if (!f) return;
              try {
                const img = await readImage(f);
                const id = one.id;
                editor.apply((p) => updateElement(p, editor.pageId, id, { params: { asset: addAsset(p, img) } }));
              } catch (err) {
                editor.flash((err as Error).message);
              }
            }}
          />
        </label>
      {/if}
    {:else if ["arrow", "highlight", "callout", "polygon"].includes(one.symbol)}
      <p class="hint">
        {one.symbol === "polygon" || one.symbol === "arrow"
          ? "Drag a corner's square to move it."
          : one.symbol === "highlight"
            ? "Drag the corner square to size it."
            : "Call-outs number 1, 2, 3… on each sheet as they're placed."}
      </p>
    {:else if one.symbol === "plant-view" && !one.label}
      <!-- No label of its own: the box shows the plant's tag, description and information, set in Plant. -->
    {:else if one.symbol !== "junction"}
      {#if one.symbol === "plant-view"}
        <p class="hint">Plant views no longer have their own label: what it says belongs in the plant's information (Plant) or a Text annotation. Clear it to remove it.</p>
      {/if}
      <label>
        Label
        <FieldInput
          {editor}
          value={one.label}
          onchange={(v) => patch({ label: v })}
        />
      </label>
        <!-- Longer labels wrap onto more lines at this width (28); shown before there's a label, so it's found. -->
        <label>
          Label width (units, 0: one line)
          <input
            type="number"
            min="0"
            max="150"
            step="1"
            value={typeof one.params.labelWidth === "number" ? one.params.labelWidth : 0}
            onchange={(e) => setParam("labelWidth", Math.max(0, Math.min(150, Number(e.currentTarget.value) || 0)))}
          />
        </label>
    {/if}
    {#if one.symbol === "ctrlmap"}
      <label>
        Controller
        <select value={String(one.params.ctrl ?? "")} onchange={(e) => setParam("ctrl", e.currentTarget.value)}>
          <option value="">The first one</option>
          {#each editor.project.controllers ?? [] as c (c.id)}
            <option value={c.id}>{controllerName(editor.project, c)}</option>
          {/each}
        </select>
      </label>
      <p class="hint">Its modules in rail order: tag, bus address, maker, model, type and where each is drawn; spare slots dashed. It keeps up by itself.</p>
    {/if}
    {#if one.symbol === "busbar" || one.symbol === "offpage"}
      <label>
        Distribution
        <select value={String(one.params.dist ?? "")} onchange={(e) => setParam("dist", e.currentTarget.value)}>
          <option value="">{one.symbol === "busbar" ? "Local (this busbar alone)" : "None"}</option>
          {#each editor.project.distributions as d (d.id)}
            <option value={d.id}>{d.name}{d.voltage ? ` (${d.voltage})` : ""}</option>
          {/each}
        </select>
      </label>
      {#if !editor.project.distributions.length}
        <p class="hint">The project's distributions are set up under Distribution… in the top bar.</p>
      {/if}
    {:else if one.symbol === "supply"}
      <div class="sub">Distribution each conductor feeds</div>
      <p class="hint">
        Only when its busbars aren't wired from this supply. Everything on a distribution is joined, so wiring in
        between (a main isolator, say) would be bypassed. Check warns when that happens.
      </p>
      {#each terminalNames(one) as t (t)}
        <label>
          {t}
          <select value={String(one.params[`dist_${t}`] ?? "")} onchange={(e) => setParam(`dist_${t}`, e.currentTarget.value)}>
            <option value="">None</option>
            {#each editor.project.distributions as d (d.id)}
              <option value={d.id}>{d.name}{d.voltage ? ` (${d.voltage})` : ""}</option>
            {/each}
          </select>
        </label>
      {/each}
    {/if}
    {#each def.params.filter((x) => !x.hidden) as p (p.key)}
      {@const v = one.params[p.key] ?? p.default}
      {#if !paramApplies(p, one)}
        <label class="off" title="Doesn't apply to this {def.name.toLowerCase()} as it's set">
          {p.label}
          <select disabled>
            <option>{p.options?.find((o) => o.value === p.fixed)?.label ?? p.fixed ?? "–"}</option>
          </select>
        </label>
      {:else if p.type === "bool"}
        <label class="check">
          <input type="checkbox" checked={v === true} onchange={(e) => setParam(p.key, e.currentTarget.checked)} />
          {p.label}
        </label>
      {:else}
        <label>
          <span>
            {p.label}
            {#if p.help}<span class="help" title={p.help}>?</span>{/if}
          </span>
          {#if p.type === "select"}
            <select value={String(v)} onchange={(e) => setParam(p.key, e.currentTarget.value)}>
              {#each p.options ?? [] as o (o.value)}
                <option value={o.value}>{o.label}</option>
              {/each}
            </select>
          {:else if p.type === "number"}
            <input
              type="number"
              min={p.min}
              max={p.max}
              value={Number(v)}
              oninput={(e) => {
                // Live while scrolling or typing; one undo step for the lot.
                const raw = e.currentTarget.value;
                const n = Number(raw);
                if (raw !== "" && Number.isFinite(n)) setParam(p.key, Math.min(p.max ?? n, Math.max(p.min ?? n, Math.round(n))), `${one.id}:${p.key}`);
              }}
            />
          {:else}
            <input value={String(v)} placeholder={p.placeholder} onchange={(e) => setParam(p.key, e.currentTarget.value)} />
          {/if}
        </label>
      {/if}
    {/each}
    {#if one.symbol === "isolator"}
      <p class="hint">
        {#if one.params.function === "contactor"}
          Worked by its coil: pick the coil under “Driven by coil”. The handle doesn't apply.
        {:else if one.params.function === "breaker"}
          A breaker trips and resets by hand on its own toggle, so no operator is drawn.
        {:else}
          Worked by hand. For poles that a coil works, set the function to contactor main contacts.
        {/if}
      </p>
    {/if}
    {#if isMaster(one) && (typeof one.params.xrefDx === "number" || typeof one.params.xrefDy === "number")}
      <div class="buttons">
        <button
          onclick={() => {
            const id = one.id;
            editor.apply((p) => {
              const el = p.pages.flatMap((pg) => pg.elements).find((e) => e.id === id);
              if (el) {
                delete el.params.xrefDx;
                delete el.params.xrefDy;
              }
            });
          }}>Put the contact table back beside the coil</button
        >
      </div>
    {/if}
    {#if one.symbol === "plant-view"}
      {@const item = editor.project.plant.find((x) => x.id === one.params.plant)}
      {@const shown = new Set(String(one.params.show ?? "").split(",").filter(Boolean))}
      <div class="sub">{item ? (item.module ? moduleTitle(editor.project, one) : `${plantLabel(item)} ${item.description}`) : "Plant item missing"}</div>
      {#if item?.module}
        <!-- A module's view shows chosen channels (controller.md §5); split it across sheets as needed. -->
        <div class="sub">Channels shown on this sheet</div>
        <div class="ticks">
          {#each item.points ?? [] as pt (pt.name)}
            <label class="check">
              <input
                type="checkbox"
                checked={pt.pins.some((t) => shown.has(t))}
                onchange={(e) => {
                  const on = e.currentTarget.checked;
                  const keepPts = (item.points ?? []).filter((q) => (q === pt ? on : q.pins.some((t) => shown.has(t))));
                  const pins = new Set(keepPts.flatMap((q) => q.pins));
                  // Pins in no point (a host's spare terminals) stay as they were.
                  const next = item.terminals.filter((t) => pins.has(t) || (!item.points?.some((q) => q.pins.includes(t)) && shown.has(t)));
                  const id = one.id;
                  editor.apply((p) => setPlantViewTerminals(p, editor.pageId, id, next));
                }}
              />
              {pt.name}
            </label>
          {/each}
        </div>
        <p class="hint">A view that leaves channels out has a break at that edge. The module keeps one tag, from its first view; points drawn on a later view are referred to with where they are, e.g. <code>A3-23:DO5 (4-10)</code>.</p>
        <div class="sub">Labels</div>
        {#each (item.points ?? []).filter((q) => q.pins.some((t) => shown.has(t))) as pt (pt.name)}
          <label class="joblabel">
            {pt.name}
            <input
              value={pt.label ?? ""}
              placeholder="What it does on this job"
              onchange={(e) => {
                const v = e.currentTarget.value;
                const name = pt.name;
                const pid = item.id;
                editor.apply((p) => updatePoint(p, pid, name, { label: v }));
              }}
            />
          </label>
        {/each}
      {:else if item}
        <div class="sub">Terminals shown on this sheet</div>
        <div class="ticks">
          {#each item.terminals as t (t)}
            <label class="check">
              <input
                type="checkbox"
                checked={shown.has(t)}
                onchange={(e) => {
                  const on = e.currentTarget.checked;
                  const next = item.terminals.filter((x) => (x === t ? on : shown.has(x)));
                  const id = one.id;
                  editor.apply((p) => setPlantViewTerminals(p, editor.pageId, id, next));
                }}
              />
              {printedPin(t, pointOfPin(item).get(t))}
            </label>
          {/each}
        </div>
        <p class="hint">Hidden terminals give the box a break line. Edit the plant itself under Plant….</p>
        {#if item.points?.length}
          <div class="sub">Points</div>
          {#each item.points as pt (pt.name)}
            {@const mine = editor.project.expectations.filter((x) => x.point === pointRef(item.id, pt.name))}
            <div class="point">
              <strong>{pt.name}</strong> · {formLabel(pt.form)} · {pt.pins.map((t) => printedPin(t, pt.name)).join(" ")}
              {#each mine as x (x.id)}<div class="hint">{describeExpectation(editor.project, x)}</div>{/each}
              {#if isInputForm(pt.form) && !mine.length}<div class="hint">No expectation (Expectations…)</div>{/if}
            </div>
          {/each}
        {/if}
      {/if}
    {/if}
    <div class="row">
      <span>Rotation {one.rot}°</span>
      {#if page.boundaryY !== null}<span> · {one.zone === "external" ? "Field (below boundary)" : "In panel"}</span>{/if}
    </div>
  {:else if secs.length === 1 && sel.length === 0 && segs.length === 0}
    {@const sec = secs[0]!}
    <h3>Section box</h3>
    <label>
      Label
      <FieldInput
        {editor}
        value={sec.label}
        placeholder="e.g. MAIN INCOMING SECTION"
        onchange={(v) => {
          const id = sec.id;
          editor.apply((p) => updateSection(p, editor.pageId, id, { label: v }));
        }}
      />
    </label>
    <div class="pos">Columns {columnOf(sec.rect[0])}–{columnOf(sec.rect[0] + sec.rect[2] - 1)}</div>
    <p class="hint">Drag the label to move it. Drag an edge or a corner to resize just that side.</p>
    <div class="buttons">
      <button
        class="danger"
        onclick={() => {
          const id = sec.id;
          editor.apply((p) => deleteSections(p, editor.pageId, [id]));
          editor.selection = [];
        }}>Delete</button
      >
    </div>
  {:else if segs.length === 1 && sel.length === 0}
    {@const seg = segs[0]!}
    {@const cond = editor.project.conductors.find((c) => c.id === seg.conductor)}
    <h3>Wire</h3>
    <div class="pos">{describe(seg.from)} → {describe(seg.to)}</div>
    {#if cond}
      <label>
        Wire number
        <input
          value={cond.number}
          placeholder="set by Renumber"
          onchange={(e) => {
            const v = e.currentTarget.value;
            const id = cond.id;
            editor.apply((p) => setConductorNumber(p, id, v, true));
          }}
        />
      </label>
      <label class="check">
        <input
          type="checkbox"
          checked={cond.locked === true}
          onchange={(e) => {
            const locked = e.currentTarget.checked;
            const id = cond.id;
            const n = cond.number;
            editor.apply((p) => setConductorNumber(p, id, n, locked));
          }}
        />
        Lock number (Renumber keeps it)
      </label>
      <div class="pair">
        <label>
          Core colour
          <ColourSelect
            value={cond.colour}
            onchange={(v) => {
              const id = cond.id;
              editor.apply((p) => setConductorInfo(p, id, { colour: v }));
            }}
          />
        </label>
        <label>
          Function
          <input
            value={cond.function ?? ""}
            placeholder="e.g. 0V, 24V AC"
            list="ferrule-wire-functions"
            onchange={(e) => {
              const v = e.currentTarget.value;
              const id = cond.id;
              editor.apply((p) => setConductorInfo(p, id, { function: v }));
            }}
          />
        </label>
      </div>
      <datalist id="ferrule-wire-functions">
        {#each WIRE_FUNCTIONS as f (f)}<option value={f}></option>{/each}
      </datalist>
      {@const isField = isFieldWire(page, seg)}
      <label>
        Kind
        <select
          value={seg.field === undefined ? "auto" : seg.field ? "field" : "panel"}
          onchange={(e) => {
            const v = e.currentTarget.value;
            const id = seg.id;
            editor.apply((p) => setWireKind(p, editor.pageId, [id], { field: v === "auto" ? null : v === "field" }));
          }}
        >
          <option value="auto">Automatic: {isField && seg.field === undefined ? "field" : "panel"} (by the panel boundary)</option>
          <option value="panel">Panel wiring</option>
          <option value="field">Field wire (dashed, out to plant)</option>
        </select>
      </label>
      <!-- Shown by the usual rules; the drafter can hide either to cut clutter. -->
      {@const earth = earthConductors(editor.project)}
      {@const usual = numberedSegments(
        { ...page, segments: page.segments.map((s) => (s.id === seg.id ? { ...s, showNumber: undefined } : s)) },
        earth,
        (s) => routeOf(page, s),
      ).has(seg.id)}
      <label class="check">
        <input
          type="checkbox"
          checked={seg.showNumber ?? usual}
          onchange={(e) => {
            const v = e.currentTarget.checked;
            const id = seg.id;
            // Back to the usual rule when it matches it.
            editor.apply((p) => setWireKind(p, editor.pageId, [id], { showNumber: v === usual ? null : v }));
          }}
        />
        Show number{isField
          ? " (field wires don't, usually)"
          : earth.has(seg.conductor)
            ? " (earth wires don't, usually)"
            : !usual && seg.showNumber === undefined
              ? " (printed once per sheet, on its longest run)"
              : ""}
      </label>
      {#if cond.colour}
        <label class="check">
          <input
            type="checkbox"
            checked={seg.showColour !== false}
            onchange={(e) => {
              const v = e.currentTarget.checked;
              const id = seg.id;
              editor.apply((p) => setWireKind(p, editor.pageId, [id], { showColour: v }));
            }}
          />
          Show colour
        </label>
      {/if}
      {#if cond.colour}
        <div class="row">
          Colour and number print at the {describe(seg.from)} end.
          <button class="small" onclick={() => editor.apply((p) => reverseSegment(p, editor.pageId, seg.id))}>Other end</button>
        </div>
      {/if}
      <p class="hint">
        The colour prints at the end the wire was drawn from, the number just after it; the function prints beside each
        terminal end. Conductor joins {cond.terminals.length} terminals.
      </p>
    {/if}
    <div class="row">Route: {seg.route === "manual" ? "adjusted by hand" : "automatic"}</div>
    <p class="hint">Drag a leg of the wire to move it. The ends stay on their terminals.</p>
    <div class="buttons">
      <button
        disabled={seg.route !== "manual"}
        onclick={() => editor.apply((p) => resetRoute(p, editor.pageId, [seg.id]))}>Reset route</button
      >
      <button
        class="danger"
        onclick={() => {
          editor.apply((p) => deleteSegments(p, editor.pageId, [seg.id]));
          editor.selection = [];
        }}>Delete</button
      >
    </div>
  {:else if editor.selectedClouds.length === 1 && sel.length === 0}
    {@const cloud = editor.selectedClouds[0]!}
    {@const owner = editor.project.revisions.find((r) => r.clouds.some((c) => c.id === cloud.id))}
    <h3>Revision cloud</h3>
    <p class="hint">
      Marks what changed in a revision. The triangle carries the revision letter. Drag the triangle to move the cloud, an
      edge or corner to resize it. Only the latest revision's clouds print.
    </p>
    <label>
      Revision
      <select
        value={owner?.rev ?? ""}
        onchange={(e) => {
          const rev = e.currentTarget.value;
          const id = cloud.id;
          editor.apply((p) => updateCloud(p, id, { rev }));
        }}
      >
        {#each editor.project.revisions as r (r.rev)}<option value={r.rev}>{r.rev} {r.description}</option>{/each}
      </select>
    </label>
    <div class="buttons">
      <button
        class="danger"
        onclick={() => {
          const id = cloud.id;
          editor.apply((p) => deleteClouds(p, [id]));
          editor.selection = [];
        }}>Delete cloud</button
      >
    </div>
  {:else if sel.length + segs.length > 1}
    <h3>{sel.length} elements, {segs.length} wires selected</h3>
    {@const terms = sel.filter((e) => e.symbol === "terminal")}
    {#if terms.length}
      <div class="sub">{terms.length} terminal{terms.length === 1 ? "" : "s"}</div>
      <label>
        Terminal strip
        <input
          value={terms.every((t) => t.params.strip === terms[0]!.params.strip) ? String(terms[0]!.params.strip ?? "") : ""}
          placeholder="(mixed)"
          onchange={(e) => {
            const v = e.currentTarget.value.trim();
            if (!v) return;
            const ids = terms.map((t) => t.id);
            editor.apply((p) => ids.forEach((id) => updateElement(p, editor.pageId, id, { params: { strip: v } })));
          }}
        />
      </label>
      <label class="check">
        <input
          type="checkbox"
          checked={terms.every((t) => t.params.showStrip === true)}
          indeterminate={terms.some((t) => t.params.showStrip === true) && !terms.every((t) => t.params.showStrip === true)}
          onchange={(e) => {
            const on = e.currentTarget.checked;
            const ids = terms.map((t) => t.id);
            editor.apply((p) => ids.forEach((id) => updateElement(p, editor.pageId, id, { params: { showStrip: on } })));
          }}
        />
        Show the strip identifier beside them
      </label>
    {/if}
    {#if segs.some((s) => s.route === "manual")}
      <div class="buttons">
        <button
          onclick={() => {
            const ids = segs.map((s) => s.id);
            editor.apply((p) => resetRoute(p, editor.pageId, ids));
          }}>Reset wire routes</button
        >
      </div>
    {/if}
  {:else}
    <SheetProps {editor} />
  {/if}
  {#if sel.length > 0}
    <div class="buttons">
      <button
        onclick={() => {
          const ids = sel.map((e) => e.id);
          editor.apply((p) => rotateElements(p, editor.pageId, ids));
        }}>Rotate (R)</button
      >
      <button
        onclick={() => {
          const ids = sel.map((e) => e.id);
          editor.apply((p) => flipElements(p, editor.pageId, ids));
        }}>Flip (F)</button
      >
      <button
        class="danger"
        onclick={() => {
          const ids = sel.map((e) => e.id);
          const segIds = segs.map((s) => s.id);
          editor.apply((p) => {
            deleteSegments(p, editor.pageId, segIds);
            deleteElements(p, editor.pageId, ids);
          });
          editor.selection = [];
        }}>Delete</button
      >
    </div>
  {/if}
</div>

<style>
  .joblabel {
    display: grid;
    grid-template-columns: 44px 1fr;
    gap: 4px;
    align-items: center;
    font-size: 12px;
    margin: 2px 0;
  }
  .point {
    font-size: 12px;
    margin-bottom: 3px;
  }
  .props {
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  h3 {
    margin: 0;
    font-size: 14px;
  }
  .pos {
    font-size: 12px;
    color: #667;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
    color: #445;
  }
  label.off {
    color: #99a;
  }
  .pair {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 6px;
  }
  /* Nothing in the panel may be wider than the panel. */
  .props :global(label > input:not([type="checkbox"])),
  .props :global(label > select),
  .props :global(label > textarea) {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }
  label.check {
    flex-direction: row;
    align-items: center;
    gap: 6px;
  }
  .row {
    font-size: 12px;
    color: #445;
  }
  .sub {
    font-size: 12px;
    font-weight: 600;
    color: #334;
    margin-top: 4px;
  }
  button.small {
    font-size: 11px;
    padding: 1px 6px;
    margin-left: 6px;
  }
  .ticks {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
  }
  .link-btn {
    text-align: left;
    font-size: 12px;
    padding: 3px 8px;
  }
  .buttons {
    display: flex;
    gap: 6px;
    margin-top: 4px;
  }
  .filepick .button {
    display: inline-block;
    margin-top: 3px;
    border: 1px solid #b9c0c6;
    border-radius: 4px;
    padding: 3px 10px;
    cursor: pointer;
    font-size: 13px;
    align-self: flex-start;
  }
  .hint {
    font-size: 12px;
    color: #556;
    line-height: 1.5;
    margin: 0;
  }
  .help {
    display: inline-block;
    width: 14px;
    height: 14px;
    margin-left: 4px;
    border-radius: 50%;
    background: #dde;
    color: #334;
    font-size: 10px;
    line-height: 14px;
    text-align: center;
    cursor: help;
  }
</style>
