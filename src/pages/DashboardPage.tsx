import { CalendarIcon, ClockIcon, TargetIcon } from '@/components/icons'
import { GoalProgressCard } from '@/features/dashboard/components/GoalProgressCard'
import { StatCard } from '@/features/dashboard/components/StatCard'
import { SubjectAttendanceCard } from '@/features/dashboard/components/SubjectAttendanceCard'
import { UpcomingTasksCard } from '@/features/dashboard/components/UpcomingTasksCard'
import { useAttendance } from '@/hooks/useAttendance'
import { useGoals } from '@/hooks/useGoals'
import { useTasks } from '@/hooks/useTasks'
import { daysUntil } from '@/lib/utils'

export function DashboardPage() {
  const { stats, isLoading: attendanceLoading, isError: attendanceError } = useAttendance()
  const { tasks, isLoading: tasksLoading, isError: tasksError } = useTasks()
  const { goals, isLoading: goalsLoading, isError: goalsError } = useGoals()

  const isLoading = attendanceLoading || tasksLoading || goalsLoading
  const isError = attendanceError || tasksError || goalsError

  if (isError) {
    return (
      <p className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-600">
        Something went wrong while loading your data. Please refresh the page.
      </p>
    )
  }

  if (isLoading || !stats) {
    return <p className="text-sm text-slate-500">Loading your dashboard...</p>
  }

  const openTasks = (tasks ?? []).filter((task) => task.status !== 'done')
  const dueTodayCount = openTasks.filter((task) => daysUntil(task.dueDate) <= 0).length
  const goalList = goals ?? []
  const goalsDone = goalList.filter((goal) => goal.completed >= goal.target).length

  return (
    <div>
      <header>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 lg:text-2xl">
          Welcome back
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Here is how things are going today.
        </p>
      </header>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Attendance"
          value={`${stats.overallPercent}%`}
          hint={`${stats.totalAttended} of ${stats.totalHeld} classes attended`}
          icon={<CalendarIcon className="h-4 w-4" />}
          accentClassName="bg-indigo-50 text-indigo-500"
        />
        <StatCard
          label="Due today"
          value={String(dueTodayCount)}
          hint="open tasks due by today"
          icon={<ClockIcon className="h-4 w-4" />}
          accentClassName="bg-amber-50 text-amber-500"
        />
        <StatCard
          label="Goals done"
          value={`${goalsDone}/${goalList.length}`}
          hint="daily goals completed"
          icon={<TargetIcon className="h-4 w-4" />}
          accentClassName="bg-emerald-50 text-emerald-500"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <UpcomingTasksCard tasks={tasks ?? []} />
        <GoalProgressCard goals={goalList} />
      </div>

      <SubjectAttendanceCard subjects={stats.subjects} className="mt-4" />
    </div>
  )
}
