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
