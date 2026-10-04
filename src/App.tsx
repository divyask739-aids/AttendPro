import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { AppLayout } from '@/components/layout/AppLayout'
import { RequireAuth, RequireRole } from '@/components/RouteGuards'
import { useSession } from '@/hooks/useStudentData'
import { AttendancePage } from '@/pages/AttendancePage'
import { DashboardPage } from '@/pages/DashboardPage'
import { GoalsPage } from '@/pages/GoalsPage'
import { LoginPage } from '@/pages/LoginPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { PlannerPage } from '@/pages/PlannerPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { RoleHome } from '@/pages/RoleHome'
import { TasksPage } from '@/pages/TasksPage'
import {
  StaffActivitiesPage,
  StaffAttendancePage,
  StaffDashboardPage,
  StaffStudentsPage,
  StaffSubjectsPage,
} from '@/pages/staff/StaffPages'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, retry: 1 },
  },
})

/** Passes the signed-in email down so every page reads the right account. */
function Scoped({ children }: { children: (email: string) => React.ReactNode }) {
  const { session } = useSession()
  if (!session) return null
  return <>{children(session.email)}</>
}

function ProfileRoute() {
  const { session } = useSession()
  if (!session) return null
  return <ProfilePage email={session.email} role={session.role} />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename="/AttendPro">
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<RequireAuth />}>
            {/* ---------------- student portal ---------------- */}
            <Route
              element={
                <RequireRole role="student">
                  <AppLayout />
                </RequireRole>
              }
            >
              <Route
                index
                element={
                  <Scoped>{(email) => <DashboardPage email={email} />}</Scoped>
                }
              />
              <Route
                path="attendance"
                element={
                  <Scoped>{(email) => <AttendancePage email={email} />}</Scoped>
                }
              />
              <Route
                path="tasks"
                element={<Scoped>{(email) => <TasksPage email={email} />}</Scoped>}
              />
              <Route
                path="goals"
                element={<Scoped>{(email) => <GoalsPage email={email} />}</Scoped>}
              />
              <Route
                path="planner"
                element={<Scoped>{(email) => <PlannerPage email={email} />}</Scoped>}
              />
            </Route>

            {/* ----------------- staff portal ----------------- */}
            <Route
              element={
                <RequireRole role="staff">
                  <AppLayout />
                </RequireRole>
              }
            >
              <Route
                path="staff"
                element={
                  <Scoped>{(email) => <StaffDashboardPage email={email} />}</Scoped>
                }
              />
              <Route
                path="staff/subjects"
                element={<Scoped>{(e) => <StaffSubjectsPage email={e} />}</Scoped>}
              />
              <Route
                path="staff/students"
                element={<Scoped>{(e) => <StaffStudentsPage email={e} />}</Scoped>}
              />
              <Route
                path="staff/attendance"
                element={<Scoped>{(e) => <StaffAttendancePage email={e} />}</Scoped>}
              />
              <Route
                path="staff/activities"
                element={
                  <Scoped>{(email) => <StaffActivitiesPage email={email} />}</Scoped>
                }
              />
            </Route>

            {/* ------------------ shared ------------------ */}
            <Route path="profile" element={<ProfileRoute />} />
          </Route>

          <Route path="/dashboard" element={<RoleHome />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}