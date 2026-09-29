import type { ProgressBarTone } from '@/components/ui/ProgressBar'
import type { BadgeTone } from '@/components/ui/Badge'
import { addDaysISO, daysUntilFrom, isoToday, makeId } from '@/lib/date'
import type { GoalCategory, GoalStatus } from './types'
import type { TaskPriority } from '@/types'

export const CATEGORY_LABEL: Record<GoalCategory, string> = {
  exam: 'Exam prep',
  assignment: 'Assignment',
  project: 'Project',
  skill: 'Skill',
  revision: 'Revision',
  other: 'Other',
}

export const STATUS_LABEL: Record<GoalStatus, string> = {
  on_track: 'On Track',
  needs_attention: 'Needs Attention',
  at_risk: 'At Risk',
  completed: 'Completed',
}

export const STATUS_TONE: Record<GoalStatus, BadgeTone> = {
  on_track: 'success',
  needs_attention: 'warning',
  at_risk: 'danger',
  completed: 'info',
}

export function goalStatusTone(status: GoalStatus): ProgressBarTone {
  switch (status) {
    case 'completed':
      return 'emerald'
    case 'at_risk':
      return 'rose'
    case 'needs_attention':
      return 'amber'
    default:
      return 'indigo'
  }
}

/** Average estimated effort per category, scaled by priority. */
const BASE_MINUTES: Record<GoalCategory, number> = {
  exam: 420,
  assignment: 180,
  project: 540,
  skill: 360,
  revision: 240,
  other: 180,
}

const PRIORITY_MULTIPLIER: Record<TaskPriority, number> = {
  high: 1.25,
  medium: 1,
  low: 0.85,
}

export function estimateTotalMinutes(
  category: GoalCategory,
  priority: TaskPriority,
): number {
  const raw = BASE_MINUTES[category] * PRIORITY_MULTIPLIER[priority]
  return Math.round(raw / 15) * 15
}

export { addDaysISO, daysUntilFrom, isoToday, makeId }
