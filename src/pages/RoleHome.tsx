import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuthMutations, useSession } from '@/hooks/useStudentData'

/** Sends each role to its own dashboard. */
export function RoleHome() {
  const { session, isLoading } = useSession()
  const navigate = useNavigate()

  useEffect(() => {
    if (isLoading) return
    if (!session) {
      navigate('/login', { replace: true })
      return
    }
    navigate(session.role === 'staff' ? '/staff' : '/', { replace: true })
  }, [session, isLoading, navigate])

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-100">
      <p className="text-sm text-slate-500">Loading your dashboard...</p>
    </div>
  )
}

export { useAuthMutations }
