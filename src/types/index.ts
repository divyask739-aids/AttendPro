export type AttendanceStatus = 'present' | 'absent' | 'late' | 'cancelled'

export interface Subject {
  id: string
  name: string
  shortName: string
  held: number
  attended: number
}

export interface AttendanceRecord {
  id: string
  subjectId: string
  /** ISO date string, e.g. "2026-08-24" */
  date: string
  status: AttendanceStatus
}

export type TaskPriority = 'low' | 'medium' | 'high'
export type TaskStatus = 'todo' | 'in_progress' | 'done'

export interface Task {
  id: string
  title: string
  subject: string
  /** ISO date string */
  dueDate: string
  priority: TaskPriority
  status: TaskStatus
}

export interface DailyGoal {
  id: string
  title: string
  target: number
  completed: number
  unit: string
}
