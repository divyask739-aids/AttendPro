import { useState } from 'react'

import { Badge } from '@/components/ui/Badge'
import { Card, EmptyState } from '@/components/ui/Card'
import { useAttendance } from '@/hooks/useAttendance'
import { useAttendanceMutations } from '@/hooks/useStudentData'
import { RISK_LABEL, RISK_TONE, riskTextColor } from '@/lib/attendance'
import { cn, formatShortDate } from '@/lib/utils'
import type { SubjectStats } from '@/hooks/useAttendance'
import type { AttendanceStatus } from '@/types'

const STATUS_OPTIONS: Array<{ value: AttendanceStatus; label: string }> = [
  { value: 'present', label: 'Present' },
  { value: 'late', label: 'Late' },
  { value: 'absent', label: 'Absent' },
  { value: 'cancelled', label: 'Cancelled' },
]

const STATUS_TONE: Record<AttendanceStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  present: 'success',
  late: 'warning',
  absent: 'danger',
  cancelled: 'neutral',
}

const inputClass =
  'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100'

export function AttendanceLogger({ email }: { email: string }) {
  const { summary, records } = useAttendance(email)
  const { logClass } = useAttendanceMutations(email)
  const [subjectId, setSubjectId] = useState<string>('')
  const [status, setStatus] = useState<AttendanceStatus>('present')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))

  const selected = subjectId || summary?.subjects[0]?.id || ''

  if (!summary || summary.subjects.length === 0) {
    return (
      <Card title="Record attendance">
        <EmptyState
          title="No subjects added yet."
          description="Add a subject first, then log each class to build your attendance record."
        />
      </Card>
    )
  }

  return (
    <Card
      title="Record attendance"
      description="Logging a class updates the subject percentage automatically"
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <label htmlFor="log-subject" className="mb-1 block text-xs font-medium text-slate-600">
            Subject
          </label>
          <select
            id="log-subject"
            value={selected}
            onChange={(event) => setSubjectId(event.target.value)}
            className={cn(inputClass, 'w-full')}
          >
            {summary.subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="log-status" className="mb-1 block text-xs font-medium text-slate-600">
            Status
          </label>
          <select
            id="log-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as AttendanceStatus)}
            className={cn(inputClass, 'w-full')}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="log-date" className="mb-1 block text-xs font-medium text-slate-600">
            Date
          </label>
          <input
            id="log-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className={cn(inputClass, 'w-full')}
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            onClick={() => {
              if (!selected) return
              void logClass.mutateAsync({ subjectId: selected, status, date })
            }}
            disabled={logClass.isPending}
            className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700 disabled:opacity-60"
          >
            {logClass.isPending ? 'Saving...' : 'Log class'}
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {summary.subjects.map((subject) => (
          <div
            key={subject.id}
            className="rounded-xl border border-slate-200 bg-slate-50 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-medium text-slate-800">{subject.name}</p>
              <span className={`text-sm font-bold ${riskTextColor(subject.percent)}`}>
                {subject.percent}%
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              {subject.attended}/{subject.held} ·{' '}
              <Badge tone={RISK_TONE[subject.risk]} className="mt-1 inline-flex">
                {RISK_LABEL[subject.risk]}
              </Badge>
            </p>
          </div>
        ))}
      </div>

      {records.length > 0 && (
        <div className="mt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Recent classes
          </h3>
          <ul className="mt-2 divide-y divide-slate-100">
            {records.slice(0, 8).map((record) => {
              const subject = summary.bySubjectId.get(record.subjectId)
              return (
                <li
                  key={record.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-slate-700">
                      {subject?.name ?? 'Removed subject'}
                    </p>
                    <p className="text-xs text-slate-500">{formatShortDate(record.date)}</p>
                  </div>
                  <Badge tone={STATUS_TONE[record.status]} className="capitalize">
                    {record.status}
                  </Badge>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </Card>
  )
}

export type { SubjectStats }
