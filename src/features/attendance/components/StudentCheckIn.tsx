import { useState } from 'react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { useCheckInMutation } from '@/hooks/useAttendanceSessions'
import { useSession, useStudentProfile } from '@/hooks/useStudentData'
import { ATTENDANCE_SETUP_MESSAGE, isAttendanceSyncConfigured } from '@/lib/supabase'
import type { AttendanceCheckIn, AttendanceSession } from '@/types'

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100'

interface CheckInResult {
  session: AttendanceSession
  checkIn: AttendanceCheckIn
}

/**
 * Student side of the live attendance flow. The record is written to the
 * shared database, so the staff dashboard on another phone sees it.
 */
export function StudentCheckIn({ email }: { email: string }) {
  const { profile } = useStudentProfile(email)
  const { session: authSession } = useSession()
  const checkIn = useCheckInMutation()

  const [code, setCode] = useState('')
  const [rollOverride, setRollOverride] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CheckInResult | null>(null)

  const name = profile?.fullName?.trim() || authSession?.fullName?.trim() || ''
  const rollNumber = rollOverride ?? profile?.studentId ?? ''

  if (!isAttendanceSyncConfigured) {
    return (
      <Card
        title="Check in to class"
        description="Enter the attendance code from your faculty"
      >
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
          <p className="font-semibold">Shared backend not configured</p>
          <p className="mt-1 leading-relaxed">{ATTENDANCE_SETUP_MESSAGE}</p>
        </div>
      </Card>
    )
  }

  if (result) {
    return (
      <Card title="Check in to class" description="Your attendance is saved for your faculty">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-emerald-800">
                Attendance marked · you joined this class
              </p>
              <p className="mt-0.5 text-xs text-emerald-700">
                {result.session.subjectName}
                {result.session.subjectCode ? ` (${result.session.subjectCode})` : ''} · code{' '}
                <span className="font-mono font-bold">{result.session.code}</span>
              </p>
            </div>
            <Badge tone="success">Present</Badge>
          </div>

          <dl className="mt-3 grid gap-2 text-xs text-emerald-800 sm:grid-cols-3">
            <div>
              <dt className="font-medium text-emerald-600">Student</dt>
              <dd className="mt-0.5 font-semibold">{result.checkIn.studentName}</dd>
            </div>
            <div>
              <dt className="font-medium text-emerald-600">Roll number</dt>
              <dd className="mt-0.5 font-semibold">{result.checkIn.rollNumber || '-'}</dd>
            </div>
            <div>
              <dt className="font-medium text-emerald-600">Checked in at</dt>
              <dd className="mt-0.5 font-semibold">
                {new Date(result.checkIn.checkedInAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </dd>
            </div>
          </dl>

          <p className="mt-3 text-xs text-emerald-700">
            This class now appears on your Attendance page, and your faculty's live list updates
            automatically. You can close this page.
          </p>

          <button
            type="button"
            onClick={() => {
              setResult(null)
              setCode('')
              setError(null)
            }}
            className="mt-3 rounded-xl border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
          >
            Check in to another session
          </button>
        </div>
      </Card>
    )
  }

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    const trimmedCode = code.trim().toUpperCase()
    if (trimmedCode.length < 4) {
      setError('Enter the attendance code shown by your faculty.')
      return
    }
    if (!name) {
      setError('Add your full name to your profile before checking in.')
      return
    }
    if (!rollNumber.trim()) {
      setError('Enter your roll number before checking in.')
      return
    }

    try {
      const value = await checkIn.mutateAsync({
        code: trimmedCode,
        studentEmail: email,
        studentName: name,
        rollNumber,
      })
      setResult(value)
      checkIn.reset()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not mark your attendance.')
    }
  }

  return (
    <Card
      title="Check in to class"
      description="Enter the code your faculty is showing. Works from any phone."
    >
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="checkin-code" className="mb-1 block text-xs font-medium text-slate-600">
            Attendance code
          </label>
          <input
            id="checkin-code"
            value={code}
            onChange={(event) =>
              setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))
            }
            placeholder="ABC123"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className={`${inputClass} font-mono text-lg font-bold tracking-[0.25em] uppercase`}
          />
        </div>

        <div>
          <label htmlFor="checkin-roll" className="mb-1 block text-xs font-medium text-slate-600">
            Roll number
          </label>
          <input
            id="checkin-roll"
            value={rollNumber}
            onChange={(event) => setRollOverride(event.target.value)}
            placeholder="ST101"
            className={inputClass}
          />
        </div>

        <div className="flex items-end">
          <button
            type="submit"
            disabled={checkIn.isPending}
            className="w-full rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-60"
          >
            {checkIn.isPending ? 'Checking in...' : 'Mark attendance'}
          </button>
        </div>
      </form>

      <p className="mt-2 text-xs text-slate-500">
        Checking in as <span className="font-medium text-slate-700">{name || 'unnamed student'}</span>
        {!profile?.studentId && (
          <>
            {' · '}
            <Link to="/profile" className="font-semibold text-indigo-600 hover:underline">
              save your roll number in your profile
            </Link>
          </>
        )}
      </p>

      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600">
          {error}
        </p>
      )}
    </Card>
  )
}
