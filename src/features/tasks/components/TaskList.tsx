import { ClockIcon } from '@/components/icons'
import { Badge } from '@/components/ui/Badge'
import {
  PRIORITY_DOT,
  PRIORITY_LABEL,
  PRIORITY_TONE,
  RISK_DOT,
  RISK_LABEL,
  RISK_TONE,
  attendanceRecommendation,
  percentToRisk,
} from '@/features/tasks/taskMeta'
import { cn, daysUntil, dueDateLabel } from '@/lib/utils'
import type { Task } from '@/types'

interface SubjectAttendance {
  percent: number
}

interface TaskListProps {
  tasks: Task[]
  subjectAttendance?: Map<string, SubjectAttendance>
  className?: string
}

export function TaskList({ tasks, subjectAttendance, className }: TaskListProps) {
  if (tasks.length === 0) {
    return (
      <div
        className={cn(
          'rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center',
          className,
        )}
      >
        <p className="text-sm font-medium text-slate-600">Nothing here</p>
        <p className="mt-1 text-xs text-slate-500">
          No tasks match this filter right now.
        </p>
      </div>
    )
  }

  return (
    <ul
      className={cn(
        'divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm',
        className,
      )}
    >
      {tasks.map((task) => {
        const overdue = task.status !== 'done' && daysUntil(task.dueDate) < 0
        const att = subjectAttendance?.get(task.subject)
        const risk = att ? percentToRisk(att.percent) : 'safe'
        const showAtt = att !== undefined
        const showRec =
          showAtt && risk !== 'safe' && task.status !== 'done'

        return (
          <li key={task.id} className="p-4">
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className={cn(
                  'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                  PRIORITY_DOT[task.priority],
                )}
              />
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'text-sm font-medium',
                    task.status === 'done'
                      ? 'text-slate-400 line-through'
                      : 'text-slate-800',
                  )}
                >
                  {task.title}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                  <span>{task.subject}</span>
                  <span aria-hidden="true">·</span>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1',
                      overdue && 'font-semibold text-rose-600',
                    )}
                  >
                    <ClockIcon className="h-3.5 w-3.5" />
                    {dueDateLabel(task.dueDate)}
                  </span>
                </div>

                {/* Attendance risk indicator */}
                {showAtt && (
                  <div className="mt-2 flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className={cn('h-2 w-2 rounded-full', RISK_DOT[risk])}
                    />
                    <span className="text-xs font-medium text-slate-600">
                      {task.subject} attendance: {att!.percent}%
                    </span>
                    <Badge tone={RISK_TONE[risk]}>
                      {RISK_LABEL[risk]}
                    </Badge>
                  </div>
                )}

                {/* Smart recommendation for at-risk subjects */}
                {showRec && (
                  <p className="mt-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700">
                    {attendanceRecommendation(task.subject, att!.percent)}
                  </p>
                )}
              </div>
              <Badge tone={PRIORITY_TONE[task.priority]}>
                {PRIORITY_LABEL[task.priority]}
              </Badge>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
