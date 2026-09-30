# Roadmap: from web MVP to a polished mobile app

Written at the end of Phase 5, before user testing (Phase 6). Read with `ARCHITECTURE.md`.

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

### Must fix before (or right after) the first testers
1. **Editing mistakes after the fact.** During a workout you can only undo the *last* set, and after finishing you can only
   delete a whole workout. Testers *will* mis-tap. Add: tap a logged set to edit or delete it (during and after a workout).
2. **Data loss risk.** Local-only data plus Safari's 7-day rule. Short term: ask testers to add the app to the Home Screen,
   and add a gentle "Export a backup?" reminder every ~2 weeks. Medium term: the account + sync plan above.
3. **Units.** kg only. Anyone training in lb can't use it. Store kg, display either (a small formatting-layer change).
4. **A way for testers to give feedback** (a "Send feedback" link in Profile), so Phase 6 learns something.

### Should do soon
5. **Rest timer.** The timer counts up, but there's no "rest done" buzz. This is the most requested gym-app feature and fits the
   "don't look at the phone" goal. It needs native notifications to work with the screen locked (Capacitor).
6. **Challenge meaning.** Today one set at the target counts as done. Testers may expect "all sets". Watch for confusion in Phase 6.
7. **Warm-up sets.** Lighter sets are ignored by the engine, but the UI doesn't label them. A quick "warm-up" toggle could help.
8. **Managing exercises.** Custom exercises can't be deleted or archived, and the library can't be filtered by muscle group.
9. **Manual accessibility check** with VoiceOver/TalkBack. The automated checks (axe) pass in light and dark mode, but they only
   catch part of the problems.

### Technical debt worth paying off
10. **Full progress replay** (summary, profile) is ~0.1 s per year of history on a laptop, and slower on phones. It only runs
    after a workout finishes, but cache per-workout results (or compute them on the backend) before it becomes noticeable.
11. **Icons are emoji**, which render differently on each platform. Replace them with a small SVG icon set for a polished look.
12. **Unit-test the UI components?** No: the e2e tests cover the flows well. **Do** add ESLint with the React Hooks rules
    (TypeScript 7 support in typescript-eslint was the blocker). A hooks mistake was caught by review, not tooling.
13. **Analytics**: none (good for privacy). Consider privacy-friendly, opt-in usage counts before a public launch.

### Deliberately not doing
Social features, leaderboards, messaging, subscriptions, daily streaks. They conflict with
"spend less time tracking your workout and more time doing it".
