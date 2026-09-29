import { RecommendationsCard } from '@/components/RecommendationsCard'
import { Badge } from '@/components/ui/Badge'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { ClockIcon } from '@/components/icons'
import { PRIORITY_LABEL, PRIORITY_TONE } from '@/features/tasks/taskMeta'
import { RISK_LABEL, RISK_TONE } from '@/lib/attendance'
import type { TodayPlan } from '@/features/planner/types'

interface TodayPlanCardProps {
  plan: TodayPlan
  onToggleTask?: (taskId: string, done: boolean) => void
}

export function TodayPlanCard({ plan, onToggleTask }: TodayPlanCardProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 px-5 pt-5">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Today's Plan</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {plan.entries.length} item{plan.entries.length === 1 ? '' : 's'} · {plan.plannedMinutes}
            m of {plan.budgetMinutes}m
          </p>
        </div>
        {plan.rescheduledCount > 0 && (
          <Badge tone="warning">{plan.rescheduledCount} rescheduled</Badge>
        )}
      </div>

      <div className="px-5 pt-4">
        <ProgressBar
          value={plan.plannedMinutes}
          max={plan.budgetMinutes}
          tone={plan.plannedMinutes >= plan.budgetMinutes ? 'amber' : 'indigo'}
          label="Daily study time used"
        />
      </div>

      <div className="p-5 pt-4">
        {plan.entries.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nothing scheduled today. Add a task or create a goal to build your plan.
          </p>
        ) : (
          <ol className="space-y-2.5">
            {plan.entries.map((entry) => {
              const taskId = entry.source === 'task' ? entry.id.replace('task:', '') : null
              const done = false
              return (
                <li
                  key={entry.id}
                  className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5"
                >
                  {onToggleTask && taskId && (
                    <input
                      type="checkbox"
                      checked={done}
                      onChange={(event) => onToggleTask(taskId, event.target.checked)}
                      aria-label={`Mark ${entry.title} done`}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{entry.title}</p>
                    <p className="truncate text-xs text-slate-500">
                      {entry.context} · {entry.source === 'task' ? 'Task' : 'Goal milestone'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                      <ClockIcon className="h-3.5 w-3.5" />
                      {entry.estimatedMinutes}m
                    </span>
                    {entry.risk && entry.risk !== 'safe' && (
                      <Badge tone={RISK_TONE[entry.risk]}>{RISK_LABEL[entry.risk]}</Badge>
                    )}
                    <Badge tone={PRIORITY_TONE[entry.priority]}>{PRIORITY_LABEL[entry.priority]}</Badge>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </section>
  )
}

export { RecommendationsCard }
