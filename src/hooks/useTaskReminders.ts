import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { readStore, removeStore, writeStore } from '@/lib/storage'
import type { Task, TaskReminder } from '@/types'

import { reminderFireAt, reminderLabel, reminderOf } from '@/features/tasks/taskMeta'

/** How often the due list is re-checked. */
const CHECK_INTERVAL_MS = 30_000

export interface TaskReminderItem {
  /** stable per task + reminder pair, used to avoid duplicate notifications */
  key: string
  taskId: string
  title: string
  reminder: TaskReminder
  dueDate: string
  /** epoch ms of the task deadline */
  dueAt: number
  /** epoch ms when the reminder should fire */
  fireAt: number
  message: string
}

export type NotificationPermissionState = 'unsupported' | 'default' | 'granted' | 'denied'

export interface UseTaskRemindersOptions {
  /** scopes the "already notified" list so accounts never share state */
  scope?: string
  /** subject name lookup, used to make messages more useful */
  subjectNameById?: Map<string, string>
}

function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

function currentPermission(): NotificationPermissionState {
  if (!notificationsSupported()) return 'unsupported'
  return Notification.permission as NotificationPermissionState
}

function notifiedKey(scope: string): string {
  return `attendpro.reminders.${scope || 'default'}`
}

/**
 * Task reminders.
 *
 * - Only unfinished tasks with a reminder other than `'none'` are considered.
 * - A reminder fires once its `fireAt` moment has passed; because tasks store a
 *   date (not a time), the deadline is treated as 09:00 local on the due date.
 * - Each task/reminder pair notifies only once — the notified keys are kept in
 *   localStorage so a page refresh does not re-notify.
 * - Browser notifications are used only when permission was already granted;
 *   asking for permission happens exclusively through `requestPermission()`.
 * - `dueReminders` is exposed so the UI can show reminders even when browser
 *   notifications are unavailable or blocked.
 */
export function useTaskReminders(
  tasks: Task[],
  options: UseTaskRemindersOptions = {},
) {
  const { scope = '', subjectNameById } = options

  const [permission, setPermission] = useState<NotificationPermissionState>(() =>
    currentPermission(),
  )
  const [now, setNow] = useState(() => Date.now())
  const [inApp, setInApp] = useState<TaskReminderItem[]>([])
  const [dismissed, setDismissed] = useState<string[]>([])
  const notifiedRef = useRef<string[]>(
    readStore<string[]>(notifiedKey(scope), []) as string[],
  )

  // Re-read the notified list when the account scope changes.
  useEffect(() => {
    notifiedRef.current = readStore<string[]>(notifiedKey(scope), []) as string[]
    setInApp([])
    setDismissed([])
  }, [scope])

  // Tick the clock so reminders appear without a manual refresh.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CHECK_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [])

  /** Every reminder worth tracking, whether due yet or not. */
  const candidates = useMemo<TaskReminderItem[]>(() => {
    return tasks
      .filter((task) => task.status !== 'done')
      .map((task) => {
        const reminder = reminderOf(task)
        const fireAt = reminderFireAt(task.dueDate, reminder)
        const due = new Date(`${task.dueDate}T00:00:00`)
        due.setHours(9, 0, 0, 0)
        return {
          key: `${task.id}:${reminder}`,
          taskId: task.id,
          title: task.title,
          reminder,
          dueDate: task.dueDate,
          dueAt: due.getTime(),
          fireAt,
          message: `${task.title} is due ${reminderLabel(reminder).toLowerCase()}${
            subjectNameById?.has(task.subjectId ?? '')
              ? ` · ${subjectNameById.get(task.subjectId ?? '')}`
              : ''
          }`,
        }
      })
      .filter((item) => item.reminder !== 'none')
      .sort((a, b) => a.fireAt - b.fireAt)
  }, [tasks, subjectNameById])

  const dueReminders = useMemo(
    () => candidates.filter((item) => item.fireAt <= now && !dismissed.includes(item.key)),
    [candidates, now, dismissed],
  )

  // Fire reminders exactly once per task/reminder pair.
  const firedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (dueReminders.length === 0) return

    const fresh = dueReminders.filter(
      (item) =>
        !firedRef.current.has(item.key) && !notifiedRef.current.includes(item.key),
    )
    if (fresh.length === 0) return

    for (const item of fresh) {
      firedRef.current.add(item.key)

      if (currentPermission() === 'granted' && notificationsSupported()) {
        try {
          new Notification('AttendPro · Task reminder', {
            body: item.message,
            tag: item.key,
          })
        } catch {
          // Some browsers block notifications outside a secure context —
          // the in-app reminder below still works.
        }
      }
    }

    notifiedRef.current = [...notifiedRef.current, ...fresh.map((item) => item.key)]
    writeStore(notifiedKey(scope), notifiedRef.current)
    setInApp((current) => {
      const known = new Set(current.map((item) => item.key))
      return [...current, ...fresh.filter((item) => !known.has(item.key))]
    })
  }, [dueReminders, scope])

  /** Only ever called from an explicit user action. */
  const requestPermission = useCallback(async (): Promise<NotificationPermissionState> => {
    if (!notificationsSupported()) {
      setPermission('unsupported')
      return 'unsupported'
    }
    let result: NotificationPermissionState
    try {
      result = (await Notification.requestPermission()) as NotificationPermissionState
    } catch {
      result = currentPermission()
    }
    setPermission(result)
    return result
  }, [])

  const dismiss = useCallback((key: string) => {
    setInApp((current) => current.filter((item) => item.key !== key))
    setDismissed((current) => [...current, key])
  }, [])

  const dismissAll = useCallback(() => {
    setDismissed((current) => [
      ...current,
      ...inApp.map((item) => item.key),
    ])
    setInApp([])
  }, [inApp])

  /** Lets the student get a reminder again after editing the task. */
  const resetForTask = useCallback(
    (taskId: string) => {
      notifiedRef.current = notifiedRef.current.filter(
        (key) => !key.startsWith(`${taskId}:`),
      )
      writeStore(notifiedKey(scope), notifiedRef.current)
      firedRef.current = new Set(
        [...firedRef.current].filter((key) => !key.startsWith(`${taskId}:`)),
      )
      setInApp((current) => current.filter((item) => item.taskId !== taskId))
      setDismissed((current) => current.filter((key) => !key.startsWith(`${taskId}:`)))
    },
    [scope],
  )

  const clearHistory = useCallback(() => {
    removeStore(notifiedKey(scope))
    notifiedRef.current = []
    firedRef.current = new Set()
    setInApp([])
    setDismissed([])
  }, [scope])

  return {
    /** reminders that are due right now and not dismissed */
    dueReminders,
    /** in-app reminders raised during this session (works without browser notifications) */
    reminders: inApp,
    dueCount: dueReminders.length,
    permission,
    isSupported: notificationsSupported(),
    requestPermission,
    dismiss,
    dismissAll,
    resetForTask,
    clearHistory,
  }
}