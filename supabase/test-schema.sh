#!/bin/sh
# Tests supabase/schema.sql against a plain, EMPTY, throwaway Postgres (16+) database - never a real project.
# It adds a small stand-in for Supabase's auth schema and API roles, runs the schema twice, then checks the
# security rules: each user sees and changes only their own rows, signed-out visitors nothing, delete account works.
#
# Usage: PGHOST=... PGPORT=... PGUSER=postgres sh supabase/test-schema.sh
set -eu
here=$(dirname "$0")
P="psql -v ON_ERROR_STOP=1 -q -At"

$P <<'SQL'
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
-- Supabase's default: new public tables and functions are granted to the API roles. The schema must revoke what it doesn't want.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
SQL
# UPGRADE_FROM=old-schema.sql: start from an older version with a user in it (checks the upgrade of a live project).
if [ -n "${UPGRADE_FROM-}" ]; then
  $P -f "$UPGRADE_FROM" 2>/dev/null
  $P -c "insert into auth.users (email, raw_user_meta_data) values ('old@x.com', '{\"display_name\":\"Old\"}')" >/dev/null
fi
# SCHEMA_FILES: what to apply (default schema.sql), e.g. UPGRADE_FROM=old.sql SCHEMA_FILES=supabase/upgrade-leaderboard.sql.
for f in ${SCHEMA_FILES:-$here/schema.sql}; do
  $P -f "$f" 2>/dev/null
  $P -f "$f" 2>/dev/null # must be safe to run again
done

P="psql -q -At"
A=$($P -c "insert into auth.users (email, raw_user_meta_data) values ('a@x.com', '{\"display_name\":\"Alex\"}') returning id")
B=$($P -c "insert into auth.users (email, raw_user_meta_data) values ('b@x.com', '{}') returning id")
as() {
  if [ "$1" = anon ]; then $P -c "begin; set local role anon; $2; commit;" 2>&1
  else $P -c "begin; set local role authenticated; set local request.jwt.claim.sub = '$1'; $2; commit;" 2>&1; fi
}
failed=0
check() { if echo "$2" | grep -qE "$3"; then echo "PASS  $1"; else echo "FAIL  $1 -> $2"; failed=1; fi; }
upsert="on conflict (user_id, kind, id) do update set data = excluded.data, deleted = excluded.deleted"

check "profiles are created on sign-up" "$($P -c "select string_agg(display_name, ', ' order by display_name) from profiles where display_name <> 'Old'")" "^Alex, Gym member$"
if [ -n "${UPGRADE_FROM-}" ]; then
  check "upgrade: existing accounts are kept, off the leaderboard" "$($P -c "select display_name || '=' || leaderboard_visible from profiles where display_name = 'Old'")" "^Old=false$"
fi
check "A can insert own record" "$(as "$A" "insert into records (user_id, kind, id, data) values ('$A','session','s1','{\"id\":\"s1\"}'); select count(*) from records")" "^1$"
check "the server sets updated_at" "$(as "$A" "insert into records (user_id, kind, id, data, updated_at) values ('$A','session','s2','{}', '2000-01-01'); select extract(year from updated_at) from records where id='s2'")" "^20[2-9][0-9]$"
check "upsert keeps one row per item" "$(as "$A" "insert into records (user_id, kind, id, data, deleted) values ('$A','session','s2',null,true) $upsert; insert into records (user_id, kind, id, data) values ('$A','session','s2','{}') $upsert; select count(*) || ',' || bool_or(deleted) from records where id='s2'")" "^1,false$"
check "A cannot insert a row for B" "$(as "$A" "insert into records (user_id, kind, id, data) values ('$B','session','x','{}')")" "row-level security"
check "B cannot see A's rows" "$(as "$B" "select count(*) from records")" "^0$"
check "B cannot update A's rows" "$(as "$B" "update records set data='{\"hacked\":1}' where user_id='$A'"; $P -c "select count(*) from records where data ? 'hacked'")" "^0$"
check "B cannot delete A's rows" "$(as "$B" "delete from records where user_id='$A'"; $P -c "select count(*) from records where user_id='$A'")" "^2$"
check "A cannot give a row to B" "$(as "$A" "update records set user_id='$B' where id='s1'")" "row-level security"
check "signed-out visitors can't read records" "$(as anon "select count(*) from records")" "permission denied"
check "signed-out visitors can't read profiles" "$(as anon "select count(*) from profiles")" "permission denied"
check "B sees only own profile" "$(as "$B" "select count(*) from profiles")" "^1$"
check "unknown kinds are rejected" "$(as "$A" "insert into records (user_id, kind, id, data) values ('$A','password','p','{}')")" "check constraint"
check "a deletion carries no data" "$(as "$A" "insert into records (user_id, kind, id, data, deleted) values ('$A','session','t','{}', true)")" "deleted_has_no_data"
check "oversized records are rejected" "$(as "$A" "insert into records (user_id, kind, id, data) values ('$A','session','big', jsonb_build_object('x', repeat(md5(random()::text), 20000)))")" "record_size"
# ---------- Leaderboard ----------
C=$($P -c "insert into auth.users (email, raw_user_meta_data) values ('c@x.com', '{\"display_name\":\"Cam\",\"leaderboard\":true}') returning id")
E=$($P -c "insert into auth.users (email, raw_user_meta_data) values ('e@x.com', '{\"display_name\":\"e@x.com\",\"leaderboard\":true}') returning id")
day() { echo "insert into leaderboard_days (user_id, day, points) values ('$1', $2, $3) on conflict (user_id, day) do update set points = excluded.points"; }
lb() { as "$1" "select public.leaderboard('$2', current_date, 5)$3"; }
check "leaderboard is off unless chosen at sign-up" "$($P -c "select string_agg(display_name || '=' || leaderboard_visible, ',' order by display_name) from profiles where id in ('$B', '$C')")" "^Cam=true,Gym member=false$"
check "an email is never used as the display name" "$($P -c "select display_name from profiles where id = '$E'")" "^Gym member$"
check "a display name can't be changed to an email" "$(as "$C" "update profiles set display_name = 'cam@x.com' where id = '$C'")" "display_name_not_email"
check "C can publish own points" "$(as "$C" "$(day "$C" current_date 100); select points from leaderboard_days")" "^100$"
check "points above the daily cap are rejected" "$(as "$C" "$(day "$C" current_date 301)")" "check constraint"
check "zero points are rejected (delete the day instead)" "$(as "$C" "$(day "$C" current_date 0)")" "check constraint"
check "points for the future are rejected" "$(as "$C" "$(day "$C" "current_date + 5" 10)")" "future"
check "C cannot publish points for B" "$(as "$C" "$(day "$B" current_date 10)")" "row-level security"
as "$B" "$(day "$B" current_date 250)" >/dev/null # B is hidden
as "$E" "$(day "$E" current_date 40)" >/dev/null
as "$E" "$(day "$E" "current_date - 400" 60)" >/dev/null # long ago: all time only
check "nobody can read another user's points" "$(as "$C" "select count(*) from leaderboard_days where user_id <> '$C'")" "^0$"
check "signed-out visitors can't read points" "$(as anon "select count(*) from leaderboard_days")" "permission denied"
check "signed-out visitors can't see the leaderboard" "$(as anon "select public.leaderboard('week', current_date, 5)")" "permission denied"
check "hidden users are not on the board or counted" "$(lb "$C" week "->>'participants'")" "^2$"
check "the board is ranked by points, names only" "$(lb "$C" week "->'top'")" '^\[\{"me": true, "name": "Cam", "rank": 1, "points": 100\}, \{"me": false, "name": "Gym member", "rank": 2, "points": 40\}\]$'
check "the board never contains an email" "$(lb "$C" all "::text" | grep -c '@')" "^0$"
check "periods: all time includes older days" "$(lb "$E" all "->'me'->>'points'")" "^100$"
check "a hidden user sees the board but has no rank" "$(lb "$B" week "->'me'")" '^\{"rank": null, "points": 0, "visible": false, "previousRank": null\}$'
check "B can switch the leaderboard on" "$(as "$B" "update profiles set leaderboard_visible = true where id = '$B'; select leaderboard_visible from profiles")" "^t$"
check "now B leads" "$(lb "$C" week "->'top'->0->>'rank'")$(lb "$C" week "->'me'->>'rank'")" "^12$"
check "B cannot hide C" "$(as "$B" "update profiles set leaderboard_visible = false where id = '$C'"; $P -c "select leaderboard_visible from profiles where id = '$C'")" "^t$"
as "$E" "$(day "$E" current_date 100)" >/dev/null
check "ties share a rank" "$(lb "$C" week "->'top'")" '"rank": 2, "points": 100\}, \{"me": false, "name": "Gym member", "rank": 2'
many=""
for i in $(seq 1 12); do many="$many insert into auth.users (email, raw_user_meta_data) values ('m$i@x.com', '{\"display_name\":\"M$i\",\"leaderboard\":true}');"; done
$P -c "$many" >/dev/null
$P -c "insert into leaderboard_days (user_id, day, points) select id, current_date, 200 + row_number() over (order by email) from auth.users where email like 'm%'" >/dev/null
L=$($P -c "insert into auth.users (email, raw_user_meta_data) values ('l@x.com', '{\"display_name\":\"Lee\",\"leaderboard\":true}') returning id")
as "$L" "$(day "$L" current_date 10)" >/dev/null
# This week: B 250, M1..M12 201-212, Cam 100, E 100, Lee 10. E is 15th in the list, tied 14th.
check "your own row is always shown: top 5, then above / you / below" "$(lb "$E" week "->'top'->4->>'rank'")|$(lb "$E" week "->'around'")" '^5\|\[\{"me": false, "name": "Cam", "rank": 14, "points": 100\}, \{"me": true, "name": "Gym member", "rank": 14, "points": 100\}, \{"me": false, "name": "Lee", "rank": 16, "points": 10\}\]$'
check "the top 5 shows no extra rows when you're in it" "$(lb "$B" week "->'around'")" '^\[\]$'
week="date_trunc('week', current_date)::date"
as "$C" "$(day "$C" "$week - 3" 80)" >/dev/null
as "$E" "$(day "$E" "$week - 3" 60)" >/dev/null
rec() { as "$1" "select public.my_leaderboard_record(current_date)${2-}"; }
check "badges: best finish in a completed week" "$(rec "$C" "->>'bestWeeklyRank'")/$(rec "$C" "->'podiums'->>'first'")" "^1/1$"
check "badges: podium places are counted (E: 1st alone long ago, 2nd last week)" "$(rec "$E" "->'podiums'->>'first'")/$(rec "$E" "->'podiums'->>'second'")" "^1/1$"
check "badges: the week in progress doesn't count" "$(rec "$L" "->>'bestWeeklyRank'")" "^$"
as "$C" "$(day "$C" "current_date - 1" 300)" >/dev/null
# All time: C 100 + 300 yesterday, B 250, E 100 + 60, ...; at the end of yesterday: C 300, E 60.
check "previous rank is the rank at the end of yesterday" "$(lb "$C" all "->'me'->>'previousRank'")/$(lb "$E" all "->'me'->>'previousRank'")/$(lb "$L" all "->'me'->>'previousRank'")" "^1/2/$"
check "signed-out visitors can't read records of finishes" "$(as anon "select public.my_leaderboard_record(current_date)")" "permission denied"

check "signed-out visitors can't delete accounts" "$(as anon "select public.delete_my_account()")" "permission denied"
as "$A" "select public.delete_my_account()" >/dev/null
check "delete account removes A's login, profile and records only" "$($P -c "select (select count(*) from auth.users where id='$A') || ',' || (select count(*) from profiles where id='$A') || ',' || (select count(*) from records where user_id='$A') || ',' || (select count(*) from auth.users where id='$B')")" "^0,0,0,1$"
as "$C" "select public.delete_my_account()" >/dev/null
check "delete account removes leaderboard points too" "$($P -c "select count(*) from leaderboard_days where user_id = '$C'")|$(lb "$E" week "::text" | grep -c Cam)" "^0\|0$"

exit $failed
