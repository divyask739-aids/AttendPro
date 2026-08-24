import { useQuery } from '@tanstack/react-query'

import { fetchTasks } from '@/lib/api'

export function useTasks() {
  const query = useQuery({ queryKey: ['tasks'], queryFn: fetchTasks })

  return {
    tasks: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
  }
}
