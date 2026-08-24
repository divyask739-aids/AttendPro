import { ATTENDANCE_RECORDS, DAILY_GOALS, SUBJECTS, TASKS } from './mockData'
import type { AttendanceRecord, DailyGoal, Subject, Task } from '@/types'

const NETWORK_DELAY_MS = 250

/**
 * Simulates a network request. Replace these functions with real API calls
 * (fetch/axios) when the backend is ready.
 */
function simulate<T>(data: T): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(structuredClone(data)), NETWORK_DELAY_MS)
  })
}

export function fetchSubjects(): Promise<Subject[]> {
  return simulate(SUBJECTS)
}

export function fetchAttendanceRecords(): Promise<AttendanceRecord[]> {
  return simulate(ATTENDANCE_RECORDS)
}

export function fetchTasks(): Promise<Task[]> {
  return simulate(TASKS)
}

export function fetchDailyGoals(): Promise<DailyGoal[]> {
  return simulate(DAILY_GOALS)
}
