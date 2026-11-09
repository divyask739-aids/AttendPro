/**
 * Tiny typed wrapper around localStorage.
 *
 * Every account gets its own namespace (`attendpro.<email>.<kind>`) so a
 * student can only ever read their own records, while staff analytics can
 * read enrolled students' academic data explicitly.
 */

export const STORAGE_PREFIX = 'attendpro'

export const storageKeys = {
  users: `${STORAGE_PREFIX}.users`,
  session: `${STORAGE_PREFIX}.session`,
  plannerSeed: `${STORAGE_PREFIX}.planner.seeded`,
} as const

export type DataKind =
  | 'profile'
  | 'staffProfile'
  | 'subjects'
  | 'attendance.records'
  | 'tasks'
  | 'productivity.goals'
  | 'planner.goals'
  | 'activities'

export function dataKey(email: string, kind: DataKind): string {
  return `${STORAGE_PREFIX}.${email}.${kind}`
}

export function readStore<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeStore<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage unavailable (private mode / quota) — fail quietly.
  }
}

export function writeStoreOrThrow<T>(key: string, value: T): void {
  if (typeof window === 'undefined') {
    throw new Error('Browser storage is not available.')
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    const detail = error instanceof Error ? ` ${error.message}` : ''
    throw new Error(`Could not save AttendPro data to this browser.${detail}`)
  }
}

export function writeStoresOrThrow(entries: Array<[string, unknown]>): void {
  if (typeof window === 'undefined') {
    throw new Error('Browser storage is not available.')
  }

  const previous = entries.map(([key]) => [key, window.localStorage.getItem(key)] as const)
  try {
    for (const [key, value] of entries) {
      window.localStorage.setItem(key, JSON.stringify(value))
    }
  } catch (error) {
    for (const [key, value] of previous) {
      try {
        if (value === null) window.localStorage.removeItem(key)
        else window.localStorage.setItem(key, value)
      } catch {
        // Best-effort rollback after a quota or storage failure.
      }
    }
    const detail = error instanceof Error ? ` ${error.message}` : ''
    throw new Error(`Could not save AttendPro data to this browser.${detail}`)
  }
}

export function removeStore(key: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

export function isArrayOfObjects<T extends object>(value: unknown): value is T[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as { id?: unknown }).id === 'string',
    )
  )
}
