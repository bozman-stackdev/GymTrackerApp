# Accounts and sync

Optional accounts (email + password) that back up workouts and sync them between phones. They're the foundation
for reminders (next) and friends/leaderboards (later). Without an account the app works exactly as before.

Code: `src/services/backend/` (contract, sync engine, Supabase adapter, fake backend) · `src/data/account.tsx`
(React glue) · `src/components/AccountForm.tsx` · `src/screens/AccountScreen.tsx` · database: `supabase/schema.sql`.

## Switching it on (one-time setup, about 15 minutes)

Until these 4 steps are done, the published app shows no account features at all.

1. **Create the project.** Go to supabase.com, sign up (GitHub sign-in is fine), then **New project**:
   name `gym-tracker`, a strong database password (save it in a password manager), region **London (eu-west-2)**
   so data stays in the UK. Free plan.
2. **Create the tables.** In the project: **SQL Editor** → **New query** → paste the whole of `supabase/schema.sql`
   → **Run**. It should say "Success". (Safe to run again later.)
3. **Login settings.** **Authentication** → **Sign In / Providers** → **Email**:
   - Email provider: on.
   - **Minimum password length: 8** (the app asks for 8).
   - **Confirm email: OFF.** Sign-up logs straight in, with no email needed.
4. **Connect the app.** In Supabase: **Project Settings** → **API Keys**. Copy the **Project URL** and the
   **publishable** key (`sb_publishable_…`; older projects call it the **anon public** key).
   **Never use the secret / service_role key.** Then in GitHub: repo **Settings** → **Secrets and variables** →
   **Actions** → **Variables** tab → **New repository variable**, twice:
   - `SUPABASE_URL` = the Project URL
   - `SUPABASE_KEY` = the publishable (anon) key

   Both values are public by design: the database rules (row-level security) are what protect each person's data.
   The next deploy to `main` builds the app with accounts switched on.

**Check it works:** on your phone, Profile → Create account → "✓ Synced". Finish a workout, then in
Supabase **Table Editor** → `records` you should see a row with kind `session`. On a second phone or browser:
Welcome → **Log in to my account** → your history appears.

## How it works

- **The phone is the working copy.** Everything still saves to the phone first, works offline and is instant.
  The account is a synced copy.
- **What is synced:** finished workouts, exercises, routines, My Gym machines and the profile. Not synced: the workout
  in progress (it syncs once you tap Finish Session), backup dates, and sample data (never uploaded).
- **When:** on opening the app, coming back to it, coming back online, about 2 seconds after a change the account
  doesn't have yet (e.g. Finish Session, an edited set), and on **Sync now**.
- **Merging:** every item has an id, so the same workout is never duplicated. If two phones changed the same item,
  the one that syncs last wins. When a phone meets an account for the first time, the account's version wins for
  items both have, and the phone's own extra workouts are added.
- **Deletions** travel too (as "tombstones"), so a workout deleted on one phone disappears on the others.
- **Safety:** a single sync may not delete many items from the account at once (more than 10 and more than 25%):
  they are downloaded again instead. "Start fresh" and "Load sample data" log out first, so clearing a phone never
  empties the account.
- **Logging in on a phone with sample data** replaces the sample data with the account's data.
- **Log out** only affects that phone, and its data stays on it. **Delete account** removes the login and everything
  stored on the server (the data on the phone stays).

## Privacy and security

- **Stored on the server:** email, a hashed password (handled by Supabase Auth, never seen by the app), display name,
  and the synced items listed above. This includes the optional profile details (age, height, weight).
- **Never stored:** photos.
- **Who can see what:** each user can read and write only their own rows (row-level security, tested in
  `supabase/test-schema.sh`). The display name is in its own table, ready for leaderboards; for now only its owner can read it.
- **Where:** the Supabase region chosen in step 1 (London recommended).
- **Before inviting testers:** add a short privacy note to the invite (what's stored, where, how to delete:
  Profile → Delete account).

## Limits (free plan, at the time of writing)

- 500 MB database. One workout is about 1–2 KB, so that's hundreds of thousands of workouts.
- Free projects pause after a week with no activity and are resumed from the dashboard. Fine for testing; consider the paid plan before launch.
- No email is sent (no confirmation, no password reset), so **"Forgot password" doesn't work for now**: a tester who forgets their password needs a new account. Email needs a domain plus an email service; we can add it later.

## Tests

- `src/services/backend/sync.test.ts`: two phones and a shared fake server cover upload, download, edits,
  deletions, conflicts, first-time merge, the mass-deletion safety rule, invalid server data and offline.
- `src/services/backend/supabase.test.ts`: Supabase errors become clear messages.
- `e2e/account.spec.ts` (fake backend, `VITE_BACKEND=fake`): sign up with code → sync → second phone logs in; wrong
  password; forgot password; "Start fresh" logs out first; sample data replaced on log in; delete account.
- `e2e/offline.spec.ts`: a build without settings shows no account features and doesn't include the Supabase code.
- `supabase/test-schema.sh`: runs `schema.sql` on a throwaway Postgres and checks the security rules.
- Not covered automatically: a real Supabase project. Check it by hand after setup (see "Check it works").
