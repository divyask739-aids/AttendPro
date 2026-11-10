/* ------------------------------ identity --------------------------- */

export type UserRole = 'student' | 'staff'

export interface UserAccount {
  email: string
  fullName: string
  role: UserRole
  createdAt: string
  passwordSalt?: string
  passwordHash?: string
  passwordIterations?: number
}

export interface Session {
  id: string
  email: string
  fullName: string
  role: UserRole
  loggedInAt: string
}

/* --------------------------- student data ------------------------- */

export interface StudentProfile {
  fullName: string
  email: string
  studentId: string
  institution: string
  course: string
  year: string
  semester: string
  department?: string
  rollNumber?: string
  section?: string
  verificationStatus?: StudentVerificationStatus
  verificationNote?: string
  verificationReviewedBy?: string
  verificationReviewedAt?: string
  verifiedAt?: string
  /** Minutes the student can study per day (drives Today's Plan) */
  dailyStudyMinutes: number
}

export type StudentVerificationStatus =
  | 'not_submitted'
  | 'pending'
  | 'verified'
  | 'rejected'

export interface StudentVerificationRecord {
  email: string
  fullName: string
  studentId: string
  rollNumber: string
  department: string
  year: string
  section: string
  status: StudentVerificationStatus
  note: string
  enrolledSubjects: Array<Pick<Subject, 'name' | 'code'>>
}

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'cancelled'

/** A live attendance session. Shared live sessions require the configured backend. */
export interface AttendanceSession {
  id: string
  code: string
  subjectName: string
  subjectCode: string
  /** False when the session was closed or its expiry time passed. */
  isOpen: boolean
  createdAt: string
  expiresAt: string
  checkInCount: number
}

/** One student check-in belonging to a live attendance session. */
export interface AttendanceCheckIn {
  id: string
  sessionId: string
  studentEmail: string
  studentName: string
  rollNumber: string
  checkedInAt: string
}

export interface Subject {
  id: string
  name: string
  code: string
  faculty: string
  held: number
  attended: number
}

export interface Enrollment {
  studentEmail: string
  /** Normalized subject identity shared between student and staff views */
  subjectKey: string
  enrolledAt: string
}

export interface AttendanceRecord {
  id: string
  subjectId: string
  /** ISO date string */
  date: string
  status: AttendanceStatus
  source?: AttendanceRecordSource
}

export type AttendanceRecordSource =
  | 'manual'
  | 'live'
  | 'personal'
  | 'legacy_import'
  | 'staff_confirmed'

export type TaskPriority = 'low' | 'medium' | 'high'
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'missed'

/** How early a task should notify the student. `none` disables it. */
export type TaskReminder = 'none' | '15m' | '30m' | '1h' | '1d'

export interface Task {
  id: string
  title: string
  description: string
  /** null when the task is not linked to a subject */
  subjectId: string | null
  dueDate: string
  estimatedMinutes: number
  priority: TaskPriority
  status: TaskStatus
  reminder: TaskReminder
}

export interface ProductivityGoal {
  id: string
  title: string
  target: number
  completed: number
  unit: string
  createdAt: string
}

/* ---------------------------- staff data -------------------------- */

export interface StaffSubject {
  name: string
  code: string
  semester: string
}

export interface StaffProfile {
  fullName: string
  email: string
  staffId: string
  department: string
  designation: string
  academicYear: string
  subjects: StaffSubject[]
}

/** A single row of staff attendance analytics (computed, never stored). */
export interface StudentAttendanceRow {
  studentEmail: string
  studentName: string
  studentId: string
  department: string
  year: string
  rollNumber?: string
  section?: string
  verificationStatus?: StudentVerificationStatus
  subjectId: string
  subjectName: string
  subjectCode: string
  attended: number
  held: number
  percent: number
}

export interface AcademicActivity {
  id: string
  /** Staff email that published it — used to scope staff views */
  createdBy: string
  subjectName: string
  subjectCode: string
  title: string
  description: string
  dueDate: string
  priority: TaskPriority
  createdAt: string
}

/* --------------------------- shared outputs ------------------------ */

export type RecommendationTone = 'info' | 'success' | 'warning' | 'danger'

export interface Recommendation {
  id: string
  tone: RecommendationTone
  message: string
}
