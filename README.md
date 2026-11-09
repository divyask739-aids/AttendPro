# AttendPro

AttendPro is an independent student–staff platform for attendance, academic
activities, tasks, reminders, goals, planning, and productivity.

## Architecture

- React 19, TypeScript, Vite, Tailwind CSS, and React Router.
- Accounts, profiles, subjects, attendance, tasks, goals, planner, and activities
  use the existing email-namespaced `localStorage` architecture. Browser-local
  data does not sync to other devices.
- Camera attendance uses local MediaPipe face detection and QR scanning. Faces
  are never recognized or matched to identities; frames are not stored or
  uploaded. Staff manually verify students and confirm attendance.
- Local authentication stores salted PBKDF2 password hashes, not plaintext
  passwords. Browser storage and client-side roles remain user-editable and are
  not secure authentication for production.
- The repository retains separate legacy Supabase sync code for cross-device
  live attendance. The local camera attendance flow does not use it.

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

Supabase is not required for account registration or camera attendance. Existing
Supabase accounts cannot be transparently converted to local accounts; accounts
and data are specific to one browser profile and device.

## Validation and deployment

```powershell
npm run typecheck
npm run build
git diff --check
```

These checks do not replace browser/device camera testing. The configured
`npm run deploy` script publishes `dist/` to GitHub Pages; run it only after
review and explicit approval.
