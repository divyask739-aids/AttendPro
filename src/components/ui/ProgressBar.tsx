import { cn } from '@/lib/utils'

const BAR_TONES = {
  indigo: 'bg-indigo-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
} as const

export type ProgressBarTone = keyof typeof BAR_TONES

interface ProgressBarProps {
  value: number
  max?: number
  tone?: ProgressBarTone
  label?: string
  className?: string
}

export function ProgressBar({
  value,
  max = 100,
  tone = 'indigo',
  label,
  className,
}: ProgressBarProps) {
  const percent = max > 0 ? Math.round((value / max) * 100) : 0

  return (
    <div
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-slate-100', className)}
    >
      <div
        className={cn('h-full rounded-full transition-all duration-300', BAR_TONES[tone])}
        style={{ width: `${Math.min(percent, 100)}%` }}
      />
    </div>
  )
}
