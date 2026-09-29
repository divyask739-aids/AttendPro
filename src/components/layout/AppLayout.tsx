import { Outlet } from 'react-router-dom'

import { BookOpenIcon, UsersIcon } from '@/components/icons'
import { useAuthMutations, useSession } from '@/hooks/useStudentData'

import { NavLinks } from './nav'

export function AppLayout() {
  const { session } = useSession()
  const { logout } = useAuthMutations()
  const role = session?.role ?? 'student'
  const isStaff = role === 'staff'

  return (
    <div className="min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-slate-800 bg-slate-900 px-4 py-6 lg:flex">
        <div className="flex items-center gap-2.5 px-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500 text-white">
            {isStaff ? <UsersIcon className="h-5 w-5" /> : <BookOpenIcon className="h-5 w-5" />}
          </span>
          <div>
            <p className="text-sm font-bold tracking-tight text-white">AttendPro</p>
            <p className="text-xs text-slate-400">
              {isStaff ? 'Faculty portal' : 'Student portal'}
            </p>
          </div>
        </div>

        <nav aria-label="Primary" className="mt-8 flex flex-1 flex-col gap-1">
          <NavLinks role={role} variant="sidebar" />
        </nav>

        <div className="border-t border-slate-800 pt-3">
          <p className="truncate px-3 text-xs text-slate-400">{session?.fullName}</p>
          <p className="truncate px-3 text-[11px] text-slate-500">{session?.email}</p>
          <button
            type="button"
            onClick={() => void logout.mutate()}
            className="mt-2 w-full rounded-xl bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-700"
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur lg:hidden">
          <p className="text-sm font-bold tracking-tight text-slate-900">
            AttendPro · {isStaff ? 'Faculty' : 'Student'}
          </p>
        </header>
        <main className="mx-auto w-full max-w-5xl px-4 pb-24 pt-6 lg:px-8 lg:pb-12 lg:pt-8">
          <Outlet />
        </main>
      </div>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-5 px-2 pb-[env(safe-area-inset-bottom)]">
          <NavLinks role={role} variant="bottom" />
        </div>
      </nav>
    </div>
  )
}

/** Guards student-only routes. */
export function StudentOnly({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = useSession()
  if (isLoading) return null
  if (!session || session.role !== 'student') return <NavigateTo role="student" />
  return <>{children}</>
}

export function StaffOnly({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = useSession()
  if (isLoading) return null
  if (!session || session.role !== 'staff') return <NavigateTo role="staff" />
  return <>{children}</>
}

function NavigateTo({ role }: { role: 'student' | 'staff' }) {
  return <Navigate to={role === 'staff' ? '/staff' : '/'} replace />
}

import { Navigate } from 'react-router-dom'
