import { useQuery } from '@tanstack/react-query'

import {
  fetchProductivityGoals,
  fetchTasks,
  type ProductivityGoalInput,
} from '@/lib/dataApi'
import type { ProductivityGoal } from '@/types'

export function useTasks(email: string | undefined) {
  const query = useQuery({
    queryKey: ['tasks', email],
    queryFn: () => fetchTasks(email ?? ''),
    enabled: Boolean(email),
  })

  return {
    tasks: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  }
}

export function useProductivityGoals(email: string | undefined) {
  const query = useQuery({
    queryKey: ['productivity-goals', email],
    queryFn: () => fetchProductivityGoals(email ?? ''),
    enabled: Boolean(email),
  })

  return {
    goals: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  }
}

export type { ProductivityGoal, ProductivityGoalInput }
