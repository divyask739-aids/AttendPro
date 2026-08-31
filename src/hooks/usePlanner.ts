import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { rescheduleMissedTasks } from '@/features/planner/plannerEngine'
import type { NewGoalInput } from '@/features/planner/types'
import {
  createPlannerGoal,
  fetchPlannerGoals,
  savePlannerGoals,
  setMilestoneStatus,
} from '@/lib/plannerApi'

export function usePlannerGoals() {
  const query = useQuery({
    queryKey: ['planner-goals'],
    queryFn: async () => {
      const fetched = await fetchPlannerGoals()
      // Auto-reschedule any missed tasks on every load (refresh/login).
      const { goals, rescheduledCount } = rescheduleMissedTasks(fetched)
      if (rescheduledCount > 0) {
        await savePlannerGoals(goals)
      }
      return goals
    },
  })

  return {
    goals: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
  }
}

export function usePlannerMutations() {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['planner-goals'] })

  const createGoal = useMutation({
    mutationFn: (input: NewGoalInput) => createPlannerGoal(input),
    onSuccess: invalidate,
  })

  const toggleMilestone = useMutation({
    mutationFn: (vars: { goalId: string; milestoneId: string; done: boolean }) =>
      setMilestoneStatus(vars.goalId, vars.milestoneId, vars.done ? 'completed' : 'pending'),
    onSuccess: invalidate,
  })

  return { createGoal, toggleMilestone }
}
