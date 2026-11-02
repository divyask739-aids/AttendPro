# Live attendance across devices

AttendPro's original attendance data lives in `localStorage`, which is why a
staff phone could never see a check-in made on a student phone. Live
attendance sessions and check-ins now live in **Supabase** (Postgres +
Realtime), while every existing feature (tasks, goals, planner, profiles,
manual class logging, staff corrections) keeps working exactly as before.

## What changed

| Action | Where it is stored |
| --- | --- |
| Staff starts an attendance session (subject + code) | Supabase `attendance_sessions` |
| Student enters the code and checks in | Supabase `attendance_checkins` |
| Staff sees the live list / present count | Supabase, auto-refreshed every 4 s + Realtime broadcast |
| Profiles, subjects, tasks, goals, planner, manual attendance | Unchanged (browser `localStorage`) |

The database validates the code, the open/expired state and duplicate
check-ins. A successful message on the student's phone is only shown after
the row is committed, so staff see the same record.

## 1. Create a Supabase project

1. Sign in at <https://supabase.com> and create a free project.
2. Open **Project Settings → API** and copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** key → `VITE_SUPABASE_ANON_KEY`
3. Never put the `service_role` key in the frontend or this repository.

## 2. Apply the database schema

1. In Supabase, open **SQL Editor → New query**.
2. Paste the whole of [`supabase/schema.sql`](../supabase/schema.sql) and run it.
3. Confirm two tables appear under **Table Editor**: `attendance_sessions`
   and `attendance_checkins`.

The script enables RLS, removes all direct table access from the public
`anon` role, and exposes only validated functions. It also installs the
Realtime broadcast trigger.

## 3. Configure environment variables

Create `.env.local` in the project root (it is already git-ignored):

```bash
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY
```

Or copy `.env.example` and fill it in. These are build-time variables, so
re-run the build after changing them.

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

## 5. Test with two phones

1. On **Phone A**, register/log in as staff and open **Attendance**.
2. Pick a subject, set the duration, and tap **Start session**. A 6-character
   code appears with a countdown.
3. On **Phone B**, log in as a student (register on that device if needed) and
   open **Attendance → Check in to class**.
4. Enter the code and roll number, then tap **Mark attendance**.
5. On Phone A the student appears within a few seconds (Realtime broadcast,
   with 4-second polling as fallback): name, roll number, check-in time and
   the present count increase. A green "just checked in" banner appears.
6. Enter the same code again on Phone B → `You have already checked in for
   this session.`
7. Enter a wrong code → `Invalid attendance code...`
8. Close the session on Phone A, then try the code → `This attendance session
   has been closed.`
9. Refresh both phones. Phone A's session and check-in list reload from
   Supabase; Phone B's saved check-in still exists in the database.

## Security model

- Tables have RLS enabled and all privileges revoked from `anon`/`authenticated`.
- Students call `check_in_attendance`, which rejects invalid, closed, expired
  and duplicate check-ins inside Postgres.
- Staff read check-ins only through `get_attendance_checkins(session_id,
  staff_email)`, which verifies the session belongs to that email.
- Session creation/close are also restricted to the matching staff email.
- The public bundle only contains the anon key.
- No service-role key or database password is used by the frontend.

AttendPro's existing sign-in is email-based and local to the device, so the
database uses that email as the caller identity. For stricter multi-tenant
security later, move accounts to Supabase Auth and replace the email
arguments in the RPCs with `auth.uid()` lookups.

## Troubleshooting

- **"Shared backend not configured"** — `.env.local` is missing the two
  variables, or the build ran before they were set.
- **"Could not find the function ... in the schema cache"** — re-run
  `supabase/schema.sql` and reload the API schema (Project Settings → API).
- **List updates every 4 s but not instantly** — Realtime is blocked or the
  broadcast trigger was not applied; check **Database → Publications** and
  re-run the trigger section of the schema.
- **Sessions disappear after redeploy** — they are in Supabase, not in the
  build; check that the deployed bundle uses the same project URL.
