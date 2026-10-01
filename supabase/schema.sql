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

-- ---------- Public profile (display name), for leaderboards later. Private for now: own row only ----------
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
revoke all on public.profiles from anon;
grant select, update on public.profiles to authenticated;

-- Create the profile when someone signs up (display name from the sign-up form).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(left(trim(new.raw_user_meta_data ->> 'display_name'), 40), ''), 'Gym member'))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

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
