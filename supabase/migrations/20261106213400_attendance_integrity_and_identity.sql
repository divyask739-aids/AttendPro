-- Finalize shared attendance ownership, staff provisioning and provenance.
-- Apply after the Auth profile and attendance security migrations.
-- This preserves the email columns and all existing rows for recovery.

begin;

alter table public.attendance_subjects
  add column if not exists student_user_id uuid references auth.users (id) on delete set null,
  add column if not exists legacy_student_email text;
alter table public.attendance_records
  add column if not exists student_user_id uuid references auth.users (id) on delete set null,
  add column if not exists legacy_student_email text;
alter table public.attendance_checkins
  add column if not exists student_user_id uuid references auth.users (id) on delete set null,
  add column if not exists legacy_student_email text;
alter table public.attendance_sessions
  add column if not exists staff_user_id uuid references auth.users (id) on delete set null,
  add column if not exists legacy_staff_email text;

alter table public.attendance_records
  drop constraint if exists attendance_records_source_check;
alter table public.attendance_records
  add constraint attendance_records_source_check
  check (source in ('manual', 'live', 'personal', 'legacy_import', 'staff_confirmed'));

alter table public.attendance_sessions
  add column if not exists checkin_limit integer not null default 100;
alter table public.attendance_sessions
  drop constraint if exists attendance_sessions_checkin_limit_check;
alter table public.attendance_sessions
  add constraint attendance_sessions_checkin_limit_check
  check (checkin_limit between 1 and 500);

-- A reportable, recoverable ledger: an email is linked only when exactly one
-- confirmed Auth identity uses it. No original email-keyed rows are removed.
create table public.attendpro_legacy_identity_review (
  email text primary key,
  mapping_status text not null check (mapping_status in ('matched', 'missing', 'ambiguous')),
  matched_user_id uuid references auth.users (id) on delete set null,
  candidate_count integer not null,
  candidate_user_ids uuid[] not null default '{}',
  reviewed_at timestamptz not null default now(),
  constraint attendpro_legacy_identity_review_consistent check (
    candidate_count = cardinality(candidate_user_ids)
    and (
      (mapping_status = 'matched' and candidate_count = 1 and matched_user_id is not null)
      or (mapping_status = 'missing' and candidate_count = 0 and matched_user_id is null)
      or (mapping_status = 'ambiguous' and candidate_count > 1 and matched_user_id is null)
    )
  )
);
alter table public.attendpro_legacy_identity_review enable row level security;
revoke all on public.attendpro_legacy_identity_review from public, anon, authenticated;

insert into public.attendpro_legacy_identity_review (
  email, mapping_status, matched_user_id, candidate_count, candidate_user_ids
)
with legacy_emails as (
  select lower(trim(student_email)) as email from public.attendance_subjects
  union
  select lower(trim(student_email)) from public.attendance_records
  union
  select lower(trim(student_email)) from public.attendance_checkins
  union
  select lower(trim(staff_email)) from public.attendance_sessions
  union
  select lower(trim(staff_email)) from public.attendance_staff_subjects
),
confirmed_users as (
  select lower(trim(auth_user.email)) as email, auth_user.id
  from auth.users as auth_user
  where auth_user.email is not null and auth_user.email_confirmed_at is not null
),
candidate_groups as (
  select email, array_agg(id order by id) as ids, count(*)::integer as candidates
  from confirmed_users
  group by email
)
select
  legacy.email,
  case
    when coalesce(candidates.candidates, 0) = 0 then 'missing'
    when candidates.candidates = 1 then 'matched'
    else 'ambiguous'
  end,
  case when candidates.candidates = 1 then candidates.ids[1] else null end,
  coalesce(candidates.candidates, 0),
  coalesce(candidates.ids, '{}'::uuid[])
from legacy_emails as legacy
left join candidate_groups as candidates on candidates.email = legacy.email
where legacy.email <> ''
on conflict (email) do nothing;

update public.attendance_subjects as subject
set student_user_id = review.matched_user_id
from public.attendpro_legacy_identity_review as review
where review.mapping_status = 'matched'
  and lower(trim(subject.student_email)) = review.email
  and subject.student_user_id is null;

update public.attendance_records as record
set student_user_id = review.matched_user_id
from public.attendpro_legacy_identity_review as review
where review.mapping_status = 'matched'
  and lower(trim(record.student_email)) = review.email
  and record.student_user_id is null;

update public.attendance_checkins as checkin
set student_user_id = review.matched_user_id
from public.attendpro_legacy_identity_review as review
where review.mapping_status = 'matched'
  and lower(trim(checkin.student_email)) = review.email
  and checkin.student_user_id is null;

update public.attendance_sessions as session
set staff_user_id = review.matched_user_id
from public.attendpro_legacy_identity_review as review
where review.mapping_status = 'matched'
  and lower(trim(session.staff_email)) = review.email
  and session.staff_user_id is null;

create unique index if not exists attendpro_legacy_identity_user_unique
  on public.attendpro_legacy_identity_review (matched_user_id)
  where matched_user_id is not null;

create table public.attendpro_duplicate_attendance_review (
  table_name text not null check (table_name in ('attendance_records', 'attendance_checkins')),
  session_id uuid not null,
  student_user_id uuid not null references auth.users (id),
  row_ids text[] not null,
  detected_at timestamptz not null default now(),
  primary key (table_name, session_id, student_user_id)
);
alter table public.attendpro_duplicate_attendance_review enable row level security;
revoke all on public.attendpro_duplicate_attendance_review from public, anon, authenticated;

insert into public.attendpro_duplicate_attendance_review (
  table_name, session_id, student_user_id, row_ids
)
select 'attendance_records', record.session_id, record.student_user_id,
  array_agg(record.id order by record.id)
from public.attendance_records as record
where record.session_id is not null and record.student_user_id is not null
group by record.session_id, record.student_user_id
having count(*) > 1
on conflict (table_name, session_id, student_user_id) do nothing;

insert into public.attendpro_duplicate_attendance_review (
  table_name, session_id, student_user_id, row_ids
)
select 'attendance_checkins', checkin.session_id, checkin.student_user_id,
  array_agg(checkin.id::text order by checkin.id)
from public.attendance_checkins as checkin
where checkin.student_user_id is not null
group by checkin.session_id, checkin.student_user_id
having count(*) > 1
on conflict (table_name, session_id, student_user_id) do nothing;

do $$
begin
  if not exists (
    select 1 from public.attendpro_duplicate_attendance_review
    where table_name = 'attendance_records'
  ) then
    create unique index if not exists attendance_records_session_user_unique
      on public.attendance_records (session_id, student_user_id)
      where session_id is not null and student_user_id is not null;
  end if;
  if not exists (
    select 1 from public.attendpro_duplicate_attendance_review
    where table_name = 'attendance_checkins'
  ) then
    create unique index if not exists attendance_checkins_session_user_unique
      on public.attendance_checkins (session_id, student_user_id)
      where student_user_id is not null;
  end if;
end;
$$;

create table public.attendpro_duplicate_enrollment_review (
  student_user_id uuid not null references auth.users (id),
  subject_key text not null,
  subject_ids text[] not null,
  legacy_emails text[] not null,
  detected_at timestamptz not null default now(),
  primary key (student_user_id, subject_key)
);
alter table public.attendpro_duplicate_enrollment_review enable row level security;
revoke all on public.attendpro_duplicate_enrollment_review from public, anon, authenticated;

insert into public.attendpro_duplicate_enrollment_review (
  student_user_id, subject_key, subject_ids, legacy_emails
)
select subject.student_user_id, subject.subject_key,
  array_agg(subject.id order by subject.id),
  array_agg(distinct subject.student_email order by subject.student_email)
from public.attendance_subjects as subject
where subject.student_user_id is not null
group by subject.student_user_id, subject.subject_key
having count(*) > 1
on conflict (student_user_id, subject_key) do nothing;

update public.attendance_subjects as subject
set legacy_student_email = subject.student_email
where subject.student_user_id is not null and subject.legacy_student_email is null;
update public.attendance_records as record
set legacy_student_email = record.student_email
where record.student_user_id is not null and record.legacy_student_email is null;
update public.attendance_checkins as checkin
set legacy_student_email = checkin.student_email
where checkin.student_user_id is not null and checkin.legacy_student_email is null;
update public.attendance_sessions as session
set legacy_staff_email = session.staff_email
where session.staff_user_id is not null and session.legacy_staff_email is null;

update public.attendance_subjects as subject
set student_email = lower(trim(auth_user.email))
from auth.users as auth_user
where auth_user.id = subject.student_user_id
  and subject.student_user_id is not null
  and not exists (
    select 1 from public.attendpro_duplicate_enrollment_review as duplicate
    where duplicate.student_user_id = subject.student_user_id
      and duplicate.subject_key = subject.subject_key
  );

update public.attendance_records as record
set student_email = lower(trim(auth_user.email))
from auth.users as auth_user
where auth_user.id = record.student_user_id
  and record.student_user_id is not null
  and not exists (
    select 1 from public.attendpro_duplicate_attendance_review as duplicate
    where duplicate.table_name = 'attendance_records'
      and duplicate.session_id = record.session_id
      and duplicate.student_user_id = record.student_user_id
  );

update public.attendance_checkins as checkin
set student_email = lower(trim(auth_user.email))
from auth.users as auth_user
where auth_user.id = checkin.student_user_id
  and checkin.student_user_id is not null
  and not exists (
    select 1 from public.attendpro_duplicate_attendance_review as duplicate
    where duplicate.table_name = 'attendance_checkins'
      and duplicate.session_id = checkin.session_id
      and duplicate.student_user_id = checkin.student_user_id
  );

update public.attendance_sessions as session
set staff_email = lower(trim(auth_user.email))
from auth.users as auth_user
where auth_user.id = session.staff_user_id
  and session.staff_user_id is not null;

do $$
begin
  if not exists (select 1 from public.attendpro_duplicate_enrollment_review) then
    create unique index if not exists attendance_subjects_student_user_subject_unique
      on public.attendance_subjects (student_user_id, subject_key)
      where student_user_id is not null;
  end if;
end;
$$;

-- Platform administrators are bootstrapped by an owner through the Supabase
-- SQL Editor. Neither staff nor student clients can grant themselves access.
create table public.attendpro_platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.attendpro_platform_admins enable row level security;
revoke all on public.attendpro_platform_admins from public, anon, authenticated;

create table public.attendpro_staff_subject_assignments (
  staff_user_id uuid not null references auth.users (id) on delete cascade,
  subject_key text not null,
  subject_name text not null,
  subject_code text not null default '',
  semester text not null default '',
  active boolean not null default true,
  assigned_by uuid not null references auth.users (id),
  assigned_at timestamptz not null default now(),
  primary key (staff_user_id, subject_key)
);
alter table public.attendpro_staff_subject_assignments enable row level security;
revoke all on public.attendpro_staff_subject_assignments from public, anon, authenticated;

create function public.attendpro_resolve_verified_user(p_email text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_user_id uuid;
begin
  select count(*)::integer, (array_agg(auth_user.id order by auth_user.id))[1]
  into v_count, v_user_id
  from auth.users as auth_user
  where auth_user.email_confirmed_at is not null
    and lower(trim(auth_user.email)) = lower(trim(coalesce(p_email, '')));

  if v_count > 1 then
    raise exception 'This email maps to multiple verified Auth accounts; administrator review is required.';
  end if;
  return v_user_id;
end;
$$;
revoke all on function public.attendpro_resolve_verified_user(text)
  from public, anon, authenticated;

create function public.attendpro_attach_verified_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_identity uuid;
begin
  if tg_table_name = 'attendance_sessions' then
    v_identity := public.attendpro_resolve_verified_user(new.staff_email);
    if new.staff_user_id is not null and v_identity is not null
       and new.staff_user_id <> v_identity then
      raise exception 'Staff identity does not match the verified email.';
    end if;
    new.staff_user_id := coalesce(v_identity, new.staff_user_id);
  else
    v_identity := public.attendpro_resolve_verified_user(new.student_email);
    if new.student_user_id is not null and v_identity is not null
       and new.student_user_id <> v_identity then
      raise exception 'Student identity does not match the verified email.';
    end if;
    new.student_user_id := coalesce(v_identity, new.student_user_id);
  end if;
  return new;
end;
$$;
revoke all on function public.attendpro_attach_verified_identity()
  from public, anon, authenticated;

drop trigger if exists attendance_subjects_attach_identity on public.attendance_subjects;
create trigger attendance_subjects_attach_identity
before insert or update of student_email, student_user_id
on public.attendance_subjects
for each row execute function public.attendpro_attach_verified_identity();

drop trigger if exists attendance_records_attach_identity on public.attendance_records;
create trigger attendance_records_attach_identity
before insert or update of student_email, student_user_id
on public.attendance_records
for each row execute function public.attendpro_attach_verified_identity();

drop trigger if exists attendance_checkins_attach_identity on public.attendance_checkins;
create trigger attendance_checkins_attach_identity
before insert or update of student_email, student_user_id
on public.attendance_checkins
for each row execute function public.attendpro_attach_verified_identity();

drop trigger if exists attendance_sessions_attach_identity on public.attendance_sessions;
create trigger attendance_sessions_attach_identity
before insert or update of staff_email, staff_user_id
on public.attendance_sessions
for each row execute function public.attendpro_attach_verified_identity();

create table public.attendpro_student_enrollments (
  student_user_id uuid not null references auth.users (id) on delete cascade,
  subject_key text not null,
  status text not null default 'pending' check (status in ('pending', 'approved')),
  requested_at timestamptz not null default now(),
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  primary key (student_user_id, subject_key),
  constraint attendpro_student_enrollment_approval_consistent check (
    (status = 'pending' and approved_by is null and approved_at is null)
    or (status = 'approved' and approved_by is not null and approved_at is not null)
  )
);
alter table public.attendpro_student_enrollments enable row level security;
revoke all on public.attendpro_student_enrollments from public, anon, authenticated;

insert into public.attendpro_student_enrollments (student_user_id, subject_key)
select distinct subject.student_user_id, subject.subject_key
from public.attendance_subjects as subject
join public.user_profiles as profile
  on profile.id = subject.student_user_id and profile.role = 'student'
join auth.users as auth_user
  on auth_user.id = subject.student_user_id and auth_user.email_confirmed_at is not null
where subject.student_user_id is not null
  and exists (
    select 1 from public.attendpro_staff_subject_assignments as assignment
    where assignment.active and assignment.subject_key = subject.subject_key
  )
on conflict (student_user_id, subject_key) do nothing;

create function public.attendpro_track_pending_enrollment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.student_user_id is not null and exists (
    select 1 from public.user_profiles as profile
    where profile.id = new.student_user_id and profile.role = 'student'
  ) and exists (
    select 1 from public.attendpro_staff_subject_assignments as assignment
    where assignment.active and assignment.subject_key = new.subject_key
  ) then
    insert into public.attendpro_student_enrollments (student_user_id, subject_key)
    values (new.student_user_id, new.subject_key)
    on conflict (student_user_id, subject_key) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.attendpro_track_pending_enrollment()
  from public, anon, authenticated;
create trigger attendance_subject_pending_enrollment
after insert or update of student_user_id, subject_key
on public.attendance_subjects
for each row execute function public.attendpro_track_pending_enrollment();

create table public.attendpro_attendance_corrections (
  id uuid primary key default gen_random_uuid(),
  staff_user_id uuid not null references auth.users (id),
  student_user_id uuid not null references auth.users (id),
  subject_id text not null references public.attendance_subjects (id) on delete restrict,
  subject_key text not null,
  held_before integer not null check (held_before >= 0),
  attended_before integer not null check (attended_before >= 0),
  held_after integer not null check (held_after >= 0),
  attended_after integer not null check (attended_after >= 0),
  held_delta integer not null,
  attended_delta integer not null,
  reason text not null check (length(btrim(reason)) between 5 and 1000),
  created_at timestamptz not null default now(),
  constraint attendpro_attendance_correction_totals check (attended_after <= held_after)
);
alter table public.attendpro_attendance_corrections enable row level security;
revoke all on public.attendpro_attendance_corrections from public, anon, authenticated;

-- Legacy self-maintained staff subject rows remain intact for audit/recovery,
-- but are no longer an authorization source.
revoke all on function public.sync_staff_attendance_subjects(text, jsonb)
  from public, anon, authenticated;

create function public.admin_set_staff_subject_assignments(
  p_staff_user_id uuid,
  p_subjects jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := auth.uid();
begin
  if v_admin is null or not exists (
    select 1 from public.attendpro_platform_admins as admin
    where admin.user_id = v_admin
  ) or not exists (
    select 1 from auth.users as auth_user
    where auth_user.id = v_admin and auth_user.email_confirmed_at is not null
  ) then
    raise exception 'Only a platform administrator can manage staff assignments.';
  end if;
  if not exists (
    select 1 from public.user_profiles as profile
    where profile.id = p_staff_user_id and profile.role = 'staff'
  ) then
    raise exception 'The selected account is not an AttendPro staff account.';
  end if;
  if jsonb_typeof(coalesce(p_subjects, '[]'::jsonb)) <> 'array' then
    raise exception 'Assignments must be supplied as a JSON array.';
  end if;

  update public.attendpro_staff_subject_assignments
  set active = false
  where staff_user_id = p_staff_user_id and active;

  insert into public.attendpro_staff_subject_assignments (
    staff_user_id, subject_key, subject_name, subject_code, semester, active, assigned_by
  )
  select
    p_staff_user_id,
    public.attendance_subject_key(entry.name, entry.code),
    trim(entry.name),
    coalesce(trim(entry.code), ''),
    coalesce(trim(entry.semester), ''),
    true,
    v_admin
  from jsonb_to_recordset(coalesce(p_subjects, '[]'::jsonb))
    as entry(name text, code text, semester text)
  where trim(coalesce(entry.name, '')) <> ''
  on conflict (staff_user_id, subject_key) do update
  set subject_name = excluded.subject_name,
      subject_code = excluded.subject_code,
      semester = excluded.semester,
      active = true,
      assigned_by = excluded.assigned_by,
      assigned_at = now();
end;
$$;
revoke all on function public.admin_set_staff_subject_assignments(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.admin_set_staff_subject_assignments(uuid, jsonb)
  to authenticated;

create or replace function public.get_staff_attendance_subjects(p_staff_email text)
returns table (name text, code text, semester text)
language sql
security definer
set search_path = ''
as $$
  select assignment.subject_name, assignment.subject_code, assignment.semester
  from public.attendpro_staff_subject_assignments as assignment
  where public.attendpro_require_role('staff') is not null
    and assignment.staff_user_id = auth.uid()
    and assignment.active
  order by assignment.subject_name;
$$;

create function public.get_authorized_staff_subject_assignments(p_staff_email text)
returns table (name text, code text, semester text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.attendpro_require_role('staff') is null then
    raise exception 'Staff sign-in required.';
  end if;
  return query
  select assignment.subject_name, assignment.subject_code, assignment.semester
  from public.attendpro_staff_subject_assignments as assignment
  where assignment.staff_user_id = auth.uid() and assignment.active
  order by assignment.subject_name;
end;
$$;

create or replace function public.get_staff_attendance_sessions(
  p_staff_email text,
  p_limit integer default 8
)
returns table (
  id uuid, code text, subject_name text, subject_code text, is_open boolean,
  created_at timestamptz, expires_at timestamptz, checkin_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.attendpro_require_role('staff');
  return query
  select session.id, session.code, session.subject_name, session.subject_code,
    session.is_open, session.created_at, session.expires_at,
    count(checkin.id)::bigint
  from public.attendance_sessions as session
  left join public.attendance_checkins as checkin on checkin.session_id = session.id
  where session.staff_user_id = auth.uid()
  group by session.id
  order by session.created_at desc
  limit greatest(1, least(coalesce(p_limit, 8), 50));
end;
$$;

create or replace function public.get_attendance_checkins(
  p_session_id uuid, p_staff_email text
)
returns setof public.attendance_checkins
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.attendpro_require_role('staff');
  if not exists (
    select 1 from public.attendance_sessions as session
    where session.id = p_session_id and session.staff_user_id = auth.uid()
  ) then
    raise exception 'You are not allowed to view this attendance session.';
  end if;
  return query
  select checkin.* from public.attendance_checkins as checkin
  where checkin.session_id = p_session_id
  order by checkin.checked_in_at;
end;
$$;

create or replace function public.close_attendance_session(
  p_session_id uuid, p_staff_email text
)
returns public.attendance_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.attendance_sessions;
begin
  perform public.attendpro_require_role('staff');
  update public.attendance_sessions as session
  set is_open = false, closed_at = now()
  where session.id = p_session_id
    and session.staff_user_id = auth.uid()
    and session.is_open
  returning session.* into v_session;
  if v_session.id is null then
    raise exception 'Session not found or already closed.';
  end if;
  return v_session;
end;
$$;

create function public.request_attendance_enrollment(p_session_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_email text := public.attendpro_require_role('student');
  v_session public.attendance_sessions;
  v_subject_key text;
begin
  select * into v_session
  from public.attendance_sessions as session
  where session.code = upper(trim(p_session_code))
  for update;

  if v_session.id is null or not v_session.is_open or v_session.expires_at <= now() then
    raise exception 'This attendance session is invalid, closed, or expired.';
  end if;
  if v_session.staff_user_id is null or not exists (
    select 1 from public.attendpro_staff_subject_assignments as assignment
    where assignment.staff_user_id = v_session.staff_user_id
      and assignment.active
      and assignment.subject_key =
        public.attendance_subject_key(v_session.subject_name, v_session.subject_code)
  ) then
    raise exception 'This session is not backed by an authorized staff subject assignment.';
  end if;
  if (
    select count(*) from public.attendance_checkins as checkin
    where checkin.session_id = v_session.id
  ) >= v_session.checkin_limit then
    raise exception 'This attendance session has reached its check-in limit.';
  end if;

  v_subject_key := public.attendance_subject_key(v_session.subject_name, v_session.subject_code);
  if exists (
    select 1 from public.attendpro_duplicate_enrollment_review as duplicate
    where duplicate.student_user_id = auth.uid()
      and duplicate.subject_key = v_subject_key
  ) then
    raise exception 'Duplicate legacy enrollment rows require administrator review before enrollment.';
  end if;
  if not exists (
    select 1 from public.attendance_subjects as subject
    where subject.student_user_id = auth.uid()
      and subject.subject_key = v_subject_key
  ) then
    insert into public.attendance_subjects (
      id, student_email, student_user_id, student_name, student_id, student_course,
      student_year, name, code, faculty, subject_key, name_key, held, attended
    )
    values (
      'sub-' || gen_random_uuid()::text,
      v_student_email,
      auth.uid(),
      coalesce((select profile.full_name from public.user_profiles as profile where profile.id = auth.uid()), ''),
      '',
      '',
      '',
      v_session.subject_name,
      coalesce(v_session.subject_code, ''),
      '',
      v_subject_key,
      public.normalize_subject(v_session.subject_name),
      0,
      0
    )
    on conflict (student_email, subject_key) do nothing;
  end if;

  insert into public.attendpro_student_enrollments (student_user_id, subject_key)
  values (auth.uid(), v_subject_key)
  on conflict (student_user_id, subject_key) do nothing;
end;
$$;

create or replace function public.create_attendance_session(
  p_staff_email text,
  p_subject_name text,
  p_subject_code text default '',
  p_duration_minutes integer default 30
)
returns public.attendance_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := public.attendpro_require_role('staff');
  v_session public.attendance_sessions;
  v_subject_key text := public.attendance_subject_key(p_subject_name, p_subject_code);
begin
  if not exists (
    select 1
    from public.attendpro_staff_subject_assignments as assignment
    where assignment.staff_user_id = auth.uid()
      and assignment.active
      and assignment.subject_key = v_subject_key
  ) then
    raise exception 'You can only start a session for a platform-assigned subject.';
  end if;
  v_session := public.attendpro_legacy_create_attendance_session(
    v_email, p_subject_name, p_subject_code, p_duration_minutes
  );
  update public.attendance_sessions
  set staff_user_id = auth.uid()
  where id = v_session.id;
  v_session.staff_user_id := auth.uid();
  return v_session;
end;
$$;

create or replace function public.get_staff_attendance(p_staff_email text)
returns table (
  student_email text, student_name text, student_id text, student_course text,
  student_year text, subject_id text, subject_name text, subject_code text,
  attended integer, held integer, subject_key text, updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.attendpro_require_role('staff');
  return query
  with official_records as (
    select record.student_user_id, record.subject_key,
      count(*) filter (where record.status <> 'cancelled')::integer as held,
      count(*) filter (where record.status in ('present', 'late'))::integer as attended
    from public.attendance_records as record
    where record.source = 'staff_confirmed'
    group by record.student_user_id, record.subject_key
  ),
  corrections as (
    select correction.student_user_id, correction.subject_key,
      sum(correction.held_delta)::integer as held,
      sum(correction.attended_delta)::integer as attended
    from public.attendpro_attendance_corrections as correction
    group by correction.student_user_id, correction.subject_key
  )
  select subject.student_email, subject.student_name, subject.student_id,
    subject.student_course, subject.student_year, subject.id, subject.name,
    subject.code,
    greatest(0, coalesce(records.attended, 0) + coalesce(corrections.attended, 0)),
    greatest(0, coalesce(records.held, 0) + coalesce(corrections.held, 0)),
    subject.subject_key, subject.updated_at
  from public.attendance_subjects as subject
  join public.attendpro_staff_subject_assignments as assignment
    on assignment.staff_user_id = auth.uid()
   and assignment.active
   and assignment.subject_key = subject.subject_key
  join auth.users as auth_user
    on auth_user.id = subject.student_user_id
   and auth_user.email_confirmed_at is not null
  join public.user_profiles as profile
    on profile.id = auth_user.id
   and profile.role = 'student'
   and profile.verification_status = 'verified'
  left join official_records as records
    on records.student_user_id = subject.student_user_id
   and records.subject_key = subject.subject_key
  left join corrections
    on corrections.student_user_id = subject.student_user_id
   and corrections.subject_key = subject.subject_key
  where subject.student_user_id is not null
    and exists (
      select 1
      from public.attendpro_student_enrollments as enrollment
      where enrollment.student_user_id = subject.student_user_id
        and enrollment.subject_key = subject.subject_key
        and enrollment.status in ('pending', 'approved')
    )
    and not exists (
      select 1
      from public.attendpro_duplicate_enrollment_review as duplicate
      where duplicate.student_user_id = subject.student_user_id
        and duplicate.subject_key = subject.subject_key
    )
  order by subject.student_name, subject.name;
end;
$$;

create or replace function public.get_student_attendance_subjects(p_student_email text)
returns setof public.attendance_subjects
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.attendpro_require_role('student');
  return query
  select subject.* from public.attendance_subjects as subject
  where subject.student_user_id = auth.uid()
  order by subject.created_at desc;
end;
$$;

create or replace function public.get_student_attendance_records(p_student_email text)
returns setof public.attendance_records
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.attendpro_require_role('student');
  return query
  select record.* from public.attendance_records as record
  where record.student_user_id = auth.uid()
  order by record.date desc, record.created_at desc;
end;
$$;

create function public.get_authorized_attendance_subjects(p_student_email text)
returns setof public.attendance_subjects
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.attendpro_require_role('student');
  return query
  select subject.* from public.attendance_subjects as subject
  where subject.student_user_id = auth.uid()
  order by subject.created_at desc;
end;
$$;

create function public.get_authorized_attendance_records(p_student_email text)
returns setof public.attendance_records
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.attendpro_require_role('student');
  return query
  select record.* from public.attendance_records as record
  where record.student_user_id = auth.uid()
  order by record.date desc, record.created_at desc;
end;
$$;

-- Corrections are append-only audit events. Deltas are applied to the
-- student-facing aggregate without rewriting the underlying official records.
create function public.correct_official_attendance_counters(
  p_subject_id text,
  p_held integer,
  p_attended integer,
  p_reason text
)
returns public.attendance_subjects
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff_email text := public.attendpro_require_role('staff');
  v_subject public.attendance_subjects;
  v_official_held integer;
  v_official_attended integer;
  v_held_delta integer;
  v_attended_delta integer;
begin
  if length(btrim(coalesce(p_reason, ''))) < 5 or length(btrim(p_reason)) > 1000 then
    raise exception 'Provide a correction reason between 5 and 1000 characters.';
  end if;
  if p_held is null or p_attended is null or p_held < 0 or p_attended < 0 or p_attended > p_held then
    raise exception 'Attendance totals must be nonnegative and attended cannot exceed held.';
  end if;

  select subject.* into v_subject
  from public.attendance_subjects as subject
  join public.attendpro_staff_subject_assignments as assignment
    on assignment.staff_user_id = auth.uid()
   and assignment.active
   and assignment.subject_key = subject.subject_key
  where subject.id = p_subject_id
    and subject.student_user_id is not null
  for update of subject;

  if v_subject.id is null then
    raise exception 'You are not authorized to correct this subject.';
  end if;
  if exists (
    select 1
    from public.attendpro_duplicate_enrollment_review as duplicate
    where duplicate.student_user_id = v_subject.student_user_id
      and duplicate.subject_key = v_subject.subject_key
  ) then
    raise exception 'Duplicate legacy enrollment rows require administrator review before correction.';
  end if;

  select
    count(*) filter (where record.status <> 'cancelled')::integer,
    count(*) filter (where record.status in ('present', 'late'))::integer
  into v_official_held, v_official_attended
  from public.attendance_records as record
  where record.student_user_id = v_subject.student_user_id
    and record.subject_key = v_subject.subject_key
    and record.source = 'staff_confirmed';

  select
    coalesce(v_official_held, 0) + coalesce(sum(correction.held_delta), 0),
    coalesce(v_official_attended, 0) + coalesce(sum(correction.attended_delta), 0)
  into v_official_held, v_official_attended
  from public.attendpro_attendance_corrections as correction
  where correction.student_user_id = v_subject.student_user_id
    and correction.subject_key = v_subject.subject_key;

  v_held_delta := p_held - coalesce(v_official_held, 0);
  v_attended_delta := p_attended - coalesce(v_official_attended, 0);
  if v_official_held + v_held_delta < 0 or v_official_attended + v_attended_delta < 0 then
    raise exception 'The requested correction would produce negative attendance totals.';
  end if;
  if v_subject.held + v_held_delta < 0 or v_subject.attended + v_attended_delta < 0 then
    raise exception 'The correction exceeds the available aggregate attendance totals.';
  end if;

  insert into public.attendpro_attendance_corrections (
    staff_user_id, student_user_id, subject_id, subject_key,
    held_before, attended_before, held_after, attended_after,
    held_delta, attended_delta, reason
  )
  values (
    auth.uid(), v_subject.student_user_id, v_subject.id, v_subject.subject_key,
    v_official_held, v_official_attended, p_held, p_attended,
    v_held_delta, v_attended_delta, btrim(p_reason)
  );

  if not exists (
    select 1 from public.attendpro_student_enrollments as enrollment
    where enrollment.student_user_id = v_subject.student_user_id
      and enrollment.subject_key = v_subject.subject_key
      and enrollment.status = 'approved'
  ) then
    raise exception 'The student enrollment is not approved for this subject.';
  end if;

  update public.attendance_subjects
  set held = held + v_held_delta,
      attended = attended + v_attended_delta,
      updated_at = now()
  where id = v_subject.id
  returning * into v_subject;

  return v_subject;
end;
$$;

create function public.get_attendance_correction_audit(
  p_subject_id text default null,
  p_limit integer default 50
)
returns table (
  correction_id uuid,
  student_name text,
  subject_name text,
  staff_user_id uuid,
  held_before integer,
  attended_before integer,
  held_after integer,
  attended_after integer,
  reason text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.attendpro_require_role('staff');
  return query
  select correction.id, subject.student_name, subject.name,
    correction.staff_user_id, correction.held_before, correction.attended_before,
    correction.held_after, correction.attended_after, correction.reason,
    correction.created_at
  from public.attendpro_attendance_corrections as correction
  join public.attendance_subjects as subject
    on subject.id = correction.subject_id
  where exists (
    select 1 from public.attendpro_staff_subject_assignments as assignment
    where assignment.staff_user_id = auth.uid()
      and assignment.active
      and assignment.subject_key = correction.subject_key
  )
    and (p_subject_id is null or correction.subject_id = p_subject_id)
  order by correction.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
end;
$$;

create or replace function public.import_student_attendance(
  p_student_email text,
  p_student_name text default '',
  p_student_id text default '',
  p_student_course text default '',
  p_student_year text default '',
  p_subjects jsonb default '[]'::jsonb,
  p_records jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := public.attendpro_require_role('student');
  v_exists boolean;
begin
  select exists (
    select 1 from public.attendance_subjects
    where student_user_id = auth.uid()
  ) into v_exists;
  if v_exists then
    return;
  end if;

  insert into public.attendance_subjects (
    id, student_email, student_user_id, student_name, student_id,
    student_course, student_year, name, code, faculty, subject_key,
    name_key, held, attended
  )
  select
    entry.id,
    v_email,
    auth.uid(),
    coalesce(trim(p_student_name), ''),
    coalesce(trim(p_student_id), ''),
    coalesce(trim(p_student_course), ''),
    coalesce(trim(p_student_year), ''),
    trim(entry.name),
    coalesce(trim(entry.code), ''),
    coalesce(trim(entry.faculty), ''),
    public.attendance_subject_key(entry.name, entry.code),
    public.normalize_subject(entry.name),
    greatest(coalesce(entry.held, 0), 0),
    least(greatest(coalesce(entry.attended, 0), 0), greatest(coalesce(entry.held, 0), 0))
  from jsonb_to_recordset(coalesce(p_subjects, '[]'::jsonb))
    as entry(id text, name text, code text, faculty text, held integer, attended integer)
  where coalesce(trim(entry.id), '') <> '' and trim(coalesce(entry.name, '')) <> ''
  on conflict (student_email, subject_key) do nothing;

  insert into public.attendance_records (
    id, student_email, student_user_id, subject_id, subject_key, date, status, source
  )
  select
    entry.id,
    v_email,
    auth.uid(),
    subject.id,
    subject.subject_key,
    entry.record_date::date,
    entry.status,
    'legacy_import'
  from jsonb_to_recordset(coalesce(p_records, '[]'::jsonb))
    as entry(id text, subject_id text, record_date text, status text)
  join public.attendance_subjects as subject
    on subject.id = entry.subject_id and subject.student_user_id = auth.uid()
  where coalesce(trim(entry.id), '') <> ''
    and coalesce(entry.record_date, '') ~ '^\d{4}-\d{2}-\d{2}$'
    and entry.status in ('present', 'absent', 'late', 'cancelled')
  on conflict (id) do nothing;
end;
$$;

-- Existing imported/manual rows are personal or legacy history, not official.
create or replace function public.log_attendance_class(
  p_student_email text, p_subject_id text, p_status text, p_date date, p_record_id text
)
returns public.attendance_subjects
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := public.attendpro_require_role('student');
  v_subject public.attendance_subjects;
begin
  if exists (
    select 1
    from public.attendance_subjects as subject
    join public.attendpro_duplicate_enrollment_review as duplicate
      on duplicate.student_user_id = subject.student_user_id
     and duplicate.subject_key = subject.subject_key
    where subject.id = p_subject_id
      and subject.student_user_id = auth.uid()
  ) then
    raise exception 'Duplicate legacy enrollment rows require administrator review before logging attendance.';
  end if;
  if exists (
    select 1 from public.attendance_records as record
    where record.id = p_record_id
  ) then
    raise exception 'This attendance record ID already exists.';
  end if;
  v_subject := public.attendpro_legacy_log_attendance_class(
    v_email, p_subject_id, p_status, p_date, p_record_id
  );
  update public.attendance_records
  set source = 'personal', student_user_id = auth.uid()
  where id = p_record_id
    and student_user_id = auth.uid()
    and source = 'manual';
  if not found then
    raise exception 'The new personal attendance record could not be verified.';
  end if;
  return v_subject;
end;
$$;

create or replace function public.set_attendance_counters(
  p_student_email text, p_subject_id text, p_held integer, p_attended integer
)
returns public.attendance_subjects
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Direct attendance counter edits are disabled; submit an audited staff correction.';
end;
$$;

create or replace function public.create_attendance_subject(
  p_student_email text,
  p_subject jsonb,
  p_student_name text default '',
  p_student_id text default '',
  p_student_course text default '',
  p_student_year text default ''
)
returns public.attendance_subjects
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := public.attendpro_require_role('student');
  v_subject_key text := public.attendance_subject_key(p_subject->>'name', p_subject->>'code');
begin
  if exists (
    select 1 from public.attendpro_duplicate_enrollment_review as duplicate
    where duplicate.student_user_id = auth.uid()
      and duplicate.subject_key = v_subject_key
  ) then
    raise exception 'Duplicate legacy enrollment rows require administrator review before use.';
  end if;
  if exists (
    select 1 from public.attendance_subjects as subject
    where subject.student_user_id = auth.uid()
      and (
        subject.id = p_subject->>'id'
        or subject.subject_key = v_subject_key
      )
      and exists (
        select 1 from public.attendance_records as record
        where record.subject_id = subject.id and record.source = 'staff_confirmed'
      )
  ) then
    raise exception 'A subject with official attendance cannot be overwritten.';
  end if;
  return public.attendpro_legacy_create_attendance_subject(
    v_email, p_subject, p_student_name, p_student_id, p_student_course, p_student_year
  );
end;
$$;

create or replace function public.update_attendance_subject(p_student_email text, p_subject jsonb)
returns public.attendance_subjects
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := public.attendpro_require_role('student');
begin
  if exists (
    select 1
    from public.attendance_subjects as subject
    join public.attendpro_duplicate_enrollment_review as duplicate
      on duplicate.student_user_id = subject.student_user_id
     and duplicate.subject_key = subject.subject_key
    where subject.id = p_subject->>'id'
      and subject.student_user_id = auth.uid()
  ) then
    raise exception 'Duplicate legacy enrollment rows require administrator review before editing.';
  end if;
  if exists (
    select 1 from public.attendance_records as record
    where record.subject_id = p_subject->>'id'
      and record.source = 'staff_confirmed'
  ) then
    raise exception 'A subject with official attendance cannot be edited.';
  end if;
  return public.attendpro_legacy_update_attendance_subject(v_email, p_subject);
end;
$$;

create or replace function public.delete_attendance_subject(p_student_email text, p_subject_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := public.attendpro_require_role('student');
begin
  if exists (
    select 1
    from public.attendance_subjects as subject
    join public.attendpro_duplicate_enrollment_review as duplicate
      on duplicate.student_user_id = subject.student_user_id
     and duplicate.subject_key = subject.subject_key
    where subject.id = p_subject_id
      and subject.student_user_id = auth.uid()
  ) then
    raise exception 'Duplicate legacy enrollment rows require administrator review before deletion.';
  end if;
  if exists (
    select 1 from public.attendance_records as record
    where record.subject_id = p_subject_id and record.source = 'staff_confirmed'
  ) then
    raise exception 'A subject with official attendance cannot be deleted.';
  end if;
  perform public.attendpro_legacy_delete_attendance_subject(v_email, p_subject_id);
end;
$$;

create or replace function public.get_authorized_staff_attendance_subjects(p_staff_email text)
returns table (name text, code text, semester text)
language sql
security definer
set search_path = ''
as $$
  select * from public.get_authorized_staff_subject_assignments(p_staff_email);
$$;

-- A valid class code may create a pending enrollment and a personal check-in;
-- only staff confirmation creates official attendance. Codes expire, require
-- an assigned staff session and have a fixed session-level use limit.
create or replace function public.check_in_attendance(
  p_code text, p_student_email text, p_student_name text, p_roll_number text default ''
)
returns public.attendance_checkins
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := public.attendpro_require_role('student');
  v_session public.attendance_sessions;
  v_checkin public.attendance_checkins;
  v_subject_key text;
begin
  select * into v_session
  from public.attendance_sessions as session
  where session.code = upper(trim(p_code))
  for update;

  if v_session.id is null or not v_session.is_open or v_session.expires_at <= now() then
    raise exception 'This attendance code is invalid, closed, or expired.';
  end if;
  if v_session.staff_user_id is null or not exists (
    select 1 from public.attendpro_staff_subject_assignments as assignment
    where assignment.staff_user_id = v_session.staff_user_id
      and assignment.active
      and assignment.subject_key =
        public.attendance_subject_key(v_session.subject_name, v_session.subject_code)
  ) then
    raise exception 'This session is not backed by an authorized staff assignment.';
  end if;
  if (
    select count(*) from public.attendance_checkins as checkin
    where checkin.session_id = v_session.id
  ) >= v_session.checkin_limit then
    raise exception 'This attendance session has reached its check-in limit.';
  end if;
  if exists (
    select 1 from public.attendpro_duplicate_enrollment_review as duplicate
    where duplicate.student_user_id = auth.uid()
      and duplicate.subject_key =
        public.attendance_subject_key(v_session.subject_name, v_session.subject_code)
  ) then
    raise exception 'Duplicate legacy enrollment rows require administrator review before check-in.';
  end if;
  if exists (
    select 1 from public.attendance_checkins as checkin
    where checkin.session_id = v_session.id
      and checkin.student_user_id = auth.uid()
  ) then
    raise exception 'You have already checked in for this session.';
  end if;

  v_subject_key := public.attendance_subject_key(v_session.subject_name, v_session.subject_code);
  insert into public.attendpro_student_enrollments (student_user_id, subject_key)
  values (auth.uid(), v_subject_key)
  on conflict (student_user_id, subject_key) do nothing;

  v_checkin := public.attendpro_legacy_check_in_attendance(
    v_session.code, v_email, p_student_name, p_roll_number
  );
  update public.attendance_records
  set source = 'personal', student_user_id = auth.uid()
  where session_id = v_session.id and lower(student_email) = v_email
    and source in ('live', 'personal');
  update public.attendance_checkins
  set student_user_id = auth.uid()
  where id = v_checkin.id;
  return v_checkin;
end;
$$;

create or replace function public.confirm_camera_attendance(p_session_id uuid, p_student_email text)
returns public.attendance_checkins
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff_email text := public.attendpro_require_role('staff');
  v_student_email text := lower(trim(p_student_email));
  v_session public.attendance_sessions;
  v_subject public.attendance_subjects;
  v_roll_number text;
  v_checkin public.attendance_checkins;
  v_existing public.attendance_records;
begin
  select * into v_session
  from public.attendance_sessions as session
  where session.id = p_session_id and session.staff_user_id = auth.uid()
  for update;
  if v_session.id is null then
    raise exception 'You are not authorized to confirm attendance for this session.';
  end if;
  if not v_session.is_open or v_session.expires_at <= now() then
    raise exception 'This attendance session is closed or expired.';
  end if;
  if not exists (
    select 1 from public.attendpro_staff_subject_assignments as assignment
    where assignment.staff_user_id = auth.uid()
      and assignment.active
      and assignment.subject_key =
        public.attendance_subject_key(v_session.subject_name, v_session.subject_code)
  ) then
    raise exception 'This session no longer has an active staff subject assignment.';
  end if;
  if exists (
    select 1
    from public.attendpro_duplicate_enrollment_review as duplicate
    where duplicate.student_user_id =
      public.attendpro_resolve_verified_user(v_student_email)
      and duplicate.subject_key =
        public.attendance_subject_key(v_session.subject_name, v_session.subject_code)
  ) then
    raise exception 'Duplicate legacy enrollment rows require administrator review before confirmation.';
  end if;
  if not exists (
    select 1 from public.attendance_checkins as checkin
    where checkin.session_id = v_session.id
      and checkin.student_email = lower(trim(p_student_email))
  ) and (
    select count(*) from public.attendance_checkins as checkin
    where checkin.session_id = v_session.id
  ) >= v_session.checkin_limit then
    raise exception 'This attendance session has reached its check-in limit.';
  end if;

  select subject.* into v_subject
  from public.attendance_subjects as subject
  join auth.users as auth_user
    on auth_user.id = subject.student_user_id
   and auth_user.email_confirmed_at is not null
  join public.user_profiles as profile
    on profile.id = auth_user.id and profile.role = 'student'
  where subject.student_user_id is not null
    and lower(subject.student_email) = lower(trim(p_student_email))
    and subject.subject_key =
      public.attendance_subject_key(v_session.subject_name, v_session.subject_code)
    and exists (
      select 1
      from public.attendpro_student_enrollments as enrollment
      where enrollment.student_user_id = subject.student_user_id
        and enrollment.subject_key = subject.subject_key
        and enrollment.status in ('pending', 'approved')
    )
  for update of subject;
  if v_subject.id is null then
    raise exception 'The student is not verified or enrolled in this exact subject.';
  end if;

  select profile.roll_number into v_roll_number
  from public.user_profiles as profile
  where profile.id = v_subject.student_user_id
    and profile.role = 'student'
    and profile.verification_status = 'verified';

  select record.* into v_existing
  from public.attendance_records as record
  where record.session_id = v_session.id
    and record.student_user_id = v_subject.student_user_id
  for update;
  if (
    select count(*) from public.attendance_records as record
    where record.session_id = v_session.id
      and record.student_user_id = v_subject.student_user_id
  ) > 1 then
    raise exception 'Duplicate legacy attendance rows require administrator review before confirmation.';
  end if;
  if v_existing.id is not null and v_existing.source = 'staff_confirmed' then
    raise exception 'This student already has official attendance for the session.';
  end if;

  insert into public.attendpro_student_enrollments (
    student_user_id, subject_key, status, approved_by, approved_at
  )
  values (v_subject.student_user_id, v_subject.subject_key, 'approved', auth.uid(), now())
  on conflict (student_user_id, subject_key) do update
  set status = 'approved', approved_by = auth.uid(), approved_at = now();

  if v_existing.id is null then
    insert into public.attendance_records (
      id, student_email, student_user_id, subject_id, subject_key, date,
      status, source, session_id
    )
    values (
      'staff-' || gen_random_uuid()::text,
      v_subject.student_email,
      v_subject.student_user_id,
      v_subject.id,
      v_subject.subject_key,
      (v_session.created_at at time zone 'utc')::date,
      'present',
      'staff_confirmed',
      v_session.id
    );
    update public.attendance_subjects
    set held = held + 1, attended = attended + 1, updated_at = now()
    where id = v_subject.id;
  else
    update public.attendance_records
    set source = 'staff_confirmed', status = 'present',
        student_user_id = v_subject.student_user_id
    where id = v_existing.id;
  end if;

  select checkin.* into v_checkin
  from public.attendance_checkins as checkin
  where checkin.session_id = v_session.id
    and checkin.student_user_id = v_subject.student_user_id
  for update;
  if (
    select count(*) from public.attendance_checkins as checkin
    where checkin.session_id = v_session.id
      and checkin.student_user_id = v_subject.student_user_id
  ) > 1 then
    raise exception 'Duplicate legacy check-ins require administrator review before confirmation.';
  end if;
  if v_checkin.id is null then
    insert into public.attendance_checkins (
      session_id, student_email, student_user_id, student_name, roll_number, checked_in_at
    )
    values (
      v_session.id, v_subject.student_email, v_subject.student_user_id,
      v_subject.student_name, coalesce(v_roll_number, ''), now()
    )
    returning * into v_checkin;
  else
    update public.attendance_checkins
    set roll_number = coalesce(v_roll_number, '')
    where id = v_checkin.id
    returning * into v_checkin;
  end if;

  return v_checkin;
end;
$$;

-- Notifications are generated only by staff-confirmed official attendance.
drop trigger if exists attendance_checkin_notification on public.attendance_checkins;

create or replace function public.create_attendance_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject_name text;
begin
  if new.source <> 'staff_confirmed' or new.student_user_id is null then
    return new;
  end if;
  select subject.name into v_subject_name
  from public.attendance_subjects as subject
  where subject.id = new.subject_id;

  insert into public.attendance_notifications (user_id, session_id, title, body)
  values (
    new.student_user_id,
    new.session_id,
    'Attendance recorded',
    'Your attendance for ' || coalesce(v_subject_name, 'a subject') || ' was confirmed by staff.'
  )
  on conflict (user_id, session_id) do nothing;
  return new;
end;
$$;

create trigger attendance_record_notification
after insert or update of source on public.attendance_records
for each row
when (new.source = 'staff_confirmed')
execute function public.create_attendance_notification();

-- Broadcast only an opaque refresh signal. The previous trigger broadcast the
-- full check-in row on publicly subscribable channels.
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

-- Revoke old paths that allowed self-editable staff rosters or un-audited
-- counter writes. New operations validate trusted UUID-based assignments.
revoke all on function public.get_staff_attendance(text) from public, anon, authenticated;
revoke all on function public.get_staff_attendance_subjects(text) from public, anon, authenticated;
revoke all on function public.get_authorized_staff_subject_assignments(text)
  from public, anon, authenticated;
revoke all on function public.get_authorized_staff_attendance_subjects(text)
  from public, anon, authenticated;
revoke all on function public.get_authorized_attendance_subjects(text)
  from public, anon, authenticated;
revoke all on function public.get_authorized_attendance_records(text)
  from public, anon, authenticated;
revoke all on function public.correct_official_attendance_counters(text, integer, integer, text)
  from public, anon, authenticated;
revoke all on function public.get_attendance_correction_audit(text, integer)
  from public, anon, authenticated;
revoke all on function public.set_attendance_counters(text, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.sync_staff_attendance_subjects(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.request_attendance_enrollment(text)
  from public, anon, authenticated;

grant execute on function public.get_staff_attendance(text) to authenticated;
grant execute on function public.get_authorized_staff_subject_assignments(text) to authenticated;
grant execute on function public.get_authorized_attendance_subjects(text) to authenticated;
grant execute on function public.get_authorized_attendance_records(text) to authenticated;
grant execute on function public.correct_official_attendance_counters(text, integer, integer, text)
  to authenticated;
grant execute on function public.get_attendance_correction_audit(text, integer)
  to authenticated;
grant execute on function public.request_attendance_enrollment(text) to authenticated;

commit;
