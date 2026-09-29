import { useEffect, useState } from 'react'

import { Card } from '@/components/ui/Card'
import {
  useAuthMutations,
  useProfileMutations,
  useSession,
  useStaffProfile,
  useStudentProfile,
} from '@/hooks/useStudentData'
import { cn } from '@/lib/utils'
import type { StaffProfile, StaffSubject, StudentProfile } from '@/types'

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100'
const labelClass = 'mb-1 block text-xs font-medium text-slate-600'

export function ProfilePage({ email, role }: { email: string; role: 'student' | 'staff' }) {
  return role === 'staff' ? (
    <StaffProfileForm email={email} />
  ) : (
    <StudentProfileForm email={email} />
  )
}

/* ------------------------------ student ----------------------------- */

function StudentProfileForm({ email }: { email: string }) {
  const { profile, isLoading } = useStudentProfile(email)
  const { saveStudent } = useProfileMutations(email)
  const [form, setForm] = useState<StudentProfile | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (profile) setForm(profile)
  }, [profile])

  if (isLoading || !form) return <p className="text-sm text-slate-500">Loading profile...</p>

  return (
    <FormShell
      title="Student Profile"
      description="Saved to your account and used by the planner and dashboard."
      onSubmit={async (event) => {
        event.preventDefault()
        await saveStudent.mutateAsync(form)
        setSaved(true)
        window.setTimeout(() => setSaved(false), 3000)
      }}
      saving={saveStudent.isPending}
      saved={saved}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="sp-name" label="Full name">
          <input
            id="sp-name"
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field id="sp-email" label="Email" hint="Your account email">
          <input id="sp-email" value={form.email} disabled className={cn(inputClass, 'bg-slate-50')} />
        </Field>
        <Field id="sp-id" label="Student ID">
          <input
            id="sp-id"
            value={form.studentId}
            onChange={(e) => setForm({ ...form, studentId: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field id="sp-inst" label="Institution">
          <input
            id="sp-inst"
            value={form.institution}
            onChange={(e) => setForm({ ...form, institution: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field id="sp-course" label="Course / branch">
          <input
            id="sp-course"
            value={form.course}
            onChange={(e) => setForm({ ...form, course: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field id="sp-year" label="Year">
          <input
            id="sp-year"
            value={form.year}
            onChange={(e) => setForm({ ...form, year: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field id="sp-sem" label="Semester">
          <input
            id="sp-sem"
            value={form.semester}
            onChange={(e) => setForm({ ...form, semester: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field
          id="sp-minutes"
          label="Daily study minutes"
          hint="Caps the amount of work the planner schedules per day"
        >
          <input
            id="sp-minutes"
            type="number"
            min={30}
            step={30}
            value={form.dailyStudyMinutes}
            onChange={(e) =>
              setForm({ ...form, dailyStudyMinutes: Math.max(30, Number(e.target.value) || 30) })
            }
            className={inputClass}
          />
        </Field>
      </div>
    </FormShell>
  )
}

/* ------------------------------- staff ------------------------------ */

function StaffProfileForm({ email }: { email: string }) {
  const { profile, isLoading } = useStaffProfile(email)
  const { saveStaff } = useProfileMutations(email)
  const [form, setForm] = useState<StaffProfile | null>(null)
  const [saved, setSaved] = useState(false)
  const [newSubject, setNewSubject] = useState<StaffSubject>({
    name: '',
    code: '',
    semester: '',
  })

  useEffect(() => {
    if (profile) setForm(profile)
  }, [profile])

  if (isLoading || !form) return <p className="text-sm text-slate-500">Loading profile...</p>

  return (
    <FormShell
      title="Staff Profile"
      description="Your teaching subjects decide which students and attendance data you can see."
      onSubmit={async (event) => {
        event.preventDefault()
        await saveStaff.mutateAsync(form)
        setSaved(true)
        window.setTimeout(() => setSaved(false), 3000)
      }}
      saving={saveStaff.isPending}
      saved={saved}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="sf-name" label="Full name">
          <input
            id="sf-name"
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field id="sf-email" label="Email" hint="Your account email">
          <input id="sf-email" value={form.email} disabled className={cn(inputClass, 'bg-slate-50')} />
        </Field>
        <Field id="sf-id" label="Staff ID">
          <input
            id="sf-id"
            value={form.staffId}
            onChange={(e) => setForm({ ...form, staffId: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field id="sf-dept" label="Department">
          <input
            id="sf-dept"
            value={form.department}
            onChange={(e) => setForm({ ...form, department: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field id="sf-desig" label="Designation">
          <input
            id="sf-desig"
            value={form.designation}
            onChange={(e) => setForm({ ...form, designation: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field id="sf-year" label="Academic year">
          <input
            id="sf-year"
            value={form.academicYear}
            onChange={(e) => setForm({ ...form, academicYear: e.target.value })}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="mt-5 border-t border-slate-100 pt-4">
        <h3 className="text-sm font-semibold text-slate-900">Subjects you teach</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Only students enrolled in these subjects appear in your dashboard.
        </p>

        <ul className="mt-3 space-y-2">
          {form.subjects.map((subject, index) => (
            <li key={`${subject.name}-${index}`} className="flex items-center gap-2">
              <input
                value={subject.name}
                onChange={(e) => {
                  const next = [...form.subjects]
                  next[index] = { ...subject, name: e.target.value }
                  setForm({ ...form, subjects: next })
                }}
                placeholder="Subject name"
                className={inputClass}
                aria-label="Subject name"
              />
              <input
                value={subject.code}
                onChange={(e) => {
                  const next = [...form.subjects]
                  next[index] = { ...subject, code: e.target.value }
                  setForm({ ...form, subjects: next })
                }}
                placeholder="Code"
                className={cn(inputClass, 'w-28')}
                aria-label="Subject code"
              />
              <input
                value={subject.semester}
                onChange={(e) => {
                  const next = [...form.subjects]
                  next[index] = { ...subject, semester: e.target.value }
                  setForm({ ...form, subjects: next })
                }}
                placeholder="Sem"
                className={cn(inputClass, 'w-24')}
                aria-label="Semester"
              />
              <button
                type="button"
                onClick={() =>
                  setForm({ ...form, subjects: form.subjects.filter((_, i) => i !== index) })
                }
                className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <input
            value={newSubject.name}
            onChange={(e) => setNewSubject({ ...newSubject, name: e.target.value })}
            placeholder="New subject"
            className={cn(inputClass, 'w-48')}
            aria-label="New subject name"
          />
          <input
            value={newSubject.code}
            onChange={(e) => setNewSubject({ ...newSubject, code: e.target.value })}
            placeholder="Code"
            className={cn(inputClass, 'w-28')}
            aria-label="New subject code"
          />
          <input
            value={newSubject.semester}
            onChange={(e) => setNewSubject({ ...newSubject, semester: e.target.value })}
            placeholder="Sem"
            className={cn(inputClass, 'w-24')}
            aria-label="New subject semester"
          />
          <button
            type="button"
            onClick={() => {
              if (!newSubject.name.trim()) return
              setForm({ ...form, subjects: [...form.subjects, newSubject] })
              setNewSubject({ name: '', code: '', semester: '' })
            }}
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600"
          >
            Add subject
          </button>
        </div>
      </div>
    </FormShell>
  )
}

/* ------------------------------ shared ------------------------------ */

function FormShell({
  title,
  description,
  children,
  onSubmit,
  saving,
  saved,
}: {
  title: string
  description: string
  children: React.ReactNode
  onSubmit: (event: React.FormEvent) => void
  saving: boolean
  saved: boolean
}) {
  const { session } = useSession()
  const { logout } = useAuthMutations()

  return (
    <div>
      <header>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 lg:text-2xl">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </header>

      <div className="mt-4 space-y-4">
        <Card>
          <form onSubmit={onSubmit}>
            {children}
            <button
              type="submit"
              disabled={saving}
              className="mt-5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save profile'}
            </button>
            {saved && (
              <p className="ml-3 inline text-xs font-medium text-emerald-600">Saved</p>
            )}
          </form>
        </Card>

        <Card title="Account" description="Signed in as this user">
          <p className="text-sm text-slate-700">{session?.fullName}</p>
          <p className="text-xs text-slate-500">{session?.email}</p>
          <button
            type="button"
            onClick={() => void logout.mutate()}
            className="mt-3 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Sign out
          </button>
        </Card>
      </div>
    </div>
  )
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </div>
  )
}
