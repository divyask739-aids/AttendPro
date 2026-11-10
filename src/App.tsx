import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { useEffect } from 'react'

import { AppLayout } from '@/components/layout/AppLayout'
import { RequireAuth, RequireRole } from '@/components/RouteGuards'
import { useSession } from '@/hooks/useStudentData'
import { isSupabaseAuthEnabled, supabase } from '@/lib/supabase'
import { AuthCallbackPage } from '@/pages/AuthCallbackPage'
import { AttendancePage } from '@/pages/AttendancePage'
import { DashboardPage } from '@/pages/DashboardPage'
import { GoalsPage } from '@/pages/GoalsPage'
import { LoginPage } from '@/pages/LoginPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { PasswordRecoveryPage } from '@/pages/PasswordRecoveryPage'
import { PlannerPage } from '@/pages/PlannerPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { RoleHome } from '@/pages/RoleHome'
import { StudentVerificationPage } from '@/pages/StudentVerificationPage'
import { TasksPage } from '@/pages/TasksPage'
import {
  StaffActivitiesPage,
  StaffAttendancePage,
  StaffDashboardPage,
  StaffStudentsPage,
  StaffSubjectsPage,
} from '@/pages/staff/StaffPages'
import { StaffAccessPage } from '@/pages/staff/StaffAccessPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, retry: 1 },
  },
})

function AuthSessionSync() {
  const client = useQueryClient()

  useEffect(() => {
    if (!isSupabaseAuthEnabled || !supabase) return

    let previousUserId: string | null = null
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const currentUserId = session?.user.id ?? null
      if (event === 'SIGNED_IN' || (previousUserId && currentUserId !== previousUserId)) {
        client.clear()
      }
      previousUserId = currentUserId
      void client.invalidateQueries({ queryKey: ['session'] })
    })

    return () => data.subscription.unsubscribe()
  }, [client])

  return null
}

/** Passes the signed-in email down so every page reads the right account. */
function Scoped({ children }: { children: (email: string) => React.ReactNode }) {
  const { session } = useSession()
  if (!session) return null
  return <>{children(session.email)}</>
}

function ProfileRoute() {
  const { session } = useSession()
  const location = useLocation()
  if (!session) return null
  return (
    <div key={location.pathname} className="page-enter">
      <ProfilePage email={session.email} role={session.role} />
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthSessionSync />
      <BrowserRouter basename="/AttendPro">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/auth/reset-password" element={<PasswordRecoveryPage />} />

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
              <Route
                path="verification"
                element={<Scoped>{(email) => <StudentVerificationPage email={email} />}</Scoped>}
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
              <Route path="staff/access" element={<StaffAccessPage />} />
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