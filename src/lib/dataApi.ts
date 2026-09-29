import { rescheduleMissedWork } from '@/features/planner/plannerEngine'
import { isoToday, makeId } from '@/lib/date'
import { subjectKey } from '@/lib/subjectKey'
import {
  dataKey,
  isArrayOfObjects,
  readStore,
  removeStore,
  storageKeys,
  writeStore,
} from '@/lib/storage'
import type {
  AcademicActivity,
  AttendanceRecord,
  AttendanceStatus,
  ProductivityGoal,
  Session,
  StaffProfile,
  StudentAttendanceRow,
  StudentProfile,
  Subject,
  Task,
  TaskPriority,
  UserAccount,
  UserRole,
} from '@/types'

/* ================================================================== *
 * Accounts + session (role-aware)                                     *
 * ================================================================== */

function readUsers(): UserAccount[] {
  const value: unknown = readStore<unknown>(storageKeys.users, [])
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is UserAccount =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as UserAccount).email === 'string' &&
      typeof (item as UserAccount).role === 'string',
  )
}

export function getSession(): Session | null {
  return readStore<Session | null>(storageKeys.session, null)
}

export function getUsers(): UserAccount[] {
  return readUsers()
}

export function getAccount(email: string): UserAccount | null {
  const target = email.trim().toLowerCase()
  return readUsers().find((user) => user.email === target) ?? null
}

export interface Credentials {
  email: string
  fullName: string
  role: UserRole
  studentId?: string
  staffId?: string
}

export async function registerAccount(credentials: Credentials): Promise<Session> {
  const email = credentials.email.trim().toLowerCase()
  const account: UserAccount = {
    email,
    fullName: credentials.fullName.trim(),
    role: credentials.role,
    createdAt: new Date().toISOString(),
  }
  writeStore(storageKeys.users, [...readUsers(), account])

  // Seed the role-specific profile so setup flows start from a clean slate.
  if (credentials.role === 'student') {
    await saveStudentProfile(email, {
      fullName: account.fullName,
      email,
      studentId: credentials.studentId ?? '',
      institution: '',
      course: '',
      year: '',
      semester: '',
      dailyStudyMinutes: 180,
    })
  } else {
    await saveStaffProfile(email, {
      fullName: account.fullName,
      email,
      staffId: credentials.staffId ?? '',
      department: '',
      designation: '',
      academicYear: '',
      subjects: [],
    })
  }

  const session: Session = { ...account, loggedInAt: new Date().toISOString() }
  writeStore(storageKeys.session, session)
  return session
}

export async function loginAccount(emailInput: string, role: UserRole): Promise<Session> {
  const email = emailInput.trim().toLowerCase()
  const account = getAccount(email)
  if (!account) throw new Error('No account found for that email. Please register first.')
  if (account.role !== role) {
    throw new Error(
      `This account is registered as ${account.role}. Please continue to the ${account.role} portal.`,
    )
  }
  const session: Session = { ...account, loggedInAt: new Date().toISOString() }
  writeStore(storageKeys.session, session)
  return session
}

export async function logoutAccount(): Promise<void> {
  removeStore(storageKeys.session)
}

/* ================================================================== *
 * Student profile                                                      *
 * ================================================================== */

export const EMPTY_STUDENT_PROFILE: StudentProfile = {
  fullName: '',
  email: '',
  studentId: '',
  institution: '',
  course: '',
  year: '',
  semester: '',
  dailyStudyMinutes: 180,
}

export async function fetchStudentProfile(email: string): Promise<StudentProfile> {
  return readStore<StudentProfile>(
    dataKey(email, 'profile'),
    { ...EMPTY_STUDENT_PROFILE, email },
  )
}

export async function saveStudentProfile(
  email: string,
  profile: StudentProfile,
): Promise<StudentProfile> {
  writeStore(dataKey(email, 'profile'), profile)
  const account = getAccount(email)
  if (account) {
    writeStore(
      storageKeys.users,
      readUsers().map((user) =>
        user.email === email ? { ...user, fullName: profile.fullName || user.fullName } : user,
      ),
    )
  }
  return profile
}

/* ================================================================== *
 * Subjects + attendance (single attendance model, shared by roles)    *
 * ================================================================== */

function readSubjects(email: string): Subject[] {
  const value: unknown = readStore<unknown>(dataKey(email, 'subjects'), [])
  return isArrayOfObjects<Subject>(value) ? value : []
}

export async function fetchSubjects(email: string): Promise<Subject[]> {
  return readSubjects(email)
}

export type SubjectInput = Pick<Subject, 'name' | 'code' | 'faculty'>

export async function createSubject(
  email: string,
  input: SubjectInput,
): Promise<Subject> {
  const subject: Subject = {
    id: makeId('sub'),
    name: input.name.trim(),
    code: input.code.trim(),
    faculty: input.faculty.trim(),
    held: 0,
    attended: 0,
  }
  writeStore(dataKey(email, 'subjects'), [subject, ...readSubjects(email)])
  return subject
}

export async function updateSubject(
  email: string,
  subject: Subject,
): Promise<Subject> {
  writeStore(
    dataKey(email, 'subjects'),
    readSubjects(email).map((item) => (item.id === subject.id ? subject : item)),
  )
  return subject
}

export async function deleteSubject(email: string, subjectId: string): Promise<void> {
  writeStore(
    dataKey(email, 'subjects'),
    readSubjects(email).filter((item) => item.id !== subjectId),
  )
  writeStore(
    dataKey(email, 'tasks'),
    readTasks(email).map((task) =>
      task.subjectId === subjectId ? { ...task, subjectId: null } : task,
    ),
  )
  writeStore(
    dataKey(email, 'attendance.records'),
    readRecords(email).filter((record) => record.subjectId !== subjectId),
  )
}

function readRecords(email: string): AttendanceRecord[] {
  const value: unknown = readStore<unknown>(dataKey(email, 'attendance.records'), [])
  return isArrayOfObjects<AttendanceRecord>(value) ? value : []
}

export async function fetchAttendanceRecords(
  email: string,
): Promise<AttendanceRecord[]> {
  return readRecords(email).sort((a, b) => b.date.localeCompare(a.date))
}

/** Records one class for a subject and updates its counters. */
export async function logAttendance(
  email: string,
  subjectId: string,
  status: AttendanceStatus,
  date: string,
): Promise<Subject | null> {
  const record: AttendanceRecord = { id: makeId('att'), subjectId, date, status }
  writeStore(dataKey(email, 'attendance.records'), [record, ...readRecords(email)])

  const subjects = readSubjects(email)
  const target = subjects.find((item) => item.id === subjectId)
  if (!target) return null

  const counts = status !== 'cancelled'
  const updated: Subject = {
    ...target,
    held: target.held + (counts ? 1 : 0),
    attended: target.attended + (status === 'present' || status === 'late' ? 1 : 0),
  }
  writeStore(
    dataKey(email, 'subjects'),
    subjects.map((item) => (item.id === subjectId ? updated : item)),
  )
  return updated
}

/** Lets staff correct a student's counters — student sees it on next read. */
export async function setSubjectCounters(
  studentEmail: string,
  subjectId: string,
  held: number,
  attended: number,
): Promise<Subject | null> {
  const subjects = readSubjects(studentEmail)
  const target = subjects.find((item) => item.id === subjectId)
  if (!target) return null
  const updated: Subject = { ...target, held, attended }
  writeStore(
    dataKey(studentEmail, 'subjects'),
    subjects.map((item) => (item.id === subjectId ? updated : item)),
  )
  return updated
}

/* ================================================================== *
 * Tasks                                                                *
 * ================================================================== */

function readTasks(email: string): Task[] {
  const value: unknown = readStore<unknown>(dataKey(email, 'tasks'), [])
  return isArrayOfObjects<Task>(value) ? value : []
}

export async function fetchTasks(email: string): Promise<Task[]> {
  return readTasks(email)
}

export type TaskInput = Omit<Task, 'id'>

export async function createTask(email: string, input: TaskInput): Promise<Task> {
  const task: Task = { id: makeId('task'), ...input }
  writeStore(dataKey(email, 'tasks'), [task, ...readTasks(email)])
  return task
}

export async function updateTask(email: string, task: Task): Promise<Task> {
  writeStore(
    dataKey(email, 'tasks'),
    readTasks(email).map((item) => (item.id === task.id ? task : item)),
  )
  return task
}

export async function patchTask(
  email: string,
  taskId: string,
  patch: Partial<Omit<Task, 'id'>>,
): Promise<Task | null> {
  const tasks = readTasks(email)
  const current = tasks.find((item) => item.id === taskId)
  if (!current) return null
  const updated: Task = { ...current, ...patch }
  writeStore(
    dataKey(email, 'tasks'),
    tasks.map((item) => (item.id === taskId ? updated : item)),
  )
  return updated
}

export async function deleteTask(email: string, taskId: string): Promise<void> {
  writeStore(
    dataKey(email, 'tasks'),
    readTasks(email).filter((item) => item.id !== taskId),
  )
}

/**
 * Marks overdue open tasks as `missed` and pushes their deadlines forward
 * within the student's daily study budget, then persists the result.
 */
export async function rescheduleOverdueTasks(
  email: string,
  dailyStudyMinutes: number,
): Promise<{ rescheduledCount: number }> {
  const { rescheduledTasks, rescheduledCount } = rescheduleMissedWork(
    readTasks(email),
    isoToday(),
    dailyStudyMinutes,
  )
  if (rescheduledCount > 0) {
    writeStore(dataKey(email, 'tasks'), rescheduledTasks)
  }
  return { rescheduledCount }
}

/* ================================================================== *
 * Productivity goals (Goals page)                                     *
 * ================================================================== */
function readProductivityGoals(email: string): ProductivityGoal[] {
  const value: unknown = readStore<unknown>(dataKey(email, 'productivity.goals'), [])
  return isArrayOfObjects<ProductivityGoal>(value) ? value : []
}

export async function fetchProductivityGoals(
  email: string,
): Promise<ProductivityGoal[]> {
  return readProductivityGoals(email)
}

export type ProductivityGoalInput = Omit<ProductivityGoal, 'id' | 'createdAt'>

export async function createProductivityGoal(
  email: string,
  input: ProductivityGoalInput,
): Promise<ProductivityGoal> {
  const goal: ProductivityGoal = { id: makeId('goal'), ...input, createdAt: new Date().toISOString() }
  writeStore(dataKey(email, 'productivity.goals'), [goal, ...readProductivityGoals(email)])
  return goal
}

export async function updateProductivityGoal(
  email: string,
  goal: ProductivityGoal,
): Promise<ProductivityGoal> {
  writeStore(
    dataKey(email, 'productivity.goals'),
    readProductivityGoals(email).map((item) => (item.id === goal.id ? goal : item)),
  )
  return goal
}

export async function patchProductivityGoal(
  email: string,
  goalId: string,
  patch: Partial<Omit<ProductivityGoal, 'id'>>,
): Promise<ProductivityGoal | null> {
  const goals = readProductivityGoals(email)
  const current = goals.find((item) => item.id === goalId)
  if (!current) return null
  const updated: ProductivityGoal = { ...current, ...patch }
  writeStore(
    dataKey(email, 'productivity.goals'),
    goals.map((item) => (item.id === goalId ? updated : item)),
  )
  return updated
}

export async function deleteProductivityGoal(email: string, goalId: string): Promise<void> {
  writeStore(
    dataKey(email, 'productivity.goals'),
    readProductivityGoals(email).filter((item) => item.id !== goalId),
  )
}

/* ================================================================== *
 * Staff: profile, teaching assignments, activities, analytics          *
 * ================================================================== */

export async function fetchStaffProfile(email: string): Promise<StaffProfile> {
  return readStore<StaffProfile>(dataKey(email, 'staffProfile'), {
    fullName: '',
    email,
    staffId: '',
    department: '',
    designation: '',
    academicYear: '',
    subjects: [],
  })
}

export async function saveStaffProfile(
  email: string,
  profile: StaffProfile,
): Promise<StaffProfile> {
  writeStore(dataKey(email, 'staffProfile'), profile)
  return profile
}

function readActivities(email: string): AcademicActivity[] {
  const value: unknown = readStore<unknown>(dataKey(email, 'activities'), [])
  return isArrayOfObjects<AcademicActivity>(value) ? value : []
}

export async function fetchActivities(email: string): Promise<AcademicActivity[]> {
  return readActivities(email).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
}

export type AcademicActivityInput = Omit<AcademicActivity, 'id' | 'createdAt' | 'createdBy'>

export async function createActivity(
  email: string,
  input: AcademicActivityInput,
): Promise<AcademicActivity> {
  const activity: AcademicActivity = {
    id: makeId('act'),
    createdBy: email,
    ...input,
    createdAt: new Date().toISOString(),
  }
  writeStore(dataKey(email, 'activities'), [activity, ...readActivities(email)])
  return activity
}

export async function deleteActivity(email: string, activityId: string): Promise<void> {
  writeStore(
    dataKey(email, 'activities'),
    readActivities(email).filter((item) => item.id !== activityId),
  )
}

/** All staff accounts — used to broadcast academic activities to students. */
function allStaffEmails(): string[] {
  return readUsers().filter((user) => user.role === 'staff').map((user) => user.email)
}

export async function fetchVisibleActivities(
  viewerEmail: string,
  viewerRole: UserRole,
  subjectNames: string[],
): Promise<AcademicActivity[]> {
  const all = allStaffEmails().flatMap((email) => readActivities(email))
  if (viewerRole === 'staff') {
    return all
      .filter((activity) => activity.createdBy === viewerEmail)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  }
  const wanted = new Set(subjectNames.map((name) => subjectKey(name)))
  return all
    .filter((activity) => wanted.has(subjectKey(activity.subjectName, activity.subjectCode)))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
}

export interface StaffSubjectAnalytics {
  key: string
  name: string
  code: string
  semester: string
  studentCount: number
  averagePercent: number
  atRiskCount: number
}

/**
 * Builds the staff roster by reading the academic data of every enrolled
 * student — the same subject + attendance records students see themselves.
 */
export async function fetchStaffRoster(email: string): Promise<{
  profile: StaffProfile
  subjects: StaffSubjectAnalytics[]
  rows: StudentAttendanceRow[]
}> {
  const profile = await fetchStaffProfile(email)
  const students = readUsers().filter((user) => user.role === 'student')

  const rows: StudentAttendanceRow[] = []
  const subjectBuckets = new Map<
    string,
    { name: string; code: string; semester: string; percents: number[]; atRisk: number }
  >()

  for (const taught of profile.subjects) {
    const key = subjectKey(taught.name, taught.code)
    subjectBuckets.set(key, {
      name: taught.name,
      code: taught.code,
      semester: taught.semester,
      percents: [],
      atRisk: 0,
    })
  }

  for (const student of students) {
    const studentProfile = await fetchStudentProfile(student.email)
    for (const subject of readSubjects(student.email)) {
      const key = subjectKey(subject.name, subject.code)
      const bucket = subjectBuckets.get(key)
      if (!bucket) continue // student not in one of my subjects

      const percent =
        subject.held > 0 ? Math.round((subject.attended / subject.held) * 100) : 0
      bucket.percents.push(percent)
      if (percent < 75) bucket.atRisk += 1

      rows.push({
        studentEmail: student.email,
        studentName: studentProfile.fullName || student.fullName,
        studentId: studentProfile.studentId || '-',
        department: studentProfile.course || studentProfile.institution || '-',
        year: studentProfile.year || '-',
        subjectId: subject.id,
        subjectName: subject.name,
        subjectCode: subject.code,
        attended: subject.attended,
        held: subject.held,
        percent,
      })
    }
  }

  const subjects: StaffSubjectAnalytics[] = [...subjectBuckets.entries()].map(
    ([key, bucket]) => ({
      key,
      name: bucket.name,
      code: bucket.code,
      semester: bucket.semester,
      studentCount: bucket.percents.length,
      averagePercent:
        bucket.percents.length > 0
          ? Math.round(
              bucket.percents.reduce((sum, p) => sum + p, 0) / bucket.percents.length,
            )
          : 0,
      atRiskCount: bucket.atRisk,
    }),
  )

  return { profile, subjects, rows }
}

export type { UserRole, TaskPriority }
