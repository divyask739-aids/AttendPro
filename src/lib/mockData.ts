import type { AttendanceStatus } from '@/types'

function isoFromToday(offsetDays: number): string {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  const [iso] = date.toISOString().split('T')
  return iso ?? ''
}

export const SUBJECTS = [
  { id: 'sub-1', name: 'Data Structures', shortName: 'DS', held: 32, attended: 28 },
  { id: 'sub-2', name: 'Operating Systems', shortName: 'OS', held: 30, attended: 24 },
  { id: 'sub-3', name: 'Discrete Mathematics', shortName: 'DM', held: 28, attended: 23 },
  { id: 'sub-4', name: 'Web Technologies', shortName: 'WT', held: 26, attended: 25 },
  { id: 'sub-5', name: 'Software Engineering', shortName: 'SE', held: 24, attended: 16 },
]

const HISTORY: Array<[subjectId: string, dayOffset: number, status: AttendanceStatus]> = [
  ['sub-1', -1, 'present'], ['sub-1', -2, 'present'], ['sub-1', -3, 'late'],
  ['sub-1', -4, 'present'], ['sub-1', -5, 'absent'],
  ['sub-2', -1, 'present'], ['sub-2', -2, 'absent'], ['sub-2', -3, 'present'],
  ['sub-2', -4, 'present'],
  ['sub-3', -1, 'present'], ['sub-3', -2, 'late'], ['sub-3', -3, 'present'],
  ['sub-3', -5, 'absent'],
  ['sub-4', -1, 'present'], ['sub-4', -2, 'present'], ['sub-4', -3, 'cancelled'],
  ['sub-4', -4, 'present'],
  ['sub-5', -1, 'absent'], ['sub-5', -3, 'present'], ['sub-5', -4, 'late'],
]

export const ATTENDANCE_RECORDS = HISTORY.map(
  ([subjectId, dayOffset, status], index) => ({
    id: `att-${index}`,
    subjectId,
    date: isoFromToday(dayOffset),
    status,
  }),
)

export const TASKS = [
  {
    id: 'task-1',
    title: 'Finish OS assignment 3',
    subject: 'Operating Systems',
    dueDate: isoFromToday(-1),
    priority: 'high' as const,
    status: 'todo' as const,
  },
  {
    id: 'task-2',
    title: 'Prepare DS lab record',
    subject: 'Data Structures',
    dueDate: isoFromToday(0),
    priority: 'medium' as const,
    status: 'in_progress' as const,
  },
  {
    id: 'task-3',
    title: 'DM problem set 5',
    subject: 'Discrete Mathematics',
    dueDate: isoFromToday(0),
    priority: 'high' as const,
    status: 'todo' as const,
  },
  {
    id: 'task-4',
    title: 'Review WT lecture notes',
    subject: 'Web Technologies',
    dueDate: isoFromToday(1),
    priority: 'low' as const,
    status: 'todo' as const,
  },
  {
    id: 'task-5',
    title: 'SE project proposal draft',
    subject: 'Software Engineering',
    dueDate: isoFromToday(3),
    priority: 'medium' as const,
    status: 'todo' as const,
  },
  {
    id: 'task-6',
    title: 'Submit OS reading log',
    subject: 'Operating Systems',
    dueDate: isoFromToday(5),
    priority: 'low' as const,
    status: 'done' as const,
  },
]

export const DAILY_GOALS = [
  { id: 'goal-1', title: 'Revise class notes', target: 3, completed: 2, unit: 'subjects' },
  { id: 'goal-2', title: 'Practice coding problems', target: 5, completed: 5, unit: 'problems' },
  { id: 'goal-3', title: 'Read textbook', target: 40, completed: 18, unit: 'pages' },
  { id: 'goal-4', title: 'Focus sessions without phone', target: 4, completed: 1, unit: 'sessions' },
]

