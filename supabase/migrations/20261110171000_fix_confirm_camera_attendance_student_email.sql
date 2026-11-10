-- Repair confirm_camera_attendance for databases where the earlier migration
-- has already been applied, and keep fresh installs on the corrected body.
-- Apply only after 20261106213400_attendance_integrity_and_identity.sql.

begin;

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
      and checkin.student_email = v_student_email
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
    on profile.id = auth_user.id
   and profile.role = 'student'
   and profile.verification_status = 'verified'
  where subject.student_user_id is not null
    and lower(subject.student_email) = v_student_email
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

revoke all on function public.confirm_camera_attendance(uuid, text)
  from public, anon, authenticated;
grant execute on function public.confirm_camera_attendance(uuid, text)
  to authenticated;

commit;
