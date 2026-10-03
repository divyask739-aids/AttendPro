import { useState } from 'react'

import { useAttendance } from '@/hooks/useAttendance'
import { useTaskMutations } from '@/hooks/useStudentData'
import { addDaysISO, isoToday } from '@/lib/date'
import type { Subject } from '@/types'
import type { Task, TaskPriority, TaskReminder, TaskStatus } from '@/types'

import { REMINDER_OPTIONS, reminderOf } from '../taskMeta'

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100'
const labelClass = 'mb-1 block text-xs font-medium text-slate-600'

interface TaskFormProps {
  email: string
  editing?: Task | null
  /**
   * Called after a successful save. `taskId` is only present when an existing
   * task was edited, so the caller can reset that task's reminder history.
   */
  onDone: (result?: { taskId: string }) => void
}

type FormState = {
  title: string
  description: string
  subjectId: string
  dueDate: string
  estimatedMinutes: number
  priority: TaskPriority
  status: TaskStatus
  reminder: TaskReminder
}

const emptyForm = (): FormState => ({
  title: '',
  description: '',
  subjectId: '',
  dueDate: addDaysISO(isoToday(), 3),
  estimatedMinutes: 60,
  priority: 'medium',
  status: 'todo',
  reminder: 'none',
})

export function TaskForm({ email, editing, onDone }: TaskFormProps) {
  const { summary } = useAttendance(email)
  const { addTask, editTask } = useTaskMutations(email)
  const [form, setForm] = useState<FormState>(() =>
    editing
      ? {
          title: editing.title,
          description: editing.description,
          subjectId: editing.subjectId ?? '',
          dueDate: editing.dueDate,
          estimatedMinutes: editing.estimatedMinutes,
          priority: editing.priority,
          status: editing.status,
          // Older tasks have no reminder — fall back to 'none'.
          reminder: reminderOf(editing),
        }
      : emptyForm(),
  )

  const subjects: Subject[] = summary?.subjects ?? []

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.title.trim()) return

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      // Tasks without a subject are allowed and still work.
      subjectId: form.subjectId || null,
      dueDate: form.dueDate || isoToday(),
      estimatedMinutes: Math.max(15, Number(form.estimatedMinutes) || 60),
      priority: form.priority,
      status: form.status,
      reminder: form.reminder,
    }

    setForm(emptyForm())

    if (editing) {
      await editTask.mutateAsync({ ...editing, ...payload })
      // The task may have a different reminder now, so its history is reset.
      onDone({ taskId: editing.id })
    } else {
      await addTask.mutateAsync(payload)
      // A brand new task has never notified, so no reset is needed.
      onDone()
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">
        {editing ? 'Edit task' : 'Add task'}
      </h2>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="task-title" className={labelClass}>
            Title
          </label>
          <input
            id="task-title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Finish assignment 3"
            className={inputClass}
            required
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="task-desc" className={labelClass}>
            Description (optional)
          </label>
          <input
            id="task-desc"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Chapter 4 exercises"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="task-subject" className={labelClass}>
            Subject
          </label>
          <select
            id="task-subject"
            value={form.subjectId}
            onChange={(e) => setForm({ ...form, subjectId: e.target.value })}
            className={inputClass}
          >
            <option value="">No subject</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="task-priority" className={labelClass}>
            Priority
          </label>
          <select
            id="task-priority"
            value={form.priority}
            onChange={(e) =>
              setForm({ ...form, priority: e.target.value as TaskPriority })
            }
            className={inputClass}
          >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        <div>
          <label htmlFor="task-due" className={labelClass}>
            Deadline
          </label>
          <input
            id="task-due"
            type="date"
            value={form.dueDate}
            onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="task-minutes" className={labelClass}>
            Estimated minutes
          </label>
          <input
            id="task-minutes"
            type="number"
            min={15}
            step={15}
            value={form.estimatedMinutes}
            onChange={(e) => setForm({ ...form, estimatedMinutes: Number(e.target.value) })}
            className={inputClass}
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="task-reminder" className={labelClass}>
            Reminder
          </label>
          <select
            id="task-reminder"
            value={form.reminder}
            onChange={(e) => setForm({ ...form, reminder: e.target.value as TaskReminder })}
            className={inputClass}
          >
            {REMINDER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-slate-400">
            Reminders appear on the Tasks page and, once enabled, as browser notifications.
          </p>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={addTask.isPending || editTask.isPending}
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-60"
        >
          {editing ? 'Save changes' : 'Add task'}
        </button>
        {editing && (
          <button
            type="button"
            onClick={() => onDone()}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
