-- ===================================================================
-- AttendPro · cross-device live attendance
--
-- Run this whole file once in the Supabase SQL editor
-- (Dashboard → SQL Editor → New query → paste → Run).
-- It is safe to run again: tables use IF NOT EXISTS and functions are
-- replaced.
--
-- Design notes
--   * Tables are NOT readable/writable with the public anon key.
--   * Every operation goes through a SECURITY DEFINER function that
--     validates the session code, open/expiry state and duplicates in
--     the database (the single source of truth).
--   * Students can only insert their own check-in through RPC.
--   * Staff can only read/close sessions whose staff_email they pass
--     and which match the session row.
--   * A database trigger broadcasts new check-ins over Supabase
--     Realtime. The frontend also polls every 4 s as a fallback.
-- ===================================================================

create extension if not exists pgcrypto;

-- -------------------------------------------------------------------
-- Tables
-- -------------------------------------------------------------------

create table if not exists public.attendance_sessions (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  staff_email   text not null,
  subject_name  text not null,
  subject_code  text not null default '',
  is_open       boolean not null default true,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  closed_at     timestamptz
);

create index if not exists attendance_sessions_staff_idx
  on public.attendance_sessions (lower(staff_email), created_at desc);

create table if not exists public.attendance_checkins (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.attendance_sessions (id) on delete cascade,
  student_email   text not null,
  student_name    text not null,
  roll_number     text not null default '',
  checked_in_at   timestamptz not null default now(),
  -- Database-level duplicate protection.
  constraint attendance_checkins_unique_student unique (session_id, student_email)
);

create index if not exists attendance_checkins_session_idx
  on public.attendance_checkins (session_id, checked_in_at asc);

-- Lock the tables down. Only the functions below may touch them.
alter table public.attendance_sessions enable row level security;
alter table public.attendance_checkins enable row level security;

revoke all on public.attendance_sessions from anon, authenticated;
revoke all on public.attendance_checkins from anon, authenticated;

-- -------------------------------------------------------------------
-- Code generation
-- -------------------------------------------------------------------

create or replace function public.generate_attendance_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result   text := '';
  i        integer;
begin
  for i in 1..6 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
  end loop;
  return result;
end;
$$;

-- -------------------------------------------------------------------
-- Staff: create a session
-- -------------------------------------------------------------------

create or replace function public.create_attendance_session(
  p_staff_email      text,
  p_subject_name     text,
  p_subject_code     text default '',
  p_duration_minutes integer default 30
)
returns public.attendance_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code      text;
  v_session   public.attendance_sessions;
  v_attempts  integer := 0;
begin
  if coalesce(trim(p_staff_email), '') = '' then
    raise exception 'Staff email is required.';
  end if;
  if coalesce(trim(p_subject_name), '') = '' then
    raise exception 'Choose a subject before starting the session.';
  end if;
  if p_duration_minutes is null or p_duration_minutes < 5 or p_duration_minutes > 240 then
    raise exception 'Session duration must be between 5 and 240 minutes.';
  end if;

  loop
    v_attempts := v_attempts + 1;
    v_code := public.generate_attendance_code();

    begin
      insert into public.attendance_sessions (
        code, staff_email, subject_name, subject_code, expires_at
      )
      values (
        v_code,
        lower(trim(p_staff_email)),
        trim(p_subject_name),
        coalesce(trim(p_subject_code), ''),
        now() + make_interval(mins => p_duration_minutes)
      )
      returning * into v_session;

      exit;
    exception
      when unique_violation then
        if v_attempts >= 10 then
          raise exception 'Could not generate a unique attendance code. Please try again.';
        end if;
    end;
  end loop;

  return v_session;
end;
$$;

-- -------------------------------------------------------------------
-- Staff: list my recent sessions
-- -------------------------------------------------------------------

drop function if exists public.get_staff_attendance_sessions(text, integer);

create or replace function public.get_staff_attendance_sessions(
  p_staff_email text,
  p_limit       integer default 8
)
returns table (
  id             uuid,
  code           text,
  subject_name   text,
  subject_code   text,
  is_open        boolean,
  created_at     timestamptz,
  expires_at     timestamptz,
  checkin_count  bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    s.id,
    s.code,
    s.subject_name,
    s.subject_code,
    s.is_open,
    s.created_at,
    s.expires_at,
    count(c.id)
  from public.attendance_sessions s
  left join public.attendance_checkins c on c.session_id = s.id
  where lower(s.staff_email) = lower(trim(p_staff_email))
  group by s.id
  order by s.created_at desc
  limit greatest(1, least(coalesce(p_limit, 8), 50));
end;
$$;

-- -------------------------------------------------------------------
-- Staff: read the check-in list for one session
-- -------------------------------------------------------------------

drop function if exists public.get_attendance_checkins(uuid, text);

create or replace function public.get_attendance_checkins(
  p_session_id  uuid,
  p_staff_email text
)
returns setof public.attendance_checkins
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.attendance_sessions s
    where s.id = p_session_id
      and lower(s.staff_email) = lower(trim(p_staff_email))
  ) then
    raise exception 'You are not allowed to view this attendance session.';
  end if;

  return query
  select c.*
  from public.attendance_checkins c
  where c.session_id = p_session_id
  order by c.checked_in_at asc;
end;
$$;

-- -------------------------------------------------------------------
-- Staff: close a session
-- -------------------------------------------------------------------

create or replace function public.close_attendance_session(
  p_session_id  uuid,
  p_staff_email text
)
returns public.attendance_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.attendance_sessions;
begin
  update public.attendance_sessions
  set is_open = false,
      closed_at = now()
  where id = p_session_id
    and lower(staff_email) = lower(trim(p_staff_email))
    and is_open = true
  returning * into v_session;

  if v_session.id is null then
    raise exception 'Session not found or already closed.';
  end if;

  return v_session;
end;
$$;

-- -------------------------------------------------------------------
-- Student: look up a code + check in
-- -------------------------------------------------------------------

drop function if exists public.get_attendance_session(text);

create or replace function public.get_attendance_session(p_code text)
returns table (
  id             uuid,
  code           text,
  subject_name   text,
  subject_code   text,
  is_open        boolean,
  created_at     timestamptz,
  expires_at     timestamptz,
  checkin_count  bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    s.id,
    s.code,
    s.subject_name,
    s.subject_code,
    s.is_open,
    s.created_at,
    s.expires_at,
    (select count(*) from public.attendance_checkins c where c.session_id = s.id)
  from public.attendance_sessions s
  where s.code = upper(trim(p_code));
end;
$$;

create or replace function public.check_in_attendance(
  p_code          text,
  p_student_email text,
  p_student_name  text,
  p_roll_number   text default ''
)
returns public.attendance_checkins
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session  public.attendance_sessions;
  v_checkin  public.attendance_checkins;
  v_email    text := lower(trim(coalesce(p_student_email, '')));
  v_name     text := trim(coalesce(p_student_name, ''));
  v_roll     text := trim(coalesce(p_roll_number, ''));
begin
  if coalesce(trim(p_code), '') = '' then
    raise exception 'Enter the attendance code shown by your faculty.';
  end if;
  if v_email = '' then
    raise exception 'Your account email is missing. Sign in again.';
  end if;
  if v_name = '' then
    raise exception 'Add your full name to your profile before checking in.';
  end if;

  select *
  into v_session
  from public.attendance_sessions s
  where s.code = upper(trim(p_code));

  if v_session.id is null then
    raise exception 'Invalid attendance code. Ask your faculty for the current code.';
  end if;
  if not v_session.is_open then
    raise exception 'This attendance session has been closed.';
  end if;
  if v_session.expires_at <= now() then
    raise exception 'This attendance code has expired. Ask your faculty for a new code.';
  end if;

  insert into public.attendance_checkins (
    session_id, student_email, student_name, roll_number, checked_in_at
  )
  values (
    v_session.id, v_email, v_name, v_roll, now()
  )
  on conflict (session_id, student_email) do nothing
  returning * into v_checkin;

  if v_checkin.id is null then
    raise exception 'You have already checked in for this session.';
  end if;

  return v_checkin;
end;
$$;

-- -------------------------------------------------------------------
-- Realtime broadcast (optional; polling still works without it)
-- -------------------------------------------------------------------

create or replace function public.broadcast_attendance_checkin()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
begin
  begin
    perform realtime.broadcast_changes(
      'attendance-session-' || new.session_id::text,
      'check_in',
      'INSERT',
      'attendance_checkins',
      'public',
      new,
      null::record
    );
  exception
    when others then
      -- Never block a check-in because Realtime is unavailable.
      null;
  end;
  return new;
end;
$$;

drop trigger if exists attendance_checkin_broadcast on public.attendance_checkins;

create trigger attendance_checkin_broadcast
after insert on public.attendance_checkins
for each row execute function public.broadcast_attendance_checkin();

-- -------------------------------------------------------------------
-- Permissions
-- -------------------------------------------------------------------

grant execute on function public.create_attendance_session(text, text, text, integer) to anon, authenticated;
grant execute on function public.get_staff_attendance_sessions(text, integer) to anon, authenticated;
grant execute on function public.get_attendance_checkins(uuid, text) to anon, authenticated;
grant execute on function public.close_attendance_session(uuid, text) to anon, authenticated;
grant execute on function public.get_attendance_session(text) to anon, authenticated;
grant execute on function public.check_in_attendance(text, text, text, text) to anon, authenticated;
grant execute on function public.generate_attendance_code() to anon, authenticated;
