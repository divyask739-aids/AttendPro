import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  listSupabaseStaffSubjectAssignments,
  approveSupabaseStaffInvitation,
  createSupabaseStaffInvitation,
  listSupabaseStaffInvitations,
  saveSupabaseStaffSubjectAssignments,
} from '@/lib/supabaseAuth'
import { isSupabaseAuthEnabled } from '@/lib/supabase'
import { subjectKey } from '@/lib/subjectKey'
import type { StaffProfile } from '@/types'

const INVITATIONS_KEY = ['staff-invitations']
const ASSIGNMENTS_KEY = ['staff-subject-assignments']

export function StaffAccessPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [selectedStaffId, setSelectedStaffId] = useState('')
  const [draftSubjects, setDraftSubjects] = useState<StaffProfile['subjects']>([])
  const [subjectName, setSubjectName] = useState('')
  const [subjectCode, setSubjectCode] = useState('')
  const [subjectSemester, setSubjectSemester] = useState('')
  const [assignmentError, setAssignmentError] = useState('')
  const queryClient = useQueryClient()
  const invitations = useQuery({
    queryKey: INVITATIONS_KEY,
    queryFn: listSupabaseStaffInvitations,
    enabled: isSupabaseAuthEnabled,
    retry: false,
  })
  const assignments = useQuery({
    queryKey: ASSIGNMENTS_KEY,
    queryFn: listSupabaseStaffSubjectAssignments,
    enabled: isSupabaseAuthEnabled,
    retry: false,
  })

  const createInvitation = useMutation({
    mutationFn: createSupabaseStaffInvitation,
    onSuccess: async () => {
      setEmail('')
      setMessage('Invitation recorded. Send the Auth invitation from the staging Supabase Dashboard.')
      await queryClient.invalidateQueries({ queryKey: INVITATIONS_KEY })
    },
  })

  const approveInvitation = useMutation({
    mutationFn: approveSupabaseStaffInvitation,
    onSuccess: async () => {
      setMessage('Verified account approved as staff.')
      await queryClient.invalidateQueries({ queryKey: INVITATIONS_KEY })
    },
  })
  const saveAssignments = useMutation({
    mutationFn: () => saveSupabaseStaffSubjectAssignments(selectedStaffId, draftSubjects),
    onSuccess: async () => {
      setMessage('Staff subject assignments saved.')
      await queryClient.invalidateQueries({ queryKey: ASSIGNMENTS_KEY })
    },
  })

  useEffect(() => {
    if (!selectedStaffId && assignments.data?.[0]) {
      setSelectedStaffId(assignments.data[0].userId)
    }
  }, [assignments.data, selectedStaffId])

  useEffect(() => {
    const selected = assignments.data?.find((staff) => staff.userId === selectedStaffId)
    setDraftSubjects(selected?.subjects ?? [])
  }, [assignments.data, selectedStaffId])

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage('')
    createInvitation.mutate(email)
  }

  const addSubject = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = subjectName.trim()
    const next = { name, code: subjectCode.trim(), semester: subjectSemester.trim() }
    if (!name) {
      setAssignmentError('Enter a subject name.')
      return
    }
    if (draftSubjects.some((subject) => subjectKey(subject.name, subject.code) === subjectKey(next.name, next.code))) {
      setAssignmentError('That subject is already assigned to this staff member.')
      return
    }
    setAssignmentError('')
    setDraftSubjects((current) => [...current, next])
    setSubjectName('')
    setSubjectCode('')
    setSubjectSemester('')
  }

  if (!isSupabaseAuthEnabled) {
    return <p className="text-sm text-slate-600">Staff access management is available only in the enabled staging environment.</p>
  }

  return (
    <div>
      <header>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 lg:text-2xl">Staff access</h1>
        <p className="mt-1 text-sm text-slate-500">
          Only a platform administrator can create or approve staff access. Every operation is checked by the database.
        </p>
      </header>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Invite a staff member</h2>
        <p className="mt-1 text-sm text-slate-600">
          First record the intended email here. Then send that address an invitation from the staging Supabase Authentication dashboard. Role approval remains a separate step after email verification.
        </p>
        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <label className="sr-only" htmlFor="staff-invite-email">Staff email</label>
          <input
            id="staff-invite-email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="staff@example.edu"
            className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
          />
          <button
            type="submit"
            disabled={createInvitation.isPending}
            className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {createInvitation.isPending ? 'Recording...' : 'Record invitation'}
          </button>
        </form>
      </section>

      {(createInvitation.error || approveInvitation.error || invitations.error || assignments.error || saveAssignments.error) && (
        <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {(createInvitation.error ?? approveInvitation.error ?? invitations.error ?? assignments.error ?? saveAssignments.error) instanceof Error
            ? (createInvitation.error ?? approveInvitation.error ?? invitations.error ?? assignments.error ?? saveAssignments.error)?.message
            : 'Could not complete the staff access operation. Platform administrator authorization is required.'}
        </p>
      )}
      {message && <p role="status" className="mt-4 text-sm text-emerald-700">{message}</p>}

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Staff invitations</h2>
        {invitations.isLoading ? (
          <p className="mt-3 text-sm text-slate-500">Loading invitations...</p>
        ) : invitations.data?.length ? (
          <ul className="mt-3 divide-y divide-slate-100">
            {invitations.data.map((invitation) => (
              <li key={invitation.email} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">{invitation.email}</p>
                  <p className="text-xs text-slate-500">
                    {invitation.status === 'approved'
                      ? 'Approved staff'
                      : invitation.authUserId
                        ? 'Email verified; awaiting administrator approval'
                        : 'Pending email invitation and verification'}
                  </p>
                </div>
                {invitation.status === 'pending' && invitation.authUserId && (
                  <button
                    type="button"
                    disabled={approveInvitation.isPending}
                    onClick={() => {
                      const userId = invitation.authUserId
                      if (userId) approveInvitation.mutate(userId)
                    }}
                    className="rounded-xl border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-60"
                  >
                    {approveInvitation.isPending ? 'Approving...' : 'Approve as staff'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : !invitations.isError ? (
          <p className="mt-3 text-sm text-slate-500">No staff invitations have been recorded.</p>
        ) : null}
      </section>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Staff subject assignments</h2>
        <p className="mt-1 text-sm text-slate-600">
          Only a platform administrator can grant subject access. Assignments determine which student rosters and attendance sessions staff may access.
        </p>
        <div className="mt-4">
          <label htmlFor="assignment-staff" className="mb-1 block text-xs font-medium text-slate-600">
            Approved staff member
          </label>
          <select
            id="assignment-staff"
            value={selectedStaffId}
            onChange={(event) => {
              setSelectedStaffId(event.target.value)
              setAssignmentError('')
            }}
            disabled={!assignments.data?.length}
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
          >
            {!assignments.data?.length ? (
              <option value="">No approved staff accounts</option>
            ) : (
              assignments.data.map((staff) => (
                <option key={staff.userId} value={staff.userId}>
                  {staff.fullName || staff.email} · {staff.email}
                </option>
              ))
            )}
          </select>
        </div>
        {selectedStaffId && (
          <>
            <ul className="mt-3 divide-y divide-slate-100">
              {draftSubjects.map((subject, index) => (
                <li key={`${subjectKey(subject.name, subject.code)}-${index}`} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 text-sm text-slate-800">
                    {subject.name}{subject.code ? ` (${subject.code})` : ''}{subject.semester ? ` · ${subject.semester}` : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDraftSubjects((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                    className="rounded-lg px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <form onSubmit={addSubject} className="mt-3 grid gap-2 sm:grid-cols-3">
              <label className="sr-only" htmlFor="assignment-subject-name">Subject name</label>
              <input
                id="assignment-subject-name"
                value={subjectName}
                onChange={(event) => setSubjectName(event.target.value)}
                placeholder="Subject name"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <label className="sr-only" htmlFor="assignment-subject-code">Subject code</label>
              <input
                id="assignment-subject-code"
                value={subjectCode}
                onChange={(event) => setSubjectCode(event.target.value)}
                placeholder="Subject code"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <label className="sr-only" htmlFor="assignment-subject-semester">Semester</label>
              <input
                id="assignment-subject-semester"
                value={subjectSemester}
                onChange={(event) => setSubjectSemester(event.target.value)}
                placeholder="Semester"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <button type="submit" className="rounded-xl border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 sm:col-span-3">
                Add subject
              </button>
            </form>
            {assignmentError && <p role="alert" className="mt-2 text-xs text-rose-700">{assignmentError}</p>}
            <button
              type="button"
              onClick={() => saveAssignments.mutate()}
              disabled={saveAssignments.isPending}
              className="mt-3 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              {saveAssignments.isPending ? 'Saving...' : 'Save assignments'}
            </button>
          </>
        )}
      </section>
    </div>
  )
}
