import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { completeSupabaseAuthCallback } from '@/lib/supabaseAuth'

export function AuthCallbackPage() {
  const [message, setMessage] = useState('Completing email verification...')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void completeSupabaseAuthCallback()
      .then(() => {
        if (active) setMessage('Email verified. You can now sign in to AttendPro.')
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : 'Could not verify this email link.')
        }
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-100 px-4">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-bold text-slate-900">AttendPro email verification</h1>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>
        ) : (
          <p role="status" className="mt-3 text-sm text-slate-600">{message}</p>
        )}
        <Link to="/login" className="mt-5 inline-block text-sm font-semibold text-indigo-600 hover:underline">
          Go to sign in
        </Link>
      </section>
    </main>
  )
}
