import type { GoalStatus, Milestone, NewGoalInput, PlanItem, PlannerGoal, Suggestion } from './types'
import {
  addDaysISO,
  daysUntilFrom,
  estimateTotalMinutes,
  isoToday,
  makeId,
  urgencyScore,
} from './plannerMeta'

/**
 * Rule-based planning engine.
 *
 * Every exported function is pure and deterministic so a real AI service can
 * later replace or augment these implementations behind the same signatures.
 */

const CHUNK_MINUTES = 45

/** Breaks a goal into evenly sized milestones scheduled across available days. */
export function generateMilestones(
  goalId: string,
  input: NewGoalInput,
  todayIso = isoToday(),
): Milestone[] {
  const total = estimateTotalMinutes(input.category, input.priority)
  const daysAvailable = Math.max(1, daysUntilFrom(todayIso, input.deadline))
  const maxMilestones = Math.min(12, daysAvailable * 3)
  const count = Math.min(maxMilestones, Math.max(2, Math.ceil(total / CHUNK_MINUTES)))
  const baseSize = Math.max(15, Math.round(total / count / 15) * 15)

  // Per-day scheduling capacity, tomorrow through the deadline.
  const capacity = new Map<string, number>()
  for (let day = 1; day <= daysAvailable; day++) {
    capacity.set(addDaysISO(todayIso, day), input.dailyMinutes)
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

export function computeProgress(goal: PlannerGoal): {
  percent: number
  completed: number
  total: number
  remaining: number
} {
  const total = goal.milestones.length
  const completed = goal.milestones.filter((m) => m.status === 'completed').length
  return {
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
    completed,
    total,
    remaining: total - completed,
  }
}

export function computeGoalStatus(goal: PlannerGoal, todayIso = isoToday()): GoalStatus {
  const milestones = goal.milestones
  if (milestones.length === 0) return 'on_track'
  if (milestones.every((m) => m.status === 'completed')) return 'completed'

  const total = milestones.length
  const completed = milestones.filter((m) => m.status === 'completed').length
  const expectedDone = milestones.filter((m) => m.dueDate <= todayIso).length
  const actual = completed / total
  const expected = expectedDone / total
  const behind = expected - actual
  const daysLeft = daysUntilFrom(todayIso, goal.deadline)

  if (daysLeft < 0) return 'at_risk'
  if (behind <= 0.05) return 'on_track'
  if (daysLeft <= 3 || behind > 0.25) return 'at_risk'
  return 'needs_attention'
}

export interface TodayPlan {
  items: PlanItem[]
  plannedMinutes: number
  budgetMinutes: number
}

/**
 * Builds today's plan: overdue/due-today work first, then pulls future work
 * forward by urgency — never exceeding the combined daily study budget.
 */
export function buildTodayPlan(
  goals: PlannerGoal[],
  todayIso = isoToday(),
): TodayPlan {
  const activeGoals = goals.filter(
    (goal) => computeGoalStatus(goal, todayIso) !== 'completed',
  )
  const budgetMinutes =
    Math.min(600, activeGoals.reduce((sum, goal) => sum + goal.dailyMinutes, 0)) || 60

  const due: PlanItem[] = []
  const upcoming: PlanItem[] = []
  for (const goal of goals) {
    for (const milestone of goal.milestones) {
      if (milestone.status !== 'pending') continue
      const item: PlanItem = {
        goalId: goal.id,
        milestoneId: milestone.id,
        title: milestone.title,
        goalName: goal.name,
        priority: goal.priority,
        estimatedMinutes: milestone.estimatedMinutes,
        dueDate: milestone.dueDate,
      }
      ;(milestone.dueDate <= todayIso ? due : upcoming).push(item)
    }
  }

  const byUrgency = (a: PlanItem, b: PlanItem) => urgencyScore(b) - urgencyScore(a)
  const ordered = [...due.sort(byUrgency), ...upcoming.sort(byUrgency)]

  const items: PlanItem[] = []
  let plannedMinutes = 0
  for (const item of ordered) {
    if (plannedMinutes + item.estimatedMinutes > budgetMinutes) continue
    items.push(item)
    plannedMinutes += item.estimatedMinutes
  }

  return { items, plannedMinutes, budgetMinutes }
}

export interface RescheduleResult {
  goals: PlannerGoal[]
  rescheduledCount: number
}

/**
 * Marks overdue pending work as missed and redistributes all remaining
 * pending milestones across future days without exceeding daily study time.
 */
export function rescheduleMissedTasks(
  goals: PlannerGoal[],
  todayIso = isoToday(),
): RescheduleResult {
  let rescheduledCount = 0

  const nextGoals = goals.map((goal) => {
    const hasOverdue = goal.milestones.some(
      (m) => m.status === 'pending' && m.dueDate < todayIso,
    )
    if (!hasOverdue) return goal

    const markedMissed = goal.milestones.map((m) =>
      m.status === 'pending' && m.dueDate < todayIso
        ? { ...m, status: 'missed' as const }
        : { ...m },
    )

    // Refit remaining pending work, earliest original due date first.
    const horizon = Math.max(14, daysUntilFrom(todayIso, goal.deadline) + 14)
    const capacity = new Map<string, number>()
    for (let day = 0; day <= horizon; day++) {
      capacity.set(addDaysISO(todayIso, day), goal.dailyMinutes)
    }

    const pending = markedMissed
      .filter((m) => m.status === 'pending')
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id))

    for (const milestone of pending) {
      for (const [day, dayCapacity] of capacity) {
        if (dayCapacity >= milestone.estimatedMinutes) {
          milestone.dueDate = day
          capacity.set(day, dayCapacity - milestone.estimatedMinutes)
          break
        }
      }
    }

    rescheduledCount += pending.length
    return { ...goal, milestones: markedMissed }
  })

  return { goals: nextGoals, rescheduledCount }
}

/** Rule-based recommendations. Swap with an AI call later; same return shape. */
export function getSuggestions(
  goals: PlannerGoal[],
  attendancePercent: number,
  plan: TodayPlan,
  todayIso = isoToday(),
): Suggestion[] {
  const suggestions: Suggestion[] = []

  if (goals.length === 0) {
    suggestions.push({
      id: 's-start',
      tone: 'info',
      message:
        'Create your first goal on the left — the planner will split it into daily tasks automatically.',
    })
    return suggestions
  }

  const statuses = goals.map((goal) => ({ goal, status: computeGoalStatus(goal, todayIso) }))
  const atRisk = statuses.filter((entry) => entry.status === 'at_risk')
  if (atRisk.length > 0 && atRisk[0]) {
    suggestions.push({
      id: 's-risk',
      tone: 'warning',
      message: `"${atRisk[0].goal.name}" is at risk. Clear its tasks on today's plan before starting anything new.`,
    })
  }

  if (attendancePercent < 75) {
    suggestions.push({
      id: 's-attendance',
      tone: 'warning',
      message: `Attendance is ${attendancePercent}% — attend every class this week before adding extra study blocks.`,
    })
  } else if (attendancePercent >= 90 && atRisk.length === 0) {
    suggestions.push({
      id: 's-streak',
      tone: 'success',
      message: `Attendance at ${attendancePercent}% and goals on track — keep the streak going.`,
    })
  }

  if (
    plan.items.length > 0 &&
    plan.plannedMinutes >= plan.budgetMinutes &&
    plan.budgetMinutes >= 60
  ) {
    suggestions.push({
      id: 's-capacity',
      tone: 'info',
      message: `Today is fully booked (${plan.plannedMinutes}m). Lower-priority work was pushed to later days.`,
    })
  }

  const crunch = goals.find(
    (goal) =>
      goal.milestones.some((m) => m.status === 'pending') &&
      daysUntilFrom(todayIso, goal.deadline) <= 3 &&
      daysUntilFrom(todayIso, goal.deadline) >= 0,
  )
  if (crunch) {
    suggestions.push({
      id: 's-deadline',
      tone: 'warning',
      message: `"${crunch.name}" is due within 3 days — consider raising its daily study time.`,
    })
  }

  return suggestions.slice(0, 4)
}
