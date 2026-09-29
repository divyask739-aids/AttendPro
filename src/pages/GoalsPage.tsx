import { useState } from 'react'

import { Badge } from '@/components/ui/Badge'
import { Card, EmptyState } from '@/components/ui/Card'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { useProductivityGoalMutations } from '@/hooks/useStudentData'
import { useProductivityGoals } from '@/hooks/useTasks'
import type { ProductivityGoal } from '@/types'

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100'
const labelClass = 'mb-1 block text-xs font-medium text-slate-600'

const UNIT_OPTIONS = ['tasks', 'pages', 'hours', 'minutes', 'revisions', 'classes']

export function GoalsPage({ email }: { email: string }) {
  const { goals, isLoading } = useProductivityGoals(email)
  const { addGoal, bumpProgress, removeGoal } = useProductivityGoalMutations(email)
  const [title, setTitle] = useState('')
  const [target, setTarget] = useState(10)
  const [unit, setUnit] = useState('tasks')

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!title.trim()) return
    await addGoal.mutateAsync({ title: title.trim(), target, completed: 0, unit })
    setTitle('')
    setTarget(10)
  }

  const achieved = goals.filter((g) => g.completed >= g.target).length

  return (
    <div>
      <header>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 lg:text-2xl">
          Productivity
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Daily goals and streaks — {achieved} of {goals.length} achieved.
        </p>
      </header>

      <div className="mt-4 space-y-4">
        <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Add a productivity goal</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <label htmlFor="goal-title" className={labelClass}>
                Goal
              </label>
              <input
                id="goal-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Revise 5 pages"
                className={inputClass}
                required
              />
            </div>
            <div>
              <label htmlFor="goal-target" className={labelClass}>
                Target
              </label>
              <input
                id="goal-target"
                type="number"
                min={1}
                value={target}
                onChange={(e) => setTarget(Math.max(1, Number(e.target.value)))}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="goal-unit" className={labelClass}>
                Unit
              </label>
              <select
                id="goal-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className={inputClass}
              >
                {UNIT_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            type="submit"
            disabled={addGoal.isPending}
            className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-60"
          >
            {addGoal.isPending ? 'Adding...' : 'Add goal'}
          </button>
        </form>

        {isLoading ? (
          <p className="text-sm text-slate-500">Loading goals...</p>
        ) : goals.length === 0 ? (
          <EmptyState
            title="No productivity goals yet."
            description="Add a goal above to start tracking your daily progress and streaks."
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {goals.map((goal) => (
              <GoalRow
                key={goal.id}
                goal={goal}
                onBump={(completed) => void bumpProgress.mutateAsync({ id: goal.id, completed })}
                onDelete={() => void removeGoal.mutateAsync(goal.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function GoalRow({
  goal,
  onBump,
  onDelete,
}: {
  goal: ProductivityGoal
  onBump: (completed: number) => void
  onDelete: () => void
}) {
  const done = goal.completed >= goal.target
  const percent = Math.min(100, Math.round((goal.completed / Math.max(1, goal.target)) * 100))

  return (
    <li>
      <Card>
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-slate-900">{goal.title}</p>
          {done ? <Badge tone="success">Achieved</Badge> : <Badge tone="info">{percent}%</Badge>}
        </div>
        <ProgressBar
          value={goal.completed}
          max={Math.max(1, goal.target)}
          tone={done ? 'emerald' : 'indigo'}
          className="mt-3"
          label={goal.title}
        />
        <p className="mt-1.5 text-xs text-slate-500">
          {goal.completed}/{goal.target} {goal.unit}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onBump(Math.max(0, goal.completed - 1))}
            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600"
          >
            -1
          </button>
          <button
            type="button"
            onClick={() => onBump(goal.completed + 1)}
            className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white"
          >
            +1
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="ml-auto rounded-lg px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
          >
            Delete
          </button>
        </div>
      </Card>
    </li>
  )
}
