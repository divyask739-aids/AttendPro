import type { BadgeTone } from '@/components/ui/Badge'
import type { Task, TaskPriority, TaskReminder } from '@/types'

export const PRIORITY_TONE: Record<TaskPriority, BadgeTone> = {
  high: 'danger',
  medium: 'warning',
  low: 'info',
}

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

export const PRIORITY_DOT: Record<TaskPriority, string> = {
  high: 'bg-rose-500',
  medium: 'bg-amber-500',
  low: 'bg-sky-500',
}

export const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  high: 3,
  medium: 2,
  low: 1,
}

export const STATUS_LABEL: Record<string, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
  missed: 'Missed',
}

/* ----------------------------- reminders ---------------------------- */

export interface ReminderOption {
  value: TaskReminder
  label: string
  /** minutes before the deadline; 0 for `none` */
  minutes: number
}

export const REMINDER_OPTIONS: ReminderOption[] = [
  { value: 'none', label: 'No reminder', minutes: 0 },
  { value: '15m', label: '15 minutes before', minutes: 15 },
  { value: '30m', label: '30 minutes before', minutes: 30 },
  { value: '1h', label: '1 hour before', minutes: 60 },
  { value: '1d', label: '1 day before', minutes: 24 * 60 },
]

const REMINDER_MINUTES: Record<TaskReminder, number> = {
  none: 0,
  '15m': 15,
  '30m': 30,
  '1h': 60,
  '1d': 24 * 60,
}

const REMINDER_TEXT: Record<TaskReminder, string> = {
  none: 'No reminder',
  '15m': '15 minutes before',
  '30m': '30 minutes before',
  '1h': '1 hour before',
  '1d': '1 day before',
}

/**
 * Backward compatibility: tasks saved before the reminder feature have no
 * `reminder` field, so a missing value is treated as `'none'`.
 */
export function reminderOf(task: Pick<Task, 'reminder'> | null | undefined): TaskReminder {
  const value = task?.reminder
  return value && value in REMINDER_MINUTES ? value : 'none'
}

export function reminderLabel(reminder: TaskReminder): string {
  return REMINDER_TEXT[reminder]
}

export function reminderMinutes(reminder: TaskReminder): number {
  return REMINDER_MINUTES[reminder]
}

/**
 * Tasks store a date, not a time, so deadlines are treated as this local hour
 * on the due date. A reminder fires `offsetMinutes` before that moment.
 */
export const TASK_DEADLINE_HOUR = 9

export function reminderFireAt(
  dueDate: string,
  reminder: TaskReminder,
  deadlineHour: number = TASK_DEADLINE_HOUR,
): number {
  const due = new Date(`${dueDate}T00:00:00`)
  due.setHours(deadlineHour, 0, 0, 0)
  return due.getTime() - reminderMinutes(reminder) * 60_000
}

export function reminderMessage(
  task: Pick<Task, 'title' | 'dueDate' | 'reminder'>,
  subjectName?: string,
): string {
  const label = reminderLabel(reminderOf(task))
  const subject = subjectName ? ` · ${subjectName}` : ''
  return `${task.title} is due ${label}${subject}`
}
