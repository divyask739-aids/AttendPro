-- AttendPro Supabase Auth foundation.
--
-- Apply manually after reviewing this migration. It creates a student role
-- profile for each new Auth user. Staff roles must be assigned separately by
-- a trusted project administrator after invitation.

begin;

create table if not exists public.user_profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null default '',
  role       text not null default 'student'
             check (role in ('student', 'staff')),
  created_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

revoke all on public.user_profiles from public, anon, authenticated;
grant select on public.user_profiles to authenticated;

-- Existing Auth users receive the safe default. A trusted administrator can
-- explicitly promote invited staff after verifying their accounts.
insert into public.user_profiles (id, full_name, role)
select
  auth_user.id,
  coalesce(nullif(btrim(auth_user.raw_user_meta_data ->> 'full_name'), ''), ''),
  'student'
from auth.users as auth_user
on conflict (id) do nothing;

create policy "Users can read their own AttendPro profile"
  on public.user_profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create function public.create_attendpro_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (id, full_name, role)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), ''),
    'student'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.create_attendpro_user_profile()
  from public, anon, authenticated;

create trigger create_attendpro_profile_after_signup
  after insert on auth.users
  for each row
  execute function public.create_attendpro_user_profile();

commit;
