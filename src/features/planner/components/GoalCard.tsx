import { Badge } from '@/components/ui/Badge'
import { ProgressBar, type ProgressBarTone } from '@/components/ui/ProgressBar'
import {
  computeGoalStatus,
  computeProgress,
} from '@/features/planner/plannerEngine'
import {
  CATEGORY_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  daysUntilFrom,
  isoToday,
} from '@/features/planner/plannerMeta'
import { formatShortDate } from '@/lib/utils'
import type { PlannerGoal } from '@/features/planner/types'

interface GoalCardProps {
  goal: PlannerGoal
}

function progressTone(status: ReturnType<typeof computeGoalStatus>): ProgressBarTone {
  switch (status) {
    case 'completed':
      return 'emerald'
    case 'at_risk':
      return 'rose'
    case 'needs_attention':
      return 'amber'
    default:
      return 'indigo'
  }
}

export function GoalCard({ goal }: GoalCardProps) {
  const status = computeGoalStatus(goal)
  const progress = computeProgress(goal)
  const daysLeft = daysUntilFrom(isoToday(), goal.deadline)
  const urgent = status !== 'completed' && daysLeft <= 3

  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{goal.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge tone="neutral">{CATEGORY_LABEL[goal.category]}</Badge>
            <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
          </div>
        </div>
        <span
          className={`shrink-0 rounded-lg px-2 py-1 text-xs font-semibold ${
            status === 'completed'
              ? 'bg-emerald-50 text-emerald-600'
              : urgent
                ? 'bg-rose-50 text-rose-600'
                : 'bg-slate-100 text-slate-600'
          }`}
        >
          {status === 'completed'
            ? 'Done'
            : daysLeft < 0
              ? `${Math.abs(daysLeft)}d late`
              : `${daysLeft}d left`}
        </span>
      </div>

      <div className="mt-4 flex-1">
        <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
          <span>
            {progress.completed}/{progress.total} tasks done
          </span>
          <span className="font-semibold text-slate-700">{progress.percent}%</span>
        </div>
        <ProgressBar value={progress.percent} tone={progressTone(status)} label={`${goal.name} progress`} />
        <p className="mt-2 text-xs text-slate-500">
          Due {formatShortDate(goal.deadline)} · {progress.remaining} task
          {progress.remaining === 1 ? '' : 's'} left · {goal.dailyMinutes}m/day
        </p>
      </div>
    </div>
  )
}
