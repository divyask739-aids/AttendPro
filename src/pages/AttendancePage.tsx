import { RecentAttendance } from '@/features/attendance/components/RecentAttendance'
import { SubjectCard } from '@/features/attendance/components/SubjectCard'
import { useAttendance } from '@/hooks/useAttendance'

export function AttendancePage() {
  const { stats, records, isLoading, isError } = useAttendance()

  return (
    <div>
      <header>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 lg:text-2xl">
          Attendance
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Keep every subject above the safe zone.
        </p>
      </header>

      {isError ? (
        <p className="mt-6 rounded-2xl bg-rose-50 p-4 text-sm text-rose-600">
          Could not load attendance. Please refresh.
        </p>
      ) : isLoading || !stats ? (
        <p className="mt-6 text-sm text-slate-500">Loading attendance...</p>
      ) : (
        <>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {stats.subjects.map((subject) => (
              <SubjectCard key={subject.id} subject={subject} />
            ))}
          </div>
          <RecentAttendance
            records={records ?? []}
            subjects={stats.subjects}
            className="mt-6"
          />
        </>
      )}
    </div>
  )
}
