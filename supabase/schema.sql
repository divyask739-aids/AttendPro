-- ===================================================================
-- AttendPro · cross-device live attendance
--
-- Apply this bootstrap file before the versioned Auth/security migrations.
-- Do not rerun it after the hardening migration: it replaces secure RPC
-- wrappers with bootstrap definitions and revokes their execution grants.
--
-- Security note
--   * This is the attendance bootstrap schema, not the authorization upgrade.
--   * RPC execution is revoked below. Apply the ordered Supabase Auth
--     migrations before enabling the application.
--   * The hardening migration restores only the authenticated, role-scoped RPCs.
--   * Realtime broadcasts and frontend polling remain optional refresh paths.
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

-- -------------------------------------------------------------------
-- Shared attendance (the existing Subject + AttendanceRecord model)
--
-- attendance_subjects is the canonical enrollment list: one row per
-- student + subject. A valid live class code enrolls the student in
-- exactly the subject named by that session, so joining by code makes
-- the student visible on the staff roster immediately.
-- -------------------------------------------------------------------

create table if not exists public.attendance_subjects (
  id              text primary key,
  student_email   text not null,
  student_name    text not null default '',
  student_id      text not null default '',
  student_course  text not null default '',
  student_year    text not null default '',
  name            text not null,
  code            text not null default '',
  faculty         text not null default '',
  subject_key     text not null,
  name_key        text not null,
  held            integer not null default 0 check (held >= 0),
  attended        integer not null default 0 check (attended >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint attendance_subjects_enrollment_unique unique (student_email, subject_key)
);

create index if not exists attendance_subjects_lookup_idx
  on public.attendance_subjects (name_key, student_email);

create index if not exists attendance_subjects_student_idx
  on public.attendance_subjects (lower(student_email));

create table if not exists public.attendance_records (
  id            text primary key,
  student_email text not null,
  subject_id    text not null references public.attendance_subjects (id) on delete cascade,
  subject_key   text not null,
  date          date not null,
  status        text not null check (status in ('present', 'absent', 'late', 'cancelled')),
  source        text not null default 'manual' check (source in ('manual', 'live')),
  session_id    uuid references public.attendance_sessions (id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists attendance_records_student_idx
  on public.attendance_records (lower(student_email), date desc);

create index if not exists attendance_records_subject_idx
  on public.attendance_records (subject_id, date desc);

-- A student can only ever have one attendance row for a live session.
create unique index if not exists attendance_records_session_student_unique
  on public.attendance_records (session_id, student_email)
  where session_id is not null;

-- Staff profile subjects, mirrored so the roster can be scoped by what a
-- staff member actually teaches instead of trusting client-side filters.
create table if not exists public.attendance_staff_subjects (
  id            uuid primary key default gen_random_uuid(),
  staff_email   text not null,
  name          text not null,
  code          text not null default '',
  semester      text not null default '',
  subject_key   text not null,
  name_key      text not null,
  created_at    timestamptz not null default now(),
  constraint attendance_staff_subjects_unique unique (staff_email, subject_key)
);

create index if not exists attendance_staff_subjects_email_idx
  on public.attendance_staff_subjects (lower(staff_email));

-- Lock the tables down. Only the functions below may touch them.
alter table public.attendance_sessions enable row level security;
alter table public.attendance_checkins enable row level security;
alter table public.attendance_subjects enable row level security;
alter table public.attendance_records enable row level security;
alter table public.attendance_staff_subjects enable row level security;

revoke all on public.attendance_sessions from anon, authenticated;
revoke all on public.attendance_checkins from anon, authenticated;
revoke all on public.attendance_subjects from anon, authenticated;
revoke all on public.attendance_records from anon, authenticated;
revoke all on public.attendance_staff_subjects from anon, authenticated;

-- -------------------------------------------------------------------
-- Subject identity helpers (same normalization as src/lib/subjectKey.ts)
-- -------------------------------------------------------------------

create or replace function public.normalize_subject(p_value text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(coalesce(p_value, ''), '[^a-zA-Z0-9]+', '', 'g'));
$$;

create or replace function public.attendance_subject_key(p_name text, p_code text)
returns text
language sql
immutable
as $$
  select case
    when public.normalize_subject(p_code) = '' then public.normalize_subject(p_name)
    else public.normalize_subject(p_code) || ':' || public.normalize_subject(p_name)
  end;
$$;

revoke all on function public.normalize_subject(text) from public, anon, authenticated;
revoke all on function public.attendance_subject_key(text, text) from public, anon, authenticated;

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

  -- Mirror the class into the staff's roster scope immediately. A student who
  -- joins with this code must be visible even if the profile sync has not run
  -- yet or this device's local profile is out of date.
  insert into public.attendance_staff_subjects (
    staff_email, name, code, semester, subject_key, name_key
  )
  values (
    lower(trim(p_staff_email)),
    trim(p_subject_name),
    coalesce(trim(p_subject_code), ''),
    '',
    public.attendance_subject_key(p_subject_name, p_subject_code),
    public.normalize_subject(p_subject_name)
  )
  on conflict (staff_email, subject_key) do update
    set name = excluded.name,
        code = excluded.code,
        name_key = excluded.name_key;

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
-- Staff: mirror taught subjects, then read scoped attendance
-- -------------------------------------------------------------------

create or replace function public.sync_staff_attendance_subjects(
  p_staff_email text,
  p_subjects    jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_staff_email, '')));
begin
  if v_email = '' then
    raise exception 'Staff email is required.';
  end if;

  delete from public.attendance_staff_subjects
  where lower(staff_email) = v_email;

  insert into public.attendance_staff_subjects (
    staff_email, name, code, semester, subject_key, name_key
  )
  select
    v_email,
    trim(x.name),
    coalesce(trim(x.code), ''),
    coalesce(trim(x.semester), ''),
    public.attendance_subject_key(x.name, x.code),
    public.normalize_subject(x.name)
  from jsonb_to_recordset(coalesce(p_subjects, '[]'::jsonb))
    as x(name text, code text, semester text)
  where trim(coalesce(x.name, '')) <> ''
  on conflict (staff_email, subject_key) do nothing;
end;
$$;

-- Lets a staff member restore taught subjects on a new device. Without this a
-- fresh browser has an empty local profile and would overwrite the shared list.
drop function if exists public.get_staff_attendance_subjects(text);

create or replace function public.get_staff_attendance_subjects(p_staff_email text)
returns table (
  name     text,
  code     text,
  semester text
)
language sql
security definer
set search_path = public
as $$
  select s.name, s.code, s.semester
  from public.attendance_staff_subjects s
  where lower(s.staff_email) = lower(trim(coalesce(p_staff_email, '')))
  order by s.name asc;
$$;

drop function if exists public.get_staff_attendance(text);

create or replace function public.get_staff_attendance(p_staff_email text)
returns table (
  student_email   text,
  student_name    text,
  student_id      text,
  student_course  text,
  student_year    text,
  subject_id      text,
  subject_name    text,
  subject_code    text,
  attended        integer,
  held            integer,
  subject_key     text,
  updated_at      timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    s.student_email,
    s.student_name,
    s.student_id,
    s.student_course,
    s.student_year,
    s.id,
    s.name,
    s.code,
    s.attended,
    s.held,
    s.subject_key,
    s.updated_at
  from public.attendance_subjects s
  where exists (
    select 1
    from public.attendance_staff_subjects t
    where lower(t.staff_email) = lower(trim(p_staff_email))
      and (
        t.subject_key = s.subject_key
        or t.name_key = s.name_key
      )
  )
  order by s.student_name asc, s.name asc;
end;
$$;

-- -------------------------------------------------------------------
-- Student: shared subjects + attendance records (existing model)
-- -------------------------------------------------------------------

create or replace function public.import_student_attendance(
  p_student_email  text,
  p_student_name   text default '',
  p_student_id     text default '',
  p_student_course text default '',
  p_student_year   text default '',
  p_subjects       jsonb default '[]'::jsonb,
  p_records        jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email   text := lower(trim(coalesce(p_student_email, '')));
  v_exists  boolean;
begin
  if v_email = '' then
    raise exception 'Student email is required.';
  end if;

  -- One-time migration from this device's localStorage. Once the student
  -- has shared data, never overwrite live/manual counters from a stale cache.
  select exists (
    select 1 from public.attendance_subjects where lower(student_email) = v_email
  ) into v_exists;
  if v_exists then
    return;
  end if;

  insert into public.attendance_subjects (
    id, student_email, student_name, student_id, student_course, student_year,
    name, code, faculty, subject_key, name_key, held, attended
  )
  select
    x.id,
    v_email,
    coalesce(trim(p_student_name), ''),
    coalesce(trim(p_student_id), ''),
    coalesce(trim(p_student_course), ''),
    coalesce(trim(p_student_year), ''),
    trim(x.name),
    coalesce(trim(x.code), ''),
    coalesce(trim(x.faculty), ''),
    public.attendance_subject_key(x.name, x.code),
    public.normalize_subject(x.name),
    greatest(coalesce(x.held, 0), 0),
    least(greatest(coalesce(x.attended, 0), 0), greatest(coalesce(x.held, 0), 0))
  from jsonb_to_recordset(coalesce(p_subjects, '[]'::jsonb))
    as x(id text, name text, code text, faculty text, held integer, attended integer)
  where coalesce(trim(x.id), '') <> ''
    and trim(coalesce(x.name, '')) <> ''
  on conflict (student_email, subject_key) do nothing;

  insert into public.attendance_records (
    id, student_email, subject_id, subject_key, date, status, source
  )
  select
    x.id,
    v_email,
    x.subject_id,
    s.subject_key,
    x.record_date::date,
    x.status,
    'manual'
  from jsonb_to_recordset(coalesce(p_records, '[]'::jsonb))
    as x(id text, subject_id text, record_date text, status text)
  join public.attendance_subjects s
    on s.id = x.subject_id
   and lower(s.student_email) = v_email
  where coalesce(trim(x.id), '') <> ''
    and coalesce(x.record_date, '') ~ '^\d{4}-\d{2}-\d{2}$'
    and x.status in ('present', 'absent', 'late', 'cancelled')
  on conflict (id) do nothing;
end;
$$;

create or replace function public.update_attendance_identity(
  p_student_email  text,
  p_student_name   text default '',
  p_student_id     text default '',
  p_student_course text default '',
  p_student_year   text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.attendance_subjects
  set student_name = coalesce(trim(p_student_name), ''),
      student_id = coalesce(trim(p_student_id), ''),
      student_course = coalesce(trim(p_student_course), ''),
      student_year = coalesce(trim(p_student_year), ''),
      updated_at = now()
  where lower(student_email) = lower(trim(p_student_email));
end;
$$;

create or replace function public.create_attendance_subject(
  p_student_email  text,
  p_subject        jsonb,
  p_student_name   text default '',
  p_student_id     text default '',
  p_student_course text default '',
  p_student_year   text default ''
)
returns public.attendance_subjects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email   text := lower(trim(coalesce(p_student_email, '')));
  v_subject public.attendance_subjects;
begin
  if v_email = '' then
    raise exception 'Student email is required.';
  end if;
  if coalesce(trim(p_subject->>'id'), '') = ''
     or coalesce(trim(p_subject->>'name'), '') = '' then
    raise exception 'Subject id and name are required.';
  end if;

  insert into public.attendance_subjects (
    id, student_email, student_name, student_id, student_course, student_year,
    name, code, faculty, subject_key, name_key, held, attended
  )
  values (
    p_subject->>'id',
    v_email,
    coalesce(trim(p_student_name), ''),
    coalesce(trim(p_student_id), ''),
    coalesce(trim(p_student_course), ''),
    coalesce(trim(p_student_year), ''),
    trim(p_subject->>'name'),
    coalesce(trim(p_subject->>'code'), ''),
    coalesce(trim(p_subject->>'faculty'), ''),
    public.attendance_subject_key(p_subject->>'name', p_subject->>'code'),
    public.normalize_subject(p_subject->>'name'),
    0,
    0
  )
  on conflict (student_email, subject_key) do update
    set name = excluded.name,
        code = excluded.code,
        faculty = excluded.faculty,
        student_name = excluded.student_name,
        student_id = excluded.student_id,
        student_course = excluded.student_course,
        student_year = excluded.student_year,
        updated_at = now()
  returning * into v_subject;

  return v_subject;
end;
$$;

create or replace function public.update_attendance_subject(
  p_student_email text,
  p_subject       jsonb
)
returns public.attendance_subjects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject public.attendance_subjects;
begin
  update public.attendance_subjects
  set name = trim(p_subject->>'name'),
      code = coalesce(trim(p_subject->>'code'), ''),
      faculty = coalesce(trim(p_subject->>'faculty'), ''),
      subject_key = public.attendance_subject_key(p_subject->>'name', p_subject->>'code'),
      name_key = public.normalize_subject(p_subject->>'name'),
      updated_at = now()
  where id = p_subject->>'id'
    and lower(student_email) = lower(trim(p_student_email))
  returning * into v_subject;

  if v_subject.id is null then
    raise exception 'Subject not found for this student.';
  end if;

  return v_subject;
end;
$$;

create or replace function public.delete_attendance_subject(
  p_student_email text,
  p_subject_id    text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.attendance_subjects
  where id = p_subject_id
    and lower(student_email) = lower(trim(p_student_email));
end;
$$;

create or replace function public.log_attendance_class(
  p_student_email text,
  p_subject_id    text,
  p_status        text,
  p_date          date,
  p_record_id     text
)
returns public.attendance_subjects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject  public.attendance_subjects;
  v_record   public.attendance_records;
  v_counts   boolean;
begin
  if p_status not in ('present', 'absent', 'late', 'cancelled') then
    raise exception 'Invalid attendance status.';
  end if;
  if p_date is null then
    raise exception 'Attendance date is required.';
  end if;

  select *
  into v_subject
  from public.attendance_subjects
  where id = p_subject_id
    and lower(student_email) = lower(trim(p_student_email))
  for update;

  if v_subject.id is null then
    raise exception 'Subject not found for this student.';
  end if;

  insert into public.attendance_records (
    id, student_email, subject_id, subject_key, date, status, source
  )
  values (
    p_record_id,
    lower(trim(p_student_email)),
    v_subject.id,
    v_subject.subject_key,
    p_date,
    p_status,
    'manual'
  )
  on conflict (id) do nothing
  returning * into v_record;

  if v_record.id is null then
    -- Retried request: return the current counters without incrementing twice.
    return v_subject;
  end if;

  v_counts := p_status <> 'cancelled';

  update public.attendance_subjects
  set held = held + case when v_counts then 1 else 0 end,
      attended = attended + case when p_status in ('present', 'late') then 1 else 0 end,
      updated_at = now()
  where id = v_subject.id
  returning * into v_subject;

  return v_subject;
end;
$$;

create or replace function public.set_attendance_counters(
  p_student_email text,
  p_subject_id    text,
  p_held          integer,
  p_attended      integer
)
returns public.attendance_subjects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject public.attendance_subjects;
begin
  update public.attendance_subjects
  set held = greatest(coalesce(p_held, 0), 0),
      attended = least(
        greatest(coalesce(p_attended, 0), 0),
        greatest(coalesce(p_held, 0), 0)
      ),
      updated_at = now()
  where id = p_subject_id
    and lower(student_email) = lower(trim(p_student_email))
  returning * into v_subject;

  if v_subject.id is null then
    raise exception 'Subject not found for this student.';
  end if;

  return v_subject;
end;
$$;

create or replace function public.get_student_attendance_subjects(p_student_email text)
returns setof public.attendance_subjects
language sql
security definer
set search_path = public
as $$
  select *
  from public.attendance_subjects
  where lower(student_email) = lower(trim(p_student_email))
  order by created_at desc;
$$;

create or replace function public.get_student_attendance_records(p_student_email text)
returns setof public.attendance_records
language sql
security definer
set search_path = public
as $$
  select *
  from public.attendance_records
  where lower(student_email) = lower(trim(p_student_email))
  order by date desc, created_at desc;
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
  v_subject  public.attendance_subjects;
  v_record   public.attendance_records;
  v_email    text := lower(trim(coalesce(p_student_email, '')));
  v_name     text := trim(coalesce(p_student_name, ''));
  v_roll     text := trim(coalesce(p_roll_number, ''));
  v_name_key text;
  v_full_key text;
  v_course   text;
  v_year     text;
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

  if exists (
    select 1
    from public.attendance_checkins c
    where c.session_id = v_session.id
      and c.student_email = v_email
  ) then
    raise exception 'You have already checked in for this session.';
  end if;

  -- Resolve the student's enrollment for this class. A valid class code is the
  -- authorization to join, so the first successful check-in enrolls the student
  -- in exactly the subject named by the staff's session.
  v_name_key := public.normalize_subject(v_session.subject_name);
  v_full_key := public.attendance_subject_key(
    v_session.subject_name,
    v_session.subject_code
  );

  select *
  into v_subject
  from public.attendance_subjects s
  where lower(s.student_email) = v_email
    and (s.subject_key = v_full_key or s.name_key = v_name_key)
  order by (s.subject_key = v_full_key) desc, s.updated_at desc
  limit 1;

  if v_subject.id is null then
    -- Reuse this student's existing course/year when they have other subjects.
    select s.student_course, s.student_year
    into v_course, v_year
    from public.attendance_subjects s
    where lower(s.student_email) = v_email
    order by s.updated_at desc
    limit 1;

    insert into public.attendance_subjects (
      id, student_email, student_name, student_id, student_course, student_year,
      name, code, faculty, subject_key, name_key, held, attended
    )
    values (
      'sub-' || gen_random_uuid()::text,
      v_email,
      v_name,
      v_roll,
      coalesce(v_course, ''),
      coalesce(v_year, ''),
      v_session.subject_name,
      coalesce(v_session.subject_code, ''),
      '',
      v_full_key,
      v_name_key,
      0,
      0
    )
    on conflict (student_email, subject_key) do update
      set student_name = case
            when public.attendance_subjects.student_name = '' then excluded.student_name
            else public.attendance_subjects.student_name
          end,
          student_id = case
            when public.attendance_subjects.student_id = '' then excluded.student_id
            else public.attendance_subjects.student_id
          end,
          updated_at = now()
    returning * into v_subject;
  end if;

  if v_roll = '' then
    v_roll := v_subject.student_id;
  end if;

  -- Fill in the roster identity if this device had not saved it yet.
  update public.attendance_subjects
  set student_name = case when student_name = '' then v_name else student_name end,
      student_id = case when student_id = '' then v_roll else student_id end,
      updated_at = now()
  where id = v_subject.id;

  -- Write the existing attendance model: one record per live session.
  insert into public.attendance_records (
    id, student_email, subject_id, subject_key, date, status, source, session_id
  )
  values (
    'live-' || gen_random_uuid()::text,
    v_email,
    v_subject.id,
    v_subject.subject_key,
    (v_session.created_at at time zone 'utc')::date,
    'present',
    'live',
    v_session.id
  )
  on conflict do nothing
  returning * into v_record;

  if v_record.id is null then
    raise exception 'You have already checked in for this session.';
  end if;

  -- Keep the subject counters used by the Dashboard/Attendance pages.
  update public.attendance_subjects
  set held = held + 1,
      attended = attended + 1,
      updated_at = now()
  where id = v_subject.id;

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
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object('session_id', new.session_id),
    'check_in',
    'attendance-session-' || new.session_id::text,
    false
  );
  perform realtime.send(
    jsonb_build_object('session_id', new.session_id),
    'check_in',
    'attendance-updates',
    false
  );

  return new;
end;
$$;
revoke all on function public.broadcast_attendance_checkin()
  from public, anon, authenticated;

drop trigger if exists attendance_checkin_broadcast on public.attendance_checkins;

create trigger attendance_checkin_broadcast
after insert on public.attendance_checkins
for each row execute function public.broadcast_attendance_checkin();

-- -------------------------------------------------------------------
-- Permissions
-- -------------------------------------------------------------------

revoke all on function public.create_attendance_session(text, text, text, integer) from public, anon, authenticated;
revoke all on function public.get_staff_attendance_sessions(text, integer) from public, anon, authenticated;
revoke all on function public.get_attendance_checkins(uuid, text) from public, anon, authenticated;
revoke all on function public.close_attendance_session(uuid, text) from public, anon, authenticated;
revoke all on function public.get_attendance_session(text) from public, anon, authenticated;
revoke all on function public.check_in_attendance(text, text, text, text) from public, anon, authenticated;
revoke all on function public.generate_attendance_code() from public, anon, authenticated;
revoke all on function public.normalize_subject(text) from public, anon, authenticated;
revoke all on function public.attendance_subject_key(text, text) from public, anon, authenticated;
revoke all on function public.sync_staff_attendance_subjects(text, jsonb) from public, anon, authenticated;
revoke all on function public.get_staff_attendance_subjects(text) from public, anon, authenticated;
revoke all on function public.get_staff_attendance(text) from public, anon, authenticated;
revoke all on function public.import_student_attendance(text, text, text, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.update_attendance_identity(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.create_attendance_subject(text, jsonb, text, text, text, text) from public, anon, authenticated;
revoke all on function public.update_attendance_subject(text, jsonb) from public, anon, authenticated;
revoke all on function public.delete_attendance_subject(text, text) from public, anon, authenticated;
revoke all on function public.log_attendance_class(text, text, text, date, text) from public, anon, authenticated;
revoke all on function public.set_attendance_counters(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.get_student_attendance_subjects(text) from public, anon, authenticated;
revoke all on function public.get_student_attendance_records(text) from public, anon, authenticated;
