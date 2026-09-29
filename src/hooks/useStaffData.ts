import { useQuery } from '@tanstack/react-query'

import { fetchStaffRoster, fetchVisibleActivities } from '@/lib/dataApi'
import { useAttendance } from '@/hooks/useAttendance'
import type { UserRole } from '@/types'

/** Staff analytics computed from the same student subject/attendance records. */
export function useStaffRoster(email: string | undefined) {
  const query = useQuery({
    queryKey: ['staff-roster', email],
    queryFn: () => fetchStaffRoster(email ?? ''),
    enabled: Boolean(email),
  })

  return {
    profile: query.data?.profile,
    subjects: query.data?.subjects ?? [],
    rows: query.data?.rows ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  }
}

export function useVisibleActivities(
  email: string | undefined,
  role: UserRole,
  subjectNames: string[],
) {
  const query = useQuery({
    queryKey: ['activities', email, role, subjectNames.join('|')],
    queryFn: () => fetchVisibleActivities(email ?? '', role, subjectNames),
    enabled: Boolean(email),
  })

  return { activities: query.data ?? [], isLoading: query.isLoading }
}

export function useStaffSubjectNames(email: string | undefined) {
  const { subjects } = useStaffRoster(email)
  return subjects.map((subject) => subject.name)
}

export function useStudentSubjectNames(email: string | undefined) {
  const { summary } = useAttendance(email)
  return (summary?.subjects ?? []).map((subject) => subject.name)
}
