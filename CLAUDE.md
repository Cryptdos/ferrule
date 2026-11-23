# Working on Ferrule

Read this first. The design record is `docs/DESIGN.md`; the plan being built is `docs/design-v0.2.md` (§14 *Order of work*, *How the sprint runs*, *Changed during build*). Controllers and field IO are designed in `docs/controller.md`.

## Where the sprint is

v0.2 sprint, version `0.2.0-pre`. Steps 1–7 (7a and 7b) are merged. Step 8 is split:

- **8a**: IO points for plant and expectations (controller.md phases 1–2). Done when its PR is merged.
- **8b**: controllers (controller.md phase 3: module types, generator, module views at the top of the sheet, references, controller map, IO schedule with the plant points schedule, GA placement, checks) with their MCP tools.
- **8c**: the logo sketches (design-v0.2 §11).
- At the 0.2.0 release, remove `preRelease()` in `src/core/validate.ts` (maps test-build files).

## How a step runs

- One step, one PR, from a branch. CI (`check`, `exe`) must pass; the PR is set to auto-merge (`PUT repos/Cryptdos/ferrule/pulls/<n>/ccr/auto_merge`, squash). GraphQL isn't available; use REST (`gh api`).
- Stop only at a PR boundary. The PR body ends by saying what's next.
- Small judgement calls: decide, and note them under *Changed during build* in `docs/design-v0.2.md`. Anything costly to reverse: push-notify and wait.
- Each code PR: build `dist/ferrule-windows-v0.2.0-pre.zip` (`bun scripts/build-exe.ts`, then `cd dist && zip -q -9 ferrule-windows-v0.2.0-pre.zip ferrule.exe`) and send it to the user.
- After each PR, sync `docs/design-v0.2.md` to the user's `C:\Temp\eCAD\UPCOMING\design-v0.2.md`: copy it to `/mnt/user-data/outputs/<unique name>.md`, list the folder for a fresh `mtimeMs`, then `device_commit_files` with `expectedMtimeMs`. Never `force`.
- Update `README.md` and add a row to the decisions table in `docs/DESIGN.md` for what changed; retake README screenshots when the interface changes.
- Before a PR: `bun test`, `bun run typecheck`, and look at the result (print view screenshots or the browser).

## Rules

- **No professional references** in code, docs, commits or PRs: no third-party firms, drawings or product names from reference material. Generic examples only. Git history is left as it is.
- **Never commit** the user's test projects or reference drawings; they're proprietary and stay in `C:\Temp\eCAD`.
- Projects and distributions start empty; preferred setups go in templates.
- Simple, consistent parts; no Swiss-army-knife features.
- **Chats stay private:** no links to Claude sessions or chats (no `Claude-Session:` line, no session URL) in commits, PR bodies, comments or files. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` only; PR bodies end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)` only. Nothing from a chat (names, firms, drawings discussed) goes into the repo.

## Checking your work

- Dev server on a scratch folder: `bun src/server/main.ts --projects /tmp/fproj --no-open --port 4811`.
- The example project: `bun scripts/build-lsp01.ts /tmp/fproj/lsp-01.ferrule`.
- A printed sheet as PNG: rebuild the client first (`bunx vite build`), then `google-chrome --headless --no-sandbox --hide-scrollbars --window-size=2400,1700 --virtual-time-budget=8000 --screenshot=out.png "http://127.0.0.1:4811/print/<project id>?page=<n>"`.
- Interface checks: puppeteer-core with `/usr/bin/google-chrome`; close the browser at the end of the script.
- Grid: 75 columns, 150 × 90 units, 1 unit ≈ 1.847 mm; text sizes in `TEXT_MM` (`src/core/geometry.ts`), nothing under 1.8 mm.
