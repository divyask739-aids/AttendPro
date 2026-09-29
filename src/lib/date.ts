export function makeId(prefix: string): string {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${prefix}-${uuid}`
}

export function toISO(date: Date): string {
  const [iso] = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .split('T')
  return iso ?? ''
}

export function isoToday(): string {
  return toISO(new Date())
}

export function addDaysISO(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00`)
  date.setDate(date.getDate() + days)
  return toISO(date)
}

export function daysUntilFrom(fromISO: string, targetISO: string): number {
  const from = new Date(`${fromISO}T00:00:00`)
  const target = new Date(`${targetISO}T00:00:00`)
  return Math.round((target.getTime() - from.getTime()) / 86_400_000)
}
