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
| `npm test` | Unit tests (progression rules, data actions, storage, sync) |
| `npm run lint` | Lint (oxlint: React Hooks rules, accessibility, correctness); warnings fail |
| `npm run test:e2e` | End-to-end tests in a phone-sized Chromium, incl. offline and accessibility checks (starts servers itself; run `npx playwright install chromium` once first) |
| `VITE_FEEDBACK_EMAIL=you@example.com npm run build` | Optional: send tester feedback to an email instead of GitHub issues |
| `VITE_SUPABASE_URL=… VITE_SUPABASE_KEY=… npm run build` | Optional: switch on accounts + sync (docs/ACCOUNTS.md; the deploy reads repo variables `SUPABASE_URL`, `SUPABASE_KEY`) |
| `VITE_BACKEND=fake npm run dev` | Accounts against a fake in-browser backend (what the e2e tests use; codes are 123456) |
| `npm run build` | Type-check + production build into `dist/` (static files, host anywhere) |

## How it works for the user

1. Open the app. If a workout is in progress, you land straight in it. Otherwise tap a routine; **Next up** is the one you did longest ago.
2. You see the exercise, **Last session: 60 kg × 8 · 8 · 7**, and today's target (the highlighted rep button).
3. After a set, **tap the number of reps you did**. That's it: one tap. Weight is pre-filled and stays the same for the next set.
   Change it with −/+, by typing, or with one-tap chips (*last set*, *last session*, *suggested*).
4. After the last planned set, the app moves to the next exercise by itself. The strip at the top shows every exercise's
   progress (`2/3`, `✓`); tap one to jump there. The bar under it shows your last set, rest time and **Undo**.
5. When an exercise has all its sets, **✓ Finish Exercise** moves on to the next one (or offers **+ Add exercise**).
   Tap **Finish Session** at the top when you're done for the day.
6. The screen stays on during a workout, where the browser supports it.
7. **📷 Scan machine** → take a photo → *What are you using?* → tap **Start**, and you're tracking it. Today the suggestions are
   a demo; see [docs/RECOGNITION.md](docs/RECOGNITION.md) for how real recognition plugs in.
8. **Optional account** (Profile → Account): email + password, backs up and syncs your workouts between phones. It's
   switched on once Supabase is set up; see [docs/ACCOUNTS.md](docs/ACCOUNTS.md).

## Project structure

Four independent layers. Each can be replaced without touching the others (see docs/ROADMAP.md):

```
src/
  types.ts                  The data model (Exercise, Routine, WorkoutSession, Profile, AppData)
  logic/                    PURE TypeScript - no React, no browser. Reusable in a native app or on a server.
    progression.ts          Progression engine: history → recommendation (docs/PROGRESSION.md)
    journey.ts              Exercise journey: levels and mastery
    equipment.ts            My gym queries: machines per exercise, last used (docs/EQUIPMENT.md)
    game/                   Today's Challenge, XP, levels, streaks, achievements (docs/GAMIFICATION.md)
    muscles/                Muscle map scoring: activity, progress, balance, insights (docs/MUSCLES.md)
    plan.ts                 Free / Premium features (a preview switch until there are payments)
    history.ts              History helpers and formatting
  data/                     Workout logic + storage
    actions.ts              Pure state changes: startWorkout, logSet (validated), finishWorkout, ...
    validate.ts             Checks saved/imported data and form input; migrations
    storage.ts              DataStore interface + localStorage implementation (swap for a DB/native store)
    store.tsx               React glue: state, save on change, cross-tab sync, save errors
    backup.ts               Export / restore a JSON backup
    seed.ts                 Starter + sample data
    useProgress.ts          React hooks over logic/game
    account.tsx             Optional account: who is logged in, background sync (docs/ACCOUNTS.md)
  services/                 Replaceable integrations
    recognition/            Photo → exercise: contract, demo, backend adapter (docs/RECOGNITION.md)
    backend/                Accounts + sync: contract, sync engine, Supabase adapter, fake backend for tests
    image.ts                Photo resizing (photos are never stored)
  components/               Reusable UI (Screen, Stepper, TabBar, ErrorBoundary, TrendChart, ...)
  screens/                  Screens; bigger ones are folders (workout/, history/, exercises/)
  App.tsx                   Routes, welcome screen on first run, save-error banner
e2e/                        Phone-sized browser tests: flows, first run/backup, accounts, offline, accessibility
supabase/                   Database schema (tables + security rules) and its test script
public/ + scripts/          App icons (regenerate with `node scripts/make-icons.mjs`)
docs/                       ARCHITECTURE (decision log), ROADMAP (backend/native/product review), feature docs
```

## The core loop

**Previous performance → progression engine → Today's Challenge → you do the set → result vs target → reward or
"Not today" → journey updated → next challenge.**

- **Today's Challenge** (e.g. *60 kg × 9*): more reps, more weight, *repeat* or *try again*, once there's enough history.
- **Journey** (exercise page): ✓ mastered levels → *current challenge* → 🔒 next. Mastered = every set, 2 workouts in a row.
- **Missed?** "NOT TODAY", never "failed". The next challenge adapts: same target after a near miss, adjusted after a bigger one.
- **Rewards**: target hit, back on track, weight mastered, personal best, consistency. XP → levels → achievements.
- **My Gym**: your machines with settings, last weights and previous session. Shown during the workout.
- **Fix mistakes**: tap any logged set (or *Edit sets* on a workout summary) to change or delete it.
- **Muscle map** (Muscles tab): *what am I training?* (a heat map of activity) and *where am I progressing?* (training
  performance per muscle), front and back, male or female figure, any period; tap a muscle for its exercises and
  performance. Shows recorded training and performance, never muscle growth. Details: [docs/MUSCLES.md](docs/MUSCLES.md).
- **Cardio, warm-ups, cool-downs**: add them to routines or mid-workout, in any order. Pick the activity, **START**,
  **STOP**: the duration is saved (nothing to type; accurate when the screen locks). **Warm-up** sets never affect
  progression. Details: [docs/CARDIO.md](docs/CARDIO.md).
- **Leaderboard** (with an account, opt-in): your weekly rank right under the level bar; week / month / all time;
  ranked by XP with healthy limits (5 counted days a week), never by weight. Only your display name is public.
  Details: [docs/LEADERBOARD.md](docs/LEADERBOARD.md).
- **kg or lb** (Profile). **Send feedback** (Profile). A gentle **backup reminder** every couple of weeks.

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
