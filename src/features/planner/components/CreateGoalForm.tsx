import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { usePlannerMutations } from '@/hooks/usePlanner'
import { CATEGORY_LABEL } from '@/features/planner/plannerMeta'
import { addDaysISO, isoToday } from '@/lib/date'
import type { GoalCategory, NewGoalInput } from '@/features/planner/types'
import type { TaskPriority } from '@/types'

const schema = z.object({
  name: z.string().min(3, 'Give your goal a name').max(80),
  category: z.enum(['exam', 'assignment', 'project', 'skill', 'revision', 'other']),
  deadline: z.string().min(1, 'Pick a deadline'),
  priority: z.enum(['low', 'medium', 'high']),
  dailyMinutes: z.coerce.number().min(15).max(720),
})

type FormValues = z.infer<typeof schema>

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100'
const labelClass = 'mb-1 block text-xs font-medium text-slate-600'

export function CreateGoalForm({ email }: { email: string }) {
  const { createGoal } = usePlannerMutations(email)
  const [created, setCreated] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema) as unknown as import('react-hook-form').Resolver<FormValues>,
    defaultValues: {
      name: '',
      category: 'exam',
      deadline: addDaysISO(isoToday(), 14),
      priority: 'medium',
      dailyMinutes: 60,
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    const input: NewGoalInput = {
      name: values.name.trim(),
      category: values.category as GoalCategory,
      deadline: values.deadline,
      priority: values.priority as TaskPriority,
      dailyMinutes: values.dailyMinutes,
    }
    await createGoal.mutateAsync(input)
    reset()
    setCreated(true)
    window.setTimeout(() => setCreated(false), 3000)
  })

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <h2 className="text-sm font-semibold text-slate-900">Create a goal</h2>
      <p className="mt-0.5 text-xs text-slate-500">
        The planner breaks it into daily milestones based on your deadline and study time.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="goal-name" className={labelClass}>
            Goal name
          </label>
          <input
            id="goal-name"
            placeholder="Organic Chemistry exam"
            className={inputClass}
            {...register('name')}
          />
          {errors.name && <p className="mt-1 text-xs text-rose-600">{errors.name.message}</p>}
        </div>

        <div>
          <label htmlFor="goal-category" className={labelClass}>
            Category
          </label>
          <select id="goal-category" className={inputClass} {...register('category')}>
            {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="goal-priority" className={labelClass}>
            Priority
          </label>
          <select id="goal-priority" className={inputClass} {...register('priority')}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>

        <div>
          <label htmlFor="goal-deadline" className={labelClass}>
            Deadline
          </label>
          <input
            id="goal-deadline"
            type="date"
            className={inputClass}
            {...register('deadline')}
          />
        </div>

        <div>
          <label htmlFor="goal-minutes" className={labelClass}>
            Daily study minutes
          </label>
          <input
            id="goal-minutes"
            type="number"
            min={15}
            step={15}
            className={inputClass}
            {...register('dailyMinutes')}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={createGoal.isPending}
        className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-60"
      >
        {createGoal.isPending ? 'Building plan...' : 'Create goal'}
      </button>

      {created && (
        <p className="mt-2 text-xs font-medium text-emerald-600">
          Goal created — milestones added to your plan.
        </p>
      )}
    </form>
  )
}
