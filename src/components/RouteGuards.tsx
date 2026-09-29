import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useSession } from '@/hooks/useStudentData'
import type { UserRole } from '@/types'

function homeFor(role: UserRole): string {
  return role === 'staff' ? '/staff' : '/'
}

/** Requires any authenticated user; sends each role to its own dashboard. */
export function RequireAuth() {
  const { session, isLoading } = useSession()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-100">
        <p className="text-sm text-slate-500">Loading AttendPro...</p>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}

/** Blocks a role from the other portal. */
export function RequireRole({ role, children }: { role: UserRole; children: React.ReactNode }) {
  const { session } = useSession()

  if (!session) {
    return <Navigate to="/login" replace />
  }

  if (session.role !== role) {
    return <Navigate to={homeFor(session.role)} replace />
  }

  return <>{children}</>
}
