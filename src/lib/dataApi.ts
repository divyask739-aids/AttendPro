import { rescheduleMissedWork } from '@/features/planner/plannerEngine'
import { reminderOf } from '@/features/tasks/taskMeta'
import {
  createSharedSubject,
  correctOfficialAttendanceCounters,
  deleteSharedSubject,
  fetchSharedRecords,
  fetchSharedStaffSubjects,
  fetchSharedSubjects,
  fetchStaffAttendanceRows,
  importSharedAttendance,
  logSharedAttendance,
  updateSharedIdentity,
  updateSharedSubject,
  type SharedIdentity,
  type StaffAttendanceSharedRow,
} from '@/lib/attendanceSync'
import { isoToday, makeId } from '@/lib/date'
import { isAttendanceSyncConfigured } from '@/lib/supabase'
import { subjectKey } from '@/lib/subjectKey'
import {
  dataKey,
  isArrayOfObjects,
  readStore,
  removeStore,
  storageKeys,
  writeStore,
  writeStoreOrThrow,
  writeStoresOrThrow,
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
  StudentVerificationRecord,
  StudentVerificationStatus,
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

export interface StudentRegistrationInput {
  email: string
  password: string
  fullName: string
  role: UserRole
  rollNumber?: string
  department?: string
  year?: string
  section?: string
  designation?: string
}

const PASSWORD_ITERATIONS = 210_000

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
}

async function derivePasswordHash(password: string, salt: Uint8Array): Promise<Uint8Array> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Secure browser cryptography is unavailable. Use HTTPS or localhost.')
  }
  const saltBuffer = new ArrayBuffer(salt.byteLength)
  const saltBytes = new Uint8Array(saltBuffer)
  saltBytes.set(salt)
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations: PASSWORD_ITERATIONS },
    key,
    256,
  )
  return new Uint8Array(bits)
}

async function passwordHash(password: string, salt = crypto.getRandomValues(new Uint8Array(16))) {
  return {
    salt: bytesToBase64(salt),
    hash: bytesToBase64(await derivePasswordHash(password, salt)),
  }
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0)
  }
  return difference === 0
}

function makeSession(account: UserAccount): Session {
  return {
    id: makeId('session'),
    email: account.email,
    fullName: account.fullName,
    role: account.role,
    loggedInAt: new Date().toISOString(),
  }
}

export async function getSession(): Promise<Session | null> {
  const saved = readStore<unknown>(storageKeys.session, null)
  if (
    typeof saved !== 'object' ||
    saved === null ||
    typeof (saved as Session).email !== 'string' ||
    typeof (saved as Session).fullName !== 'string' ||
    ((saved as Session).role !== 'student' && (saved as Session).role !== 'staff') ||
    typeof (saved as Session).loggedInAt !== 'string'
  ) {
    return null
  }
  const session = saved as Session
  const account = getAccount(session.email)
  if (!account || account.role !== session.role) return null
  return { ...session, id: session.id || makeId('session') }
}

export function getUsers(): UserAccount[] {
  return readUsers()
}

export function getAccount(email: string): UserAccount | null {
  const target = email.trim().toLowerCase()
  return readUsers().find((user) => user.email === target) ?? null
}

export function isLocalAccount(email: string): boolean {
  return Boolean(getAccount(email))
}

function shouldUseSharedAttendance(email: string): boolean {
  return isAttendanceSyncConfigured && !isLocalAccount(email)
}

type VerificationDetails = {
  rollNumber: string
  department: string
  year: string
  section: string
}

function normalizeVerificationValue(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase() ?? ''
}

function validateVerificationDetails(
  details: Partial<VerificationDetails>,
): VerificationDetails {
  const normalized = {
    rollNumber: details.rollNumber?.trim() ?? '',
    department: details.department?.trim() ?? '',
    year: details.year?.trim() ?? '',
    section: details.section?.trim() ?? '',
  }
  if (Object.values(normalized).some((value) => !value)) {
    throw new Error('Enter your roll number, department, year, and section.')
  }
  if (normalized.rollNumber.length > 32 || normalized.department.length > 80) {
    throw new Error('Roll number or department is too long.')
  }
  if (normalized.year.length > 24 || normalized.section.length > 24) {
    throw new Error('Year or section is too long.')
  }
  return normalized
}

async function assertUniqueStudentRoll(
  email: string,
  details: VerificationDetails,
): Promise<void> {
  const targetRoll = normalizeVerificationValue(details.rollNumber)
  const targetDepartment = normalizeVerificationValue(details.department)
  const targetYear = normalizeVerificationValue(details.year)
  const targetSection = normalizeVerificationValue(details.section)
  const otherStudents = readUsers().filter(
    (account) => account.role === 'student' && account.email !== email,
  )

  for (const account of otherStudents) {
    const profile = await fetchStudentProfile(account.email)
    if (
      normalizeVerificationValue(profile.rollNumber) === targetRoll &&
      normalizeVerificationValue(profile.department) === targetDepartment &&
      normalizeVerificationValue(profile.year) === targetYear &&
      normalizeVerificationValue(profile.section) === targetSection
    ) {
      throw new Error('That roll number is already registered for this department, year, and section.')
    }
  }
}

async function assertUniqueStudentId(email: string, studentId: string): Promise<void> {
  const normalizedId = studentId.trim().toLocaleUpperCase()
  if (!normalizedId) throw new Error('A unique student ID is required before verification.')
  const otherStudents = readUsers().filter(
    (account) => account.role === 'student' && account.email !== email,
  )

  for (const account of otherStudents) {
    const profile = await fetchStudentProfile(account.email)
    if (profile.studentId.trim().toLocaleUpperCase() === normalizedId) {
      throw new Error('This student ID is already assigned to another account.')
    }
  }
}

export async function registerAccount(
  credentials: StudentRegistrationInput,
): Promise<void> {
  const email = credentials.email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.')
  if (credentials.password.length < 6) throw new Error('Password must contain at least 6 characters.')
  if (credentials.fullName.trim().length < 2) throw new Error('Enter your full name.')

  const existing = getAccount(email)
  if (existing?.passwordHash && existing.passwordSalt) {
    throw new Error('An account already exists for this email. Please log in.')
  }
  if (existing && existing.role !== credentials.role) {
    throw new Error(`This existing account has the ${existing.role} role.`)
  }

  const { salt, hash } = await passwordHash(credentials.password)
  const account: UserAccount = {
    email,
    fullName: existing?.fullName || credentials.fullName.trim(),
    role: credentials.role,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    passwordSalt: salt,
    passwordHash: hash,
    passwordIterations: PASSWORD_ITERATIONS,
  }
  const users = readUsers()
  const nextUsers = existing
    ? users.map((user) => (user.email === email ? account : user))
    : [...users, account]

  let profile: StudentProfile | StaffProfile
  if (credentials.role === 'student') {
    const details = validateVerificationDetails({
      rollNumber: credentials.rollNumber,
      department: credentials.department,
      year: credentials.year,
      section: credentials.section,
    })
    await assertUniqueStudentRoll(email, details)
    const currentProfile = await fetchStudentProfile(email)
    const studentId = currentProfile.studentId || await makeUniqueStudentId(nextUsers)
    await assertUniqueStudentId(email, studentId)
    profile = {
      ...EMPTY_STUDENT_PROFILE,
      ...currentProfile,
      fullName: currentProfile.fullName || account.fullName,
      email,
      studentId,
      rollNumber: currentProfile.rollNumber || details.rollNumber,
      department: currentProfile.department || details.department,
      year: currentProfile.year || details.year,
      section: currentProfile.section || details.section,
      verificationStatus: currentProfile.verificationStatus ?? 'not_submitted',
    }
  } else {
    const department = credentials.department?.trim() ?? ''
    const designation = credentials.designation?.trim() ?? ''
    if (!department || !designation) {
      throw new Error('Enter your department and staff designation.')
    }
    if (department.length > 80 || designation.length > 80) {
      throw new Error('Department or staff designation is too long.')
    }
    profile = readStore<StaffProfile>(dataKey(email, 'staffProfile'), {
      fullName: '',
      email,
      staffId: '',
      department: '',
      designation: '',
      academicYear: '',
      subjects: [],
    })
    profile = {
      ...profile,
      fullName: profile.fullName || account.fullName,
      email,
      department: profile.department || department,
      designation: profile.designation || designation,
    }
  }

  writeStoresOrThrow([
    [storageKeys.users, nextUsers],
    [dataKey(email, credentials.role === 'student' ? 'profile' : 'staffProfile'), profile],
  ])
}

export async function loginAccount(
  emailInput: string,
  password: string,
): Promise<Session> {
  const account = getAccount(emailInput)
  if (!account) throw new Error('No local account was found for that email. Create an account on this device.')
  if (!account.passwordHash || !account.passwordSalt) {
    throw new Error('This older local account has no password. Re-create it with a password to continue.')
  }
  const derived = await derivePasswordHash(password, base64ToBytes(account.passwordSalt))
  if (!timingSafeEqual(derived, base64ToBytes(account.passwordHash))) {
    throw new Error('The email or password is incorrect.')
  }

  const session = makeSession(account)
  writeStoreOrThrow(storageKeys.session, session)
  return session
}

export async function requestPasswordReset(emailInput: string): Promise<void> {
  if (!emailInput.trim()) throw new Error('Enter your email address first.')
  throw new Error('Password reset is not configured for browser-based accounts. Contact an administrator.')
}

export async function updatePassword(password: string): Promise<Session> {
  if (password.length < 6) throw new Error('Password must contain at least 6 characters.')
  const session = await getSession()
  if (!session) throw new Error('No signed-in local account is available.')
  const account = getAccount(session.email)
  if (!account) throw new Error('No local account is available.')
  const { salt, hash } = await passwordHash(password)
  const updated = {
    ...account,
    passwordSalt: salt,
    passwordHash: hash,
    passwordIterations: PASSWORD_ITERATIONS,
  }
  writeStoreOrThrow(
    storageKeys.users,
    readUsers().map((user) => (user.email === account.email ? updated : user)),
  )
  return makeSession(updated)
}

export async function logoutAccount(): Promise<void> {
  removeStore(storageKeys.session)
}

async function makeUniqueStudentId(accounts: UserAccount[]): Promise<string> {
  const profiles = await Promise.all(
    accounts
      .filter((account) => account.role === 'student')
      .map((account) => fetchStudentProfile(account.email)),
  )
  const existingIds = new Set(profiles.map((profile) => profile.studentId))
  let studentId = ''
  do {
    const bytes = crypto.getRandomValues(new Uint8Array(8))
    const suffix = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
    studentId = `STU-${suffix.toUpperCase()}`
  } while (existingIds.has(studentId))
  return studentId
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
  verificationStatus: 'not_submitted',
  dailyStudyMinutes: 180,
}

export async function fetchStudentProfile(email: string): Promise<StudentProfile> {
  return readStore<StudentProfile>(
    dataKey(email, 'profile'),
    { ...EMPTY_STUDENT_PROFILE, email },
  )
}

export async function submitStudentVerification(
  emailInput: string,
  submittedDetails: VerificationDetails,
): Promise<StudentProfile> {
  const email = emailInput.trim().toLowerCase()
  const account = getAccount(email)
  const session = await getSession()
  if (!account || account.role !== 'student' || session?.role !== 'student' || session.email !== email) {
    throw new Error('A signed-in student account is required to submit verification.')
  }

  const currentProfile = await fetchStudentProfile(email)
  if (currentProfile.verificationStatus === 'verified') {
    throw new Error('This student account has already been verified.')
  }

  const details = validateVerificationDetails(submittedDetails)
  await assertUniqueStudentRoll(email, details)
  await assertUniqueStudentId(email, currentProfile.studentId)
  const updatedProfile: StudentProfile = {
    ...currentProfile,
    ...details,
    verificationStatus: 'pending',
    verificationNote: '',
    verificationReviewedBy: '',
    verificationReviewedAt: '',
    verifiedAt: '',
  }
  writeStoreOrThrow(dataKey(email, 'profile'), updatedProfile)
  return updatedProfile
}

export async function fetchStudentVerificationRecords(
  staffEmailInput: string,
): Promise<StudentVerificationRecord[]> {
  const staffEmail = staffEmailInput.trim().toLowerCase()
  const staff = getAccount(staffEmail)
  const session = await getSession()
  if (!staff || staff.role !== 'staff' || session?.role !== 'staff' || session.email !== staffEmail) {
    throw new Error('A signed-in staff account is required to review student verification.')
  }

  const students = readUsers().filter((account) => account.role === 'student')
  const profiles = await Promise.all(
    students.map(async (account) => ({
      account,
      profile: await fetchStudentProfile(account.email),
    })),
  )
  return profiles.map(({ account, profile }) => ({
    email: account.email,
    fullName: profile.fullName || account.fullName,
    studentId: profile.studentId,
    rollNumber: profile.rollNumber ?? '',
    department: profile.department ?? '',
    year: profile.year,
    section: profile.section ?? '',
    status: profile.verificationStatus ?? 'not_submitted',
    note: profile.verificationNote ?? '',
  }))
}

export async function reviewStudentVerification(
  staffEmailInput: string,
  studentEmailInput: string,
  decision: Extract<StudentVerificationStatus, 'verified' | 'rejected'>,
  note = '',
): Promise<StudentProfile> {
  const staffEmail = staffEmailInput.trim().toLowerCase()
  const studentEmail = studentEmailInput.trim().toLowerCase()
  const staff = getAccount(staffEmail)
  const student = getAccount(studentEmail)
  const session = await getSession()
  if (!staff || staff.role !== 'staff' || session?.role !== 'staff' || session.email !== staffEmail) {
    throw new Error('A signed-in staff account is required to review student verification.')
  }
  if (!student || student.role !== 'student') {
    throw new Error('The student account could not be found in this browser.')
  }

  const profile = await fetchStudentProfile(studentEmail)
  if (profile.verificationStatus !== 'pending') {
    throw new Error('Only pending student verification requests can be reviewed.')
  }
  if (decision === 'verified') {
    await assertUniqueStudentRoll(studentEmail, validateVerificationDetails(profile))
    await assertUniqueStudentId(studentEmail, profile.studentId)
  }
  const reviewerNote = note.trim()
  if (reviewerNote.length > 240) throw new Error('Review notes must be 240 characters or fewer.')
  const now = new Date().toISOString()
  const updatedProfile: StudentProfile = {
    ...profile,
    verificationStatus: decision,
    verificationNote: reviewerNote,
    verificationReviewedBy: staffEmail,
    verificationReviewedAt: now,
    verifiedAt: decision === 'verified' ? now : '',
  }
  writeStoreOrThrow(dataKey(studentEmail, 'profile'), updatedProfile)
  return updatedProfile
}

export async function saveStudentProfile(
  email: string,
  profile: StudentProfile,
): Promise<StudentProfile> {
  const currentProfile = await fetchStudentProfile(email)
  const savedProfile: StudentProfile = {
    ...profile,
    fullName:
      currentProfile.verificationStatus === 'verified'
        ? currentProfile.fullName
        : profile.fullName,
    studentId: currentProfile.studentId || profile.studentId,
    rollNumber: currentProfile.rollNumber,
    department: currentProfile.department,
    year: currentProfile.year,
    section: currentProfile.section,
    verificationStatus: currentProfile.verificationStatus ?? 'not_submitted',
    verificationNote: currentProfile.verificationNote,
    verificationReviewedBy: currentProfile.verificationReviewedBy,
    verificationReviewedAt: currentProfile.verificationReviewedAt,
    verifiedAt: currentProfile.verifiedAt,
  }
  writeStoreOrThrow(dataKey(email, 'profile'), savedProfile)
  const account = getAccount(email)
  if (account) {
    writeStore(
      storageKeys.users,
      readUsers().map((user) =>
        user.email === email ? { ...user, fullName: savedProfile.fullName || user.fullName } : user,
      ),
    )
  }

  // Keep the shared roster's name/roll/course in sync. This is best-effort:
  // a network hiccup must not block editing the local profile.
  if (shouldUseSharedAttendance(email)) {
    try {
      await updateSharedIdentity(email, identityFromProfile(savedProfile))
    } catch (error) {
      // The next profile save or roster fetch retries.
    }
  }

  return savedProfile
}

function identityFromProfile(profile: StudentProfile): SharedIdentity {
  return {
    studentName: profile.fullName.trim(),
    studentId: profile.studentId.trim(),
    studentCourse: profile.course.trim(),
    studentYear: profile.year.trim(),
  }
}

/* ================================================================== *
 * Subjects + attendance (single attendance model, shared by roles)    *
 * ================================================================== */

function readSubjects(email: string): Subject[] {
  const value: unknown = readStore<unknown>(dataKey(email, 'subjects'), [])
  return isArrayOfObjects<Subject>(value) ? value : []
}

function writeSubjects(email: string, subjects: Subject[]): void {
  writeStore(dataKey(email, 'subjects'), subjects)
}

/**
 * Uploads this device's existing localStorage attendance exactly once.
 *
 * Reads are shared once Supabase is configured, but an existing account may
 * have subjects/records only on this device. The RPC ignores the call when the
 * student already has shared subjects, so a stale cache can never overwrite
 * live/manual counters. A rejected call is retried on the next read.
 */
const sharedImportCache = new Map<string, Promise<void>>()

export async function ensureSharedAttendanceReady(email: string): Promise<void> {
  if (!shouldUseSharedAttendance(email) || !email) return

  const key = email.toLowerCase()
  const cached = sharedImportCache.get(key)
  if (cached) return cached

  const pending = (async () => {
    const subjects = readSubjects(email)
    if (subjects.length === 0) return
    const profile = await fetchStudentProfile(email)
    await importSharedAttendance({
      studentEmail: email,
      identity: identityFromProfile(profile),
      subjects,
      records: readRecords(email),
    })
  })()

  sharedImportCache.set(key, pending)
  try {
    await pending
  } catch (error) {
    sharedImportCache.delete(key)
    throw error
  }
}

export async function fetchSubjects(email: string): Promise<Subject[]> {
  if (shouldUseSharedAttendance(email)) {
    try {
      await ensureSharedAttendanceReady(email)
      return await fetchSharedSubjects(email)
    } catch (error) {
      // Offline or schema not applied yet — keep the local cache usable.
    }
  }
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

  if (shouldUseSharedAttendance(email)) {
    await ensureSharedAttendanceReady(email)
    const profile = await fetchStudentProfile(email)
    const saved = await createSharedSubject({
      studentEmail: email,
      subject,
      identity: identityFromProfile(profile),
    })
    const savedKey = subjectKey(saved.name, saved.code)
    writeSubjects(email, [
      saved,
      ...readSubjects(email).filter(
        (item) => item.id !== saved.id && subjectKey(item.name, item.code) !== savedKey,
      ),
    ])
    return saved
  }

  writeSubjects(email, [subject, ...readSubjects(email)])
  return subject
}

export async function updateSubject(
  email: string,
  subject: Subject,
): Promise<Subject> {
  if (shouldUseSharedAttendance(email)) {
    await ensureSharedAttendanceReady(email)
    const saved = await updateSharedSubject(email, subject)
    writeSubjects(
      email,
      readSubjects(email).map((item) =>
        item.id === subject.id || item.id === saved.id ? saved : item,
      ),
    )
    return saved
  }

  writeSubjects(
    email,
    readSubjects(email).map((item) => (item.id === subject.id ? subject : item)),
  )
  return subject
}

export async function deleteSubject(email: string, subjectId: string): Promise<void> {
  if (shouldUseSharedAttendance(email)) {
    await ensureSharedAttendanceReady(email)
    await deleteSharedSubject(email, subjectId)
  }

  writeSubjects(
    email,
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

export function hasLocalAttendanceRecord(
  studentEmail: string,
  subjectId: string,
  date: string,
): boolean {
  return readRecords(studentEmail).some(
    (record) => record.subjectId === subjectId && record.date === date,
  )
}

export async function fetchAttendanceRecords(
  email: string,
): Promise<AttendanceRecord[]> {
  if (shouldUseSharedAttendance(email)) {
    try {
      await ensureSharedAttendanceReady(email)
      const records = await fetchSharedRecords(email)
      return records.sort((a, b) => b.date.localeCompare(a.date))
    } catch (error) {
      // Offline or schema not applied yet — keep the local cache usable.
    }
  }
  return readRecords(email).sort((a, b) => b.date.localeCompare(a.date))
}

/** Records one class for a subject and updates its counters. */
export async function logAttendance(
  email: string,
  subjectId: string,
  status: AttendanceStatus,
  date: string,
): Promise<Subject | null> {
  const recordId = makeId('att')

  if (shouldUseSharedAttendance(email)) {
    await ensureSharedAttendanceReady(email)
    const subject = await logSharedAttendance({
      studentEmail: email,
      subjectId,
      status,
      date,
      recordId,
    })
    const record: AttendanceRecord = { id: recordId, subjectId: subject.id, date, status }
    writeStore(dataKey(email, 'attendance.records'), [
      record,
      ...readRecords(email).filter((item) => item.id !== recordId),
    ])
    writeSubjects(
      email,
      readSubjects(email).map((item) => (item.id === subject.id ? subject : item)),
    )
    return subject
  }

  const record: AttendanceRecord = { id: recordId, subjectId, date, status }
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
  writeSubjects(
    email,
    subjects.map((item) => (item.id === subjectId ? updated : item)),
  )
  return updated
}

export async function confirmLocalStaffAttendance(
  staffEmail: string,
  studentEmail: string,
  subjectId: string,
  date: string,
): Promise<void> {
  const staff = getAccount(staffEmail)
  const student = getAccount(studentEmail)
  const session = await getSession()
  if (
    !staff ||
    staff.role !== 'staff' ||
    session?.role !== 'staff' ||
    session.email !== staff.email
  ) {
    throw new Error('A signed-in local staff account is required to confirm attendance.')
  }
  if (!student || student.role !== 'student') {
    throw new Error('The student does not exist in this browser’s local account list.')
  }
  const studentProfile = await fetchStudentProfile(student.email)
  if (studentProfile.verificationStatus !== 'verified') {
    throw new Error('Only verified students can be marked present through camera attendance.')
  }
  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Date(`${date}T00:00:00.000Z`)
    : null
  if (!parsedDate || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
    throw new Error('Choose a valid attendance date.')
  }

  const studentSubject = readSubjects(student.email).find((item) => item.id === subjectId)
  if (!studentSubject) throw new Error('The student is not enrolled in this subject.')
  const staffProfile = await fetchStaffProfile(staff.email)
  const isAssigned = staffProfile.subjects.some(
    (subject) => subjectKey(subject.name, subject.code) === subjectKey(studentSubject.name, studentSubject.code),
  )
  if (!isAssigned) throw new Error('This subject is not assigned to the staff account.')

  const save = () => {
    const records = readRecords(student.email)
    if (records.some((record) => record.subjectId === subjectId && record.date === date)) {
      throw new Error('Attendance has already been recorded for this student, subject, and date.')
    }

    const subjects = readSubjects(student.email)
    const currentSubject = subjects.find((item) => item.id === subjectId)
    if (!currentSubject) throw new Error('The student is no longer enrolled in this subject.')
    const record: AttendanceRecord = {
      id: makeId('att'),
      subjectId,
      date,
      status: 'present',
      source: 'staff_confirmed',
    }
    const updatedSubject: Subject = {
      ...currentSubject,
      held: currentSubject.held + 1,
      attended: currentSubject.attended + 1,
    }
    writeStoresOrThrow([
      [dataKey(student.email, 'attendance.records'), [record, ...records]],
      [
        dataKey(student.email, 'subjects'),
        subjects.map((item) => (item.id === subjectId ? updatedSubject : item)),
      ],
    ])
  }

  if (typeof navigator !== 'undefined' && navigator.locks) {
    await navigator.locks.request(
      `attendpro.attendance.${student.email}.${subjectId}.${date}`,
      save,
    )
  } else {
    save()
  }
}

/** Lets staff correct a student's counters — the student sees it on next read. */
export async function setSubjectCounters(
  studentEmail: string,
  subjectId: string,
  held: number,
  attended: number,
  reason: string,
): Promise<Subject | null> {
  if (shouldUseSharedAttendance(studentEmail)) {
    const saved = await correctOfficialAttendanceCounters(
      studentEmail,
      subjectId,
      held,
      attended,
      reason,
    )
    writeSubjects(
      studentEmail,
      readSubjects(studentEmail).map((item) =>
        item.id === subjectId || item.id === saved.id ? saved : item,
      ),
    )
    return saved
  }

  const subjects = readSubjects(studentEmail)
  const target = subjects.find((item) => item.id === subjectId)
  if (!target) return null
  const updated: Subject = { ...target, held, attended }
  writeSubjects(
    studentEmail,
    subjects.map((item) => (item.id === subjectId ? updated : item)),
  )
  return updated
}

/* ================================================================== *
 * Tasks                                                                *
 * ================================================================== */

function readTasks(email: string): Task[] {
  const value: unknown = readStore<unknown>(dataKey(email, 'tasks'), [])
  if (!isArrayOfObjects<Task>(value)) return []
  // Backward compatibility: tasks stored before reminders existed have no
  // `reminder` field, so they are read back as `'none'`.
  return value.map((task) => ({
    ...task,
    reminder: reminderOf(task),
  }))
}

export async function fetchTasks(email: string): Promise<Task[]> {
  return readTasks(email)
}

export type TaskInput = Omit<Task, 'id'>

export async function createTask(email: string, input: TaskInput): Promise<Task> {
  const task: Task = { ...input, reminder: reminderOf(input), id: makeId('task') }
  writeStore(dataKey(email, 'tasks'), [task, ...readTasks(email)])
  return task
}

export async function updateTask(email: string, task: Task): Promise<Task> {
  const updated: Task = { ...task, reminder: reminderOf(task) }
  writeStore(
    dataKey(email, 'tasks'),
    readTasks(email).map((item) => (item.id === updated.id ? updated : item)),
  )
  return updated
}

export async function patchTask(
  email: string,
  taskId: string,
  patch: Partial<Omit<Task, 'id'>>,
): Promise<Task | null> {
  const tasks = readTasks(email)
  const current = tasks.find((item) => item.id === taskId)
  if (!current) return null
  const updated: Task = { ...current, ...patch, reminder: reminderOf({ ...current, ...patch }) }
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
  const local = readStore<StaffProfile>(dataKey(email, 'staffProfile'), {
    fullName: '',
    email,
    staffId: '',
    department: '',
    designation: '',
    academicYear: '',
    subjects: [],
  })

  // The trusted platform assignment list, not this editable local profile,
  // determines the subjects that can scope attendance operations.
  if (shouldUseSharedAttendance(email) && email) {
    const shared = await fetchSharedStaffSubjects(email)
    const hydrated: StaffProfile = { ...local, subjects: shared }
    writeStore(dataKey(email, 'staffProfile'), hydrated)
    return hydrated
  }

  if (shouldUseSharedAttendance(email) && email && local.subjects.length === 0) {
    try {
      const shared = await fetchSharedStaffSubjects(email)
      if (shared.length > 0) {
        const hydrated: StaffProfile = { ...local, subjects: shared }
        writeStore(dataKey(email, 'staffProfile'), hydrated)
        return hydrated
      }
    } catch {
      // Offline / schema not applied yet — keep the local profile.
    }
  }

  return local
}

export async function saveStaffProfile(
  email: string,
  profile: StaffProfile,
): Promise<StaffProfile> {
  const saved = shouldUseSharedAttendance(email)
    ? { ...profile, subjects: await fetchSharedStaffSubjects(email) }
    : profile
  writeStore(dataKey(email, 'staffProfile'), saved)
  return saved
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

interface SubjectBucket {
  key: string
  nameKey: string
  name: string
  code: string
  semester: string
  percents: number[]
  atRisk: number
}

function percentOf(held: number, attended: number): number {
  return held > 0 ? Math.round((attended / held) * 100) : 0
}

/** Starts one bucket per taught subject so 0-student subjects still display. */
function emptySubjectBuckets(profile: StaffProfile): Map<string, SubjectBucket> {
  const buckets = new Map<string, SubjectBucket>()
  for (const taught of profile.subjects) {
    const key = subjectKey(taught.name, taught.code)
    buckets.set(key, {
      key,
      nameKey: subjectKey(taught.name),
      name: taught.name,
      code: taught.code,
      semester: taught.semester,
      percents: [],
      atRisk: 0,
    })
  }
  return buckets
}

function bucketsToSubjects(
  buckets: Map<string, SubjectBucket>,
): StaffSubjectAnalytics[] {
  return [...buckets.entries()].map(([key, bucket]) => ({
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
  }))
}

function rosterFromSharedRows(
  profile: StaffProfile,
  sharedRows: StaffAttendanceSharedRow[],
): {
  profile: StaffProfile
  subjects: StaffSubjectAnalytics[]
  rows: StudentAttendanceRow[]
} {
  const buckets = emptySubjectBuckets(profile)
  const byNameKey = new Map<string, SubjectBucket>()
  for (const bucket of buckets.values()) {
    if (!byNameKey.has(bucket.nameKey)) byNameKey.set(bucket.nameKey, bucket)
  }

  const rows: StudentAttendanceRow[] = []

  for (const row of sharedRows) {
    const fullKey = row.subjectKey || subjectKey(row.subjectName, row.subjectCode)
    const bucket =
      buckets.get(fullKey) ?? byNameKey.get(subjectKey(row.subjectName))
    if (!bucket) continue // student is not in one of my subjects

    const percent = percentOf(row.held, row.attended)
    bucket.percents.push(percent)
    if (percent < 75) bucket.atRisk += 1

    rows.push({
      studentEmail: row.studentEmail,
      studentName: row.studentName || row.studentEmail,
      studentId: row.studentId || '-',
      department: row.studentCourse || '-',
      year: row.studentYear || '-',
      subjectId: row.subjectId,
      subjectName: row.subjectName,
      subjectCode: row.subjectCode,
      attended: row.attended,
      held: row.held,
      percent,
    })
  }

  return { profile, subjects: bucketsToSubjects(buckets), rows }
}

/** Legacy path: this device's localStorage (used when the backend is absent). */
async function rosterFromLocal(email: string): Promise<{
  profile: StaffProfile
  subjects: StaffSubjectAnalytics[]
  rows: StudentAttendanceRow[]
}> {
  const profile = await fetchStaffProfile(email)
  const students = readUsers().filter((user) => user.role === 'student')

  const rows: StudentAttendanceRow[] = []
  const buckets = emptySubjectBuckets(profile)

  for (const student of students) {
    const studentProfile = await fetchStudentProfile(student.email)
    for (const subject of readSubjects(student.email)) {
      const key = subjectKey(subject.name, subject.code)
      const bucket = buckets.get(key)
      if (!bucket) continue // student not in one of my subjects

      const percent = percentOf(subject.held, subject.attended)
      bucket.percents.push(percent)
      if (percent < 75) bucket.atRisk += 1

      rows.push({
        studentEmail: student.email,
        studentName: studentProfile.fullName || student.fullName,
        studentId: studentProfile.studentId || '-',
        department: studentProfile.department || studentProfile.course || studentProfile.institution || '-',
        year: studentProfile.year || '-',
        rollNumber: studentProfile.rollNumber || '-',
        section: studentProfile.section || '-',
        verificationStatus: studentProfile.verificationStatus ?? 'not_submitted',
        subjectId: subject.id,
        subjectName: subject.name,
        subjectCode: subject.code,
        attended: subject.attended,
        held: subject.held,
        percent,
      })
    }
  }

  return { profile, subjects: bucketsToSubjects(buckets), rows }
}

/**
 * Builds the staff roster from the SAME shared attendance model students use:
 * a row exists only when a student is actually enrolled in a taught subject.
 * Joining a live class with its code enrolls the student in that subject, so
 * the roster updates without any extra setup on the student's device.
 */
export async function fetchStaffRoster(email: string): Promise<{
  profile: StaffProfile
  subjects: StaffSubjectAnalytics[]
  rows: StudentAttendanceRow[]
}> {
  const profile = await fetchStaffProfile(email)

  if (shouldUseSharedAttendance(email)) {
    let sharedError: unknown

    try {
      const sharedRows = await fetchStaffAttendanceRows(email)
      return rosterFromSharedRows(profile, sharedRows)
    } catch (error) {
      sharedError = error
    }

    // Fall back to this device's cache only when it actually has rows. An
    // empty local roster would misleadingly render "0 Students" when the
    // shared query failed, hiding the real problem from staff.
    const localRoster = await rosterFromLocal(email)
    if (localRoster.rows.length > 0) {
      return localRoster
    }

    throw sharedError instanceof Error
      ? sharedError
      : new Error('Could not load the shared student roster. Check your connection and try again.')
  }

  return rosterFromLocal(email)
}

export type { UserRole, TaskPriority }
