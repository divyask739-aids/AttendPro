import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  createProductivityGoal,
  deleteProductivityGoal,
  patchProductivityGoal,
  type ProductivityGoalInput,
} from '@/lib/dataApi'
import type { ProductivityGoal } from '@/types'

export function useProductivityGoalMutations(email: string | undefined) {
  const queryClient = useQueryClient()
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['productivity-goals', email] })
  }

  const addGoal = useMutation({
    mutationFn: (input: ProductivityGoalInput) => createProductivityGoal(email ?? '', input),
    onSuccess: invalidate,
  })

  const bumpProgress = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: number }) =>
      patchProductivityGoal(email ?? '', id, { completed }),
    onSuccess: invalidate,
  })

  const removeGoal = useMutation({
    mutationFn: (id: string) => deleteProductivityGoal(email ?? '', id),
    onSuccess: invalidate,
  })

  return { addGoal, bumpProgress, removeGoal }
}

export type { ProductivityGoal }
