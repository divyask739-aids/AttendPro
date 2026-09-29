import { useMemo, useState } from 'react'

import { RecommendationsCard } from '@/components/RecommendationsCard'
import { TaskForm } from '@/features/tasks/components/TaskForm'
import { TaskList } from '@/features/tasks/components/TaskList'
import { useAttendance } from '@/hooks/useAttendance'
import { useRecommendations } from '@/hooks/useRecommendations'
import { useTaskMutations } from '@/hooks/useStudentData'
import { useTasks } from '@/hooks/useTasks'
import type { Task, TaskStatus } from '@/types'

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'missed', label: 'Missed' },
  { value: 'done', label: 'Done' },
] as const

type Filter = (typeof FILTERS)[number]['value']

export function TasksPage({ email }: { email: string }) {
  const { tasks, isLoading } = useTasks(email)
  const { summary } = useAttendance(email)
  const { recommendations } = useRecommendations(email)
  const { setStatus, removeTask, rescheduleMissed } = useTaskMutations(email)
  const [filter, setFilter] = useState<Filter>('all')
  const [editing, setEditing] = useState<Task | null>(null)
  const [showForm, setShowForm] = useState(true)

  const visible = useMemo(
    () => (filter === 'all' ? tasks : tasks.filter((t) => t.status === filter)),
    [tasks, filter],
  )

  const missedCount = tasks.filter((t) => t.status === 'missed').length

  return (
    <div>
      <header>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 lg:text-2xl">Tasks</h1>
        <p className="mt-1 text-sm text-slate-500">
          Tasks stay connected to your subjects and attendance risk.
        </p>
      </header>

      <div className="mt-4 space-y-4">
        {showForm || editing ? (
          <TaskForm
            email={email}
            editing={editing}
            onDone={() => {
              setEditing(null)
              setShowForm(false)
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="w-full rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-indigo-600 hover:border-indigo-300"
          >
            + Add a task
          </button>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              aria-pressed={filter === option.value}
              className={
                filter === option.value
                  ? 'rounded-full bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white'
                  : 'rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600'
              }
            >
              {option.label}
            </button>
          ))}

          {missedCount > 0 && (
            <button
              type="button"
              onClick={() => void rescheduleMissed.mutateAsync(180)}
              disabled={rescheduleMissed.isPending}
              className="ml-auto rounded-full bg-amber-500 px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
            >
              {rescheduleMissed.isPending ? 'Rescheduling...' : `Reschedule ${missedCount} missed`}
            </button>
          )}
        </div>

        {isLoading ? (
          <p className="text-sm text-slate-500">Loading tasks...</p>
        ) : (
          <TaskList
            tasks={visible}
            bySubjectId={summary?.bySubjectId ?? new Map()}
            onToggleStatus={(task, next: TaskStatus) =>
              void setStatus.mutateAsync({ id: task.id, status: next })
            }
            onEdit={setEditing}
            onDelete={(task) => void removeTask.mutateAsync(task.id)}
            emptyMessage={
              filter === 'all'
                ? 'No tasks yet. Add your first task above.'
                : `No ${filter.replace('_', ' ')} tasks.`
            }
          />
        )}

        <RecommendationsCard
          title="Task Recommendations"
          description="Derived from your attendance and deadlines"
          recommendations={recommendations}
        />
      </div>
    </div>
  )
}
