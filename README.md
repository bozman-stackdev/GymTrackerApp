# Gym Tracker (MVP prototype)

A mobile-first web app for logging weight training with as little screen time as possible, plus simple,
transparent progression suggestions based on your own history.

## Run it

Requires Node.js 20+.

```bash
npm install
npm run dev          # http://localhost:5173
```

### On your phone

The app is published automatically to **https://bozman-stackdev.github.io/GymTrackerApp/** on every push to `main`
(workflow: `.github/workflows/deploy.yml`; one-time setup: repo Settings → Pages → Source: **GitHub Actions**).

Open that link on your phone, then add it to your home screen so it opens like an app:
- **iPhone (Safari):** Share button → *Add to Home Screen*.
- **Android (Chrome):** ⋮ menu → *Add to Home screen* / *Install app*.

Your data is stored on the phone, in that browser only. It is not synced between devices.

For development on your phone: run `npm run dev` and open the "Network" URL it prints (same Wi-Fi).

The app starts with **sample data** (a profile, 3 routines, ~5 weeks of history) so everything can be tried immediately.
Profile → "Start fresh" wipes it; "Load sample data" brings it back.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm test` | Unit tests (progression rules, data actions, storage) |
| `npm run test:e2e` | End-to-end tests in a phone-sized Chromium (starts the dev server itself; run `npx playwright install chromium` once first) |
| `npm run build` | Type-check + production build into `dist/` (static files, host anywhere) |

## How it works for the user

1. Open the app. If a workout is in progress, you land straight in it. Otherwise tap a routine; **Next up** is the one you did longest ago.
2. You see the exercise, **Last session: 60 kg × 8 · 8 · 7**, and today's target (the highlighted rep button).
3. After a set, **tap the number of reps you did**. That's it: one tap. Weight is pre-filled and stays the same for the next set.
   Change it with −/+, by typing, or with one-tap chips (*last set*, *last session*, *suggested*).
4. After the last planned set, the app moves to the next exercise by itself. The strip at the top shows every exercise's
   progress (`2/3`, `✓`); tap one to jump there. The bar under it shows your last set, rest time and **Undo**.
5. When everything is done, a big **Finish workout** button appears (or tap **Finish** at the top at any time).
6. The screen stays on during a workout, where the browser supports it.
7. **📷 Photograph a machine** (when adding an exercise, or on the Exercises tab) → pick which machine it is → it's added to the workout.

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
