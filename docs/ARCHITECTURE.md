# Architecture decisions

A running log so later phases stay compatible with earlier ones. Add new entries at the bottom.

## Phase 1 - MVP (2026-09-30)

**D1. Stack: Vite + React + TypeScript, plain CSS, react-router (HashRouter).**
Beginner-friendly and widely documented. No UI framework or CSS framework: one `styles.css` with CSS variables is
enough for this size. HashRouter works on any static host and inside a native web-view wrapper without server config.

**D2. Layers: `types` → `logic` / `data/actions` (pure TS) → `data/store` (React) → `screens`.**
Everything under `logic/`, `data/actions.ts`, `data/seed.ts`, `services/` and `types.ts` has no React or browser
dependency (except `storage.ts` and `services/image.ts`), so it can be reused unchanged in a React Native / Capacitor app.

**D3. Storage: one JSON document in `localStorage` (`gymtracker:data`), with a `version` field.**
Simple and plenty for years of workouts (~1 KB per session). Only `storage.ts` touches it. When the shape changes,
bump `AppData.version` and add a migration in `migrate()`. Unreadable data is backed up under a separate key instead
of being overwritten. Limit: ~5 MB per origin, far more than workout data needs (photos are not stored, see D23).

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

## Phase 4 - Photo recognition foundation (2026-09-30)

**D20. Recognition is a pluggable service (`src/services/recognition/`):** `types.ts` holds the contract,
`mock.ts` the demo, `http.ts` the adapter for a future backend, and `index.ts` picks one (the backend adapter when
`VITE_RECOGNITION_URL` is set). The UI depends only on `recognizer` and the types. See `docs/RECOGNITION.md`.
A real AI provider must be called from a backend, never from the app (API keys).

**D21. Scan flow: photo → 3 suggestions (best guess pre-selected) + Other → Start → tracking.** The new
`startExercise` action adds to the current workout or starts a new one. It's reused by the scan screen, "create exercise
and start" (`?start=1`, replacing `?from=workout`) and the exercise page's Start button. If recognition fails, the
screen falls back to the manual list.

**D22. Context hint:** `likelyExerciseIds(data)` (unfinished exercises in the current workout, else the next-up routine)
is passed to the recognizer. The demo uses it; a real service may ignore it or use it to break ties.
`routinesByNextUp` moved to `logic/history.ts` and is shared with the home screen. Image resizing moved to
`services/image.ts`. No data-model changes.

**D23. Photos are never stored** (your decision after Phase 4). A scan photo only lives in memory on the scan screen, and
only for choosing the exercise. The `Exercise.photo` field was removed, and `migrate()` deletes photos saved by earlier
versions when the app loads. A real recognition service would receive the photo only for that one request.

## Phase 3A - Gamification (2026-09-30)

**D24. Game state is derived, never stored.** `buildProgress(sessions, exercises)` replays finished workouts to produce
XP, level, streak, achievements, personal bests and per-workout results. `useProgress(includeActive)` memoises it and can
include the workout in progress for instant feedback. No data-model change. Undo/delete stay consistent automatically.

**D25. Modules under `src/logic/game/`:** `config.ts` (all numbers), `challenge.ts` (generation, completion, personal
best), `levels.ts`, `streak.ts` (weekly), `achievements.ts` (data list) and `progress.ts` (XP + replay). The game only
reads `recommend()`'s output, so the progression engine and the game evolve independently. See `docs/GAMIFICATION.md`.

**D26. Workout UI:** the suggestion line became "TODAY'S CHALLENGE / 60 kg × 9" (still one tap for "Why?"). The
last-set bar briefly turns into the reward (title, XP, streak, next challenge) with a subtle 220 ms pop (off with
reduced motion). Achievements appear on the workout summary, not mid-set. On short screens the reward shows title + XP only,
so the rep pad stays on screen.

**D27. Safety rules** (see GAMIFICATION.md) are enforced in the logic and covered by tests.
`formatTarget()` in `logic/history.ts` is shared by the workout and summary screens.

**D28. Your decisions after Phase 3A:** no XP unless you progress, so "matched last session" is 0 XP but still shown as
positive. A streak week needs 2 workouts (`GAME_CONFIG.streak.minWorkoutsPerWeek`). A hit "repeat" challenge pays
`xp.repeatChallenge` (10) instead of 25. `challengeXp()` in `progress.ts` is used by both the summary and the live reward bar.
