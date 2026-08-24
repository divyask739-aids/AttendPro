Here’s a ready-to-use **AGENTS.md** for your AttendPro project (React tech stack) with OpenCode:

```markdown
# AttendPro — Project Guidelines for OpenCode

AttendPro is a digital student management platform that helps students track attendance, academic activities, tasks, and productivity in one place. It provides an easy way to monitor attendance and stay organized with daily academic goals.

## Tech Stack

- **Frontend**: React (preferably with TypeScript)
- **Build tool**: Vite (recommended) or Create React App
- **Styling**: Tailwind CSS (preferred) or CSS Modules
- **State management**: React Context + useReducer, or Zustand / Redux Toolkit if needed
- **Routing**: React Router
- **Data fetching**: React Query (TanStack Query) or native fetch/axios
- **Forms**: React Hook Form + Zod (or similar validation)
- **Charts / visualizations**: Recharts or Chart.js (for attendance trends, productivity stats)
- **Backend** (if present): Node.js / Express or Firebase / Supabase (document the actual choice once decided)
- **Auth**: Firebase Auth, Clerk, or custom JWT (specify when implemented)

## Project Structure (recommended)

```
attendpro/
├── public/
├── src/
│   ├── assets/
│   ├── components/          # Reusable UI components
│   ├── features/            # Feature-based folders (attendance, tasks, goals, dashboard)
│   │   ├── attendance/
│   │   ├── tasks/
│   │   ├── productivity/
│   │   └── auth/
│   ├── hooks/               # Custom React hooks
│   ├── lib/                 # Utilities, API clients, helpers
│   ├── pages/               # Route-level pages
│   ├── store/               # Global state (if needed)
│   ├── types/               # TypeScript types/interfaces
│   ├── App.tsx
│   └── main.tsx
├── package.json
└── AGENTS.md
```

Prefer feature-based organization over purely technical folders.

## Core Features to Keep in Mind

1. **Attendance Tracking**
   - Mark / view daily or per-class attendance
   - Attendance percentage calculation
   - Calendar or list views
   - Alerts for low attendance

2. **Academic Activities & Tasks**
   - Task / assignment list with due dates
   - Status (todo / in-progress / done)
   - Priority levels
   - Filtering and sorting

3. **Productivity & Daily Goals**
   - Daily goal setting
   - Progress tracking
   - Simple analytics (streaks, completion rate)

4. **Dashboard**
   - Overview of attendance %, upcoming tasks, goal progress
   - Clean, student-friendly UI

## Coding Conventions

- Use functional components and hooks only (no class components).
- Prefer TypeScript with strict mode. Avoid `any`.
- Keep components small and focused. Extract logic into custom hooks.
- Use meaningful names: `AttendanceCard`, `useAttendanceStats`, `TaskList`.
- Prefer named exports for components and utilities.
- Use absolute imports with path aliases (`@/components/...`) when configured.
- Handle loading, error, and empty states explicitly.
- Make the UI responsive and accessible (semantic HTML, ARIA where needed).
- Do not hardcode sensitive values; use environment variables.

## Commands (update after scaffolding)

```bash
# Install
npm install          # or pnpm / yarn / bun

# Development
npm run dev

# Build
npm run build

# Lint / type-check
npm run lint
npm run typecheck    # if available

# Test
npm run test
```

Always run lint + type-check (and tests if they exist) before considering a task complete.

## Development Workflow for Agents

1. Understand the current feature or bug before writing code.
2. Prefer small, incremental changes over large refactors.
3. Reuse existing components and hooks when possible.
4. After making changes:
   - Ensure the app still builds and runs.
   - Check for TypeScript errors.
   - Verify UI responsiveness on mobile and desktop.
5. Keep the student-facing experience simple, clear, and motivating.
6. When adding new features, update types and any shared constants.

## UI / UX Guidelines

- Clean, modern, and calm design suitable for students.
- Clear visual hierarchy (attendance status should be easy to scan).
- Use consistent spacing, colors, and typography.
- Provide helpful empty states and guidance for new users.
- Prefer optimistic UI updates where appropriate (with proper error handling).

## What to Avoid

- Over-engineering early (no complex state libraries until needed).
- Large monolithic components.
- Ignoring mobile view.
- Storing sensitive data in localStorage without encryption considerations.
- Breaking existing features while adding new ones.

## Notes for Future Sessions

- Once the exact backend, auth provider, and package manager are chosen, update this file.
- Add any project-specific scripts, environment variable names, and folder conventions here.
- Keep this file concise and actionable so every OpenCode session has the same context.
```