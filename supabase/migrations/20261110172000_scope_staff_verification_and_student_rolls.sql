-- Limit staff verification visibility to their department and scope roll-number
-- uniqueness to the student's department, year, and section.
-- Apply only to the reviewed AttendPro staging project.

begin;

drop index if exists public.user_profiles_student_roll_number_unique;

do $$
begin
  if not exists (
    select 1
    from public.user_profiles
    where role = 'student'
      and nullif(btrim(roll_number), '') is not null
      and nullif(btrim(department), '') is not null
      and nullif(btrim(year), '') is not null
      and nullif(btrim(section), '') is not null
    group by
      lower(btrim(roll_number)),
      lower(btrim(department)),
      lower(btrim(year)),
      lower(btrim(section))
    having count(*) > 1
  ) then
    create unique index user_profiles_student_roll_number_unique
      on public.user_profiles (
        lower(btrim(roll_number)),
        lower(btrim(department)),
        lower(btrim(year)),
        lower(btrim(section))
      )
      where role = 'student'
        and nullif(btrim(roll_number), '') is not null
        and nullif(btrim(department), '') is not null
        and nullif(btrim(year), '') is not null
        and nullif(btrim(section), '') is not null;
  else
    raise notice 'Duplicate student roll identities require review; the unique index was not created.';
  end if;
end;
$$;

drop index if exists public.user_profiles_staff_id_unique;

do $$
begin
  if not exists (
    select 1
    from public.user_profiles
    where role = 'staff'
      and nullif(btrim(staff_id), '') is not null
    group by upper(btrim(staff_id))
    having count(*) > 1
  ) then
    create unique index user_profiles_staff_id_unique
      on public.user_profiles (upper(btrim(staff_id)))
      where role = 'staff' and nullif(btrim(staff_id), '') is not null;
  else
    raise notice 'Duplicate staff IDs require review; the unique index was not created.';
  end if;
end;
$$;

create or replace function public.save_staff_profile(
  p_full_name text,
  p_staff_id text,
  p_department text,
  p_designation text,
  p_academic_year text
)
returns public.user_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.user_profiles;
  v_full_name text := btrim(p_full_name);
  v_staff_id text := upper(btrim(p_staff_id));
  v_department text := btrim(p_department);
  v_designation text := btrim(p_designation);
  v_academic_year text := btrim(p_academic_year);
begin
  perform public.attendpro_require_role('staff');
  if v_full_name = '' or length(v_full_name) > 80
    or length(v_staff_id) > 32 or length(v_department) > 80
    or length(v_designation) > 80 or length(v_academic_year) > 24 then
    raise exception 'Enter valid staff profile values.';
  end if;

  if v_staff_id <> '' then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('staff|' || v_staff_id, 0)
    );
    if exists (
      select 1
      from public.user_profiles as other_profile
      where other_profile.role = 'staff'
        and other_profile.id <> auth.uid()
        and upper(btrim(other_profile.staff_id)) = v_staff_id
    ) then
      raise exception 'This staff ID is already assigned to another account.';
    end if;
  end if;

  update public.user_profiles as profile
  set full_name = v_full_name,
      staff_id = nullif(v_staff_id, ''),
      department = v_department,
      designation = v_designation,
      academic_year = v_academic_year
  where profile.id = auth.uid() and profile.role = 'staff'
  returning profile.* into v_profile;
  if v_profile.id is null then
    raise exception 'The staff profile is unavailable.';
  end if;
  return v_profile;
exception
  when unique_violation then
    raise exception 'This staff ID is already assigned to another account.';
end;
$$;

create or replace function public.submit_student_verification(
  p_roll_number text,
  p_department text,
  p_year text,
  p_section text
)
returns public.user_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.user_profiles;
  v_roll_number text := upper(btrim(p_roll_number));
  v_department text := btrim(p_department);
  v_year text := btrim(p_year);
  v_section text := upper(btrim(p_section));
begin
  perform public.attendpro_require_role('student');
  if v_roll_number = '' or v_department = '' or v_year = '' or v_section = ''
    or length(v_roll_number) > 32 or length(v_department) > 80
    or length(v_year) > 24 or length(v_section) > 24 then
    raise exception 'Enter valid roll number, department, year, and section values.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      lower(v_roll_number) || '|' || lower(v_department) || '|' ||
      lower(v_year) || '|' || lower(v_section),
      0
    )
  );
  if exists (
    select 1
    from public.user_profiles as other_profile
    where other_profile.role = 'student'
      and other_profile.id <> auth.uid()
      and lower(btrim(other_profile.roll_number)) = lower(v_roll_number)
      and lower(btrim(other_profile.department)) = lower(v_department)
      and lower(btrim(other_profile.year)) = lower(v_year)
      and lower(btrim(other_profile.section)) = lower(v_section)
  ) then
    raise exception 'This roll number is already registered for this department, year, and section.';
  end if;

  update public.user_profiles as profile
  set roll_number = v_roll_number,
      department = v_department,
      year = v_year,
      section = v_section,
      verification_status = 'pending',
      verification_note = '',
      verification_reviewed_by = null,
      verification_reviewed_at = null,
      verified_at = null
  where profile.id = auth.uid()
    and profile.role = 'student'
    and profile.verification_status <> 'verified'
  returning profile.* into v_profile;

  if v_profile.id is null then
    raise exception 'This student is already verified or their profile is unavailable.';
  end if;
  return v_profile;
exception
  when unique_violation then
    raise exception 'This roll number is already registered for this department, year, and section.';
end;
$$;

create or replace function public.get_staff_student_verifications()
returns table (
  email text,
  full_name text,
  roll_number text,
  department text,
  year text,
  section text,
  verification_status text,
  verification_note text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.attendpro_require_role('staff');
  return query
  select
    lower(auth_user.email),
    profile.full_name,
    profile.roll_number,
    profile.department,
    profile.year,
    profile.section,
    profile.verification_status,
    profile.verification_note
  from public.user_profiles as profile
  join auth.users as auth_user on auth_user.id = profile.id
  where profile.role = 'student'
    and auth_user.email is not null
    and exists (
      select 1
      from public.attendpro_student_enrollments as enrollment
      join public.attendpro_staff_subject_assignments as assignment
        on assignment.subject_key = enrollment.subject_key
      where enrollment.student_user_id = profile.id
        and enrollment.status in ('pending', 'approved')
        and assignment.staff_user_id = auth.uid()
        and assignment.active
        and not exists (
          select 1
          from public.attendpro_duplicate_enrollment_review as duplicate
          where duplicate.student_user_id = enrollment.student_user_id
            and duplicate.subject_key = enrollment.subject_key
        )
    )
  order by
    case profile.verification_status when 'pending' then 0 else 1 end,
    lower(auth_user.email);
end;
$$;

create or replace function public.review_student_verification(
  p_student_email text,
  p_decision text,
  p_note text default ''
)
returns public.user_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.user_profiles;
  v_email text := lower(btrim(p_student_email));
  v_note text := btrim(coalesce(p_note, ''));
begin
  perform public.attendpro_require_role('staff');
  if p_decision not in ('verified', 'rejected') then
    raise exception 'Choose a valid verification decision.';
  end if;
  if length(v_note) > 240 then
    raise exception 'Review notes must be 240 characters or fewer.';
  end if;

  update public.user_profiles as profile
  set verification_status = p_decision,
      verification_note = v_note,
      verification_reviewed_by = auth.uid(),
      verification_reviewed_at = now(),
      verified_at = case when p_decision = 'verified' then now() else null end
  from auth.users as auth_user
  where profile.id = auth_user.id
    and profile.id <> auth.uid()
    and profile.role = 'student'
    and profile.verification_status = 'pending'
    and lower(auth_user.email) = v_email
    and exists (
      select 1
      from public.attendpro_student_enrollments as enrollment
      join public.attendpro_staff_subject_assignments as assignment
        on assignment.subject_key = enrollment.subject_key
      where enrollment.student_user_id = profile.id
        and enrollment.status in ('pending', 'approved')
        and assignment.staff_user_id = auth.uid()
        and assignment.active
        and not exists (
          select 1
          from public.attendpro_duplicate_enrollment_review as duplicate
          where duplicate.student_user_id = enrollment.student_user_id
            and duplicate.subject_key = enrollment.subject_key
        )
    )
  returning profile.* into v_profile;

  if v_profile.id is null then
    raise exception 'No pending student verification matches that account in your department.';
  end if;
  return v_profile;
end;
$$;

revoke all on function public.submit_student_verification(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_student_verification(text, text, text, text)
  to authenticated;
revoke all on function public.save_staff_profile(text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.save_staff_profile(text, text, text, text, text)
  to authenticated;
revoke all on function public.get_staff_student_verifications()
  from public, anon, authenticated;
grant execute on function public.get_staff_student_verifications()
  to authenticated;
revoke all on function public.review_student_verification(text, text, text)
  from public, anon, authenticated;
grant execute on function public.review_student_verification(text, text, text)
  to authenticated;

commit;
