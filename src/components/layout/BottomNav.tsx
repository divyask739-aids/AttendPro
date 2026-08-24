import { NavLink } from 'react-router-dom'

import { cn } from '@/lib/utils'

import { NAV_ITEMS } from './nav'

export function BottomNav() {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden"
    >
      <div className="mx-auto grid max-w-md grid-cols-4 px-2 pb-[env(safe-area-inset-bottom)]">
        {NAV_ITEMS.map(({ icon: Icon, ...item }) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-1 rounded-lg py-2.5 text-[11px] font-medium transition-colors',
                isActive ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700',
              )
            }
          >
            <Icon className="h-5 w-5" />
            {item.label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
