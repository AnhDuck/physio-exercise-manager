# Verification

Any code edit must bump `window.PEM_APP_VERSION` in `index.html`; default to patch SemVer. The header displays `v<version>`, and CSS/JS URLs use the version for cache-busting.

## Required JavaScript Check

After JavaScript edits run:

```powershell
Get-ChildItem -Path js -Filter *.js | Sort-Object Name | ForEach-Object { node --check $_.FullName }
```

## Browser Verification

Only use browser/UI verification when it adds value. Prefer a local static server over `file://`:

```powershell
python -m http.server 8895 --bind 127.0.0.1
```

Open:

`http://127.0.0.1:8895/index.html?v=<PEM_APP_VERSION>`

Confirm the visible header version matches. If it does not match, the browser result is invalid; reload the versioned URL, fix server/root, or start the correct server.

Do not use the user's production/local origin `http://127.0.0.1:8891` for Codex verification unless explicitly requested. That origin is for the user's real browser data, folder backup permission, and ActivityWatch CORS setup. Prefer stable Codex dev origin `http://127.0.0.1:8895` across chats so browser storage and permissions remain consistent.

## Browser Tool Preference

Use the Codex in-app browser first for local UI verification when available. It is controlled through the `node_repl` MCP tool; if the JS tool is not listed, use tool discovery before declaring browser automation unavailable.

Do not probe for, import, install, or run standalone browser automation packages. This means no Playwright package checks, no `import('playwright')`, no headless Playwright, no Puppeteer, and no shell-launched Node browser automation. This project intentionally has no browser automation dependency.

If a Codex browser plugin exposes an internal API with a Playwright-shaped name, treat it as part of the in-app browser or Chrome plugin surface, not as permission to install or use standalone Playwright. Prefer normal visible-browser actions, DOM/CUA interaction, and screenshots for verification.

If the in-app browser fails and browser verification is still valuable, use an isolated temporary Chrome profile/window. Do not attach to or automate the user's active Chrome session unless login/cookies/extensions are required and the user explicitly approves it.

If launching fallback Chrome with `Start-Process`, every argument must be a separate complete `-ArgumentList` item, and path values must stay attached to their switch, for example `--user-data-dir=C:\...\profile`.

## What To Cover

For broad local UI checks, cover compact grid, notes, settings, set tracker, backup warnings, image modal entry points, and ActivityWatch dashboard interactions when ActivityWatch changed.

For Home Cards changes, smoke-check desktop and mobile widths: the cards appear between the date header and first exercise group, Weather setup/search/refresh/clear controls render in the Dashboard Settings tab, stale/error/rate-limit text is visible when data is missing or old, and ActivityWatch mini still opens the full dashboard. Weather's air quality and Environment Canada alert toggles should render in Settings, the card's alert-preview, random-preview, and live-preview reset buttons should stay in sync with the Settings preview dropdown, and the AQI tile should replace humidity without making the card taller. Weather preview should cover the configured Open-Meteo WMO state options, including mostly clear, drizzle, freezing rain, showers, snow grains, and hail storms. Avoid live Open-Meteo fetch testing when the hourly limit is already near or recently exceeded.

For ActivityWatch dashboard changes, smoke-check:

- dashboard opens and closes
- visible header version matches the expected version
- range select and pager render
- chart day selection works
- category hover/filter behavior still works
- Day/Range detail toggle works
- advanced sync panel opens and shows date options

Always report whether browser verification was in-app automated, visible-browser/CDP based, manual, or skipped.
