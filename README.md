# Ferrule

A lightweight, browser-based tool for drafting control panel schematics: symbols, wires, position-based numbering, cross-references, plant views, title blocks and PDF export. Functionality first.

- [Design document](docs/DESIGN.md)
- [Benchmark: LSP-01 life safety panel](docs/benchmark-lsp01.md)

Status: milestone 1 (skeleton).

## Running it

Needs [Bun](https://bun.sh) 1.1 or newer.

```sh
bun install
bun run build      # build the browser UI into dist/web
bun run start      # start the server and open http://127.0.0.1:4810/
```

Projects are saved as `<id>.ferrule.json` in a `projects` folder (next to the program when running as the .exe, otherwise in the current folder). The previous save is kept as `.bak`.

Server options: `--port 4810`, `--host 0.0.0.0` (to reach it from another machine), `--projects <folder>`, `--no-open`.

### Development

```sh
bun run dev        # server on :4810 with reload, plus Vite on :5173 (use this one)
bun run typecheck
bun test
```

## Layout

| Path | What |
|---|---|
| `src/core` | Shared model: geometry, symbols, operations, numbering, loading. Used by the UI, the server and (later) the MCP tools. |
| `src/server` | Bun + Hono server: project storage and the API, serves the UI. |
| `src/web` | Svelte UI, drawing in SVG. |

## Using the editor

- Pick a symbol on the left and click on the sheet to place it. `Esc` goes back to selecting.
- Drag to move (snaps to the grid), drag on empty paper to box-select, `Shift`/`Ctrl`+click to add to the selection.
- `R` rotate, `Del` delete, `Ctrl+D` duplicate, arrow keys nudge, `Ctrl+Z`/`Ctrl+Y` undo/redo, `F` fit.
- Scroll to zoom, middle-drag or `Space`+drag to pan.
- Saving is automatic.
