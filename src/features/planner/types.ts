import type { TaskPriority } from '@/types'

export type GoalCategory =
  | 'exam'
  | 'assignment'
  | 'project'
  | 'skill'
  | 'revision'
  | 'other'

export type MilestoneStatus = 'pending' | 'completed' | 'missed'

export type GoalStatus = 'on_track' | 'needs_attention' | 'at_risk' | 'completed'

export interface Milestone {
  id: string
  goalId: string
  title: string
  /** Estimated effort in minutes */
  estimatedMinutes: number
  /** ISO date this milestone is scheduled for */
  dueDate: string
  status: MilestoneStatus
  completedAt?: string
}

export interface PlannerGoal {
  id: string
  name: string
  category: GoalCategory
  /** ISO date */
  deadline: string
  priority: TaskPriority
  /** Minutes the student can study per day for this goal */
  dailyMinutes: number
  /** ISO date */
  createdAt: string
  milestones: Milestone[]
}

export interface NewGoalInput {
  name: string
  category: GoalCategory
  deadline: string
  priority: TaskPriority
  dailyMinutes: number
}

export interface PlanItem {
  goalId: string
  milestoneId: string
  title: string
  goalName: string
  priority: TaskPriority
  estimatedMinutes: number
  dueDate: string
}

export interface Suggestion {
  id: string
  tone: 'info' | 'success' | 'warning'
  message: string
}
