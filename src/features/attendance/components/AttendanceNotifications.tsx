import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { Card } from '@/components/ui/Card'
import {
  fetchAttendanceNotifications,
  markAttendanceNotificationRead,
} from '@/lib/attendanceSync'
import { isLocalAccount } from '@/lib/dataApi'
import { isAttendanceSyncConfigured } from '@/lib/supabase'

const NOTIFICATIONS_KEY = ['attendance-notifications']

export function AttendanceNotifications({ email }: { email: string }) {
  const queryClient = useQueryClient()
  const isBrowserLocalAccount = isLocalAccount(email)
  const query = useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: () => fetchAttendanceNotifications(),
    enabled: isAttendanceSyncConfigured && !isBrowserLocalAccount,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })

  const markRead = useMutation({
    mutationFn: markAttendanceNotificationRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  })

  const notifications = query.data ?? []
  const unreadCount = notifications.filter((notification) => !notification.readAt).length

  return (
    <Card
      title="Attendance notifications"
      description={
        unreadCount > 0
          ? `${unreadCount} unread among the latest ${notifications.length} updates`
          : 'Recent updates when attendance is recorded for you.'
      }
    >
      {isBrowserLocalAccount ? (
        <p className="text-sm text-slate-500">
          Shared notifications are unavailable for browser-local accounts. Local attendance remains
          available on this device.
        </p>
      ) : !isAttendanceSyncConfigured ? (
        <p className="text-sm text-slate-500">
          Attendance notifications are unavailable until Supabase is configured.
        </p>
      ) : query.isLoading ? (
        <p className="text-sm text-slate-500">Loading notifications...</p>
      ) : query.isError ? (
        <p role="alert" className="text-sm text-rose-700">
          {query.error instanceof Error
            ? query.error.message
            : 'Could not load attendance notifications.'}
        </p>
      ) : notifications.length === 0 ? (
        <p className="text-sm text-slate-500">No attendance notifications yet.</p>
      ) : (
        <ul className="space-y-2">
          {notifications.map((notification) => (
            <li
              key={notification.id}
              className={`rounded-xl border p-3 ${
                notification.readAt
                  ? 'border-slate-100 bg-slate-50'
                  : 'border-indigo-100 bg-indigo-50/60'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{notification.title}</p>
                  <p className="mt-1 text-sm text-slate-600">{notification.body}</p>
                  <time
                    className="mt-1 block text-xs text-slate-400"
                    dateTime={notification.createdAt}
                  >
                    {new Date(notification.createdAt).toLocaleString()}
                  </time>
                </div>
                {!notification.readAt && (
                  <button
                    type="button"
                    disabled={markRead.isPending}
                    onClick={() => markRead.mutate(notification.id)}
                    className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 disabled:opacity-50"
                  >
                    Mark as read
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {markRead.isError && (
        <p role="alert" className="mt-3 text-xs text-rose-700">
          {markRead.error instanceof Error
            ? markRead.error.message
            : 'Could not update the notification.'}
        </p>
      )}
    </Card>
  )
}
