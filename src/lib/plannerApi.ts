import {
  addDaysISO,
  isoToday,
  makeId,
} from '@/features/planner/plannerMeta'
import { generateMilestones } from '@/features/planner/plannerEngine'
import type { MilestoneStatus, NewGoalInput, PlannerGoal } from '@/features/planner/types'

const STORAGE_KEY = 'attendpro.planner.v1'
const SEED_FLAG = 'attendpro.planner.v1.seeded'
const PERSIST_DELAY_MS = 120

/**
 * Local persistence layer for the planner. Goals survive refreshes and
 * logins. When a backend exists, replace these function bodies with real
 * API calls — signatures already match an async repository.
 */

function read(): PlannerGoal[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is PlannerGoal =>
        typeof item?.id === 'string' &&
        typeof item?.name === 'string' &&
        Array.isArray(item?.milestones),
    )
  } catch {
    return []
  }
}

function write(goals: PlannerGoal[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(goals))
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function ensureSeed(): void {
  if (read().length === 0) {
    const input: NewGoalInput = {
      name: 'Prepare for DS midterm',
      category: 'exam',
      deadline: addDaysISO(isoToday(), 10),
      priority: 'high',
      dailyMinutes: 90,
    }
    const id = makeId('goal')
    const goal: PlannerGoal = {
      id,
      ...input,
      createdAt: new Date().toISOString(),
      milestones: generateMilestones(id, input),
    }
    write([goal])
  }
  localStorage.setItem(SEED_FLAG, '1')
}

export async function fetchPlannerGoals(): Promise<PlannerGoal[]> {
  ensureSeed()
  await delay(PERSIST_DELAY_MS)
  return structuredClone(read())
}

export async function createPlannerGoal(input: NewGoalInput): Promise<PlannerGoal> {
  const goals = read()
  const id = makeId('goal')
  const goal: PlannerGoal = {
    id,
    ...input,
    createdAt: new Date().toISOString(),
    milestones: generateMilestones(id, input),
  }
  write([goal, ...goals])
  await delay(PERSIST_DELAY_MS)
  return structuredClone(goal)
}

export async function setMilestoneStatus(
  goalId: string,
  milestoneId: string,
  status: Extract<MilestoneStatus, 'completed' | 'pending'>,
): Promise<void> {
  const goals = read().map((goal) => {
    if (goal.id !== goalId) return goal
    return {
      ...goal,
      milestones: goal.milestones.map((milestone) =>
        milestone.id === milestoneId
          ? {
              ...milestone,
              status,
              completedAt: status === 'completed' ? new Date().toISOString() : undefined,
            }
          : milestone,
      ),
    }
  })
  write(goals)
  await delay(PERSIST_DELAY_MS)
}

export async function savePlannerGoals(goals: PlannerGoal[]): Promise<void> {
  write(goals)
  await delay(PERSIST_DELAY_MS)
}
