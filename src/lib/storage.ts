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
