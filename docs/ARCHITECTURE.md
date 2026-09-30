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
