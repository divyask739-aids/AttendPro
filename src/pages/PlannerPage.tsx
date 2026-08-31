import { useMemo } from 'react'

import { CreateGoalForm } from '@/features/planner/components/CreateGoalForm'
import { GoalCard } from '@/features/planner/components/GoalCard'
import { TodayPlanCard } from '@/features/planner/components/TodayPlanCard'
import { AiSuggestionsCard } from '@/features/planner/components/AiSuggestionsCard'
import {
  buildTodayPlan,
  computeGoalStatus,
  computeProgress,
} from '@/features/planner/plannerEngine'
import { useAttendance } from '@/hooks/useAttendance'
import { usePlannerGoals } from '@/hooks/usePlanner'
import { StatCard } from '@/features/dashboard/components/StatCard'

export function PlannerPage() {
  const { goals, isLoading, isError } = usePlannerGoals()
  const { stats } = useAttendance()
  const list = goals ?? []

  const plan = useMemo(() => buildTodayPlan(list), [list])

  const summary = useMemo(() => {
    const active = list.filter((goal) => computeGoalStatus(goal) !== 'completed')
    const atRisk = list.filter((goal) => computeGoalStatus(goal) === 'at_risk')
    const averageProgress =
      list.length > 0
        ? Math.round(
            list.reduce((sum, goal) => sum + computeProgress(goal).percent, 0) /
              list.length,
          )
        : 0
    return {
      activeCount: active.length,
      atRiskCount: atRisk.length,
      averageProgress,
    }
  }, [list])

  return (
    <div>
      <header>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 lg:text-2xl">
          AI Goal Planner
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Deadlines become realistic daily plans that adapt when life happens.
        </p>
      </header>

      {isError ? (
        <p className="mt-6 rounded-2xl bg-rose-50 p-4 text-sm text-rose-600">
          Could not load the planner. Please refresh.
        </p>
      ) : isLoading ? (
        <p className="mt-6 text-sm text-slate-500">Loading your planner...</p>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Active goals"
              value={String(summary.activeCount)}
              hint={`${summary.atRiskCount} at risk`}
            />
            <StatCard
              label="Today booked"
              value={`${plan.plannedMinutes}m`}
              hint={`of ${plan.budgetMinutes}m daily capacity`}
            />
            <StatCard
              label="Avg progress"
              value={`${summary.averageProgress}%`}
              hint="across all goals"
            />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-5">
            <div className="space-y-4 lg:col-span-2">
              <CreateGoalForm />
              <AiSuggestionsCard
                goals={list}
                attendancePercent={stats?.overallPercent ?? 100}
                plan={plan}
              />
            </div>

            <div className="space-y-4 lg:col-span-3">
              <TodayPlanCard />

              {list.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
                  <p className="text-sm font-medium text-slate-600">No goals yet</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Add one on the left and watch it turn into a daily plan.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {list.map((goal) => (
                    <GoalCard key={goal.id} goal={goal} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
