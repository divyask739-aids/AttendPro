import { Card } from '@/components/ui/Card'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { attendanceTextColor, attendanceTone } from '@/features/attendance/attendanceMeta'
import type { SubjectAttendance } from '@/hooks/useAttendance'

interface SubjectAttendanceCardProps {
  subjects: SubjectAttendance[]
  className?: string
}

export function SubjectAttendanceCard({ subjects, className }: SubjectAttendanceCardProps) {
  return (
    <Card title="Attendance by subject" className={className}>
      {subjects.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">No subjects added yet.</p>
      ) : (
        <ul className="space-y-4">
          {subjects.map((subject) => (
            <li key={subject.id}>
              <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                <span className="truncate font-medium text-slate-700">{subject.name}</span>
                <span
                  className={`shrink-0 text-xs font-semibold ${attendanceTextColor(subject.percent)}`}
                >
                  {subject.percent}%
                </span>
              </div>
              <ProgressBar
                value={subject.percent}
                tone={attendanceTone(subject.percent)}
                label={`${subject.name} attendance`}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
