import { useEffect, useRef, useState } from 'react'

import { BellIcon } from '@/components/icons'
import { dueDateLabel } from '@/lib/utils'
import type { NotificationPermissionState, TaskReminderItem } from '@/hooks/useTaskReminders'

import { reminderLabel } from '../taskMeta'

interface ReminderBellProps {
  dueReminders: TaskReminderItem[]
  dueCount: number
  permission: NotificationPermissionState
  isSupported: boolean
  onRequestPermission: () => Promise<NotificationPermissionState>
  onDismiss: (key: string) => void
  onDismissAll: () => void
}

type Notice =
  | { kind: 'success'; text: string }
  | { kind: 'error'; text: string }
  | null

/**
 * Small notification bell showing how many task reminders are due.
 * Browser notifications are optional — the same reminders always show here.
 *
 * The reminder state itself is owned by `useTaskReminders` in the parent page,
 * so the same instance is reused when a task is edited.
 */
export function ReminderBell({
  dueReminders,
  dueCount,
  permission,
  isSupported,
  onRequestPermission,
  onDismiss,
  onDismissAll,
}: ReminderBellProps) {
  const [open, setOpen] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Close the panel when clicking outside of it.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  const onEnable = async () => {
    const result = await onRequestPermission()
    if (result === 'granted') {
      setNotice({ kind: 'success', text: 'Browser notifications enabled.' })
    } else if (result === 'denied') {
      setNotice({
        kind: 'error',
        text: 'Notifications are blocked in your browser. Reminders will still appear here.',
      })
    } else if (result === 'unsupported') {
      setNotice({
        kind: 'error',
        text: 'This browser does not support notifications. Reminders will still appear here.',
      })
    } else {
      setNotice({
        kind: 'error',
        text: 'Permission was not granted. Reminders will still appear here.',
      })
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={
          dueCount > 0 ? `Task reminders, ${dueCount} due` : 'Task reminders, none due'
        }
        className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50"
      >
        <BellIcon className="h-4.5 w-4.5" />
        {dueCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {dueCount > 9 ? '9+' : dueCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-3 shadow-lg">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900">Task reminders</p>
            {dueReminders.length > 0 && (
              <button
                type="button"
                onClick={onDismissAll}
                className="text-[11px] font-semibold text-indigo-600 hover:underline"
              >
                Clear all
              </button>
            )}
          </div>

          {dueReminders.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">
              No reminders due. Set a reminder on any task to get notified before its deadline.
            </p>
          ) : (
            <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
              {dueReminders.map((item) => (
                <li key={item.key} className="rounded-xl bg-amber-50 px-3 py-2 text-amber-800">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-medium">{item.title}</p>
                    <button
                      type="button"
                      onClick={() => onDismiss(item.key)}
                      aria-label={`Dismiss reminder for ${item.title}`}
                      className="shrink-0 text-[11px] font-semibold text-amber-700 hover:underline"
                    >
                      Dismiss
                    </button>
                  </div>
                  <p className="mt-0.5 text-[11px]">
                    {reminderLabel(item.reminder)} · due {dueDateLabel(item.dueDate)}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={onEnable}
              disabled={permission === 'granted'}
              className="w-full rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-700 disabled:cursor-default disabled:opacity-60"
            >
              {permission === 'granted'
                ? 'Notifications enabled'
                : permission === 'denied'
                  ? 'Notifications blocked'
                  : isSupported
                    ? 'Enable notifications'
                    : 'Notifications unavailable'}
            </button>

            {notice && (
              <p
                role="status"
                className={
                  notice.kind === 'success'
                    ? 'mt-2 text-[11px] font-medium text-emerald-600'
                    : 'mt-2 text-[11px] font-medium text-rose-600'
                }
              >
                {notice.text}
              </p>
            )}
            {permission === 'default' && !notice && (
              <p className="mt-2 text-[11px] text-slate-400">
                Reminders always appear here. Enable notifications to also get them outside
                AttendPro.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}