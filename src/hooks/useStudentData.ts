import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createActivity,
  createProductivityGoal,
  createSubject,
  createTask,
  deleteActivity,
  deleteProductivityGoal,
  deleteSubject,
  deleteTask,
  fetchStaffProfile,
  fetchStudentProfile,
  getSession,
  loginAccount,
  logoutAccount,
  patchProductivityGoal,
  patchTask,
  registerAccount,
  requestPasswordReset,
  submitStudentVerification,
  rescheduleOverdueTasks,
  saveStaffProfile,
  saveStudentProfile,
  updateSubject,
  updateTask,
  updatePassword,
  type AcademicActivityInput,
  type ProductivityGoalInput,
  type StudentRegistrationInput,
  type SubjectInput,
  type TaskInput,
} from '@/lib/dataApi'
import { logAttendance } from '@/lib/dataApi'
import type {
  AttendanceStatus,
  ProductivityGoal,
  Session,
  StaffProfile,
  StudentProfile,
  Subject,
  Task,
} from '@/types'

/* ------------------------------ session ------------------------------ */

export function useSession() {
  const query = useQuery({
    queryKey: ['session'],
    queryFn: getSession,
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: false,
  })
  return {
    session: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useAuthMutations() {
  const queryClient = useQueryClient()

  const register = useMutation({
    mutationFn: (credentials: StudentRegistrationInput) => registerAccount(credentials),
  })

  const login = useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      loginAccount(input.email, input.password),
    onSuccess: (session) => queryClient.setQueryData<Session>(['session'], session),
  })

  const logout = useMutation({
    mutationFn: () => logoutAccount(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['session'] }),
  })

  const resetPassword = useMutation({
    mutationFn: (email: string) => requestPasswordReset(email),
  })

  const changePassword = useMutation({
    mutationFn: (password: string) => updatePassword(password),
    onSuccess: (session) => queryClient.setQueryData<Session>(['session'], session),
  })

  return { register, login, logout, resetPassword, changePassword }
}

/* ------------------------------ profiles ----------------------------- */

export function useStudentProfile(email: string | undefined) {
  const query = useQuery({
    queryKey: ['profile', email],
    queryFn: () => fetchStudentProfile(email ?? ''),
    enabled: Boolean(email),
  })

  const profile = query.data
  return {
    profile,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isComplete: Boolean(
      profile?.fullName && profile?.studentId && profile?.institution && profile?.course,
    ),
  }
}

export function useStaffProfile(email: string | undefined) {
  const query = useQuery({
    queryKey: ['staff-profile', email],
    queryFn: () => fetchStaffProfile(email ?? ''),
    enabled: Boolean(email),
  })

  const profile = query.data
  return {
    profile,
    isLoading: query.isLoading,
    isComplete: Boolean(profile?.fullName && profile?.staffId && profile?.department),
  }
}

export function useProfileMutations(email: string | undefined) {
  const queryClient = useQueryClient()
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['profile', email] })
    void queryClient.invalidateQueries({ queryKey: ['staff-profile', email] })
    // Identity + taught subjects feed the shared staff roster.
    void queryClient.invalidateQueries({ queryKey: ['staff-roster'] })
    void queryClient.invalidateQueries({ queryKey: ['session'] })
  }

  const saveStudent = useMutation({
    mutationFn: (profile: StudentProfile) => saveStudentProfile(email ?? '', profile),
    onSuccess: invalidate,
  })

  const saveStaff = useMutation({
    mutationFn: (profile: StaffProfile) => saveStaffProfile(email ?? '', profile),
    onSuccess: invalidate,
  })

  return { saveStudent, saveStaff }
}

export function useStudentVerificationMutation(email: string | undefined) {
  const queryClient = useQueryClient()
  const submitVerification = useMutation({
    mutationFn: (details: {
      rollNumber: string
      department: string
      year: string
      section: string
    }) => submitStudentVerification(email ?? '', details),
    onSuccess: (profile) => {
      queryClient.setQueryData(['profile', email], profile)
      void queryClient.invalidateQueries({ queryKey: ['staff-roster'] })
      void queryClient.invalidateQueries({ queryKey: ['student-verifications'] })
    },
  })
  return { submitVerification }
}

/* ---------------- subjects / attendance (shared model) -------------- */

export function useSubjectMutations(email: string | undefined) {
  const queryClient = useQueryClient()
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['subjects', email] })
    void queryClient.invalidateQueries({ queryKey: ['attendance-records', email] })
    void queryClient.invalidateQueries({ queryKey: ['tasks', email] })
  }

  const addSubject = useMutation({
    mutationFn: (input: SubjectInput) => createSubject(email ?? '', input),
    onSuccess: invalidate,
  })

  const editSubject = useMutation({
    mutationFn: (subject: Subject) => updateSubject(email ?? '', subject),
    onSuccess: invalidate,
  })

  const removeSubject = useMutation({
    mutationFn: (id: string) => deleteSubject(email ?? '', id),
    onSuccess: invalidate,
  })

  return { addSubject, editSubject, removeSubject }
}

export function useAttendanceMutations(email: string | undefined) {
  const queryClient = useQueryClient()
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['subjects', email] })
    void queryClient.invalidateQueries({ queryKey: ['attendance-records', email] })
  }

  const logClass = useMutation({
    mutationFn: ({
      subjectId,
      status,
      date,
    }: {
      subjectId: string
      status: AttendanceStatus
      date: string
    }) => logAttendance(email ?? '', subjectId, status, date),
    onSuccess: invalidate,
  })

  return { logClass }
}

/* -------------------------------- tasks ------------------------------ */

export function useTaskMutations(email: string | undefined) {
  const queryClient = useQueryClient()
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['tasks', email] })
  }

  const addTask = useMutation({
    mutationFn: (input: TaskInput) => createTask(email ?? '', input),
    onSuccess: invalidate,
  })

  const editTask = useMutation({
    mutationFn: (task: Task) => updateTask(email ?? '', task),
    onSuccess: invalidate,
  })

  const removeTask = useMutation({
    mutationFn: (id: string) => deleteTask(email ?? '', id),
    onSuccess: invalidate,
  })

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Task['status'] }) =>
      patchTask(email ?? '', id, { status }),
    onSuccess: invalidate,
  })

  const rescheduleMissed = useMutation({
    mutationFn: (dailyStudyMinutes: number) =>
      rescheduleOverdueTasks(email ?? '', dailyStudyMinutes),
    onSuccess: invalidate,
  })

  return { addTask, editTask, removeTask, setStatus, rescheduleMissed }
}

/* ---------------------- productivity goal mutations ------------------ */

export function useProductivityGoalMutations(email: string | undefined) {
  const queryClient = useQueryClient()
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['productivity-goals', email] })
  }

  const addGoal = useMutation({
    mutationFn: (input: ProductivityGoalInput) => createProductivityGoal(email ?? '', input),
    onSuccess: invalidate,
  })

  const bumpProgress = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: number }) =>
      patchProductivityGoal(email ?? '', id, { completed }),
    onSuccess: invalidate,
  })

  const removeGoal = useMutation({
    mutationFn: (id: string) => deleteProductivityGoal(email ?? '', id),
    onSuccess: invalidate,
  })

  return { addGoal, bumpProgress, removeGoal }
}

export type { AcademicActivityInput, ProductivityGoal, ProductivityGoalInput }

/* ------------------- staff activity (own scope only) ------------------ */

export function useActivityMutations(email: string | undefined) {
  const queryClient = useQueryClient()
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['activities'] })
  }

  const addActivity = useMutation({
    mutationFn: (input: AcademicActivityInput) => createActivity(email ?? '', input),
    onSuccess: invalidate,
  })

  const removeActivity = useMutation({
    mutationFn: (id: string) => deleteActivity(email ?? '', id),
    onSuccess: invalidate,
  })

  return { addActivity, removeActivity }
}
