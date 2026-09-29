import { generateMilestones } from '@/features/planner/plannerEngine'
import { isoToday, makeId } from '@/lib/date'
import { dataKey, isArrayOfObjects, readStore, writeStore } from '@/lib/storage'
import type { MilestoneStatus, NewGoalInput, PlannerGoal } from '@/features/planner/types'

/**
 * Planner goals are stored per user so a student's plan survives refresh
 * and is never visible to another account.
 */

function readGoals(email: string): PlannerGoal[] {
  const value: unknown = readStore<unknown>(dataKey(email, 'planner.goals'), [])
  return isArrayOfObjects<PlannerGoal>(value) ? value : []
}

export async function fetchPlannerGoals(email: string): Promise<PlannerGoal[]> {
  return readGoals(email)
}

export async function createPlannerGoal(
  email: string,
  input: NewGoalInput,
): Promise<PlannerGoal> {
  const id = makeId('goal')
  const goal: PlannerGoal = {
    id,
    ...input,
    createdAt: new Date().toISOString(),
    milestones: generateMilestones(id, input),
  }
  writeStore(dataKey(email, 'planner.goals'), [goal, ...readGoals(email)])
  return goal
}

export async function setMilestoneStatus(
  email: string,
  goalId: string,
  milestoneId: string,
  done: boolean,
): Promise<void> {
  const status: MilestoneStatus = done ? 'completed' : 'pending'
  const goals = readGoals(email).map((goal) =>
    goal.id === goalId
      ? {
          ...goal,
          milestones: goal.milestones.map((milestone) =>
            milestone.id === milestoneId
              ? {
                  ...milestone,
                  status,
                  completedAt: done ? new Date().toISOString() : undefined,
                }
              : milestone,
          ),
        }
      : goal,
  )
  writeStore(dataKey(email, 'planner.goals'), goals)
}

export async function updatePlannerGoal(
  email: string,
  goal: PlannerGoal,
): Promise<void> {
  writeStore(
    dataKey(email, 'planner.goals'),
    readGoals(email).map((item) => (item.id === goal.id ? goal : item)),
  )
}

export { isoToday }
