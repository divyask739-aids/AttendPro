import { Badge } from '@/components/ui/Badge'
import type { BadgeTone } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { formatShortDate } from '@/lib/utils'
import type { AttendanceRecord, AttendanceStatus, Subject } from '@/types'

const STATUS_TONE: Record<AttendanceStatus, BadgeTone> = {
  present: 'success',
  late: 'warning',
  absent: 'danger',
  cancelled: 'neutral',
}

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: 'Present',
  late: 'Late',
  absent: 'Absent',
  cancelled: 'Cancelled',
}

interface RecentAttendanceProps {
  records: AttendanceRecord[]
  subjects: Subject[]
  limit?: number
  className?: string
}

export function RecentAttendance({
  records,
  subjects,
  limit = 8,
  className,
}: RecentAttendanceProps) {
  const subjectById = new Map(subjects.map((subject) => [subject.id, subject]))
  const recent = [...records]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit)

  return (
    <Card title="Recent classes" className={className}>
      {recent.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">
          No attendance marked yet.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {recent.map((record) => {
            const subject = subjectById.get(record.subjectId)
            return (
              <li
                key={record.id}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[11px] font-bold text-slate-600">
                    {subject?.shortName ?? '?'}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {subject?.name ?? 'Unknown subject'}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {formatShortDate(record.date)}
                    </p>
                  </div>
                </div>
                <Badge tone={STATUS_TONE[record.status]}>
                  {STATUS_LABEL[record.status]}
                </Badge>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
