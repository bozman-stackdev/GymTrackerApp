# Cardio, warm-ups and cool-downs

**SELECT → START → TRAIN → STOP → DONE.** Cardio records one thing, **duration**, with a start/stop timer.
Nothing is typed during a workout. Warm-ups and cool-downs work the same way. Strength progression never sees any of it.

## For the user

- **Add:** pick Cardio, Warm-up or Cool-down in a routine, or mid-workout (between exercises, or the *+* in the
  strip). Then pick the activity. Cardio lists Treadmill, Cycling, Rowing, Cross Trainer, Stair Climber, Walking,
  Running and Swimming first, then a few more, then *Other…* (type a name once).
- **Timer screen:** the activity shows straight away with `00:00:00` and a huge **START**. When there's history it
  says *Previous: 20:00*; otherwise a routine's *Plan: 20 min* is shown.
- **Running:**
  - a big live clock and a huge red **STOP**;
  - the strip chip shows the running time;
  - on another item, a bar shows *Treadmill 12:03 · Stop*;
  - the screen stays awake during a workout (where supported).
- **Done:** *CARDIO COMPLETE ✓*, the time (*23:42*), *+10 XP* and *Previous 20:00 · Today 23:42 · +3:42*, then a
  huge **DONE**, which moves to the next item. Two optional small links:
  - **Adjust time:** fix a forgotten STOP with a minutes stepper.
  - **Restart:** go back to `00:00:00`.
- **One timer at a time:** starting another activity stops (and saves) the running one. **Finish Session** stops a
  running timer and saves it.
- **Summary and history:** *Treadmill — 23 min 42 sec*, and history rows like *3 exercises · 9 sets · 24 min cardio*.
  *Edit sets* can remove an activity.
- **Profile → Cardio:** sessions, total time, longest, most frequent, and time per activity.

## The timer (and why it's accurate)

- **Elapsed time comes from timestamps,** never a counter: `now − startedAt`.
- **The start time is saved with the workout** (on the phone) the moment START is pressed. STOP saves `endedAt` and
  `durationSec = endedAt − startedAt`.
- **The display refreshes every second,** and immediately when the page becomes visible again (`visibilitychange`,
  `pageshow`, `focus`).

That makes it correct when:

- **the screen locks or the browser is in the background:** browsers pause JavaScript timers, but the start time
  doesn't change;
- **the page reloads or the tab is closed:** reopening the app goes straight back to the workout and the timer shows
  the true elapsed time.

Tested with a controlled clock: a 23-minute jump with no ticks shows exactly 23:43.

**Limits of a web app:**

- **Silent when locked:** no sound or notification while the screen is locked (that needs a native app).
- **Phone clock:** the time follows the phone's clock. Changing the clock mid-cardio changes the result.
- **A forgotten STOP keeps counting:** hence *Adjust time*.
- **Wake lock:** keeping the screen awake depends on browser support (iOS Safari 16.4+).

## XP

| What | XP |
|---|---|
| Any completed cardio (1 minute or more) | **+10**, once per workout. A longer or extra session never earns more. |
| Warm-up / cool-down **planned in the routine** | +3 each, once per workout |
| A timer stopped after a few seconds | Saved, but no XP (a mis-tap) |
| 10+ minutes of cardio | Counts as a real workout (workout XP, streak), so cardio-only days count |

Values are in `GAME_CONFIG` (`src/logic/game/config.ts`).

## Progress (duration only)

- *Previous* and *today* per activity, and the difference (*+3:42*).
- Total cardio time, time per activity, number of sessions, and the longest session.
- **No coaching or suggestions** (the old "try 21 minutes / more incline" hints are gone). If progression is added
  later, it should be duration-based.

## Data model

```ts
interface ActivityEntry {            // inside WorkoutSession.entries (so it belongs to that workout)
  kind: 'cardio' | 'warmup' | 'cooldown';
  activityId: string;                // 'treadmill', 'walking'… or 'other' + name
  name?: string;
  startedAt?: string;                // START
  endedAt?: string;                  // STOP
  durationSec?: number;              // the result (or the user's adjustment)
  doneAt?: string;                   // = endedAt; marks it done everywhere
  planned?: boolean;                 // came from the routine
  plan?: { durationMin?: number };   // routine target, shown as "Plan: 20 min"
  log?: CardioMetrics;               // OLDER workouts only: minutes, distance, speed, incline… (read-only)
  warmupFor?: string; warmupSets?: SetLog[];   // warm-up SETS of a strength exercise (unchanged)
}
```

**Older workouts** (typed-in minutes, speed, incline, distance…) are kept and never deleted:

- their duration is read from `log.durationMin` (`activityDurationSec`);
- the summary shows what they recorded, e.g. *20 min · 6.5 km/h · 5% incline*, never empty fields;
- they still count for stats and XP.

No migration was needed.

**Separation from strength:** cardio is an activity entry, and the strength engine (progression, Today's Challenge,
mastery, personal bests, muscle map) reads strength entries only. Tests check that a treadmill session leaves all of
them unchanged.
