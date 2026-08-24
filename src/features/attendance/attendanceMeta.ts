import type { ProgressBarTone } from '@/components/ui/ProgressBar'

export function attendanceTone(percent: number): ProgressBarTone {
  if (percent < 75) return 'rose'
  if (percent < 85) return 'amber'
  return 'emerald'
}

export function attendanceTextColor(percent: number): string {
  if (percent < 75) return 'text-rose-600'
  if (percent < 85) return 'text-amber-600'
  return 'text-emerald-600'
}
