import { NavLink } from 'react-router-dom'

import { BookOpenIcon } from '@/components/icons'
import { cn } from '@/lib/utils'

import { NAV_ITEMS } from './nav'

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-slate-800 bg-slate-900 px-4 py-6 lg:flex">
      <div className="flex items-center gap-2.5 px-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500 text-white">
          <BookOpenIcon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-bold tracking-tight text-white">AttendPro</p>
          <p className="text-xs text-slate-400">Student companion</p>
        </div>
      </div>

      <nav aria-label="Primary" className="mt-8 flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map(({ icon: Icon, ...item }) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-indigo-500/15 text-indigo-300'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white',
              )
            }
          >
            <Icon className="h-5 w-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <p className="px-3 text-xs text-slate-500">v0.1.0 · mock data</p>
    </aside>
  )
}
