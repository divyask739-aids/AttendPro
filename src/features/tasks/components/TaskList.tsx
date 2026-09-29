import { Badge } from '@/components/ui/Badge'
import { ClockIcon } from '@/components/icons'
import { PRIORITY_DOT, PRIORITY_LABEL, PRIORITY_TONE } from '@/features/tasks/taskMeta'
import { RISK_DOT, RISK_LABEL, RISK_TONE } from '@/lib/attendance'
import { attendanceRecommendation } from '@/lib/attendance'
import { cn, daysUntil, dueDateLabel } from '@/lib/utils'
import type { SubjectStats } from '@/hooks/useAttendance'
import type { Task, TaskStatus } from '@/types'

const STATUS_TONE: Record<TaskStatus, 'neutral' | 'info' | 'success' | 'danger'> = {
  todo: 'neutral',
  in_progress: 'info',
  done: 'success',
  missed: 'danger',
}

interface TaskListProps {
  tasks: Task[]
  bySubjectId: Map<string, SubjectStats>
  onToggleStatus: (task: Task, next: TaskStatus) => void
  onEdit: (task: Task) => void
  onDelete: (task: Task) => void
  emptyMessage?: string
}

export function TaskList({
  tasks,
  bySubjectId,
  onToggleStatus,
  onEdit,
  onDelete,
  emptyMessage = 'No tasks here yet.',
}: TaskListProps) {
  if (tasks.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <p className="text-sm font-medium text-slate-600">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <ul className="space-y-3">
      {tasks.map((task) => {
        const overdue = task.status !== 'done' && daysUntil(task.dueDate) < 0
        const subject = task.subjectId ? bySubjectId.get(task.subjectId) : undefined
        const isDone = task.status === 'done'
        // At-risk subject + high priority = visually highlighted.
        const highlight = !isDone && subject?.risk === 'high' && task.priority === 'high'

        return (
          <li
            key={task.id}
            className={cn(
              'rounded-2xl border bg-white p-4 shadow-sm',
              highlight ? 'border-rose-300 ring-1 ring-rose-100' : 'border-slate-200',
            )}
          >
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
                    isDone ? 'text-slate-400 line-through' : 'text-slate-800',
                  )}
                >
                  {task.title}
                </p>

                {task.description && (
                  <p className="mt-0.5 text-xs text-slate-500">{task.description}</p>
                )}

                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                  <span>{subject ? subject.name : 'No subject'}</span>
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
                  {task.estimatedMinutes > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{task.estimatedMinutes}m</span>
                    </>
                  )}
                </div>

                {/* Attendance risk beside the task */}
                {subject && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span
                      aria-hidden="true"
                      className={cn('h-2 w-2 rounded-full', RISK_DOT[subject.risk])}
                    />
                    <span className="text-xs font-medium text-slate-600">
                      {subject.name} attendance: {subject.percent}%
                    </span>
                    <Badge tone={RISK_TONE[subject.risk]}>{RISK_LABEL[subject.risk]}</Badge>
                  </div>
                )}

                {/* Smart recommendation from real attendance data */}
                {subject && subject.risk !== 'safe' && !isDone && (
                  <p
                    className={cn(
                      'mt-1.5 rounded-lg px-2.5 py-1.5 text-xs',
                      subject.risk === 'high'
                        ? 'bg-rose-50 text-rose-700'
                        : 'bg-amber-50 text-amber-700',
                    )}
                  >
                    {attendanceRecommendation(subject.name, subject.percent)}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <Badge tone={PRIORITY_TONE[task.priority]}>
                  {PRIORITY_LABEL[task.priority]}
                </Badge>
                <Badge tone={STATUS_TONE[task.status]}>
                  {task.status === 'in_progress'
                    ? 'In progress'
                    : task.status.charAt(0).toUpperCase() + task.status.slice(1)}
                </Badge>
                <div className="mt-1 flex gap-1">
                  <button
                    type="button"
                    onClick={() => onToggleStatus(task, isDone ? 'todo' : 'done')}
                    className="rounded-lg px-2 py-1 text-xs font-semibold text-emerald-600 hover:bg-emerald-50"
                  >
                    {isDone ? 'Undo' : 'Done'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onEdit(task)}
                    className="rounded-lg px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(task)}
                    className="rounded-lg px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
