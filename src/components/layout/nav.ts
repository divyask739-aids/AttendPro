import type { ComponentType } from 'react'

import {
  CalendarIcon,
  DashboardIcon,
  SparklesIcon,
  TargetIcon,
  TasksIcon,
  type IconProps,
} from '@/components/icons'

export interface NavItem {
  to: string
  label: string
  icon: ComponentType<IconProps>
  end?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: DashboardIcon, end: true },
  { to: '/attendance', label: 'Attendance', icon: CalendarIcon },
  { to: '/tasks', label: 'Tasks', icon: TasksIcon },
  { to: '/goals', label: 'Goals', icon: TargetIcon },
  { to: '/planner', label: 'Planner', icon: SparklesIcon },
]
