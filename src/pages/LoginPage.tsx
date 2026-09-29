import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { BookOpenIcon, UsersIcon } from '@/components/icons'
import { useAuthMutations } from '@/hooks/useStudentData'
import { cn } from '@/lib/utils'
import type { UserRole } from '@/types'

const schema = z
  .object({
    fullName: z.string().min(2, 'Enter your full name').max(80),
    email: z.string().email('Enter a valid email'),
    studentId: z.string().max(30).optional(),
    staffId: z.string().max(30).optional(),
  })
  .refine((values) => values.fullName.trim().length > 0, {
    message: 'Name is required',
    path: ['fullName'],
  })

type FormValues = z.infer<typeof schema>

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100'
const labelClass = 'mb-1 block text-xs font-medium text-slate-600'
const errorClass = 'mt-1 text-xs text-rose-600'

export function LoginPage() {
  const [role, setRole] = useState<UserRole>('student')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const { register, login } = useAuthMutations()
  const navigate = useNavigate()

  const {
    register: formRegister,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema) as unknown as import('react-hook-form').Resolver<FormValues>,
    defaultValues: { fullName: '', email: '', studentId: '', staffId: '' },
  })

  const destination = role === 'staff' ? '/staff' : '/'

  const onLogin = async (event: React.FormEvent) => {
    event.preventDefault()
    setFormError(null)
    try {
      await login.mutateAsync({ email, role })
      navigate(destination, { replace: true })
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Login failed')
    }
  }

  const onRegister = handleSubmit(async (values) => {
    setFormError(null)
    try {
      await register.mutateAsync({
        email: values.email,
        fullName: values.fullName,
        role,
        studentId: values.studentId,
        staffId: values.staffId,
      })
      navigate(role === 'staff' ? '/profile' : '/profile', { replace: true })
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Registration failed')
    }
  })

  return (
    <div className="flex min-h-dvh flex-col bg-slate-100">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 text-white">
            <BookOpenIcon className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">AttendPro</h1>
            <p className="text-xs text-slate-500">
              Attendance + productivity + adaptive planning
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid grid-cols-2 gap-2">
            {(['student', 'staff'] as UserRole[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setRole(option)
                  setFormError(null)
                }}
                aria-pressed={role === option}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors',
                  role === option
                    ? 'bg-indigo-600 text-white'
                    : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300',
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

          <div className="mt-4 flex gap-1 rounded-xl bg-slate-100 p-1">
            {(['login', 'register'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setMode(option)
                  setFormError(null)
                }}
                className={cn(
                  'flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                  mode === option ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500',
                )}
              >
                {option === 'login' ? 'Log in' : 'Create account'}
              </button>
            ))}
          </div>

          {formError && (
            <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600">
              {formError}
            </p>
          )}

          {mode === 'login' ? (
            <form onSubmit={onLogin} className="mt-4 space-y-3" noValidate>
              <div>
                <label htmlFor="login-email" className={labelClass}>
                  Email
                </label>
                <input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@college.edu"
                  className={inputClass}
                />
              </div>
              <p className="text-[11px] text-slate-400">
                First time? Switch to "Create account" to register as a{' '}
                {role === 'student' ? 'student' : 'staff member'}.
              </p>
              <button
                type="submit"
                disabled={login.isPending}
                className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-700 disabled:opacity-60"
              >
                {login.isPending ? 'Signing in...' : `Continue as ${role}`}
              </button>
            </form>
          ) : (
            <form onSubmit={onRegister} className="mt-4 space-y-3" noValidate>
              <div>
                <label htmlFor="reg-name" className={labelClass}>
                  Full name
                </label>
                <input
                  id="reg-name"
                  type="text"
                  placeholder="Ada Lovelace"
                  className={inputClass}
                  {...formRegister('fullName')}
                />
                {errors.fullName && <p className={errorClass}>{errors.fullName.message}</p>}
              </div>
              <div>
                <label htmlFor="reg-email" className={labelClass}>
                  Email
                </label>
                <input
                  id="reg-email"
                  type="email"
                  placeholder="you@college.edu"
                  className={inputClass}
                  {...formRegister('email')}
                />
                {errors.email && <p className={errorClass}>{errors.email.message}</p>}
              </div>
              <div>
                <label htmlFor="reg-id" className={labelClass}>
                  {role === 'student' ? 'Student ID (optional)' : 'Staff ID (optional)'}
                </label>
                <input
                  id="reg-id"
                  type="text"
                  placeholder={role === 'student' ? 'ST101' : 'FAC1024'}
                  className={inputClass}
                  {...formRegister(role === 'student' ? 'studentId' : 'staffId')}
                />
              </div>
              <button
                type="submit"
                disabled={register.isPending}
                className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-60"
              >
                {register.isPending ? 'Creating account...' : 'Create account'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
