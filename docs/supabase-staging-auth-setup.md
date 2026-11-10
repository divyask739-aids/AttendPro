# AttendPro Supabase Auth staging preparation

This document covers the **staging-only Supabase Auth integration**. It does
not configure or migrate production or execute SQL. The existing browser-local
login remains the default outside explicit staging mode; all existing local
records are preserved.

## Staging-only environment

1. Use the `AttendPro-Staging` project only. Confirm its project identity and
   URL in the Supabase Dashboard; do not infer that an endpoint is staging
   from its name alone.
2. The root `.env.staging.local` has been prepared with placeholders. Replace
   them with only that staging project's **Project URL** and **anon/public
   key**. Never use a service-role key in Vite environment variables or
   frontend code.
3. Keep `VITE_SUPABASE_AUTH_ENABLED=false` until the staging project is
   confirmed, the required migrations are reviewed and applied there, and its
   Auth URL/email settings are ready. Set it to `true` only for an explicitly
   staging-mode build.
4. `.env.staging.local` is ignored by Git. The committed example contains
   placeholders only.

Vite loads `.env.staging.local` when explicitly run in staging mode. For
example:

```powershell
npm run dev:staging
npm run build:staging
```

The existing `npm run build` remains unchanged and does not select staging
mode. Do not deploy a staging build to GitHub Pages. Vite embeds `VITE_*`
values into the frontend bundle, so only the URL and publishable anon key may
be used there. Auth is available only in staging mode and only when its
explicit flag is true and usable project credentials are present.

## Supabase Auth dashboard settings for staging

Configure these only in the **staging** Supabase project:

- **Authentication → URL Configuration → Site URL:** the exact staging app
  origin and base path. For local Vite testing, use the local app URL under
  `/AttendPro/` (for example `http://localhost:5173/AttendPro/`). For hosted
  staging, use its dedicated HTTPS origin and `/AttendPro/` base path.
- **Redirect URLs allow list:** add only the exact staging callback URLs
  implemented by the app. The planned routes are
  `<STAGING_APP_URL>/auth/callback` for email verification and
  `<STAGING_APP_URL>/auth/reset-password` for password recovery. For local
  Vite, the corresponding path starts with
  `http://localhost:5173/AttendPro/`. Do not allow broad wildcard production
  domains or unrelated origins.
- **Email verification:** enable email confirmation for student signup.
  Configure staging email delivery and verify the confirmation link returns
  to the staging callback. Do not rely on Supabase's development-only
  confirmation behavior as proof that production email is configured.
- **Password recovery:** configure the recovery email template to link to the
  staging reset route. The app must validate the recovery session before
  accepting a new password.
- **Staff email/invitation:** do not expose public staff signup or let signup
  metadata grant staff privileges. Use a trusted administrator invitation or
  approval operation and verify the invited email before assigning the staff
  role.

The application implements the callback routes
`/AttendPro/auth/callback` and `/AttendPro/auth/reset-password`. Add the exact
staging-host URLs to the staging redirect allow list only. The production Site
URL and allow-list must remain separate and unchanged.

## Safe Auth implementation plan

Implementation should happen against staging and proceed in small,
reviewable steps:

1. Auth integration is gated by staging mode plus
   `VITE_SUPABASE_AUTH_ENABLED=true`. The ordinary build and current local login
   continue to work until staging tests and a separate cutover approval.
2. Student signup uses Supabase Auth, email verification, and the Auth UUID.
   The database trigger assigns the safe default `student` role; submitted
   metadata cannot choose a role.
3. Login, session restoration, auth-state changes, logout, and password
   recovery/update use Supabase Auth. The route guard role is read from the
   trusted `user_profiles` row. User-scoped query cache is cleared on sign-in
   and account changes.
4. The staging migration adds Auth-linked student/staff profile fields,
   staff invitation/approval RPCs, and server-side student verification RPCs.
   It has **not** been applied or tested against the staging database.
   Apply it after the existing Auth profile and attendance security migrations.
   Then apply
   `20261110171000_fix_confirm_camera_attendance_student_email.sql` and
   `20261110172000_scope_staff_verification_and_student_rolls.sql`. The latter
   limits verification data and decisions to students enrolled in subjects
   assigned to the signed-in staff member and scopes roll uniqueness to
   department/year/section. If duplicate roll identities already exist, the
   migration preserves them and requires review before it can create the
   optional unique index. Apply
   `20261110173000_admin_staff_subject_assignments.sql` to enable the
   administrator-only assignment list used by Staff Access.
5. In staging, a platform administrator records an invitation in **Staff
   Access**, then sends the matching invitation through the Supabase
   Authentication dashboard. After the invitee verifies their email, the
   administrator approves the matching account in AttendPro. The RPC checks
   platform-admin membership, verified email, and the pending invitation
   before assigning the staff role. Subject assignments remain governed by
   the existing administrator-controlled assignment path.
6. The initial platform administrator must be bootstrapped by the staging
   project owner in `attendpro_platform_admins`. That bootstrap and all
   migration execution are manual staging prerequisites; neither was
   performed here. No service-role key is needed in the frontend.
   First create and verify the intended administrator account through the
   staging Auth flow. Then, in the staging Dashboard SQL Editor, insert only
   that account's Auth UUID into `public.attendpro_platform_admins` using the
   owner-controlled database session. Confirm the UUID from the Auth Users
   page, verify it belongs to the intended account, and never expose the
   resulting SQL session or credentials to the browser. Do not bootstrap an
   administrator in production from this procedure.
7. Identity is Auth UUID-based. RLS and security-definer RPC checks—not
   frontend route guards—must enforce ownership and roles.

## Existing local accounts and data

Local accounts store salted PBKDF2 password hashes and device-local records.
Those hashes are not Supabase Auth credentials and must not be copied into
Auth metadata, profile tables, logs, or migration exports. Users must claim
their account by proving control of the normalized email through Supabase
verification and set a new Supabase password. Map local records to an Auth
UUID only when the email/account match is verified and unambiguous. Preserve
source records, quarantine conflicts for manual review, and use an idempotent
import plan after a separate backup and inventory approval.

Each browser profile/device has its own localStorage. Inventorying one browser
does not identify every existing account or include every user's records.
No local data is migrated or removed by this preparation.

## Current status and remaining work

- The user reports that the separate `AttendPro-Staging` project exists, but
  its project URL and anon/public key are still placeholders in
  `.env.staging.local`. Do not substitute values from `.env.local`.
- The existing Auth profile and attendance migrations plus the new
  `20261110170000_staging_auth_student_verification_and_staff_invites.sql`
  `20261110171000_fix_confirm_camera_attendance_student_email.sql`, and
  `20261110172000_scope_staff_verification_and_student_rolls.sql`, and
  `20261110173000_admin_staff_subject_assignments.sql` must be reviewed and
  applied to staging by an authorized project owner.
- The previous `confirm_camera_attendance` migration issue has been corrected
  in the source migration by declaring the normalized student email. The
  function has not been applied or runtime-tested.
- Staging Auth flows, RLS behavior, invited staff approval, attendance,
  enrollment, and cross-device behavior remain untested until project
  credentials, email delivery, migration history, and test accounts are ready.
- In Auth-enabled staging, camera attendance requires an existing open shared
  session for the selected subject. The staff RPC receives no image or face
  data; it confirms the manually selected Auth-linked student after database
  authorization. Face detection remains a local presence-only aid.
- Tasks, goals, academic activities, and general notifications still use
  existing browser-local data paths; this Auth slice does not make those
  modules cross-device.
- No production environment file or credential was read or changed. No
  production SQL, production data access, account migration, commit, push, or
  deployment was performed.
