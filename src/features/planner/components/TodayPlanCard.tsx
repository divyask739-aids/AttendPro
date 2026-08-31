import { useMemo } from 'react'

import { ClockIcon } from '@/components/icons'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { PRIORITY_LABEL, PRIORITY_TONE } from '@/features/tasks/taskMeta'
import { buildTodayPlan } from '@/features/planner/plannerEngine'
import { isoToday } from '@/features/planner/plannerMeta'
import { usePlannerGoals, usePlannerMutations } from '@/hooks/usePlanner'
import { cn, formatShortDate } from '@/lib/utils'

export function TodayPlanCard() {
  const { goals, isLoading } = usePlannerGoals()
  const { toggleMilestone } = usePlannerMutations()

  const plan = useMemo(() => buildTodayPlan(goals ?? []), [goals])

  return (
    <Card
      title="Today's plan"
      description={
        goals && goals.length > 0
          ? `${plan.plannedMinutes} of ${plan.budgetMinutes} min booked`
          : undefined
      }
    >
      {isLoading ? (
        <p className="text-sm text-slate-500">Building your plan...</p>
      ) : plan.items.length === 0 ? (
        <div className="py-6 text-center">
          <p className="text-sm font-medium text-slate-600">Nothing scheduled</p>
          <p className="mt-1 text-xs text-slate-500">
            Create a goal or complete your tasks to free up the day.
          </p>
        </div>
      ) : (
        <ul className="-my-1 divide-y divide-slate-100">
          {plan.items.map((item) => {
            const overdue = item.dueDate < isoToday()
            return (
              <li key={item.milestoneId} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <button
                  type="button"
                  aria-label={`Mark "${item.title}" as done`}
                  onClick={() =>
                    toggleMilestone.mutate({
                      goalId: item.goalId,
                      milestoneId: item.milestoneId,
                      done: true,
                    })
                  }
                  disabled={toggleMilestone.isPending}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-slate-300 text-transparent transition-colors hover:border-emerald-500 hover:text-emerald-500 disabled:opacity-50"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="h-3 w-3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </button>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{item.title}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">{item.goalName}</p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={PRIORITY_TONE[item.priority]}>{PRIORITY_LABEL[item.priority]}</Badge>
                  <Badge tone="neutral">{item.estimatedMinutes}m</Badge>
                  {overdue && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600">
                      <ClockIcon className="h-3.5 w-3.5" />
                      {formatShortDate(item.dueDate)}
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {!isLoading && plan.items.length > 0 && (
        <p className={cn('mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500')}>
          Completing a task updates goal progress instantly. Missed tasks are
          auto-rescheduled to fit your daily time.
        </p>
      )}
    </Card>
  )
}
