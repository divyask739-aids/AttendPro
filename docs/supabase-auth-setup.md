# Legacy Supabase Auth setup (not used by account registration)

> This is retained as historical guidance for the separate shared-backend
> implementation in this repository. The current browser-local account flow and
> camera attendance do not use Supabase Auth or its email verification flow.
> Do not enable this configuration expecting it to authenticate browser-local
> accounts. See [camera attendance and student verification](./camera-attendance.md).

This phase replaces local email-only sign-in with Supabase Auth and stages
server-side authorization for shared attendance. Local-only profile, task,
planner, goal, and activity data remain in email-namespaced browser storage.

## Configuration and migration order

1. Back up the Supabase project and review the ordered migration files:
   [`20261106211500_auth_user_profiles.sql`](../supabase/migrations/20261106211500_auth_user_profiles.sql),
   [`20261106213000_secure_attendance_and_notifications.sql`](../supabase/migrations/20261106213000_secure_attendance_and_notifications.sql),
   and
   [`20261106213400_attendance_integrity_and_identity.sql`](../supabase/migrations/20261106213400_attendance_integrity_and_identity.sql).
2. Verify that the existing database schema and RPC signatures match the
   expected legacy attendance bootstrap. If the required tables/functions are
   absent, apply `supabase/schema.sql` once to a disposable project first. Do
   not apply it over an already-hardened project; it is not an upgrade script.
   If a live database differs from the expected baseline, stop and prepare a
   reviewed migration for that exact schema rather than applying these files
   blindly.
3. On the disposable project, apply these manual migrations in order:
   [`20261106211500_auth_user_profiles.sql`](../supabase/migrations/20261106211500_auth_user_profiles.sql),
   [`20261106213000_secure_attendance_and_notifications.sql`](../supabase/migrations/20261106213000_secure_attendance_and_notifications.sql),
   [`20261106213400_attendance_integrity_and_identity.sql`](../supabase/migrations/20261106213400_attendance_integrity_and_identity.sql).
   The app never applies SQL. These migrations create student-default role
   profiles, secure RPCs, UUID identity maps, trusted staff assignments,
   attendance provenance, corrections, and private notifications without
   deleting historical attendance.
4. In Supabase Auth settings, enable the Email provider and **Confirm email**.
   Configure production SMTP rather than relying on test email limits.
5. Set the Auth Site URL to the app root
   `https://divyask739-aids.github.io/AttendPro/` and allow the exact callback
   URL `https://divyask739-aids.github.io/AttendPro/login`. For local testing,
   allow `http://localhost:5173/AttendPro/login`. Signup verification and
   password-reset links return through that login route; the GitHub Pages
   `404.html` fallback restores the SPA route.
6. Keep `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set in local
   development and the GitHub Actions build environment. Only the anon key may
   be shipped in the frontend. Never add a service-role key to Vite variables
   or browser code.
7. Only after all migrations, email verification, and redirect URLs are verified,
   set `VITE_SUPABASE_AUTH_ENABLED=true` in the local environment and deployment
   build environment. The feature gate defaults off so the Auth client cannot
   be accidentally enabled before its database role mapping is installed. It
   remains disabled in this checkout and was not changed in the deployment
   environment.

For GitHub Actions, add the Supabase URL and anon key as repository secrets, and
the feature flag as a repository variable. Expose all three to the Vite build:

```yaml
env:
  VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
  VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
  VITE_SUPABASE_AUTH_ENABLED: ${{ vars.VITE_SUPABASE_AUTH_ENABLED }}
```

Set the repository variable to `true` only after the prerequisites above have
been verified. The flag is not a secret and does not grant authorization; the
database role mapping and RLS remain authoritative for profile access.

If the feature gate is off, sign-in and signup remain disabled with a setup
message. If the migration has not been applied after the gate is enabled,
sign-in reports that the role profile could not be loaded rather than treating
an email or client-supplied role as authorization.

## Student registration and sign-in

- Public registration calls Supabase Auth email/password signup and sends only
  a display name as metadata. It has no role selector.
- The database trigger creates the profile with `role = 'student'`; a submitted
  or edited user-metadata role is not consulted.
- Signup must return without an authenticated session. If it returns a session,
  the frontend signs that local session out and reports that email confirmation
  must be enabled.
- The email verification link returns to `/AttendPro/login?verified=1`.
  Supabase Auth restores sessions from the callback URL. The user then signs in
  with email and password.
- Password reset sends an email link to the same login page. The recovery event
  opens the new-password form.
- Supabase Auth persists and refreshes the session. The app reads the role from
  the RLS-protected `user_profiles` row for the authenticated UUID, not from
  local storage or editable role metadata.

## Staff invitations and role assignment

There is deliberately no public staff signup or client-side promotion path.

1. An administrator invites the staff email from Supabase Dashboard → Auth →
   Users. The signup trigger initially assigns the safe default `student` role.
2. After verifying the invited account, the project owner/admin finds its Auth
   UUID and promotes the matching profile using the Supabase SQL Editor (a
   trusted administrative session only):

   ```sql
   update public.user_profiles as profile
   set role = 'staff'
   from auth.users as auth_user
   where profile.id = auth_user.id
     and lower(auth_user.email) = lower('staff@example.com')
   returning profile.id, profile.role;
   ```

3. Verify that exactly the intended account was returned. If no row is returned,
   verify the invitation and confirmed Auth user before retrying. Never expose
   the SQL Editor, database credentials, or service-role key to the client.

The profile table has no authenticated `UPDATE` policy or update grant. A
student can read their own role but cannot modify or promote it through this
application.

### Platform administrator and staff subject provisioning

AttendPro has no college administrator role. The platform owner controls the
trusted administrator list from Supabase SQL Editor after verifying the
owner's confirmed Auth UUID:

```sql
insert into public.attendpro_platform_admins (user_id)
values ('<verified-platform-owner-auth-uuid>')
on conflict (user_id) do nothing;
```

Legacy rows in `attendance_staff_subjects` are preserved but are no longer
authorization. Review each staff member's real assignment, then insert or
activate only approved canonical subject keys in
`attendpro_staff_subject_assignments` from the trusted SQL Editor. Example:

```sql
insert into public.attendpro_staff_subject_assignments (
  staff_user_id, subject_key, subject_name, subject_code, semester, active, assigned_by
)
values (
  '<verified-staff-auth-uuid>',
  public.attendance_subject_key('Calculus I', 'MAT101'),
  'Calculus I',
  'MAT101',
  'Semester 1',
  true,
  '<platform-admin-auth-uuid>'
)
on conflict (staff_user_id, subject_key) do update
set subject_name = excluded.subject_name,
    subject_code = excluded.subject_code,
    semester = excluded.semester,
    active = true,
    assigned_by = excluded.assigned_by,
    assigned_at = now();
```

Confirm each UUID and assignment before executing. The table is not writable by
client roles. The authenticated `admin_set_staff_subject_assignments` RPC is
also available to a platform admin; no service-role credential belongs in the
browser.

The Profile page displays authorized assignments read-only. Staff cannot
establish access by editing their profile subject list. If no platform
administrator has been provisioned, staff assignment changes require the
trusted Supabase project owner.

## Existing accounts and compatibility

Local accounts and all `attendpro.<email>.*` local-storage data are left intact;
this code does not delete, overwrite, or automatically import them. The old
local account list is no longer used to authenticate. Existing students must
register/verify with control of the same email address to continue seeing
email-keyed local profile/task/planner data in that browser. Existing staff must
be invited and explicitly promoted by an administrator. Local-only data remains
on its original browser and is not made cross-device by authentication.

Shared attendance remains in its existing Supabase tables. The security migrations preserve the attendance rows and RPC names for
compatibility, but
wrapper functions ignore caller-supplied identity emails and derive the
verified user's email and role from `auth.uid()`. It denies anonymous calls,
restricts staff session/roster/counter operations to the caller's role and
platform-approved teaching assignments, and restricts student operations to
the caller's own UUID-linked rows. Camera confirmation uses a separate
staff-only RPC.

Notifications are created only when a check-in matches a verified student Auth
account and staff confirms an official attendance record. They are unique per
student and session, and only the recipient can read or mark them as read.
Student-submitted code check-ins and personal/manual/imported records are not
official; the history labels their provenance. Staff corrections require a
reason and append an actor/target/before/after audit event. Students cannot
delete or edit subjects that contain staff-confirmed records.

The identity migration matches only a single confirmed Auth account per
normalized email. It retains original email values in legacy snapshot columns,
leaves missing/ambiguous mappings unlinked, and records duplicate identity,
enrollment, and session-attendance cases for administrator review. It does not
merge or delete records. Resolve every review table from a backup before
releasing affected rows to normal operations; affected roster, enrollment,
attendance, and correction operations fail closed until reviewed.

A valid session code creates at most a pending enrollment/personal check-in;
the session has an expiry and a 100-check-in cap, and a student can check in
only once per session. Camera/manual staff confirmation is the step that
approves the enrollment and creates official attendance. A shared code is still
a bearer code and can be copied; it is not proof of identity. Staff must verify
each student in person. This is a prototype, not an anti-fraud attendance
system.

Tasks, goals, planner data, profile details, and activities remain in
email-namespaced local storage. Supabase Auth does not make those features
server-synchronized or provide server-side authorization for browser-local data.
Do not rerun `supabase/schema.sql` after applying the hardening migration without
reapplying that migration: the bootstrap schema contains the original RPC
definitions and is not an upgrade script.

## Verification checklist

- Register a student and confirm no app session is created before email
  verification.
- Follow the verification link and sign in with the password.
- Refresh the page and verify the Supabase session is restored.
- Sign out, refresh, and verify protected routes return to sign-in.
- Attempt login before email verification and confirm Supabase rejects it.
- Confirm public signup contains no staff role control.
- Confirm a profile row defaults to `student`, and client update attempts on
  `user_profiles` are denied.
- Invite a staff user from the dashboard, promote that verified UUID using the
  administrator procedure above, then confirm the account reaches the staff
  portal. Confirm a student cannot access staff routes.
- Verify existing profile, attendance, tasks, goals, planner, and activities
  remain available for same-email local data where applicable.
- Verify a student cannot call staff RPCs or read another student's attendance,
  and that forged email parameters do not change the Auth-derived identity.
- Verify staff camera confirmation is restricted to their open session and
  mirrored teaching roster, and creates at most one attendance record and
  notification per student/session.

## End-to-end test plan and current status

Run the verification checklist above against a disposable Supabase project
using separate verified student, staff, and platform-admin accounts. Also test
two browser profiles/devices, session expiry, duplicate and expired class codes,
camera permission denial/no webcam, manual camera selection, and notification
read/unread behavior. Verify Tasks, reminders, Goals, Planner, Activities, and
Profiles still work with their existing same-browser local data.

No Supabase project credentials, test accounts, or disposable database were
available for this checkout, so signup, email delivery, SQL execution, RLS,
Realtime, multi-device synchronization, camera hardware, and authenticated
role/attendance flows have not been tested here. TypeScript/build/static checks
and an unauthenticated browser smoke test are reported in the final task report;
they are not substitutes for this end-to-end plan.

## Checks performed for this checkout

- `npm run typecheck` passed.
- `npm run build` passed. Vite emitted its advisory that the main minified
  JavaScript chunk exceeds 500 kB; the build completed successfully.
- `git diff --check` passed; Git printed line-ending conversion warnings for
  some working-tree files.
- A local production-preview smoke test confirmed that a protected staff URL
  redirects to login and that signup stays disabled while the Auth feature flag
  is off. No browser console errors, page errors, or failed requests occurred
  during that check.
- The model and all MediaPipe WASM assets under the `/AttendPro/` base path
  returned HTTP 200 from the local production preview.

These are static/build and unauthenticated routing/asset checks only. They do
not validate database migrations or any authenticated behavior. No production
SQL, Supabase settings, or deployment was changed.
