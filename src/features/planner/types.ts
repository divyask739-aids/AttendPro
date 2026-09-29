/**
 * AI Goal Planner domain types.
 *
 * `Suggestion` is intentionally the shared `Recommendation` shape so the
 * rule-based planner and any future AI call return identical structures.
 */

import type { Recommendation, TaskPriority } from '@/types'

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
  estimatedMinutes: number
  dueDate: string
  status: MilestoneStatus
  completedAt?: string
}

export interface PlannerGoal {
  id: string
  name: string
  category: GoalCategory
  deadline: string
  priority: TaskPriority
  dailyMinutes: number
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

export interface TodayPlanEntry {
  /** task id or milestone id, prefixed to stay unique */
  id: string
  source: 'task' | 'milestone'
  title: string
  context: string
  priority: TaskPriority
  estimatedMinutes: number
  dueDate: string
  risk?: 'high' | 'medium' | 'safe'
  goalId?: string
  subjectId?: string | null
}

export interface TodayPlan {
  entries: TodayPlanEntry[]
  plannedMinutes: number
  budgetMinutes: number
  rescheduledCount: number
}

export type Suggestion = Recommendation
