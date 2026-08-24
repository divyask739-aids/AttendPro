import { useState } from 'react'

import { TaskList } from '@/features/tasks/components/TaskList'
import { useTasks } from '@/hooks/useTasks'
import { cn } from '@/lib/utils'
import type { TaskStatus } from '@/types'

type FilterValue = 'all' | TaskStatus

const FILTERS: Array<{ value: FilterValue; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
]

export function TasksPage() {
  const { tasks, isLoading, isError } = useTasks()
  const [filter, setFilter] = useState<FilterValue>('all')

  const visible = (tasks ?? []).filter(
    (task) => filter === 'all' || task.status === filter,
  )

  return (
    <div>
      <header>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 lg:text-2xl">Tasks</h1>
        <p className="mt-1 text-sm text-slate-500">Assignments, deadlines, and study work.</p>
      </header>

      <div className="mt-5 flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setFilter(item.value)}
            aria-pressed={filter === item.value}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors',
              filter === item.value
                ? 'bg-slate-900 text-white'
                : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {isError ? (
        <p className="mt-6 rounded-2xl bg-rose-50 p-4 text-sm text-rose-600">
          Could not load tasks. Please refresh.
        </p>
      ) : isLoading ? (
        <p className="mt-6 text-sm text-slate-500">Loading tasks...</p>
      ) : (
        <TaskList tasks={visible} className="mt-5" />
      )}
    </div>
  )
}
