-- Gym Tracker: accounts + sync.
-- Run once in Supabase: Dashboard → SQL Editor → New query → paste this file → Run. Safe to run again.
--
-- Security model: the app uses the public (anon / publishable) key. Row-level security below means a signed-in user
-- can only read and write their OWN rows; signed-out visitors can read and write nothing.

-- ---------- Synced records: one row per workout / exercise / routine / machine / profile ----------
create table if not exists public.records (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('session', 'exercise', 'routine', 'equipment', 'profile')),
  id         text not null check (char_length(id) between 1 and 100),
  data       jsonb,                                   -- null for a deletion ("tombstone")
  deleted    boolean not null default false,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, kind, id),
  constraint record_size check (pg_column_size(data) <= 100000),
  constraint deleted_has_no_data check (not deleted or data is null)
);
create index if not exists records_user_updated on public.records (user_id, updated_at);

-- The server sets the change time (the app's sync cursor), never the phone.
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;
drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records
  for each row execute function public.touch_updated_at();

alter table public.records enable row level security;
drop policy if exists "own records" on public.records;
create policy "own records" on public.records for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.records from anon;
grant select, insert, update, delete on public.records to authenticated;

-- ---------- Public profile: the display name, and whether to appear on the leaderboard ----------
-- Only the owner can read or change their row. Other users only ever see a display name through the leaderboard()
-- function below, and only if leaderboard_visible is on.
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  created_at   timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select to authenticated using (id = (select auth.uid()));
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
drop policy if exists "insert own profile" on public.profiles;
create policy "insert own profile" on public.profiles for insert to authenticated with check (id = (select auth.uid()));
revoke all on public.profiles from anon;
grant select, insert, update on public.profiles to authenticated;

-- Leaderboard visibility: off unless the user chose it (a tick box when signing up, or later in the app).
alter table public.profiles add column if not exists leaderboard_visible boolean not null default false;
-- A display name is public: never an email address. (Existing rows aren't checked; the leaderboard hides them anyway.)
do $$ begin
  alter table public.profiles add constraint display_name_not_email check (position('@' in display_name) = 0) not valid;
exception when duplicate_object then null; end $$;

-- Create the profile when someone signs up (display name and leaderboard choice from the sign-up form).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  name text := nullif(left(trim(new.raw_user_meta_data ->> 'display_name'), 40), '');
begin
  if position('@' in coalesce(name, '')) > 0 then name := null; end if;
  insert into public.profiles (id, display_name, leaderboard_visible)
  values (new.id, coalesce(name, 'Gym member'), coalesce((new.raw_user_meta_data ->> 'leaderboard')::boolean, false))
  on conflict (id) do nothing;
  return new;
exception when invalid_text_representation then -- an odd 'leaderboard' value: sign up anyway, not on the board
  insert into public.profiles (id, display_name) values (new.id, coalesce(name, 'Gym member')) on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Leaderboard (docs/LEADERBOARD.md) ----------
-- The phone publishes its leaderboard points per day (XP earned that day, within the healthy limits of
-- src/logic/leaderboard/score.ts: max 5 counted days a week, max 300 a day). Rows are private like everything else;
-- the leaderboard() function below adds them up and returns ONLY rank, display name and points of visible users.
create table if not exists public.leaderboard_days (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day        date not null,
  points     integer not null check (points between 1 and 300),  -- keep in step with GAME_CONFIG.leaderboard.maxDailyPoints
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, day),
  constraint leaderboard_day_sane check (day >= date '2020-01-01')
);
create index if not exists leaderboard_days_day on public.leaderboard_days (day, user_id);

-- No points for the future (beyond tomorrow, for time zones). The server sets the change time.
create or replace function public.check_leaderboard_day() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.day > current_date + 1 then
    raise exception 'leaderboard day in the future' using errcode = 'check_violation';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end $$;
drop trigger if exists leaderboard_days_check on public.leaderboard_days;
create trigger leaderboard_days_check before insert or update on public.leaderboard_days
  for each row execute function public.check_leaderboard_day();

alter table public.leaderboard_days enable row level security;
drop policy if exists "own leaderboard days" on public.leaderboard_days;
create policy "own leaderboard days" on public.leaderboard_days for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.leaderboard_days from anon;
grant select, insert, update, delete on public.leaderboard_days to authenticated;

-- The board for a period ('week' | 'month' | 'all') as the caller sees it:
--   { participants, top: [{rank, name, points, me}], around: [...the person above you, you, below],
--     me: { visible, rank, points, previousRank } }
-- p_today is the caller's local date (weeks are Monday-based); it's kept within a day of the server's date.
-- Ties share a rank. previousRank is the rank at the end of yesterday (for "↑3 since yesterday").
create or replace function public.leaderboard(p_period text, p_today date, p_top integer default 5)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me        uuid := auth.uid();
  today     date := least(greatest(coalesce(p_today, current_date), current_date - 1), current_date + 1);
  top_n     integer := least(greatest(coalesce(p_top, 5), 1), 20);
  start_day date;
  result    jsonb;
begin
  if me is null then raise exception 'not signed in'; end if;
  start_day := case p_period
    when 'week' then date_trunc('week', today)::date
    when 'month' then date_trunc('month', today)::date
    when 'all' then date '2020-01-01'
  end;
  if start_day is null then raise exception 'unknown period %', p_period; end if;

  with scores as (
    select d.user_id,
           case when position('@' in p.display_name) > 0 or btrim(p.display_name) = '' then 'Gym member'
                else left(btrim(p.display_name), 30) end as name,
           sum(d.points) as points,
           coalesce(sum(d.points) filter (where d.day < today), 0) as previous
    from public.leaderboard_days d
    join public.profiles p on p.id = d.user_id and p.leaderboard_visible
    where d.day between start_day and today
    group by d.user_id, p.display_name
  ),
  prev as (
    select user_id, rank() over (order by previous desc) as prev_rnk from scores where previous > 0
  ),
  board as (
    select s.user_id, s.name, s.points, prev.prev_rnk,
           rank() over (order by s.points desc) as rnk,
           row_number() over (order by s.points desc, s.name, s.user_id) as pos
    from scores s left join prev using (user_id)
    where s.points > 0
  ),
  mine as (select * from board where user_id = me),
  shown as (
    select b.*, b.pos <= top_n as in_top from board b
    where b.pos <= top_n
       or (b.pos > top_n and (select pos from mine) > top_n and b.pos between (select pos from mine) - 1 and (select pos from mine) + 1)
  )
  select jsonb_build_object(
    'participants', (select count(*) from board),
    'top', coalesce((select jsonb_agg(jsonb_build_object('rank', rnk, 'name', name, 'points', points, 'me', user_id = me) order by pos)
                     from shown where in_top), '[]'::jsonb),
    'around', coalesce((select jsonb_agg(jsonb_build_object('rank', rnk, 'name', name, 'points', points, 'me', user_id = me) order by pos)
                        from shown where not in_top), '[]'::jsonb),
    'me', jsonb_build_object(
      'visible', coalesce((select leaderboard_visible from public.profiles where id = me), false),
      'rank', (select rnk from mine),
      'points', coalesce((select points from mine), 0),
      'previousRank', (select prev_rnk from mine)
    )
  ) into result;
  return result;
end $$;
revoke all on function public.leaderboard(text, date, integer) from public, anon;
grant execute on function public.leaderboard(text, date, integer) to authenticated;

-- The caller's finishes in completed weeks (for the Top 100 / 50 / 10 / 3 / #1 badges and podium medals):
--   { bestWeeklyRank, podiums: { first, second, third } }
create or replace function public.my_leaderboard_record(p_today date)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with params as (
    select date_trunc('week', least(greatest(coalesce(p_today, current_date), current_date - 1), current_date + 1))::date as this_week
  ),
  weekly as (
    select d.user_id, date_trunc('week', d.day)::date as week, sum(d.points) as points
    from public.leaderboard_days d
    join public.profiles p on p.id = d.user_id and p.leaderboard_visible
    where d.day < (select this_week from params)
    group by 1, 2
  ),
  ranked as (
    select user_id, rank() over (partition by week order by points desc) as rnk from weekly where points > 0
  )
  select case when auth.uid() is null then null else jsonb_build_object(
    'bestWeeklyRank', min(rnk),
    'podiums', jsonb_build_object(
      'first', count(*) filter (where rnk = 1),
      'second', count(*) filter (where rnk = 2),
      'third', count(*) filter (where rnk = 3)))
  end
  from ranked where user_id = auth.uid();
$$;
revoke all on function public.my_leaderboard_record(date) from public, anon;
grant execute on function public.my_leaderboard_record(date) to authenticated;

-- ---------- "Delete my account": removes the login and (via on delete cascade) every row above ----------
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
