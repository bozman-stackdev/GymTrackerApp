# Muscle map

The **Muscles** tab answers two questions at a glance:

- **What am I training?** (*Activity*): a heat map of how much each muscle was trained.
- **Where am I progressing?** (*Progress*): a map of training **performance** progression per muscle.

It shows the training and performance the user recorded. It **cannot** measure muscle size or growth, and never
claims to: no "your chest grew 8%". The wording is always *training*, *performance* and *progression*.

## For the user

- **Activity | Progress** at the top switches the mode.
- **Workout · Week · 4 wks · 12 wks · All** picks the period (*this workout*, *this week*, *last 4 / 12 weeks*, *all
  time*). Weeks start on Monday.
- **Front | Back** (or a sideways swipe on the figure) turns the body around:
  - *Front:* chest, front and side shoulders, biceps, forearms, abs, obliques, quadriceps, inner thighs, the top of
    the trapezius, and the calves from the front.
  - *Back:* upper back (trapezius and shoulder blades), rear and side shoulders, triceps, forearms, lats, lower back,
    obliques, glutes, hamstrings, calves.
- **The figure** is coloured on one scale per mode:
  - *Activity:* None → Low → Medium → High, a single warm (orange) scale.
  - *Progress:* Lower → Stable → Moderate → Strong, a single green scale; *lower* is a calm grey-blue, never red.
- **A headline** says it in words: *Most trained: Triceps · Front shoulders · Chest*, or *Progressing most: Chest ·
  Quadriceps*.
- **Tap a muscle** (or Tab + Enter) to open a bottom sheet with:
  - its activity and training progress;
  - the recent exercises that trained it;
  - recent performance, e.g. *Chest Press Machine 45 kg × 9 → 45 kg × 12*.
- **Group summary** (Chest, Back, Shoulders, Arms, Core, Legs): bars with a percentage, or a progress label. Tap a
  group to see its muscles.
- **Muscle balance**, *Your recent training*:
  - Upper body / Lower body / Pushing / Pulling as High · Moderate · Low, plus neutral sentences, e.g. *Training
    emphasis: pushing. Pulling: lower recent training volume.*
  - Balance always looks at weeks: for a single workout it shows the last 4 weeks, since a leg day is meant to be all
    legs.
- **Body:** male or female figure, chosen on the first visit or in Profile → *Body on the muscle map*. Unset, it
  follows Profile → Sex. Both figures have the same muscles in the same places.
- **Elsewhere in the app:**
  - *Exercise page:* "Muscles worked" (main and also-works muscles on a small map), and what share of a muscle's
    sets the exercise gave in the last 4 weeks.
  - *Exercise form:* a "Muscles worked" picker. Tap a muscle once for *main*, again for *also works*, again to remove.
    New custom exercises are prefilled from the name ("Hack Squat" → quadriceps, glutes).
  - *Workout summary:* "Muscles in this workout" on a small map; tapping it opens the map for that workout.
  - *Today's Challenge → Why?:* what the exercise works, and whether it's the user's main exercise for that muscle
    lately (see below).

## Where the muscles come from (data model)

The **exercise library is the source of truth**. Every exercise can carry its muscles:

```ts
interface ExerciseMuscles {
  primary: MuscleId[];       // count 1.0 per set (configurable)
  secondary: MuscleId[];     // count 0.5 per set (configurable)
  weights?: Partial<Record<MuscleId, number>>;   // per-muscle override, 0–1 (e.g. a lateral raise barely uses the upper back)
}
interface Exercise { /* … */ muscles?: ExerciseMuscles }
```

| Exercise | Primary | Secondary |
|---|---|---|
| Barbell Bench Press | Chest | Triceps, Front shoulders |
| Lat Pulldown | Lats | Biceps, Upper back |
| Leg Press | Quadriceps | Glutes, Hamstrings |
| Seated Cable Row | Upper back, Lats | Biceps, Rear shoulders |
| Lying Leg Curl | Hamstrings | Calves (0.25) |

The rest are in `src/data/seed.ts`.

**There are 17 muscles** (`MuscleId`), in six groups:

| Group | Muscles |
|---|---|
| Chest | Chest |
| Shoulders | Front, side and rear shoulders |
| Arms | Biceps, triceps, forearms |
| Back | Upper back, lats, lower back |
| Core | Abs, obliques |
| Legs | Glutes, quadriceps, hamstrings, inner thighs, calves |

**Left and right** are drawn as separate shapes, labelled with the body's side (`data-side`), but scored together,
because sets aren't recorded per side. The model is ready for per-side data if the app ever records it.

**Older data keeps working**, with no manual step:

1. **Built-in exercises saved before the muscle map** get their muscles from the library when the data loads
   (`migrateMuscles` in `data/validate.ts`). This covers backups too.
2. **Custom exercises without muscles** (and anything synced from an older app) are worked out from their name, then
   their muscle group (`musclesFor` / `suggestMuscles` in `logic/muscles/catalog.ts`). Once edited in the form they
   store their own muscles.
3. **Unknown muscle ids** from a newer app version are dropped. A malformed muscle list is rejected with a clear
   error, like any invalid backup.
4. **Deleted exercises** in old workouts are skipped, not guessed.

## Activity score

- **Activity** is the number of **weighted working sets** in the period: each set counts 1.0 for the exercise's
  primary muscles and 0.5 for its secondary ones (or the exercise's own weight).
- **What never counts:** warm-up sets (they live in a separate warm-up entry, never in an exercise's sets), cardio,
  warm-ups and cool-downs.
- **What the map shows:** the activity **relative to the most-trained muscle in the period** (that muscle = 100%). It
  answers "what am I training most?", not "is it enough?", so it never sets a target.
- **Levels:** High ≥ 67%, Medium ≥ 34%, Low > 0, None.
- **Groups** show the average of their muscles.

**Example (this week):**

- The workouts: bench press 3 × 8, and cable pushdowns 2 sets.
- Triceps get 2 + 1.5 = 3.5 weighted sets, the top muscle: 100%, High.
- Chest gets 3: 86%, High.
- Front shoulders get 1.5: 43%, Medium.
- Everything else: None.

## Progress score (training performance, not growth)

Each exercise is compared with **before the period**: the user's best set just before it, or the period's first
workout of that exercise when there's nothing before. That comparison is turned into five factors, combined by
configurable weights:

| Factor | Weight | Score | How it's measured |
|---|---|---|---|
| **Performance** (weights and reps) | 0.45 | -1 to 1 | Journey steps gained by the best set in the period. One step = one more rep, or the next weight back at the bottom of the rep range, exactly the ladder Today's Challenge climbs. So 60 kg × 12 → 62.5 kg × 8 is **+1**, not a drop. +1 step every 2 workouts = full score. |
| **Volume** | 0.15 | -1 to 1 | Best workout volume (weight × reps) vs before; +10% = full score. |
| **Challenges** | 0.20 | 0 to 1 | Share of Today's Challenges completed (from the game replay). |
| **Mastery** | 0.10 | 0 to 1 | Weights mastered in the period. |
| **Consistency** | 0.10 | 0 to 1 | Weeks the muscle was trained ÷ weeks in the period. Only for periods of 2+ weeks. |

- **Missing factors:** a factor without data (no challenges yet, consistency for a single workout) is left out of
  the average.
- **Main exercises decide.** A muscle's progress comes from the exercises that train it **mainly**; exercises that
  only also work it decide only when it has no main exercise in the period. So a stalled shoulder press isn't hidden
  by chest presses that also work the front shoulders.
- **Light involvement doesn't count:** under 0.5, e.g. calves in a leg curl, an exercise never decides a muscle's
  progress.

**Levels:**

| Score | Label |
|---|---|
| ≥ 0.45 | ↑ Strong progression |
| ≥ 0.15 | ↗ Moderate progression |
| > -0.15 | → Stable |
| ≤ -0.15 | ↓ Lower than before |
| Nothing to compare yet | Not enough data yet |

Group progress is the average of its muscles, weighted by how much each was trained.

**Example (last 4 weeks, bench press, 5–8 reps, 2.5 kg steps):**

| | Workouts | Steps | Label |
|---|---|---|---|
| **Improving** | before 60 kg × 6; then 60 × 7, 60 × 8, 60 × 8, 62.5 × 5 | +3 in 4 workouts: performance 1.0 | Strong progression |
| **Flat** | 60 kg × 6 every time | 0: only consistency scores | Stable |
| **Dropping** | before 60 kg × 6; then 55 kg | below before | Lower than before |

## Balance

- **The regions:**
  - *Upper body:* chest, shoulders, arms, upper back, lats.
  - *Lower body:* glutes, quads, hamstrings, inner thighs, calves.
  - *Pushing:* chest, front and side shoulders, triceps.
  - *Pulling:* lats, upper back, rear shoulders, biceps.
- **How it's measured:** each region is the average weighted sets per muscle, so regions with more muscles aren't
  favoured.
- **Levels:** relative to the busiest region (High ≥ 70%, Moderate ≥ 40%, else Low).
- **The sentences:** one side is described as an emphasis when it has 1.5× the other's sets. They are about training
  volume only, never the body: never "unbalanced", never about appearance.
- **Too little data:** under 6 weighted sets in the period, there's nothing to compare.

## Free and Premium

The app had no subscription system, so a small **plan layer** was added (`src/logic/plan.ts`). It's one list of what
each plan has; screens ask `can(plan, feature)`.

| | Free | Premium |
|---|---|---|
| Body map, activity, periods up to 4 weeks | ✓ | ✓ |
| Basic training progress (labels, recent performance) | ✓ | ✓ |
| Balance | ✓ | ✓ |
| Last 12 weeks and all time | | ✓ |
| Progress details (what's behind it) | | ✓ |
| 12-week trends (per group, per muscle) | | ✓ |
| Comparisons with the period before | | ✓ |
| Personal insights | | ✓ |

**How Premium is switched on today:**

- There are **no payments yet**. Premium is a **preview** for testing: Profile → Plan, or "Try Premium preview" in the
  Premium sheet.
- It's stored on the phone only (`AppData.premiumPreview`, not synced).
- When real subscriptions exist, `planOf()` reads the subscription from the account instead, and nothing else changes.
- Locked items show a *Premium* badge and explain what they add. The basic map is never locked.

## Today's Challenge

The **progression engine stays the only authority** for challenges: the muscle map never changes a target.

What it adds is context in **Why?**:

- what the exercise works, e.g. *Works Chest, plus front shoulders, triceps*;
- when the exercise gives a big share (30%+) of a main muscle's sets in the last 4 weeks, *Your main chest exercise
  lately (50% of its sets in 4 weeks) · chest training progress: strong progression*.

## Achievements

These reward progress and complete, balanced plans, never extra volume. They give no XP, like all achievements.

| Achievement | Earned by |
|---|---|
| **First Chest Milestone** | Mastering a weight on a chest exercise. |
| **Back Progression** | Completing 5 challenges on back exercises. |
| **Leg Day Complete** | Finishing every planned set of a workout that trains quads, hamstrings and glutes. |
| **Balanced Training** | A week with pushing, pulling and legs, none trained less than half as much as the most-trained. |
| **Muscle Mastery** | Mastering a weight in 4 different muscle groups. |

Lots of sets without progress earn none of the progress achievements. Balanced Training depends on how a week is spread, not on its amount: 3 sets each count as much as 30 (tested).

## What the map can't tell you

- **Not growth or size.** It can't see muscle size, growth, body composition or recovery, only what was recorded.
- **Estimated involvement.** How much each exercise works a muscle is a sensible standard estimate. Technique,
  machines and people differ.
- **Not advice.** It's not medical advice or an assessment. It shows the training distribution and performance
  trends.

## Code map

| | |
|---|---|
| `src/logic/muscles/catalog.ts` | Muscles, groups, regions, `musclesFor`, `involvement`, `suggestMuscles` |
| `src/logic/muscles/config.ts` | `MUSCLE_CONFIG`: every weight and threshold |
| `src/logic/muscles/analysis.ts` | Periods, activity, progress, balance, `analyseMuscles` |
| `src/logic/muscles/insights.ts` | Trends, comparisons, insights, `exerciseShare` (Premium and challenge context) |
| `src/logic/muscles/labels.ts` | All wording for levels and notes |
| `src/logic/plan.ts` | Free / Premium |
| `src/components/body/` | The figure (`figure.ts`: geometry; `BodyMap.tsx`; `MiniMaps.tsx`) |
| `src/screens/muscles/` | The screen, the sheet, small parts |

Tests: `src/logic/muscles/muscles.test.ts` (scoring), `src/components/body/figure.test.ts` (drawing),
`e2e/muscles.spec.ts` (screens, Free/Premium, accessibility, small phone).
