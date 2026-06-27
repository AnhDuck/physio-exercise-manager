# DESLOPPIFY.md

Generated: 2026-06-21

Scope: `AnhDuck/physio-exercise-manager` on `master`.

This is a cleanup backlog only. No app behavior changes are included here. The project is intentionally a static browser app with no build step, package manager, module system, or server layer, so the recommendations below preserve the current flat global-script architecture unless explicitly marked as a wait/phase item.

## Completed fixes

- **2026-06-22 05:33:25 -07:00**: Added safe JSON parsing for persisted app data. Storage loaders now catch malformed JSON, report a Data Health warning, keep corrupt localStorage values untouched, and block ordinary saves to affected keys until a deliberate backup import or restore replaces them.
- **2026-06-22 05:47:14 -07:00**: Completed C2. Startup now runs major phases through guarded `runStartupStep(...)` calls, logs and toasts non-blocking startup failures, catches async startup rejections where applicable, and keeps later phases such as static binding, settings, and export access reachable when an earlier feature fails.
- **2026-06-22 05:47:14 -07:00**: Completed M1. Static bindings in `js/main.js` now use small event binding helpers for click/change/input/keydown handlers so missing required controls warn clearly and optional feature controls fail softly instead of interrupting the rest of binding.
- **2026-06-22 05:47:14 -07:00**: Completed M7. Committed `.tmp-*.log` files were removed from the tracked repo state and `.gitignore` now ignores future temp logs; active server logs may remain on disk while the local verification server has them open.

## How to use this backlog

Pick one task ID at a time. After each completed task, re-display the remaining backlog and select the next task. Prefer safe, local cleanups before architecture reshaping.

Priority meanings:

- **Critical**: Can break data recovery, app startup, privacy/security expectations, or core maintainability soon.
- **Medium**: Not immediately dangerous, but will keep causing bugs or slow development.
- **Nice-to-have**: Polish, consistency, or repo hygiene with low functional risk.

---

## 1. Critical issues


### C3 — Tighten ActivityWatch server URL validation

**Where**

- `js/activitywatch-model.js`
  - `normalizeActivityWatchServerUrl()`
  - `setActivityWatchServerUrl()`
- `js/activitywatch-settings.js`
  - ActivityWatch settings UI

**Why it matters**

ActivityWatch is documented as a local read-only integration, normally `http://127.0.0.1:5600`. The current URL normalizer accepts any `http:` or `https:` URL. In a personal local app this is not catastrophic, but it weakens the privacy/security boundary and can make the app fetch arbitrary remote endpoints from the browser.

**Recommended change**

Default to allowing only local hosts:

- `127.0.0.1`
- `localhost`
- possibly `[::1]`

For non-local URLs, either reject them or place them behind an explicit Advanced override with a warning.

**Safe to fix now?**

Yes, if existing local settings are preserved. If a non-local URL is already stored, migrate it to default or require explicit confirmation.

---

## 2. Medium cleanup items


### M2 — Split shared mutable state into feature state objects

**Where**

- `js/state.js`

**Why it matters**

`state.js` has many top-level mutable globals for exercises, sessions, settings, timeline, tracker, auto-backup, home cards, weather, browser storage, and more. It works, but the file is becoming a global dumping ground. New features are more likely to collide with existing names or hide coupling.

**Recommended change**

Within the flat script architecture, group related state into named objects:

- `appState`
- `trackerState`
- `autoBackupState`
- `homeCardsState`
- `weatherState`
- `storageHealthState`

Do this incrementally, one feature at a time. Avoid a broad all-at-once rewrite.

**Safe to fix now?**

Wait. Do this after the safer binding/storage tasks, and only one feature at a time.

---

### M3 — Make auto-backup settings defaults and normalization single-source

**Where**

- `js/storage.js`
  - `defaultAutoBackupSettings()`
  - `normalizeAutoBackupSettings()`
- `js/auto-backup.js`
  - `AUTO_BACKUP_DEFAULT_SETTINGS`
  - `normalizeRuntimeAutoBackupSettings()`

**Why it matters**

Auto-backup defaults and normalization are duplicated. If a new auto-backup field is added in one file but not the other, saved settings, runtime rendering, and backup behavior can drift.

**Recommended change**

Keep one canonical default/normalize path. Either:

- storage owns the canonical settings shape and auto-backup uses it, or
- auto-backup owns the feature-specific shape and storage calls into that normalizer after the file is loaded.

Because of script load order, the first option is probably safer: storage owns the plain defaults, auto-backup owns runtime-only filtering/permission noise.

**Safe to fix now?**

Yes, but only after the completed storage parser fix if the same storage helpers are being touched.

---

### M4 — Consolidate date/time validation and waking-day helpers

**Where**

- `js/storage.js`
  - `toDateStr()`
  - `dateFromStr()`
- `js/timeline-render.js`
  - `timeToMinutes()`
  - `isValidTime()`
  - `isValidDateStr()`
  - waking-day boundary helpers
- `js/activitywatch-time.js`
  - ActivityWatch date/time helpers
- `js/workload-card.js`
  - workload date/day-start helpers
- likely `js/dates.js`

**Why it matters**

The app is heavily date-sensitive because of DSPD/personal-day logic, exercise schedules, ActivityWatch waking days, workload totals, and timeline boundaries. Duplicate date/time logic makes off-by-one and “before 7 AM” bugs more likely.

**Recommended change**

Make `js/dates.js` the owner of shared date/time primitives:

- local `YYYY-MM-DD` parsing/formatting
- time string validation
- minutes-from-midnight
- personal day start
- waking-day mapping

Feature files can keep feature-specific wrappers, but the underlying math should be shared.

**Safe to fix now?**

Wait until the completed storage parser fix and M1 are done. This touches several features and needs careful verification.

---

### M5 — Pre-index dose-change events during grid render

**Where**

- `js/grid.js`
  - `buildExerciseRows()`
  - per-cell `events.filter(...)` for dose-change markers

**Why it matters**

The grid currently scans all events for every exercise/date cell. It is fine at small scale, but it becomes wasteful as the timeline grows. This is exactly the kind of “works now, hurts later” issue.

**Recommended change**

Build a dose-event lookup once per render:

```js
const doseEventsByDateAndExercise = buildDoseEventIndex(events);
```

Then each cell reads from the map instead of filtering the entire event list.

**Safe to fix now?**

Yes. Low-risk performance cleanup.

---

### M6 — Queue or merge ActivityWatch sync requests during active sync

**Where**

- `js/activitywatch-sync-service.js`
  - `maybeSyncActivityWatchDateStrings()`

**Why it matters**

If a sync is already running, new sync requests return the existing promise. That prevents overlapping fetches, which is good, but it can also mean a newer request for different dates does not get queued.

Example: dashboard opens and syncs recent days; then Advanced requests a custom range while the first sync is active. The custom dates may not be synced unless the user triggers again.

**Recommended change**

Choose one clear behavior:

1. Disable/grey out advanced sync controls while a sync is active, or
2. Queue/merge requested dates and run one follow-up sync after the current one finishes.

Option 1 is simpler. Option 2 is better long-term.

**Safe to fix now?**

Safe after C2. It needs UI verification in the ActivityWatch dashboard.

---


### M8 — Reduce `index.html` as a long-term bottleneck

**Where**

- `index.html`
  - CSS loading
  - app layout
  - settings modal
  - exercise modal
  - image modal
  - event modal
  - manual JS load list

**Why it matters**

`index.html` is now doing too much. It owns the app shell, multiple modals, settings markup, cache-busting, and the entire script manifest. It is hard to review, easy to create ID mismatch bugs, and risky for AI-assisted edits.

**Recommended change**

Do not introduce a build system. Instead, use smaller safe steps:

- add stronger section comments and ID ownership notes
- move dynamic/feature-specific modal shell creation into the owning JS file where appropriate
- keep script/CSS manifests documented in one place
- add a verification checklist whenever markup IDs are changed

**Safe to fix now?**

Wait. This is architecture-adjacent and should be done after smaller safety cleanups.

---

### M9 — Make image import safer and less storage-hostile

**Where**

- `js/images.js`
  - `handleImageUpload()`
  - `tryFetchImageAsDataUrl()`
  - `blobToDataUrl()`

**Why it matters**

Image import accepts any image response and converts it to a data URL stored inside `pem_exercises`. It catches quota errors after save, which is good, but it does not preflight file size, dimensions, or type before reading/storing. A large image can waste memory and hit storage limits.

**Recommended change**

Before `blobToDataUrl()`:

- reject unsupported image types if needed
- reject images above a conservative byte limit
- show the estimated size in the error message
- optionally resize/compress uploaded images client-side later

**Safe to fix now?**

Yes. This is a contained improvement.

---

## 3. Nice-to-have polish

### N1 — Update or remove stale `noscript` cache-busting versions

**Where**

- `index.html`
  - `<noscript>` CSS links

**Why it matters**

The live app version is `1.0.152`, but the noscript CSS fallback still references older versions like `1.0.57`, `1.0.59`, and `1.0.87`. The app requires JavaScript, so this is low-risk, but it looks sloppy and creates confusing drift.

**Recommended change**

Either:

- update noscript versions whenever `PEM_APP_VERSION` changes, or
- remove the cache-busting query strings from the noscript fallback.

**Safe to fix now?**

Yes. Very safe.

---

### N2 — Replace static `innerHTML` glyphs with DOM/text helpers for consistency

**Where**

- `js/grid.js`
  - drag handle glyph
  - empty thumbnail camera glyph
- `js/timeline-render.js`
  - edit glyph
- `js/activitywatch-dashboard-shell.js`
  - static modal shell template

**Why it matters**

The current `innerHTML` uses static strings, so this is not the same as injecting user content. Still, the project rule is to prefer DOM helpers and `textContent`. Consistency makes later reviews easier.

**Recommended change**

Use `textContent`, `buildAppIconSvg()`, or existing button hydration helpers where possible. Leave the large static ActivityWatch shell template alone unless it becomes dynamic with user content.

**Safe to fix now?**

Yes, but low priority.

---

### N3 — Fix or remove always-compact header logic

**Where**

- `js/main.js`
  - scroll listener for `updateCompactHeader()`
- `js/grid.js`
  - `updateCompactHeader()`

**Why it matters**

The scroll listener suggests the header becomes compact based on scroll, but the function always adds `compact` and never removes it. That makes the behavior look half-implemented.

**Recommended change**

Either:

- implement a real threshold, or
- remove the scroll listener and make compact mode unconditional by design.

**Safe to fix now?**

Yes. Very safe.

---

### N4 — Replace JSON round-trip cloning with a named helper fallback

**Where**

- `js/backup.js`
  - `deepClone()`

**Why it matters**

`JSON.parse(JSON.stringify(...))` is acceptable for the current plain data shape, but it is brittle if future data includes richer types. A named helper with `structuredClone` fallback would clarify intent.

**Recommended change**

Use:

```js
function deepClone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value ?? null);
  return JSON.parse(JSON.stringify(value ?? null));
}
```

**Safe to fix now?**

Yes, but low priority.

---

### N5 — Make workload timer rollover guard user-visible

**Where**

- `js/workload-card.js`
  - `syncWorkloadTimerRollover()`

**Why it matters**

The rollover loop has a guard of 14 days, which prevents infinite loops. That is good defensive programming, but if a timer somehow spans more than 14 personal days, the user should see a review warning rather than the logic quietly stopping.

**Recommended change**

When the guard is reached:

- stop/pause the timer
- mark the current workload day as needing review
- show a warning/toast
- save the state safely

**Safe to fix now?**

Yes, but not urgent.

---

### N6 — Add a short “feature dependency map” to architecture docs

**Where**

- `ARCHITECTURE.md`
- possibly `docs/activitywatch.md`

**Why it matters**

The file ownership docs are already useful. The next useful layer is a dependency map showing which features call into which other features, especially:

- Timeline + Sessions + Tracker
- ActivityWatch + Workload overlay
- Settings + Auto-backup + Storage Health
- Weather + Home Cards

**Recommended change**

Add a small table:

| Feature | Owns | Reads from | Writes to | Must not call |
|---|---|---|---|---|

**Safe to fix now?**

Yes. Documentation-only.

---

## Suggested execution order

1. **M3 — Single-source auto-backup defaults and normalization**
2. **M5 — Pre-index dose-change events during grid render**
3. **M9 — Make image import safer and less storage-hostile**
4. **C3 — Tighten ActivityWatch server URL validation**
5. **M6 — Queue or merge ActivityWatch sync requests during active sync**
6. **N3 — Fix or remove always-compact header logic**
7. **N1 — Update/remove stale noscript cache-busting versions**
8. **M4 — Consolidate date/time validation and waking-day helpers**
9. **M2 — Split shared mutable state into feature state objects**
10. **M8 — Reduce `index.html` as a long-term bottleneck**
11. **N2 — Replace static `innerHTML` glyphs with DOM/text helpers**
12. **N4 — Replace JSON round-trip cloning with a named helper fallback**
13. **N5 — Make workload timer rollover guard user-visible**
14. **N6 — Add feature dependency map to architecture docs**

## Next task recommendation

Start with **M3 — Single-source auto-backup defaults and normalization**.

Reason: startup and static binding are now guarded, and the remaining highest-order safe cleanup is preventing auto-backup settings defaults from drifting between storage and runtime code.
