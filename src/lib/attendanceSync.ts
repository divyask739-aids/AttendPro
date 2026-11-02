import { requireSupabase } from '@/lib/supabase'
import type { AttendanceCheckIn, AttendanceSession } from '@/types'

/* ================================================================== *
 * Shared (cross-device) attendance sessions + check-ins.
 *
 * All reads/writes go through the security-definer Postgres functions in
 * `supabase/schema.sql`. Tables are not exposed to the anon role, so a
 * student can only add their own check-in (via RPC validation) and staff
 * can only read sessions they created.
 * ================================================================== */

interface SessionRow {
  id: string
  code: string
  subject_name: string
  subject_code: string
  is_open: boolean
  created_at: string
  expires_at: string
  checkin_count?: number | string | null
}

interface CheckInRow {
  id: string
  session_id: string
  student_email: string
  student_name: string
  roll_number: string
  checked_in_at: string
}

function toSession(row: SessionRow): AttendanceSession {
  return {
    id: row.id,
    code: row.code,
    subjectName: row.subject_name,
    subjectCode: row.subject_code ?? '',
    isOpen: Boolean(row.is_open) && new Date(row.expires_at).getTime() > Date.now(),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    checkInCount: Number(row.checkin_count ?? 0),
  }
}

function toCheckIn(row: CheckInRow): AttendanceCheckIn {
  return {
    id: row.id,
    sessionId: row.session_id,
    studentEmail: row.student_email,
    studentName: row.student_name,
    rollNumber: row.roll_number,
    checkedInAt: row.checked_in_at,
  }
}

function messageOf(error: { message?: string } | null, fallback: string): string {
  const message = error?.message?.trim()
  return message && message.length > 0 ? message : fallback
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function asSingle<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T | undefined) ?? null
  return (value as T | undefined) ?? null
}

export interface CreateAttendanceSessionInput {
  staffEmail: string
  subjectName: string
  subjectCode: string
  durationMinutes: number
}

export async function createAttendanceSession(
  input: CreateAttendanceSessionInput,
): Promise<AttendanceSession> {
  const client = requireSupabase()
  const { data, error } = await client.rpc('create_attendance_session', {
    p_staff_email: input.staffEmail,
    p_subject_name: input.subjectName,
    p_subject_code: input.subjectCode,
    p_duration_minutes: input.durationMinutes,
  })

  if (error) throw new Error(messageOf(error, 'Could not start the attendance session.'))
  const row = asSingle<SessionRow>(data)
  if (!row) throw new Error('Could not start the attendance session.')
  return toSession(row)
}

export async function closeAttendanceSession(
  sessionId: string,
  staffEmail: string,
): Promise<void> {
  const client = requireSupabase()
  const { error } = await client.rpc('close_attendance_session', {
    p_session_id: sessionId,
    p_staff_email: staffEmail,
  })
  if (error) throw new Error(messageOf(error, 'Could not close the attendance session.'))
}

export async function fetchStaffAttendanceSessions(
  staffEmail: string,
  limit = 8,
): Promise<AttendanceSession[]> {
  const client = requireSupabase()
  const { data, error } = await client.rpc('get_staff_attendance_sessions', {
    p_staff_email: staffEmail,
    p_limit: limit,
  })
  if (error) throw new Error(messageOf(error, 'Could not load attendance sessions.'))
  return asArray<SessionRow>(data).map(toSession)
}

export async function fetchSessionCheckIns(
  sessionId: string,
  staffEmail: string,
): Promise<AttendanceCheckIn[]> {
  const client = requireSupabase()
  const { data, error } = await client.rpc('get_attendance_checkins', {
    p_session_id: sessionId,
    p_staff_email: staffEmail,
  })
  if (error) throw new Error(messageOf(error, 'Could not load check-ins for this session.'))
  return asArray<CheckInRow>(data).map(toCheckIn)
}

/** Looks up a session by code so the student can preview it before checking in. */
export async function findSessionByCode(code: string): Promise<AttendanceSession | null> {
  const client = requireSupabase()
  const { data, error } = await client.rpc('get_attendance_session', {
    p_code: code.trim().toUpperCase(),
  })
  if (error) throw new Error(messageOf(error, 'Could not check that attendance code.'))
  const row = asSingle<SessionRow>(data)
  return row ? toSession(row) : null
}

export interface CheckInInput {
  code: string
  studentEmail: string
  studentName: string
  rollNumber: string
}

export async function checkInWithCode(input: CheckInInput): Promise<AttendanceCheckIn> {
  const client = requireSupabase()
  const { data, error } = await client.rpc('check_in_attendance', {
    p_code: input.code.trim().toUpperCase(),
    p_student_email: input.studentEmail.trim().toLowerCase(),
    p_student_name: input.studentName.trim(),
    p_roll_number: input.rollNumber.trim(),
  })
  if (error) throw new Error(messageOf(error, 'Could not mark your attendance.'))
  const row = asSingle<CheckInRow>(data)
  if (!row) throw new Error('Could not mark your attendance.')
  return toCheckIn(row)
}
