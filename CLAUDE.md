# Working on Ferrule

Read this first. The design record is `docs/DESIGN.md`; the plan being built is `docs/design-v0.2.1.md` (the v0.2 sprint's record and working agreement are in `docs/design-v0.2.md`). Controllers and field IO are designed in `docs/controller.md`.

## Where the work is

v0.2.1, version `0.2.1-pre`: fixes and changes from QA of the v0.2 builds, planned in `docs/design-v0.2.1.md` (§7 *Order of work*, §9 *Changed during build*). The v0.2 sprint (`docs/design-v0.2.md`) is merged; v0.3 (tiling windows and a live split view, alignment tools, icon-only buttons) is outlined in the user's notes and will get its own design doc here before it's built.

- **v0.2.1 steps:** 1 windows and top bar; 2 parts and Annotate (with the logo); 3 busbars split into distribution block and control rail; 4 terminals and numbering (2-unit terminals and 2.5 mm text, terminals drive wire numbers, link arrows show wire number and bracketed reference).
- Modules are plant items with `module` set (`src/core/modules.ts` helpers, `src/core/controllers.ts` ops); a module view is a `plant-view` with `params.pmod`.
- Builds made off Windows have no exe icon (Bun sets it only on Windows); CI's exe job runs on Windows and its artifact has it.
- At the next release, remove `preRelease()` in `src/core/validate.ts` (maps test-build files).

## How a step runs

- One step, one PR, from a branch. CI (`check`, `exe`) must pass; the PR is set to auto-merge (`PUT repos/Cryptdos/ferrule/pulls/<n>/ccr/auto_merge`, squash). GraphQL isn't available; use REST (`gh api`).
- Stop only at a PR boundary. The PR body ends by saying what's next.
- Small judgement calls: decide, and note them under *Changed during build* in the design doc being built (`docs/design-v0.2.1.md` §9). Anything costly to reverse: push-notify and wait.
- Each code PR: build `dist/ferrule-windows-v<version>.zip` (`bun scripts/build-exe.ts`, then `cd dist && zip -q -9 ferrule-windows-v<version>.zip ferrule.exe`) and send it to the user.
- After each PR, sync the design doc being built (`docs/design-v0.2.1.md`) to the user's `C:\Temp\eCAD\UPCOMING\` (same name): copy it to `/mnt/user-data/outputs/<unique name>.md`, list the folder for a fresh `mtimeMs`, then `device_commit_files` with `expectedMtimeMs`. Never `force`.
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
