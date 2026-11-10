# AttendPro

AttendPro is an independent student–staff platform for attendance, academic
activities, tasks, reminders, goals, planning, and productivity.

## Architecture

- React 19, TypeScript, Vite, Tailwind CSS, and React Router.
- The default application keeps its existing email-namespaced accounts and
  data in `localStorage`; browser-local data does not sync to other devices.
  Staging can opt into Supabase Auth for accounts and profiles, while several
  modules remain browser-local pending their shared-data migration.
- Student verification and staff camera attendance use local MediaPipe face
  detection as a visual presence aid only. Faces are never recognized or matched
  to identities; frames are not stored or uploaded. Staff manually identify
  students from the verified roster and confirm attendance.
- Default local authentication stores salted PBKDF2 hashes, not plaintext
  passwords. Browser storage and client-side roles remain user-editable and are
  not production-secure. Staging-only Supabase Auth is enabled separately and
  requires its own project configuration and reviewed database migration.
- The default local camera attendance flow writes to this browser only.
  Staging Auth uses shared attendance sessions and the staff-confirmation RPC
  for camera-assisted attendance; it does not recognize faces.

## Development

Install the existing dependencies, then run the app:

```powershell
npm install
npm run dev
```

The Vite base path is `/AttendPro/` for the GitHub Pages site. `public/404.html`
provides a SPA fallback for deep links. Camera access requires HTTPS or
localhost. For camera details and local limitations, see
[Camera attendance and local account limitations](docs/camera-attendance.md).

## Setup and operations

- [Legacy shared attendance setup](docs/attendance-sync-setup.md)
- [Supabase Auth staging setup](docs/supabase-staging-auth-setup.md)

The default local login and camera attendance do not require Supabase. Staging Auth does not convert or migrate existing local accounts or records.
Legacy accounts and records remain untouched; attendance and profiles in
staging use the shared database, while tasks, goals, academic activities, and
general notifications remain browser-local.

## Validation and deployment

```powershell
npm run typecheck
npm run build
git diff --check
```

These checks do not replace browser/device camera testing. The configured
`npm run deploy` script publishes `dist/` to GitHub Pages; run it only after
review and explicit approval.
