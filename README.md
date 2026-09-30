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

On first launch you choose **Start my own** (starter routines, no history) or **Try with sample data** (5 weeks of
example workouts). A banner shows while you're on sample data. The app **works offline** once opened, and **Profile → Export backup**
saves everything to a file (restore it on another phone from the welcome screen or Profile).

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm test` | Unit tests (progression rules, data actions, storage) |
| `npm run test:e2e` | End-to-end tests in a phone-sized Chromium, incl. offline and accessibility checks (starts servers itself; run `npx playwright install chromium` once first) |
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
7. **📷 Scan machine** → take a photo → *What are you using?* → tap **Start**, and you're tracking it. Today the suggestions are
   a demo; see [docs/RECOGNITION.md](docs/RECOGNITION.md) for how real recognition plugs in.

## Project structure

Four independent layers. Each can be replaced without touching the others (see docs/ROADMAP.md):

```
src/
  types.ts                  The data model (Exercise, Routine, WorkoutSession, Profile, AppData)
  logic/                    PURE TypeScript - no React, no browser. Reusable in a native app or on a server.
    progression.ts          Progression engine: history → recommendation (docs/PROGRESSION.md)
    game/                   Today's Challenge, XP, levels, streaks, achievements (docs/GAMIFICATION.md)
    history.ts              History helpers and formatting
  data/                     Workout logic + storage
    actions.ts              Pure state changes: startWorkout, logSet (validated), finishWorkout, ...
    validate.ts             Checks saved/imported data and form input; migrations
    storage.ts              DataStore interface + localStorage implementation (swap for a DB/native store)
    store.tsx               React glue: state, save on change, cross-tab sync, save errors
    backup.ts               Export / restore a JSON backup
    seed.ts                 Starter + sample data
    useProgress.ts          React hooks over logic/game
  services/                 Replaceable integrations
    recognition/            Photo → exercise: contract, demo, backend adapter (docs/RECOGNITION.md)
    image.ts                Photo resizing (photos are never stored)
  components/               Reusable UI (Screen, Stepper, TabBar, ErrorBoundary, TrendChart, ...)
  screens/                  Screens; bigger ones are folders (workout/, history/, exercises/)
  App.tsx                   Routes, welcome screen on first run, save-error banner
e2e/                        Phone-sized browser tests: flows, first run/backup, offline, accessibility
public/ + scripts/          App icons (regenerate with `node scripts/make-icons.mjs`)
docs/                       ARCHITECTURE (decision log), ROADMAP (backend/native/product review), feature docs
```

## Today's Challenge, XP and streaks

Once an exercise has enough history, the workout screen shows **TODAY'S CHALLENGE** (e.g. *60 kg × 9*).
Hit it and you get a brief **✓ CHALLENGE COMPLETE +25 XP**. XP is only for progress. XP builds levels,
weekly streaks (2+ workouts a week) and achievements, which you can see on the workout summary and the Profile tab. Rewards never pay extra for
lifting heavier than suggested. Details: **[docs/GAMIFICATION.md](docs/GAMIFICATION.md)**.

## Progression suggestions

The app suggests when to add reps or weight, using only your own history, and never after just one or two sessions
(it needs at least 3 sessions over 14 days). Weight goes up only after you hit the top of the rep range in 2 sessions in a row.
Every suggestion explains why (tap **Why?** on the workout screen). Rules, settings and example scenarios are in
**[docs/PROGRESSION.md](docs/PROGRESSION.md)**. Run `npm run test:scenarios` to see them checked.
