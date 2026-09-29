import { useMemo } from 'react'

import { computeProgress, computeGoalStatus } from '@/features/planner/plannerEngine'
import { usePlannerGoals } from '@/hooks/usePlanner'
import { useTasks } from '@/hooks/useTasks'
import { useAttendance } from '@/hooks/useAttendance'
import { isoToday } from '@/lib/date'

/**
 * Today's Plan = tasks + goal milestones, ordered by urgency, capped at the
 * student's daily study time, with attendance risk boosting at-risk subjects.
 */
export function useTodayPlan(email: string | undefined, dailyStudyMinutes: number) {
  const { goals } = usePlannerGoals(email)
  const { tasks } = useTasks(email)
  const { summary } = useAttendance(email)

  return useMemo(() => {
    const today = isoToday()
    const openTasks = tasks.filter((t) => t.status !== 'done')
    const dueToday = openTasks.filter((t) => t.dueDate === today)
    const completedToday = tasks.filter(
      (t) => t.status === 'done' && t.dueDate === today,
    )

    // Cap: never exceed the student's declared daily study time.
    const budget = Math.max(30, dailyStudyMinutes)
    const scored = [
      ...dueToday.map((t) => ({ task: t, score: 100 })),
      ...openTasks
        .filter((t) => t.dueDate > today)
        .map((t) => ({ task: t, score: 50 })),
    ]
      .sort((a, b) => b.score - a.score)
      .map(({ task }) => task)

    const entries: Array<{ task: (typeof scored)[number] }> = []
    let minutes = 0
    for (const task of scored) {
      if (minutes + task.estimatedMinutes > budget) continue
      entries.push({ task })
      minutes += task.estimatedMinutes
    }

    const planItems = entries.map(({ task }) => ({
      id: task.id,
      title: task.title,
      context: task.subjectId
        ? (summary?.bySubjectId.get(task.subjectId)?.name ?? 'Subject')
        : 'General',
      estimatedMinutes: task.estimatedMinutes,
      priority: task.priority,
      dueDate: task.dueDate,
      risk: task.subjectId ? summary?.bySubjectId.get(task.subjectId)?.risk : undefined,
      source: 'task' as const,
    }))

    const goalItems = goals
      .filter((goal) => computeGoalStatus(goal, today) !== 'completed')
      .flatMap((goal) =>
        goal.milestones
          .filter((m) => m.status === 'pending')
          .map((m) => ({
            id: m.id,
            title: m.title,
            context: goal.name,
            estimatedMinutes: m.estimatedMinutes,
            priority: goal.priority,
            dueDate: m.dueDate,
            source: 'milestone' as const,
            goalId: goal.id,
            risk: undefined,
          })),
      )
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))

    const milestones: typeof goalItems = []
    for (const item of goalItems) {
      if (minutes + item.estimatedMinutes > budget) continue
      milestones.push(item)
      minutes += item.estimatedMinutes
    }

    return {
      tasks: planItems,
      milestones,
      totalEntries: planItems.length + milestones.length,
      plannedMinutes: minutes,
      budgetMinutes: budget,
      dueTodayCount: dueToday.length,
      completedTodayCount: completedToday.length,
    }
  }, [tasks, goals, summary, dailyStudyMinutes])
}

export { computeProgress }
