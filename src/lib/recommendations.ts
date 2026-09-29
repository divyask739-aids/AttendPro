/**
 * Personalized recommendations.
 *
 * Combines attendance (single source of truth), tasks and goals.
 * Rule-based today — the shape (`Recommendation[]`) is what an AI service
 * would return, so swapping the implementation changes nothing upstream.
 */

import {
  RISK_THRESHOLDS,
  attendancePercent,
  percentToRisk,
} from '@/lib/attendance'
import { daysUntilFrom, isoToday } from '@/lib/date'
import type { Subject } from '@/types'
import type { Recommendation } from '@/types'
import type { Task } from '@/types'

export interface RecommendationInput {
  subjects: Subject[]
  tasks: Task[]
  today?: string
}

export function buildRecommendations({
  subjects,
  tasks,
  today = isoToday(),
}: RecommendationInput): Recommendation[] {
  const out: Recommendation[] = []
  const pending = tasks.filter((task) => task.status !== 'done')

  if (subjects.length === 0) {
    out.push({
      id: 'no-subjects',
      tone: 'info',
      message: 'No subjects added yet. Add your first subject to start tracking attendance.',
    })
    return out
  }

  // --- attendance-driven advice, worst subject first ---
  const scored = subjects
    .map((subject) => ({
      subject,
      percent: attendancePercent(subject.attended, subject.held),
    }))
    .filter((entry) => entry.subject.held > 0)
    .sort((a, b) => a.percent - b.percent)

  const worst = scored[0]
  if (worst && worst.percent < RISK_THRESHOLDS.high) {
    out.push({
      id: 'attendance-high-risk',
      tone: 'danger',
      message: `${worst.subject.name} attendance is at risk (${worst.percent}%). Prioritize attending upcoming ${worst.subject.name} classes.`,
    })
  }

  const mediumRisk = scored.filter(
    (entry) =>
      entry.percent >= RISK_THRESHOLDS.high &&
      entry.percent < RISK_THRESHOLDS.medium,
  )
  if (worst && worst.percent >= RISK_THRESHOLDS.high && mediumRisk.length > 0) {
    out.push({
      id: 'attendance-medium-risk',
      tone: 'warning',
      message: `${mediumRisk
        .map((entry) => entry.subject.name)
        .slice(0, 2)
        .join(' and ')} attendance needs attention. Try to maintain regular attendance in ${
          mediumRisk.length > 1 ? 'these subjects' : mediumRisk[0]?.subject.name
        }.`,
    })
  }

  if (scored.length > 0 && scored.every((entry) => entry.percent >= RISK_THRESHOLDS.medium)) {
    out.push({
      id: 'attendance-safe',
      tone: 'success',
      message: 'Attendance is on track across your subjects. Focus on clearing pending tasks.',
    })
  }

  // --- cross-signal: at-risk subject with related pending work ---
  if (worst && worst.percent < RISK_THRESHOLDS.high) {
    const related = pending.find(
      (task) => task.subjectId !== null && findSubjectName(subjects, task.subjectId) === worst.subject.name,
    )
    if (related) {
      out.push({
        id: 'attendance-plus-task',
        tone: 'warning',
        message: `${worst.subject.name} attendance is at risk (${worst.percent}%). Attend upcoming classes while completing "${related.title}".`,
      })
    }
  }

  // --- task-driven advice ---
  const overdue = pending.filter((task) => daysUntilFrom(today, task.dueDate) < 0)
  const dueToday = pending.filter((task) => daysUntilFrom(today, task.dueDate) === 0)
  const highPriority = pending
    .filter((task) => task.priority === 'high')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))

  if (overdue.length > 0) {
    out.push({
      id: 'tasks-overdue',
      tone: 'warning',
      message: `${overdue.length} task${overdue.length === 1 ? '' : 's'} overdue. Reschedule them from Today's Plan so your daily study time stays realistic.`,
    })
  }

  if (dueToday.length > 0) {
    out.push({
      id: 'tasks-today',
      tone: 'info',
      message: `${dueToday.length} task${dueToday.length === 1 ? '' : 's'} due today. Clear them first in Today's Plan.`,
    })
  }

  if (highPriority.length > 0 && scored.every((entry) => entry.percent >= RISK_THRESHOLDS.high)) {
    out.push({
      id: 'tasks-high-priority',
      tone: 'info',
      message: `Next high-priority task: "${highPriority[0]?.title}". Your attendance is stable, so protect time for it.`,
    })
  }

  if (pending.length === 0 && subjects.length > 0) {
    out.push({
      id: 'all-clear',
      tone: 'success',
      message: 'No pending tasks. Great work — consider planning your next goal.',
    })
  }

  return out.slice(0, 5)
}

function findSubjectName(subjects: Subject[], subjectId: string | null): string | undefined {
  if (!subjectId) return undefined
  return subjects.find((subject) => subject.id === subjectId)?.name
}

export { percentToRisk }
