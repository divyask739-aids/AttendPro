import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { useAuthMutations } from '@/hooks/useStudentData'
import { completeSupabaseAuthCallback } from '@/lib/supabaseAuth'

export function PasswordRecoveryPage() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const { changePassword } = useAuthMutations()

  useEffect(() => {
    let active = true
    void completeSupabaseAuthCallback()
      .then(() => {
        if (active) setReady(true)
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : 'The recovery link is invalid or expired.')
        }
      })
    return () => {
      active = false
    }
  }, [])

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    try {
      await changePassword.mutateAsync(password)
      setSuccess(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update your password.')
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-100 px-4">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-bold text-slate-900">Reset your password</h1>
        {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
        {success ? (
          <div>
            <p role="status" className="mt-3 text-sm text-emerald-700">Your password has been updated.</p>
            <Link to="/login" className="mt-5 inline-block text-sm font-semibold text-indigo-600 hover:underline">
              Return to sign in
            </Link>
          </div>
        ) : ready ? (
          <form onSubmit={onSubmit} className="mt-4 space-y-4">
            <label className="block text-xs font-medium text-slate-600">
              New password
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Confirm new password
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              />
            </label>
            <button
              type="submit"
              disabled={changePassword.isPending}
              className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              {changePassword.isPending ? 'Updating...' : 'Update password'}
            </button>
          </form>
        ) : !error ? (
          <p role="status" className="mt-3 text-sm text-slate-600">Validating your recovery link...</p>
        ) : null}
      </section>
    </main>
  )
}
