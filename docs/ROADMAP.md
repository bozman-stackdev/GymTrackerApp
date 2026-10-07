# Roadmap: from web MVP to a polished mobile app

Written at the end of Phase 5 and updated after Phase 6 (the core loop). User testing is **Phase 7**. Read with `ARCHITECTURE.md`.

## 1. How the app is layered (what can be swapped)

| Layer | Where | Depends on | Replace with… |
|---|---|---|---|
| **Progression engine** | `src/logic/progression.ts` | types only | a different algorithm, or a server-side one: same `recommend()` signature |
| **Game** (challenges, XP, streaks) | `src/logic/game/` | `recommend()` output only | new rules, by editing `GAME_CONFIG` or the modules |
| **Workout logic** | `src/data/actions.ts`, `validate.ts` | types only | reused as-is on native or server |
| **Storage** | `src/data/storage.ts` (`DataStore`) | nothing | SQLite / AsyncStorage / API client: pass it to `<StoreProvider store={…}>` |
| **Recognition (AI)** | `src/services/recognition/` (`MachineRecognizer`) | types only | real service via `VITE_RECOGNITION_URL`, or an on-device model |
| **UI** | `src/screens`, `src/components` | all of the above | native screens (see section 3) |

`logic/` and `data/actions.ts` / `validate.ts` have no React or browser dependencies, and are ~60% of the non-UI code.

## 2. What should move from browser storage to a backend

Today everything lives in one localStorage record on one phone. The risks are losing the phone or browser data (Safari can
clear website data after 7 days unused unless the site is on the Home Screen), no multi-device use, and no way to help a
user who loses data.

| Data | Move to backend? | Why / notes |
|---|---|---|
| Workout history (sessions, sets) | **Yes, first** | The only irreplaceable data. Table per set: `set(id, session_id, exercise_id, reps, weight_kg, logged_at)` |
| Exercises (custom), routines | Yes | Small; per user. The built-in library can be server-provided and versioned |
| Profile (age, height, weight…) | Yes, **optional** | Personal/health-adjacent data: needs consent, a privacy policy, and GDPR export/delete |
| Workout in progress | **Stay local** (sync on finish) | Must work with no signal; the phone is the source of truth until you tap Finish |
| XP, levels, streaks, achievements | **Don't store; derive** | Already computed from history. Optionally cache per workout server-side for speed |
| Progression recommendations | Stay on the phone | Instant and works offline. Could move server-side later to use aggregate insights |
| Machine photos | **Never stored** | Sent once to the recognition service, then discarded (by decision) |
| App settings (units, UI) | Local, or with the profile | — |

**Status: step 1 (accounts + sync) is built, see docs/ACCOUNTS.md. It's switched on once Supabase is set up.**

**Recommended approach: offline-first sync.**
1. Add accounts (email magic link or Apple/Google sign-in). Auth must arrive with sync, never before.
2. Keep localStorage/SQLite as the working copy. On *Finish workout*, queue the session for upload, and retry when online.
3. Sessions are append-only with client-generated ids (`newId()`), so conflicts are rare. Merge by id; for edits,
   last-write-wins per session with an `updatedAt`.
4. A managed backend (e.g. Supabase or Firebase) is enough: row-level security per user, backups, no server code to run.
5. The recognition service (`http.ts` contract) runs on the same backend, holding the AI provider's key.

The `DataStore` interface is synchronous today (localStorage is). Server and native stores are **async**, so step 1 of any
migration is to make `load()` return a Promise and show a short loading state in `StoreProvider`.

## 3. Turning it into a native / cross-platform app

**Recommendation: wrap the existing app with Capacitor first**, not a rewrite. It's the same code in a native shell,
published to the App Store and Play Store, and the current PWA keeps working. Move to React Native only if performance or
native UI feel becomes a real problem.

| Concern | Web today | Capacitor | React Native / Expo |
|---|---|---|---|
| Storage | localStorage (sync) | SQLite or Preferences plugin (async `DataStore`) | expo-sqlite / AsyncStorage (async `DataStore`) |
| Camera | `<input capture>` | Camera plugin (better UX, gallery) | expo-camera / image-picker |
| Keep screen on | Wake Lock API | keep-awake plugin | expo-keep-awake |
| Vibration | `navigator.vibrate` (not on iOS) | Haptics plugin (works on iOS) | expo-haptics |
| Backup file | download link | Share / Filesystem plugins | expo-sharing |
| Routing | HashRouter | unchanged | React Navigation (rewrite) |
| Styling | one CSS file | unchanged | StyleSheet (rewrite all screens) |
| Offline | service worker | files are bundled | bundled |
| Reused unchanged | — | ~100% | `logic/`, `data/actions`, `validate`, `seed`, `services/recognition` types, and all unit tests |
| Rest-timer alerts | not possible in background | Local Notifications plugin | expo-notifications |

Each browser API is already isolated in one place (`useWakeLock`, `services/image.ts`, `storage.ts`,
`backup.ts#downloadText`, `navigator.vibrate` in `SetLogger`), so each row is a one-file change.

## 4. Product review: what to improve before adding features

Honest assessment after Phases 1–5. The core loop works and is fast (2 taps to the first set, 1 tap per set,
~2 ms of scoring per set with years of history). These gaps matter more than new features:

### Must fix before the first testers: ✅ done (after Phase 6)
1. ✅ **Editing mistakes.** Tap any logged set to fix or delete it, during a workout (set boxes) and afterwards (summary → Edit sets).
2. ✅ **Data loss risk (short term).** A gentle backup reminder (3+ workouts, 14+ days, "Later" = 7 days), plus the Home Screen tip.
   Medium term, it's still the account + sync plan above.
3. ✅ **Units.** kg or lb in Profile. Stored in kg; suggestions snap to 2.5 lb plates, typed weights to 0.5 lb.
4. ✅ **Feedback.** Profile → Send feedback (email via `VITE_FEEDBACK_EMAIL`, otherwise a GitHub issue). App and device basics only.

### Should do soon
5. **Rest timer.** The timer counts up, but there's no "rest done" buzz. This is the most requested gym-app feature and fits the
   "don't look at the phone" goal. It needs native notifications to work with the screen locked (Capacitor).
6. **Challenge meaning.** Today one set at the target counts as done. Testers may expect "all sets". Watch for confusion in Phase 7 (user testing).
7. ✅ **Warm-up sets.** A "Warm-up" toggle next to the set boxes (Day 2, docs/CARDIO.md); they never count for progression.
8. **Managing exercises.** Custom exercises can't be deleted or archived, and the library can't be filtered by muscle group.
9. **Manual accessibility check** with VoiceOver/TalkBack. The automated checks (axe) pass in light and dark mode, but they only
   catch part of the problems.

### Technical debt worth paying off
10. ✅ **Full progress replay**: 2.5× faster (3 years of heavy training: 429 → 171 ms on a laptop) and computed once per
    history change, shared by all screens (D56). If it ever becomes noticeable on phones: cache per-workout results.
11. ✅ **Icons are emoji**: replaced by one SVG line-icon set (D54).
12. ✅ **Lint with the React Hooks rules**: `npm run lint` (oxlint, D55), in CI. UI components stay covered by e2e tests.
13. **Analytics**: none (good for privacy). Consider privacy-friendly, opt-in usage counts before a public launch.

### Deliberately not doing
Messaging, daily streaks. They conflict with "spend less time tracking your workout and more time doing it".

**Changed (muscle map):** a Free / Premium split now exists for *depth* features (longer history, progress details,
trends, comparisons, insights), never for the basic body map or logging (D68). There are no payments yet: Premium is a
testing preview. Real subscriptions need App Store / Play billing (or Stripe on the web), the entitlement stored on the
account by the server (not set by the phone), and "restore purchases".

**Changed (side quest):** friends/groups and leaderboards are now planned, on top of accounts. Groups joined by invite
code, not a global board, ranked by effort (consistency, challenges completed, XP), never by weight lifted, so the
safety principle holds (nobody is pushed to lift heavier to "win").

**Done (leaderboard):** a global, opt-in community leaderboard (week / month / all time) ranked by leaderboard XP
with healthy limits (D72, [LEADERBOARD.md](LEADERBOARD.md)). Invite-only groups remain a possible next step.

## 5. Photo storage plan (for when equipment photos are wanted)

Not built yet; photos are currently never stored (D23). The plan, sized for thousands of photos:

1. **Never inside `AppData`.** The main record stays small JSON. Equipment keeps only a `photoId`.
2. **Two sizes per photo**, resized on the phone (which also strips GPS/EXIF): thumbnail 256 px (~15 KB) and full
   ~1024 px (~150 KB). 1,000 photos ≈ 165 MB.
3. **A `PhotoStore` interface** (`put / get / delete / list`), like `DataStore`:
   - web: **IndexedDB** (hundreds of MB to GBs per site, quota checked with `navigator.storage.estimate()`, `persist()` requested);
   - native: the app's **file system** (Capacitor Filesystem);
   - with accounts: **cloud object storage** (e.g. Supabase or Firebase Storage) as the source of truth. The phone keeps all
     thumbnails and a size-capped cache of full photos (least recently used first), downloading on demand.
4. **Metadata per photo:** id, equipmentId, createdAt, width/height, bytes, content hash (dedupe), where it lives (local/remote).
   Deleting a machine deletes its photos.
5. **Backups:** the JSON export keeps only references. An optional "full backup" (.zip with photos) can come later; cloud sync makes it unnecessary.
6. **Privacy:** opt-in per machine. Gym photos may include people, so keep them private per user and cover it in the privacy policy.
