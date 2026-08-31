import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, type Resolver } from 'react-hook-form'
import { z } from 'zod'

import { Card } from '@/components/ui/Card'
import { CATEGORY_LABEL } from '@/features/planner/plannerMeta'
import { daysUntilFrom, isoToday } from '@/features/planner/plannerMeta'
import { usePlannerMutations } from '@/hooks/usePlanner'
import type { GoalCategory } from '@/features/planner/types'
import type { TaskPriority } from '@/types'

const CATEGORIES = Object.keys(CATEGORY_LABEL) as GoalCategory[]
const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high']

const goalSchema = z.object({
  name: z.string().min(3, 'Use at least 3 characters').max(80, 'Keep it under 80 characters'),
  category: z.enum(['exam', 'assignment', 'project', 'skill', 'revision', 'other']),
  deadline: z
    .string()
    .min(1, 'Pick a deadline')
    .refine(
      (value) => daysUntilFrom(isoToday(), value) >= 0,
      'Deadline must be today or later',
    ),
  priority: z.enum(['low', 'medium', 'high']),
  dailyMinutes: z.coerce
    .number()
    .int('Whole minutes only')
    .min(15, 'At least 15 min/day')
    .max(480, 'Max 480 min/day'),
})

type GoalFormValues = z.infer<typeof goalSchema>

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100'

const labelClass = 'mb-1 block text-xs font-medium text-slate-600'

const errorClass = 'mt-1 text-xs text-rose-600'

export function CreateGoalForm() {
  const { createGoal } = usePlannerMutations()

  const {
    register,
    reset,
    handleSubmit,
    formState: { errors },
  } = useForm<GoalFormValues>({
    resolver: zodResolver(goalSchema) as unknown as Resolver<GoalFormValues>,
    defaultValues: {
      name: '',
      category: 'exam',
      deadline: '',
      priority: 'medium',
      dailyMinutes: 60,
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    await createGoal.mutateAsync(values)
    reset()
  })

  return (
    <Card title="New goal" description="It gets broken into daily tasks automatically">
      <form onSubmit={onSubmit} className="space-y-3" noValidate>
        <div>
          <label htmlFor="goal-name" className={labelClass}>
            Goal name
          </label>
          <input
            id="goal-name"
            type="text"
            placeholder="e.g. Prepare for OS midterm"
            className={inputClass}
            {...register('name')}
          />
          {errors.name && <p className={errorClass}>{errors.name.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="goal-category" className={labelClass}>
              Category
            </label>
            <select id="goal-category" className={inputClass} {...register('category')}>
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {CATEGORY_LABEL[category]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="goal-priority" className={labelClass}>
              Priority
            </label>
            <select id="goal-priority" className={inputClass} {...register('priority')}>
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {priority[0].toUpperCase() + priority.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="goal-deadline" className={labelClass}>
              Deadline
            </label>
            <input
              id="goal-deadline"
              type="date"
              min={isoToday()}
              className={inputClass}
              {...register('deadline')}
            />
            {errors.deadline && <p className={errorClass}>{errors.deadline.message}</p>}
          </div>
          <div>
            <label htmlFor="goal-minutes" className={labelClass}>
              Study time / day
            </label>
            <input
              id="goal-minutes"
              type="number"
              min={15}
              max={480}
              step={15}
              placeholder="60"
              className={inputClass}
              {...register('dailyMinutes')}
            />
            {errors.dailyMinutes && (
              <p className={errorClass}>{errors.dailyMinutes.message}</p>
            )}
          </div>
        </div>

        <button
          type="submit"
          disabled={createGoal.isPending}
          className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {createGoal.isPending ? 'Creating plan...' : 'Create goal & plan'}
        </button>
      </form>
    </Card>
  )
}
