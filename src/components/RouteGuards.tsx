import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'

import { useSession } from '@/hooks/useStudentData'
import type { UserRole } from '@/types'

function homeFor(role: UserRole): string {
  return role === 'staff' ? '/staff' : '/'
}

/** Requires any authenticated user; sends each role to its own dashboard. */
export function RequireAuth() {
  const { session, isLoading, isError, error, refetch } = useSession()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-100">
        <p className="text-sm text-slate-500">Loading AttendPro...</p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-100 px-4">
        <div role="alert" className="max-w-md rounded-2xl border border-rose-200 bg-white p-5">
          <h1 className="text-sm font-semibold text-slate-900">Could not restore your sign-in</h1>
          <p className="mt-2 text-sm text-slate-600">
            {error instanceof Error ? error.message : 'Check browser storage and try again.'}
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
          >
            Try again
          </button>
          <Link to="/login" className="ml-3 text-sm font-semibold text-indigo-600 hover:underline">
            Go to sign in
          </Link>
        </div>
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
