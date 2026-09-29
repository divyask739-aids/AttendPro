import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { Badge } from '@/components/ui/Badge'
import { Card, EmptyState } from '@/components/ui/Card'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { useStaffRoster, useVisibleActivities } from '@/hooks/useStaffData'
import { createActivity, setSubjectCounters } from '@/lib/dataApi'
import { riskTone, RISK_LABEL, RISK_TONE, percentToRisk } from '@/lib/attendance'
import { addDaysISO, isoToday } from '@/lib/date'
import type { AcademicActivity, TaskPriority } from '@/types'

/* ================================================================== *
 * 1. Dashboard                                                         *
 * ================================================================== */

export function StaffDashboardPage({ email }: { email: string }) {
  const { profile, subjects, rows, isLoading } = useStaffRoster(email)

  if (isLoading) return <p className="text-sm text-slate-500">Loading dashboard...</p>

  const overall =
    rows.length > 0
      ? Math.round(rows.reduce((sum, row) => sum + row.percent, 0) / rows.length)
      : 0
  const atRisk = rows.filter((row) => percentToRisk(row.percent) === 'high').length

  return (
    <div>
      <header>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 lg:text-2xl">
          {profile?.fullName ? `Hi, ${profile.fullName.split(' ')[0]}` : 'Faculty Dashboard'}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {profile?.department || 'Department not set'} · attendance across your subjects
        </p>
      </header>

      {subjects.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="No subjects assigned yet."
            description="Add the subjects you teach in your profile to see student attendance analytics."
          />
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Metric label="Subjects taught" value={String(subjects.length)} />
            <Metric label="Students enrolled" value={String(rows.length)} />
            <Metric label="Average attendance" value={`${overall}%`} />
          </div>

          <div className="mt-4 space-y-4">
            <Card title="Subject performance" description="Average across enrolled students">
              <ul className="space-y-3">
                {subjects.map((subject) => (
                  <li key={subject.key}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {subject.name}
                        {subject.code ? ` (${subject.code})` : ''}
                      </p>
                      <span className="shrink-0 text-sm font-bold text-slate-700">
                        {subject.averagePercent}%
                      </span>
                    </div>
                    <ProgressBar
                      value={subject.averagePercent}
                      tone={riskTone(subject.averagePercent)}
                      className="mt-1.5"
                      label={subject.name}
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      {subject.studentCount} students · {subject.atRiskCount} below 75%
                    </p>
                  </li>
                ))}
              </ul>
            </Card>

            {atRisk > 0 && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                <h2 className="text-sm font-semibold text-rose-800">
                  {atRisk} student{atRisk === 1 ? '' : 's'} below 75% attendance
                </h2>
                <p className="mt-1 text-xs text-rose-700">
                  Review the Students tab and update their records so they can recover.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/* ================================================================== *
 * 2. My subjects                                                       *
 * ================================================================== */

export function StaffSubjectsPage({ email }: { email: string }) {
  const { subjects } = useStaffRoster(email)

  return (
    <div>
      <header>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 lg:text-2xl">
          My Subjects
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Subjects you teach. Edit this list in your profile.
        </p>
      </header>

      <div className="mt-4">
        {subjects.length === 0 ? (
          <EmptyState
            title="No subjects assigned."
            description="Add subjects in your profile to unlock student analytics."
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {subjects.map((subject) => (
              <li key={subject.key}>
                <Card>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{subject.name}</p>
                    <Badge tone="info">{subject.code || 'No code'}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {subject.semester || 'No semester'} · {subject.studentCount} students
                  </p>
                  <ProgressBar
                    value={subject.averagePercent}
                    tone={riskTone(subject.averagePercent)}
                    className="mt-3"
                    label={subject.name}
                  />
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/* ================================================================== *
 * 3. Students                                                          *
 * ================================================================== */

export function StaffStudentsPage({ email }: { email: string }) {
  const { rows, subjects, isLoading } = useStaffRoster(email)
  const [filter, setFilter] = useState('')

  const visible = rows.filter(
    (row) =>
      !filter ||
      row.studentName.toLowerCase().includes(filter.toLowerCase()) ||
      row.subjectName.toLowerCase().includes(filter.toLowerCase()),
  )

  return (
    <div>
      <header>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 lg:text-2xl">Students</h1>
        <p className="mt-1 text-sm text-slate-500">
          Only students enrolled in your subjects, using their own recorded attendance.
        </p>
      </header>

      <div className="mt-4 space-y-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFilter('')}
            className={
              filter === ''
                ? 'rounded-full bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white'
                : 'rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600'
            }
          >
            All
          </button>
          {subjects.map((subject) => (
            <button
              key={subject.key}
              type="button"
              onClick={() => setFilter(subject.name)}
              className={
                filter === subject.name
                  ? 'rounded-full bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white'
                  : 'rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600'
              }
            >
              {subject.name}
            </button>
          ))}
        </div>

        {isLoading ? (
          <p className="text-sm text-slate-500">Loading students...</p>
        ) : visible.length === 0 ? (
          <EmptyState
            title="No students found."
            description="Students appear here once they add one of your subjects to their profile."
          />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Student</th>
                  <th className="px-4 py-2.5 font-medium">ID</th>
                  <th className="px-4 py-2.5 font-medium">Subject</th>
                  <th className="px-4 py-2.5 font-medium">Attended</th>
                  <th className="px-4 py-2.5 font-medium">%</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((row) => {
                  const risk = percentToRisk(row.percent)
                  return (
                    <tr key={`${row.studentEmail}-${row.subjectName}`}>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-slate-800">{row.studentName}</p>
                        <p className="text-xs text-slate-500">{row.studentEmail}</p>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-600">{row.studentId}</td>
                      <td className="px-4 py-2.5 text-slate-600">{row.subjectName}</td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {row.attended}/{row.held}
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-slate-800">{row.percent}%</td>
                      <td className="px-4 py-2.5">
                        <Badge tone={RISK_TONE[risk]}>{RISK_LABEL[risk]}</Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

/* ================================================================== *
 * 4. Attendance correction                                             *
 * ================================================================== */

function useCounterMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      studentEmail: string
      subjectId: string
      held: number
      attended: number
    }) =>
      setSubjectCounters(
        input.studentEmail,
        input.subjectId,
        input.held,
        Math.min(input.held, input.attended),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['staff-roster'] })
    },
  })
}

export function StaffAttendancePage({ email }: { email: string }) {
  const { rows, isLoading } = useStaffRoster(email)
  const counter = useCounterMutation()

  // subjectId is resolved by matching the student's subject name below.
  const byStudent = new Map<string, typeof rows>()
  for (const row of rows) {
    const list = byStudent.get(row.studentEmail) ?? []
    list.push(row)
    byStudent.set(row.studentEmail, list)
  }

  return (
    <div>
      <header>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 lg:text-2xl">
          Attendance
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Correct a student's classes held/attended. The student sees the change immediately.
        </p>
      </header>

      <div className="mt-4 space-y-3">
        {isLoading ? (
          <p className="text-sm text-slate-500">Loading records...</p>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No attendance records yet."
            description="Records appear when students add your subjects and log classes."
          />
        ) : (
          rows.map((row) => (
            <CounterRow
              key={`${row.studentEmail}-${row.subjectId}`}
              row={row}
              onSave={(held, attended) =>
                counter.mutateAsync({
                  studentEmail: row.studentEmail,
                  subjectId: row.subjectId,
                  held,
                  attended,
                })
              }
            />
          ))
        )}
      </div>
      <p className="mt-4 text-[11px] text-slate-400">
        Showing {byStudent.size} student{byStudent.size === 1 ? '' : 's'}.
      </p>
    </div>
  )
}

function CounterRow({
  row,
  onSave,
}: {
  row: {
    studentEmail: string
    studentName: string
    subjectId: string
    subjectName: string
    held: number
    attended: number
    percent: number
  }
  onSave: (held: number, attended: number) => void
}) {
  const [held, setHeld] = useState(row.held)
  const [attended, setAttended] = useState(row.attended)
  const percent = held > 0 ? Math.round((attended / held) * 100) : 0

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-800">{row.studentName}</p>
          <p className="text-xs text-slate-500">{row.subjectName}</p>
        </div>
        <Badge tone={RISK_TONE[percentToRisk(percent)]}>{RISK_LABEL[percentToRisk(percent)]}</Badge>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-xs text-slate-600">
          Held
          <input
            type="number"
            min={0}
            value={held}
            onChange={(e) => setHeld(Math.max(0, Number(e.target.value)))}
            className="mt-1 w-20 rounded-xl border border-slate-200 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-slate-600">
          Attended
          <input
            type="number"
            min={0}
            value={attended}
            onChange={(e) => setAttended(Math.max(0, Number(e.target.value)))}
            className="mt-1 w-20 rounded-xl border border-slate-200 px-2 py-1.5 text-sm"
          />
        </label>
        <span className="text-sm font-bold text-slate-700">{percent}%</span>
        <button
          type="button"
          onClick={() => onSave(held, attended)}
          className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
        >
          Save
        </button>
      </div>
    </div>
  )
}

/* ================================================================== *
 * 5. Academic activities                                              *
 * ================================================================== */

export function StaffActivitiesPage({ email }: { email: string }) {
  const { activities, isLoading } = useVisibleActivities(email, 'staff', [])
  const [form, setForm] = useState<Omit<AcademicActivity, 'id' | 'createdBy' | 'createdAt'>>({
    subjectName: '',
    subjectCode: '',
    title: '',
    description: '',
    dueDate: addDaysISO(isoToday(), 7),
    priority: 'medium',
  })
  const queryClient = useQueryClient()
  const [saved, setSaved] = useState(false)

  const addActivity = useMutation({
    mutationFn: () => createActivity(email, form),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['activities'] })
      setSaved(true)
      window.setTimeout(() => setSaved(false), 3000)
    },
  })

  const inputClass =
    'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400'

  return (
    <div>
      <header>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 lg:text-2xl">
          Academic Activities
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Announcements you publish are visible only to students in the matching subject.
        </p>
      </header>

      <div className="mt-4 space-y-4">
        <Card title="Publish an activity">
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Title"
              className={inputClass}
              aria-label="Activity title"
            />
            <input
              value={form.subjectName}
              onChange={(e) => setForm({ ...form, subjectName: e.target.value })}
              placeholder="Subject name"
              className={inputClass}
              aria-label="Activity subject"
            />
            <input
              value={form.subjectCode}
              onChange={(e) => setForm({ ...form, subjectCode: e.target.value })}
              placeholder="Subject code"
              className={inputClass}
              aria-label="Activity subject code"
            />
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              className={inputClass}
              aria-label="Activity due date"
            />
            <select
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}
              className={inputClass}
              aria-label="Activity priority"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Description"
              className={inputClass}
              aria-label="Activity description"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              if (!form.title.trim() || !form.subjectName.trim()) return
              void addActivity.mutateAsync()
            }}
            disabled={addActivity.isPending}
            className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {addActivity.isPending ? 'Publishing...' : 'Publish'}
          </button>
          {saved && <span className="ml-3 text-xs font-medium text-emerald-600">Published</span>}
        </Card>

        {isLoading ? (
          <p className="text-sm text-slate-500">Loading activities...</p>
        ) : activities.length === 0 ? (
          <EmptyState
            title="No activities published."
            description="Publish an assignment or exam announcement above."
          />
        ) : (
          <ul className="space-y-2">
            {activities.map((activity) => (
              <li
                key={activity.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{activity.title}</p>
                  <Badge tone={activity.priority === 'high' ? 'danger' : 'info'}>
                    {activity.priority}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {activity.subjectName}
                  {activity.subjectCode ? ` (${activity.subjectCode})` : ''} · due{' '}
                  {activity.dueDate}
                </p>
                {activity.description && (
                  <p className="mt-1.5 text-xs text-slate-600">{activity.description}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  )
}
