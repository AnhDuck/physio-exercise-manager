# Physio Exercise Manager Architecture

This is a static browser app. It has no build step, no package dependency, no module system, and no server requirement for normal physio tracking. `index.html` manually loads CSS and JavaScript with `window.PEM_APP_VERSION` cache-busting.

ActivityWatch is the exception: browser CORS requires PEM to run from a local HTTP origin, not `file://`. The user's daily origin is `http://127.0.0.1:8891`; Codex verification should use `http://127.0.0.1:8895`.

Browser verification is an external check, not a project dependency. Do not add, install, import, or probe for standalone Playwright, Puppeteer, headless browser packages, or Node browser automation. Use the Codex in-app browser first, with an isolated visible Chrome/profile fallback only when needed.

## Load Order

CSS order is manual and cascade-sensitive:

`00-base.css`, `10-header.css`, `20-notes-timeline.css`, `30-grid-exercises.css`, `40-modals-forms.css`, `50-settings.css`, `60-tracker.css`, `65-activitywatch.css`, `66-home-cards.css`, `70-images-scrollbar.css`, `90-responsive.css`.

Keep `90-responsive.css` last. See `css/README.md` before changing styles.

JavaScript order is also manual:

`data.js`, `storage.js`, `constants.js`, `state.js`, `dates.js`, `dom.js`, `sessions.js`, `exercises.js`, `migrations.js`, `grid.js`, `tracker.js`, `activitywatch-model.js`, `activitywatch-time.js`, `activitywatch-query.js`, `activitywatch-sync-service.js`, `activitywatch-display.js`, `activitywatch-timeline-adapter.js`, `dev-sample-data.js`, `workload-card.js`, `workload-activitywatch-overlay.js`, `home-cards.js`, `weather-format.js`, `weather-preview.js`, `weather-normalize.js`, `weather-api.js`, `weather-sync.js`, `weather-settings.js`, `weather-card.js`, `activitywatch-mini-card.js`, `timeline-data.js`, `timeline-filters.js`, `timeline-render.js`, `timeline-notes.js`, `timeline-export.js`, `timeline-edit.js`, `timeline.js`, `backup.js`, `auto-backup-policy.js`, `auto-backup-fs.js`, `auto-backup-service.js`, `auto-backup-ui.js`, `settings.js`, `activitywatch-dashboard-state.js`, `activitywatch-dashboard-format.js`, `activitywatch-dashboard-sync.js`, `activitywatch-dashboard-controls.js`, `activitywatch-dashboard-chart.js`, `activitywatch-dashboard-detail.js`, `activitywatch-dashboard-shell.js`, `activitywatch-settings.js`, `images.js`, `main.js`.

Never load `main.js` before feature files it binds. Do not add imports, exports, modules, dependencies, bundlers, browser automation packages, or build tooling.

## File Ownership

- `data.js`: default exercises, default groups, and settings-backed group registry helpers.
- `storage.js`: localStorage keys, safe-save helpers, storage health, atomic multi-key replacement/rollback, persisted settings defaults, and canonical auto-backup settings normalization.
- `constants.js`: labels and static copy shared across features.
- `state.js`: mutable app globals and the thin startup migration coordinator.
- `migrations.js`: versioned, pure draft transformations, migration validation, schema-version rules, and the post-commit live-state replacement.
- `dates.js`: the only shared local-date, time-validation, personal-day, local-ISO, calendar, and schedule implementation.
- `dom.js`: DOM helpers, icons, and toasts.
- `sessions.js`: exercise completion and set progress.
- `exercises.js`: exercise ordering, blocks, drag/drop, add/edit/hide/delete, and the per-exercise Quick complete option.
- `grid.js`: compact calendar grid and week navigation.
- `tracker.js`: set tracker, timer, Quick complete logging, log edit, cues, and shortcuts.
- `activitywatch-model.js`: ActivityWatch aggregate storage shape, normalization, server URL normalization, localStorage load/save, public getters, and bucket/status normalization.
- `activitywatch-time.js`: ActivityWatch waking-day date/time helpers that wrap PEM's local date helpers and personal-day start setting.
- `activitywatch-query.js`: ActivityWatch REST fetch helpers, bucket discovery, query construction, query result normalization, and daily sync period construction.
- `activitywatch-sync-service.js`: ActivityWatch sync orchestration, progress state, status recording, stale-date selection, and render fan-out after sync/save.
- `activitywatch-display.js`: shared ActivityWatch category color and duration display helpers.
- `activitywatch-timeline-adapter.js`: ActivityWatch timeline chips and Markdown summary adapters.
- `dev-sample-data.js`: Codex verification-only sample seed for `http://127.0.0.1:8895`; it refreshes Abbotsford Weather, representative ActivityWatch data, Timed Work source totals, and a sample timeline note on every page load before render so UI checks exercise populated dashboard and timeline states. It must not run on the user's real `8891` origin.
- `home-cards.js`: main-screen dashboard card row, in-memory collapsed/expanded state, downward-scroll auto-collapse, manual dashboard toggle, and refresh timers for the always-on monitor view.
- `workload-card.js`: optional Timed Work Today dashboard card, Dashboard Settings visibility/timer-cue controls, one-button timed work timer, page-close pause/auto-resume, whole-app running border, start/reminder sound cues, quick total adjustments, personal-day rollover splitting, and long-timer review flagging.
- `workload-activitywatch-overlay.js`: shared render-time Timed Work plus ActivityWatch overlay math used by the Timed Work card, ActivityWatch dashboard, and timeline summaries.
- `weather-format.js`: weather display labels, units, WMO and official condition mapping, icon file mapping for `assets/weather-icons/google-weather-set-4/light/`, source labels, AQHI/UV/wind/sun formatting, and daily-brain advisory/highlight/mood rules.
- `weather-preview.js`: Open-Meteo WMO weather-state preview modes, random preview scenarios, alert preview data, and preview setting normalization.
- `weather-normalize.js`: Open-Meteo and Environment Canada MSC GeoMet current conditions/hourly forecasts/sun times/alerts/AQHI response normalization into the cached weather result shape. Missing numeric metrics remain `null`; zero is preserved only when the provider supplied a real zero.
- `weather-api.js`: Open-Meteo forecast/geocoding/air-quality and Environment Canada fetches, fetch timeout fallback, HTTP/fetch error helpers, and location search API calls.
- `weather-sync.js`: weather refresh orchestration, stale checks, request guards, request burst/rate-limit cooldowns, in-flight refresh state handling, and save/render after refresh.
- `weather-settings.js`: Weather Settings controls, location search UI, selected location apply/clear, refresh interval, AQHI and alerts toggles, and preview controls.
- `weather-card.js`: Weather card DOM rendering only: full and collapsed summary states, setup/loading states, current details including AQHI-or-humidity/wind/UV/sun times, hourly strip, actions, advisory rendering, and the Sources disclosure. For Canadian locations, Environment Canada is the primary weather, hourly UV, and AQHI source; Open-Meteo supplies UV only when the nearest Environment Canada hour has no usable UV value. The compact Sources disclosure lists only available providers; fallback diagnostics and AQHI matching implementation details do not belong in the card. AQHI brain advisories start at moderate AQHI levels (`4+`) and include timing when the peak is later; lower AQHI values stay as quiet tile data.
- `activitywatch-mini-card.js`: current waking-day ActivityWatch mini dashboard card, including the collapsed summary with total active time, stacked activity bar labels, open-dashboard action, and refresh action.
- `activitywatch-dashboard-*.js`: ActivityWatch category dashboard, including metadata-only methodology-change markers. See `docs/activitywatch.md`.
- `activitywatch-settings.js`: ActivityWatch Settings tab controls.
- `timeline-*.js`: notes, events, Markdown, filters, export, and edit flows.
- `backup.js`: JSON import/export, validation, shared restore/import preparation, and empty-browser/meaningful-backup detection helpers. Browser replacement uses the storage transaction primitive.
- `auto-backup-policy.js`: pure backup constants, filenames, retention, scheduling, time, history, health evaluation, and health-format policy helpers.
- `auto-backup-fs.js`: File System Access support, directory picker, permissions, IndexedDB adapters, file read/write/verification, and old-file cleanup. It has no DOM or toast responsibilities.
- `auto-backup-service.js`: folder initialization, listeners, scheduling, live mirroring, manual/scheduled runs, recovery, and success/failure orchestration.
- `auto-backup-ui.js`: Backup settings, Data Health, status pills, history, and receipt rendering. `auto-backup.js` remains only as a compatibility placeholder.
- `settings.js`: settings modal, review markers, combined group/block settings (including arrow-based group/block ordering and exercise assignment drag and drop), and backup UI.
- `images.js`: exercise image upload and URL import.
- `main.js`: guarded startup bootstrap and static event binding. Startup phases should use `runStartupStep(...)` so a failed optional feature logs a non-blocking warning instead of stopping later phases. Static DOM bindings should use the local `bindClick` / `bindChange` / `bindInput` / `bindKeydown` helpers so missing optional controls fail softly and missing required controls warn clearly.

`app.js` is only a pointer. `assets/physio-icon.svg` is the app icon.

## Storage Model

App data lives in browser storage and is scoped by origin. Folder backup permission state is also origin-scoped.

localStorage keys:

- `pem_exercises`: exercise array.
- `pem_sessions`: object keyed by local `YYYY-MM-DD`.
- `pem_settings`: settings object.
- `pem_events`: timeline events.
- `pem_activitywatch`: aggregate ActivityWatch summaries only: daily total active seconds, category totals, category colors, optional diagnostic app totals, bucket/status metadata, and sync timestamps.
- `pem_workload`: Timed Work Today daily totals, active timer state including paused-on-close elapsed time, and review flags.

Dashboard card preferences, including the Timed Work Today visibility toggle, timed-work running-border and reminder-sound settings, weather request cooldown metadata, and the cached last weather result live inside `pem_settings.homeCards` so backups and imports continue to use the existing settings safe-save path. When Timed Work Today is disabled, the home row should return to the old two-card Weather/ActivityWatch layout while preserving `pem_workload` data and active-timer safety cues. Weather, air quality, and official-alert refreshes share the same weather cadence to avoid extra background polling. The dashboard row's collapsed/expanded UI state is intentionally in-memory only; a fresh app load starts expanded. ActivityWatch dashboard UI state is also in-memory only. On the Codex verification origin `http://127.0.0.1:8895`, `dev-sample-data.js` overwrites Weather, ActivityWatch, Timed Work, and sample timeline data on every load so verification does not fall back to empty states.

Exercise group preferences live in `pem_settings.exerciseGroups`. Group IDs such as `arm-day1`, `arm-day2`, and `legs` are stable data keys; labels, colors, display order, and hidden state are settings-backed presentation. Empty groups can be hidden from normal tracking UI, but group IDs are not deleted. `pem_settings.armRotationEnabled` controls only the Day 1 / Day 2 calendar indicators; it does not change exercise availability or completion logic.

All app-data writes must go through safe-save helpers in storage internals. Do not call `localStorage.setItem` directly for app keys outside storage internals.

Load-side app-data parsing also belongs in `storage.js`. Persisted JSON loaders should use `safeParseStorageJson(...)` so one malformed localStorage key cannot crash startup. When a key fails to parse, PEM leaves the raw browser value untouched, records a Data Health warning, returns safe fallback data for the page load, and blocks ordinary saves to that key until a deliberate backup import or restore replaces it.

## Core Data Rules

- Dates are local `YYYY-MM-DD`; use `toDateStr()` and `dateFromStr()`.
- `DEFAULT_EXERCISES` only seeds new installs when `pem_exercises` is missing.
- Hidden exercises stay in `pem_exercises` to preserve linked session and timeline data.
- Exercises with `quickComplete` enabled skip the set tracker on the first day-cell click and write a normal completed set-progress log for the full target set count, so timeline/log display remains compatible with tracked exercises.
- Exercise groups keep stable IDs. Rename, recolor, reorder, or hide groups through `settings.exerciseGroups`; do not rewrite group IDs just to change presentation.
- Exercise blocks are group-scoped in `settings.blocks[group]`; exercises store only `blockId`. In Settings, arrow controls reorder groups and blocks, while exercises can be dragged only between that group's block and Unassigned sections.
- Stored events are `note`, `dose-change`, and `exercise-added`. Timeline exercise logs are derived from session progress and must not be stored in `pem_events`.
- `pem_settings.dataSchemaVersion` is the app-data schema version. New installs receive the current version; saved settings without the field are schema `0`; future versions are left untouched. Backup envelope `version` remains the independent file-format version.
- Startup migrations clone exercises, sessions, settings, events, ActivityWatch, and Timed Work into a draft, validate the complete result, and replace the six app keys through one rollback-capable storage transaction. Live globals change only after every write succeeds.
- Folder auto-backup writes `physio-exercise-auto-backup-latest.json` after normal app-data saves while the folder is connected. It also writes a dated daily file at the scheduled time and rolling hourly recovery files while the app is open. Latest is read back and validated after writes. On startup or folder reconnect, if browser data looks fresh/empty and latest contains meaningful data, PEM prompts before restoring and offers an emergency JSON download first. If the user declines restore, automatic writes hold off while the browser data still looks empty so a good latest file is not overwritten by defaults; manual Backup now warns before replacing latest in that state. Import/folder restore suppresses live mirroring until every app storage key is replaced or rolled back.

## Where To Edit

- Schedule/date bugs: `dates.js`, then `grid.js` if rendering is affected.
- Exercise add/edit/order/block behavior and the combined Groups & Blocks settings UI: `exercises.js` and `settings.js`.
- Set tracker/timer/log behavior: `tracker.js`, `sessions.js`, and timeline renderers if log display changes.
- Timeline note/event behavior: `timeline-*.js`.
- Backup/import/export: `backup.js`, the auto-backup policy/filesystem/service/UI files, and storage helpers.
- Migration/schema behavior: `migrations.js`, `state.js`, and storage transaction helpers.
- Date/time or waking-day behavior: `dates.js`, with feature-specific wrappers in Timeline, ActivityWatch, Timed Work, and backup policy.
- Folder backup policy/filesystem/orchestration/UI: `auto-backup-policy.js`, `auto-backup-fs.js`, `auto-backup-service.js`, and `auto-backup-ui.js`.
- ActivityWatch storage/model: `activitywatch-model.js` when the stored aggregate shape, server URL normalization, or public getters change.
- ActivityWatch date helpers: `activitywatch-time.js`.
- ActivityWatch query/API mechanics: `activitywatch-query.js`.
- ActivityWatch sync orchestration/progress: `activitywatch-sync-service.js`.
- ActivityWatch shared display helpers: `activitywatch-display.js`.
- ActivityWatch timeline summaries: `activitywatch-timeline-adapter.js`.
- ActivityWatch dashboard UI: `activitywatch-dashboard-*.js`.
- ActivityWatch setup/settings UI: `activitywatch-settings.js` and the ActivityWatch settings markup in `index.html`.
- Main-screen dashboard cards: `home-cards.js`, the specific card file, `66-home-cards.css`, and responsive overrides in `90-responsive.css`. Timed work storage helpers live in `storage.js`; Weather and ActivityWatch mini-card controls live in the Dashboard Settings markup in `index.html`.
