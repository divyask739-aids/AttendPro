import { Badge } from '@/components/ui/Badge'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { usePlannerMutations } from '@/hooks/usePlanner'
import { computeGoalStatus, computeProgress } from '@/features/planner/plannerEngine'
import { CATEGORY_LABEL, STATUS_LABEL, STATUS_TONE, goalStatusTone } from '@/features/planner/plannerMeta'
import { dueDateLabel } from '@/lib/utils'
import { isoToday } from '@/lib/date'
import type { PlannerGoal } from '@/features/planner/types'

export function GoalCard({ goal, email }: { goal: PlannerGoal; email: string }) {
  const { toggleMilestone } = usePlannerMutations(email)
  const progress = computeProgress(goal, isoToday())
  const status = computeGoalStatus(goal, isoToday())

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-900">{goal.name}</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {CATEGORY_LABEL[goal.category]} · due {dueDateLabel(goal.deadline)}
          </p>
        </div>
        <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
      </div>

      <ProgressBar
        value={progress.completed}
        max={Math.max(1, progress.total)}
        tone={goalStatusTone(status)}
        className="mt-3"
        label={`${goal.name} progress`}
      />
      <p className="mt-1.5 text-xs text-slate-500">
        {progress.completed}/{progress.total} milestones · {progress.remaining} remaining
        {progress.daysLeft < 0 && (
          <span className="ml-1 font-semibold text-rose-600">
            · deadline passed {Math.abs(progress.daysLeft)}d ago
          </span>
        )}
      </p>

      <ul className="mt-3 space-y-1.5">
        {goal.milestones.slice(0, 6).map((milestone) => (
          <li key={milestone.id}>
            <label className="flex items-center gap-2.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={milestone.status === 'completed'}
                onChange={(event) =>
                  void toggleMilestone.mutateAsync({
                    goalId: goal.id,
                    milestoneId: milestone.id,
                    done: event.target.checked,
                  })
                }
                className="h-3.5 w-3.5 rounded border-slate-300"
              />
              <span
                className={
                  milestone.status === 'completed'
                    ? 'text-slate-400 line-through'
                    : 'text-slate-600'
                }
              >
                {milestone.title}
              </span>
              <span className="ml-auto shrink-0 text-slate-400">{milestone.estimatedMinutes}m</span>
            </label>
          </li>
        ))}
        {goal.milestones.length > 6 && (
          <li className="text-xs text-slate-400">
            +{goal.milestones.length - 6} more milestones
          </li>
        )}
      </ul>
    </article>
  )
}
