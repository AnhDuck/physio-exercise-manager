# Physio Exercise Management — Architecture

## What this is
A personal physiotherapy exercise tracker. Static web app (HTML + CSS + vanilla JS), no build step, no server, no dependencies. All data lives in `localStorage`. Works by opening `index.html` in a browser or hosting on GitHub Pages.

## File layout
```
physio-exercise-manager/
├── index.html          App shell; loads CSS then the three JS files in order
├── css/
│   └── styles.css      Dark theme; CSS custom properties for all colours; week-grid layout
├── js/
│   ├── data.js         DEFAULT_EXERCISES array + GROUPS config — the only place exercises are defined
│   ├── storage.js      localStorage read/write helpers; also date utilities (toDateStr, dateFromStr)
│   └── app.js          All rendering, events, arm-day rotation logic, modals, image upload
└── images/             Optional committed images (not required — images upload into localStorage)
```

**Script load order in index.html is required:** `data.js` → `storage.js` → `app.js`

## Exercise groups
| Group key  | Label      | Colour  | Pill |
|------------|------------|---------|------|
| `arm-day1` | Arm Day 1  | `#4a90d9` (blue)  | D1  |
| `arm-day2` | Arm Day 2  | `#5ab89e` (teal)  | D2  |
| `legs`     | Legs       | `#e8974a` (orange)| LEG |

Groups are defined in `GROUPS` (bottom of `data.js`). Colours are also referenced as CSS custom properties (`--c-day1`, `--c-day2`, `--c-legs`) in `styles.css`.

## Arm Day rotation
Arm Day 1 and Arm Day 2 alternate every session.

- `settings.armSessionCount` (localStorage) starts at `0`.
- `armSessionCount % 2 === 0` → Day 1; `=== 1` → Day 2.
- The count increments automatically when **all** exercises in the current arm group for a given date are checked off.
- Once a day's arm group is locked in (first checkbox clicked), it's stored on the session and never re-calculated.
- Seed: `armSessionCount = 0` on first launch → first arm session ever = Day 1 (May 1, 2026).

## localStorage schema
```
pem_exercises  → JSON array of Exercise objects
pem_sessions   → JSON object { "YYYY-MM-DD": Session }
pem_settings   → JSON object (Settings)
```

### Exercise object
```js
{
  id:           string,   // e.g. "a1-1" (pre-populated) or "ex-<timestamp>" (user-added)
  name:         string,
  group:        "arm-day1" | "arm-day2" | "legs",
  sets:         number,
  reps:         string,   // free text — allows "10–15", "15/side", "30 sec"
  resistance:   string,   // free text — "5 lbs", "band", "elastic", "bodyweight"
  frequency:    string,   // e.g. "3x/week", "daily"
  instructions: string,
  image:        string | null,  // base64 data URL after user uploads
  order:        number,   // sort order within group
}
```

### Session object
```js
{
  completedExercises: string[],  // array of exercise IDs checked off on this date
  armDay:             string | undefined,  // "arm-day1" or "arm-day2" — locked on first check
  armSessionCounted:  boolean | undefined, // true once armSessionCount was bumped for this date
}
```

### Settings object
```js
{
  armSessionCount: number,  // total arm sessions fully completed
  createdAt:       string,  // ISO date of first launch
}
```

## Adding or editing exercises
- **In the UI**: click the ✎ pencil icon on any exercise row, or click "+ Add exercise" at the bottom of a group.
- **In code**: edit the `DEFAULT_EXERCISES` array in `data.js`. These defaults only apply on first launch (when `pem_exercises` doesn't exist in localStorage). To force a reset, open DevTools → Application → Local Storage → delete all `pem_*` keys.

## Resetting data
Open browser DevTools → Application → Local Storage → delete `pem_exercises`, `pem_sessions`, `pem_settings`. On next page load the app re-seeds from `DEFAULT_EXERCISES`.

## Hosting on GitHub Pages
1. Push the repo to GitHub (private repo is fine — Pages works with private repos on free accounts via the main branch).
2. Go to repo Settings → Pages → Source: `main` branch, root `/`.
3. The app will be available at `https://<username>.github.io/physio-exercise-manager/`.
