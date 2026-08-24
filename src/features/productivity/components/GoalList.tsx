import { ProgressBar } from '@/components/ui/ProgressBar'
import { cn } from '@/lib/utils'
import type { DailyGoal } from '@/types'

interface GoalListProps {
  goals: DailyGoal[]
  className?: string
}

export function GoalList({ goals, className }: GoalListProps) {
  if (goals.length === 0) {
    return (
      <div
        className={cn(
          'rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center',
          className,
        )}
      >
        <p className="text-sm font-medium text-slate-600">No goals yet</p>
        <p className="mt-1 text-xs text-slate-500">Set a small daily goal to get started.</p>
      </div>
    )
  }

  return (
    <ul className={cn('space-y-3', className)}>
      {goals.map((goal) => {
        const done = goal.completed >= goal.target
        const percent = goal.target > 0 ? Math.round((goal.completed / goal.target) * 100) : 0
        return (
          <li
            key={goal.id}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-medium text-slate-800">{goal.title}</p>
              <span
                className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold',
                  done ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600',
                )}
              >
                {percent}%
              </span>
            </div>
            <ProgressBar
              value={goal.completed}
              max={goal.target}
              tone={done ? 'emerald' : 'indigo'}
              label={goal.title}
              className="mt-3"
            />
            <p className="mt-1.5 text-xs text-slate-500">
              {goal.completed} of {goal.target} {goal.unit}
              {done ? ' · complete' : ''}
            </p>
          </li>
        )
      })}
    </ul>
  )
}
