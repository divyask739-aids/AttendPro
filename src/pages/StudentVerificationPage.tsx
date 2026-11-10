import { useEffect, useState, type FormEvent } from 'react'

import { Card } from '@/components/ui/Card'
import { StudentVerificationCamera } from '@/features/attendance/components/StudentVerificationCamera'
import { useStudentProfile, useStudentVerificationMutation } from '@/hooks/useStudentData'
import type { StudentProfile, StudentVerificationStatus } from '@/types'

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100'

const statusLabels: Record<StudentVerificationStatus, string> = {
  not_submitted: 'Not submitted',
  pending: 'Pending verification',
  verified: 'Verified',
  rejected: 'Rejected',
}

function verificationStatus(profile: StudentProfile): StudentVerificationStatus {
  return profile.verificationStatus ?? 'not_submitted'
}

export function StudentVerificationPage({ email }: { email: string }) {
  const { profile, isLoading, isError, error } = useStudentProfile(email)
  const { submitVerification } = useStudentVerificationMutation(email)
  const [details, setDetails] = useState({
    rollNumber: '',
    department: '',
    year: '',
    section: '',
  })
  useEffect(() => {
    if (!profile) return
    setDetails({
      rollNumber: profile.rollNumber ?? '',
      department: profile.department ?? '',
      year: profile.year,
      section: profile.section ?? '',
    })
  }, [profile])

  const isVerified = profile?.verificationStatus === 'verified'
  const isPending = profile?.verificationStatus === 'pending'
  const isLocked = isVerified || isPending

  if (isLoading || !profile) {
    if (isError) {
      return (
        <p role="alert" className="text-sm text-rose-700">
          {error instanceof Error ? error.message : 'Could not load your verification details.'}
        </p>
      )
    }
    return <p className="text-sm text-slate-500">Loading verification details...</p>
  }

  const status = verificationStatus(profile)

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    submitVerification.mutate(details)
  }

  return (
    <div>
      <header>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 lg:text-2xl">
          Student Verification
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Submit your academic details for staff review. Camera face detection is only a presence aid and never identifies you.
        </p>
      </header>

      <Card className="mt-5" title="Verification details">
        <div
          className={`mb-4 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
            status === 'verified'
              ? 'bg-emerald-100 text-emerald-800'
              : status === 'pending'
                ? 'bg-amber-100 text-amber-800'
                : status === 'rejected'
                  ? 'bg-rose-100 text-rose-800'
                  : 'bg-slate-100 text-slate-700'
          }`}
          role="status"
        >
          {statusLabels[status]}
        </div>

        {profile.verificationNote && (
          <p className="mb-4 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Staff note: {profile.verificationNote}
          </p>
        )}

        <div className="mb-5">
          <StudentVerificationCamera />
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-slate-600">
              Full name
              <input value={profile.fullName} readOnly className={`${inputClass} mt-1 bg-slate-50`} />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Email address
              <input value={profile.email} readOnly className={`${inputClass} mt-1 bg-slate-50`} />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Roll number
              <input
                required
                maxLength={32}
                value={details.rollNumber}
                onChange={(event) => setDetails({ ...details, rollNumber: event.target.value })}
                disabled={isLocked}
                className={`${inputClass} mt-1 disabled:bg-slate-50`}
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Department
              <input
                required
                maxLength={80}
                value={details.department}
                onChange={(event) => setDetails({ ...details, department: event.target.value })}
                disabled={isLocked}
                className={`${inputClass} mt-1 disabled:bg-slate-50`}
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Year
              <input
                required
                maxLength={24}
                value={details.year}
                onChange={(event) => setDetails({ ...details, year: event.target.value })}
                disabled={isLocked}
                className={`${inputClass} mt-1 disabled:bg-slate-50`}
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Section
              <input
                required
                maxLength={24}
                value={details.section}
                onChange={(event) => setDetails({ ...details, section: event.target.value })}
                disabled={isLocked}
                className={`${inputClass} mt-1 disabled:bg-slate-50`}
              />
            </label>
          </div>

          {submitVerification.isError && (
            <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {submitVerification.error instanceof Error
                ? submitVerification.error.message
                : 'Could not submit your verification details.'}
            </p>
          )}
          {submitVerification.isSuccess && (
            <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              Your details were submitted for staff review.
            </p>
          )}

          {!isLocked && (
            <button
              type="submit"
              disabled={submitVerification.isPending}
              className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              {submitVerification.isPending
                ? 'Submitting...'
                : status === 'rejected'
                  ? 'Resubmit for verification'
                  : 'Verify Student'}
            </button>
          )}
        </form>

      </Card>
    </div>
  )
}
