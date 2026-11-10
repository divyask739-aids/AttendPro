import { requireSupabase } from '@/lib/supabase'
import type {
  AttendanceCheckIn,
  AttendanceRecord,
  AttendanceRecordSource,
  AttendanceSession,
  AttendanceStatus,
  Subject,
  StudentVerificationStatus,
} from '@/types'

/* ================================================================== *
 * Shared (cross-device) attendance.
 *
 * Two layers live here:
 *   1. Live sessions + check-ins (attendance_sessions / attendance_checkins)
 *   2. The existing Subject + AttendanceRecord model
 *      (attendance_subjects / attendance_records)
 *
 * The Auth hardening migration wraps the original schema functions and
 * derives the caller's verified email and role from auth.uid().
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

interface AttendanceNotificationRow {
  id: string
  title: string
  body: string
  created_at: string
  read_at: string | null
}

interface SubjectRow {
  id: string
  name: string
  code: string | null
  faculty: string | null
  held: number | string | null
  attended: number | string | null
}

interface RecordRow {
  id: string
  subject_id: string
  date: string
  status: AttendanceStatus
  source?: AttendanceRecordSource
}

interface StaffAttendanceRow {
  student_email: string
  student_name: string
  student_id: string
  student_course: string
  student_year: string
  subject_id: string
  subject_name: string
  subject_code: string
  attended: number | string | null
  held: number | string | null
  subject_key: string
}

export interface StaffAttendanceSharedRow {
  studentEmail: string
  studentName: string
  studentId: string
  studentCourse: string
  studentYear: string
  rollNumber?: string
  department?: string
  year?: string
  section?: string
  verificationStatus?: StudentVerificationStatus
  subjectId: string
  subjectName: string
  subjectCode: string
  attended: number
  held: number
  subjectKey: string
}

export interface SharedIdentity {
  studentName: string
  studentId: string
  studentCourse: string
  studentYear: string
}

export interface AttendanceNotification {
  id: string
  title: string
  body: string
  createdAt: string
  readAt: string | null
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

function toAttendanceNotification(row: AttendanceNotificationRow): AttendanceNotification {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    readAt: row.read_at,
  }
}

function toSubject(row: SubjectRow): Subject {
  return {
    id: row.id,
    name: row.name,
    code: row.code ?? '',
    faculty: row.faculty ?? '',
    held: Number(row.held ?? 0),
    attended: Number(row.attended ?? 0),
  }
}

function toRecord(row: RecordRow): AttendanceRecord {
  return {
    id: row.id,
    subjectId: row.subject_id,
    date: row.date,
    status: row.status,
    source: row.source ?? 'manual',
  }
}

function toStaffRow(row: StaffAttendanceRow): StaffAttendanceSharedRow {
  return {
    studentEmail: row.student_email,
    studentName: row.student_name,
    studentId: row.student_id,
    studentCourse: row.student_course,
    studentYear: row.student_year,
    subjectId: row.subject_id,
    subjectName: row.subject_name,
    subjectCode: row.subject_code ?? '',
    attended: Number(row.attended ?? 0),
    held: Number(row.held ?? 0),
    subjectKey: row.subject_key,
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

/* ------------------------------------------------------------------ *
 * Live sessions + check-ins (staff side)
 * ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ *
 * Live sessions + check-ins (student side)
 * ------------------------------------------------------------------ */

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

export async function confirmCameraAttendance(
  sessionId: string,
  studentEmail: string,
): Promise<AttendanceCheckIn> {
  const client = requireSupabase()
  const { data, error } = await client.rpc('confirm_camera_attendance', {
    p_session_id: sessionId,
    p_student_email: studentEmail.trim().toLowerCase(),
  })
  if (error) throw new Error(messageOf(error, "Could not confirm this student's attendance."))
  const row = asSingle<CheckInRow>(data)
  if (!row) throw new Error("Could not confirm this student's attendance.")
  return toCheckIn(row)
}

export async function fetchAttendanceNotifications(
  limit = 20,
): Promise<AttendanceNotification[]> {
  const client = requireSupabase()
  const { data, error } = await client.rpc('get_attendance_notifications', {
    p_limit: limit,
  })
  if (error) throw new Error(messageOf(error, 'Could not load attendance notifications.'))
  return asArray<AttendanceNotificationRow>(data).map(toAttendanceNotification)
}

export async function markAttendanceNotificationRead(id: string): Promise<void> {
  const client = requireSupabase()
  const { error } = await client.rpc('mark_attendance_notification_read', {
    p_notification_id: id,
  })
  if (error) throw new Error(messageOf(error, 'Could not update this notification.'))
}

/* ------------------------------------------------------------------ *
 * Shared attendance model: one-time import from this device
 * ------------------------------------------------------------------ */

export interface ImportAttendanceInput {
  studentEmail: string
  identity: SharedIdentity
  subjects: Subject[]
  records: AttendanceRecord[]
}

/**
 * Uploads this device's existing localStorage attendance once. The database
 * ignores the call when the student already has shared subjects, so stale
 * caches never overwrite live/manual counters.
 */
export async function importSharedAttendance(
  input: ImportAttendanceInput,
): Promise<void> {
  const client = requireSupabase()
  const { error } = await client.rpc('import_student_attendance', {
    p_student_email: input.studentEmail,
    p_student_name: input.identity.studentName,
    p_student_id: input.identity.studentId,
    p_student_course: input.identity.studentCourse,
    p_student_year: input.identity.studentYear,
    p_subjects: input.subjects.map((subject) => ({
      id: subject.id,
      name: subject.name,
      code: subject.code,
      faculty: subject.faculty,
      held: subject.held,
      attended: subject.attended,
    })),
    p_records: input.records.map((record) => ({
      id: record.id,
      subject_id: record.subjectId,
      record_date: record.date,
      status: record.status,
    })),
  })
  if (error) throw new Error(messageOf(error, 'Could not sync attendance with the server.'))
}

/* ------------------------------------------------------------------ *
 * Shared attendance model: subjects
 * ------------------------------------------------------------------ */

export async function fetchSharedSubjects(email: string): Promise<Subject[]> {
  const client = requireSupabase()
  const { data, error } = await client.rpc('get_student_attendance_subjects', {
    p_student_email: email,
  })
  if (error) throw new Error(messageOf(error, 'Could not load subjects.'))
  return asArray<SubjectRow>(data).map(toSubject)
}

export async function fetchSharedRecords(email: string): Promise<AttendanceRecord[]> {
  const client = requireSupabase()
  const { data, error } = await client.rpc('get_student_attendance_records', {
    p_student_email: email,
  })
  if (error) throw new Error(messageOf(error, 'Could not load attendance records.'))
  return asArray<RecordRow>(data).map(toRecord)
}

export interface CreateSharedSubjectInput {
  studentEmail: string
  subject: Subject
  identity: SharedIdentity
}

export async function createSharedSubject(
  input: CreateSharedSubjectInput,
): Promise<Subject> {
  const client = requireSupabase()
  const { data, error } = await client.rpc('create_attendance_subject', {
    p_student_email: input.studentEmail,
    p_subject: {
      id: input.subject.id,
      name: input.subject.name,
      code: input.subject.code,
      faculty: input.subject.faculty,
    },
    p_student_name: input.identity.studentName,
    p_student_id: input.identity.studentId,
    p_student_course: input.identity.studentCourse,
    p_student_year: input.identity.studentYear,
  })
  if (error) throw new Error(messageOf(error, 'Could not save the subject.'))
  const row = asSingle<SubjectRow>(data)
  if (!row) throw new Error('Could not save the subject.')
  return toSubject(row)
}

export async function updateSharedSubject(
  studentEmail: string,
  subject: Subject,
): Promise<Subject> {
  const client = requireSupabase()
  const { data, error } = await client.rpc('update_attendance_subject', {
    p_student_email: studentEmail,
    p_subject: {
      id: subject.id,
      name: subject.name,
      code: subject.code,
      faculty: subject.faculty,
    },
  })
  if (error) throw new Error(messageOf(error, 'Could not update the subject.'))
  const row = asSingle<SubjectRow>(data)
  if (!row) throw new Error('Could not update the subject.')
  return toSubject(row)
}

export async function deleteSharedSubject(
  studentEmail: string,
  subjectId: string,
): Promise<void> {
  const client = requireSupabase()
  const { error } = await client.rpc('delete_attendance_subject', {
    p_student_email: studentEmail,
    p_subject_id: subjectId,
  })
  if (error) throw new Error(messageOf(error, 'Could not delete the subject.'))
}

/* ------------------------------------------------------------------ *
 * Shared attendance model: records + counters
 * ------------------------------------------------------------------ */

export interface LogSharedClassInput {
  studentEmail: string
  subjectId: string
  status: AttendanceStatus
  date: string
  recordId: string
}

export async function logSharedAttendance(
  input: LogSharedClassInput,
): Promise<Subject> {
  const client = requireSupabase()
  const { data, error } = await client.rpc('log_attendance_class', {
    p_student_email: input.studentEmail,
    p_subject_id: input.subjectId,
    p_status: input.status,
    p_date: input.date,
    p_record_id: input.recordId,
  })
  if (error) throw new Error(messageOf(error, 'Could not save this class.'))
  const row = asSingle<SubjectRow>(data)
  if (!row) throw new Error('Could not save this class.')
  return toSubject(row)
}

export async function correctOfficialAttendanceCounters(
  _studentEmail: string,
  subjectId: string,
  held: number,
  attended: number,
  reason: string,
): Promise<Subject> {
  const client = requireSupabase()
  const { data, error } = await client.rpc('correct_official_attendance_counters', {
    p_subject_id: subjectId,
    p_held: held,
    p_attended: attended,
    p_reason: reason.trim(),
  })
  if (error) throw new Error(messageOf(error, 'Could not update attendance.'))
  const row = asSingle<SubjectRow>(data)
  if (!row) throw new Error('Could not update attendance.')
  return toSubject(row)
}

export async function updateSharedIdentity(
  studentEmail: string,
  identity: SharedIdentity,
): Promise<void> {
  const client = requireSupabase()
  const { error } = await client.rpc('update_attendance_identity', {
    p_student_email: studentEmail,
    p_student_name: identity.studentName,
    p_student_id: identity.studentId,
    p_student_course: identity.studentCourse,
    p_student_year: identity.studentYear,
  })
  if (error) throw new Error(messageOf(error, 'Could not sync your profile.'))
}

/* ------------------------------------------------------------------ *
 * Staff roster
 * ------------------------------------------------------------------ */

export interface StaffSubjectInput {
  name: string
  code: string
  semester: string
}

/** Reads subjects assigned by a trusted platform administrator. */
export async function fetchSharedStaffSubjects(
  staffEmail: string,
): Promise<StaffSubjectInput[]> {
  const client = requireSupabase()
  const { data, error } = await client.rpc('get_authorized_staff_subject_assignments', {
    p_staff_email: staffEmail,
  })
  if (error) throw new Error(messageOf(error, 'Could not load your taught subjects.'))
  return asArray<{ name: string; code: string | null; semester: string | null }>(data).map(
    (row) => ({
      name: row.name,
      code: row.code ?? '',
      semester: row.semester ?? '',
    }),
  )
}

export async function fetchStaffAttendanceRows(
  staffEmail: string,
): Promise<StaffAttendanceSharedRow[]> {
  const client = requireSupabase()
  const { data, error } = await client.rpc('get_staff_attendance', {
    p_staff_email: staffEmail,
  })
  if (error) throw new Error(messageOf(error, 'Could not load student attendance.'))
  return asArray<StaffAttendanceRow>(data).map(toStaffRow)
}
