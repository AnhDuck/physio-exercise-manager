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

Do not run shell-launched headless browser automation, Playwright, Puppeteer, or Node browser automation here; local headless/GPU support is unreliable.

If the in-app browser fails and browser verification is still valuable, use an isolated temporary Chrome profile/window. Do not attach to or automate the user's active Chrome session unless login/cookies/extensions are required and the user explicitly approves it.

If launching fallback Chrome with `Start-Process`, every argument must be a separate complete `-ArgumentList` item, and path values must stay attached to their switch, for example `--user-data-dir=C:\...\profile`.

## What To Cover

For broad local UI checks, cover compact grid, notes, settings, set tracker, backup warnings, image modal entry points, and ActivityWatch dashboard interactions when ActivityWatch changed.

For ActivityWatch dashboard changes, smoke-check:

- dashboard opens and closes
- visible header version matches the expected version
- range select and pager render
- chart day selection works
- category hover/filter behavior still works
- Day/Range detail toggle works
- advanced sync panel opens and shows date options

Always report whether browser verification was in-app automated, visible-browser/CDP based, manual, or skipped.
