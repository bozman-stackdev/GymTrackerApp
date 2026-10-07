# Community leaderboard

A light layer of motivation on top of your own progress: *"I've been working hard and I'm moving up."* It is never
*"I need to train more than everyone else."* Your level bar stays first; your rank sits right under it.

## For the user

- **Where:**
  - **Profile:** in the progress card, right under the level bar: *🏆 You're #24 this week ↑ 3 →*. It also appears on
    the workout summary.
  - **Home:** *Level 8 · 5-week streak · #24 this week*.
  - **The full board:** tap that line to open the **Leaderboard** screen.
- **The board:**
  - **Periods:** *Week* (the default), *Month* and *All time*.
  - **Rows:** the top 5 (🥇🥈🥉 for the first three), then *…*, then the person above you, **You** (highlighted) and
    the person below. You never have to scroll through hundreds of rows to find yourself.
  - **Each row:** rank, name and XP. Your own row also shows the change since yesterday: ↑ 3, ↓ 2 or →.
- **Who's on it:**
  - **Account needed:** only people with an account who chose to appear.
  - **Without an account:** the line says *Sign up to compete on the leaderboard*. Nothing else changes: the tracker
    never needs an account.
- **Rewards (recognition only, 0 XP):**
  - **Weekly podium medals** 🥇🥈🥉.
  - **Community achievements:** *Top 100*, *Top 50*, *Top 10*, *Top 3* and *Leaderboard #1*, based on where you
    finished a **completed** week. They are shown in Profile → Achievements under *Community*.
  - **Why no XP:** a place never earns XP, so your rank can't feed back into your rank.
- **Premium:**
  - **Free:** the board itself, for everyone with an account.
  - **Premium insights:** *You're 35 XP away from #23*, *You're in the top 10%*, *Your best weekly finish: #7*.
  - **Paying never changes a position.**

## How the ranking works

**Leaderboard XP** is the XP you earn (the same XP as levels), with two healthy limits:

| Rule | Value | Why |
|---|---|---|
| Training days per week (Mon–Sun) that count | the first **5** | A 6th or 7th day still earns normal XP, but no leaderboard XP. Rest days cost nothing. |
| Maximum per day | **300** | A second workout the same day can't run away with the board. |

- **What earns XP:** XP already rewards following the plan, progress, consistency and recovery. It never rewards
  heavier-than-suggested lifts, longer cardio or extra sessions (see [GAMIFICATION.md](GAMIFICATION.md)). The
  leaderboard therefore inherits all of that.
- **Never ranked:** maximum weight, body weight, total weight, calories, training time or number of workouts.
- **Ties** share a rank (1, 2, 2, 4). **Change** is the rank now compared with the end of yesterday.
- **Where the rule lives:**
  - The rule is in one place: `src/logic/leaderboard/score.ts` (`dailyPoints`), with its numbers in
    `GAME_CONFIG.leaderboard`.
  - To change the rule, change `dailyPoints`. Ranking (`rank.ts`, and the SQL) only adds up and sorts.

## Privacy

| Data | Who sees it |
|---|---|
| Display name (chosen at sign-up, editable in Profile → Account) | Others, **only** while leaderboard visibility is on |
| Leaderboard XP per period, rank | Others, only while visibility is on |
| Email, real name, age, height, weight, sex, workouts, exercises | **Nobody else.** Never sent by the leaderboard |

- **Display name:**
  - 2–30 characters, and never an email. The app refuses one, the database refuses one, and the board shows
    *Gym member* instead of anything containing `@`.
  - It doesn't have to be your real name.
- **Visibility:**
  - **Sign-up:** a ticked *Show me on the leaderboard* box (it can be unticked).
  - **Accounts created before the leaderboard:** off until you tap *Join the leaderboard*.
  - **The switch:** *Leaderboard visibility* is in Profile → Account and at the bottom of the board.
- **Turning it off:**
  - deletes your leaderboard rows from the server first, then hides you;
  - your XP, level, streak and achievements keep working, because they're computed on the phone.
- **Delete account:** removes your leaderboard rows too.

## Refreshing (no polling)

The board is fetched:

- when it's opened, if it's older than a minute;
- after the phone publishes new points (a finished workout or an edited history; this happens after each sync);
- on *Refresh*;
- when the app comes back to the foreground (this triggers a sync).

The last result is kept on the phone (instant display; *Updated 5 min ago*; the last known board when offline).

## Architecture

| Concept | Where |
|---|---|
| User account | Supabase Auth (`Account`, `data/account.tsx`), unchanged |
| Public profile | `profiles` table: `display_name`, `leaderboard_visible` |
| XP | Derived on the phone from workout history (`buildProgress`), unchanged |
| Leaderboard score | `logic/leaderboard/score.ts`: points per day from the XP replay, with the limits |
| Leaderboard ranking | `leaderboard()` SQL function (and `logic/leaderboard/rank.ts`, the reference used by the fake backend) |
| Privacy settings | `profiles.leaderboard_visible`; rows removed when off |

**Data flow:**

1. After a sync, `data/leaderboard.tsx` computes `dailyPoints`.
2. It compares them with what this phone last published (kept in localStorage per account) and sends only the changed
   days to `leaderboard_days` (`user_id, day, points`).
3. Days that lost their points are deleted. The first publish from a phone replaces everything, so phones never
   disagree.
4. Sample data is never published.
5. **Your history counts:** workouts from before the account (kept when signing up) count on *All time*.

**Server** (`supabase/schema.sql`):

- **Rows are private:** `leaderboard_days` has row-level security, so each user reads and writes only their own rows.
- **Checks:** points must be 1–300, and days can't be in the future.
- **`leaderboard(period, today, top)`:**
  - A `security definer` function that ranks visible users only.
  - It returns only `rank`, `name`, `points` and `me`, plus your own `rank`, `previousRank` and `visible`.
  - Weeks start Monday. `today` is the phone's date, kept within a day of the server's.
- **`my_leaderboard_record(today)`:** your best final rank in completed weeks, and your podium count.
- **No access for signed-out visitors:** they can't call either function or read any table.
- **Tests:** `supabase/test-schema.sh` (45 checks; `UPGRADE_FROM=old.sql` also tests upgrading a live project).

## Production setup

1. **Database:** Supabase → SQL Editor → paste `supabase/schema.sql` → Run. It is additive and safe on the live
   project: existing accounts and data are kept, and existing users stay off the board until they join.
2. **App:** nothing else to configure; the same `SUPABASE_URL` and `SUPABASE_KEY` variables are used.

**Known limits** (to address before a large public launch):

- **Trust:**
  - **The problem:** points are computed on the phone. The server caps them (300 a day, no future days), but a
    determined user could publish up to the cap for days they didn't train, or import a fabricated backup.
  - **The fix:** recompute on the server, for example a Supabase Edge Function that runs the same TypeScript
    (`buildProgress` + `dailyPoints`) over the synced `records`.
- **Scale:** the ranking sums rows on every request. That is fine for thousands of users. For much more, add a
  materialized weekly total refreshed by `pg_cron`.
- **Names:** there is no profanity filter or reporting yet. Display names aren't unique (two "Alex" can exist).
- **Past weeks:** past-week badges are computed with current visibility, so someone hiding later changes old ranks
  slightly.

## Development: the mock community

Run with the fake backend: `VITE_BACKEND=fake npm run dev` (the e2e tests do this).

- **The mock community:**
  - About 300 made-up people (`src/services/backend/mockCommunity.ts`) train 1–5 days a week, deterministically.
  - The fake server lives in localStorage, and email codes are always `123456`.
  - Create an account, then open the board.
- **Scenarios:** pick one from the *Development: mock leaderboard* menu at the bottom of the board:

  | Scenario | What it shows |
  |---|---|
  | Realistic community | where you'd really be |
  | You are #1 | rank 1, with medals and badges |
  | You are in the top 10 | rank 7 |
  | You are in the top 100 | rank 64 |
  | You are near the bottom | near the last place |
  | You moved up | #27 → #24 |
  | You moved down | #25 → #27 |
  | No activity this period | not on the board |
  | Visibility off | hidden |
  | No mock users | only real accounts on the fake server |

- **Never in production:** the fake backend and its mocks are only bundled with `VITE_BACKEND=fake`. The published
  app uses Supabase, or no accounts at all.
