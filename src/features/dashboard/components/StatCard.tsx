import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: string
  hint?: string
  icon?: ReactNode
  accentClassName?: string
}

export function StatCard({ label, value, hint, icon, accentClassName }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {icon && (
          <span
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg',
              accentClassName ?? 'bg-indigo-50 text-indigo-500',
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}
