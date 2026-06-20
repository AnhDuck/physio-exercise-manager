# Verification

Any code edit must bump `window.PEM_APP_VERSION` in `index.html`; default to patch SemVer. The header displays `v<version>`, and CSS/JS URLs use the version for cache-busting.

## Required JavaScript Check

After JavaScript edits run:

```powershell
Get-ChildItem -Path js -Filter *.js | Sort-Object Name | ForEach-Object { node --check $_.FullName }
```

## Browser Verification

Verify changes as much as reasonably needed by default. Behavior, UI, storage, and workflow changes should include a direct check that the changed behavior works, plus a quick guard that nearby protected behavior still looks intact. Spend tool calls on verification so Bill does not have to manually validate routine changes.

Prefer the stable local dev server over `file://`:

```powershell
python -m http.server 8895 --bind 127.0.0.1
```

First check whether `http://127.0.0.1:8895` is already serving PEM. If it is, reuse it. Do not restart the server for ordinary HTML, CSS, or JavaScript edits; this static server reads files from disk on each request, so a versioned URL reload is enough. Restart or replace the server only when it is unreachable, serving the wrong workspace/root, returning broken responses, blocking required verification, or the user asks for a restart.

Open:

`http://127.0.0.1:8895/index.html?v=<PEM_APP_VERSION>`

Confirm the visible header version matches. If it does not match, the browser result is invalid; reload the versioned URL first. If reload still shows the wrong version, check that `8895` is serving this workspace before restarting anything.

If an agent starts the `8895` dev server for verification, leave it running when finished unless the user asks to stop it, the process is clearly unhealthy, or it is blocking required work. Do not shut it down just as cleanup.

Do not use the user's production/local origin `http://127.0.0.1:8891` for Codex verification unless explicitly requested. That origin is for the user's real browser data, folder backup permission, and ActivityWatch CORS setup. Prefer stable Codex dev origin `http://127.0.0.1:8895` across chats so browser storage and permissions remain consistent.

The `8895` origin intentionally seeds Abbotsford Weather and representative ActivityWatch data on every page load through `js/dev-sample-data.js`. Do not disable that seeding for normal Codex verification; populated dashboard states are the default test surface because empty states miss most layout and behavior regressions.

For Bill's normal desktop layout checks, aim the browser viewport at exactly `1536x864` using the Codex in-app browser viewport override when available. This matches Bill's 1920x1080 monitor at 125% Windows display scaling, because browser layout uses CSS pixels rather than physical monitor pixels. This is the production-like desktop viewport for routine UI verification. Confirm the actual page viewport before trusting the result:

```js
window.innerWidth === 1536 && window.innerHeight === 864
```

The Codex UI may visually scale that viewport down to fit the app pane; that is acceptable. `document.documentElement.clientWidth`, `visualViewport.width`, or screenshots may be a few pixels narrower when a vertical scrollbar is present. If exact `1536x864` cannot be set, use the closest available 16:9 viewport within 20% of those dimensions, then report the exact `window.innerWidth` and `window.innerHeight` used. If the viewport is not 16:9 or is outside that 20% range, treat desktop layout verification as incomplete and say so. Use `1920x1080` only when intentionally testing a true 1920-CSS-pixel-wide desktop layout, not as the default match for Bill's monitor.

## Browser Tool Preference

Use the Codex in-app browser first for local UI verification when available. It is controlled through the `node_repl` MCP tool; if the JS tool is not listed, use tool discovery before declaring browser automation unavailable.

Do not probe for, import, install, or run standalone browser automation packages. This means no Playwright package checks, no `import('playwright')`, no headless Playwright, no Puppeteer, and no shell-launched Node browser automation. This project intentionally has no browser automation dependency.

If a Codex browser plugin exposes an internal API with a Playwright-shaped name, treat it as part of the in-app browser or Chrome plugin surface, not as permission to install or use standalone Playwright. Prefer normal visible-browser actions, DOM/CUA interaction, and screenshots for verification.

If the in-app browser fails and browser verification is still valuable, use an isolated temporary Chrome profile/window. Do not attach to or automate the user's active Chrome session unless login/cookies/extensions are required and the user explicitly approves it.

If launching fallback Chrome with `Start-Process`, every argument must be a separate complete `-ArgumentList` item, and path values must stay attached to their switch, for example `--user-data-dir=C:\...\profile`.

## What To Cover

For broad local UI checks, cover compact grid, notes, settings, set tracker, backup warnings, image modal entry points, and ActivityWatch dashboard interactions when ActivityWatch changed.

For Home Cards changes, smoke-check desktop and mobile widths: the cards appear between the date header and first exercise group, one downward wheel gesture near the top does not auto-collapse the dashboard row, a second downward gesture does, upward scrolling does not auto-expand it, the collapsed row sticks directly under the compact calendar header while exercise rows scroll underneath, the collapsed row keeps Weather and ActivityWatch summaries readable, and the dashboard toggle manually expands/collapses it. Weather setup/search/refresh/clear controls render in the Dashboard Settings tab, Weather location live search starts after typing at least 3 characters and pausing briefly while the Search button and Enter still work, stale/error/rate-limit text is visible when data is missing or old, and ActivityWatch mini still opens the full dashboard from both expanded and collapsed states. Weather's air quality and Environment Canada alert toggles should render in Settings, the card's alert-preview, random-preview, and live-preview reset buttons should stay in sync with the Settings preview dropdown, and the AQHI tile should replace humidity without making the card taller. Weather preview should cover the configured Open-Meteo WMO state options, including mostly clear, drizzle, freezing rain, showers, snow grains, and hail storms. For Canadian locations, the source status line should show one compact Sources chip; its hover/focus tooltip should list weather, UV, and air-quality providers, show Open-Meteo as the normal current UV source with Environment Canada UV only as fallback when current Open-Meteo UV is unavailable, and include the nearest Environment Canada AQHI region used for air quality. Avoid live Open-Meteo fetch testing when the hourly limit is already near or recently exceeded.

For Workload Today changes, smoke-check the expanded and collapsed dashboard card, Start work, Stop + add, Reset timer confirmation, `+15m`, `+30m`, `-15m`, Set total parsing, reload persistence for an active timer, personal-day rollover when practical to simulate, Needs review display for suspiciously long timer spans, and the ActivityWatch comparison lines for Computer work and Manual/physical estimate. Also confirm Data Health storage details include Workload.

For ActivityWatch dashboard changes, smoke-check:

- dashboard opens and closes
- visible header version matches the expected version
- range select and pager render
- chart day selection works
- category hover/filter behavior still works
- Day/Range detail toggle works
- advanced sync panel opens and shows date options

Always report whether browser verification was in-app automated, visible-browser/CDP based, manual, or skipped.
