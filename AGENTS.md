# Physio Exercise Management - Agent Guide

## What This App Is

This is a personal physiotherapy exercise tracker. It is a static web app with no build step, no server, and no package dependencies. Open `index.html` directly in a browser or host the repo root on a static site service such as GitHub Pages.

All user data is stored in browser `localStorage`.

Folder backup state also depends on browser-origin scoped IndexedDB and File System Access permissions. A folder selected on one origin, such as `http://127.0.0.1:8891`, is not automatically connected on another port or under `file://`. Do not conclude backup is broken solely because a different origin lacks the selected folder; verify on the same origin or report that the new origin has separate backup settings.

## File Layout

```text
physio-exercise-manager/
|-- index.html          App shell; loads CSS and JavaScript in order
|-- css/
|   `-- styles.css      Dark theme, compact grid layout, modals, tracker UI
|-- js/
|   |-- data.js         DEFAULT_EXERCISES and GROUPS config
|   |-- storage.js      localStorage helpers and local date helpers
|   |-- constants.js    Shared constants, labels, and quote text
|   |-- state.js        Shared mutable app state and startup helpers
|   |-- dates.js        Calendar, week, and schedule helpers
|   |-- dom.js          DOM construction helpers and toast feedback
|   |-- sessions.js     Session, completion, and set-progress helpers
|   |-- exercises.js    Exercise ordering, blocks, drag/drop, and edit modal logic
|   |-- grid.js         Calendar grid rendering and week navigation
|   |-- tracker.js      Set tracker, timer UI, log editing, cues, and shortcuts
|   |-- timeline.js     Notes panel, timeline events, Markdown copy, and event editing
|   |-- backup.js       JSON export/import helpers
|   |-- settings.js     Settings modal, cue settings, review markers, and block settings
|   |-- images.js       Exercise image upload and URL import
|   |-- main.js         Bootstrap and static event bindings
|   `-- app.js          Pointer only; app logic was split into feature files
`-- assets/
    `-- physio-icon.svg App icon
```

Required script order in `index.html`: `js/data.js`, `js/storage.js`, shared helpers, feature files, then `js/main.js`. Do not load `js/main.js` before the feature files it binds.

## App Version and Hosted Freshness

`index.html` defines `window.PEM_APP_VERSION` and shows it in the header beside Settings. Any Codex code edit must bump this version; default to a patch SemVer bump unless the user explicitly asks for minor or major. The same version is used to cache-bust local scripts, so keep it as the single source of truth.

For hosted browser checks, first decide whether browser/UI verification is actually needed. Do not open the browser just to prove every code edit loaded. When browser verification is needed, read the local `PEM_APP_VERSION`, then open `http://127.0.0.1:<port>/index.html?v=<version>` and confirm the visible header shows `v<version>`. If the visible version does not match the local file version, the browser result is invalid: reload with the versioned URL, correct the server/root, or start a correctly rooted server before testing.

Reuse a same-chat/same-workspace local server after a version match. Use a fresh port for new chats, branch/worktree/path changes, stopped servers, or unresolved version mismatches. Do not use a fresh port merely as the default after every small fix because `localStorage`, IndexedDB, and folder backup permissions are browser-origin scoped.

## Exercise Groups

Group keys are fixed and used across data, rendering, CSS, and storage:

```js
'arm-day1' // Arm Day 1
'arm-day2' // Arm Day 2
'legs'     // Legs
```

Group labels and colors live in `GROUPS` in `js/data.js`. Matching CSS colors are defined as `--c-day1`, `--c-day2`, and `--c-legs` in `css/styles.css`.

## Arm Day Rotation

Arm Day 1 and Arm Day 2 are calendar-based, not completion-count-based.

- Anchor date: Friday May 1, 2026.
- Anchor group: `arm-day1`.
- Scheduled arm days are Monday, Wednesday, and Friday.
- Each scheduled arm day after the anchor flips between `arm-day1` and `arm-day2`.
- The logic lives in `getArmDayForDate(dateStr)` in `js/dates.js`.

Do not reintroduce `armSessionCount`; it is stale and not part of the current rotation model.

## localStorage Keys

```text
pem_exercises -> JSON array of Exercise objects
pem_sessions  -> JSON object keyed by YYYY-MM-DD
pem_settings  -> JSON object for UI/settings state
pem_events    -> JSON array of timeline events
```

### Exercise Object

```js
{
  id: string,
  name: string,
  group: 'arm-day1' | 'arm-day2' | 'legs',
  sets: number,
  reps: string,
  resistance: string,
  frequency: string,
  instructions: string,
  image: string | null, // data URL when uploaded/imported
  order: number,
  hiddenAt: string | undefined // ISO timestamp when hidden/restorable
}
```

Defaults live in `DEFAULT_EXERCISES` in `js/data.js` and only seed new installs when `pem_exercises` is missing.
Hidden exercises stay in `pem_exercises` to preserve linked session and timeline data, but are excluded from the active calendar.

### Session Object

```js
{
  completedExercises: string[],
  setProgress: {
    [exerciseId]: {
      completedSets: number,
      targetSets: number,
      startedAt: string,
      updatedAt: string,
      completedAt: string | null,
      finishedEarly: boolean,
      setDurations: number[],
      timerStartedAt: string | null,
      elapsedSeconds: number,
      timerStoppedAt: string | null,
      timerCapped: boolean
    }
  },
  activeExerciseId: string | undefined
}
```

### Settings Object

```js
{
  createdAt: string,
  notesOpen: boolean | undefined,
  personalDayStartTime: string,
  setCueSound: boolean,
  setCueVibrate: boolean,
  setCueSpeech: boolean
}
```

### Event Object

```js
{
  id: string,
  type: 'note' | 'dose-change' | 'exercise-added',
  date: string,
  time: string,
  exerciseId: string | undefined,
  exerciseName: string | undefined,
  text: string | undefined,
  annotation: string | undefined,
  changes: object | undefined,
  createdAt: string,
  updatedAt: string | undefined
}
```

## Set Tracker Behavior

Clicking an exercise/day cell opens the set tracker. `Complete Set` logs one set and advances progress. Clicking the active grid cell completes all sets for that exercise/date. `Pause & Close` stops the timer, saves partial progress, clears `activeExerciseId`, and closes the tracker.

There should be no path that hides the tracker while leaving its timer running.

The real-time set timer must not recreate the tracker or log-edit modal DOM every second. Updating timer text in place is intentional; full rerenders during the timer interval cause hover/focus glitches, duplicate tooltip behavior, and unstable modal inputs.

`Clear` and completed-cell `Clear Log` must confirm before deleting progress.

## Compact Grid

The app uses one spreadsheet-like compact grid view. There is no alternate view toggle and groups stay open:

- Do not add extra full-width action rows.
- Add exercise controls belong in the group header.
- Group header add buttons must stop propagation so header drag/drop behavior is not affected.

## Settings UI Guidance

Settings UI should stay visually consistent across tabs and features.

When adding a setting or settings-managed feature, first reuse the existing settings modal primitives instead of creating feature-specific layout CSS:

- Use `settings-section` for titled groups.
- Use `settings-row-group` for bordered groups of rows.
- Use `settings-action-row` for label/action rows.
- Use `settings-action-label` with `strong` and `span` for row title and supporting text.
- Reuse existing settings button classes such as `settings-clear-review`, `settings-draft-btn`, or `settings-backup-btn` when the button behavior and visual weight match.
- Use `settings-grid` or `settings-status-grid` only when the setting naturally matches those existing patterns.

Avoid custom CSS for new settings features unless it significantly improves visibility, usability, accessibility, or responsive behavior beyond what the existing settings primitives can do. If custom CSS is necessary, keep it minimal and scoped, and layer it on top of the shared settings classes rather than replacing the shared layout.

Before finishing settings UI work, compare the new setting visually with nearby Settings rows for consistent borders, spacing, typography, button styling, and mobile wrapping.

## Editing Guidance

- Use `textContent` or DOM creation helpers for user-controlled strings.
- Keep all date strings local `YYYY-MM-DD`; use `toDateStr()` and `dateFromStr()` from `js/storage.js`.
- Exercise images are stored as data URLs in `pem_exercises`, so large images can hit browser storage limits.
- After JavaScript edits, run:

```powershell
node --check js\data.js
node --check js\storage.js
Get-ChildItem -Path js -Filter *.js | Sort-Object Name | ForEach-Object { node --check $_.FullName }
```

## Browser Verification

Do not run shell-launched headless Chrome, headless Edge, Playwright, Puppeteer, or Node-based browser automation for this repo. This local environment has unreliable headless browser/GPU support, and those checks waste time and tokens when they fail for environment reasons.

For UI verification:

- Always prefer a local static server over opening `index.html` directly. Serve the repo root on `127.0.0.1` with a simple server such as `python -m http.server <port> --bind 127.0.0.1`, choose an available port, and give the user the exact `http://127.0.0.1:<port>/index.html` URL.
- Use the local hosted URL for normal/manual browser checks, then check the compact grid, notes, settings, set tracking, backup warnings, and image modal entry points.
- It is acceptable to use the Codex in-app/visible browser workflow against the local URL for screenshots or interactive checks when visual verification is genuinely useful.
- Keep automated visual checks focused and brief. Do not use them as the default for every change.
- Always report when browser verification was manual, in-app/visible-browser based, or skipped.
