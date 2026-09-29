/**
 * SINGLE SOURCE OF TRUTH for attendance calculation and risk.
 * Dashboard, Attendance, Tasks, Goal Planner and recommendations all
 * import from here so no page can drift from the others.
 */

import type { BadgeTone } from '@/components/ui/Badge'
import type { ProgressBarTone } from '@/components/ui/ProgressBar'
import type { Subject } from '@/types'

export type AttendanceRisk = 'high' | 'medium' | 'safe'

export const RISK_THRESHOLDS = {
  /** below this % = high risk */
  high: 75,
  /** below this % = medium risk */
  medium: 85,
} as const

export const RISK_LABEL: Record<AttendanceRisk, string> = {
  high: 'High Risk',
  medium: 'Medium Risk',
  safe: 'Safe',
}

export const RISK_DOT: Record<AttendanceRisk, string> = {
  high: 'bg-rose-500',
  medium: 'bg-amber-400',
  safe: 'bg-emerald-500',
}

export const RISK_RING: Record<AttendanceRisk, string> = {
  high: 'bg-rose-500',
  medium: 'bg-amber-500',
  safe: 'bg-emerald-500',
}

export const RISK_TONE: Record<AttendanceRisk, BadgeTone> = {
  high: 'danger',
  medium: 'warning',
  safe: 'success',
}

export function attendancePercent(attended: number, held: number): number {
  if (held <= 0) return 0
  return Math.round((attended / held) * 100)
}

export function subjectPercent(subject: Pick<Subject, 'attended' | 'held'>): number {
  return attendancePercent(subject.attended, subject.held)
}

export function percentToRisk(percent: number): AttendanceRisk {
  if (percent < RISK_THRESHOLDS.high) return 'high'
  if (percent < RISK_THRESHOLDS.medium) return 'medium'
  return 'safe'
}

export function subjectRisk(subject: Pick<Subject, 'attended' | 'held'>): AttendanceRisk {
  return percentToRisk(subjectPercent(subject))
}

export function riskTone(percent: number): ProgressBarTone {
  const risk = percentToRisk(percent)
  if (risk === 'high') return 'rose'
  if (risk === 'medium') return 'amber'
  return 'emerald'
}

export function riskTextColor(percent: number): string {
  const risk = percentToRisk(percent)
  if (risk === 'high') return 'text-rose-600'
  if (risk === 'medium') return 'text-amber-600'
  return 'text-emerald-600'
}

/**
 * Classes the student must attend to reach a healthy percentage,
 * or null when already safe.
 */
export function classesNeededToReach(
  attended: number,
  held: number,
  target = RISK_THRESHOLDS.medium,
): number | null {
  const current = attendancePercent(attended, held)
  if (current >= target) return null
  // Solve: (attended + x) / (held + x) >= target/100
  const need = Math.ceil(
    (target / 100 * held - attended) / (1 - target / 100),
  )
  return need > 0 ? need : null
}

export function attendanceRecommendation(
  subjectName: string,
  percent: number,
): string {
  if (percent < RISK_THRESHOLDS.high) {
    return `Attendance is at risk (${percent}%). Prioritize attending the next ${subjectName} classes.`
  }
  if (percent < RISK_THRESHOLDS.medium) {
    return `Attendance needs attention (${percent}%). Try to maintain regular ${subjectName} attendance.`
  }
  return `Attendance is on track (${percent}%). Focus on completing pending ${subjectName} tasks.`
}
