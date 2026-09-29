import { useState } from 'react'

import { Card, EmptyState } from '@/components/ui/Card'
import { useSubjectMutations } from '@/hooks/useStudentData'
import { useAttendance } from '@/hooks/useAttendance'
import type { SubjectStats } from '@/hooks/useAttendance'
import {
  RISK_LABEL,
  RISK_TONE,
  classesNeededToReach,
  riskTextColor,
} from '@/lib/attendance'
import { Badge } from '@/components/ui/Badge'
import { ProgressBar } from '@/components/ui/ProgressBar'
import type { Subject } from '@/types'

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100'
const labelClass = 'mb-1 block text-xs font-medium text-slate-600'

function emptyDraft(): Omit<Subject, 'id' | 'held' | 'attended'> {
  return { name: '', code: '', faculty: '' }
}

export function SubjectManager({ email }: { email: string }) {
  const { summary, isLoading } = useAttendance(email)
  const { addSubject } = useSubjectMutations(email)
  const [draft, setDraft] = useState(emptyDraft())
  const [editingId, setEditingId] = useState<string | null>(null)

  const onCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!draft.name.trim()) return
    await addSubject.mutateAsync(draft)
    setDraft(emptyDraft())
  }

  return (
    <Card
      title="Subjects"
      description="Percentage is calculated from classes held and attended"
    >
      <form onSubmit={onCreate} className="grid gap-3 sm:grid-cols-4">
        <div className="sm:col-span-1">
          <label htmlFor="subject-name" className={labelClass}>
            Subject name
          </label>
          <input
            id="subject-name"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Data Structures"
            className={inputClass}
            required
          />
        </div>
        <div>
          <label htmlFor="subject-code" className={labelClass}>
            Code
          </label>
          <input
            id="subject-code"
            value={draft.code}
            onChange={(e) => setDraft({ ...draft, code: e.target.value })}
            placeholder="CS201"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="subject-faculty" className={labelClass}>
            Faculty
          </label>
          <input
            id="subject-faculty"
            value={draft.faculty}
            onChange={(e) => setDraft({ ...draft, faculty: e.target.value })}
            placeholder="Dr. Priya"
            className={inputClass}
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={addSubject.isPending}
            className="w-full rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-60"
          >
            {addSubject.isPending ? 'Adding...' : 'Add subject'}
          </button>
        </div>
      </form>

      {isLoading ? (
        <p className="mt-5 text-sm text-slate-500">Loading subjects...</p>
      ) : !summary || summary.subjects.length === 0 ? (
        <EmptyState
          className="mt-5"
          title="No subjects added yet."
          description="Add your first subject to start tracking attendance."
        />
      ) : (
        <ul className="mt-5 space-y-3">
          {summary.subjects.map((subject) => (
            <SubjectRow
              key={subject.id}
              subject={subject}
              email={email}
              isEditing={editingId === subject.id}
              onStartEdit={() => setEditingId(subject.id)}
              onCancelEdit={() => setEditingId(null)}
            />
          ))}
        </ul>
      )}
    </Card>
  )
}

function SubjectRow({
  subject,
  email,
  isEditing,
  onStartEdit,
  onCancelEdit,
}: {
  subject: SubjectStats
  email: string
  isEditing: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
}) {
  const { editSubject, removeSubject } = useSubjectMutations(email)
  const needed = classesNeededToReach(subject.attended, subject.held)

  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-4">
      {isEditing ? (
        <EditSubjectForm
          subject={subject}
          onCancel={onCancelEdit}
          onSave={async (patch) => {
            await editSubject.mutateAsync({ ...subject, ...patch })
            onCancelEdit()
          }}
        />
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{subject.name}</p>
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {[subject.code, subject.faculty].filter(Boolean).join(' · ') || 'No code or faculty'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className={`text-sm font-bold ${riskTextColor(subject.percent)}`}>
                {subject.percent}%
              </span>
              <Badge tone={RISK_TONE[subject.risk]}>{RISK_LABEL[subject.risk]}</Badge>
            </div>
          </div>

          <ProgressBar
            value={subject.percent}
            className="mt-3"
            label={`${subject.name} attendance`}
          />

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              {subject.attended}/{subject.held} classes
              {needed !== null && subject.held > 0 && (
                <span className="ml-1 font-medium text-rose-600">
                  · attend {needed} more to reach 85%
                </span>
              )}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onStartEdit}
                className="rounded-lg px-2.5 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => void removeSubject.mutateAsync(subject.id)}
                className="rounded-lg px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
              >
                Delete
              </button>
            </div>
          </div>
        </>
      )}
    </li>
  )
}

function EditSubjectForm({
  subject,
  onCancel,
  onSave,
}: {
  subject: SubjectStats
  onCancel: () => void
  onSave: (patch: { name: string; code: string; faculty: string }) => Promise<void>
}) {
  const [form, setForm] = useState({
    name: subject.name,
    code: subject.code,
    faculty: subject.faculty,
  })

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void onSave(form)
      }}
      className="grid gap-3 sm:grid-cols-4"
    >
      <input
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        className={inputClass}
        aria-label="Subject name"
      />
      <input
        value={form.code}
        onChange={(e) => setForm({ ...form, code: e.target.value })}
        className={inputClass}
        aria-label="Subject code"
      />
      <input
        value={form.faculty}
        onChange={(e) => setForm({ ...form, faculty: e.target.value })}
        className={inputClass}
        aria-label="Faculty"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          className="flex-1 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
