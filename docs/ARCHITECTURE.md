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

## Phase 5 - Polish, robustness, mobile readiness (2026-09-30)

**D29. Storage behind a `DataStore` interface** (`load`/`save`/`subscribe`), with localStorage as the implementation.
`StoreProvider` takes an optional store. `load()` distinguishes first run, ok, and unreadable (a raw backup copy is kept).
Save failures surface as a banner (`saveError`) instead of `alert()`. The `storage` event keeps several tabs in sync.
`navigator.storage.persist()` is requested on first save.

**D30. Validation in one module (`data/validate.ts`):** `parseAppData` checks structure and value ranges on every load and
import, and rebuilds the object with known fields only. `validateProfile` and `validateExercise` drive form errors.
`logSet` ignores impossible sets (`isValidSet`, `SET_LIMITS`). Steppers clamp to min/max.

**D31. First run:** a welcome screen with *Start my own* (starter routines, no history), *Try with sample data*
(`isSample: true` → banner with "Start my own") or *Restore a backup*. The sample is no longer forced on real users.

**D32. Backup:** export/restore JSON (`data/backup.ts`) from Profile and the welcome screen; validated before replacing.

**D33. Offline + installable:** vite-plugin-pwa precaches the app (service worker, `autoUpdate`), plus a web manifest and
icons (`public/`, `scripts/make-icons.mjs`). Covered by `e2e/offline.spec.ts` against the production build.

**D34. ErrorBoundary** around the app: a calm crash screen with Reload and "Export a backup first" (reads raw storage).

**D35. Live scoring split from the full replay:** `scoreLiveSession` scores only the workout in progress (~2 ms per set
with 4 years of history). `buildProgress` (full replay, memoised on history) scores each exercise against its own
history only. `useProgress()` / `useLiveSession()` in `data/useProgress.ts`.

**D36. Structure and quality:** big screens split into folders (`screens/workout|history|exercises`). History is grouped by
the same weeks the streak uses. Accessibility: focus-visible outlines, 44px targets, aria-pressed chips, labelled
controls, contrast fixes (`--danger`, `--accent-text`), and axe checks in light and dark mode (`e2e/a11y.spec.ts`).
There's a CI workflow (`ci.yml`) for typecheck, unit tests and e2e on every push. Roadmap and product review: `docs/ROADMAP.md`.

## Phase 6 - Core loop: challenge, journey, missed challenges, rewards, My gym (2026-09-30)

**D37. Journey + mastery (`logic/journey.ts`)** is pure progression logic next to the engine. Mastered = every working set at
a level in `sessionsToMaster` workouts in a row (renamed from `sessionsAtTopBeforeIncrease`; the same knob drives R2), so
the journey and the engine can't disagree. `MasteryTracker` is incremental for the replay.

**D38. Missed challenges live in the engine:** `previousTarget()` gives the target that applied to the last workout.
New rule R7 (near miss → same target, kind `retry`). R6's reason mentions the miss when it re-bases. The game never deducts XP.

**D39. Rewards:** `exerciseEvents()` is the single XP calculation for the replay and live feedback. There are new events:
`mastery` (a *weight* mastered: top of the rep range; rep levels are ticked without XP to keep mastery meaningful)
and `comeback` (+15 on a hit after a miss). There are new achievements: Exercise Mastered and 5 Successful Sessions.
Mastery is capped at the challenge weight, like PBs.

**D40. Live feedback** (`LastSetBar`): per-set results (hit, PB) plus end-of-exercise results (mastery, matched,
NOT TODAY) after the last planned set. NOT TODAY is neutral styling, never red, never "failed", and shows the best set.

**D41. Equipment library:** a new `AppData.equipment` list and `SessionEntry.equipmentId`. Both are additive; `parseAppData`
defaults the list to `[]`, so older data loads unchanged. "Last used" is derived from history. The recognition contract
gained `equipment` / `equipmentId` / `detected`. See `docs/EQUIPMENT.md`. Tab renamed "Exercises" → "My Gym".

**D42. Today's Challenge front and centre:** the Train screen shows "🎯 N challenges ready" per routine. There's no separate
"Start set" button: the rep pad records the set in one tap (deliberate deviation from the spec sketch).

## Phase 6 follow-ups - ready for testers (2026-09-30)

**D43. Editing sets:** `editSet(data, sessionId, entryIndex, setIndex, patch | null)` works for the workout in progress and
finished workouts (it drops emptied exercises and workouts). The UI is a shared `SetEditor` bottom sheet, opened from the
workout's set boxes and from the summary's "Edit sets". Derived game state updates by itself.

**D44. Units (`logic/units.ts`):** stored in kg, with `profile.units` for display and input. The module-level display unit is
set by the app shell (a deliberate trade-off versus threading `units` through every formatter). `snapWeight` (typed:
0.01 kg / 0.5 lb) and `suggestWeight` (engine and journey: 2.5 lb plates) produce identical stored numbers on shared grid
points, so journeys compare exactly. `unitStepKg` turns kg steps into realistic lb steps (5 kg ↔ 10 lb). `formatKg` was renamed `formatWeight`.

**D45. Feedback (`services/feedback.ts`):** email if `VITE_FEEDBACK_EMAIL` is set at build time, otherwise a prefilled GitHub
issue. It only carries the app version (`__APP_VERSION__` from vite.config) and device basics, never workout data.

**D46. Backup reminder:** `AppData.backup { lastExportAt, remindAfter }` (optional; validated and kept on import).
`needsBackupReminder` (3+ workouts not backed up, 14+ days, not sample, not mid-workout) drives a Train-screen banner with
Export or Later (7 days). Photo storage is planned in ROADMAP §5 and not built.

**D47. Safe areas:** the installed app draws under the iPhone status bar (`viewport-fit=cover`, translucent status bar),
so every edge pads by the `--safe-top/right/bottom/left` tokens (from `env(safe-area-inset-*)`) in `styles.css`.
The header is sticky and stretches over the top padding, so Back / Cancel stay tappable on long screens. The tokens let
`e2e/layout.spec.ts` simulate a Dynamic Island (62 px top, 34 px home bar) and check that a tap on each header button hits it.

**D48. Creating exercises from a picker:** `ExerciseForm` (component) is shared by the exercise screen and the routine
builder. `ExercisePicker` takes an optional `onCreate(name)`: "+ Create custom exercise", or "+ Create “search text”" when
nothing matches (name prefilled). The routine builder shows the form inside the same screen so the unsaved routine is
kept. The new exercise goes into the library straight away. The workout uses `/exercises/new?start=1&name=…`.

**D49. Finish Exercise vs Finish Session:** the big green button finishes the *exercise* (`finishExercise`): it moves
to the next unfinished exercise, or to a "between exercises" state (`currentIndex === entries.length`) offering
"+ Add exercise". Only the top-right "Finish Session" ends the workout, so a workout built as you go is never
offered "finish" after its first exercise. The between state is a normal saved `currentIndex` and survives reloads.

## Accounts and sync (side quest, step 1)

**D50. Optional accounts on Supabase, behind a `Backend` interface (`services/backend/types.ts`).** Email + password
via Supabase Auth (we never handle password hashes). Built in only when `VITE_SUPABASE_URL`/`VITE_SUPABASE_KEY` are set
(`VITE_BACKEND=fake` for e2e); otherwise the code is dropped from the bundle and the app is unchanged. Setup and
privacy: docs/ACCOUNTS.md.

**D51. Offline-first sync with per-record fingerprints (`services/backend/sync.ts`).** `DataStore` stays synchronous
(localStorage remains the working copy, so ROADMAP's "make DataStore async" step isn't needed). One generic server table
`records(user_id, kind, id, data, deleted, updated_at)`; the server sets `updated_at` (the pull cursor, re-read with a
10 s overlap). The phone remembers the fingerprint of what the server has (`gymtracker:sync`, not in backups) to tell
local edits from remote ones. Rules: a phone's unsynced edit wins; first meeting → the account wins; deletions are
tombstones; more than 10 deletions that are also over 25% of the synced items are refused and re-downloaded instead.
Server records are validated like a backup file before use.

**D52. Codes, not links, in auth emails.** An installed iPhone web app doesn't receive email links (they open in
Safari with separate storage), so sign-up confirmation and password reset use emailed codes (`verifyOtp`).

**D53. Security = row-level security, tested.** `supabase/schema.sql` revokes everything from signed-out visitors and lets
signed-in users touch only rows where `user_id = auth.uid()`. `delete_my_account()` (security definer) deletes the login;
cascades remove the rest. `supabase/test-schema.sh` checks these rules against a real Postgres with a stand-in auth
schema, and fails when RLS is switched off.

## Polish pass (overnight, after accounts)

**D54. One SVG icon set (`components/Icon.tsx`), no emoji in the UI.** 24×24 line icons drawn with `currentColor`, so
they follow the theme, the accent and text size, and look the same on every phone (emoji differ per platform; the
calendar emoji even showed a fixed date). Decorative by default (`aria-hidden`); `label` when an icon is the only content.
Achievement icons are names (`AchievementIcon`), so `logic/` stays free of React.

**D55. Lint = oxlint (`npm run lint`, warnings fail, runs in CI).** typescript-eslint doesn't support TypeScript 7; oxlint
parses TS itself and has the React Hooks, jsx-a11y and correctness rules. Switched off, with reasons in `.oxlintrc.json`:
`toSorted()` hints (needs iOS 16+), valid-ARIA "prefer the native tag" hints (axe tests cover roles), style-only rules.

**D56. Progress: computed once, shared.** `progressFor()` caches the replay per (sessions, exercises, day), so Home, History,
Profile and the summary don't each replay the whole history. Hot paths (`exerciseHistory`, `workingWeight`, `analyse`)
use plain loops and compute each workout's working weight once. Measured: 3 years / 496 workouts, 429 → 171 ms here.

**D57. Order-independent history.** Synced workouts can arrive in any order, so nothing may assume `data.sessions` is
chronological: `lastDoneAt()` (routines, "next up") takes the latest date, `exerciseHistory()` sorts when needed.

**D58. Form controls are 16px+** (iOS zooms into smaller fields on focus). `e2e/layout.spec.ts` checks every field.

## Day 2 - Cardio, warm-ups and cool-downs

**D59. One ordered list, two entry shapes.** `SessionEntry = StrengthEntry | ActivityEntry` (and the same for routine
items). A missing `kind` means strength, so existing data, backups and synced records need no migration. The union lets
the compiler find every place that reads `sets` (about 130 call sites). Each one now goes through `isStrength()`, or
through `strengthEntries()` / `activityEntries()`. Details: [CARDIO.md](CARDIO.md).

**D60. Warm-up sets are a separate warm-up entry** (`warmupFor` + `warmupSets`), inserted just before the exercise. They
are never extra sets on the strength entry. That keeps progression, challenges, mastery, personal bests, volume and XP
untouched, with no "is this a warm-up?" checks scattered through the engine.

**D61. Cardio progression is its own small module** (`logic/cardio.ts`). It only gives hints: never automatic, never a
challenge. It needs 2 sessions, adds at most +10% time, and suggests incline after 3 steady treadmill sessions.

**D62. Activity XP is once per workout**, and warm-ups and cool-downs only pay when planned in the routine. Adding more
activities never pays more. 10+ minutes of cardio makes a real workout (workout XP, streak).

**D63. Older app versions** (an old tab or cached PWA) skip synced workouts that contain activities: their validator
doesn't know the shape, so it rejects the record and the sync carries on. They pick the workouts up after updating.

## Muscle map

**D64. The exercise library is the source of truth for muscles.** `Exercise.muscles` holds the primary and secondary
muscles and optional per-muscle weights. There is no separate muscle table. Built-in exercises saved before the
feature get their muscles from the library on load. Custom or older exercises without any are worked out from their
name, then their muscle group (`musclesFor`). Unknown ids from a newer version are dropped. Details: [MUSCLES.md](MUSCLES.md).

**D65. Pure scoring service, configurable.** `logic/muscles/` takes workouts in and gives activity, progress and
balance out. The UI only renders. Every weight and threshold is in `MUSCLE_CONFIG` (primary 1.0, secondary 0.5 per
set). Cardio, warm-ups and cool-downs are activity entries, and warm-up sets are their own entry, so none of them can
count.

**D66. Activity is relative; progress is performance.** Activity shows each muscle against the most-trained muscle of
the period, so it describes emphasis and never prescribes a volume. Progress compares performance with before the
period, mainly in journey steps (the challenge ladder), so a weight increase with a rep reset counts as progress. It
adds volume, challenges, mastery and consistency. A muscle's progress comes from its main exercises.

**D67. One drawing, two bodies, mirrored halves.** The figure is points for the left half, smoothed (Catmull-Rom) and
mirrored, so the sides always match. The female figure is the same drawing with a width profile (shoulders, waist,
hips), its own chest shape and hair. Both views share the silhouette, so front and back match. Left and right are
separate shapes labelled with the body's side, scored together.

**D68. A plan layer instead of a payment system.** Free/Premium is one table of features (`logic/plan.ts`). Until
there are payments, a per-phone "Premium preview" stands in (`AppData.premiumPreview`, not synced). Later, `planOf()`
reads the account's subscription. The basic map is always free. (ROADMAP previously listed subscriptions as "not
doing"; this changes that, for depth features only.)

**D69. The muscle map informs Today's Challenge, never overrides it.** "Why?" shows what the exercise works and its
share of a muscle's recent sets. Targets come from the progression engine only.

**D70. New screens open at the top.** Pushing a new route scrolls to the top; Back (POP) keeps the position. This was
found while testing the Muscles tab: switching tabs used to keep the previous screen's scroll offset.

## Cardio timer (simplified cardio)

**D71. Cardio records duration only, from a start/stop timer.** Speed, incline, distance, level, calories and heart
rate fields are gone, because typing mid-workout contradicts the app's goal. An activity entry stores `startedAt`,
`endedAt` and `durationSec`; elapsed time is always `now − startedAt`, never a counter, so it survives a locked
screen, a backgrounded browser, a reload or a killed tab. Old `log` metrics stay optional and read-only (shown in
history, counted via `activityDurationSec`); nothing was migrated or deleted. Cardio XP is +10 once per workout for any
completed cardio of 1+ minute. Duration-based coaching ("try 22 minutes") is deliberately not built yet. Details:
[CARDIO.md](CARDIO.md).

## Community leaderboard

**D72. A global leaderboard, ranked by leaderboard XP, for people with an account who opt in.** Leaderboard XP is the
XP earned in the period, counting only the first 5 training days a week and at most 300 a day, so training more often
never climbs the board. It is never ranked by weight, body size, time or workout count. The phone derives points per
day from the same replay as XP and publishes them after each sync. The server keeps them private (row-level
security) and only a `security definer` function returns rank, display name and points of visible users. Places
earn badges and medals, never XP (no feedback loop). Visibility is off for existing accounts until they join; turning
it off deletes the rows. Points are computed on the phone and capped by the server; server-side recompute is the
production hardening step. Details: [LEADERBOARD.md](LEADERBOARD.md).
