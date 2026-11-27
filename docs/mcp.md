# Ferrule MCP server

Ferrule exposes its drawing operations as MCP tools, so Claude can draft and edit drawings directly (DESIGN.md §12). The tools call the same core module as the editor: everything Claude does is an ordinary edit that you can see, undo by hand, renumber and check.

## Connecting

**Settings → Status** in Ferrule shows the exact settings for the Ferrule you're running, ready to copy, and whether Claude is connected (and the last tool it used).

**Claude Code** (or any client that speaks streamable HTTP), with Ferrule running:

```sh
claude mcp add --transport http ferrule http://127.0.0.1:4810/mcp
```

**Claude Desktop** (stdio). In `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ferrule": {
      "command": "C:\\Temp\\eCAD\\ferrule.exe",
      "args": ["--mcp"]
    }
  }
}
```

With `--mcp`, Ferrule checks for a running Ferrule on port 4810 and relays to it, so the browser editor and Claude share one server. If none is running, it starts one itself (without opening a browser; the address is in Claude's MCP log), so you can still open http://127.0.0.1:4810/ to watch.

## Working alongside the editor

An open editor tab follows changes Claude makes: it reloads the project and says so. If you were mid-edit when Claude saved, your unsaved change is refused rather than overwriting Claude's, and the tab reloads with a message. Undo history is cleared on reload, because it no longer applies.

## Tools

| Tool | What it does |
|---|---|
| `list_projects`, `create_project`, `project_info`, `update_project_info` | Projects, title block fields, numbering scheme |
| `list_symbols` | Symbol ids, settings and terminal names |
| `get_page` | Everything on a sheet, with terminal positions and wire numbers |
| `view_page` | A PNG of a sheet as it prints (needs Edge or Chrome) |
| `add_page`, `update_page`, `delete_page` | Sheets, titles, order, panel boundary, spare sheets (annotations only) |
| `add_element`, `update_element`, `move_element`, `delete_element` | Symbols, text, boxes, plates (and deleting wires or sections by id) |
| `connect`, `disconnect` | Wires: terminal to terminal, or tee into a wire |
| `label_wire` | A wire's number, core colour (IEC 60757, e.g. Bu) and function (e.g. 0V), printed along it |
| `link` | Contact → coil, or pair two link ends (a wire to bare paper in `connect` ends in one) |
| `add_distribution` | The project's distributions (L1, N, CCT, 0V…), each with its tag, the number every wire on it carries: distribution blocks and power rails pick one with `params.dist`. An incoming supply or a plant's supply out is wired to its block or rail |
| `add_plant`, `place_plant_view` | Field equipment (prefix or fixed tag, pins and points by quick entry or in full: forms, what outputs follow, pin ids and groups; information lines, power by others) and its views |
| `add_section` | Labelled section boxes |
| `controller`, `add_module` | Controllers: list them (each module's tag, type, points as `A3-23:DI2` and where it's drawn), add, rename or delete one; add modules by type and channel count with their pins generated from a pattern (ids, first pin, names, shared commons), set each point's job label, add spare slots, move, readdress or delete modules. Module views are placed with `place_plant_view`; `saveModel` keeps a module as a model in the device table and `device` adds one from it |
| `place_controller` | Lay a controller's modules out on a GA sheet, side by side in rail order, onto a DIN rail; `update_page` type `ga` makes an empty sheet a GA |
| `schedules` | Terminal, field cable, IO (controllers' points), plant points and bill of materials schedules |
| `save_template`, `apply_template` | Templates and stamping for other plant |
| `renumber`, `check`, `schedules` | Tags and wire numbers, rule checks, terminal/cable schedules |
| `simulate` | Run the relay logic through a sequence of actions (switches, push buttons, plant outputs, waiting); reports coils energised, lamps lit, plant points on and expectations broken after each |
| `set_expectation` | List, add, replace or delete expectations: "should be on/off when …" for plant inputs, "never …" for anything |
| `check_logic` | Search for any sequence that breaks an expectation (e.g. two contactors on together), shorts the supply or makes relays chatter |
| `export_pdf` | Saves the A4 PDF into an `exports` folder beside `projects` |

Coordinates are grid units: x 0–150 across (2 per column, 75 columns), y 0–90 down. Sheets are referred to by number, elements and wires by id.

## Security

The HTTP endpoint listens on 127.0.0.1 only (unless you start Ferrule with `--host`), and refuses requests from web pages served by other sites.
