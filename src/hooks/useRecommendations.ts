import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { buildRecommendations } from '@/lib/recommendations'
import type { Recommendation } from '@/types'

import { useAttendance } from './useAttendance'
import { useTasks } from './useTasks'

/**
 * Attendance + tasks + goals → personalized recommendations.
 * Recomputes automatically whenever attendance or task data changes.
 */
export function useRecommendations(email: string | undefined) {
  const { summary } = useAttendance(email)
  const { tasks } = useTasks(email)

  const recommendations = useMemo<Recommendation[]>(() => {
    if (!summary) return []
    return buildRecommendations({ subjects: summary.subjects, tasks })
  }, [summary, tasks])

  return { recommendations, summary }
}

export function useIsAnySubjectAtRisk(email: string | undefined) {
  const { summary } = useAttendance(email)
  const query = useQuery({ queryKey: ['recommendations-ready', email], enabled: false })
  void query
  return summary?.atRiskCount ?? 0
}
