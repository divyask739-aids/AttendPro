import { Link } from 'react-router-dom'

import { RecommendationsCard } from '@/components/RecommendationsCard'
import { Badge } from '@/components/ui/Badge'
import { Card, EmptyState } from '@/components/ui/Card'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { SubjectManager } from '@/features/attendance/components/SubjectManager'
import { useAttendance } from '@/hooks/useAttendance'
import { useProductivityGoals, useTasks } from '@/hooks/useTasks'
import { useRecommendations } from '@/hooks/useRecommendations'
import { useStudentProfile } from '@/hooks/useStudentData'
import { useTodayPlan } from '@/hooks/useTodayPlan'
import { RISK_LABEL, RISK_TONE, riskTone } from '@/lib/attendance'
import { dueDateLabel } from '@/lib/utils'

export function DashboardPage({ email }: { email: string }) {
  const { profile } = useStudentProfile(email)
  const { summary, isLoading } = useAttendance(email)
  const { tasks } = useTasks(email)
  const { goals } = useProductivityGoals(email)
  const { recommendations } = useRecommendations(email)
  const plan = useTodayPlan(email, profile?.dailyStudyMinutes ?? 180)

  const openTasks = tasks.filter((t) => t.status !== 'done')
  const upcoming = [...openTasks]
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 5)

  return (
    <div>
      <header>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 lg:text-2xl">
          {profile?.fullName ? `Hi, ${profile.fullName.split(' ')[0]}` : 'Dashboard'}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {profile?.course ? `${profile.course} · ` : ''}Your attendance, tasks and plan at a glance
        </p>
      </header>

      {isLoading ? (
        <p className="mt-6 text-sm text-slate-500">Loading your data...</p>
      ) : (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Overall attendance"
              value={summary ? `${summary.overallPercent}%` : '—'}
              hint={summary ? RISK_LABEL[summary.overallRisk] : 'No subjects yet'}
              tone={summary ? riskTone(summary.overallPercent) : 'indigo'}
            />
            <Stat
              label="Open tasks"
              value={String(openTasks.length)}
              hint={`${plan.dueTodayCount} due today`}
            />
            <Stat
              label="Planned today"
              value={`${plan.plannedMinutes}m`}
              hint={`of ${plan.budgetMinutes}m budget`}
            />
            <Stat
              label="Productivity goals"
              value={String(goals.length)}
              hint={`${goals.filter((g) => g.completed >= g.target).length} achieved`}
            />
          </div>

          <div className="mt-4 space-y-4">
            <Card
              title="Subject attendance"
              description="Same numbers everywhere in the app"
              action={
                <Link
                  to="/attendance"
                  className="text-xs font-semibold text-indigo-600 hover:underline"
                >
                  Manage
                </Link>
              }
            >
              {!summary || summary.subjects.length === 0 ? (
                <EmptyState
                  title="No subjects yet."
                  description="Add subjects to start tracking attendance and unlock smart recommendations."
                />
              ) : (
                <ul className="space-y-3">
                  {summary.subjects.map((subject) => (
                    <li key={subject.id}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-slate-800">
                          {subject.name}
                        </p>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-sm font-bold text-slate-700">
                            {subject.percent}%
                          </span>
                          <Badge tone={RISK_TONE[subject.risk]}>{RISK_LABEL[subject.risk]}</Badge>
                        </div>
                      </div>
                      <ProgressBar
                        value={subject.percent}
                        tone={riskTone(subject.percent)}
                        className="mt-1.5"
                        label={`${subject.name} attendance`}
                      />
                      <p className="mt-1 text-xs text-slate-500">
                        {subject.attended}/{subject.held} classes
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card
              title="Upcoming tasks"
              description="Soonest deadlines first"
              action={
                <Link to="/tasks" className="text-xs font-semibold text-indigo-600 hover:underline">
                  All tasks
                </Link>
              }
            >
              {upcoming.length === 0 ? (
                <EmptyState
                  title="No open tasks."
                  description="Add a task to see it here and in your daily plan."
                />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {upcoming.map((task) => (
                    <li
                      key={task.id}
                      className="flex items-center justify-between gap-3 py-2.5 first:pt-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-slate-700">{task.title}</p>
                        <p className="text-xs text-slate-500">
                          {task.subjectId
                            ? (summary?.bySubjectId.get(task.subjectId)?.name ?? 'Subject')
                            : 'No subject'}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs font-medium text-slate-500">
                        {dueDateLabel(task.dueDate)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <RecommendationsCard recommendations={recommendations} />

            {summary && summary.subjects.length === 0 && (
              <SubjectManager email={email} />
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  hint,
  tone = 'indigo',
}: {
  label: string
  value: string
  hint: string
  tone?: 'indigo' | 'emerald' | 'amber' | 'rose'
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      <ProgressBar
        value={tone === 'indigo' ? 100 : Number.parseInt(value, 10) || 0}
        tone={tone}
        className="mt-2"
        label={label}
      />
      <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
    </div>
  )
}
