import { useMemo } from 'react'

import { AiSuggestionsCard } from '@/features/planner/components/AiSuggestionsCard'
import { CreateGoalForm } from '@/features/planner/components/CreateGoalForm'
import { GoalCard } from '@/features/planner/components/GoalCard'
import { TodayPlanCard } from '@/features/planner/components/TodayPlanCard'
import { buildTodayPlan, getPlannerSuggestions } from '@/features/planner/plannerEngine'
import { useAttendance } from '@/hooks/useAttendance'
import { usePlannerGoals } from '@/hooks/usePlanner'
import { useStudentProfile, useTaskMutations } from '@/hooks/useStudentData'
import { useTasks } from '@/hooks/useTasks'
import { isoToday } from '@/lib/date'

export function PlannerPage({ email }: { email: string }) {
  const { profile } = useStudentProfile(email)
  const { goals, isLoading } = usePlannerGoals(email)
  const { tasks } = useTasks(email)
  const { summary } = useAttendance(email)
  const { setStatus } = useTaskMutations(email)

  const dailyStudyMinutes = profile?.dailyStudyMinutes ?? 180

  const plan = useMemo(
    () =>
      buildTodayPlan({
        tasks,
        goals,
        dailyStudyMinutes,
        riskBySubjectId: summary?.bySubjectId ?? new Map(),
      }),
    [tasks, goals, dailyStudyMinutes, summary],
  )

  const suggestions = useMemo(
    () =>
      getPlannerSuggestions({
        goals,
        tasks,
        attendancePercent: summary?.overallPercent ?? 0,
        plan,
      }),
    [goals, tasks, summary, plan],
  )

  return (
    <div>
      <header>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 lg:text-2xl">
          AI Goal Planner
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Goals, milestones and today's plan — built from your real tasks and attendance.
        </p>
      </header>

      <div className="mt-4 space-y-4">
        <TodayPlanCard
          plan={plan}
          onToggleTask={(taskId, done) => void setStatus.mutateAsync({ id: taskId, status: done ? 'done' : 'todo' })}
        />

        <AiSuggestionsCard suggestions={suggestions} />

        <CreateGoalForm email={email} />

        <div>
          <h2 className="text-sm font-semibold text-slate-900">Your goals</h2>
          {isLoading ? (
            <p className="mt-3 text-sm text-slate-500">Loading goals...</p>
          ) : goals.length === 0 ? (
            <p className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
              No goals yet. Create one above and the planner will break it into daily milestones.
            </p>
          ) : (
            <div className="mt-3 grid gap-3">
              {goals.map((goal) => (
                <GoalCard key={goal.id} goal={goal} email={email} />
              ))}
            </div>
          )}
        </div>

        <p className="text-center text-[11px] text-slate-400">
          Plan generated for {isoToday()} · capped at {dailyStudyMinutes}m/day
        </p>
      </div>
    </div>
  )
}
