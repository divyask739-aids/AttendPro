import { useMemo, useState } from 'react'

import { RecommendationsCard } from '@/components/RecommendationsCard'
import { AttendanceLogger } from '@/features/attendance/components/AttendanceLogger'
import { SubjectManager } from '@/features/attendance/components/SubjectManager'
import { useAttendance } from '@/hooks/useAttendance'
import { useRecommendations } from '@/hooks/useRecommendations'

export function AttendancePage({ email }: { email: string }) {
  const { summary, isLoading } = useAttendance(email)
  const { recommendations } = useRecommendations(email)
  const [tab, setTab] = useState<'record' | 'manage'>('record')

  const riskList = useMemo(
    () => summary?.subjects.filter((s) => s.risk !== 'safe') ?? [],
    [summary],
  )

  return (
    <div>
      <header>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 lg:text-2xl">
          Attendance
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Your real record — nothing is hard-coded.
        </p>
      </header>

      {isLoading ? (
        <p className="mt-6 text-sm text-slate-500">Loading attendance...</p>
      ) : (
        <>
          {summary && summary.hasData ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <Metric label="Overall" value={`${summary.overallPercent}%`} />
              <Metric
                label="Classes attended"
                value={`${summary.totalAttended}/${summary.totalHeld}`}
              />
              <Metric label="Subjects at risk" value={String(summary.atRiskCount)} />
            </div>
          ) : null}

          <div className="mt-5 flex gap-2">
            {(['record', 'manage'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setTab(option)}
                aria-pressed={tab === option}
                className={
                  tab === option
                    ? 'rounded-full bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white'
                    : 'rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600'
                }
              >
                {option === 'record' ? 'Record attendance' : 'Manage subjects'}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-4">
            {tab === 'record' ? (
              <AttendanceLogger email={email} />
            ) : (
              <SubjectManager email={email} />
            )}

            {recommendations.length > 0 && (
              <RecommendationsCard recommendations={recommendations} />
            )}

            {riskList.length > 0 && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                <h2 className="text-sm font-semibold text-rose-800">Subjects needing attention</h2>
                <ul className="mt-2 space-y-1 text-xs text-rose-700">
                  {riskList.map((subject) => (
                    <li key={subject.id}>
                      {subject.name}: {subject.percent}% — attend upcoming classes to recover.
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
    </div>
  )
}
