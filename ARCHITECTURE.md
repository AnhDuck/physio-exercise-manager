# Physio Exercise Manager Architecture

This is a static browser app. It has no build step, no package dependency, no module system, and no server requirement for normal physio tracking. `index.html` manually loads CSS and JavaScript with `window.PEM_APP_VERSION` cache-busting.

ActivityWatch is the exception: browser CORS requires PEM to run from a local HTTP origin, not `file://`. The user's daily origin is `http://127.0.0.1:8891`; Codex verification should use `http://127.0.0.1:8895`.

Browser verification is an external check, not a project dependency. Do not add, install, import, or probe for standalone Playwright, Puppeteer, headless browser packages, or Node browser automation. Use the Codex in-app browser first, with an isolated visible Chrome/profile fallback only when needed.

## Load Order

CSS order is manual and cascade-sensitive:

`00-base.css`, `10-header.css`, `20-notes-timeline.css`, `30-grid-exercises.css`, `40-modals-forms.css`, `50-settings.css`, `60-tracker.css`, `65-activitywatch.css`, `66-home-cards.css`, `70-images-scrollbar.css`, `90-responsive.css`.

Keep `90-responsive.css` last. See `css/README.md` before changing styles.

JavaScript order is also manual:

`data.js`, `storage.js`, `constants.js`, `state.js`, `dates.js`, `dom.js`, `sessions.js`, `exercises.js`, `grid.js`, `tracker.js`, `activitywatch-data.js`, `dev-sample-data.js`, `workload-card.js`, `home-cards.js`, `weather-format.js`, `weather-preview.js`, `weather-normalize.js`, `weather-api.js`, `weather-sync.js`, `weather-settings.js`, `weather-card.js`, `activitywatch-mini-card.js`, `timeline-data.js`, `timeline-filters.js`, `timeline-render.js`, `timeline-notes.js`, `timeline-export.js`, `timeline-edit.js`, `timeline.js`, `backup.js`, `auto-backup.js`, `settings.js`, `activitywatch-dashboard-state.js`, `activitywatch-dashboard-format.js`, `activitywatch-dashboard-sync.js`, `activitywatch-dashboard-controls.js`, `activitywatch-dashboard-chart.js`, `activitywatch-dashboard-detail.js`, `activitywatch-dashboard-shell.js`, `activitywatch-settings.js`, `images.js`, `main.js`.

Never load `main.js` before feature files it binds. Do not add imports, exports, modules, dependencies, bundlers, browser automation packages, or build tooling.

## File Ownership

- `data.js`: default exercises and groups.
- `storage.js`: localStorage keys, safe-save helpers, and local date helpers.
- `constants.js`: labels and static copy shared across features.
- `state.js`: mutable app globals and migrations.
- `dates.js`: calendar and schedule logic.
- `dom.js`: DOM helpers, icons, and toasts.
- `sessions.js`: exercise completion and set progress.
- `exercises.js`: exercise ordering, blocks, drag/drop, add/edit/hide/delete.
- `grid.js`: compact calendar grid and week navigation.
- `tracker.js`: set tracker, timer, log edit, cues, and shortcuts.
- `activitywatch-data.js`: ActivityWatch REST client, aggregate storage, sync orchestration.
- `dev-sample-data.js`: Codex verification-only sample seed for `http://127.0.0.1:8895`; it refreshes Abbotsford Weather, representative ActivityWatch data, and Timed Work source totals on every page load before render so UI checks exercise populated dashboard states. It must not run on the user's real `8891` origin.
- `home-cards.js`: main-screen dashboard card row, in-memory collapsed/expanded state, downward-scroll auto-collapse, manual dashboard toggle, and refresh timers for the always-on monitor view.
- `workload-card.js`: optional Timed Work Today dashboard card, Dashboard Settings visibility/timer-cue controls, one-button timed work timer, page-close pause/auto-resume, whole-app running border, start/reminder sound cues, quick total adjustments, personal-day rollover splitting, long-timer review flagging, and shared ActivityWatch/timed-work overlay comparison helpers.
- `weather-format.js`: weather display labels, units, WMO and official condition mapping, icon file mapping for `assets/weather-icons/google-weather-set-4/light/`, source labels, AQHI/UV/wind/sun formatting, and daily-brain advisory/highlight/mood rules.
- `weather-preview.js`: Open-Meteo WMO weather-state preview modes, random preview scenarios, alert preview data, and preview setting normalization.
- `weather-normalize.js`: Open-Meteo and Environment Canada MSC GeoMet current conditions/hourly forecasts/sun times/alerts/AQHI response normalization into the cached weather result shape.
- `weather-api.js`: Open-Meteo forecast/geocoding/air-quality and Environment Canada fetches, fetch timeout fallback, HTTP/fetch error helpers, and location search API calls.
- `weather-sync.js`: weather refresh orchestration, stale checks, request guards, request burst/rate-limit cooldowns, in-flight refresh state handling, and save/render after refresh.
- `weather-settings.js`: Weather Settings controls, location search UI, selected location apply/clear, refresh interval, AQHI and alerts toggles, and preview controls.
- `weather-card.js`: Weather card DOM rendering only: full and collapsed summary states, setup/loading states, current details including AQHI-or-humidity/wind/UV/sun times, hourly strip, actions, advisory rendering, and Sources chip tooltip DOM. For Canadian locations, Environment Canada is the primary weather and AQHI source, while current UV now prefers Open-Meteo and falls back to Environment Canada hourly UV when Open-Meteo does not provide a usable current value. The status line uses one compact Sources chip with a hover/focus tooltip listing providers, and the AQHI tooltip detail includes the nearest Environment Canada AQHI region chosen from the local search area. AQHI brain advisories start at moderate AQHI levels (`4+`) and include timing when the peak is later; lower AQHI values stay as quiet tile data.
- `activitywatch-mini-card.js`: current waking-day ActivityWatch mini dashboard card, including the collapsed summary with total active time, stacked activity bar labels, open-dashboard action, and refresh action.
- `activitywatch-dashboard-*.js`: ActivityWatch category dashboard, including metadata-only methodology-change markers. See `docs/activitywatch.md`.
- `activitywatch-settings.js`: ActivityWatch Settings tab controls.
- `timeline-*.js`: notes, events, Markdown, filters, export, and edit flows.
- `backup.js`: JSON import/export, validation, shared restore rollback, and empty-browser/meaningful-backup detection helpers.
- `auto-backup.js`: folder backup, live latest-file mirror, empty-browser recovery prompt, health banner, and backup history.
- `settings.js`: settings modal, review markers, block settings, and backup UI.
- `images.js`: exercise image upload and URL import.
- `main.js`: bootstrap and static event binding.

`app.js` is only a pointer. `assets/physio-icon.svg` is the app icon.

## Storage Model

App data lives in browser storage and is scoped by origin. Folder backup permission state is also origin-scoped.

localStorage keys:

- `pem_exercises`: exercise array.
- `pem_sessions`: object keyed by local `YYYY-MM-DD`.
- `pem_settings`: settings object.
- `pem_events`: timeline events.
- `pem_activitywatch`: aggregate ActivityWatch summaries only.
- `pem_workload`: Timed Work Today daily totals, active timer state including paused-on-close elapsed time, and review flags.

Dashboard card preferences, including the Timed Work Today visibility toggle, timed-work running-border and reminder-sound settings, weather request cooldown metadata, and the cached last weather result live inside `pem_settings.homeCards` so backups and imports continue to use the existing settings safe-save path. When Timed Work Today is disabled, the home row should return to the old two-card Weather/ActivityWatch layout while preserving `pem_workload` data and active-timer safety cues. Weather, air quality, and official-alert refreshes share the same weather cadence to avoid extra background polling. The dashboard row's collapsed/expanded UI state is intentionally in-memory only; a fresh app load starts expanded. ActivityWatch dashboard overlay toggles are also in-memory only. On the Codex verification origin `http://127.0.0.1:8895`, `dev-sample-data.js` overwrites Weather, ActivityWatch, and Timed Work sample data on every load so verification does not fall back to empty states.

All app-data writes must go through safe-save helpers in storage internals. Do not call `localStorage.setItem` directly for app keys outside storage internals.

## Core Data Rules

- Dates are local `YYYY-MM-DD`; use `toDateStr()` and `dateFromStr()`.
- `DEFAULT_EXERCISES` only seeds new installs when `pem_exercises` is missing.
- Hidden exercises stay in `pem_exercises` to preserve linked session and timeline data.
- Exercise blocks are group-scoped in `settings.blocks[group]`; exercises store only `blockId`.
- Stored events are `note`, `dose-change`, and `exercise-added`. Timeline exercise logs are derived from session progress and must not be stored in `pem_events`.
- Folder auto-backup writes `physio-exercise-auto-backup-latest.json` after normal app-data saves while the folder is connected. It also writes a dated daily file at the scheduled time and rolling hourly recovery files while the app is open. Latest is read back and validated after writes. On startup or folder reconnect, if browser data looks fresh/empty and latest contains meaningful data, PEM prompts before restoring and offers an emergency JSON download first. If the user declines restore, automatic writes hold off while the browser data still looks empty so a good latest file is not overwritten by defaults; manual Backup now warns before replacing latest in that state. Import/folder restore suppresses live mirroring until every app storage key is replaced or rolled back.

## Where To Edit

- Schedule/date bugs: `dates.js`, then `grid.js` if rendering is affected.
- Exercise add/edit/order/block behavior: `exercises.js` and `settings.js`.
- Set tracker/timer/log behavior: `tracker.js`, `sessions.js`, and timeline renderers if log display changes.
- Timeline note/event behavior: `timeline-*.js`.
- Backup/import/export: `backup.js`, `auto-backup.js`, and storage helpers.
- ActivityWatch sync/storage/query: `activitywatch-data.js` only when the query or stored aggregate changes.
- ActivityWatch dashboard UI: `activitywatch-dashboard-*.js`.
- ActivityWatch setup/settings UI: `activitywatch-settings.js` and the ActivityWatch settings markup in `index.html`.
- Main-screen dashboard cards: `home-cards.js`, the specific card file, `66-home-cards.css`, and responsive overrides in `90-responsive.css`. Timed work storage helpers live in `storage.js`; Weather and ActivityWatch mini-card controls live in the Dashboard Settings markup in `index.html`.
