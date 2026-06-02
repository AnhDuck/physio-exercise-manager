# Physio Exercise Manager Architecture

This is a static browser app. It has no build step, no package dependency, no module system, and no server requirement for normal physio tracking. `index.html` manually loads CSS and JavaScript with `window.PEM_APP_VERSION` cache-busting.

ActivityWatch is the exception: browser CORS requires PEM to run from a local HTTP origin, not `file://`. The user's daily origin is `http://127.0.0.1:8891`; Codex verification should use `http://127.0.0.1:8895`.

Browser verification is an external check, not a project dependency. Do not add, install, import, or probe for standalone Playwright, Puppeteer, headless browser packages, or Node browser automation. Use the Codex in-app browser first, with an isolated visible Chrome/profile fallback only when needed.

## Load Order

CSS order is manual and cascade-sensitive:

`00-base.css`, `10-header.css`, `20-notes-timeline.css`, `30-grid-exercises.css`, `40-modals-forms.css`, `50-settings.css`, `60-tracker.css`, `65-activitywatch.css`, `66-home-cards.css`, `70-images-scrollbar.css`, `90-responsive.css`.

Keep `90-responsive.css` last. See `css/README.md` before changing styles.

JavaScript order is also manual:

`data.js`, `storage.js`, `constants.js`, `state.js`, `dates.js`, `dom.js`, `sessions.js`, `exercises.js`, `grid.js`, `tracker.js`, `activitywatch-data.js`, `home-cards.js`, `weather-card.js`, `activitywatch-mini-card.js`, `timeline-data.js`, `timeline-filters.js`, `timeline-render.js`, `timeline-notes.js`, `timeline-export.js`, `timeline-edit.js`, `timeline.js`, `backup.js`, `auto-backup.js`, `settings.js`, `activitywatch-dashboard-state.js`, `activitywatch-dashboard-format.js`, `activitywatch-dashboard-sync.js`, `activitywatch-dashboard-controls.js`, `activitywatch-dashboard-chart.js`, `activitywatch-dashboard-detail.js`, `activitywatch-dashboard-shell.js`, `activitywatch-settings.js`, `images.js`, `main.js`.

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
- `home-cards.js`: main-screen dashboard card row and refresh timers for the always-on monitor view.
- `weather-card.js`: Open-Meteo weather card, Open-Meteo/CAMS air quality, Environment Canada MSC GeoMet current conditions/hourly forecasts/sun times/alerts for Canadian locations, current details including AQI-or-humidity/wind/UV/sun times, local Google Weather set-4 SVG condition icons from `assets/weather-icons/google-weather-set-4/light/`, daily-brain advisory/highlight/mood rules, Open-Meteo WMO weather-state previews, location search, cached weather result, request throttling/rate-limit cooldowns, and weather Settings controls. For Canadian locations, Environment Canada is the primary weather source when available; Open-Meteo remains the outside-Canada fallback and may fill Canada gaps such as UV or air quality. The status line must identify these sources clearly. Air-quality brain advisories start at unhealthy AQI levels (`101+`) and include timing when the peak is later; lower AQI values stay as quiet tile data.
- `activitywatch-mini-card.js`: current waking-day ActivityWatch mini dashboard card.
- `activitywatch-dashboard-*.js`: ActivityWatch category dashboard. See `docs/activitywatch.md`.
- `activitywatch-settings.js`: ActivityWatch Settings tab controls.
- `timeline-*.js`: notes, events, Markdown, filters, export, and edit flows.
- `backup.js`: JSON import/export and validation.
- `auto-backup.js`: folder backup, health banner, and backup history.
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

Dashboard card preferences, weather request cooldown metadata, and the cached last weather result live inside `pem_settings.homeCards` so backups and imports continue to use the existing settings safe-save path. Weather, air quality, and official-alert refreshes share the same weather cadence to avoid extra background polling.

All app-data writes must go through safe-save helpers in storage internals. Do not call `localStorage.setItem` directly for app keys outside storage internals.

## Core Data Rules

- Dates are local `YYYY-MM-DD`; use `toDateStr()` and `dateFromStr()`.
- `DEFAULT_EXERCISES` only seeds new installs when `pem_exercises` is missing.
- Hidden exercises stay in `pem_exercises` to preserve linked session and timeline data.
- Exercise blocks are group-scoped in `settings.blocks[group]`; exercises store only `blockId`.
- Stored events are `note`, `dose-change`, and `exercise-added`. Timeline exercise logs are derived from session progress and must not be stored in `pem_events`.
- Folder auto-backup writes a dated daily file plus `physio-exercise-auto-backup-latest.json`, reads and validates latest after writing, cleans old dated files, and records status/history.

## Where To Edit

- Schedule/date bugs: `dates.js`, then `grid.js` if rendering is affected.
- Exercise add/edit/order/block behavior: `exercises.js` and `settings.js`.
- Set tracker/timer/log behavior: `tracker.js`, `sessions.js`, and timeline renderers if log display changes.
- Timeline note/event behavior: `timeline-*.js`.
- Backup/import/export: `backup.js`, `auto-backup.js`, and storage helpers.
- ActivityWatch sync/storage/query: `activitywatch-data.js` only when the query or stored aggregate changes.
- ActivityWatch dashboard UI: `activitywatch-dashboard-*.js`.
- ActivityWatch setup/settings UI: `activitywatch-settings.js` and the ActivityWatch settings markup in `index.html`.
- Main-screen dashboard cards: `home-cards.js`, the specific card file, and `66-home-cards.css`. Weather and ActivityWatch mini-card controls live in the Dashboard Settings markup in `index.html`.
