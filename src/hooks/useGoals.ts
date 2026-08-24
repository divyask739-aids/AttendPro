import { useQuery } from '@tanstack/react-query'

import { fetchDailyGoals } from '@/lib/api'

export function useGoals() {
  const query = useQuery({ queryKey: ['goals'], queryFn: fetchDailyGoals })

  return {
    goals: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
  }
}
