-- Auth profile fields and trusted staging staff-invitation workflow.
-- Apply only to the reviewed AttendPro staging project after earlier migrations.

begin;

alter table public.user_profiles
  add column if not exists roll_number text,
  add column if not exists department text,
  add column if not exists year text,
  add column if not exists section text,
  add column if not exists institution text not null default '',
  add column if not exists course text not null default '',
  add column if not exists semester text not null default '',
  add column if not exists daily_study_minutes integer not null default 180,
  add column if not exists staff_id text,
  add column if not exists designation text not null default '',
  add column if not exists academic_year text not null default '',
  add column if not exists verification_status text not null default 'not_submitted',
  add column if not exists verification_note text not null default '',
  add column if not exists verification_reviewed_by uuid references auth.users (id) on delete set null,
  add column if not exists verification_reviewed_at timestamptz,
  add column if not exists verified_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_profiles_verification_status_check'
      and conrelid = 'public.user_profiles'::regclass
  ) then
    alter table public.user_profiles
      add constraint user_profiles_verification_status_check
      check (verification_status in ('not_submitted', 'pending', 'verified', 'rejected'));
  end if;
end;
$$;

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
    create unique index if not exists user_profiles_student_roll_number_unique
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
    create unique index if not exists user_profiles_staff_id_unique
      on public.user_profiles (upper(btrim(staff_id)))
      where role = 'staff' and nullif(btrim(staff_id), '') is not null;
  else
    raise notice 'Duplicate staff IDs require review; the unique index was not created.';
  end if;
end;
$$;

create or replace function public.create_attendpro_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (
    id,
    full_name,
    role,
    roll_number,
    department,
    year,
    section,
    institution,
    course,
    semester
  )
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), ''),
    'student',
    nullif(btrim(new.raw_user_meta_data ->> 'roll_number'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'department'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'year'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'section'), ''),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'institution'), ''), ''),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'course'), ''), ''),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'semester'), ''), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create or replace function public.save_student_profile(
  p_full_name text,
  p_institution text,
  p_course text,
  p_semester text,
  p_daily_study_minutes integer
)
returns public.user_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.user_profiles;
  v_full_name text := btrim(p_full_name);
  v_institution text := btrim(p_institution);
  v_course text := btrim(p_course);
  v_semester text := btrim(p_semester);
begin
  perform public.attendpro_require_role('student');
  if v_full_name = '' or length(v_full_name) > 80
    or length(v_institution) > 120 or length(v_course) > 120
    or length(v_semester) > 40
    or p_daily_study_minutes not between 30 and 1440 then
    raise exception 'Enter valid student profile values.';
  end if;

  update public.user_profiles as profile
  set full_name = v_full_name,
      institution = v_institution,
      course = v_course,
      semester = v_semester,
      daily_study_minutes = p_daily_study_minutes
  where profile.id = auth.uid() and profile.role = 'student'
  returning profile.* into v_profile;
  if v_profile.id is null then
    raise exception 'The student profile is unavailable.';
  end if;
  return v_profile;
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

create table if not exists public.attendpro_staff_invitations (
  email text primary key,
  invited_by uuid not null references auth.users (id),
  invited_at timestamptz not null default now(),
  status text not null default 'pending'
    check (status in ('pending', 'approved')),
  approved_user_id uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  constraint attendpro_staff_invitation_email_normalized
    check (email = lower(btrim(email)) and email <> ''),
  constraint attendpro_staff_invitation_approval_consistent
    check (
      (status = 'pending' and approved_user_id is null and approved_at is null)
      or (status = 'approved' and approved_user_id is not null and approved_at is not null)
    )
);
alter table public.attendpro_staff_invitations enable row level security;
revoke all on public.attendpro_staff_invitations from public, anon, authenticated;

create or replace function public.admin_create_staff_invitation(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
begin
  if auth.uid() is null or not exists (
    select 1
    from public.attendpro_platform_admins as admin
    join auth.users as auth_user on auth_user.id = admin.user_id
    where admin.user_id = auth.uid()
      and auth_user.email_confirmed_at is not null
  ) then
    raise exception 'A platform administrator is required to invite staff.';
  end if;
  if v_email = '' or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'A valid staff email address is required.';
  end if;

  insert into public.attendpro_staff_invitations (email, invited_by)
  values (v_email, auth.uid())
  on conflict (email) do nothing;

  if exists (
    select 1
    from public.attendpro_staff_invitations as invitation
    where invitation.email = v_email and invitation.status = 'approved'
  ) then
    raise exception 'This email already has an approved staff invitation.';
  end if;
end;
$$;

create or replace function public.admin_list_staff_invitations()
returns table (
  email text,
  invited_at timestamptz,
  status text,
  auth_user_id uuid,
  approved_user_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.attendpro_platform_admins as admin
    join auth.users as auth_user on auth_user.id = admin.user_id
    where admin.user_id = auth.uid()
      and auth_user.email_confirmed_at is not null
  ) then
    raise exception 'A platform administrator is required to view staff invitations.';
  end if;

  return query
  select
    invitation.email,
    invitation.invited_at,
    invitation.status,
    case when auth_user.email_confirmed_at is not null then auth_user.id else null end,
    invitation.approved_user_id
  from public.attendpro_staff_invitations as invitation
  left join auth.users as auth_user
    on lower(btrim(auth_user.email)) = invitation.email
  order by invitation.invited_at desc;
end;
$$;

create or replace function public.admin_approve_staff_invitation(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.attendpro_platform_admins as admin
    join auth.users as auth_user on auth_user.id = admin.user_id
    where admin.user_id = auth.uid()
      and auth_user.email_confirmed_at is not null
  ) then
    raise exception 'A platform administrator is required to approve staff.';
  end if;

  select lower(btrim(auth_user.email))
  into v_email
  from auth.users as auth_user
  where auth_user.id = p_user_id
    and auth_user.email_confirmed_at is not null
  for update;
  if v_email is null then
    raise exception 'The invited user must exist and verify their email first.';
  end if;
  if not exists (
    select 1
    from public.attendpro_staff_invitations as invitation
    where invitation.email = v_email
      and invitation.status = 'pending'
  ) then
    raise exception 'No pending administrator invitation matches this verified email.';
  end if;
  if not exists (
    select 1
    from public.user_profiles as profile
    where profile.id = p_user_id and profile.role = 'student'
  ) then
    raise exception 'The invited user does not have the expected default profile.';
  end if;

  update public.user_profiles
  set role = 'staff'
  where id = p_user_id;

  update public.attendpro_staff_invitations
  set status = 'approved',
      approved_user_id = p_user_id,
      approved_at = now()
  where email = v_email;
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
    raise exception 'This roll number is already associated with another student.';
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
    raise exception 'No pending student verification matches that account.';
  end if;
  return v_profile;
end;
$$;

revoke all on function public.admin_create_staff_invitation(text)
  from public, anon, authenticated;
grant execute on function public.admin_create_staff_invitation(text)
  to authenticated;
revoke all on function public.admin_approve_staff_invitation(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_approve_staff_invitation(uuid)
  to authenticated;
revoke all on function public.admin_list_staff_invitations()
  from public, anon, authenticated;
grant execute on function public.admin_list_staff_invitations()
  to authenticated;
revoke all on function public.submit_student_verification(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_student_verification(text, text, text, text)
  to authenticated;
revoke all on function public.save_student_profile(text, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.save_student_profile(text, text, text, text, integer)
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
