# Workload Today Implementation Prompt

Build an MVP **Workload Today** dashboard feature for `C:\Users\Bill\Desktop\VIBE CODING\physio-exercise-manager`.

Goal: add a simple daily work-load tracker with a built-in one-button timer, manual total editing, and ActivityWatch comparison. This is for RSI/capacity stabilization, not productivity tracking.

## Core Layout

- Add a new **Workload Today** card on the main home dashboard row.
- Workload should effectively replace Weather's priority/space on the main row.
- Do not put timer controls in the header.
- Do not merge Workload into the ActivityWatch card.
- ActivityWatch remains its own card for computer exposure.
- Weather can be demoted to a smaller/optional/less prominent card if needed for space.
- In collapsed dashboard mode, Workload must still look good and clearly show timer state.

## MVP Card Behavior

- Show a large daily total: `Work today: 1h 25m`.
- Show a large primary button:
  - `Start work`
  - while running: `Stop + add`
- When stopped, automatically add the elapsed timer duration to the current personal day's work total.
- Add manual controls directly on the card:
  - `+15m`
  - `+30m`
  - `-15m`
  - compact `Set total` input.
- Add `Reset timer`, with confirmation, for clearing an active/uncommitted timer.
- Use the existing personal day boundary from settings, not midnight.

## Timer Rules

- Persist timer state so reload does not lose an active timer.
- If the timer is running during personal-day rollover, automatically commit elapsed time up to the old day and continue tracking into the new personal day.
- If a timer duration is suspiciously long, flag it as `Needs review` instead of silently treating it as trustworthy.
- Do not build projects, task names, tags, billing-style reports, or detailed session management.

## ActivityWatch Comparison

- Read current-day ActivityWatch data from existing aggregate `pem_activitywatch`.
- Compute computer work from ActivityWatch categories whose top-level group is `Work`.
- Show:
  - `Computer work: 25m`
  - `Manual/physical estimate: 1h 00m`
- Manual/physical estimate should be `max(0, workload total - ActivityWatch work)`.
- If ActivityWatch work exceeds workload total, show a neutral warning like: `Tracked computer work is higher than work total. Check today's total.`

## Storage

- Add a dedicated safe-saved storage model for workload data, likely `pem_workload`.
- Store only daily totals, timer state, review flags, and minimal metadata.
- Include workload data in backup/import/data-health/storage usage.
- Do not call `localStorage.setItem` directly outside storage internals.

## Files Likely Involved

- `index.html`: load new JS file, bump `window.PEM_APP_VERSION`.
- `js/storage.js`: add workload key, normalization, backup/import integration if needed.
- `js/home-cards.js`: render Workload card in the dashboard row and collapsed row.
- New `js/workload-card.js` or similar: Workload UI/state logic.
- `css/66-home-cards.css`: card layout and desktop styling.
- `css/90-responsive.css`: collapsed/mobile/narrow layout.
- `ARCHITECTURE.md`: document new file/storage ownership.
- `docs/verification.md`: add Workload verification checks.
- `css/README.md` only if CSS ownership guidance changes.

## Constraints

- Preserve the flat global-script architecture.
- No imports, exports, modules, dependencies, bundlers, package managers, generated assets, or server layer.
- Use existing DOM helpers and `textContent`/safe DOM construction for user-controlled strings.
- Keep `main.js` last and `90-responsive.css` last.
- Any JavaScript edit must pass:

```powershell
Get-ChildItem -Path js -Filter *.js | Sort-Object Name | ForEach-Object { node --check $_.FullName }
```

## Verification

- Smoke-test the home dashboard at `1536x864`.
- Verify Workload expanded state, collapsed state, timer start/stop/add, reset confirmation, manual total edit, quick add/subtract, reload persistence, and ActivityWatch comparison.
- Use `http://127.0.0.1:8895` for Codex browser checks if browser verification is needed.
- Do not use the user's real `http://127.0.0.1:8891` origin unless explicitly asked.

## Out Of Scope

- Header timer.
- Card drag/reordering.
- Detailed time-entry history UI.
- Full ActivityWatch dashboard redesign.
- Stacking manual work into the ActivityWatch chart.
- Medical scoring or productivity analytics.

## Implementation Order

1. Add storage shape and normalizers.
2. Add Workload card rendering and timer state logic.
3. Integrate card into the home dashboard row and collapsed mode.
4. Add ActivityWatch work comparison.
5. Adjust dashboard row CSS so Workload gets priority and Weather loses priority.
6. Update docs and version.
7. Run JS syntax checks and browser smoke checks.
