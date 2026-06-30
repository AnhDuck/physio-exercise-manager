# ActivityWatch Notes

ActivityWatch integration is read-only against the user's local ActivityWatch server, default `http://127.0.0.1:5600`. In plain language, `127.0.0.1` and `localhost` mean this same PC; the ActivityWatch service is not on the public internet.

Do not add dependencies, build tooling, a query helper package, or a server-side proxy. PEM uses browser `fetch`.

## Storage And Privacy

`pem_activitywatch` must stay aggregate-only:

- daily total active seconds
- category totals
- category colors
- optional diagnostic app totals
- bucket/status metadata
- sync timestamps

Never store raw ActivityWatch titles, URLs, domains, or raw events in PEM. Backups, imports, data health, and storage usage must include `pem_activitywatch`, and writes must use the same safe-save path as other app data.

## CORS And Origins

ActivityWatch sync cannot work from `file://`; the rest of PEM can still run from direct-file mode.

The user's stable app origin is `http://127.0.0.1:8891`. `Start PEM Localhost.bat` starts that server and opens the app. Codex verification should use `http://127.0.0.1:8895` unless explicitly asked otherwise.

For the user's current checked `aw-server` module, primary config guidance is:

- Edit `aw-server/aw-server.toml`.
- In `[server]`, change `#cors_origins = ""` to `cors_origins = "http://127.0.0.1:8891"`.
- Leave ActivityWatch's `#port = "5600"` alone.

Keep the Settings tab guidance setup-first: checklist cards first, diagnostics hidden under Advanced. The TOML help must show the disabled line, active replacement line, complete example, and failing examples for commented, nested, page-path, and `[server-testing]` edits. Rust `cors = ["http://127.0.0.1:8891"]` belongs only in Advanced for installs where `aw-server-rust` is checked.

## Query Rules

ActivityWatch query code should mirror ActivityWatch's canonical desktop query shape:

- window bucket plus AFK bucket
- `not-afk` filtering
- focused browser bucket events through `split_url_events`
- audible browser events counted as active when available
- ActivityWatch category rules and colors from `/api/0/settings`

Use exact bucket IDs with `query_bucket("bucket-id")`. Use `find_bucket(...)` only for prefix IDs ending in `_`.

PEM waking-day periods are based on `settings.personalDayStartTime`. If ActivityWatch `startOfDay` differs, warn but do not block sync.

Startup, dashboard, and timeline sync should cover the current waking day plus previous 7 waking days and use a roughly 60-second throttle unless the user manually refreshes.

ActivityWatch fetch requests use a 30-second timeout before PEM reports the local server request as timed out.

The main-screen ActivityWatch mini card is a glanceable current waking-day surface. It should refresh only the current waking day, default to about every 5 minutes, show stale/offline state clearly, and keep using the aggregate-only `pem_activitywatch` data model. Its category list should show all available categories with duration and percentage, using an internal scroll area instead of making the card taller. The mini card has a persisted `Categories` / `Groups` switch saved in `settings.homeCards.activityWatchMini.categoryMode`; `Groups` is the default and combines exact paths such as `Work > 3D` into top-level groups for the card rows and stacked bar without changing stored ActivityWatch summaries.

## Dashboard Rules

The dashboard is a small three-view analytics surface, not one chart with global filters. Dashboard UI state is not persisted. The single dashboard state object includes view mode, chart grain, rolling-average toggle, workload basis, selected date, range length/end date, category mode, selected category, hovered category, detail mode, show-all state, chart scroll state, and advanced sync state.

Default range is Last 2 weeks ending on the current waking day. Opening the dashboard selects the current waking day when visible. Range paging jumps by the selected range length. Latest returns to the current waking-day range.

ActivityWatch dashboard coverage starts on 2026-04-17. Earlier dates are treated as no data and excluded from averages. Missing/unsynced dates are excluded from average denominators; true synced zero-activity days count as zero.

If the page is refreshed while the ActivityWatch dashboard is open, reopen the dashboard on startup using tab-scoped session state. Closing the dashboard clears that restore flag; this is UI state only and must not be saved into backup/app data.

Dashboard control hierarchy is intentionally split:

- Modal header is app-level only: `ActivityWatch`, combined sync/refresh, Advanced, and Close. The combined sync/refresh button is the everyday action and refreshes only the latest 3 waking days.
- View tabs sit under the modal titlebar and are `Exposure`, `Workload`, and `Breakdown`.
- Chart controls own the visible date/view state: chart title, visible date range, adjacent previous/next buttons, range dropdown, Today button, `Daily / Weekly`, and view-specific controls.
- `Stack by: Categories / Groups` appears only in Breakdown. Workload has `Total load / Work only`. Daily chart grain has a floating chart-corner `7-day average` checkbox, checked by default, in Exposure, Workload, and Breakdown. Weekly grain hides the checkbox and average line while preserving the in-memory checked state.
- Right panel owns selected day/week/range analytics and must be contextual to the current view.
- Advanced panel owns sync/debug/metadata such as desktop, ActivityWatch version, server URL, bucket IDs, cached days, day start, and last sync. Advanced resync uses exact date strings through `maybeSyncActivityWatchDateStrings(...)`.

Chart interaction:

- Default view is Exposure with Daily grain.
- Exposure answers how much active computer use happened and how much was Computer Work. Daily Exposure shows total computer active time with Computer Work highlighted. Weekly Exposure groups Monday-Sunday and shows average computer active time per synced day.
- Workload answers how much tendon/load exposure happened. Daily Workload splits Computer Work, muted computer remainder, and Physical work estimate. Weekly Workload groups Monday-Sunday and shows average load per synced day.
- Breakdown answers what caused computer exposure and keeps the stacked category/group chart behavior. The `Categories` / `Groups` toggle switches between exact category paths and top-level category grouping. `Groups` combines paths such as `Work > Katana` and plain `Work` into `Work` for chart segments, side-panel rows, hover, and filters without changing stored ActivityWatch summaries.
- Timed work overlays are computed at render time from `pem_workload` plus `pem_activitywatch`; do not store derived overlay values and do not mutate `pem_activitywatch`.
- Use these terms consistently: `Timed work total` is the Timed Work Today timer/manual total; `Computer work` is ActivityWatch active time in the top-level `Work` category only; `Physical work estimate` is `max(0, Timed work total - Computer work)`; `Computer active time` is all ActivityWatch active computer time; `Total tendon load` is `Computer active time + Physical work estimate`.
- Workload `Total load` is `Computer active time + Physical work estimate`. Workload `Work only` is `Computer work + Physical work estimate`. The physical work estimate subtracts only `Computer work` from `Timed work total` so computer Work is not double-counted.
- Computer work means the top-level `Work` group, using `ACTIVITYWATCH_CATEGORY_JOINER` splitting. The shared overlay math lives in `workload-activitywatch-overlay.js` so the Timed Work card, dashboard, and timeline use the same comparison.
- Daily 7-day average is fixed at 7 days for v1. Each point is aligned to that day's bar and averages that day plus the previous 6 local waking-day dates. Exposure averages Computer active time. Workload averages the active load basis, including `Work only` when selected. Breakdown averages the currently plotted metric: total Computer active time when unfiltered, or the locked category/group when filtered. Hover previews must not change the average line. Tooltip text must state the date, metric, and average value.
- Weekly grain buckets run Monday through Sunday. Edge/current weeks may be partial. Weekly bars show average per synced day, while tooltips/right panel also show weekly total and synced-day count.
- Breakdown unfiltered bars include computed `Other` so visible stacks add up to total active time.
- `Other` is informational only and must not become a filter chip or locked filter.
- Bar click selects the day or week.
- Category hover/lock behavior is scoped to Breakdown. Detail rows lock exact categories with one click; clicking the locked row clears it. Before lock, hover previews that category and dims unrelated categories. Once locked, unrelated hover/click must not preview or switch until `All categories` clears the lock.
- Filtered Breakdown charts show only the locked category and rescale the y-axis to that category's own daily/weekly max.

Right panel:

- Exposure shows selected day/week and visible range at the same time. The selected section uses total computer active time as the heading value and shows only Computer Work plus work share. The visible-range section shows range total, Computer Work, work share, daily average, synced-day count, and highest/lowest day.
- Workload shows selected day/week and visible range at the same time. Each section uses the current load basis as the heading value. Supporting rows show Computer active time, Computer Work, Physical work estimate, Timed work total, and range context without repeating the heading value; range conflict warnings stay in the visible-range section.
- Breakdown day/week mode shows selected categories/groups with swatch, name, duration, percent, and meter. Range mode aggregates visible days and uses percent of visible-range active total. Show top categories by default, with Show all / Show top categories.
- Breakdown keeps the right panel detail scope control labeled `Details`, visually reading as tabs for `Selected day` or `Selected week` / `Visible range`, distinct from the chart toolbar's segmented controls.
- Timeline day headers may show compact chips for `Computer active time` and `Total tendon load`. Their hover text should explain what each value means, and copied timeline Markdown should include a short load-terms explanation plus per-day load summaries when copied days have ActivityWatch/timed work data.
- Hard-coded ActivityWatch methodology changes are metadata annotations only. Use visible label `Methodology change` and tooltip/copy phrase `Break in series` to mean ActivityWatch data before and after that date may not be directly comparable because collection/classification changed. These markers must not mutate, recalculate, backfill, or store derived data in `pem_activitywatch`.
- Methodology-change markers appear as subtle cyan/blue dashed chart markers behind the bars in dashboard views, distinct from the yellow 7-day average line. When the visible dashboard range includes a marked date, show a compact `Methodology change` notice near the range controls instead of inside the right detail panel. Hover/focus text should show the date, `Methodology change`, `Break in series`, and the detail text. Timeline day headers should show a compact marker chip, and copied timeline Markdown should include the same note for copied days.

Visual rules:

- Keep category chips and row labels compact without clipping.
- X-axis month context belongs under the relevant day label, not in a separate month band above the bars. Month labels use a compact two-line `day` over `month` treatment and must not clip at desktop or mobile widths. Long ranges intentionally use a wider horizontal scroll area so every daily x-axis label can remain visible.
- Hide or reduce labels on narrow screens rather than letting them overlap.
- Use dashboard-only color mapping/fallback adjustments for visible colors; never rewrite stored ActivityWatch colors.
- Timeline day headers show compact active-time metadata only; do not add separate ActivityWatch rows to the timeline.

## Dashboard File Ownership

- `activitywatch-dashboard-state.js`: constants, hard-coded methodology-change metadata, state, day/week builders, range/date helpers, category lock/hover/highlight helpers.
- `activitywatch-dashboard-format.js`: date labels, chart labels, axis labels, percentages, colors, status labels.
- `activitywatch-dashboard-sync.js`: dashboard UI for advanced sync controls, date selection, sync progress display, and dashboard metadata.
- `activitywatch-dashboard-controls.js`: compact header sync/advanced actions plus view tabs, chart heading, date controls, grain toggle, and view-specific controls.
- `activitywatch-dashboard-chart.js`: dashboard chart renderer, weekly grain, 7-day average overlay, computed `Other`, x-axis labels, scroll behavior, tooltip, and chart category/load math.
- `activitywatch-dashboard-detail.js`: right-side contextual detail panels and Breakdown category rows.
- `activitywatch-dashboard-shell.js`: modal shell, open/close, and render orchestration.
- `activitywatch-model.js`: aggregate storage model, normalization, server URL normalization, localStorage load/save, and public getters.
- `activitywatch-time.js`: ActivityWatch waking-day date/time helpers.
- `activitywatch-query.js`: ActivityWatch REST fetches, bucket discovery, query construction, daily sync period construction, and result normalization.
- `activitywatch-sync-service.js`: data-layer sync orchestration, progress state, status recording, stale-date selection, and render fan-out.
- `activitywatch-display.js`: shared ActivityWatch duration and category-color helpers.
- `activitywatch-timeline-adapter.js`: Timeline chips and Markdown summaries for ActivityWatch and total tendon load.
- `workload-card.js`: Timed Work Today card.
- `workload-activitywatch-overlay.js`: shared render-time ActivityWatch/timed-work overlay math used by Timed Work, dashboard, and timeline surfaces.

Preserve public globals used by other files: `openActivityWatchDashboard` and `renderActivityWatchDashboard`.
