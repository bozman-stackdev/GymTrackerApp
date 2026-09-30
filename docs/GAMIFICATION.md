# Gamification: Today's Challenge, XP, levels, streaks, achievements

Code: `src/logic/game/` · Tests/scenarios: `src/logic/game/game.test.ts`

**TRACK → GET A CHALLENGE → COMPLETE IT → GET REWARDED → COME BACK AND PROGRESS**

## Design principles

- **History is the only source of truth.** XP, levels, streaks, challenges, achievements and personal bests are
  *derived* by replaying finished workouts (`buildProgress`). Nothing game-related is stored, so undoing a set or
  deleting a workout corrects everything, and rules can change without any data migration.
- **It sits underneath the workout.** During a workout you see one challenge line and a brief reward in the last-set
  bar. Totals, level and achievements live on the workout summary and the Profile tab.
- **Rewards follow the plan, never "more".** See *Safety rules* below.

## Today's Challenge (`challenge.ts`)

The challenge is the progression engine's suggestion as one target: `challengeFor(exercise, history)`.

| Engine says | Challenge kind | Shown as |
|---|---|---|
| add a rep (R6) | `more-reps` | TODAY'S CHALLENGE · 60 kg × 9 |
| add weight (R2) | `more-weight` | TODAY'S CHALLENGE · 65 kg × 8 |
| stay after one strong session (R3), or after a dip (R5) | `repeat` | TODAY'S CHALLENGE · REPEAT · 60 kg × 12 (10 XP) |
| go lighter (R4) | `lighter` | TODAY'S CHALLENGE · 55 kg × 8 |
| first time / building history (R0, R1) | none | "Match last time" (no challenge yet) |

Result per exercise (`evaluate`), from the best set at (or above) the target weight:

| Result | When | Reward |
|---|---|---|
| `hit` | a set reaches the target reps | +25 XP, "✓ CHALLENGE COMPLETE" (+10 XP for a *repeat* challenge) |
| `exceeded` | more reps than the target | +25 XP (the same: no bonus for overdoing it) |
| `matched` | not the target, but as good as last session | no XP (XP is only for progress); positive note "✓ Matched last session" |
| `missed` | neither | nothing taken away; "same target next time" |

No separate Start button: the rep pad records the set in one tap, and the reward appears straight away.

## XP and levels (`config.ts`, `levels.ts`)

| Event | XP |
|---|---|
| Workout (≥ 3 sets, max once per day) | 10 |
| Challenge hit or beaten | 25 |
| "Repeat" challenge hit (stay at the same weight × reps) | 10 |
| Personal best | 50 |
| Consistency milestone (every 4 streak weeks) | 50 |
| Matched last session | 0 (by decision: no XP unless you progress) |

Levels: 1 → 0, 2 → 100, 3 → 250, 4 → 500, 5 → 800, 6 → 1200, 7 → 1700, 8 → 2300, 9 → 3000, then +800 per level.
All values are in `GAME_CONFIG`.

## Streak (`streak.ts`)

Consecutive **weeks** (Mon–Sun) with at least **2 workouts**. Extra workouts in a week don't grow it, so there's no reason to
train more than your programme. The week in progress never breaks it. A missed week restarts it quietly.

## Personal bests

The heaviest weight done for a full set within the rep range (most reps for bodyweight exercises).

## Achievements (`achievements.ts`)

First Workout · First Challenge Complete · 5 Workouts · 10 Challenges Complete · 5 Sessions on the Same Exercise ·
Personal Best · Consistency (2+ workouts a week, 4 weeks in a row) · First Weight Increase · 25 Workouts.
They're shown on the workout summary when unlocked and on the Profile tab, never mid-set. Add one by adding a line.

## Safety rules (built in and tested)

- Beating a challenge pays the same as hitting it; lifting heavier than the target earns nothing extra.
- Personal bests only count **at or below the suggested weight** and **within the rep range** (no heavy singles).
- Workout XP needs a real workout (3+ sets) and is paid at most once per day.
- Streaks are weekly, not daily. No penalties, no "you lost your streak" messages.
- The engine can always say "repeat" or "go lighter", and those challenges pay the same as "add weight".
