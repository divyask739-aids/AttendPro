import type { BadgeTone } from '@/components/ui/Badge'
import type { GoalCategory, GoalStatus, PlannerGoal, PlanItem } from './types'

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

/** Average estimated effort per category, scaled by priority. */
const BASE_MINUTES: Record<GoalCategory, number> = {
  exam: 420,
  assignment: 180,
  project: 540,
  skill: 360,
  revision: 240,
  other: 180,
}

const PRIORITY_MULTIPLIER = { high: 1.25, medium: 1, low: 0.85 } as const

export function estimateTotalMinutes(
  category: GoalCategory,
  priority: PlannerGoal['priority'],
): number {
  const raw = BASE_MINUTES[category] * PRIORITY_MULTIPLIER[priority]
  return Math.round(raw / 15) * 15
}

/**
 * Urgency score used to decide what lands on today's plan first.
 * Deliberately simple and deterministic so a real AI scorer can be
 * swapped in later behind the same signature.
 */
export function urgencyScore(item: Pick<PlanItem, 'dueDate' | 'priority'>): number {
  const weights = { high: 6, medium: 4, low: 2 } as const
  const daysLeft = Math.max(0, daysUntilFrom(isoToday(), item.dueDate))
  return weights[item.priority] * 2 + 10 / (daysLeft + 1)
}

// -- local date helpers (kept private to avoid coupling with utils cycle) --

export function isoToday(): string {
  return toISO(new Date())
}

export function toISO(date: Date): string {
  const [iso] = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .split('T')
  return iso ?? ''
}

export function daysUntilFrom(fromISO: string, targetISO: string): number {
  const from = new Date(`${fromISO}T00:00:00`)
  const target = new Date(`${targetISO}T00:00:00`)
  return Math.round((target.getTime() - from.getTime()) / 86_400_000)
}

export function addDaysISO(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00`)
  date.setDate(date.getDate() + days)
  return toISO(date)
}

export function makeId(prefix: string): string {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${prefix}-${uuid}`
}
