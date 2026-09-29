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
  rescheduleOverdueTasks,
  saveStaffProfile,
  saveStudentProfile,
  updateSubject,
  updateTask,
  type AcademicActivityInput,
  type Credentials,
  type ProductivityGoalInput,
  type SubjectInput,
  type TaskInput,
} from '@/lib/dataApi'
import { logAttendance } from '@/lib/dataApi'
import type {
  AttendanceStatus,
  ProductivityGoal,
  StaffProfile,
  StudentProfile,
  Subject,
  Task,
  UserRole,
} from '@/types'

/* ------------------------------ session ------------------------------ */

export function useSession() {
  const query = useQuery({ queryKey: ['session'], queryFn: getSession, staleTime: 30_000 })
  return { session: query.data ?? null, isLoading: query.isLoading }
}

export function useAuthMutations() {
  const queryClient = useQueryClient()
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['session'] })
  }

  const register = useMutation({
    mutationFn: (credentials: Credentials) => registerAccount(credentials),
    onSuccess: refresh,
  })

  const login = useMutation({
    mutationFn: (input: { email: string; role: UserRole }) =>
      loginAccount(input.email, input.role),
    onSuccess: refresh,
  })

  const logout = useMutation({
    mutationFn: () => logoutAccount(),
    onSuccess: refresh,
  })

  return { register, login, logout }
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
