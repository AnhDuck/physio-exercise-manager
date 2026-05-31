# ActivityWatch Notes

ActivityWatch integration is read-only against the user's local ActivityWatch server, default `http://127.0.0.1:5600`. In plain language, `127.0.0.1` and `localhost` mean this same PC; the ActivityWatch service is not on the public internet.

Do not add dependencies, build tooling, a query helper package, or a server-side proxy. PEM uses browser `fetch`.

## Storage And Privacy

`pem_activitywatch` must stay aggregate-only:

- daily total active seconds
- category totals
- hourly category totals
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

The main-screen ActivityWatch mini card is a glanceable current waking-day surface. It should refresh only the current waking day, default to about every 5 minutes, show stale/offline state clearly, and keep using the aggregate-only `pem_activitywatch` data model. Its category list should show all available categories with duration and percentage, using an internal scroll area instead of making the card taller.

## Dashboard Rules

The dashboard is category-first, not top-application-first. Dashboard UI state is not persisted. The single dashboard state object includes selected date, range length/end date, selected category, hovered category, detail mode, show-all state, chart scroll state, and advanced sync state.

Default range is Last 2 weeks ending on the current waking day. Opening the dashboard selects the current waking day when visible. Range paging jumps by the selected range length. Latest returns to the current waking-day range.

Daily average divides by days with active time, not every visible day.

Top row order on desktop is compact stats, sync/status copy, then actions. Mobile order is status, stats, then actions. `Refresh` is the everyday action and refreshes only the latest 3 waking days. Advanced resync uses exact date strings through `maybeSyncActivityWatchDateStrings(...)`.

Chart interaction:

- Default mode is stacked bars.
- Unfiltered bars include computed `Other` so visible stacks add up to total active time.
- `Other` is informational only and must not become a filter chip or locked filter.
- Bar click selects the day.
- Category segment click locks the exact category only after the day is already selected.
- Detail rows lock exact categories with one click; clicking the locked row clears it.
- Before lock, hover previews that category and dims unrelated categories.
- Once locked, unrelated hover/click must not preview or switch until `All categories` clears the lock.
- Filtered charts show only the locked category and rescale the y-axis to that category's own daily max.

Right panel:

- Day mode shows selected-day categories with swatch, name, duration, percent of that day's active total, and meter.
- Range mode aggregates visible days and uses percent of visible-range active total.
- Show top categories by default, with Show all / Show top categories.

Visual rules:

- Keep category chips and row labels compact without clipping.
- Sparse x-axis labels are expected for 30/90-day ranges.
- Hide or reduce labels on narrow screens rather than letting them overlap.
- Use dashboard-only color mapping/fallback adjustments for visible colors; never rewrite stored ActivityWatch colors.
- Timeline day headers show compact active-time metadata only; do not add separate ActivityWatch rows to the timeline.

## Dashboard File Ownership

- `activitywatch-dashboard-state.js`: constants, state, day builders, range/date helpers, category lock/hover/highlight helpers.
- `activitywatch-dashboard-format.js`: date labels, chart labels, axis labels, percentages, colors, status labels.
- `activitywatch-dashboard-sync.js`: advanced sync panel, date selection, sync progress UI.
- `activitywatch-dashboard-controls.js`: top stats, status, refresh, pager, range select, advanced toggle.
- `activitywatch-dashboard-chart.js`: stacked chart, computed `Other`, month bands, scroll behavior, tooltip, chart category math.
- `activitywatch-dashboard-detail.js`: right-side Day/Range panel and category rows.
- `activitywatch-dashboard-shell.js`: modal shell, open/close, and render orchestration.

Preserve public globals used by other files: `openActivityWatchDashboard` and `renderActivityWatchDashboard`.
