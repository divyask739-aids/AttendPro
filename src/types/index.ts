/* ------------------------------ identity --------------------------- */

export type UserRole = 'student' | 'staff'

export interface UserAccount {
  email: string
  fullName: string
  role: UserRole
  createdAt: string
}

export interface Session {
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
  /** Minutes the student can study per day (drives Today's Plan) */
  dailyStudyMinutes: number
}

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'cancelled'

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
}

export type TaskPriority = 'low' | 'medium' | 'high'
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'missed'

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
