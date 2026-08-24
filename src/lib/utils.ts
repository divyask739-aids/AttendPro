export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}

/** Days from today until the given ISO date. Negative means overdue. */
export function daysUntil(isoDate: string): number {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const due = new Date(`${isoDate}T00:00:00`)
  return Math.round((due.getTime() - startOfToday.getTime()) / 86_400_000)
}

export function dueDateLabel(isoDate: string): string {
  const diff = daysUntil(isoDate)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff < 0) return `${Math.abs(diff)}d overdue`
  return formatShortDate(isoDate)
}

export function formatShortDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}
