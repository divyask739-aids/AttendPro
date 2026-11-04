import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  checkInWithCode,
  closeAttendanceSession,
  createAttendanceSession,
  fetchSessionCheckIns,
  fetchStaffAttendanceSessions,
  findSessionByCode,
  type CheckInInput,
  type CreateAttendanceSessionInput,
} from '@/lib/attendanceSync'
import { isAttendanceSyncConfigured, supabase } from '@/lib/supabase'
import { ensureSharedAttendanceReady } from '@/lib/dataApi'
import type { AttendanceCheckIn, AttendanceSession } from '@/types'

const SESSION_KEY = 'attendance-sessions'
const CHECKIN_KEY = 'attendance-checkins'

const EMPTY_SESSIONS: AttendanceSession[] = []
const EMPTY_CHECKINS: AttendanceCheckIn[] = []

/* ================================================================== *
 * Reads
 * ================================================================== */

export function useStaffAttendanceSessions(staffEmail: string | undefined) {
  const query = useQuery({
    queryKey: [SESSION_KEY, staffEmail],
    queryFn: () => fetchStaffAttendanceSessions(staffEmail ?? ''),
    enabled: Boolean(staffEmail) && isAttendanceSyncConfigured,
    staleTime: 5_000,
    // Sessions keep their own countdown/count fresh even if a device missed
    // a realtime event.
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  })

  return {
    sessions: query.data ?? EMPTY_SESSIONS,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useSessionCheckIns(
  sessionId: string | null | undefined,
  staffEmail: string | undefined,
) {
  const query = useQuery({
    queryKey: [CHECKIN_KEY, sessionId, staffEmail],
    queryFn: () => fetchSessionCheckIns(sessionId ?? '', staffEmail ?? ''),
    enabled:
      Boolean(sessionId && staffEmail) && isAttendanceSyncConfigured,
    staleTime: 0,
    // Polling fallback: works even when Supabase Realtime is unavailable.
    refetchInterval: sessionId ? 4_000 : false,
    refetchOnWindowFocus: true,
  })

  return {
    checkIns: query.data ?? EMPTY_CHECKINS,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}

/**
 * Subscribes to the database broadcast for exactly one session. The trigger
 * in `supabase/schema.sql` publishes on `attendance-session-<id>`.
 */
export function useAttendanceCheckInBroadcast(sessionId: string | null | undefined) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const client = supabase
    if (!client || !sessionId) return

    const channel = client
      .channel(`attendance-session-${sessionId}`, {
        config: { broadcast: { self: false } },
      })
      .on('broadcast', { event: 'check_in' }, () => {
        void queryClient.invalidateQueries({
          queryKey: [CHECKIN_KEY, sessionId],
        })
        void queryClient.invalidateQueries({ queryKey: [SESSION_KEY] })
        // The check-in also wrote the shared attendance model.
        void queryClient.invalidateQueries({ queryKey: ['subjects'] })
        void queryClient.invalidateQueries({ queryKey: ['attendance-records'] })
        void queryClient.invalidateQueries({ queryKey: ['staff-roster'] })
      })
      .subscribe()

    return () => {
      void client.removeChannel(channel)
    }
  }, [sessionId, queryClient])
}

/* ================================================================== *
 * Writes
 * ================================================================== */

export function useAttendanceSessionMutations(staffEmail: string | undefined) {
  const queryClient = useQueryClient()

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: [SESSION_KEY] })
    void queryClient.invalidateQueries({ queryKey: [CHECKIN_KEY] })
  }

  const createSession = useMutation({
    mutationFn: (input: Omit<CreateAttendanceSessionInput, 'staffEmail'>) =>
      createAttendanceSession({ ...input, staffEmail: staffEmail ?? '' }),
    onSuccess: invalidate,
  })

  const closeSession = useMutation({
    mutationFn: (sessionId: string) =>
      closeAttendanceSession(sessionId, staffEmail ?? ''),
    onSuccess: invalidate,
  })

  return { createSession, closeSession }
}

/**
 * Student-side check-in. The code is looked up first so the student gets a
 * helpful message (invalid / closed / expired) and the subject name for the
 * success card. The database re-validates everything atomically on insert.
 */
export function useCheckInMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CheckInInput) => {
      // Upload this device's existing subjects first so their local attendance
      // history is not lost. Best-effort: a valid code still enrolls the
      // student even when this device has nothing cached.
      try {
        await ensureSharedAttendanceReady(input.studentEmail)
      } catch {
        // The check-in RPC below is authoritative.
      }
      const session = await findSessionByCode(input.code)
      if (!session) {
        throw new Error('Invalid attendance code. Ask your faculty for the current code.')
      }
      if (!session.isOpen) {
        throw new Error('This attendance code has expired or was closed. Ask for a new code.')
      }
      const checkIn = await checkInWithCode(input)
      return { session, checkIn }
    },
    onSuccess: ({ checkIn }) => {
      void queryClient.invalidateQueries({
        queryKey: [CHECKIN_KEY, checkIn.sessionId],
      })
      void queryClient.invalidateQueries({ queryKey: [SESSION_KEY] })
      // Refresh the student's own Attendance page/Dashboard and the staff
      // roster immediately; polling covers other devices.
      void queryClient.invalidateQueries({ queryKey: ['subjects'] })
      void queryClient.invalidateQueries({ queryKey: ['attendance-records'] })
      void queryClient.invalidateQueries({ queryKey: ['staff-roster'] })
    },
  })
}
