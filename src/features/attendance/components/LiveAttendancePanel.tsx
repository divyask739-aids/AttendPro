import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/Badge'
import { Card, EmptyState } from '@/components/ui/Card'
import {
  useAttendanceCheckInBroadcast,
  useAttendanceSessionMutations,
  useSessionCheckIns,
  useStaffAttendanceSessions,
} from '@/hooks/useAttendanceSessions'
import { useStaffProfile } from '@/hooks/useStudentData'
import { ATTENDANCE_SETUP_MESSAGE, isAttendanceSyncConfigured } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { AttendanceCheckIn } from '@/types'

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100'

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function countdown(expiresAt: string, now: number): string {
  const remaining = Math.max(0, new Date(expiresAt).getTime() - now)
  const minutes = Math.floor(remaining / 60_000)
  const seconds = Math.floor((remaining % 60_000) / 1000)
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/**
 * Staff side of the live attendance flow: create a code, watch check-ins
 * arrive from other devices, and close the session.
 */
export function LiveAttendancePanel({ email }: { email: string }) {
  const { profile } = useStaffProfile(email)
  const subjects = profile?.subjects ?? []

  const { sessions, isLoading, isError, error } = useStaffAttendanceSessions(email)
  const { createSession, closeSession } = useAttendanceSessionMutations(email)

  const [subjectIndex, setSubjectIndex] = useState(0)
  const [duration, setDuration] = useState(30)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [arrived, setArrived] = useState<AttendanceCheckIn | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const selected = sessions.find((session) => session.id === selectedId) ?? null
  const expired = selected ? new Date(selected.expiresAt).getTime() <= now : false

  useEffect(() => {
    if (sessions.length === 0) {
      setSelectedId(null)
      return
    }
    setSelectedId((current) => {
      if (current && sessions.some((session) => session.id === current)) return current
      const live = sessions.find((session) => session.isOpen)
      return live?.id ?? sessions[0].id
    })
  }, [sessions])

  useEffect(() => {
    if (!selected) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [selected])

  const {
    checkIns,
    isLoading: checkInsLoading,
    isError: checkInsError,
  } = useSessionCheckIns(selected?.id, email)
  useAttendanceCheckInBroadcast(selected?.id)

  // Announce arrivals without waiting for a manual refresh.
  const knownIds = useRef<Set<string> | null>(null)
  useEffect(() => {
    knownIds.current = null
    setArrived(null)
  }, [selectedId])

  useEffect(() => {
    // Wait for the first real fetch of this session before diffing, so
    // opening an old session does not announce its existing check-ins.
    if (checkInsLoading) return
    if (!knownIds.current) {
      knownIds.current = new Set(checkIns.map((checkIn) => checkIn.id))
      return
    }
    const fresh = checkIns.filter((checkIn) => !knownIds.current?.has(checkIn.id))
    if (fresh.length === 0) return
    for (const checkIn of fresh) knownIds.current.add(checkIn.id)
    setArrived(fresh[fresh.length - 1])
    const timer = window.setTimeout(() => setArrived(null), 6000)
    return () => window.clearTimeout(timer)
  }, [checkIns, checkInsLoading])

  const onCreate = async () => {
    const subject = subjects[subjectIndex] ?? subjects[0]
    if (!subject) return
    setActionError(null)
    try {
      const session = await createSession.mutateAsync({
        subjectName: subject.name,
        subjectCode: subject.code,
        durationMinutes: duration,
      })
      setSelectedId(session.id)
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Could not start the session.')
    }
  }

  const onClose = async () => {
    if (!selected) return
    setActionError(null)
    try {
      await closeSession.mutateAsync(selected.id)
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Could not close the session.')
    }
  }

  if (!isAttendanceSyncConfigured) {
    return (
      <Card
        title="Live attendance code"
        description="Students check in from their own phones"
      >
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
          <p className="font-semibold">Shared backend not configured</p>
          <p className="mt-1 leading-relaxed">{ATTENDANCE_SETUP_MESSAGE}</p>
          <p className="mt-1 leading-relaxed">
            See <code className="font-semibold">docs/attendance-sync-setup.md</code> for the
            one-time database and environment setup.
          </p>
        </div>
      </Card>
    )
  }

  return (
    <Card
      title="Live attendance code"
      description="Students check in from their own phones; this list updates automatically"
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[12rem] flex-1">
          <label htmlFor="live-subject" className="mb-1 block text-xs font-medium text-slate-600">
            Subject
          </label>
          {subjects.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
              Add a subject in your{' '}
              <Link to="/profile" className="font-semibold text-indigo-600 hover:underline">
                profile
              </Link>{' '}
              first.
            </p>
          ) : (
            <select
              id="live-subject"
              value={subjectIndex}
              onChange={(event) => setSubjectIndex(Number(event.target.value))}
              className={inputClass}
            >
              {subjects.map((subject, index) => (
                <option key={`${subject.name}-${index}`} value={index}>
                  {subject.name}
                  {subject.code ? ` (${subject.code})` : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label htmlFor="live-duration" className="mb-1 block text-xs font-medium text-slate-600">
            Code valid for
          </label>
          <select
            id="live-duration"
            value={duration}
            onChange={(event) => setDuration(Number(event.target.value))}
            className={inputClass}
          >
            <option value={15}>15 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={45}>45 minutes</option>
            <option value={60}>60 minutes</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => void onCreate()}
          disabled={createSession.isPending || subjects.length === 0}
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-60"
        >
          {createSession.isPending ? 'Starting...' : 'Start session'}
        </button>
      </div>

      {actionError && (
        <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600">
          {actionError}
        </p>
      )}

      {isError && (
        <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600">
          {error instanceof Error ? error.message : 'Could not load attendance sessions.'}
        </p>
      )}

      {sessions.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {sessions.map((session) => {
            const isSelected = session.id === selectedId
            return (
              <button
                key={session.id}
                type="button"
                onClick={() => setSelectedId(session.id)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-semibold',
                  isSelected
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                )}
              >
                {session.subjectName} · {session.code}
                {!session.isOpen && (
                  <span className="ml-1 opacity-70">
                    {new Date(session.expiresAt).getTime() <= Date.now() ? '(expired)' : '(closed)'}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {isLoading ? (
        <p className="mt-4 text-sm text-slate-500">Loading sessions...</p>
      ) : selected ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {selected.subjectName}
                {selected.subjectCode ? ` · ${selected.subjectCode}` : ''}
              </p>
              <p className="mt-1 select-all font-mono text-3xl font-black tracking-[0.3em] text-slate-900">
                {selected.code}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                {selected.isOpen && !expired ? (
                  <Badge tone="success">
                    <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                    Live · {countdown(selected.expiresAt, now)} left
                  </Badge>
                ) : (
                  <Badge tone={expired ? 'warning' : 'neutral'}>
                    {expired ? 'Expired' : 'Closed'}
                  </Badge>
                )}
                <span>
                  {checkIns.length} present
                  {selected.checkInCount !== checkIns.length
                    ? ` · ${selected.checkInCount} saved`
                    : ''}
                </span>
                <span>Auto-updating</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(selected.code)
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Copy code
              </button>
              <button
                type="button"
                onClick={() => void onClose()}
                disabled={!selected.isOpen || expired || closeSession.isPending}
                className="rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
              >
                {closeSession.isPending ? 'Closing...' : 'Close session'}
              </button>
            </div>
          </div>

          {arrived && (
            <div
              role="status"
              className="animate-fade-in mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700"
            >
              <span className="font-semibold">{arrived.studentName}</span> just checked in
              {arrived.rollNumber ? ` (${arrived.rollNumber})` : ''} at{' '}
              {timeLabel(arrived.checkedInAt)}.
            </div>
          )}

          <div className="mt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Checked-in students
              </h3>
              <span className="text-xs text-slate-500">{checkIns.length} present</span>
            </div>

            {checkInsError ? (
              <p role="alert" className="mt-2 text-xs text-rose-600">
                Could not load check-ins. The list will retry automatically.
              </p>
            ) : checkIns.length === 0 ? (
              <div className="mt-2 rounded-xl border border-dashed border-slate-300 bg-white p-4 text-center text-xs text-slate-500">
                Waiting for students to enter code{' '}
                <span className="font-mono font-bold text-slate-700">{selected.code}</span>...
              </div>
            ) : (
              <ul className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
                {checkIns.map((checkIn) => (
                  <li
                    key={checkIn.id}
                    className="animate-fade-in flex items-center justify-between gap-3 px-3 py-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-600">
                        {checkIn.studentName.slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">
                          {checkIn.studentName}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {checkIn.rollNumber || 'No roll number'}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-medium text-slate-600">
                        {timeLabel(checkIn.checkedInAt)}
                      </p>
                      <p className="text-[11px] text-emerald-600">Present</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <EmptyState
            title="No attendance code yet."
            description="Pick a subject above and start a session, then share the generated code with your students."
          />
        </div>
      )}
    </Card>
  )
}
