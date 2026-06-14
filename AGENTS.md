# Physio Exercise Manager - Agent Guide

## How To Work With Bill

- Be concise. Prefer short summaries and clear next steps.
- Explain in plain language for a non-technical user. File names and basic coding terms are fine; avoid deep implementation detail unless asked.
- If a tradeoff matters, explain the practical effect first.
- Before broad architecture, storage, or workflow changes, describe the plan and wait for approval.
- Verify your own changes as much as reasonably needed by default. Do not wait for Bill to ask for verification when behavior, UI, storage, or workflow could have changed.
- Prefer spending extra tool calls on verification over asking Bill to manually validate routine changes.
- When reporting work, say what changed, what was checked, and anything that still needs attention.

## Project Shape

This is a static personal physio tracker. It has no build step, server dependency, package dependency, module system, bundler, generated assets, or proxy/server layer.

Normal tracking can run by opening `index.html` directly. ActivityWatch sync is the exception: browser CORS requires a local `http://127.0.0.1:<port>` origin.

Use these docs as needed instead of keeping every detail here:

- `ARCHITECTURE.md`: app structure, load order, storage model, feature ownership, and where to edit.
- `docs/activitywatch.md`: ActivityWatch query, privacy, CORS, dashboard, and settings rules.
- `docs/verification.md`: version bumps, required checks, and browser verification.
- `css/README.md`: CSS load order and style placement.

## Documentation Rule

When a change affects how future agents should understand, edit, test, or verify the app, update the matching Markdown doc in the same change.

Use:

- `ARCHITECTURE.md` for structure, load order, storage, feature ownership, and where-to-edit guidance.
- `docs/activitywatch.md` for ActivityWatch behavior, privacy, CORS, dashboard, settings, and sync rules.
- `docs/verification.md` for required checks, browser verification, ports, and test guidance.
- `css/README.md` for CSS organization and cascade rules.
- `AGENTS.md` only for durable agent behavior, user communication preferences, and non-negotiable project rules.

## Non-Negotiable Rules

- Any code edit must bump `window.PEM_APP_VERSION` in `index.html`; default to patch SemVer.
- Preserve the flat global-script architecture. Do not add imports, exports, modules, dependencies, package managers, build tooling, generated assets, or a proxy/server layer.
- Do not use standalone Playwright, headless Playwright, Playwright installs, Puppeteer, or Node browser automation for this project. Browser checks should use the Codex in-app browser first, or an isolated visible Chrome/profile fallback only when needed.
- Keep `main.js` last in the manual JS load order. Keep `90-responsive.css` last in the manual CSS load order.
- Use `textContent` or DOM helpers for user-controlled strings.
- App-data writes must go through storage safe-save helpers. Do not call `localStorage.setItem` directly for app keys outside storage internals.
- User data and folder backup permissions are origin-scoped. Do not use the user's real origin `http://127.0.0.1:8891` for Codex verification unless explicitly asked; use `http://127.0.0.1:8895` when browser checks are useful.

## Core Behavior To Protect

- Arm rotation is calendar-based: anchor Friday 2026-05-01 is `arm-day1`; Monday/Wednesday/Friday arm days alternate from there. Do not reintroduce completion-count rotation.
- Dates are local `YYYY-MM-DD`; use the existing date helpers.
- Hidden exercises stay stored so old logs survive. Preserve exercise snapshots for renamed, hidden, or deleted exercises.
- Blocks are group-scoped in settings; exercises only store `blockId`.
- Set tracker close paths must stop timers. Clear/delete progress actions must confirm first.
- Keep the compact grid as one spreadsheet-like grid with group-header add controls.
- Keep review markers and the Settings clear-review flow working.

## Required Check

After JavaScript edits run:

```powershell
Get-ChildItem -Path js -Filter *.js | Sort-Object Name | ForEach-Object { node --check $_.FullName }
```
