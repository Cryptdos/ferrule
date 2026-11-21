# Ferrule MCP server

Ferrule exposes its drawing operations as MCP tools, so Claude can draft and edit drawings directly (DESIGN.md §12). The tools call the same core module as the editor: everything Claude does is an ordinary edit that you can see, undo by hand, renumber and check.

## Connecting

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
| `add_page`, `update_page`, `delete_page` | Sheets, titles, order, panel boundary |
| `add_element`, `update_element`, `move_element`, `delete_element` | Symbols, text, boxes, plates (and deleting wires or sections by id) |
| `connect`, `disconnect` | Wires: terminal to terminal, or tee into a wire |
| `link` | Contact → coil, or pair off-page arrows |
| `add_plant`, `place_plant_view` | Field equipment and its views |
| `add_section` | Labelled section boxes |
| `save_template`, `apply_template` | Templates and stamping for other plant |
| `renumber`, `check`, `schedules` | Tags and wire numbers, rule checks, terminal/cable schedules |
| `simulate` | Run the relay logic through a sequence of actions; reports coils energised and lamps lit after each |
| `check_logic` | Search for any sequence that breaks a rule (e.g. two contactors on together), or shorts the supply |
| `export_pdf` | Saves the A4 PDF into an `exports` folder beside `projects` |

Coordinates are grid units: x 0–200 across (2 per column), y 0–112 down. Sheets are referred to by number, elements and wires by id.

## Security

The HTTP endpoint listens on 127.0.0.1 only (unless you start Ferrule with `--host`), and refuses requests from web pages served by other sites.
