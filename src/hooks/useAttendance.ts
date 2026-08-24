import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { fetchAttendanceRecords, fetchSubjects } from '@/lib/api'
import type { Subject } from '@/types'

export interface SubjectAttendance extends Subject {
  percent: number
}

export interface AttendanceStats {
  overallPercent: number
  totalHeld: number
  totalAttended: number
  subjects: SubjectAttendance[]
}

function percent(attended: number, held: number): number {
  if (held <= 0) return 0
  return Math.round((attended / held) * 100)
}

export function useAttendance() {
  const subjectsQuery = useQuery({ queryKey: ['subjects'], queryFn: fetchSubjects })
  const recordsQuery = useQuery({
    queryKey: ['attendance-records'],
    queryFn: fetchAttendanceRecords,
  })

  const stats = useMemo<AttendanceStats | undefined>(() => {
    const subjects = subjectsQuery.data
    if (!subjects) return undefined

    const withPercent: SubjectAttendance[] = subjects.map((subject) => ({
      ...subject,
      percent: percent(subject.attended, subject.held),
    }))
    const totalHeld = withPercent.reduce((sum, s) => sum + s.held, 0)
    const totalAttended = withPercent.reduce((sum, s) => sum + s.attended, 0)

    return {
      overallPercent: percent(totalAttended, totalHeld),
      totalHeld,
      totalAttended,
      subjects: withPercent,
    }
  }, [subjectsQuery.data])

  return {
    stats,
    records: recordsQuery.data,
    isLoading: subjectsQuery.isLoading || recordsQuery.isLoading,
    isError: subjectsQuery.isError || recordsQuery.isError,
  }
}
