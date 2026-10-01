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
$P -f "$here/schema.sql" 2>/dev/null
$P -f "$here/schema.sql" 2>/dev/null # must be safe to run again

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

check "profiles are created on sign-up" "$($P -c "select string_agg(display_name, ', ' order by display_name) from profiles")" "^Alex, Gym member$"
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
check "signed-out visitors can't delete accounts" "$(as anon "select public.delete_my_account()")" "permission denied"
as "$A" "select public.delete_my_account()" >/dev/null
check "delete account removes A's login, profile and records only" "$($P -c "select (select count(*) from auth.users where id='$A') || ',' || (select count(*) from profiles where id='$A') || ',' || (select count(*) from records where user_id='$A') || ',' || (select count(*) from auth.users where id='$B')")" "^0,0,0,1$"

exit $failed
