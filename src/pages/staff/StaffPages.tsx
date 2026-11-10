import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { Badge } from '@/components/ui/Badge'
import { Card, EmptyState } from '@/components/ui/Card'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { CameraAttendancePanel } from '@/features/attendance/components/CameraAttendancePanel'
import { LiveAttendancePanel } from '@/features/attendance/components/LiveAttendancePanel'
import {
  useStaffRoster,
  useStaffStudentVerifications,
  useStudentVerificationReview,
  useVisibleActivities,
} from '@/hooks/useStaffData'
import {
  createActivity,
  isLocalAccount,
  setSubjectCounters,
} from '@/lib/dataApi'
import { riskTone, RISK_LABEL, RISK_TONE, percentToRisk } from '@/lib/attendance'
import { addDaysISO, isoToday } from '@/lib/date'
import { matchesSubjectIdentity } from '@/lib/subjectKey'
import type {
  AcademicActivity,
  StudentVerificationRecord,
  StudentVerificationStatus,
  TaskPriority,
} from '@/types'

function RosterErrorNotice({ error }: { error: unknown }) {
  return (
    <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <h2 className="text-sm font-semibold text-amber-900">Could not load your students</h2>
      <p className="mt-1 text-xs text-amber-800">
        {error instanceof Error
          ? error.message
          : 'The shared student data could not be loaded right now.'}
      </p>
      <p className="mt-1 text-xs text-amber-700">
        Check your internet connection and refresh. Enrollments are saved in the shared database,
        so students will reappear once the connection is restored.
      </p>
    </div>
  )
}

function VerificationBadge({ status }: { status: StudentVerificationStatus }) {
  const tone =
    status === 'verified'
      ? 'success'
      : status === 'pending'
        ? 'warning'
        : status === 'rejected'
          ? 'danger'
          : 'neutral'
  const label =
    status === 'verified'
      ? 'Verified'
      : status === 'pending'
        ? 'Pending'
        : status === 'rejected'
          ? 'Rejected'
          : 'Not submitted'
  return <Badge tone={tone}>{label}</Badge>
}

/* ================================================================== *
 * 1. Dashboard                                                         *
 * ================================================================== */

export function StaffDashboardPage({ email }: { email: string }) {
  const { profile, subjects, rows, isLoading, isError, error } = useStaffRoster(email)
  const {
    records: verificationRecords,
    isLoading: verificationsLoading,
    isError: verificationLoadError,
    error: verificationError,
  } = useStaffStudentVerifications(email)

  if (isLoading) return <p className="text-sm text-slate-500">Loading dashboard...</p>
  if (isError) return <RosterErrorNotice error={error} />

  const overall =
    rows.length > 0
      ? Math.round(rows.reduce((sum, row) => sum + row.percent, 0) / rows.length)
      : 0
  const enrolledStudents = new Set(rows.map((row) => row.studentEmail)).size
  const atRisk = rows.filter((row) => percentToRisk(row.percent) === 'high').length

  return (
    <div>
      <header>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 lg:text-2xl">
          {profile?.fullName ? `Hi, ${profile.fullName.split(' ')[0]}` : 'Faculty Dashboard'}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {profile?.department || 'Department not set'} · attendance across your subjects
        </p>
        <Link
          to="/staff/attendance"
          className="mt-3 inline-flex items-center gap-1 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
        >
          Camera attendance →
        </Link>
      </header>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Metric label="Subjects taught" value={String(subjects.length)} />
        <Metric label="Students enrolled" value={String(enrolledStudents)} />
        <Metric label="Average attendance" value={`${overall}%`} />
        <Metric label="Registered students" value={verificationsLoading ? '…' : String(verificationRecords.length)} />
        <Metric
          label="Verified students"
          value={verificationsLoading ? '…' : String(verificationRecords.filter((record) => record.status === 'verified').length)}
        />
        <Metric
          label="Pending verification"
          value={verificationsLoading ? '…' : String(verificationRecords.filter((record) => record.status === 'pending').length)}
        />
      </div>
      {verificationLoadError && (
        <p role="alert" className="mt-3 text-xs text-rose-700">
          {verificationError instanceof Error
            ? verificationError.message
            : 'Could not load student verification counts.'}
        </p>
      )}

      {subjects.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="No subjects assigned yet."
            description="Add the subjects you teach in your profile to see student attendance analytics."
          />
        </div>
      ) : (
          <div className="mt-4 space-y-4">
            <Card title="Subject performance" description="Average across enrolled students">
              <ul className="space-y-3">
                {subjects.map((subject) => (
                  <li key={subject.key}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {subject.name}
                        {subject.code ? ` (${subject.code})` : ''}
                      </p>
                      <span className="shrink-0 text-sm font-bold text-slate-700">
                        {subject.averagePercent}%
                      </span>
                    </div>
                    <ProgressBar
                      value={subject.averagePercent}
                      tone={riskTone(subject.averagePercent)}
                      className="mt-1.5"
                      label={subject.name}
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      {subject.studentCount} students · {subject.atRiskCount} below 75%
                    </p>
                  </li>
                ))}
              </ul>
            </Card>

            {atRisk > 0 && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                <h2 className="text-sm font-semibold text-rose-800">
                  {atRisk} student{atRisk === 1 ? '' : 's'} below 75% attendance
                </h2>
                <p className="mt-1 text-xs text-rose-700">
                  Review the Students tab and update their records so they can recover.
                </p>
              </div>
            )}
          </div>
      )}
    </div>
  )
}

/* ================================================================== *
 * 2. My subjects                                                       *
 * ================================================================== */

export function StaffSubjectsPage({ email }: { email: string }) {
  const { subjects, isError, error } = useStaffRoster(email)

  return (
    <div>
      <header>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 lg:text-2xl">
          My Subjects
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Subjects you teach. Edit this list in your profile.
        </p>
      </header>

      <div className="mt-4">
        {isError ? (
          <RosterErrorNotice error={error} />
        ) : subjects.length === 0 ? (
          <EmptyState
            title="No subjects assigned."
            description="Add subjects in your profile to unlock student analytics."
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {subjects.map((subject) => (
              <li key={subject.key}>
                <Card>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{subject.name}</p>
                    <Badge tone="info">{subject.code || 'No code'}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {subject.semester || 'No semester'} · {subject.studentCount} students
                  </p>
                  <ProgressBar
                    value={subject.averagePercent}
                    tone={riskTone(subject.averagePercent)}
                    className="mt-3"
                    label={subject.name}
                  />
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/* ================================================================== *
 * 3. Students                                                          *
 * ================================================================== */

export function StaffStudentsPage({ email }: { email: string }) {
  const { rows, subjects, isLoading, isError, error } = useStaffRoster(email)
  const {
    records: verificationRecords,
    isLoading: verificationsLoading,
    isError: verificationsError,
    error: verificationError,
  } = useStaffStudentVerifications(email)
  const { review } = useStudentVerificationReview(email)
  const [filter, setFilter] = useState('')
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({})

  const visible = rows.filter(
    (row) =>
      !filter ||
      row.studentName.toLowerCase().includes(filter.toLowerCase()) ||
      row.subjectName.toLowerCase().includes(filter.toLowerCase()),
  )

  return (
    <div>
      <header>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 lg:text-2xl">Students</h1>
        <p className="mt-1 text-sm text-slate-500">
          Review registered student verification requests and attendance for students in your subjects.
        </p>
      </header>

      <div className="mt-4 space-y-4">
        <RegisteredStudents
          records={verificationRecords}
          subjects={subjects}
          isLoading={verificationsLoading}
          isError={verificationsError}
          error={verificationError}
        />
        <section aria-label="Student verification review">
          <Card title="Student verification review">
            {verificationsLoading ? (
              <p className="text-sm text-slate-500">Loading registered students...</p>
            ) : verificationsError ? (
              <p role="alert" className="text-sm text-rose-700">
                {verificationError instanceof Error
                  ? verificationError.message
                  : 'Could not load student verification records.'}
              </p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Metric label="Registered students" value={String(verificationRecords.length)} />
                  <Metric
                    label="Verified"
                    value={String(verificationRecords.filter((record) => record.status === 'verified').length)}
                  />
                  <Metric
                    label="Pending"
                    value={String(verificationRecords.filter((record) => record.status === 'pending').length)}
                  />
                </div>
                {verificationRecords.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-500">No student accounts are registered in this browser.</p>
                ) : (
                  <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {verificationRecords.map((record) => (
                      <li key={record.email} className="flex flex-wrap items-center justify-between gap-3 p-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">{record.fullName}</p>
                          <p className="truncate text-xs text-slate-500">{record.email} · {record.studentId}</p>
                          <p className="mt-1 text-xs text-slate-600">
                            Roll {record.rollNumber || '—'} · {record.department || 'Department not set'} · Year {record.year || '—'} · Section {record.section || '—'}
                          </p>
                          {record.note && <p className="mt-1 text-xs text-slate-500">Staff note: {record.note}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          <VerificationBadge status={record.status} />
                          {record.status === 'pending' && (
                            <>
                              <input
                                aria-label={`Review note for ${record.fullName}`}
                                maxLength={240}
                                value={reviewNotes[record.email] ?? ''}
                                onChange={(event) =>
                                  setReviewNotes((current) => ({
                                    ...current,
                                    [record.email]: event.target.value,
                                  }))
                                }
                                placeholder="Optional review note"
                                className="w-40 rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                              />
                              <button
                                type="button"
                                disabled={review.isPending}
                                onClick={() =>
                                  review.mutate({
                                    studentEmail: record.email,
                                    decision: 'verified',
                                    note: reviewNotes[record.email] ?? '',
                                  })
                                }
                                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                disabled={review.isPending}
                                onClick={() =>
                                  review.mutate({
                                    studentEmail: record.email,
                                    decision: 'rejected',
                                    note: reviewNotes[record.email] ?? '',
                                  })
                                }
                                className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                              >
                                Reject
                              </button>
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {review.isError && (
                  <p role="alert" className="mt-3 text-sm text-rose-700">
                    {review.error instanceof Error
                      ? review.error.message
                      : 'Could not review this student verification request.'}
                  </p>
                )}
              </>
            )}
          </Card>
        </section>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFilter('')}
            className={
              filter === ''
                ? 'rounded-full bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white'
                : 'rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600'
            }
          >
            All
          </button>
          {subjects.map((subject) => (
            <button
              key={subject.key}
              type="button"
              onClick={() => setFilter(subject.name)}
              className={
                filter === subject.name
                  ? 'rounded-full bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white'
                  : 'rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600'
              }
            >
              {subject.name}
            </button>
          ))}
        </div>

        {isLoading ? (
          <p className="text-sm text-slate-500">Loading students...</p>
        ) : isError ? (
          <RosterErrorNotice error={error} />
        ) : visible.length === 0 ? (
          <EmptyState
            title="No students found."
            description="This attendance list shows only enrolled students. Check the registered-student list above; students must add a matching subject to their own account, and subject assignments do not enroll students automatically."
          />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Student</th>
                  <th className="px-4 py-2.5 font-medium">ID</th>
                  <th className="px-4 py-2.5 font-medium">Subject</th>
                  <th className="px-4 py-2.5 font-medium">Attended</th>
                  <th className="px-4 py-2.5 font-medium">%</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((row) => {
                  const risk = percentToRisk(row.percent)
                  return (
                    <tr key={`${row.studentEmail}-${row.subjectName}`}>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-slate-800">{row.studentName}</p>
                        <p className="text-xs text-slate-500">{row.studentEmail}</p>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-600">{row.studentId}</td>
                      <td className="px-4 py-2.5 text-slate-600">{row.subjectName}</td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {row.attended}/{row.held}
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-slate-800">{row.percent}%</td>
                      <td className="px-4 py-2.5">
                        <Badge tone={RISK_TONE[risk]}>{RISK_LABEL[risk]}</Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function RegisteredStudents({
  records,
  subjects,
  isLoading,
  isError,
  error,
}: {
  records: StudentVerificationRecord[]
  subjects: Array<{ key: string; name: string; code: string }>
  isLoading: boolean
  isError: boolean
  error: unknown
}) {
  const [subjectKey, setSubjectKey] = useState('')
  const [department, setDepartment] = useState('')
  const [year, setYear] = useState('')
  const [section, setSection] = useState('')
  const selectedSubject = subjects.find((subject) => subject.key === subjectKey)
  const departments = [...new Set(records.map((record) => record.department.trim()).filter(Boolean))].sort()
  const years = [...new Set(records.map((record) => record.year.trim()).filter(Boolean))].sort()
  const sections = [...new Set(records.map((record) => record.section.trim()).filter(Boolean))].sort()
  const filtered = records.filter((record) => {
    if (department && record.department.trim() !== department) return false
    if (year && record.year.trim() !== year) return false
    if (section && record.section.trim() !== section) return false
    return true
  })
  const isEnrolledInSelectedSubject = (record: StudentVerificationRecord) =>
    Boolean(
      selectedSubject &&
        record.enrolledSubjects.some((studentSubject) =>
          matchesSubjectIdentity(
            studentSubject.name,
            studentSubject.code,
            selectedSubject.name,
            selectedSubject.code,
          ),
        ),
    )

  const selectClass =
    'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100'

  return (
    <Card title="Registered students and subject enrollment">
      <p className="text-sm text-slate-600">
        Registered accounts are listed separately from enrollment. A student is marked enrolled
        only when their student record contains a subject matching an assigned subject code; no
        students are enrolled automatically.
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Subject codes are compared without case, punctuation, or extra-space differences. Legacy
        subject records without a code are matched by name. This list reflects accounts available
        in this browser; localStorage does not sync accounts between devices.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="registered-students-subject">Assigned subject</label>
        <select
          id="registered-students-subject"
          value={subjectKey}
          onChange={(event) => setSubjectKey(event.target.value)}
          className={selectClass}
        >
          <option value="">All registered students</option>
          {subjects.map((subject) => (
            <option key={subject.key} value={subject.key}>
              {subject.name}{subject.code ? ` (${subject.code})` : ''}
            </option>
          ))}
        </select>
        <FilterSelect id="registered-students-department" label="Department" value={department} onChange={setDepartment} options={departments} className={selectClass} />
        <FilterSelect id="registered-students-year" label="Year" value={year} onChange={setYear} options={years} className={selectClass} />
        <FilterSelect id="registered-students-section" label="Section" value={section} onChange={setSection} options={sections} className={selectClass} />
      </div>
      {isLoading ? (
        <p className="mt-4 text-sm text-slate-500">Loading registered students...</p>
      ) : isError ? (
        <p role="alert" className="mt-4 text-sm text-rose-700">
          {error instanceof Error ? error.message : 'Could not load registered student accounts.'}
        </p>
      ) : records.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">
          No student accounts are registered in this browser. Accounts on other devices are not
          visible to this localStorage-based portal.
        </p>
      ) : filtered.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">
          No registered students match the selected department, year, and section filters.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2.5 font-medium">Student</th>
                <th className="px-3 py-2.5 font-medium">Roll number</th>
                <th className="px-3 py-2.5 font-medium">Department</th>
                <th className="px-3 py-2.5 font-medium">Year</th>
                <th className="px-3 py-2.5 font-medium">Section</th>
                <th className="px-3 py-2.5 font-medium">Verification</th>
                {selectedSubject && <th className="px-3 py-2.5 font-medium">Enrollment</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((record) => {
                const enrolled = isEnrolledInSelectedSubject(record)
                return (
                  <tr key={record.email}>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-slate-800">{record.fullName || 'Name not set'}</p>
                      <p className="text-xs text-slate-500">{record.email}</p>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{record.rollNumber || 'Not provided'}</td>
                    <td className="px-3 py-2.5 text-slate-600">{record.department || 'Not provided'}</td>
                    <td className="px-3 py-2.5 text-slate-600">{record.year || 'Not provided'}</td>
                    <td className="px-3 py-2.5 text-slate-600">{record.section || 'Not provided'}</td>
                    <td className="px-3 py-2.5"><VerificationBadge status={record.status} /></td>
                    {selectedSubject && (
                      <td className="px-3 py-2.5">
                        <Badge tone={enrolled ? 'success' : 'neutral'}>
                          {enrolled ? 'Enrolled' : 'Not enrolled'}
                        </Badge>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {selectedSubject && records.length > 0 && !records.some(isEnrolledInSelectedSubject) && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
          No registered student is enrolled in {selectedSubject.name}
          {selectedSubject.code ? ` (${selectedSubject.code})` : ''}. Students must add this subject
          to their own account; adding a staff assignment does not enroll them.
        </p>
      )}
    </Card>
  )
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
  className,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  options: string[]
  className: string
}) {
  return (
    <>
      <label className="sr-only" htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className={className}>
        <option value="">All {label.toLowerCase()}s</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </>
  )
}

/* ================================================================== *
 * 4. Attendance correction                                             *
 * ================================================================== */

function useCounterMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      studentEmail: string
      subjectId: string
      held: number
      attended: number
      reason: string
    }) =>
      setSubjectCounters(
        input.studentEmail,
        input.subjectId,
        input.held,
        Math.min(input.held, input.attended),
        input.reason,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['staff-roster'] })
    },
  })
}

export function StaffAttendancePage({ email }: { email: string }) {
  const { profile, rows, isLoading, isError, error } = useStaffRoster(email)
  const counter = useCounterMutation()

  // subjectId is resolved by matching the student's subject name below.
  const byStudent = new Map<string, typeof rows>()
  for (const row of rows) {
    const list = byStudent.get(row.studentEmail) ?? []
    list.push(row)
    byStudent.set(row.studentEmail, list)
  }

  return (
    <div>
      <header>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 lg:text-2xl">
          Attendance
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Manually confirm verified students from the camera roster or correct attendance records.
        </p>
      </header>

      <div className="mt-4">
        <CameraAttendancePanel
          email={email}
          subjects={profile?.subjects ?? []}
          rows={rows}
        />
      </div>

      <div className="mt-4">
        {isLocalAccount(email) ? (
          <Card title="Live attendance code">
            <p className="text-sm text-slate-600">
              Cross-device live sessions require the separately configured shared backend. Camera
              attendance above is available locally and does not use it.
            </p>
          </Card>
        ) : (
          <LiveAttendancePanel email={email} />
        )}
      </div>

      <div className="mt-4 space-y-3">
        {isLoading ? (
          <p className="text-sm text-slate-500">Loading records...</p>
        ) : isError ? (
          <RosterErrorNotice error={error} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No attendance records yet."
            description="Records appear when students join your class with its code and log classes."
          />
        ) : (
          rows.map((row) => (
            <CounterRow
              key={`${row.studentEmail}-${row.subjectId}`}
              row={row}
              onSave={(held, attended, reason) =>
                counter.mutate({
                  studentEmail: row.studentEmail,
                  subjectId: row.subjectId,
                  held,
                  attended,
                  reason,
                })
              }
            />
          ))
        )}
      </div>

      {counter.isError && (
        <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600">
          {counter.error instanceof Error
            ? counter.error.message
            : 'Could not update attendance.'}
        </p>
      )}

      <p className="mt-4 text-[11px] text-slate-400">
        Showing {byStudent.size} student{byStudent.size === 1 ? '' : 's'}.
      </p>
    </div>
  )
}

function CounterRow({
  row,
  onSave,
}: {
  row: {
    studentEmail: string
    studentName: string
    subjectId: string
    subjectName: string
    held: number
    attended: number
    percent: number
  }
  onSave: (held: number, attended: number, reason: string) => void
}) {
  const [held, setHeld] = useState(row.held)
  const [attended, setAttended] = useState(row.attended)
  const [reason, setReason] = useState('')
  const [dirty, setDirty] = useState(false)

  // Live check-ins update the shared counters underneath this row. Follow the
  // server while the staff member is not editing, so a stale form can never
  // overwrite a check-in on save.
  useEffect(() => {
    if (dirty) return
    setHeld(row.held)
    setAttended(row.attended)
  }, [row.held, row.attended, dirty])

  const percent = held > 0 ? Math.round((attended / held) * 100) : 0

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-800">{row.studentName}</p>
          <p className="text-xs text-slate-500">{row.subjectName}</p>
        </div>
        <Badge tone={RISK_TONE[percentToRisk(percent)]}>{RISK_LABEL[percentToRisk(percent)]}</Badge>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-xs text-slate-600">
          Held
          <input
            type="number"
            min={0}
            value={held}
            onChange={(e) => {
              setHeld(Math.max(0, Number(e.target.value)))
              setDirty(true)
            }}
            className="mt-1 w-20 rounded-xl border border-slate-200 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-slate-600">
          Attended
          <input
            type="number"
            min={0}
            value={attended}
            onChange={(e) => {
              setAttended(Math.max(0, Number(e.target.value)))
              setDirty(true)
            }}
            className="mt-1 w-20 rounded-xl border border-slate-200 px-2 py-1.5 text-sm"
          />
        </label>
        <span className="text-sm font-bold text-slate-700">{percent}%</span>
        <label className="min-w-52 flex-1 text-xs text-slate-600">
          Correction reason
          <input
            type="text"
            minLength={5}
            maxLength={1000}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why is this correction needed?"
            className="mt-1 w-full rounded-xl border border-slate-200 px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="button"
          disabled={reason.trim().length < 5}
          onClick={() => {
            setDirty(false)
            onSave(held, attended, reason.trim())
            setReason('')
          }}
          className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  )
}

/* ================================================================== *
 * 5. Academic activities                                              *
 * ================================================================== */

export function StaffActivitiesPage({ email }: { email: string }) {
  const { activities, isLoading } = useVisibleActivities(email, 'staff', [])
  const [form, setForm] = useState<Omit<AcademicActivity, 'id' | 'createdBy' | 'createdAt'>>({
    subjectName: '',
    subjectCode: '',
    title: '',
    description: '',
    dueDate: addDaysISO(isoToday(), 7),
    priority: 'medium',
  })
  const queryClient = useQueryClient()
  const [saved, setSaved] = useState(false)

  const addActivity = useMutation({
    mutationFn: () => createActivity(email, form),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['activities'] })
      setSaved(true)
      window.setTimeout(() => setSaved(false), 3000)
    },
  })

  const inputClass =
    'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400'

  return (
    <div>
      <header>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 lg:text-2xl">
          Academic Activities
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Announcements you publish are visible only to students in the matching subject.
        </p>
      </header>

      <div className="mt-4 space-y-4">
        <Card title="Publish an activity">
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Title"
              className={inputClass}
              aria-label="Activity title"
            />
            <input
              value={form.subjectName}
              onChange={(e) => setForm({ ...form, subjectName: e.target.value })}
              placeholder="Subject name"
              className={inputClass}
              aria-label="Activity subject"
            />
            <input
              value={form.subjectCode}
              onChange={(e) => setForm({ ...form, subjectCode: e.target.value })}
              placeholder="Subject code"
              className={inputClass}
              aria-label="Activity subject code"
            />
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              className={inputClass}
              aria-label="Activity due date"
            />
            <select
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}
              className={inputClass}
              aria-label="Activity priority"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Description"
              className={inputClass}
              aria-label="Activity description"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              if (!form.title.trim() || !form.subjectName.trim()) return
              void addActivity.mutateAsync()
            }}
            disabled={addActivity.isPending}
            className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {addActivity.isPending ? 'Publishing...' : 'Publish'}
          </button>
          {saved && <span className="ml-3 text-xs font-medium text-emerald-600">Published</span>}
        </Card>

        {isLoading ? (
          <p className="text-sm text-slate-500">Loading activities...</p>
        ) : activities.length === 0 ? (
          <EmptyState
            title="No activities published."
            description="Publish an assignment or exam announcement above."
          />
        ) : (
          <ul className="space-y-2">
            {activities.map((activity) => (
              <li
                key={activity.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{activity.title}</p>
                  <Badge tone={activity.priority === 'high' ? 'danger' : 'info'}>
                    {activity.priority}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {activity.subjectName}
                  {activity.subjectCode ? ` (${activity.subjectCode})` : ''} · due{' '}
                  {activity.dueDate}
                </p>
                {activity.description && (
                  <p className="mt-1.5 text-xs text-slate-600">{activity.description}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="motion-metric rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  )
}
