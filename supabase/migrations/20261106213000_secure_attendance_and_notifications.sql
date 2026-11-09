-- Authenticated, role-scoped access to the existing shared attendance model.
--
-- Apply after 20261106211500_auth_user_profiles.sql and after schema.sql.
-- Existing email-keyed rows are retained; identities are derived from the
-- verified Auth account at the RPC boundary rather than trusted from input.

begin;

create or replace function public.attendpro_require_role(p_role text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Sign in is required.';
  end if;

  select lower(auth_user.email)
  into v_email
  from auth.users as auth_user
  join public.user_profiles as profile on profile.id = auth_user.id
  where auth_user.id = auth.uid()
    and auth_user.email_confirmed_at is not null
    and profile.role = p_role;

  if v_email is null then
    raise exception 'A verified account with the required AttendPro role is required.';
  end if;

  return v_email;
end;
$$;

revoke all on function public.attendpro_require_role(text)
  from public, anon, authenticated;

-- Move the current implementations behind private-by-grant RPC wrappers.
alter function public.create_attendance_session(text, text, text, integer)
  rename to attendpro_legacy_create_attendance_session;
alter function public.get_staff_attendance_sessions(text, integer)
  rename to attendpro_legacy_get_staff_attendance_sessions;
alter function public.get_attendance_checkins(uuid, text)
  rename to attendpro_legacy_get_attendance_checkins;
alter function public.close_attendance_session(uuid, text)
  rename to attendpro_legacy_close_attendance_session;
alter function public.sync_staff_attendance_subjects(text, jsonb)
  rename to attendpro_legacy_sync_staff_attendance_subjects;
alter function public.get_staff_attendance_subjects(text)
  rename to attendpro_legacy_get_staff_attendance_subjects;
alter function public.get_staff_attendance(text)
  rename to attendpro_legacy_get_staff_attendance;
alter function public.import_student_attendance(text, text, text, text, text, jsonb, jsonb)
  rename to attendpro_legacy_import_student_attendance;
alter function public.update_attendance_identity(text, text, text, text, text)
  rename to attendpro_legacy_update_attendance_identity;
alter function public.create_attendance_subject(text, jsonb, text, text, text, text)
  rename to attendpro_legacy_create_attendance_subject;
alter function public.update_attendance_subject(text, jsonb)
  rename to attendpro_legacy_update_attendance_subject;
alter function public.delete_attendance_subject(text, text)
  rename to attendpro_legacy_delete_attendance_subject;
alter function public.log_attendance_class(text, text, text, date, text)
  rename to attendpro_legacy_log_attendance_class;
alter function public.set_attendance_counters(text, text, integer, integer)
  rename to attendpro_legacy_set_attendance_counters;
alter function public.get_student_attendance_subjects(text)
  rename to attendpro_legacy_get_student_attendance_subjects;
alter function public.get_student_attendance_records(text)
  rename to attendpro_legacy_get_student_attendance_records;
alter function public.get_attendance_session(text)
  rename to attendpro_legacy_get_attendance_session;
alter function public.check_in_attendance(text, text, text, text)
  rename to attendpro_legacy_check_in_attendance;

-- Keep the private implementations safe when called by the authenticated
-- wrappers. Their table and helper references are schema-qualified.
alter function public.attendpro_legacy_create_attendance_session(text, text, text, integer)
  set search_path = '';
alter function public.attendpro_legacy_get_staff_attendance_sessions(text, integer)
  set search_path = '';
alter function public.attendpro_legacy_get_attendance_checkins(uuid, text)
  set search_path = '';
alter function public.attendpro_legacy_close_attendance_session(uuid, text)
  set search_path = '';
alter function public.attendpro_legacy_sync_staff_attendance_subjects(text, jsonb)
  set search_path = '';
alter function public.attendpro_legacy_get_staff_attendance_subjects(text)
  set search_path = '';
alter function public.attendpro_legacy_get_staff_attendance(text)
  set search_path = '';
alter function public.attendpro_legacy_import_student_attendance(text, text, text, text, text, jsonb, jsonb)
  set search_path = '';
alter function public.attendpro_legacy_update_attendance_identity(text, text, text, text, text)
  set search_path = '';
alter function public.attendpro_legacy_create_attendance_subject(text, jsonb, text, text, text, text)
  set search_path = '';
alter function public.attendpro_legacy_update_attendance_subject(text, jsonb)
  set search_path = '';
alter function public.attendpro_legacy_delete_attendance_subject(text, text)
  set search_path = '';
alter function public.attendpro_legacy_log_attendance_class(text, text, text, date, text)
  set search_path = '';
alter function public.attendpro_legacy_set_attendance_counters(text, text, integer, integer)
  set search_path = '';
alter function public.attendpro_legacy_get_student_attendance_subjects(text)
  set search_path = '';
alter function public.attendpro_legacy_get_student_attendance_records(text)
  set search_path = '';
alter function public.attendpro_legacy_get_attendance_session(text)
  set search_path = '';
alter function public.attendpro_legacy_check_in_attendance(text, text, text, text)
  set search_path = '';


  from public, anon, authenticated;
revoke all on function public.attendpro_legacy_get_staff_attendance_sessions(text, integer)
  from public, anon, authenticated;revoke all on function public.attendpro_legacy_create_attendance_session(text, text, text, integer)
revoke all on function public.attendpro_legacy_get_attendance_checkins(uuid, text)
  from public, anon, authenticated;
revoke all on function public.attendpro_legacy_close_attendance_session(uuid, text)
  from public, anon, authenticated;
revoke all on function public.attendpro_legacy_sync_staff_attendance_subjects(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.attendpro_legacy_get_staff_attendance_subjects(text)
  from public, anon, authenticated;
revoke all on function public.attendpro_legacy_get_staff_attendance(text)
  from public, anon, authenticated;
revoke all on function public.attendpro_legacy_import_student_attendance(text, text, text, text, text, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.attendpro_legacy_update_attendance_identity(text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.attendpro_legacy_create_attendance_subject(text, jsonb, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.attendpro_legacy_update_attendance_subject(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.attendpro_legacy_delete_attendance_subject(text, text)
  from public, anon, authenticated;
revoke all on function public.attendpro_legacy_log_attendance_class(text, text, text, date, text)
  from public, anon, authenticated;
revoke all on function public.attendpro_legacy_set_attendance_counters(text, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.attendpro_legacy_get_student_attendance_subjects(text)
  from public, anon, authenticated;
revoke all on function public.attendpro_legacy_get_student_attendance_records(text)
  from public, anon, authenticated;
revoke all on function public.attendpro_legacy_get_attendance_session(text)
  from public, anon, authenticated;
revoke all on function public.attendpro_legacy_check_in_attendance(text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.generate_attendance_code() from public, anon, authenticated;

create function public.create_attendance_session(
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
begin
  if not exists (
    select 1
    from public.attendance_staff_subjects as taught
    where lower(taught.staff_email) = v_email
      and taught.subject_key = public.attendance_subject_key(p_subject_name, p_subject_code)
  ) then
    raise exception 'You can only start a session for a subject in your staff roster.';
  end if;

  return public.attendpro_legacy_create_attendance_session(
    v_email, p_subject_name, p_subject_code, p_duration_minutes
  );
end;
$$;

create function public.get_staff_attendance_sessions(p_staff_email text, p_limit integer default 8)
returns table (
  id uuid, code text, subject_name text, subject_code text, is_open boolean,
  created_at timestamptz, expires_at timestamptz, checkin_count bigint
)
language sql
security definer
set search_path = ''
as $$
  select * from public.attendpro_legacy_get_staff_attendance_sessions(
    public.attendpro_require_role('staff'), p_limit
  );
$$;

create function public.get_attendance_checkins(p_session_id uuid, p_staff_email text)
returns setof public.attendance_checkins
language sql
security definer
set search_path = ''
as $$
  select * from public.attendpro_legacy_get_attendance_checkins(
    p_session_id, public.attendpro_require_role('staff')
  );
$$;

create function public.close_attendance_session(p_session_id uuid, p_staff_email text)
returns public.attendance_sessions
language sql
security definer
set search_path = ''
as $$
  select public.attendpro_legacy_close_attendance_session(
    p_session_id, public.attendpro_require_role('staff')
  );
$$;

create function public.sync_staff_attendance_subjects(p_staff_email text, p_subjects jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  select public.attendpro_legacy_sync_staff_attendance_subjects(
    public.attendpro_require_role('staff'), p_subjects
  );
$$;

create function public.get_staff_attendance_subjects(p_staff_email text)
returns table (name text, code text, semester text)
language sql
security definer
set search_path = ''
as $$
  select * from public.attendpro_legacy_get_staff_attendance_subjects(
    public.attendpro_require_role('staff')
  );
$$;

create function public.get_staff_attendance(p_staff_email text)
returns table (
  student_email text, student_name text, student_id text, student_course text,
  student_year text, subject_id text, subject_name text, subject_code text,
  attended integer, held integer, subject_key text, updated_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select * from public.attendpro_legacy_get_staff_attendance(
    public.attendpro_require_role('staff')
  );
$$;

create function public.import_student_attendance(
  p_student_email text,
  p_student_name text default '',
  p_student_id text default '',
  p_student_course text default '',
  p_student_year text default '',
  p_subjects jsonb default '[]'::jsonb,
  p_records jsonb default '[]'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  select public.attendpro_legacy_import_student_attendance(
    public.attendpro_require_role('student'), p_student_name, p_student_id,
    p_student_course, p_student_year, p_subjects, p_records
  );
$$;

create function public.update_attendance_identity(
  p_student_email text,
  p_student_name text default '',
  p_student_id text default '',
  p_student_course text default '',
  p_student_year text default ''
)
returns void
language sql
security definer
set search_path = ''
as $$
  select public.attendpro_legacy_update_attendance_identity(
    public.attendpro_require_role('student'), p_student_name, p_student_id,
    p_student_course, p_student_year
  );
$$;

create function public.create_attendance_subject(
  p_student_email text,
  p_subject jsonb,
  p_student_name text default '',
  p_student_id text default '',
  p_student_course text default '',
  p_student_year text default ''
)
returns public.attendance_subjects
language sql
security definer
set search_path = ''
as $$
  select public.attendpro_legacy_create_attendance_subject(
    public.attendpro_require_role('student'), p_subject, p_student_name,
    p_student_id, p_student_course, p_student_year
  );
$$;

create function public.update_attendance_subject(p_student_email text, p_subject jsonb)
returns public.attendance_subjects
language sql
security definer
set search_path = ''
as $$
  select public.attendpro_legacy_update_attendance_subject(
    public.attendpro_require_role('student'), p_subject
  );
$$;

create function public.delete_attendance_subject(p_student_email text, p_subject_id text)
returns void
language sql
security definer
set search_path = ''
as $$
  select public.attendpro_legacy_delete_attendance_subject(
    public.attendpro_require_role('student'), p_subject_id
  );
$$;

create function public.log_attendance_class(
  p_student_email text, p_subject_id text, p_status text, p_date date, p_record_id text
)
returns public.attendance_subjects
language sql
security definer
set search_path = ''
as $$
  select public.attendpro_legacy_log_attendance_class(
    public.attendpro_require_role('student'), p_subject_id, p_status, p_date, p_record_id
  );
$$;

create function public.set_attendance_counters(
  p_student_email text, p_subject_id text, p_held integer, p_attended integer
)
returns public.attendance_subjects
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := public.attendpro_require_role('staff');
  v_student_email text;
begin
  select subject.student_email into v_student_email
  from public.attendance_subjects as subject
  where subject.id = p_subject_id
    and lower(subject.student_email) = lower(trim(p_student_email))
    and exists (
      select 1
      from public.attendance_staff_subjects as taught
      where lower(taught.staff_email) = v_email
        and (taught.subject_key = subject.subject_key or taught.name_key = subject.name_key)
    );

  if v_student_email is null then
    raise exception 'You are not authorized to update this student subject.';
  end if;

  return public.attendpro_legacy_set_attendance_counters(
    v_student_email, p_subject_id, p_held, p_attended
  );
end;
$$;

create function public.get_student_attendance_subjects(p_student_email text)
returns setof public.attendance_subjects
language sql
security definer
set search_path = ''
as $$
  select * from public.attendpro_legacy_get_student_attendance_subjects(
    public.attendpro_require_role('student')
  );
$$;

create function public.get_student_attendance_records(p_student_email text)
returns setof public.attendance_records
language sql
security definer
set search_path = ''
as $$
  select * from public.attendpro_legacy_get_student_attendance_records(
    public.attendpro_require_role('student')
  );
$$;

create function public.get_attendance_session(p_code text)
returns table (
  id uuid, code text, subject_name text, subject_code text, is_open boolean,
  created_at timestamptz, expires_at timestamptz, checkin_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.attendpro_require_role('student');
  return query
  select * from public.attendpro_legacy_get_attendance_session(p_code);
end;
$$;

create function public.check_in_attendance(
  p_code text, p_student_email text, p_student_name text, p_roll_number text default ''
)
returns public.attendance_checkins
language sql
security definer
set search_path = ''
as $$
  select public.attendpro_legacy_check_in_attendance(
    p_code, public.attendpro_require_role('student'), p_student_name, p_roll_number
  );
$$;

create table public.attendance_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null references public.attendance_sessions (id) on delete cascade,
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint attendance_notifications_user_session_unique unique (user_id, session_id)
);

alter table public.attendance_notifications enable row level security;
revoke all on public.attendance_notifications from public, anon, authenticated;

create function public.create_attendance_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_subject_name text;
begin
  select auth_user.id, session.subject_name
  into v_user_id, v_subject_name
  from auth.users as auth_user
  join public.user_profiles as profile on profile.id = auth_user.id
  join public.attendance_sessions as session on session.id = new.session_id
  where lower(auth_user.email) = lower(new.student_email)
    and auth_user.email_confirmed_at is not null
    and profile.role = 'student';

  if v_user_id is not null then
    insert into public.attendance_notifications (user_id, session_id, title, body)
    values (
      v_user_id,
      new.session_id,
      'Attendance recorded',
      'Your attendance for ' || v_subject_name || ' was marked present.'
    )
    on conflict (user_id, session_id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.create_attendance_notification()
  from public, anon, authenticated;

create trigger attendance_checkin_notification
after insert on public.attendance_checkins
for each row execute function public.create_attendance_notification();

create function public.get_attendance_notifications(p_limit integer default 20)
returns table (id uuid, title text, body text, created_at timestamptz, read_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.attendpro_require_role('student');
  return query
  select notification.id, notification.title, notification.body,
         notification.created_at, notification.read_at
  from public.attendance_notifications as notification
  where notification.user_id = auth.uid()
  order by notification.created_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
end;
$$;

create function public.mark_attendance_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.attendpro_require_role('student');
  update public.attendance_notifications
  set read_at = coalesce(read_at, now())
  where id = p_notification_id and user_id = auth.uid();

  if not found then
    raise exception 'Attendance notification not found.';
  end if;
end;
$$;

create function public.confirm_camera_attendance(p_session_id uuid, p_student_email text)
returns public.attendance_checkins
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff_email text := public.attendpro_require_role('staff');
  v_session public.attendance_sessions;
  v_subject public.attendance_subjects;
  v_checkin public.attendance_checkins;
  v_record_id text;
  v_student_email text := lower(trim(coalesce(p_student_email, '')));
begin
  if v_student_email = '' then
    raise exception 'Select a student from the roster.';
  end if;

  select * into v_session
  from public.attendance_sessions as session
  where session.id = p_session_id
    and lower(session.staff_email) = v_staff_email
  for update;

  if v_session.id is null then
    raise exception 'You are not authorized to confirm attendance for this session.';
  end if;
  if not v_session.is_open or v_session.expires_at <= now() then
    raise exception 'This attendance session is closed or expired.';
  end if;

  select subject.* into v_subject
  from public.attendance_subjects as subject
  join public.attendance_staff_subjects as taught
    on lower(taught.staff_email) = v_staff_email
   and (taught.subject_key = subject.subject_key or taught.name_key = subject.name_key)
  join auth.users as auth_user
    on lower(auth_user.email) = lower(subject.student_email)
   and auth_user.email_confirmed_at is not null
  join public.user_profiles as profile
    on profile.id = auth_user.id and profile.role = 'student'
  where lower(subject.student_email) = v_student_email
    and (
      subject.subject_key = public.attendance_subject_key(v_session.subject_name, v_session.subject_code)
      or subject.name_key = public.normalize_subject(v_session.subject_name)
    )
  order by (subject.subject_key = public.attendance_subject_key(v_session.subject_name, v_session.subject_code)) desc,
           subject.updated_at desc
  limit 1
  for update of subject;

  if v_subject.id is null then
    raise exception 'The selected student is not an authenticated student enrolled in this subject.';
  end if;

  v_record_id := 'live-' || gen_random_uuid()::text;
  insert into public.attendance_records (
    id, student_email, subject_id, subject_key, date, status, source, session_id
  )
  values (
    v_record_id,
    v_subject.student_email,
    v_subject.id,
    v_subject.subject_key,
    (v_session.created_at at time zone 'utc')::date,
    'present',
    'live',
    v_session.id
  )
  on conflict do nothing;

  if not found then
    raise exception 'This student already has attendance recorded for the session.';
  end if;

  update public.attendance_subjects
  set held = held + 1, attended = attended + 1, updated_at = now()
  where id = v_subject.id;

  insert into public.attendance_checkins (
    session_id, student_email, student_name, roll_number, checked_in_at
  )
  values (
    v_session.id,
    v_subject.student_email,
    v_subject.student_name,
    v_subject.student_id,
    now()
  )
  on conflict (session_id, student_email) do nothing
  returning * into v_checkin;

  if v_checkin.id is null then
    raise exception 'This student already checked in for the session.';
  end if;

  return v_checkin;
end;
$$;

revoke all on function public.create_attendance_session(text, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.get_staff_attendance_sessions(text, integer)
  from public, anon, authenticated;
revoke all on function public.get_attendance_checkins(uuid, text)
  from public, anon, authenticated;
revoke all on function public.close_attendance_session(uuid, text)
  from public, anon, authenticated;
revoke all on function public.sync_staff_attendance_subjects(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.get_staff_attendance_subjects(text)
  from public, anon, authenticated;
revoke all on function public.get_staff_attendance(text)
  from public, anon, authenticated;
revoke all on function public.import_student_attendance(text, text, text, text, text, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.update_attendance_identity(text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.create_attendance_subject(text, jsonb, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.update_attendance_subject(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.delete_attendance_subject(text, text)
  from public, anon, authenticated;
revoke all on function public.log_attendance_class(text, text, text, date, text)
  from public, anon, authenticated;
revoke all on function public.set_attendance_counters(text, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.get_student_attendance_subjects(text)
  from public, anon, authenticated;
revoke all on function public.get_student_attendance_records(text)
  from public, anon, authenticated;
revoke all on function public.get_attendance_session(text)
  from public, anon, authenticated;
revoke all on function public.check_in_attendance(text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.get_attendance_notifications(integer)
  from public, anon, authenticated;
revoke all on function public.mark_attendance_notification_read(uuid)
  from public, anon, authenticated;
revoke all on function public.confirm_camera_attendance(uuid, text)
  from public, anon, authenticated;

grant execute on function public.create_attendance_session(text, text, text, integer) to authenticated;
grant execute on function public.get_staff_attendance_sessions(text, integer) to authenticated;
grant execute on function public.get_attendance_checkins(uuid, text) to authenticated;
grant execute on function public.close_attendance_session(uuid, text) to authenticated;
grant execute on function public.sync_staff_attendance_subjects(text, jsonb) to authenticated;
grant execute on function public.get_staff_attendance_subjects(text) to authenticated;
grant execute on function public.get_staff_attendance(text) to authenticated;
grant execute on function public.import_student_attendance(text, text, text, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.update_attendance_identity(text, text, text, text, text) to authenticated;
grant execute on function public.create_attendance_subject(text, jsonb, text, text, text, text) to authenticated;
grant execute on function public.update_attendance_subject(text, jsonb) to authenticated;
grant execute on function public.delete_attendance_subject(text, text) to authenticated;
grant execute on function public.log_attendance_class(text, text, text, date, text) to authenticated;
grant execute on function public.set_attendance_counters(text, text, integer, integer) to authenticated;
grant execute on function public.get_student_attendance_subjects(text) to authenticated;
grant execute on function public.get_student_attendance_records(text) to authenticated;
grant execute on function public.get_attendance_session(text) to authenticated;
grant execute on function public.check_in_attendance(text, text, text, text) to authenticated;
grant execute on function public.confirm_camera_attendance(uuid, text) to authenticated;
grant execute on function public.get_attendance_notifications(integer) to authenticated;
grant execute on function public.mark_attendance_notification_read(uuid) to authenticated;

commit;
