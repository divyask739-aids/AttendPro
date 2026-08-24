import { Link } from 'react-router-dom'

import { Card } from '@/components/ui/Card'
import { ProgressBar } from '@/components/ui/ProgressBar'
import type { DailyGoal } from '@/types'

interface GoalProgressCardProps {
  goals: DailyGoal[]
}

export function GoalProgressCard({ goals }: GoalProgressCardProps) {
  return (
    <Card
      title="Daily goals"
      action={
        <Link
          to="/goals"
          className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
        >
          View all
        </Link>
      }
    >
      {goals.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">
          No goals set for today yet.
        </p>
      ) : (
        <ul className="space-y-4">
          {goals.map((goal) => (
            <li key={goal.id}>
              <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                <span className="truncate font-medium text-slate-700">{goal.title}</span>
                <span className="shrink-0 text-xs text-slate-500">
                  {goal.completed}/{goal.target} {goal.unit}
                </span>
              </div>
              <ProgressBar
                value={goal.completed}
                max={goal.target}
                tone={goal.completed >= goal.target ? 'emerald' : 'indigo'}
                label={goal.title}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
