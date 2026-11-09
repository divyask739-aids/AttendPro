# Shared attendance across devices

> This guide describes the separate legacy Supabase-backed live attendance
> implementation. The staff camera/QR workflow uses local AttendPro dataApi and
> browser storage instead; it does not depend on these setup steps. See
> [camera attendance and student verification](./camera-attendance.md).

AttendPro's original attendance data lived only in `localStorage`, which is why
a staff phone could never see a check-in made on a student phone, and why every
device showed its own "0 students enrolled".

Attendance now uses **one shared model in Supabase** (Postgres + Realtime). The
existing `Subject` + `AttendanceRecord` types are still the source of truth for
the Attendance page and both dashboards; they are just stored in the database
instead of per-browser storage. `localStorage` remains a cache/fallback.

## What is stored where

| Action | Table |
| --- | --- |
| Staff starts a session (subject + code) | `attendance_sessions` |
| Student enters a code | `attendance_checkins` |
| Student subject claim | `attendance_subjects` |
| Pending/approved enrollment | `attendpro_student_enrollments` |
| A logged class (manual or live) | `attendance_records` |
| Legacy staff subject cache | `attendance_staff_subjects` |
| Trusted staff assignments | `attendpro_staff_subject_assignments` |
| Student-facing attendance updates | `attendance_notifications` |
| Profiles, tasks, goals, planner | Unchanged (`localStorage`) |

`attendance_subjects` stores the student's subject claim; the
`attendpro_student_enrollments` relation tracks pending/approved enrollment.
A valid code creates a pending claim only for a verified student and a session
backed by an administrator-approved staff assignment. The code check-in does
not create official attendance. Staff must verify the student, for example in
the camera roster, to approve enrollment and record official attendance.
The camera uses MediaPipe to draw face boxes and show a count only. It does not
recognize people, match faces to accounts, create biometric templates, or save
or transmit camera frames. The roster and staff member's manual decision are
the only attendance confirmation path.

A successful code check-in creates or reuses the student's subject claim,
creates a pending enrollment, and writes linked check-in/history rows in one
transaction:

1. `attendance_subjects` / `attendpro_student_enrollments` — the pending claim.
2. `attendance_records` — a `personal` (unverified) record.
3. `attendance_checkins` — the code submission and its timestamp.

The database starts from the legacy RPC which writes a `live` row, then the
authenticated wrapper changes its provenance to `personal` in the same
transaction. This is not official attendance.

Staff confirmation writes the same shared attendance model with
`source = 'staff_confirmed'`. Student-entered, local-imported, and old live
records remain visible to the student with provenance labels but are excluded
from staff official totals. Staff counter corrections require a reason and are
stored as append-only audit events.

The existing code-check-in RPC increments `attendance_subjects.held` /
`attended`; confirming an already-created check-in promotes its record without
incrementing those counts a second time. New staff-confirmed records increment
the totals once. The bootstrap includes email-keyed unique constraints. The
UUID-keyed session indexes are created only when the migration finds no
historical duplicates; ambiguous duplicate groups are preserved in review
tables and their affected attendance operations fail closed until reviewed.

## 1. Create a Supabase project

1. Sign in at <https://supabase.com> and create a free project.
2. Open **Project Settings → API** and copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** key → `VITE_SUPABASE_ANON_KEY`
3. Never put the `service_role` key in the frontend or this repository.

## 2. Apply the database schema and migrations

The base schema is only a bootstrap. It revokes RPC execution until the
authentication and authorization migrations are applied. Do not rerun it after
the hardening migrations; it is not an upgrade or rollback script.

1. Determine whether the project has the exact legacy attendance tables and
   RPC signatures expected by these migrations. Do not guess from table names;
   this repository has not been validated against your live database.
2. On a disposable Supabase project, apply
   [`supabase/schema.sql`](../supabase/schema.sql) once only if the legacy
   attendance schema/functions are absent. If the database already contains
   attendance data, back it up and compare its schema/functions before doing
   anything; `CREATE TABLE IF NOT EXISTS` does not upgrade legacy table shapes.
3. Apply the versioned migrations in timestamp order:
   [`20261106211500_auth_user_profiles.sql`](../supabase/migrations/20261106211500_auth_user_profiles.sql),
   [`20261106213000_secure_attendance_and_notifications.sql`](../supabase/migrations/20261106213000_secure_attendance_and_notifications.sql),
   then
   [`20261106213400_attendance_integrity_and_identity.sql`](../supabase/migrations/20261106213400_attendance_integrity_and_identity.sql).
   Do not run these in production without explicit approval.
4. Confirm the attendance, `user_profiles`, and `attendance_notifications`
   tables exist. In **Authentication → Providers**, enable email/password and
   require email confirmation. Configure the Site URL and redirect allowlist
   using [the Auth setup guide](./supabase-auth-setup.md).
5. Bootstrap the platform owner and verify staff assignments as described in
   the Auth guide. Resolve identity/duplicate review rows before enabling
   affected users.
6. Add the build-time variables below. Keep
   `VITE_SUPABASE_AUTH_ENABLED=false` until every migration, platform
   administrator, reviewed staff assignment, email verification, and redirect
   setting has been configured and tested in a non-production project.

The security migrations grant only authenticated, role-checked RPCs. They
install an opaque Realtime refresh signal (no student names/emails are
broadcast) and deduplicated private notifications.

## 3. Configure environment variables

Create `.env.local` in the project root (it is already git-ignored):

```bash
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY
VITE_SUPABASE_AUTH_ENABLED=false
```

Or copy `.env.example` and fill it in. The anon key is public; never use a
service-role key here. These are build-time variables, so
re-run the build after changing them. Never commit `.env.local`.

## 4. Build and deploy the frontend (GitHub Pages)

```bash
npm run typecheck
npm run build
# Only after approval:
npm run deploy
```

`npm run deploy` publishes `dist/` with `gh-pages`. The Vite base path is
already `/AttendPro/`, matching `https://divyask739-aids.github.io/AttendPro/`.
The repository currently has no GitHub Actions deployment workflow; the npm
script is a local deployment path and must not be run without approval.

The Supabase URL and public anon key must exist at build time. Keep
`VITE_SUPABASE_AUTH_ENABLED=false` in local/deployment environments until the
disposable-project tests and external settings below are approved. GitHub Pages
is static hosting and cannot protect build-time variables; never place a
service-role key in the bundle.

For CI deployments, add the same two values as **GitHub repository secrets**
and expose them to the build step:

```yaml
env:
  VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
  VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
  VITE_SUPABASE_AUTH_ENABLED: ${{ vars.VITE_SUPABASE_AUTH_ENABLED }}
```

GitHub Pages cannot run backend code; Supabase hosts the database and the
Realtime service.

## 5. Making an existing account appear in the shared roster

Existing local attendance is uploaded automatically the first time an account
opens a page that reads attendance (Dashboard or Attendance). The upload only
happens when the account has no shared subjects yet, so stale device caches can
never overwrite live/manual counters.

For a subject to connect a student and staff member, they must use the same
exact normalized subject identity, and the platform owner must approve that
subject assignment for the staff account. Student claims are pending until
staff confirms enrollment.

Existing local attendance is still uploaded automatically the first time an
account opens a page that reads attendance (Dashboard or Attendance). The upload
only happens when the account has no shared subjects yet, so stale device caches
can never overwrite live/manual counters.

## 6. Test with two phones (end to end)

1. On **Phone A**, invite/promote a staff account and have the platform owner
   provision its subject assignment, then open **Attendance**.
2. Pick the subject, set the duration, and tap **Start session**. A 6-character
    code appears with a countdown.
3. On **Phone B**, register/verify and log in as a student. In **Attendance →
    Check in to class**, enter the code and roll number once, then tap **Mark
    attendance**. This creates a pending enrollment and personal check-in.
4. Phone B shows the result and the subject appears in the student's
    attendance subjects as pending/unverified.
5. On Phone A the student appears within a few seconds (Realtime, with 4-second
    polling fallback): name, roll number, check-in time and present count. A
    green "just checked in" banner appears.
6. Staff manually verifies the student in the camera-assisted roster and
    confirms attendance. That writes one official record and one notification;
    the student history labels it "Official · staff confirmed".
7. Repeat with a second student account on a third phone. Phone A's "Students
    enrolled" count goes 1 → 2 and both students are listed.
8. Enter the same code again on Phone B → `You have already checked in for this
    session.` The official count must **not** change.
9. Enter a wrong code → `Invalid attendance code...` No enrollment is created.
10. Close the session on Phone A, then try the code → `This attendance session
    has been closed.`
11. Refresh both phones, sign out and back in, or repeat on a new device.
    Sessions, check-ins, enrollments and percentages reload from Supabase.

## Recovery and migration validation

These are one-way schema changes; there is no tested down-migration. Before
running them, take a complete Supabase backup and verify that it can be restored
to a separate project. The migration retains original email values in
`legacy_*_email` snapshot columns, records missing/ambiguous identity matches,
and does not delete or merge historical rows. If execution fails or results
need reversal, stop and restore the pre-migration backup to a separate project;
do not rerun `schema.sql` or hand-edit production rows as a rollback.

Migration execution and representative legacy-data tests have not been
performed in this repository environment. Validate the entire sequence in a
disposable project before considering production approval.

## Security model

- Attendance tables have RLS enabled and direct table privileges revoked.
  RPC execution is granted only to `authenticated` after the security
  migration; anonymous RPC calls are denied.
- `check_in_attendance` validates the code, open/expired state, role, verified
  Auth identity, capacity, and duplicates. It creates a pending enrollment and
  a personal check-in, not official attendance.
- Student operations derive identity from `auth.uid()` and cannot target
  another account by changing the email RPC argument.
- Staff check-in reads validate staff role and session ownership. Roster,
  session, and correction operations use platform-admin-approved assignments,
  never the staff-editable legacy subject list.
- Camera attendance uses a separate RPC that validates the staff role, open
  session, subject assignment, and target student's verified account.
- Notifications are unique per student/session and only the recipient can read
  or mark them as read.
- The public bundle only contains the anon key. No service-role key or database
  password is used by the frontend.
- Realtime broadcasts contain only a session identifier for cache invalidation,
  not names, emails, or roll numbers.

**Authorization requirement:** Applying `supabase/schema.sql` alone does not
provide trusted per-user authorization. Before enabling the Auth frontend, apply
all ordered migrations in `supabase/migrations/`. They derive identity and role
from verified Auth sessions, provision staff subjects through platform
administrators, and separate personal from staff-confirmed attendance. Do not
treat frontend role guards as database authorization, and do not rerun the
bootstrap schema after the migrations without reapplying the migrations.

## Troubleshooting

- **The staff dashboard still shows 0 students** — verify the student joined
  with a current class code and that the staff subject is
  mirrored. Check database errors and confirm the ordered migrations were
  applied.
- **"Could not load your students"** — the shared roster query failed (offline,
  paused project or schema not applied). The app no longer shows a misleading
  "0 Students" when the shared read fails; fix the connection and refresh.
- **"Invalid attendance code"** — the code was mistyped, has expired, or belongs
  to a closed session. Ask the staff member for the current code.
- **"Shared backend not configured"** — `.env.local` is missing the two
  variables, or the build ran before they were set.
- **"Could not find the function ... in the schema cache"** — verify that the
  ordered migrations were applied, then reload the API schema. Do not rerun
  `supabase/schema.sql` after the hardening migration.
- **List updates every few seconds but not instantly** — Realtime is blocked or
  the broadcast trigger was not applied; check **Database → Publications**.
  Polling still works. Do not rerun the bootstrap schema after hardening.
- **Sessions disappear after redeploy** — they are in Supabase, not in the
  build; check that the deployed bundle uses the same project URL.

## Known limitations and readiness

- Tasks, reminders, Goals, Planner, Activities, and profile fields remain
  browser-local; they are not synchronized across devices or protected by
  server-side authorization.
- Student attendance totals may include personal/imported entries; only
  `staff_confirmed` records are counted in the staff's official roster totals.
- Session codes are shareable bearer codes, not identity proof. Staff must
  verify students manually. Face detection is not face recognition.
- SQL execution and authenticated browser/device tests remain outstanding.
  Keep Auth disabled and do not deploy this checkout as a completed migration
  until the migration chain is validated in a disposable Supabase project.
