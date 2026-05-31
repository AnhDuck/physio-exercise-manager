# Physio Exercise Management - Agent Guide

Static personal physio tracker. No build step, server dependency, package dependency, module system, bundler, or generated assets. Normal tracking can run by opening `index.html` directly; ActivityWatch sync requires a local `http://127.0.0.1:<port>` origin because browser CORS does not work from `file://`.

Read these first when relevant:

- `ARCHITECTURE.md` for app structure, load order, storage model, and feature ownership.
- `docs/activitywatch.md` for ActivityWatch query, storage, CORS, dashboard, and settings rules.
- `docs/verification.md` for version bumps, checks, and browser verification.
- `css/README.md` before changing CSS.

## Hard Rules

- Any code edit must bump `window.PEM_APP_VERSION` in `index.html`; default to patch SemVer.
- Keep `main.js` last. It binds features loaded before it.
- Keep CSS load order manual and cascade-sensitive; `90-responsive.css` stays last.
- Preserve the flat static global-script architecture. Do not add imports, exports, modules, dependencies, package managers, build tooling, or a proxy/server layer.
- Use `textContent` or DOM helpers for user-controlled strings.
- All app-data writes must go through storage safe-save helpers; do not call `localStorage.setItem` directly for app keys outside storage internals.
- User data is origin-scoped browser storage. Folder backup permissions are also origin-scoped; a folder chosen on `127.0.0.1:8891`, another port, or `file://` is not connected on another origin.
- Do not use the user's production/local origin `http://127.0.0.1:8891` for Codex verification unless explicitly asked. Use `http://127.0.0.1:8895` for Codex checks when browser verification is useful.

## Current Load Order

CSS order in `index.html`:

`00-base.css`, `10-header.css`, `20-notes-timeline.css`, `30-grid-exercises.css`, `40-modals-forms.css`, `50-settings.css`, `60-tracker.css`, `65-activitywatch.css`, `70-images-scrollbar.css`, `90-responsive.css`.

JS order in `index.html`:

`data.js`, `storage.js`, `constants.js`, `state.js`, `dates.js`, `dom.js`, `sessions.js`, `exercises.js`, `grid.js`, `tracker.js`, `activitywatch-data.js`, `timeline-data.js`, `timeline-filters.js`, `timeline-render.js`, `timeline-notes.js`, `timeline-export.js`, `timeline-edit.js`, `timeline.js`, `backup.js`, `auto-backup.js`, `settings.js`, `activitywatch-dashboard-state.js`, `activitywatch-dashboard-format.js`, `activitywatch-dashboard-sync.js`, `activitywatch-dashboard-controls.js`, `activitywatch-dashboard-chart.js`, `activitywatch-dashboard-detail.js`, `activitywatch-dashboard-shell.js`, `activitywatch-settings.js`, `images.js`, `main.js`.

`app.js` is only a pointer; app logic lives in feature files. `assets/physio-icon.svg` is the icon.

## Core App Rules

- Groups are fixed: `arm-day1` (Arm Day 1), `arm-day2` (Arm Day 2), `legs` (Legs). Labels/colors live in `GROUPS` in `data.js`; CSS colors are `--c-day1`, `--c-day2`, `--c-legs`.
- Arm rotation is calendar-based, not completion-count-based: anchor Friday 2026-05-01 = `arm-day1`; scheduled arm days are Monday/Wednesday/Friday; each scheduled arm day after the anchor flips between Day 1 and Day 2. Logic is `getArmDayForDate(dateStr)` in `dates.js`. Do not reintroduce stale `armSessionCount`.
- Dates are local `YYYY-MM-DD`; use `toDateStr()` and `dateFromStr()` from `storage.js`.
- Timeline storage/sorting uses actual calendar dates/times. `personalDayStartTime` only inserts the visual/Markdown boundary for early-morning events; do not rewrite event dates to the previous waking day.
- Hidden exercises remain in `pem_exercises` to preserve linked session/timeline data but are excluded from active calendar.
- Blocks are group-scoped in `settings.blocks[group]`; exercises only store `blockId`. Do not restore legacy exercise-level block title/gap fields.
- Set tracker close paths must stop timers. No path may hide the tracker while leaving its timer running.
- `Clear` and completed-cell `Clear Log` must confirm before deleting progress.
- Preserve `exerciseSnapshot` so old logs survive renamed, hidden, or deleted exercises.
- Compact grid stays one spreadsheet-like grid with group-header add controls; do not add alternate view toggles or full-width action rows.
- Review markers and Settings clear-review flow must stay intact.
- Settings UI should reuse existing primitives before adding custom CSS.

## Required Check

After JavaScript edits run:

```powershell
Get-ChildItem -Path js -Filter *.js | Sort-Object Name | ForEach-Object { node --check $_.FullName }
```
