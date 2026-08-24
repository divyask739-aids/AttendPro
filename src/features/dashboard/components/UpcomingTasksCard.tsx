import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { cn, daysUntil, dueDateLabel } from '@/lib/utils'
import type { Task } from '@/types'

import { PRIORITY_LABEL, PRIORITY_TONE } from '@/features/tasks/taskMeta'

interface UpcomingTasksCardProps {
  tasks: Task[]
  limit?: number
}

export function UpcomingTasksCard({ tasks, limit = 5 }: UpcomingTasksCardProps) {
  const upcoming = tasks
    .filter((task) => task.status !== 'done')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, limit)

  return (
    <Card
      title="Upcoming tasks"
      action={
        <Link
          to="/tasks"
          className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
        >
          View all
        </Link>
      }
    >
      {upcoming.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">
          No pending tasks. Nice work!
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {upcoming.map((task) => {
            const overdue = task.status !== 'done' && daysUntil(task.dueDate) < 0
            return (
              <li
                key={task.id}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{task.title}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">{task.subject}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={PRIORITY_TONE[task.priority]}>
                    {PRIORITY_LABEL[task.priority]}
                  </Badge>
                  <span
                    className={cn(
                      'w-20 text-right text-xs',
                      overdue ? 'font-semibold text-rose-600' : 'text-slate-500',
                    )}
                  >
                    {dueDateLabel(task.dueDate)}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
