# Physio Exercise Management - Agent Guide

Static personal physio tracker. No build step/server/deps; open `index.html` or host repo root statically. User data is browser `localStorage`; folder backup also depends on browser-origin-scoped IndexedDB + File System Access permissions. A folder chosen on one origin (`127.0.0.1:8891`, another port, or `file://`) is not connected on another origin; verify backup on the same origin before calling it broken.

## Files / load order

`index.html` loads CSS + JS via `PEM_APP_VERSION` cache-busting. CSS order is manual and cascade-sensitive: `00-base.css`, `10-header.css`, `20-notes-timeline.css`, `30-grid-exercises.css`, `40-modals-forms.css`, `50-settings.css`, `60-tracker.css`, `70-images-scrollbar.css`, `90-responsive.css`. Keep `90-responsive.css` last.

JS load order is: `data.js`, `storage.js`, `constants.js`, `state.js`, `dates.js`, `dom.js`, `sessions.js`, `exercises.js`, `grid.js`, `tracker.js`, `timeline-data.js`, `timeline-filters.js`, `timeline-render.js`, `timeline-notes.js`, `timeline-export.js`, `timeline-edit.js`, `timeline.js`, `backup.js`, `auto-backup.js`, `settings.js`, `images.js`, `main.js`. Never load `main.js` before the feature files it binds. `app.js` is only a pointer; app logic lives in feature files. `assets/physio-icon.svg` is the icon.

Module map: `data` defaults/groups; `storage` localStorage + local date helpers; `constants` labels/quotes; `state` mutable globals/migrations; `dates` calendar/schedule; `dom` DOM/toast helpers; `sessions` completion/set progress; `exercises` ordering/blocks/drag/edit; `grid` compact grid/week nav; `tracker` set tracker/timer/log edit/cues/shortcuts; `timeline` notes/events/Markdown/event edit; `backup` JSON import/export/validation; `auto-backup` folder backups; `settings` settings/review/block/backup UI; `images` upload/URL import; `main` bootstrap/static bindings.

## Versioning + browser checks

`index.html` defines `window.PEM_APP_VERSION`, displays `v<version>` in the header, and uses it for script cache-busting. Any Codex code edit must bump it; default to patch SemVer unless asked otherwise.

Only use browser/UI verification when it adds value. For verification, prefer a local static server over `file://`: `python -m http.server <port> --bind 127.0.0.1`, then open `http://127.0.0.1:<port>/index.html?v=<PEM_APP_VERSION>` and confirm the visible header matches. If it does not match, the browser result is invalid; reload the versioned URL, fix server/root, or start the correct server. Reuse a same-chat/same-workspace server after a version match. Use a fresh port for new chats, branch/worktree/path changes, stopped servers, or unresolved version mismatches; do not fresh-port every small fix because `localStorage`, IndexedDB, and folder backup permissions are origin-scoped.

Do not run shell-launched headless Chrome/Edge, Playwright, Puppeteer, or Node browser automation here; local headless/GPU support is unreliable. Visible/in-app browser checks are okay when visual verification is genuinely useful. For UI checks, cover compact grid, notes, settings, set tracker, backup warnings, and image modal entry points. Always report whether browser verification was manual, visible-browser based, or skipped.

## Core app rules

Groups are fixed: `arm-day1` (Arm Day 1), `arm-day2` (Arm Day 2), `legs` (Legs). Labels/colors live in `GROUPS` (`data.js`); CSS colors are `--c-day1`, `--c-day2`, `--c-legs`.

Arm rotation is calendar-based, not completion-count-based: anchor Friday 2026-05-01 = `arm-day1`; scheduled arm days are Monday/Wednesday/Friday; each scheduled arm day after the anchor flips between Day 1 and Day 2; logic is `getArmDayForDate(dateStr)` in `dates.js`. Do not reintroduce stale `armSessionCount`.

Dates are local `YYYY-MM-DD`; use `toDateStr()` / `dateFromStr()` from `storage.js`.

Timeline storage/sorting uses actual calendar dates/times. `personalDayStartTime` only inserts the visual/Markdown boundary `Before <time> · <previous date> waking day` for early-morning events; do not rewrite event dates to the previous waking day.

## Data model

localStorage keys: `pem_exercises` array, `pem_sessions` object keyed by `YYYY-MM-DD`, `pem_settings` object, `pem_events` array. `DEFAULT_EXERCISES` only seeds new installs when `pem_exercises` is missing. Hidden exercises remain in `pem_exercises` to preserve linked session/timeline data but are excluded from active calendar.

Exercise fields: `id`, `name`, `group`, `sets`, `reps`, `resistance`, `frequency`, `instructions`, `image` (data URL/null), `order`, optional `hiddenAt`, `deletedAt`, `blockId`, `changedSinceLastPhysioVisit`. Legacy per-exercise `blockTitle`, `blockMinGapHours`, `blockPreferredGapHours` are migration-only and should not be reintroduced.

Session shape: `{ completedExercises: string[], setProgress: { [exerciseId]: progress }, activeExerciseId? }`. Progress fields: `completedSets`, `targetSets`, `startedAt`, `updatedAt`, `completedAt|null`, `finishedEarly`, `setDurations[]`, `setCompletedAt[]`, `timerStartedAt|null`, `elapsedSeconds`, `timerStoppedAt|null`, `timerCapped`, `exerciseSnapshot|null`.

Settings fields include `createdAt`, `notesOpen?`, `personalDayStartTime`, `setCueSound`, `setCueVibrate`, `setCueSpeech`, `setCueSpeechVolume`, `autoBackup`, `blocks`, `defaultBlocksApplied`. Legacy `legsDays`, `denseMode`, `collapsedGroups`, and `blockTitles` are migration-only.

Stored events are `note`, `dose-change`, and `exercise-added` with `id`, `date`, `time`, optional `exerciseId`, `exerciseName`, `text`, `annotation`, `changes`, `createdAt`, `updatedAt`. Timeline also renders derived `exercise-log` items from session progress; do not store those in `pem_events`.

Blocks are group-scoped: definitions live in `settings.blocks[group]`; exercises only store `blockId`. Settings uses a draft/apply/discard flow for block edits. Moving an exercise to another group clears invalid `blockId`; block-member drag/drop is constrained to the same block. Do not restore legacy exercise-level block title/gap fields.

Folder auto-backup writes a dated daily file plus `physio-exercise-auto-backup-latest.json`, verifies by reading/validating latest, cleans old dated files, records success/error/missed history, and drives Settings backup status + the backup health banner. Do not treat folder backup as simple JSON download; it needs File System Access support, stored directory handles, permission checks, reconnect state, and same-origin testing.

## Behavior constraints

Set tracker: clicking exercise/day opens tracker; `Complete Set` logs one set; clicking the active grid cell completes all sets; `Pause & Close` stops timer, saves partial progress, clears `activeExerciseId`, and closes tracker. No path may hide the tracker while leaving its timer running. Real-time timer updates text in place; do not rerender tracker/log-modal DOM every second because that causes hover/focus glitches, duplicate tooltips, and unstable modal inputs. `Clear` and completed-cell `Clear Log` must confirm before deleting progress.

Log details: calendar day controls grid placement; started-at controls timeline/notes placement; finished-at records final-set time. Historical logs for hidden/deleted/missing exercises open read-only/details-first. Preserve `exerciseSnapshot` so old logs survive renamed/hidden/deleted exercises.

Compact grid: one spreadsheet-like grid, no alternate view toggle, groups stay open. Do not add extra full-width action rows. Add-exercise controls belong in group headers. Group-header add buttons must stop propagation so header drag/drop is unaffected.

Review markers: dose changes and exercise additions can mark `changedSinceLastPhysioVisit`; Settings can clear markers. Do not remove marker rendering or the clear-review flow when editing exercise/settings UI.

Settings UI: first reuse existing primitives before custom CSS: `settings-section`, `settings-row-group`, `settings-action-row`, `settings-action-label` with `strong` + `span`, matching button classes (`settings-clear-review`, `settings-draft-btn`, `settings-backup-btn`), and `settings-grid` / `settings-status-grid` only when they naturally fit. Custom settings CSS must be minimal, scoped, and layered on shared classes. Compare new settings rows against nearby rows for borders, spacing, typography, button styling, and mobile wrapping.

Security/storage: use `textContent` or DOM helpers for user-controlled strings. Exercise images are data URLs inside `pem_exercises`; large images can exceed browser storage.

All app-data writes must go through the safe-save helper; never call `localStorage.setItem` directly for app keys outside storage internals.

The Backup tab is the data control center. Save-failure status outranks data safety and folder-backup health in the shared backup health banner.

## Checks

After JS edits run:

```powershell
Get-ChildItem -Path js -Filter *.js | Sort-Object Name | ForEach-Object { node --check $_.FullName }
```
