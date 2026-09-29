import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { attendancePercent, percentToRisk, type AttendanceRisk } from '@/lib/attendance'
import { fetchAttendanceRecords, fetchSubjects } from '@/lib/dataApi'
import type { Subject } from '@/types'

export interface SubjectStats extends Subject {
  percent: number
  risk: AttendanceRisk
}

export interface AttendanceSummary {
  overallPercent: number
  overallRisk: AttendanceRisk
  totalHeld: number
  totalAttended: number
  subjects: SubjectStats[]
  atRiskCount: number
  bySubjectId: Map<string, SubjectStats>
  bySubjectName: Map<string, SubjectStats>
  hasData: boolean
}

/** The single source of truth every page reads attendance from. */
export function useAttendance(email: string | undefined) {
  const subjectsQuery = useQuery({
    queryKey: ['subjects', email],
    queryFn: () => fetchSubjects(email ?? ''),
    enabled: Boolean(email),
  })

  const recordsQuery = useQuery({
    queryKey: ['attendance-records', email],
    queryFn: () => fetchAttendanceRecords(email ?? ''),
    enabled: Boolean(email),
  })

  const summary = useMemo<AttendanceSummary | undefined>(() => {
    const subjects = subjectsQuery.data
    if (!subjects) return undefined

    const stats: SubjectStats[] = subjects.map((subject) => {
      const percent = attendancePercent(subject.attended, subject.held)
      return { ...subject, percent, risk: percentToRisk(percent) }
    })

    const totalHeld = stats.reduce((sum, s) => sum + s.held, 0)
    const totalAttended = stats.reduce((sum, s) => sum + s.attended, 0)
    const overallPercent = attendancePercent(totalAttended, totalHeld)

    return {
      overallPercent,
      overallRisk: percentToRisk(overallPercent),
      totalHeld,
      totalAttended,
      subjects: stats,
      atRiskCount: stats.filter((s) => s.risk !== 'safe').length,
      bySubjectId: new Map(stats.map((s) => [s.id, s])),
      bySubjectName: new Map(stats.map((s) => [s.name, s])),
      hasData: stats.length > 0,
    }
  }, [subjectsQuery.data])

  return {
    summary,
    records: recordsQuery.data ?? [],
    isLoading: subjectsQuery.isLoading || recordsQuery.isLoading,
    isError: subjectsQuery.isError || recordsQuery.isError,
  }
}
