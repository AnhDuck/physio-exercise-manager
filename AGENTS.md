# Physio Exercise Management - Agent Guide

## What This App Is

This is a personal physiotherapy exercise tracker. It is a static web app with no build step, no server, and no package dependencies. Open `index.html` directly in a browser or host the repo root on a static site service such as GitHub Pages.

All user data is stored in browser `localStorage`.

## File Layout

```text
physio-exercise-manager/
|-- index.html          App shell; loads CSS and JavaScript in order
|-- css/
|   `-- styles.css      Dark theme, grid layout, modals, dense mode, tracker UI
|-- js/
|   |-- data.js         DEFAULT_EXERCISES and GROUPS config
|   |-- storage.js      localStorage helpers and local date helpers
|   |-- constants.js    Shared constants, labels, and quote text
|   |-- state.js        Shared mutable app state and startup helpers
|   |-- dates.js        Calendar, week, and schedule helpers
|   |-- dom.js          DOM construction helpers and toast feedback
|   |-- sessions.js     Session, completion, and set-progress helpers
|   |-- exercises.js    Exercise ordering, blocks, drag/drop, and edit modal logic
|   |-- grid.js         Calendar grid rendering, dense mode, and week navigation
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
  order: number
}
```

Defaults live in `DEFAULT_EXERCISES` in `js/data.js` and only seed new installs when `pem_exercises` is missing.

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
  denseMode: boolean | undefined,
  collapsedGroups: string[] | undefined,
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

## Dense Mode

Dense mode is a spreadsheet-like scan view. Keep it compact:

- Do not add extra full-width rows for dense-only actions.
- Add exercise controls belong in the group header.
- Group header add buttons must stop propagation so they do not collapse groups.

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

For browser verification, open `index.html`, check console errors, and test normal view, dense view, notes, settings, set tracking, and image modal entry points.
