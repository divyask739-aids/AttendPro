import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface CardProps {
  title?: string
  description?: string
  action?: ReactNode
  className?: string
  children: ReactNode
}

export function Card({ title, description, action, className, children }: CardProps) {
  const hasHeader = Boolean(title || action)

  return (
    <section className={cn('rounded-2xl border border-slate-200 bg-white shadow-sm', className)}>
      {hasHeader && (
        <div className="flex items-center justify-between gap-2 px-5 pt-5">
          <div>
            {title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={cn('p-5', hasHeader && 'pt-4')}>{children}</div>
    </section>
  )
}
