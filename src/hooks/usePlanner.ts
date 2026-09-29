import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { createPlannerGoal, fetchPlannerGoals, setMilestoneStatus } from '@/lib/plannerApi'
import type { NewGoalInput, PlannerGoal } from '@/features/planner/types'

export function usePlannerGoals(email: string | undefined) {
  const query = useQuery({
    queryKey: ['planner-goals', email],
    queryFn: () => fetchPlannerGoals(email ?? ''),
    enabled: Boolean(email),
  })

  return {
    goals: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  }
}

export function usePlannerMutations(email: string | undefined) {
  const queryClient = useQueryClient()
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['planner-goals', email] })
  }

  const createGoal = useMutation({
    mutationFn: (input: NewGoalInput) => createPlannerGoal(email ?? '', input),
    onSuccess: invalidate,
  })

  const toggleMilestone = useMutation({
    mutationFn: (vars: { goalId: string; milestoneId: string; done: boolean }) =>
      setMilestoneStatus(email ?? '', vars.goalId, vars.milestoneId, vars.done),
    onSuccess: invalidate,
  })

  return { createGoal, toggleMilestone }
}

export type { PlannerGoal }
