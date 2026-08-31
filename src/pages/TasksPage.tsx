import { useMemo, useState } from 'react'

import { SparklesIcon } from '@/components/icons'
import { TaskList } from '@/features/tasks/components/TaskList'
import {
  RISK_DOT,
  RISK_LABEL,
  RISK_TONE,
  attendanceRecommendation,
  percentToRisk,
} from '@/features/tasks/taskMeta'
import { useAttendance } from '@/hooks/useAttendance'
import { useTasks } from '@/hooks/useTasks'
import { cn } from '@/lib/utils'
import type { TaskStatus } from '@/types'
import { Badge } from '@/components/ui/Badge'

type FilterValue = 'all' | TaskStatus

const FILTERS: Array<{ value: FilterValue; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
]

export function TasksPage() {
  const { tasks, isLoading, isError } = useTasks()
  const { stats: attendanceStats } = useAttendance()
  const [filter, setFilter] = useState<FilterValue>('all')

  const visible = (tasks ?? []).filter(
    (task) => filter === 'all' || task.status === filter,
  )

  const subjectAttendance = useMemo(() => {
    if (!attendanceStats) return undefined
    const map = new Map<string, { percent: number }>()
    for (const subject of attendanceStats.subjects) {
      map.set(subject.name, { percent: subject.percent })
    }
    return map
  }, [attendanceStats])

  const recommendations = useMemo(() => {
    if (!subjectAttendance) return []
    const recs: Array<{ subject: string; percent: number; message: string }> = []
    const seen = new Set<string>()
    for (const task of tasks ?? []) {
      if (task.status === 'done' || seen.has(task.subject)) continue
      const att = subjectAttendance.get(task.subject)
      if (!att) continue
      const risk = percentToRisk(att.percent)
      if (risk === 'safe') continue
      seen.add(task.subject)
      recs.push({
        subject: task.subject,
        percent: att.percent,
        message: attendanceRecommendation(task.subject, att.percent),
      })
    }
    return recs
  }, [tasks, subjectAttendance])

  return (
    <div>
      <header>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 lg:text-2xl">Tasks</h1>
        <p className="mt-1 text-sm text-slate-500">Assignments, deadlines, and study work.</p>
      </header>

      {/* Attendance-aware recommendations */}
      {recommendations.length > 0 && (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2">
            <SparklesIcon className="h-4 w-4 text-amber-600" />
            <h2 className="text-sm font-semibold text-amber-800">Attendance & Task Recommendations</h2>
          </div>
          <ul className="mt-2 space-y-2">
            {recommendations.map((rec) => {
              const risk = percentToRisk(rec.percent)
              return (
                <li key={rec.subject} className="flex items-start gap-2.5">
                  <span
                    aria-hidden="true"
                    className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', RISK_DOT[risk])}
                  />
                  <div>
                    <span className="text-xs font-semibold text-slate-700">
                      {rec.subject} ({rec.percent}%)
                    </span>
                    <Badge tone={RISK_TONE[risk]} className="ml-1.5">
                      {RISK_LABEL[risk]}
                    </Badge>
                    <p className="mt-0.5 text-xs text-amber-700">{rec.message}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

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
        <TaskList tasks={visible} subjectAttendance={subjectAttendance} className="mt-5" />
      )}
    </div>
  )
}
