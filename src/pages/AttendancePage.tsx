import { useMemo, useState } from 'react'

import { RecommendationsCard } from '@/components/RecommendationsCard'
import { AttendanceLogger } from '@/features/attendance/components/AttendanceLogger'
import { SubjectManager } from '@/features/attendance/components/SubjectManager'
import { useAttendance } from '@/hooks/useAttendance'
import { useRecommendations } from '@/hooks/useRecommendations'

export function AttendancePage({ email }: { email: string }) {
  const { summary, isLoading, isError } = useAttendance(email)
  const { recommendations } = useRecommendations(email)

  const [tab, setTab] = useState<'record' | 'manage'>('record')
  const [targetPercent, setTargetPercent] = useState(75)

  const riskList = useMemo(
    () => summary?.subjects.filter((subject) => subject.risk !== 'safe') ?? [],
    [summary],
  )

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 lg:text-2xl">
          Attendance
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Track your attendance and plan how to reach your target.
        </p>
      </header>

      {isLoading ? (
        <p className="mt-6 text-sm text-slate-500">
          Loading attendance...
        </p>
      ) : isError ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
        >
          Unable to load attendance data. Please try again.
        </div>
      ) : (
        <>
          {summary && summary.hasData && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric
                label="Overall Attendance"
                value={`${summary.overallPercent}%`}
              />
              <Metric
                label="Classes Attended"
                value={`${summary.totalAttended}/${summary.totalHeld}`}
              />
              <Metric
                label="Subjects Needing Attention"
                value={String(summary.atRiskCount)}
              />
            </div>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">
              Smart Attendance Target Calculator
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Select your target to calculate how many consecutive classes
              you need to attend in each subject.
            </p>

            <div className="mt-4">
              <div className="flex items-center justify-between gap-3">
                <label
                  htmlFor="attendance-target"
                  className="text-sm font-medium text-slate-700"
                >
                  Target attendance
                </label>
                <span className="text-lg font-bold text-slate-900">
                  {targetPercent}%
                </span>
              </div>

              <input
                id="attendance-target"
                type="range"
                min="50"
                max="95"
                step="5"
                value={targetPercent}
                onChange={(event) =>
                  setTargetPercent(Number(event.target.value))
                }
                className="mt-3 w-full cursor-pointer accent-slate-900"
              />

              <div className="flex justify-between text-xs text-slate-500">
                <span>50%</span>
                <span>75%</span>
                <span>95%</span>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {summary?.subjects.map((subject) => {
                const alreadyReached =
                  subject.held > 0 &&
                  subject.percent >= targetPercent

                const required =
                  subject.held === 0 || alreadyReached
                    ? 0
                    : Math.max(
                        0,
                        Math.ceil(
                          (targetPercent * subject.held -
                            100 * subject.attended) /
                            (100 - targetPercent),
                        ),
                      )

                const progress = Math.min(subject.percent, 100)

                return (
                  <div
                    key={subject.id}
                    className="rounded-xl border border-slate-100 bg-slate-50 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-800">
                          {subject.name}
                        </h3>
                        <p className="mt-1 text-xs text-slate-500">
                          {subject.attended} attended out of {subject.held}{' '}
                          classes
                        </p>
                      </div>

                      <span className="shrink-0 text-sm font-bold text-slate-900">
                        {subject.percent}%
                      </span>
                    </div>

                    <div
                      className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"
                      role="progressbar"
                      aria-label={`${subject.name} attendance`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={progress}
                    >
                      <div
                        className="h-full rounded-full bg-slate-800 transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>

                    <p
                      className={`mt-3 text-xs font-medium ${
                        subject.held === 0
                          ? 'text-slate-500'
                          : alreadyReached
                            ? 'text-emerald-700'
                            : 'text-amber-700'
                      }`}
                    >
                      {subject.held === 0
                        ? 'Record your first class to calculate attendance.'
                        : alreadyReached
                          ? `Target reached! Your attendance is at or above ${targetPercent}%.`
                          : `Attend the next ${required} consecutive classes without absence to reach ${targetPercent}%.`}
                    </p>
                  </div>
                )
              })}

              {(!summary || summary.subjects.length === 0) && (
                <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                  No subjects found. Add subjects and record attendance
                  to use the calculator.
                </p>
              )}
            </div>

            <p className="mt-4 text-xs leading-5 text-slate-500">
              Estimates assume every upcoming class is attended and counted
              normally. Actual results depend on your college's attendance
              rules and future classes.
            </p>
          </section>

          <div className="flex gap-2">
            {(['record', 'manage'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setTab(option)}
                aria-pressed={tab === option}
                className={
                  tab === option
                    ? 'rounded-full bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white'
                    : 'rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50'
                }
              >
                {option === 'record'
                  ? 'Record Attendance'
                  : 'Manage Subjects'}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {tab === 'record' ? (
              <AttendanceLogger email={email} />
            ) : (
              <SubjectManager email={email} />
            )}

            {recommendations.length > 0 && (
              <RecommendationsCard recommendations={recommendations} />
            )}

            {riskList.length > 0 && (
              <section
                className="rounded-2xl border border-rose-200 bg-rose-50 p-4"
                aria-labelledby="attendance-risk-heading"
              >
                <h2
                  id="attendance-risk-heading"
                  className="text-sm font-semibold text-rose-800"
                >
                  Subjects Needing Attention
                </h2>

                <ul className="mt-2 space-y-2 text-xs text-rose-700">
                  {riskList.map((subject) => (
                    <li key={subject.id}>
                      <span className="font-semibold">{subject.name}</span>
                      : {subject.percent}% — review your attendance and
                      plan to attend upcoming classes.
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Metric({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="motion-metric rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
    </div>
  )
}