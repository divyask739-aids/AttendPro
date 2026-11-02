# Shared attendance across devices

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
| Student subject/enrollment (one row = one enrollment) | `attendance_subjects` |
| A logged class (manual or live) | `attendance_records` |
| Subjects a staff member teaches | `attendance_staff_subjects` |
| Profiles, tasks, goals, planner | Unchanged (`localStorage`) |

Enrollment is a row in `attendance_subjects`. **A check-in never creates an
enrollment.** It must match one of the student's existing subjects; otherwise the
student is told to add that subject on their Attendance page first. This keeps
"students enrolled" honest and stops one check-in from inventing a roster row.

A check-in writes **two** linked rows in one transaction:

1. `attendance_checkins` — who checked in, roll number, time (live panel).
2. `attendance_records` with `source = 'live'` and `session_id` — so the
   Attendance page, Dashboard percentages and staff roster all update.

`attendance_subjects.held` / `attended` are incremented by the same function.
The unique indexes `(session_id, student_email)` on check-ins and
`(session_id, student_email) WHERE session_id IS NOT NULL` on records make a
duplicate check-in impossible at the database level.

## 1. Create a Supabase project

1. Sign in at <https://supabase.com> and create a free project.
2. Open **Project Settings → API** and copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** key → `VITE_SUPABASE_ANON_KEY`
3. Never put the `service_role` key in the frontend or this repository.

## 2. Apply / upgrade the database schema

> **If you already ran an older version of this file, run it again.** The
> earlier version only stored live check-ins; the shared subject/record tables
> and the check-in → attendance wiring are new.

1. In Supabase, open **SQL Editor → New query**.
2. Paste the whole of [`supabase/schema.sql`](../supabase/schema.sql) and run it.
   It is safe to re-run (`create table if not exists`, `create or replace`,
   `drop function if exists` for changed signatures).
3. Confirm these tables exist under **Table Editor**:
   `attendance_sessions`, `attendance_checkins`, `attendance_subjects`,
   `attendance_records`, `attendance_staff_subjects`.
4. If Supabase reports a stale function cache, reload the page or open
   **Project Settings → API → Reload schema**.

The script enables RLS, removes all direct table access from the public `anon`
role, and exposes only validated `SECURITY DEFINER` functions. It also installs
the Realtime broadcast trigger.

## 3. Configure environment variables

Create `.env.local` in the project root (it is already git-ignored):

```bash
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY
```

Or copy `.env.example` and fill it in. These are build-time variables, so
re-run the build after changing them. Never commit `.env.local`.

## 4. Build and deploy the frontend (GitHub Pages)

```bash
npm install
npm run typecheck
npm run build
npm run deploy
```

`npm run deploy` publishes `dist/` with `gh-pages`. The Vite base path is
already `/AttendPro/`, matching `https://divyask739-aids.github.io/AttendPro/`.

For CI deployments, add the same two values as **GitHub repository secrets**
and expose them to the build step:

```yaml
env:
  VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
  VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
```

GitHub Pages cannot run backend code; Supabase hosts the database and the
Realtime service.

## 5. Making an existing account appear in the shared roster

Existing local attendance is uploaded automatically the first time an account
opens a page that reads attendance (Dashboard or Attendance). The upload only
happens when the account has no shared subjects yet, so stale device caches can
never overwrite live/manual counters.

For a subject to connect a student and a staff member, **both must use the same
subject identity**: the normalized subject code + name. The simplest rule is to
type the same subject name and code in the student's Attendance → Subjects form
and in the staff member's Profile → Subjects list.

## 6. Test with two phones (end to end)

1. On **Phone A**, register/log in as staff, add the taught subject in
   **Profile**, then open **Attendance**.
2. Pick the subject, set the duration, tap **Start session**. A 6-character code
   appears with a countdown.
3. On **Phone B**, log in as a student (register if needed). Add the **same
   subject name + code** under **Attendance → Subjects** if it is not there yet.
4. Open **Attendance → Check in to class**, enter the code and roll number, tap
   **Mark attendance**.
5. On Phone A the student appears within a few seconds (Realtime, with 4-second
   polling fallback): name, roll number, check-in time and present count. A
   green "just checked in" banner appears.
6. On Phone B, the subject now shows one more held/attended class and the
   Dashboard percentage updates. On Phone A, the dashboard "Students enrolled",
   subject performance and Students/Attendance lists include the student (15 s
   polling + broadcast).
7. Enter the same code again on Phone B → `You have already checked in for this
   session.` The percentage must **not** change.
8. Enter a wrong code → `Invalid attendance code...`
9. Close the session on Phone A, then try the code → `This attendance session
   has been closed.`
10. Refresh both phones. Sessions, check-ins, enrollments and percentages reload
    from Supabase.

## Security model

- Tables have RLS enabled and all privileges revoked from `anon` and
  `authenticated`. Direct reads/writes are impossible with the public key.
- `check_in_attendance` validates the code, the open/expired state, the
  enrollment and duplicates inside Postgres, and writes both rows atomically.
- Staff read check-ins only through `get_attendance_checkins(session_id,
  staff_email)`, which verifies the session belongs to that email.
- The staff roster is scoped server-side by `attendance_staff_subjects`, so a
  staff member only receives students enrolled in subjects they teach.
- Session creation/close and roster reads are restricted to the matching email.
- The public bundle only contains the anon key. No service-role key or database
  password is used by the frontend.

**Known limitation:** AttendPro's existing sign-in is email-based and local to
the device (there is no password check), so the RPCs use the caller's email as
identity. Anyone who knows another user's email and calls the RPC directly could
impersonate it. Direct table access is still blocked. For strict per-user
isolation, move accounts to Supabase Auth and replace the email arguments with
`auth.uid()` lookups.

## Troubleshooting

- **The live panel gets check-ins but the Dashboard still shows 0 enrolled** —
  the deployed database is still on the old schema, or the student never added
  the subject. Run the current `supabase/schema.sql`, then make sure the
  student's subject name/code matches the staff member's subject.
- **"You are not enrolled in ..."** — the student's subject identity differs
  from the session subject. Add/edit it under Attendance → Subjects so the
  code + name match, then check in again.
- **"Shared backend not configured"** — `.env.local` is missing the two
  variables, or the build ran before they were set.
- **"Could not find the function ... in the schema cache"** — re-run
  `supabase/schema.sql` and reload the API schema.
- **List updates every few seconds but not instantly** — Realtime is blocked or
  the broadcast trigger was not applied; check **Database → Publications** and
  re-run the trigger section of the schema. Polling still works.
- **Sessions disappear after redeploy** — they are in Supabase, not in the
  build; check that the deployed bundle uses the same project URL.
