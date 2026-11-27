# Working on Ferrule

Read this first. The design record is `docs/DESIGN.md`. The plan being built is `docs/design-v0.5.md`, the v0.5 sprint, which works through the list in `docs/advancements-v0.5.md`. What every part of Ferrule does is `docs/functional-specification.md`, as numbered statements. Earlier plans, all built: `docs/design-v0.4.x.md` (the v0.4 revision sprint), `docs/design-v0.4.md`, `docs/design-v0.3.md`, `docs/design-v0.2.md`, `docs/design-v0.2.1.md` (ended at its step 2). Controllers and field IO are designed in `docs/controller.md`.

## Where the work is

v0.5, version `0.5.<n>`: the last number counts the PRs under 0.5 (`0.5.1` is the first), so a build says which PR it was made at.

- **The plan:** `docs/design-v0.5.md`. §3 the order of work (steps 0 to 12), §4 what each step has to know, §5 points with a recommended answer, §6 *Changed during build*, §7 what QA starts from afterwards.
- **The list:** `docs/advancements-v0.5.md`, entries A1 to A75 less the withdrawn. It says what's wanted; where it and the plan disagree, the list wins and the plan is corrected. Tick an entry with its PR number when the PR merges. Don't build from its *Checks* section, from *Decided: nothing to build*, or from a withdrawn entry.
- **Design notes,** each read before the step that builds it: `docs/design-wire-numbering.md` (step 6), `docs/design-wire-labels-and-links.md` (step 7), `docs/design-design-workbench.md` (step 8), with pictures in `docs/mockups/`. Where an entry and its note disagree, the note wins. Two of the notes' pictures (`numbering-sheet8-…`) hold a real project's title block and are in the user's folder only, never the repo.
- **The specification moves with the code.** In the PR that builds an entry, rewrite each statement it changes to say what the build now does, keeping its ID, and take off the strike-through and its *(v0.5: …)* note. A new behaviour gets a new ID at the end of its section.
- **The fixtures:** `src/bench/bms01.ts`, a generic BMS panel, and the LSP-01 example (`scripts/build-lsp01.ts`), for tests and before-and-after pictures. The user's test projects are private and stay on their computer.
- Design's code: `src/core/design.ts` (table, allocation, To draw, interlock ops, Suggest), `wiring.ts` (wired to its channel), `interlocks.ts`, `network.ts` / `networkdraw.ts`; the web side is `DesignView.svelte` and the views it switches between.
- **Settled, and not to creep back:** no Generate tool for plant, recipes or built-in plant types; no Door view and no fascia note in Design; allocation is manual (Suggest only proposes); one controller per panel; Design templates are a list of their own, separate from Draft's.
- **Files:** there's no backwards compatibility before release (A30). A step that changes what a file must hold moves `FORMAT_VERSION` (`src/core/model.ts`) on and reruns the example scripts; a file of any other format is refused with `notOpened()` (`src/core/validate.ts`), naming the Ferrule it needs. Nothing else is owed to old files.
- Tiles: `src/web/tiles.ts` (the tree), `Tiles.svelte`; the active tile's sheet is `editor.pageId`. Detail frames: `frameView` (`ga.ts`) maps a frame to its source sheet.
- Modules are plant items with `module` set (`src/core/modules.ts` helpers, `src/core/controllers.ts` ops); a module view is a `plant-view` with `params.pmod`.
- Builds made off Windows have no exe icon (Bun sets it only on Windows); CI's exe job runs on Windows and its artifact has it.

## How a step runs

- **Before each step,** list the user's `C:\Temp\eCAD\v0.5.0-pre Notes\`. A document there newer than the copy last synced means a ruling has been logged since: stage it, bring the difference into the repo's copy, and build to it.
- One step, one PR, from a branch; split a step where the plan says to, or where it's too big for one. CI (`check`, `exe`, `linux`) must pass; the PR is set to auto-merge (`PUT repos/Cryptdos/ferrule/pulls/<n>/ccr/auto_merge`, squash). GraphQL isn't available; use REST (`gh api`).
- Each PR moves the version in `package.json` on by one (the last number).
- Before a PR: `bun test`, `bun run typecheck`, and look at the result on the fixtures (print view screenshots or the browser).
- Each step ends with: tests for its rules; the README and the decisions table in `docs/DESIGN.md` brought up to date (README screenshots retaken when the interface changes); its entries ticked on the list; the specification rewritten for what it changed.
- **At the end of each numbered step,** push-notify the user with what merged and wait for them to say carry on. Don't stop between the PRs of one step. Also stop, notify and wait when something would be costly to reverse, when a step can't be built as the plan and its note describe it, when an entry and its note contradict each other in a way that changes what's built, or when CI fails in a way that can't be fixed on the same branch.
- Small judgement calls: decide, and note them under §6 *Changed during build* in `docs/design-v0.5.md`. A §5 point the user hasn't answered when its step starts is built to the recommended answer, and the PR says so.
- **Builds are made only when the user asks for one,** not after each PR (A22): run the publish job on `main` (`gh api -X POST repos/Cryptdos/ferrule/actions/workflows/publish.yml/dispatches -f ref=main`), watch it through, and give the user the release's link. It builds Windows and Linux, smoke-tests both (`scripts/smoke-test.ts`) and publishes `v<version>` as a pre-release; nothing is sent at the end of a chat. `-f inputs[dry_run]=true` builds and checks without publishing.
- **After each PR, sync every document that changed** to the user's `C:\Temp\eCAD\v0.5.0-pre Notes\` under the same name (`docs/mockups/…` to `mockups\…`): copy each to `/mnt/user-data/outputs/<unique name>`, wait a few seconds, list the folder for a fresh `mtimeMs`, then `device_commit_files` with `expectedMtimeMs`. Never `force`. List the folder again afterwards and check each file's size against the repo's: a copy just written can be read stale. If the user's computer can't be reached, carry on and sync when it's back.

## Rules

- **No professional references** in code, docs, commits or PRs: no third-party firms, clients, drawing numbers or product names from reference material. Generic examples only. Git history is left as it is.
- **Never commit** the user's test projects, QA copies, reference drawings or notes; they're proprietary and stay in `C:\Temp\eCAD`. From there only these come into the repo: `design-v0.5.md`, `advancements-v0.5.md`, `functional-specification.md`, the three design notes, and the pictures in `mockups\` except the two `numbering-sheet8-…`.
- Projects and distributions start empty; preferred setups go in templates. Nothing is built in: new parts are parts like any other, and new settings start empty or as today.
- Simple, consistent parts; no Swiss-army-knife features. One place for each thing: a value set in two places, or a button doing what another does, is a fault in the step.
- **Chats stay private:** no links to Claude sessions or chats (no `Claude-Session:` line, no session URL) in commits, PR bodies, comments or files. Commits end with one `Co-Authored-By: Claude <model> <noreply@anthropic.com>` line only, naming the model that made the commit (e.g. `Claude Opus 5.5`, `Claude Fable 5.2`), so the history says which model did what; PR bodies end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)` only. Nothing from a chat (names, firms, drawings discussed) goes into the repo.

## Checking your work

- Dev server on a scratch folder: `bun src/server/main.ts --projects /tmp/fproj --no-open --port 4811`.
- The example projects: `bun scripts/build-lsp01.ts /tmp/fproj/lsp-01.ferrule`, `bun scripts/build-bms01.ts /tmp/fproj/bms-01.ferrule`.
- A printed sheet as PNG: rebuild the client first (`bunx vite build`), then `google-chrome --headless --no-sandbox --hide-scrollbars --window-size=2400,1700 --virtual-time-budget=8000 --screenshot=out.png "http://127.0.0.1:4811/print/<project id>?page=<n>"`.
- Interface checks: puppeteer-core with `/usr/bin/google-chrome`; close the browser at the end of the script.
- Grid: 75 columns, 150 × 90 units, 1 unit ≈ 1.847 mm; text sizes in `TEXT_MM` (`src/core/geometry.ts`), nothing under 1.8 mm.
