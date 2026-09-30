# Progression engine

Code: `src/logic/progression.ts` · Scenarios: `src/logic/progression.test.ts` (`npm run test:scenarios`)

The app suggests when to add reps or weight, using **only the user's own history** for that exercise.
It is a simple rule of thumb ("double progression"), not medical or coaching advice. The app says so next to every suggestion.

## How it decides

1. **Analyse** the exercise's finished sessions into a few facts (`analyse()`):
   - last session's working weight (heaviest weight used; lighter warm-up sets are ignored) and reps per working set
   - sessions in a row at the **top** of the rep range at that weight (every working set ≥ top)
   - sessions in a row where **no** working set reached the bottom of the range at that weight
   - number of "good" sessions at that weight (every working set within or above the range)
   - recent vs earlier performance: the average best estimated 1RM of the last 2 sessions compared with the 3 before
2. **Apply rules in order**; the first match wins (`recommend()`):

| Rule | When | Suggestion | Example text |
|---|---|---|---|
| R0 | No history | Pick a starting weight | "First time" |
| R1 | < 3 sessions **or** < 14 days of history | No advice, match last time | "Building your history: suggestions start after 1 more session and 7 more days of history." |
| R2 | Top of range on every set, **2 sessions in a row** | + one weight step, reps back to bottom | "Try 65 kg × 8 — You completed 60 kg × 12+ on every set in your last 2 sessions. Consider increasing the weight…" |
| R3 | Top of range, but only once so far | Stay, repeat it | "Stay at 60 kg × 12 — …Aim for another strong session before increasing." |
| R4 | No set reached the range, **2 sessions in a row** | − one weight step | "Try 65 kg × 8 — No set reached 8 reps at 70 kg in your last 2 sessions…" |
| R5 | Last 2 sessions ≥ 5% below the 3 before | Stay, consolidate | "Stay at 60 kg × 8 — Your last 2 sessions were about 8% below the ones before…" |
| R6 | Anything else | Same weight, +1 rep on the weakest set | "Try 60 kg × 11 — Last session: 11, 10, 10 reps at 60 kg. Add a rep to your weakest set…" |

Bodyweight exercises (weight step 0) progress by reps only.

## Where it shows up

- **Workout screen:** one line under "Last session" (e.g. *Try 60 kg × 9*). Tap **Why?** for the explanation and disclaimer.
  The suggested weight is pre-filled and the suggested reps are highlighted on the rep pad, so following it is one tap.
- **Exercise page:** the same suggestion, with the explanation always visible.

## Changing it

- **Thresholds:** edit `PROGRESSION_CONFIG` (or pass a different config to `recommend()`, e.g. per user later):

| Setting | Default | Meaning |
|---|---|---|
| `minSessions` | 3 | Sessions before any advice |
| `minDaysOfHistory` | 14 | Days between first and latest session before any advice |
| `sessionsAtTopBeforeIncrease` | 2 | Consistent sessions at the top before adding weight |
| `sessionsBelowRangeBeforeDecrease` | 2 | Sessions with no set in range before going lighter |
| `recentSessions` / `earlierSessions` | 2 / 3 | Window for "recent vs earlier" |
| `dipThreshold` | 0.05 | Drop (5%) that counts as a dip |

- **Per exercise:** rep range and weight step are set on each exercise (Exercises → ✎).
- **Rules:** each rule is one `if` block in `recommend()`. Add or reorder rules there, then add a scenario to the test table.
  The UI only displays `title` and `reason`, so no screen needs to change.

## Example scenarios (all in the test suite)

Machine press, rep range 8–12, 5 kg step. Histories are oldest → newest, roughly weekly.

| History | Result |
|---|---|
| (none) | R0 First time |
| 60×10,10,9 | R1 Match last time (2 more sessions) |
| 60×12,12,12 · 60×12,12,12 | R1 Match last time. Never after one or two sessions. |
| 3 sessions within 6 days | R1 Match last time (more days of history) |
| 60×9,9,8 · 60×10,10,9 · 60×11,10,10 | R6 Try 60 kg × 11 |
| 60×10,10,9 · 60×11,11,10 · 60×12,12,12 | R3 Stay at 60 kg × 12 |
| 60×11,11,10 · 60×12,12,12 · 60×12,12,12 | R2 Try 65 kg × 8 |
| … 60×12,12,12 · 60×12,12,11 | R6 Try 60 kg × 12 (a missed rep breaks the streak) |
| 55×12 ×2 · 60×12,12,12 | R3 Stay at 60 kg × 12 (streak at a lighter weight doesn't count) |
| 65×9,8,7 · 65×8,8,7 · 65×8,8,7 | R6 Try 65 kg × 8 (last-set fatigue isn't "too heavy") |
| 65×9,9,8 · 65×10,9,9 · 65×7,6,6 | R6 Try 65 kg × 8 (one bad day isn't "too heavy") |
| 70×8,7,7 · 70×7,7,6 · 70×7,6,6 | R4 Try 65 kg × 8 |
| 60×11–12 ×3 · 60×8,8,8 ×2 | R5 Stay at 60 kg × 8 |
| small one-rep wobble | R6 (not a dip) |
| Bodyweight 12,12,12 · 12,12,13 | R2 Try 13 reps |
