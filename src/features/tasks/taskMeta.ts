import type { BadgeTone } from '@/components/ui/Badge'
import type { TaskPriority } from '@/types'

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
