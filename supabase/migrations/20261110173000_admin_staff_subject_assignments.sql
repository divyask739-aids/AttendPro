-- Provide a least-privilege, administrator-only read API for staff assignments.
-- The existing admin_set_staff_subject_assignments RPC remains the write path.

begin;

create or replace function public.admin_list_staff_subject_assignments()
returns table (
  staff_user_id uuid,
  email text,
  full_name text,
  subject_name text,
  subject_code text,
  semester text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.attendpro_platform_admins as admin
    join auth.users as admin_user on admin_user.id = admin.user_id
    where admin.user_id = auth.uid()
      and admin_user.email_confirmed_at is not null
  ) then
    raise exception 'A verified platform administrator is required to view staff assignments.';
  end if;

  return query
  select
    profile.id,
    lower(auth_user.email),
    profile.full_name,
    assignment.subject_name,
    assignment.subject_code,
    assignment.semester
  from public.user_profiles as profile
  join auth.users as auth_user
    on auth_user.id = profile.id
   and auth_user.email_confirmed_at is not null
  left join public.attendpro_staff_subject_assignments as assignment
    on assignment.staff_user_id = profile.id
   and assignment.active
  where profile.role = 'staff'
    and auth_user.email is not null
  order by lower(auth_user.email), assignment.subject_name;
end;
$$;

revoke all on function public.admin_list_staff_subject_assignments()
  from public, anon, authenticated;
grant execute on function public.admin_list_staff_subject_assignments()
  to authenticated;

commit;
