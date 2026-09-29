import { NavLink } from 'react-router-dom'
import type { ComponentType } from 'react'

import {
  BookOpenIcon,
  CalendarIcon,
  ClipboardIcon,
  SparklesIcon,
  TargetIcon,
  TasksIcon,
  UsersIcon,
  type IconProps,
} from '@/components/icons'
import type { UserRole } from '@/types'

export interface NavItem {
  to: string
  label: string
  icon: ComponentType<IconProps>
  end?: boolean
}

/** Student and staff see entirely separate navigation sets. */
export const ROLE_NAV: Record<UserRole, NavItem[]> = {
  student: [
    { to: '/', label: 'Dashboard', icon: BookOpenIcon, end: true },
    { to: '/attendance', label: 'Attendance', icon: CalendarIcon },
    { to: '/tasks', label: 'Tasks', icon: TasksIcon },
    { to: '/planner', label: 'Planner', icon: SparklesIcon },
    { to: '/goals', label: 'Productivity', icon: TargetIcon },
    { to: '/profile', label: 'Profile', icon: ClipboardIcon },
  ],
  staff: [
    { to: '/staff', label: 'Dashboard', icon: BookOpenIcon, end: true },
    { to: '/staff/subjects', label: 'My Subjects', icon: ClipboardIcon },
    { to: '/staff/students', label: 'Students', icon: UsersIcon },
    { to: '/staff/attendance', label: 'Attendance', icon: CalendarIcon },
    { to: '/staff/activities', label: 'Activities', icon: TasksIcon },
    { to: '/profile', label: 'Profile', icon: TargetIcon },
  ],
}

export function NavLinks({
  role,
  variant,
  onNavigate,
}: {
  role: UserRole
  variant: 'sidebar' | 'bottom'
  onNavigate?: () => void
}) {
  const items = ROLE_NAV[role]

  if (variant === 'sidebar') {
    return (
      <>
        {items.map(({ icon: Icon, ...item }) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-indigo-500/15 text-indigo-300'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white',
              ].join(' ')
            }
          >
            <Icon className="h-5 w-5" />
            {item.label}
          </NavLink>
        ))}
      </>
    )
  }

  return (
    <>
      {items.slice(0, 5).map(({ icon: Icon, ...item }) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            [
              'flex flex-col items-center gap-1 rounded-lg py-2.5 text-[10px] font-medium transition-colors',
              isActive ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700',
            ].join(' ')
          }
        >
          <Icon className="h-5 w-5" />
          {item.label}
        </NavLink>
      ))}
    </>
  )
}
