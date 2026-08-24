import { ProgressBar } from '@/components/ui/ProgressBar'
import { attendanceTextColor, attendanceTone } from '@/features/attendance/attendanceMeta'
import type { SubjectAttendance } from '@/hooks/useAttendance'

interface SubjectCardProps {
  subject: SubjectAttendance
}

export function SubjectCard({ subject }: SubjectCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-xs font-bold text-indigo-600">
            {subject.shortName}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{subject.name}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {subject.attended} of {subject.held} classes
            </p>
          </div>
        </div>
        <p className={`shrink-0 text-lg font-bold ${attendanceTextColor(subject.percent)}`}>
          {subject.percent}%
        </p>
      </div>
      <ProgressBar
        value={subject.percent}
        tone={attendanceTone(subject.percent)}
        label={`${subject.name} attendance`}
        className="mt-4"
      />
    </div>
  )
}
