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

// ---- Attendance risk helpers ----

export type AttendanceRisk = 'high' | 'medium' | 'safe'

export const RISK_LABEL: Record<AttendanceRisk, string> = {
  high: 'High Risk',
  medium: 'Needs Attention',
  safe: 'Safe',
}

export const RISK_DOT: Record<AttendanceRisk, string> = {
  high: 'bg-rose-500',
  medium: 'bg-amber-400',
  safe: 'bg-emerald-500',
}

export const RISK_TONE: Record<AttendanceRisk, BadgeTone> = {
  high: 'danger',
  medium: 'warning',
  safe: 'success',
}

export function percentToRisk(percent: number): AttendanceRisk {
  if (percent < 75) return 'high'
  if (percent < 85) return 'medium'
  return 'safe'
}

export function riskEmoji(risk: AttendanceRisk): string {
  if (risk === 'high') return '\u{1F534}'
  if (risk === 'medium') return '\u{1F7E0}'
  return '\u{1F7E2}'
}

export function attendanceRecommendation(
  subjectName: string,
  percent: number,
): string {
  if (percent < 75)
    return `Attendance is at risk (${percent}%). Prioritize attending the next ${subjectName} classes.`
  if (percent < 85)
    return `Attendance needs attention (${percent}%). Try to maintain regular ${subjectName} attendance.`
  return `Attendance is on track (${percent}%). Focus on completing pending ${subjectName} tasks.`
}
