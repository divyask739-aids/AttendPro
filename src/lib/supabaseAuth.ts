import type {
  Session,
  StaffProfile,
  StudentProfile,
  StudentVerificationRecord,
  StudentVerificationStatus,
  UserRole,
} from '@/types'
import { isSupabaseAuthEnabled, requireSupabase } from '@/lib/supabase'

interface UserProfileRow {
  id: string
  full_name: string
  role: string
  roll_number: string | null
  department: string | null
  year: string | null
  section: string | null
  institution: string
  course: string
  semester: string
  daily_study_minutes: number
  staff_id: string | null
  designation: string
  academic_year: string
  verification_status: StudentVerificationStatus
  verification_note: string | null
  verification_reviewed_by: string | null
  verification_reviewed_at: string | null
  verified_at: string | null
}

const authCallbackPayloadAtLoad =
  typeof window !== 'undefined' &&
  (new URLSearchParams(window.location.search).has('code') ||
    new URLSearchParams(window.location.search).has('error') ||
    new URLSearchParams(window.location.search).has('error_code') ||
    new URLSearchParams(window.location.hash.slice(1)).has('access_token') ||
    new URLSearchParams(window.location.hash.slice(1)).has('error'))

function authRedirect(path: string): string {
  return new URL(`${import.meta.env.BASE_URL}${path}`, window.location.origin).toString()
}

function requireAuthMode(): void {
  if (!isSupabaseAuthEnabled) {
    throw new Error('Supabase Auth is available only in the explicitly enabled staging environment.')
  }
}

function roleFromProfile(role: string): UserRole {
  if (role === 'student' || role === 'staff') return role
  throw new Error('This account does not have an authorized AttendPro role.')
}

function mapStudentProfile(
  row: UserProfileRow,
  email: string,
): StudentProfile {
  return {
    fullName: row.full_name,
    email,
    studentId: row.id,
    institution: row.institution,
    course: row.course || row.department || '',
    year: row.year ?? '',
    semester: row.semester,
    department: row.department ?? '',
    rollNumber: row.roll_number ?? '',
    section: row.section ?? '',
    verificationStatus: row.verification_status,
    verificationNote: row.verification_note ?? '',
    verificationReviewedBy: row.verification_reviewed_by ?? '',
    verificationReviewedAt: row.verification_reviewed_at ?? '',
    verifiedAt: row.verified_at ?? '',
    dailyStudyMinutes: row.daily_study_minutes,
  }
}

async function getProfileRow(userId: string): Promise<UserProfileRow> {
  const { data, error } = await requireSupabase()
    .from('user_profiles')
    .select(
      'id, full_name, role, roll_number, department, year, section, institution, course, semester, daily_study_minutes, staff_id, designation, academic_year, verification_status, verification_note, verification_reviewed_by, verification_reviewed_at, verified_at',
    )
    .eq('id', userId)
    .single()

  if (error) throw new Error(`Could not load AttendPro account profile: ${error.message}`)
  return data as UserProfileRow
}

export async function getSupabaseSession(): Promise<Session | null> {
  requireAuthMode()
  const client = requireSupabase()
  const { data, error } = await client.auth.getSession()
  if (error) throw new Error(`Could not restore the Supabase session: ${error.message}`)

  const user = data.session?.user
  if (!user) return null
  if (!user.email || !user.email_confirmed_at) {
    await client.auth.signOut()
    return null
  }

  const profile = await getProfileRow(user.id)
  return {
    id: user.id,
    email: user.email.trim().toLowerCase(),
    fullName: profile.full_name,
    role: roleFromProfile(profile.role),
    loggedInAt: data.session?.user.created_at ?? new Date().toISOString(),
  }
}

export async function registerSupabaseStudent(input: {
  email: string
  password: string
  fullName: string
  rollNumber?: string
  department?: string
  year?: string
  section?: string
}): Promise<void> {
  requireAuthMode()
  const email = input.email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.')
  if (input.password.length < 8) throw new Error('Password must contain at least 8 characters.')
  if (input.fullName.trim().length < 2 || input.fullName.trim().length > 80) {
    throw new Error('Full name must be between 2 and 80 characters.')
  }

  const { error } = await requireSupabase().auth.signUp({
    email,
    password: input.password,
    options: {
      emailRedirectTo: authRedirect('auth/callback'),
      data: {
        full_name: input.fullName.trim(),
        roll_number: input.rollNumber?.trim() ?? '',
        department: input.department?.trim() ?? '',
        year: input.year?.trim() ?? '',
        section: input.section?.trim() ?? '',
      },
    },
  })

  if (error) throw new Error(`Could not create the student account: ${error.message}`)
}

export async function loginSupabaseAccount(
  emailInput: string,
  password: string,
): Promise<Session> {
  requireAuthMode()
  const client = requireSupabase()
  const { error } = await client.auth.signInWithPassword({
    email: emailInput.trim().toLowerCase(),
    password,
  })
  if (error) {
    if (error.message.toLowerCase().includes('email not confirmed')) {
      throw new Error('Verify your email address before signing in.')
    }
    throw new Error(`Unable to sign in: ${error.message}`)
  }

  let session: Session | null
  try {
    session = await getSupabaseSession()
  } catch (error) {
    await client.auth.signOut()
    throw error
  }
  if (!session) throw new Error('The account session is unavailable. Verify your email and try again.')
  return session
}

export async function logoutSupabaseAccount(): Promise<void> {
  requireAuthMode()
  const { error } = await requireSupabase().auth.signOut()
  if (error) throw new Error(`Could not sign out: ${error.message}`)
}

export async function requestSupabasePasswordReset(emailInput: string): Promise<void> {
  requireAuthMode()
  const email = emailInput.trim().toLowerCase()
  if (!email) throw new Error('Enter your email address first.')

  const { error } = await requireSupabase().auth.resetPasswordForEmail(email, {
    redirectTo: authRedirect('auth/reset-password'),
  })
  if (error) throw new Error(`Could not send the password recovery email: ${error.message}`)
}

export async function updateSupabasePassword(password: string): Promise<Session> {
  requireAuthMode()
  if (password.length < 8) throw new Error('Password must contain at least 8 characters.')

  const { error } = await requireSupabase().auth.updateUser({ password })
  if (error) throw new Error(`Could not update the password: ${error.message}`)

  const session = await getSupabaseSession()
  if (!session) throw new Error('The recovery session expired. Request a new password recovery email.')
  return session
}

export async function fetchOwnSupabaseStudentProfile(emailInput: string): Promise<StudentProfile> {
  requireAuthMode()
  const session = await getSupabaseSession()
  if (!session || session.role !== 'student') {
    throw new Error('A signed-in student account is required to load this profile.')
  }
  if (session.email !== emailInput.trim().toLowerCase()) {
    throw new Error('You can only view your own student profile.')
  }

  return mapStudentProfile(await getProfileRow(session.id), session.email)
}

export async function saveOwnSupabaseStudentProfile(
  profile: StudentProfile,
): Promise<StudentProfile> {
  requireAuthMode()
  const session = await getSupabaseSession()
  if (!session || session.role !== 'student') {
    throw new Error('A signed-in student account is required to save this profile.')
  }
  if (session.email !== profile.email.trim().toLowerCase()) {
    throw new Error('You can only update your own student profile.')
  }

  const { data, error } = await requireSupabase().rpc('save_student_profile', {
    p_full_name: profile.fullName.trim(),
    p_institution: profile.institution.trim(),
    p_course: profile.course.trim(),
    p_semester: profile.semester.trim(),
    p_daily_study_minutes: profile.dailyStudyMinutes,
  })
  if (error) throw new Error(`Could not save your student profile: ${error.message}`)
  const row = Array.isArray(data) ? data[0] : data
  return mapStudentProfile(row as UserProfileRow, session.email)
}

export async function fetchOwnSupabaseStaffProfile(emailInput: string): Promise<StaffProfile> {
  requireAuthMode()
  const session = await getSupabaseSession()
  if (!session || session.role !== 'staff') {
    throw new Error('A signed-in staff account is required to load this profile.')
  }
  if (session.email !== emailInput.trim().toLowerCase()) {
    throw new Error('You can only view your own staff profile.')
  }

  const row = await getProfileRow(session.id)
  return {
    fullName: row.full_name,
    email: session.email,
    staffId: row.staff_id ?? '',
    department: row.department ?? '',
    designation: row.designation,
    academicYear: row.academic_year,
    subjects: [],
  }
}

export async function saveOwnSupabaseStaffProfile(
  profile: StaffProfile,
): Promise<StaffProfile> {
  requireAuthMode()
  const session = await getSupabaseSession()
  if (!session || session.role !== 'staff') {
    throw new Error('A signed-in staff account is required to save this profile.')
  }
  if (session.email !== profile.email.trim().toLowerCase()) {
    throw new Error('You can only update your own staff profile.')
  }

  const { error } = await requireSupabase().rpc('save_staff_profile', {
    p_full_name: profile.fullName.trim(),
    p_staff_id: profile.staffId.trim(),
    p_department: profile.department.trim(),
    p_designation: profile.designation.trim(),
    p_academic_year: profile.academicYear.trim(),
  })
  if (error) throw new Error(`Could not save your staff profile: ${error.message}`)
  return fetchOwnSupabaseStaffProfile(session.email)
}

export async function submitSupabaseStudentVerification(details: {
  rollNumber: string
  department: string
  year: string
  section: string
}): Promise<StudentProfile> {
  requireAuthMode()
  const session = await getSupabaseSession()
  if (!session || session.role !== 'student') {
    throw new Error('A signed-in student account is required to submit verification.')
  }

  const { data, error } = await requireSupabase().rpc('submit_student_verification', {
    p_roll_number: details.rollNumber.trim(),
    p_department: details.department.trim(),
    p_year: details.year.trim(),
    p_section: details.section.trim(),
  })
  if (error) throw new Error(`Could not submit student verification: ${error.message}`)

  const row = Array.isArray(data) ? data[0] : data
  return mapStudentProfile(row as UserProfileRow, session.email)
}

export async function fetchSupabaseStudentVerificationRecords(): Promise<StudentVerificationRecord[]> {
  requireAuthMode()
  const session = await getSupabaseSession()
  if (!session || session.role !== 'staff') {
    throw new Error('A signed-in staff account is required to review student verification.')
  }

  const { data, error } = await requireSupabase().rpc('get_staff_student_verifications')
  if (error) throw new Error(`Could not load student verification records: ${error.message}`)

  return (data ?? []).map((row: {
    email: string
    full_name: string
    roll_number: string | null
    department: string | null
    year: string | null
    section: string | null
    verification_status: StudentVerificationStatus
    verification_note: string | null
  }) => ({
    email: row.email,
    fullName: row.full_name,
    studentId: row.roll_number ?? '',
    rollNumber: row.roll_number ?? '',
    department: row.department ?? '',
    year: row.year ?? '',
    section: row.section ?? '',
    status: row.verification_status,
    note: row.verification_note ?? '',
    enrolledSubjects: [],
  }))
}

export async function reviewSupabaseStudentVerification(
  studentEmail: string,
  decision: Extract<StudentVerificationStatus, 'verified' | 'rejected'>,
  note = '',
): Promise<StudentProfile> {
  requireAuthMode()
  const session = await getSupabaseSession()
  if (!session || session.role !== 'staff') {
    throw new Error('A signed-in staff account is required to review student verification.')
  }
  const { data, error } = await requireSupabase().rpc('review_student_verification', {
    p_student_email: studentEmail.trim().toLowerCase(),
    p_decision: decision,
    p_note: note.trim(),
  })
  if (error) throw new Error(`Could not review student verification: ${error.message}`)

  const row = Array.isArray(data) ? data[0] : data
  return mapStudentProfile(row as UserProfileRow, studentEmail.trim().toLowerCase())
}

export interface StaffInvitation {
  email: string
  invitedAt: string
  status: 'pending' | 'approved'
  authUserId: string | null
  approvedUserId: string | null
}

async function requirePlatformAdminSession(): Promise<void> {
  const session = await getSupabaseSession()
  if (!session || session.role !== 'staff') {
    throw new Error('A signed-in staff administrator is required.')
  }
}

export async function listSupabaseStaffInvitations(): Promise<StaffInvitation[]> {
  requireAuthMode()
  await requirePlatformAdminSession()
  const { data, error } = await requireSupabase().rpc('admin_list_staff_invitations')
  if (error) throw new Error(`Could not load staff invitations: ${error.message}`)

  return (data ?? []).map((row: {
    email: string
    invited_at: string
    status: StaffInvitation['status']
    auth_user_id: string | null
    approved_user_id: string | null
  }) => ({
    email: row.email,
    invitedAt: row.invited_at,
    status: row.status,
    authUserId: row.auth_user_id,
    approvedUserId: row.approved_user_id,
  }))
}

export interface AdminStaffSubjectAssignments {
  userId: string
  email: string
  fullName: string
  subjects: StaffProfile['subjects']
}

export async function listSupabaseStaffSubjectAssignments(): Promise<AdminStaffSubjectAssignments[]> {
  requireAuthMode()
  await requirePlatformAdminSession()
  const { data, error } = await requireSupabase().rpc('admin_list_staff_subject_assignments')
  if (error) throw new Error(`Could not load staff subject assignments: ${error.message}`)

  const staffById = new Map<string, AdminStaffSubjectAssignments>()
  for (const row of (data ?? []) as Array<{
    staff_user_id: string
    email: string
    full_name: string
    subject_name: string | null
    subject_code: string | null
    semester: string | null
  }>) {
    const staff = staffById.get(row.staff_user_id) ?? {
      userId: row.staff_user_id,
      email: row.email,
      fullName: row.full_name,
      subjects: [],
    }
    if (row.subject_name) {
      staff.subjects.push({
        name: row.subject_name,
        code: row.subject_code ?? '',
        semester: row.semester ?? '',
      })
    }
    staffById.set(row.staff_user_id, staff)
  }
  return [...staffById.values()]
}

export async function saveSupabaseStaffSubjectAssignments(
  staffUserId: string,
  subjects: StaffProfile['subjects'],
): Promise<void> {
  requireAuthMode()
  await requirePlatformAdminSession()
  const { error } = await requireSupabase().rpc('admin_set_staff_subject_assignments', {
    p_staff_user_id: staffUserId,
    p_subjects: subjects.map(({ name, code, semester }) => ({
      name: name.trim(),
      code: code.trim(),
      semester: semester.trim(),
    })),
  })
  if (error) throw new Error(`Could not save staff subject assignments: ${error.message}`)
}

export async function createSupabaseStaffInvitation(emailInput: string): Promise<void> {
  requireAuthMode()
  await requirePlatformAdminSession()
  const email = emailInput.trim().toLowerCase()
  if (!email) throw new Error('Enter the staff member email address.')
  const { error } = await requireSupabase().rpc('admin_create_staff_invitation', {
    p_email: email,
  })
  if (error) throw new Error(`Could not create the staff invitation: ${error.message}`)
}

export async function approveSupabaseStaffInvitation(userId: string): Promise<void> {
  requireAuthMode()
  await requirePlatformAdminSession()
  const { error } = await requireSupabase().rpc('admin_approve_staff_invitation', {
    p_user_id: userId,
  })
  if (error) throw new Error(`Could not approve this staff account: ${error.message}`)
}

export async function completeSupabaseAuthCallback(): Promise<void> {
  requireAuthMode()
  if (!authCallbackPayloadAtLoad) {
    throw new Error('This page must be opened from a valid AttendPro email link.')
  }
  const callbackParams = new URLSearchParams(
    `${window.location.search.slice(1)}&${window.location.hash.slice(1)}`,
  )
  if (callbackParams.has('error') || callbackParams.has('error_code')) {
    const errorCode = callbackParams.get('error_code')?.toLowerCase() ?? ''
    if (errorCode.includes('expired') || errorCode.includes('invalid')) {
      throw new Error('This email link has expired or is invalid. Request a new verification or recovery email.')
    }
    throw new Error('The email link could not be validated. Request a new verification or recovery email.')
  }
  const session = await getSupabaseSession()
  if (!session) throw new Error('The verification link is invalid or has expired. Request a new link.')
}
