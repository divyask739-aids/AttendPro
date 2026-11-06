import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { Badge } from '@/components/ui/Badge'
import { Card, EmptyState } from '@/components/ui/Card'
import {
  useAttendanceCheckInBroadcast,
  useSessionCheckIns,
  useStaffAttendanceSessions,
} from '@/hooks/useAttendanceSessions'
import { checkInWithCode } from '@/lib/attendanceSync'
import {
  closeFaceDetector,
  createFaceDetector,
  detectFaces,
  isFaceDetectionSupported,
  type DetectedFace,
} from '@/lib/faceDetection'
import { ATTENDANCE_SETUP_MESSAGE, isAttendanceSyncConfigured } from '@/lib/supabase'
import { matchesSubjectKey, subjectKey } from '@/lib/subjectKey'
import type { StaffSubject, StudentAttendanceRow } from '@/types'

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100'

function cameraErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return 'Camera permission was denied. Allow camera access in your browser settings, then try again.'
    }
    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      return 'No webcam was found. Connect a camera and try again.'
    }
    if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      return 'The webcam could not be opened. It may already be in use by another application.'
    }
  }
  return error instanceof Error ? error.message : 'Could not start the camera.'
}

function faceBoxStyle(face: DetectedFace, video: HTMLVideoElement | null) {
  if (!video || video.videoWidth === 0 || video.videoHeight === 0) return {}

  const width = video.clientWidth
  const height = video.clientHeight
  const scale = Math.max(width / video.videoWidth, height / video.videoHeight)
  const offsetX = (width - video.videoWidth * scale) / 2
  const offsetY = (height - video.videoHeight * scale) / 2
  const mirroredX = video.videoWidth - face.x - face.width

  return {
    left: `${((mirroredX * scale + offsetX) / width) * 100}%`,
    top: `${((face.y * scale + offsetY) / height) * 100}%`,
    width: `${((face.width * scale) / width) * 100}%`,
    height: `${((face.height * scale) / height) * 100}%`,
  }
}

export function CameraAttendancePanel({
  email,
  subjects,
  rows,
}: {
  email: string
  subjects: StaffSubject[]
  rows: StudentAttendanceRow[]
}) {
  const queryClient = useQueryClient()
  const { sessions, isLoading: sessionsLoading, isError: sessionsError, error: sessionsQueryError } =
    useStaffAttendanceSessions(email)
  const selectedSubjectKey = useRef('')
  const [subjectKeyValue, setSubjectKeyValue] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(() => new Set())
  const [faces, setFaces] = useState<DetectedFace[]>([])
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const detectorRef = useRef<Awaited<ReturnType<typeof createFaceDetector>> | null>(null)
  const frameRef = useRef<number | null>(null)
  const generationRef = useRef(0)
  const startPendingRef = useRef(false)
  const lastDetectionRef = useRef(0)
  const mountedRef = useRef(false)

  const selectedSubject =
    subjects.find((subject) => subjectKey(subject.name, subject.code) === subjectKeyValue) ??
    subjects[0]
  const activeSessions = useMemo(() => {
    if (!selectedSubject) return []
    const key = subjectKey(selectedSubject.name, selectedSubject.code)
    return sessions.filter(
      (session) =>
        session.isOpen &&
        matchesSubjectKey(session.subjectName, session.subjectCode, key),
    )
  }, [selectedSubject, sessions])
  const selectedSession =
    activeSessions.find((session) => session.id === sessionId) ?? activeSessions[0] ?? null
  const subjectRoster = useMemo(() => {
    if (!selectedSubject) return []
    const key = subjectKey(selectedSubject.name, selectedSubject.code)
    return rows
      .filter((row) => matchesSubjectKey(row.subjectName, row.subjectCode, key))
      .sort((a, b) => a.studentName.localeCompare(b.studentName))
  }, [rows, selectedSubject])

  useEffect(() => {
    if (!selectedSubject) return
    const key = subjectKey(selectedSubject.name, selectedSubject.code)
    if (selectedSubjectKey.current !== key) {
      selectedSubjectKey.current = key
      setSubjectKeyValue(key)
      setSessionId('')
      setSelectedEmails(new Set())
      setActionError(null)
      setActionSuccess(null)
    }
  }, [selectedSubject])

  const {
    checkIns,
    isLoading: checkInsLoading,
    isError: checkInsError,
    error: checkInsQueryError,
  } = useSessionCheckIns(selectedSession?.id, email)
  useAttendanceCheckInBroadcast(selectedSession?.id)
  const checkedInEmails = useMemo(
    () => new Set(checkIns.map((checkIn) => checkIn.studentEmail.toLowerCase())),
    [checkIns],
  )
  const pendingStudents = useMemo(
    () =>
      subjectRoster.filter(
        (student) =>
          selectedEmails.has(student.studentEmail.toLowerCase()) &&
          !checkedInEmails.has(student.studentEmail.toLowerCase()),
      ),
    [checkedInEmails, selectedEmails, subjectRoster],
  )

  useEffect(() => {
    setSelectedEmails((current) => {
      const next = new Set(
        [...current].filter((studentEmail) => !checkedInEmails.has(studentEmail)),
      )
      return next.size === current.size ? current : next
    })
  }, [checkedInEmails])

  const stopCamera = useCallback((updateState = true) => {
    generationRef.current += 1
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    closeFaceDetector(detectorRef.current)
    detectorRef.current = null

    const stream = streamRef.current
    streamRef.current = null
    stream?.getTracks().forEach((track) => track.stop())
    if (videoRef.current) videoRef.current.srcObject = null

    if (updateState) {
      setIsStarting(startPendingRef.current)
      setIsRunning(false)
      setFaces([])
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      stopCamera(false)
    }
  }, [stopCamera])

  useEffect(() => {
    stopCamera()
  }, [selectedSession?.id, stopCamera])

  const startCamera = async () => {
    if (startPendingRef.current || streamRef.current) return
    if (!isFaceDetectionSupported()) {
      setCameraError('Face detection is not supported in this browser.')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera access requires a supported browser and a secure HTTPS connection.')
      return
    }

    const generation = ++generationRef.current
    startPendingRef.current = true
    setCameraError(null)
    setIsStarting(true)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user' },
      })
      if (generationRef.current !== generation) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      streamRef.current = stream
      const video = videoRef.current
      if (!video) throw new Error('Camera preview is unavailable.')
      video.srcObject = stream
      await video.play()

      const detector = await createFaceDetector()
      if (generationRef.current !== generation) {
        closeFaceDetector(detector)
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      detectorRef.current = detector
      setIsStarting(false)
      setIsRunning(true)
      startPendingRef.current = false
      lastDetectionRef.current = 0

      const detectFrame = (timestamp: number) => {
        if (generationRef.current !== generation || !detectorRef.current) return
        if (timestamp - lastDetectionRef.current >= 100) {
          lastDetectionRef.current = timestamp
          try {
            setFaces(detectFaces(detector, video, timestamp).faces)
          } catch (error) {
            stopCamera()
            setCameraError(
              error instanceof Error ? error.message : 'Face detection stopped unexpectedly.',
            )
            return
          }
        }
        frameRef.current = window.requestAnimationFrame(detectFrame)
      }
      frameRef.current = window.requestAnimationFrame(detectFrame)
    } catch (error) {
      if (generationRef.current === generation) {
        stopCamera()
        setCameraError(cameraErrorMessage(error))
      }
    } finally {
      startPendingRef.current = false
      if (mountedRef.current) {
        setIsStarting(false)
      }
    }
  }

  const confirmAttendance = async () => {
    if (!selectedSession || pendingStudents.length === 0) return
    setActionError(null)
    setActionSuccess(null)
    setIsSaving(true)

    const results = await Promise.allSettled(
      pendingStudents.map((student) =>
        checkInWithCode({
          code: selectedSession.code,
          studentEmail: student.studentEmail,
          studentName: student.studentName,
          rollNumber: student.studentId === '-' ? '' : student.studentId,
        }),
      ),
    )
    const savedEmails = new Set<string>()
    const failures: string[] = []
    results.forEach((result, index) => {
      const student = pendingStudents[index]
      if (result.status === 'fulfilled') {
        savedEmails.add(student.studentEmail.toLowerCase())
      } else {
        failures.push(
          `${student.studentName}: ${
            result.reason instanceof Error ? result.reason.message : 'Could not save attendance.'
          }`,
        )
      }
    })

    if (savedEmails.size > 0) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['attendance-checkins', selectedSession.id] }),
        queryClient.invalidateQueries({ queryKey: ['attendance-sessions'] }),
        queryClient.invalidateQueries({ queryKey: ['staff-roster'] }),
        queryClient.invalidateQueries({ queryKey: ['subjects'] }),
        queryClient.invalidateQueries({ queryKey: ['attendance-records'] }),
      ])
      setSelectedEmails((current) => {
        const next = new Set(current)
        savedEmails.forEach((studentEmail) => next.delete(studentEmail))
        return next
      })
      setActionSuccess(
        `Attendance confirmed for ${savedEmails.size} student${savedEmails.size === 1 ? '' : 's'}.`,
      )
    }
    if (failures.length > 0) {
      setActionError(
        `${failures.length} student${failures.length === 1 ? '' : 's'} could not be marked: ${failures.join('; ')}`,
      )
    }
    setIsSaving(false)
  }

  return (
    <Card
      title="Camera-assisted attendance"
      description="Face detection is a visual aid only. Staff must verify each student in the roster."
    >
      {!isAttendanceSyncConfigured ? (
        <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {ATTENDANCE_SETUP_MESSAGE}
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="camera-attendance-subject" className="mb-1 block text-xs font-medium text-slate-600">
                Subject
              </label>
              <select
                id="camera-attendance-subject"
                value={selectedSubject ? subjectKey(selectedSubject.name, selectedSubject.code) : ''}
                onChange={(event) => {
                  setSubjectKeyValue(event.target.value)
                  setSessionId('')
                  setSelectedEmails(new Set())
                  setActionError(null)
                  setActionSuccess(null)
                }}
                className={inputClass}
                disabled={subjects.length === 0}
              >
                {subjects.length === 0 && <option value="">No subjects assigned</option>}
                {subjects.map((subject) => (
                  <option key={subjectKey(subject.name, subject.code)} value={subjectKey(subject.name, subject.code)}>
                    {subject.name}{subject.code ? ` (${subject.code})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="camera-attendance-session" className="mb-1 block text-xs font-medium text-slate-600">
                Open attendance session
              </label>
              <select
                id="camera-attendance-session"
                value={selectedSession?.id ?? ''}
                onChange={(event) => {
                  setSessionId(event.target.value)
                  setSelectedEmails(new Set())
                }}
                className={inputClass}
                disabled={activeSessions.length === 0}
              >
                {activeSessions.length === 0 ? (
                  <option value="">No open session for this subject</option>
                ) : (
                  activeSessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {session.code} · started {new Date(session.createdAt).toLocaleString()}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {sessionsLoading && <p className="mt-3 text-xs text-slate-500">Loading attendance sessions...</p>}
          {sessionsError && (
            <p role="alert" className="mt-3 text-xs text-rose-600">
              {sessionsQueryError instanceof Error ? sessionsQueryError.message : 'Could not load attendance sessions.'}
            </p>
          )}

          {selectedSession ? (
            <>
              <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <section aria-label="Webcam face detection">
                  <div className="relative aspect-video overflow-hidden rounded-2xl bg-slate-950">
                    <video
                      ref={videoRef}
                      muted
                      playsInline
                      aria-label="Live webcam preview"
                      className="absolute inset-0 h-full w-full scale-x-[-1] object-cover"
                    />
                    {!isRunning && !isStarting && (
                      <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-slate-300">
                        Start the camera when you are ready. Video stays on this device.
                      </div>
                    )}
                    {faces.map((face, index) => (
                      <div
                        key={`${index}-${Math.round(face.x)}-${Math.round(face.y)}`}
                        className="pointer-events-none absolute rounded-lg border-2 border-emerald-400 shadow-[0_0_0_1px_rgba(15,23,42,0.55)]"
                        style={faceBoxStyle(face, videoRef.current)}
                        aria-hidden="true"
                      />
                    ))}
                    {isStarting && (
                      <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 text-sm font-medium text-white">
                        Starting camera and face detection...
                      </div>
                    )}
                    {(isRunning || isStarting) && (
                      <div className="absolute left-3 top-3">
                        <Badge tone="success">{faces.length} face{faces.length === 1 ? '' : 's'} detected</Badge>
                      </div>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void startCamera()}
                      disabled={isStarting || isRunning}
                      className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
                    >
                      {isStarting ? 'Starting...' : 'Start Camera'}
                    </button>
                    {(isRunning || isStarting) && (
                      <button
                        type="button"
                        onClick={() => stopCamera()}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Stop Camera
                      </button>
                    )}
                  </div>
                  {cameraError && (
                    <p role="alert" className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">
                      {cameraError}
                    </p>
                  )}
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">
                    The browser processes live frames locally. No photos, video, face identities, or biometric data are saved.
                  </p>
                </section>

                <section aria-labelledby="camera-roster-heading">
                  <div className="flex items-center justify-between gap-2">
                    <h3 id="camera-roster-heading" className="text-sm font-semibold text-slate-900">
                      Student roster
                    </h3>
                    <Badge tone="neutral">{pendingStudents.length} selected</Badge>
                  </div>
                  {checkInsLoading ? (
                    <p className="mt-3 text-sm text-slate-500">Loading session attendance...</p>
                  ) : checkInsError ? (
                    <p role="alert" className="mt-3 text-sm text-rose-600">
                      {checkInsQueryError instanceof Error ? checkInsQueryError.message : 'Could not load session attendance.'}
                    </p>
                  ) : subjectRoster.length === 0 ? (
                    <div className="mt-3">
                      <EmptyState
                        title="No enrolled students for this subject."
                        description="Students appear here after enrolling in this subject."
                      />
                    </div>
                  ) : (
                    <ul className="mt-3 max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
                      {subjectRoster.map((student) => {
                        const studentEmail = student.studentEmail.toLowerCase()
                        const isCheckedIn = checkedInEmails.has(studentEmail)
                        return (
                          <li key={studentEmail}>
                            <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-slate-50">
                              <input
                                type="checkbox"
                                checked={isCheckedIn || selectedEmails.has(studentEmail)}
                                disabled={isCheckedIn || checkInsError || isSaving}
                                onChange={(event) => {
                                  setSelectedEmails((current) => {
                                    const next = new Set(current)
                                    if (event.target.checked) next.add(studentEmail)
                                    else next.delete(studentEmail)
                                    return next
                                  })
                                }}
                                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-slate-800">{student.studentName}</span>
                                <span className="block truncate text-xs text-slate-500">
                                  {student.studentId !== '-' ? `${student.studentId} · ` : ''}{student.studentEmail}
                                </span>
                              </span>
                              {isCheckedIn && <Badge tone="success">Present</Badge>}
                            </label>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </section>
              </div>

              <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-indigo-900">
                  Review selected students
                </h3>
                {pendingStudents.length === 0 ? (
                  <p className="mt-1 text-sm text-slate-600">Select and verify each student in the roster before confirming.</p>
                ) : (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {pendingStudents.map((student) => (
                      <li key={student.studentEmail} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700">
                        {student.studentName}
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  onClick={() => void confirmAttendance()}
                  disabled={
                    !selectedSession ||
                    pendingStudents.length === 0 ||
                    isSaving ||
                    checkInsLoading ||
                    checkInsError
                  }
                  className="mt-3 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  {isSaving ? 'Saving attendance...' : `Confirm Attendance${pendingStudents.length ? ` · ${pendingStudents.length}` : ''}`}
                </button>
              </div>

              {actionSuccess && (
                <p role="status" className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  {actionSuccess}
                </p>
              )}
              {actionError && (
                <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {actionError}
                </p>
              )}
            </>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
              Start a live attendance session for this subject above before marking students present here.
            </div>
          )}

          <p className="mt-4 border-t border-slate-100 pt-3 text-[11px] leading-relaxed text-slate-500">
            Prototype access is limited by the staff route guard in this app. The current local authentication does not provide a trusted user identity to database RPCs; frontend role checks alone are not server-side authorization.
          </p>
        </>
      )}
    </Card>
  )
}
