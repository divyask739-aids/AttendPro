import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  fetchStaffRoster,
  fetchStudentVerificationRecords,
  fetchVisibleActivities,
  isLocalAccount,
  reviewStudentVerification,
} from '@/lib/dataApi'
import { useAttendance } from '@/hooks/useAttendance'
import { supabase } from '@/lib/supabase'
import type { StudentVerificationStatus, UserRole } from '@/types'

/** Staff analytics computed from the same student subject/attendance records. */
export function useStaffRoster(email: string | undefined) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['staff-roster', email],
    queryFn: () => fetchStaffRoster(email ?? ''),
    enabled: Boolean(email),
    staleTime: 5_000,
    // A student check-in writes shared counters; keep the roster fresh even
    // when Realtime is unavailable.
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  })

  // The database trigger publishes every check-in on `attendance-updates`.
  useEffect(() => {
    const client = supabase
    if (!client || !email || isLocalAccount(email)) return

    const channel = client
      .channel('attendance-updates')
      .on('broadcast', { event: 'check_in' }, () => {
        void queryClient.invalidateQueries({ queryKey: ['staff-roster'] })
        void queryClient.invalidateQueries({ queryKey: ['subjects'] })
        void queryClient.invalidateQueries({ queryKey: ['attendance-records'] })
      })
      .subscribe()

    return () => {
      void client.removeChannel(channel)
    }
  }, [email, queryClient])

  return {
    profile: query.data?.profile,
    subjects: query.data?.subjects ?? [],
    rows: query.data?.rows ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

export function useStaffStudentVerifications(email: string | undefined) {
  const query = useQuery({
    queryKey: ['student-verifications', email],
    queryFn: () => fetchStudentVerificationRecords(email ?? ''),
    enabled: Boolean(email),
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  })
  return {
    records: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

export function useStudentVerificationReview(email: string | undefined) {
  const queryClient = useQueryClient()
  const review = useMutation({
    mutationFn: (input: {
      studentEmail: string
      decision: Extract<StudentVerificationStatus, 'verified' | 'rejected'>
      note?: string
    }) =>
      reviewStudentVerification(email ?? '', input.studentEmail, input.decision, input.note),
    onSuccess: (profile, input) => {
      queryClient.setQueryData(['profile', input.studentEmail], profile)
      void queryClient.invalidateQueries({ queryKey: ['student-verifications'] })
      void queryClient.invalidateQueries({ queryKey: ['staff-roster'] })
    },
  })
  return { review }
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
