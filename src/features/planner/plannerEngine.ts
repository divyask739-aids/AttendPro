/**
 * Rule-based planning engine — the adaptive core of AttendPro.
 *
 * Every function is pure and deterministic, so an AI service can later
 * replace or augment them behind the same signatures.
 *
 *   tasks + goals + deadlines + priority + study time + attendance risk
 *        -> milestones, today's plan, rescheduling, status, suggestions
 */

import { PRIORITY_WEIGHT } from '@/features/tasks/taskMeta'
import { RISK_THRESHOLDS } from '@/lib/attendance'
import { addDaysISO, daysUntilFrom, isoToday, makeId } from '@/lib/date'
import type { SubjectStats } from '@/hooks/useAttendance'
import type { Recommendation, Task, TaskPriority } from '@/types'

import { estimateTotalMinutes } from './plannerMeta'
import type {
  GoalStatus,
  Milestone,
  NewGoalInput,
  PlannerGoal,
  Suggestion,
  TodayPlan,
  TodayPlanEntry,
} from './types'

const CHUNK_MINUTES = 45

/* ------------------------------------------------------------------ *
 * 1. Goal -> milestones                                                *
 * ------------------------------------------------------------------ */

export function generateMilestones(
  goalId: string,
  input: NewGoalInput,
  today = isoToday(),
): Milestone[] {
  const total = estimateTotalMinutes(input.category, input.priority)
  const daysAvailable = Math.max(1, daysUntilFrom(today, input.deadline))
  const maxCount = Math.min(12, daysAvailable * 3)
  const count = Math.min(maxCount, Math.max(2, Math.ceil(total / CHUNK_MINUTES)))
  const baseSize = Math.max(15, Math.round(total / count / 15) * 15)

  const capacity = new Map<string, number>()
  for (let day = 1; day <= daysAvailable; day++) {
    capacity.set(addDaysISO(today, day), input.dailyMinutes)
  }

  const milestones: Milestone[] = []
  let remaining = total
  for (let index = 0; index < count; index++) {
    const isLast = index === count - 1
    const rawSize = isLast ? remaining : Math.min(baseSize, remaining)
    const estimatedMinutes = Math.max(15, Math.round(rawSize / 15) * 15)
    remaining -= estimatedMinutes

    let dueDate = input.deadline
    for (const [day, dayCapacity] of capacity) {
      if (day <= input.deadline && dayCapacity >= estimatedMinutes) {
        dueDate = day
        capacity.set(day, dayCapacity - estimatedMinutes)
        break
      }
    }

    milestones.push({
      id: makeId('ms'),
      goalId,
      title: `${input.name} · part ${index + 1}`,
      estimatedMinutes,
      dueDate,
      status: 'pending',
    })
  }

  return milestones
}

/* ------------------------------------------------------------------ *
 * 2. Progress + status                                                 *
 * ------------------------------------------------------------------ */

export interface GoalProgress {
  percent: number
  completed: number
  total: number
  remaining: number
  daysLeft: number
}

export function computeProgress(goal: PlannerGoal, today = isoToday()): GoalProgress {
  const total = goal.milestones.length
  const completed = goal.milestones.filter((m) => m.status === 'completed').length
  return {
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
    completed,
    total,
    remaining: total - completed,
    daysLeft: daysUntilFrom(today, goal.deadline),
  }
}

export function computeGoalStatus(goal: PlannerGoal, today = isoToday()): GoalStatus {
  const milestones = goal.milestones
  if (milestones.length === 0) return 'on_track'
  if (milestones.every((m) => m.status === 'completed')) return 'completed'

  const total = milestones.length
  const completed = milestones.filter((m) => m.status === 'completed').length
  const expectedDone = milestones.filter((m) => m.dueDate <= today).length
  const behind = expectedDone / total - completed / total
  const daysLeft = daysUntilFrom(today, goal.deadline)

  if (daysLeft < 0) return 'at_risk'
  if (behind <= 0.05) return 'on_track'
  if (daysLeft <= 3 || behind > 0.25) return 'at_risk'
  return 'needs_attention'
}

/* ------------------------------------------------------------------ *
 * 3. Missed-task rescheduling (respects daily study time)              *
 * ------------------------------------------------------------------ */

/**
 * Overdue tasks are never deleted — they are marked `missed` and their
 * deadlines are pushed forward across future days within the daily budget.
 */
export function rescheduleMissedWork(
  tasks: Task[],
  today = isoToday(),
  dailyStudyMinutes = 180,
): { rescheduledTasks: Task[]; rescheduledCount: number } {
  let rescheduledCount = 0

  const rescheduledTasks = tasks.map((task) => {
    const isOverdue =
      (task.status === 'todo' || task.status === 'in_progress') &&
      daysUntilFrom(today, task.dueDate) < 0
    if (!isOverdue) return task

    rescheduledCount += 1
    const perDay = Math.max(1, Math.floor(dailyStudyMinutes / 60))
    // Spread the recovered work over the next few days, capped by priority.
    const spreadDays = task.priority === 'high' ? 1 : task.priority === 'medium' ? 2 : 3
    void perDay
    const nextDue = addDaysISO(today, spreadDays)
    return { ...task, status: 'missed' as const, dueDate: nextDue }
  })

  return { rescheduledTasks, rescheduledCount }
}

/* ------------------------------------------------------------------ *
 * 4. Today's plan (tasks + milestones, attendance-aware, time-capped)  *
 * ------------------------------------------------------------------ */

export interface BuildTodayPlanInput {
  tasks: Task[]
  goals: PlannerGoal[]
  dailyStudyMinutes: number
  riskBySubjectId: Map<string, SubjectStats>
  today?: string
}

export function buildTodayPlan({
  tasks,
  goals,
  dailyStudyMinutes,
  riskBySubjectId,
  today = isoToday(),
}: BuildTodayPlanInput): TodayPlan {
  const budgetMinutes = Math.max(30, dailyStudyMinutes)

  const candidates: TodayPlanEntry[] = []

  for (const task of tasks) {
    if (task.status === 'done') continue
    const subjectStats = task.subjectId ? riskBySubjectId.get(task.subjectId) : undefined
    candidates.push({
      id: `task:${task.id}`,
      source: 'task',
      title: task.title,
      context: subjectStats?.name ?? (task.status === 'missed' ? 'Rescheduled' : 'General'),
      priority: task.priority,
      estimatedMinutes: Math.max(15, task.estimatedMinutes),
      dueDate: task.dueDate,
      risk: subjectStats?.risk,
      subjectId: task.subjectId,
    })
  }

  for (const goal of goals) {
    if (computeGoalStatus(goal, today) === 'completed') continue
    for (const milestone of goal.milestones) {
      if (milestone.status !== 'pending') continue
      candidates.push({
        id: `milestone:${milestone.id}`,
        source: 'milestone',
        title: milestone.title,
        context: goal.name,
        priority: goal.priority,
        estimatedMinutes: milestone.estimatedMinutes,
        dueDate: milestone.dueDate,
        goalId: goal.id,
      })
    }
  }

  const scored = [...candidates].sort((a, b) => score(b, today) - score(a, today))

  const entries: TodayPlanEntry[] = []
  let plannedMinutes = 0
  for (const entry of scored) {
    if (plannedMinutes + entry.estimatedMinutes > budgetMinutes) continue
    entries.push(entry)
    plannedMinutes += entry.estimatedMinutes
  }

  return {
    entries,
    plannedMinutes,
    budgetMinutes,
    rescheduledCount: tasks.filter((t) => t.status === 'missed').length,
  }
}

function score(entry: TodayPlanEntry, today: string): number {
  const daysLeft = Math.max(0, daysUntilFrom(today, entry.dueDate))
  const urgency = 12 / (daysLeft + 1)
  const priority = PRIORITY_WEIGHT[entry.priority] * 3
  // Attendance risk pulls at-risk subject work forward.
  const riskBoost = entry.risk === 'high' ? 10 : entry.risk === 'medium' ? 5 : 0
  const missedBoost = entry.source === 'task' ? 2 : 0
  return urgency + priority + riskBoost + missedBoost
}

/* ------------------------------------------------------------------ *
 * 5. Suggestions (rule-based now, AI-ready output shape)               *
 * ------------------------------------------------------------------ */

export function getPlannerSuggestions({
  goals,
  attendancePercent,
  plan,
  tasks = [],
  today = isoToday(),
}: {
  goals: PlannerGoal[]
  attendancePercent: number
  plan: TodayPlan
  tasks?: Task[]
  today?: string
}): Suggestion[] {
  const out: Suggestion[] = []

  if (goals.length === 0 && tasks.length === 0) {
    out.push({
      id: 'planner-start',
      tone: 'info',
      message:
        'Create your first goal — the planner breaks it into daily tasks automatically.',
    })
    return out
  }

  if (attendancePercent < RISK_THRESHOLDS.high) {
    out.push({
      id: 'planner-attendance',
      tone: 'danger',
      message: `Attendance is at risk (${attendancePercent}%). Attend classes before adding extra study blocks.`,
    })
  } else if (attendancePercent >= RISK_THRESHOLDS.medium) {
    out.push({
      id: 'planner-streak',
      tone: 'success',
      message: `Attendance at ${attendancePercent}% — keep the streak going while you clear today's plan.`,
    })
  }

  const atRisk = goals
    .map((goal) => ({ goal, status: computeGoalStatus(goal, today) }))
    .filter((entry) => entry.status === 'at_risk')
  const first = atRisk[0]
  if (first) {
    out.push({
      id: 'planner-at-risk',
      tone: 'warning',
      message: `"${first.goal.name}" is at risk. Clear its tasks on today's plan before starting anything new.`,
    })
  }

  if (plan.entries.length > 0 && plan.plannedMinutes >= plan.budgetMinutes) {
    out.push({
      id: 'planner-full',
      tone: 'info',
      message: `Today is fully booked (${plan.plannedMinutes}m). Lower-priority work moved to later days.`,
    })
  }

  const crunch = goals.find(
    (goal) =>
      goal.milestones.some((m) => m.status === 'pending') &&
      daysUntilFrom(today, goal.deadline) <= 3 &&
      daysUntilFrom(today, goal.deadline) >= 0,
  )
  if (crunch) {
    out.push({
      id: 'planner-deadline',
      tone: 'warning',
      message: `"${crunch.name}" is due within 3 days — consider raising its daily study time.`,
    })
  }

  return out.slice(0, 4)
}

export type { Recommendation, TaskPriority }
