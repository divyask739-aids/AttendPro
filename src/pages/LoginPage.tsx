
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { BookOpenIcon, UsersIcon } from '@/components/icons'
import { useAuthMutations } from '@/hooks/useStudentData'
import { fetchStudentProfile } from '@/lib/dataApi'
import { isSupabaseAuthEnabled } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { UserRole } from '@/types'

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100'

const labelClass = 'mb-1 block text-xs font-medium text-slate-600'

export function LoginPage() {
  const [role, setRole] = useState<UserRole>('student')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [rollNumber, setRollNumber] = useState('')
  const [department, setDepartment] = useState('')
  const [year, setYear] = useState('')
  const [section, setSection] = useState('')
  const [designation, setDesignation] = useState('')
  const [formError, setFormError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const { register, login, logout, resetPassword } = useAuthMutations()
  const navigate = useNavigate()

  const destination = (userRole: UserRole) =>
    userRole === 'staff' ? '/staff' : '/'

  const onLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError('')
    setSuccessMessage('')

    try {
      const session = await login.mutateAsync({
        email: email.trim(),
        password,
      })

      if (session.role !== role) {
        await logout.mutateAsync()
        throw new Error(
          `This account is registered as ${session.role}. Please select ${session.role} to log in.`,
        )
      }

      if (session.role === 'student') {
        const profile = await fetchStudentProfile(session.email)
        const nextPage =
          (profile.verificationStatus ?? 'not_submitted') === 'not_submitted'
            ? '/verification'
            : destination(session.role)
        navigate(nextPage, { replace: true })
      } else {
        navigate(destination(session.role), { replace: true })
      }
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'Unable to sign in.',
      )
    }
  }

  const onRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError('')
    setSuccessMessage('')

    if (fullName.trim().length < 2) {
      setFormError('Please enter your full name.')
      return
    }

    const minimumPasswordLength = isSupabaseAuthEnabled ? 8 : 6
    if (password.length < minimumPasswordLength) {
      setFormError(`Password must contain at least ${minimumPasswordLength} characters.`)
      return
    }
    if (password !== confirmPassword) {
      setFormError('Passwords do not match.')
      return
    }

    if (role === 'student' && [rollNumber, department, year, section].some((value) => !value.trim())) {
      setFormError('Enter your roll number, department, year, and section.')
      return
    }
    if (role === 'staff' && (!department.trim() || !designation.trim())) {
      setFormError('Enter your department and staff designation.')
      return
    }

    try {
      await register.mutateAsync({
        email: email.trim(),
        fullName: fullName.trim(),
        password,
        role,
        rollNumber: role === 'student' ? rollNumber.trim() : undefined,
        department: department.trim(),
        year: role === 'student' ? year.trim() : undefined,
        section: role === 'student' ? section.trim() : undefined,
        designation: role === 'staff' ? designation.trim() : undefined,
      })
      setPassword('')
      setConfirmPassword('')
      setMode('login')
      setSuccessMessage(
        isSupabaseAuthEnabled
          ? 'Account created. Check your email and verify the address before signing in.'
          : 'Account created. Log in with your email and password to continue.',
      )
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'Unable to create account.',
      )
    }
  }

  const onForgotPassword = async () => {
    setSuccessMessage('')
    setFormError('')
    try {
      await resetPassword.mutateAsync(email.trim())
      setSuccessMessage(
        'If an account exists for this address, password recovery instructions will be sent to its email.',
      )
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not request password recovery.')
    }
  }

  const busy =
    login.isPending ||
    register.isPending ||
    logout.isPending ||
    resetPassword.isPending

  return (
    <div className="flex min-h-dvh flex-col bg-slate-100">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 text-white">
            <BookOpenIcon className="h-6 w-6" />
          </span>

          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              AttendPro
            </h1>
            <p className="text-xs text-slate-500">
              Attendance + productivity + adaptive planning
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">
            Welcome to AttendPro
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Select your account type to continue.
          </p>
          {/* Student / Staff selection */}
          <div className="mt-5 grid grid-cols-2 gap-2">
            {(['student', 'staff'] as UserRole[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setRole(option)
                  setFormError('')
                  setSuccessMessage('')
                }}
                aria-pressed={role === option}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold transition-colors',
                  role === option
                    ? 'bg-indigo-600 text-white'
                    : 'border border-slate-200 bg-white text-slate-600 hover:border-indigo-300',
                )}
              >
                {option === 'student' ? (
                  <BookOpenIcon className="h-4 w-4" />
                ) : (
                  <UsersIcon className="h-4 w-4" />
                )}
                {option === 'student' ? 'Student' : 'Staff'}
              </button>
            ))}
          </div>

          {/* Login / Create account */}
          <div className="mt-4 flex gap-1 rounded-xl bg-slate-100 p-1">
            {(['login', 'register'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setMode(option)
                  setFormError('')
                  setSuccessMessage('')
                }}
                className={cn(
                  'flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors',
                  mode === option
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500',
                )}
              >
                {option === 'login' ? 'Log in' : 'Create account'}
              </button>
            ))}
          </div>

          {formError && (
            <p
              role="alert"
              className="mt-4 rounded-xl bg-rose-50 px-3 py-3 text-xs text-rose-600"
            >
              {formError}
            </p>
          )}

          {successMessage && (
            <p
              role="status"
              className="mt-4 rounded-xl bg-emerald-50 px-3 py-3 text-xs text-emerald-700"
            >
              {successMessage}
            </p>
          )}

          {mode === 'login' ? (
            <form onSubmit={onLogin} className="mt-5 space-y-4">
              <div>
                <label htmlFor="login-email" className={labelClass}>
                  Email address
                </label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="login-password" className={labelClass}>
                  Password
                </label>
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  className={inputClass}
                />
              </div>

              <div className="text-right">
                <button
                  type="button"
                  onClick={onForgotPassword}
                  disabled={busy}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-700 disabled:opacity-60"
              >
                {login.isPending
                  ? 'Signing in...'
                  : `Log in as ${role}`}
              </button>
            </form>
          ) : isSupabaseAuthEnabled && role === 'staff' ? (
            <p role="status" className="mt-5 rounded-xl bg-indigo-50 px-3 py-3 text-sm text-indigo-800">
              Staff accounts are created by an AttendPro administrator. Use the invitation sent to your verified email address.
            </p>
          ) : (
            <form onSubmit={onRegister} className="mt-5 space-y-4">
              <div>
                <label htmlFor="register-name" className={labelClass}>
                  Full name
                </label>
                <input
                  id="register-name"
                  type="text"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={80}
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Enter your full name"
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="register-email" className={labelClass}>
                  Email address
                </label>
                <input
                  id="register-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="register-password" className={labelClass}>
                  Create password
                </label>
                <input
                  id="register-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={isSupabaseAuthEnabled ? 8 : 6}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={`Minimum ${isSupabaseAuthEnabled ? 8 : 6} characters`}
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="register-confirm-password" className={labelClass}>
                  Confirm password
                </label>
                <input
                  id="register-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Re-enter your password"
                  className={inputClass}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="register-department" className={labelClass}>
                    Department
                  </label>
                  <input
                    id="register-department"
                    type="text"
                    autoComplete="organization-title"
                    required
                    maxLength={80}
                    value={department}
                    onChange={(event) => setDepartment(event.target.value)}
                    className={inputClass}
                  />
                </div>
                {role === 'student' ? (
                  <>
                    <div>
                      <label htmlFor="register-roll-number" className={labelClass}>
                        Roll number
                      </label>
                      <input
                        id="register-roll-number"
                        type="text"
                        required
                        maxLength={32}
                        value={rollNumber}
                        onChange={(event) => setRollNumber(event.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label htmlFor="register-year" className={labelClass}>
                        Year
                      </label>
                      <input
                        id="register-year"
                        type="text"
                        required
                        maxLength={24}
                        value={year}
                        onChange={(event) => setYear(event.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label htmlFor="register-section" className={labelClass}>
                        Section
                      </label>
                      <input
                        id="register-section"
                        type="text"
                        required
                        maxLength={24}
                        value={section}
                        onChange={(event) => setSection(event.target.value)}
                        className={inputClass}
                      />
                    </div>
                  </>
                ) : (
                  <div>
                    <label htmlFor="register-designation" className={labelClass}>
                      Staff designation
                    </label>
                    <input
                      id="register-designation"
                      type="text"
                      required
                      maxLength={80}
                      value={designation}
                      onChange={(event) => setDesignation(event.target.value)}
                      className={inputClass}
                    />
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-60"
              >
                {register.isPending
                  ? 'Creating account...'
                  : `Create ${role} account`}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
