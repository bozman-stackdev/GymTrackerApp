# Architecture decisions

A running log so later phases stay compatible with earlier ones. Add new entries at the bottom.

## Phase 1 - MVP (2026-09-30)

**D1. Stack: Vite + React + TypeScript, plain CSS, react-router (HashRouter).**
Beginner-friendly and widely documented. No UI framework or CSS framework: one `styles.css` with CSS variables is
enough for this size. HashRouter works on any static host and inside a native web-view wrapper without server config.

**D2. Layers: `types` → `logic` / `data/actions` (pure TS) → `data/store` (React) → `screens`.**
Everything under `logic/`, `data/actions.ts`, `data/seed.ts`, `services/` and `types.ts` has no React or browser
dependency (except `storage.ts` and `toThumbnail`), so it can be reused unchanged in a React Native / Capacitor app.

**D3. Storage: one JSON document in `localStorage` (`gymtracker:data`), with a `version` field.**
Simple and plenty for years of workouts (~1 KB per session). Only `storage.ts` touches it. When the shape changes,
bump `AppData.version` and add a migration in `migrate()`. Unreadable data is backed up under a separate key instead
of being overwritten. Limit: ~5 MB per origin - photos are stored as ~15 KB thumbnails to stay well within it.

**D4. All state changes are pure functions `(AppData, …) => AppData` in `actions.ts`.**
Screens call `update(d => logSet(d, …))`. Easy to unit test, and the same functions can later back a sync layer.

**D5. The workout in progress lives in `AppData.activeWorkout` and is saved after every set.**
Closing the tab or the phone killing the browser loses nothing. Finishing moves it into `sessions` (empty exercises dropped).

**D6. All weights are stored in kg.** A kg/lb display preference can be added later purely in formatting and input.

**D7. Progression = double progression with explicit, ordered rules (`progression.ts`).**
Thresholds in `PROGRESSION_RULES`. Every recommendation has a human-readable `reason`. `plannedSet()` turns the
recommendation into pre-filled values so a normal set is one tap.

**D8. Machine recognition behind an interface (`MachineRecognizer`).**
The MVP `mockRecognizer` returns all machine/cable exercises with confidence 0 (user picks manually). A real service
returns confidences; suggestions ≥ 0.5 are shown as "Best match" automatically. Swap the `machineRecognizer` export.
The camera uses `<input type="file" capture="environment">` - works in all mobile browsers without permission code.

**D9. No authentication/authorisation.** Single user, data never leaves the device. When cloud sync is added,
auth must be added at the same time (see recommendations in the phase report).

**D10. IDs** are generated with `newId()` (timestamp + random), not `crypto.randomUUID`, which is unavailable on
plain-http LAN addresses used when testing on a phone.

## Phase 2 - Faster workout logging (2026-09-30)

**D11. A set is logged by tapping the number of reps done (rep pad), not "adjust reps, then Done".**
The pad shows 8 numbers around the target (target highlighted) plus "More" for 1–30. Weight is pre-filled and
carries over between sets, so the common case is one tap. Reps are locked while a weighted exercise has no weight yet
(first time), so a set can't be saved as 0 kg by accident.

**D12. `logSet` auto-advances** to the next unfinished exercise (forward first, then wrapping) when a set completes
the planned sets. Extra sets beyond the plan don't move. `undoLastSet` returns to that exercise. Both are pure and unit tested.

**D13. The "last set" bar (set, rest timer, undo) is derived from saved sets, not UI state**, so it survives
reloads and needs no extra storage.

**D14. Removed from the workout screen:** the suggestion card (now a single line: `rec.title`), prev/next arrows,
the "Next exercise" button, the "extra set" mode and the unlabeled dots. The labelled exercise strip is now both the
progress display and the navigation. The redirect-on-no-workout (and its `useRef` workaround) became a plain message.

**D15. Workout conveniences:** the Screen Wake Lock (`useWakeLock`) keeps the phone awake during a workout.
Opening the app with a workout in progress goes straight to it (`ResumeWorkoutOnLaunch`). Home shows the routine
done longest ago first as "Next up". A short-screen media query keeps the whole rep pad visible on phones like the iPhone SE.
No data-model changes in this phase.

## Phase 3 - Progression engine (2026-09-30)

**D16. Two-step engine: `analyse()` (facts) → `recommend()` (ordered rules R0–R6).** Every recommendation carries
`rule`, `title` and `reason`. Screens only display `title`/`reason`, so rules and thresholds change in one file.
See `docs/PROGRESSION.md`.

**D17. All thresholds live in `PROGRESSION_CONFIG`** and `recommend(exercise, sessions, config)` accepts an override,
so per-user or per-exercise settings can be added later (e.g. stored in `AppData`) without changing the rules.
No data-model change in this phase.

**D18. Behaviour changes from Phase 1:** weight increases need consistency (top of range in 2 sessions in a row;
after one, the advice is "stay"). "Too heavy" now means *no* set reached the range (a missed last set is normal fatigue).
There's a new "recent dip" rule. The sample data follows the same rules and demonstrates all seven.

**D19. On the workout screen, the explanation is behind a "Why?" tap** (one line by default). This keeps the rep pad
on screen on small phones. The exercise page always shows the full explanation. Both show a short disclaimer.
