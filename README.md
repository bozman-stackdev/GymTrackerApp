# Gym Tracker (MVP prototype)

A mobile-first web app for logging weight training with as little screen time as possible, plus simple,
transparent progression suggestions based on your own history.

## Run it

Requires Node.js 20+.

```bash
npm install
npm run dev          # http://localhost:5173
```

To try it on your phone: run `npm run dev`, then open the "Network" URL it prints (phone and computer on the same Wi-Fi).
The camera button opens the phone camera directly.

The app starts with **sample data** (a profile, 3 routines, ~5 weeks of history) so everything can be tried immediately.
Profile → "Start fresh" wipes it; "Load sample data" brings it back.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm test` | Unit tests (progression rules, data actions, storage) |
| `npm run test:e2e` | End-to-end tests in a phone-sized Chromium (starts the dev server itself; run `npx playwright install chromium` once first) |
| `npm run build` | Type-check + production build into `dist/` (static files, host anywhere) |

## How it works for the user

1. **Train tab** → tap a routine (e.g. *Push*). The workout starts immediately.
2. The screen shows **last time** for the exercise, **today's suggestion**, and weight + reps **pre-filled**.
3. Do the set, tap **✓ Done**. That's usually the only tap. Adjust with −/+ (or tap the number to type) only when reality differs.
4. After the planned sets: **Next exercise →**. Tap **Finish** at the end → summary.
5. **📷 Photograph a machine** (when adding an exercise, or on the Exercises tab) → pick which machine it is → it's added to the workout and the photo is saved with the exercise.

## Project structure

```
src/
  types.ts                  The entire data model (Exercise, Routine, WorkoutSession, Profile, AppData)
  data/
    storage.ts              The ONLY code that touches localStorage (load/save + migrations)
    actions.ts              Pure functions that change data: startWorkout, logSet, finishWorkout, saveRoutine...
    store.tsx               React context: holds AppData, saves on every change, useStore()
    seed.ts                 Sample exercises, routines and generated history
  logic/
    progression.ts          Recommendation rules (+ what to pre-fill for the next set)
    history.ts              Helpers: exercise history, last performance, formatting, volume, e1RM
  services/
    machineRecognition.ts   Photo → exercise suggestions. Mock now; swap in a real vision API later
  components/               Reusable UI: Screen, TabBar, Stepper, ExercisePicker, RecommendationCard, TrendChart
  screens/                  One file per screen (Home, Workout, AddExercise, Scan, History, Exercises, Routine, Profile)
  App.tsx                   Routes
e2e/app.spec.ts             End-to-end tests of the main user flows
docs/ARCHITECTURE.md        Architecture decisions log - read before changing structure
```

## Progression rules (in `src/logic/progression.ts`)

Checked in order, per exercise, using only *finished* workouts:

0. **Fewer than 3 sessions or less than 14 days of history** → no advice; the app pre-fills exactly what you did last time.
1. **Every working set reached the top of the rep range** (e.g. 12 of 8–12) → add one weight step (per exercise, e.g. 5 kg), reps back to the bottom of the range.
2. **Below the bottom of the range at the same weight for 2 sessions in a row** → drop one weight step.
3. **Otherwise** → same weight, aim for one more rep than your weakest set (capped at the top of the range).

"Working sets" = sets at the heaviest weight of that session, so warm-ups are ignored. Bodyweight exercises progress by reps only.
All thresholds are in `PROGRESSION_RULES`; each suggestion includes a plain-language reason.
