# Cardio, warm-ups and cool-downs

A workout can mix strength exercises with **cardio**, **warm-ups** and **cool-downs**, in any order. Cardio has its
own history and gentle suggestions. Strength progression, Today's Challenge, mastery, personal bests and strength XP
ignore it completely.

## For the user

- **Routine builder:** *Add exercise*, or **Cardio · Warm-up · Cool-down**. Pick an activity (or *Other…* and type a
  name), set planned minutes with −/+, and reorder everything with ↑ ↓.
- **During a workout:** the strip shows every item, with a small icon for activities. An activity screen shows:
  - **LAST SESSION**;
  - an optional hint;
  - a **Minutes** stepper;
  - only the fields that make sense for that activity, prefilled from the plan or last time. Heart rate and calories
    sit under *More (optional)*.
  - Then one tap on **Complete**. Tapped it by mistake? Tap the item, then **Change**.
- **Adding mid-workout:** between exercises, *+ Add exercise* or **Cardio · Warm-up · Cool-down**. The *+* in the strip
  offers the same four tabs.
- **Warm-up sets** of a strength exercise: tap **Warm-up** next to the set boxes. Weight drops to about half and the
  rep pad says *Warm-up set: tap reps*. The sets show as small `25×10` chips with Undo. Tap **Warm-up** again to go
  back to working sets at the working weight. They never count as working sets.
- **Summary and History:** activities are listed in order with their kind, e.g. *Treadmill — 21 min · 6.5 km/h · 5%
  incline*. History rows read *3 exercises · 9 sets · 25 min cardio*. *Edit sets* can remove an activity.
- **Profile → Cardio** (once you have some): sessions, total time, running distance (running + treadmill), longest
  session, most frequent activity.

## Activities and their fields

| Activity | Shown | Under "More" |
|---|---|---|
| Running | minutes, distance | heart rate (pace is derived) |
| Treadmill | minutes, speed, incline, distance | heart rate |
| Walking | minutes, distance | |
| Cycling | minutes, distance | heart rate |
| Stationary Bike | minutes, level, distance | calories, heart rate |
| Rowing Machine, Ski Erg | minutes, distance in **metres**, level (rowing) | calories, heart rate |
| Cross Trainer, Stair Climber | minutes, level | calories, heart rate |
| Swimming | minutes, distance in metres | heart rate |
| Assault Bike | minutes, distance | calories, heart rate |
| Dynamic Stretching, Stretching, Mobility, Band Work, Bodyweight Squats, Foam Rolling | minutes | |
| Other (named by you) | minutes, distance | calories |

Every field is optional; nothing is forced. In lb mode, distance shows in miles and speed in mph (stored in km and
km/h). The catalogue is `src/logic/activities.ts`: add an activity there and nothing else needs to change. Unknown
ids show as "Other".

## Suggestions (cardio only)

Suggestions are gentle and never applied automatically. Today's fields are always prefilled with **last time's**
values. Rules are in `CARDIO_RULES` in `src/logic/cardio.ts`:

- With fewer than **2** sessions of that activity, there's no hint.
- If the last two sessions had the same time, the hint is **"Try N+1 minutes today"**. This only applies to 10+
  minutes, so +1 minute is never more than **10%**.
- If the treadmill time and incline were the same **3** times in a row: **"Keep N minutes and try X+0.5% incline"**.
- Otherwise: **"Match last time"**.
- Warm-ups and cool-downs never get hints; they are meant to stay easy.
- Cardio never creates a challenge.

## XP (small, capped, no reason to do extra)

Each of these counts **at most once per workout**:

| What | XP |
|---|---|
| Any cardio completed | +5 |
| Warm-up completed, *if it was planned in the routine* | +3 |
| Cool-down completed, *if it was planned in the routine* | +3 |

Extra activities added mid-workout, and warm-up sets, earn nothing. A workout with **10+ minutes** of completed cardio
counts as a real workout (the usual +10, once a day), so cardio-only days count for the streak and workout XP. Values
are in `GAME_CONFIG` (`src/logic/game/config.ts`).

## Data model

`WorkoutSession.entries` stays one ordered list, which is what makes mixing and reordering possible. Each item is one
of two shapes (`src/types.ts`):

```ts
type SessionEntry = StrengthEntry | ActivityEntry;

// STRENGTH - unchanged from before; `kind` is absent (or 'strength'), so all old data is valid as is.
interface StrengthEntry { kind?: 'strength'; exerciseId; targetSets; sets: SetLog[]; equipmentId? }

// CARDIO / WARM_UP / COOL_DOWN
interface ActivityEntry {
  kind: 'cardio' | 'warmup' | 'cooldown';
  activityId: string;          // 'treadmill', 'mobility', ... or 'other' with a name
  name?: string;
  plan?: CardioMetrics;        // from the routine
  log?: CardioMetrics;         // what was done
  doneAt?: string;             // set by Complete
  planned?: boolean;           // came from the routine (only planned warm-ups/cool-downs earn XP)
  warmupFor?: string;          // warm-up SETS of a strength exercise...
  warmupSets?: SetLog[];       // ...live here, never in the exercise's `sets`
}

interface CardioMetrics { durationMin?, distanceKm?, speedKmh?, inclinePct?, level?, calories?, avgHeartRate? }
```

Routine items use the same split: `{ exerciseId, sets }` or `{ kind, activityId, name?, plan? }`.

**How separation is guaranteed:**

- It's structural. The strength engine reads `strengthEntries(session)` (`src/logic/entries.ts`); cardio reads
  `activityEntries(session)`. Warm-up sets are in a different entry, so no strength calculation can see them.
- The compiler enforces it. Because `SessionEntry` is a union, TypeScript rejects `entry.sets` until code has checked
  `isStrength(entry)`.
- Tests confirm it. `src/logic/cardio.test.ts` checks that a warm-up and a treadmill session leave the recommendation,
  challenge, mastery, personal bests, strength XP and equipment history identical.

**Storage, backup and sync:** activity entries are part of the session JSON. `validate.ts` checks them (known kind,
numbers in sane ranges), and they back up and sync unchanged.

## Not included (yet)

- Scan (photo recognition) is for strength machines only.
- No heart-rate zones, GPS or wearable import.
- Editing the numbers of a finished activity: today it can be removed, but not changed.
