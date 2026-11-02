# AttendPro

AttendPro is a digital student management platform that helps students track their attendance, academic activities, tasks, and productivity in one place. It provides an easy way to monitor attendance and stay organized with daily academic goals.

## Live attendance (cross-device)

Staff can start a live attendance session for a subject and share the generated
code. Students check in from any phone; the staff list updates automatically via
Supabase Realtime (with polling fallback), and duplicate/invalid/expired codes
are rejected by the database.

Setup, security policies and two-phone test steps:
[docs/attendance-sync-setup.md](docs/attendance-sync-setup.md).

Quick start:

```bash
cp .env.example .env.local   # add your Supabase URL + anon key
# run supabase/schema.sql in the Supabase SQL editor
npm install
npm run dev
```

## Scripts

```bash
npm run dev        # local development
npm run typecheck  # TypeScript checks
npm run build      # production build
npm run preview    # preview the build
npm run deploy     # publish dist/ to GitHub Pages
```
