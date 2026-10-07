-- Gym Tracker: leaderboard upgrade for a project that already ran the accounts schema.
-- Same result as the leaderboard parts of schema.sql, written plainly for the Supabase SQL editor. Safe to run again.

alter table public.profiles add column if not exists leaderboard_visible boolean not null default false;

do $do$ begin
  alter table public.profiles add constraint display_name_not_email check (position('@' in display_name) = 0) not valid;
exception when duplicate_object then null;
end $do$;

do $do$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'insert own profile') then
    create policy "insert own profile" on public.profiles for insert to authenticated with check (id = (select auth.uid()));
  end if;
end $do$;
grant select, insert, update on public.profiles to authenticated;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $fn$
declare
  name text := nullif(left(trim(new.raw_user_meta_data ->> 'display_name'), 40), '');
begin
  if position('@' in coalesce(name, '')) > 0 then name := null; end if;
  insert into public.profiles (id, display_name, leaderboard_visible)
  values (new.id, coalesce(name, 'Gym member'), coalesce((new.raw_user_meta_data ->> 'leaderboard')::boolean, false))
  on conflict (id) do nothing;
  return new;
exception when invalid_text_representation then
  insert into public.profiles (id, display_name) values (new.id, coalesce(name, 'Gym member')) on conflict (id) do nothing;
  return new;
end
$fn$;

create table if not exists public.leaderboard_days (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day        date not null,
  points     integer not null check (points between 1 and 300),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, day),
  constraint leaderboard_day_sane check (day >= date '2020-01-01')
);
alter table public.leaderboard_days enable row level security;
create index if not exists leaderboard_days_day on public.leaderboard_days (day, user_id);

do $do$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'leaderboard_days' and policyname = 'own leaderboard days') then
    create policy "own leaderboard days" on public.leaderboard_days for all to authenticated
      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
  end if;
  revoke all on public.leaderboard_days from anon;
end $do$;
grant select, insert, update, delete on public.leaderboard_days to authenticated;

create or replace function public.check_leaderboard_day() returns trigger language plpgsql set search_path = '' as $fn$
begin
  if new.day > current_date + 1 then
    raise exception 'leaderboard day in the future' using errcode = 'check_violation';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end
$fn$;

create or replace trigger leaderboard_days_check before insert or update on public.leaderboard_days
  for each row execute function public.check_leaderboard_day();

create or replace function public.leaderboard(p_period text, p_today date, p_top integer default 5) returns jsonb language plpgsql stable security definer set search_path = '' as $fn$
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
end
$fn$;

create or replace function public.my_leaderboard_record(p_today date) returns jsonb language sql stable security definer set search_path = '' as $fn$
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
  from ranked where user_id = auth.uid()
$fn$;

do $do$ begin
  revoke all on function public.leaderboard(text, date, integer) from public, anon;
  revoke all on function public.my_leaderboard_record(date) from public, anon;
end $do$;
grant execute on function public.leaderboard(text, date, integer) to authenticated;
grant execute on function public.my_leaderboard_record(date) to authenticated;
