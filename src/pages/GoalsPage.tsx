import { Card } from '@/components/ui/Card'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { GoalList } from '@/features/productivity/components/GoalList'
import { useGoals } from '@/hooks/useGoals'

export function GoalsPage() {
  const { goals, isLoading, isError } = useGoals()
  const list = goals ?? []

  const totalTarget = list.reduce((sum, goal) => sum + goal.target, 0)
  const totalCompleted = list.reduce((sum, goal) => sum + goal.completed, 0)
  const overallPercent =
    totalTarget > 0 ? Math.round((totalCompleted / totalTarget) * 100) : 0

  return (
    <div>
      <header>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 lg:text-2xl">
          Daily goals
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Small wins add up. Close out your goals for today.
        </p>
      </header>

      {isError ? (
        <p className="mt-6 rounded-2xl bg-rose-50 p-4 text-sm text-rose-600">
          Could not load goals. Please refresh.
        </p>
      ) : isLoading ? (
        <p className="mt-6 text-sm text-slate-500">Loading goals...</p>
      ) : (
        <>
          <Card className="mt-6" title="Today at a glance">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium text-slate-700">Overall progress</span>
              <span className="text-xs font-semibold text-indigo-600">
                {overallPercent}%
              </span>
            </div>
            <ProgressBar
              value={totalCompleted}
              max={totalTarget}
              tone={overallPercent === 100 ? 'emerald' : 'indigo'}
              label="Overall daily goal progress"
              className="mt-3"
            />
            <p className="mt-1.5 text-xs text-slate-500">
              {totalCompleted} of {totalTarget} total units completed
            </p>
          </Card>

          <GoalList goals={list} className="mt-4" />
        </>
      )}
    </div>
  )
}
