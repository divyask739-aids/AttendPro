import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { BrowserQRCodeReader } from '@zxing/browser'

import { Badge } from '@/components/ui/Badge'
import { Card, EmptyState } from '@/components/ui/Card'
import {
  confirmLocalStaffAttendance,
  hasLocalAttendanceRecord,
} from '@/lib/dataApi'
import {
  closeFaceDetector,
  createFaceDetector,
  detectFaces,
  isFaceDetectionSupported,
  type DetectedFace,
} from '@/lib/faceDetection'
import { isoToday } from '@/lib/date'
import { matchesSubjectKey, subjectKey } from '@/lib/subjectKey'
import type {
  StaffSubject,
  StudentAttendanceRow,
  StudentVerificationStatus,
} from '@/types'

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

function getVerificationStatus(student: StudentAttendanceRow): StudentVerificationStatus {
  return student.verificationStatus ?? 'not_submitted'
}

function verificationLabel(status: StudentVerificationStatus): string {
  return status === 'verified'
    ? 'Verified'
    : status === 'pending'
      ? 'Pending verification'
      : status === 'rejected'
        ? 'Rejected'
        : 'Not submitted'
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
  const selectedSubjectKey = useRef('')
  const [subjectKeyValue, setSubjectKeyValue] = useState('')
  const [sessionDate, setSessionDate] = useState(isoToday)
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(() => new Set())
  const [faces, setFaces] = useState<DetectedFace[]>([])
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [qrError, setQrError] = useState<string | null>(null)
  const [scannedStudent, setScannedStudent] = useState<StudentAttendanceRow | null>(null)
  const [scanMessage, setScanMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const detectorRef = useRef<Awaited<ReturnType<typeof createFaceDetector>> | null>(null)
  const scannerRef = useRef<BrowserQRCodeReader | null>(null)
  const scannerControlsRef = useRef<{ stop: () => void } | null>(null)
  const frameRef = useRef<number | null>(null)
  const generationRef = useRef(0)
  const lastScannedCodeRef = useRef('')
  const startPendingRef = useRef(false)
  const lastDetectionRef = useRef(0)
  const mountedRef = useRef(false)

  const selectedSubject =
    subjects.find((subject) => subjectKey(subject.name, subject.code) === subjectKeyValue) ??
    subjects[0]
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
      setSelectedEmails(new Set())
      setActionError(null)
      setActionSuccess(null)
      setScannedStudent(null)
      setScanMessage(null)
    }
  }, [selectedSubject])

  useEffect(() => {
    setSelectedEmails(new Set())
    setActionError(null)
    setActionSuccess(null)
    setScannedStudent(null)
    setScanMessage(null)
  }, [sessionDate, subjectKeyValue])

  const checkedInEmails = useMemo(() => {
    if (!selectedSubject) return new Set<string>()
    return new Set(
      subjectRoster
        .filter((student) =>
          hasLocalAttendanceRecord(student.studentEmail, student.subjectId, sessionDate),
        )
        .map((student) => student.studentEmail.toLowerCase()),
    )
  }, [selectedSubject, sessionDate, subjectRoster])
  const pendingStudents = useMemo(
    () =>
      subjectRoster.filter(
        (student) =>
          selectedEmails.has(student.studentEmail.toLowerCase()) &&
          getVerificationStatus(student) === 'verified' &&
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
    scannerControlsRef.current?.stop()
    scannerControlsRef.current = null
    scannerRef.current = null
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
  }, [sessionDate, subjectKeyValue, stopCamera])

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
    lastScannedCodeRef.current = ''
    setCameraError(null)
    setQrError(null)
    setScannedStudent(null)
    setScanMessage(null)
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

      try {
        const reader = new BrowserQRCodeReader()
        scannerRef.current = reader
        const controls = await reader.decodeFromVideoElement(video, (result, error) => {
          if (generationRef.current !== generation) return
          if (
            error &&
            !['NotFoundException', 'FormatException', 'ChecksumException'].includes(error.getKind())
          ) {
            setQrError(`QR scanning stopped: ${error.message}`)
            scannerControlsRef.current?.stop()
            return
          }
          if (!result) return

          const value = result.getText()
          if (lastScannedCodeRef.current === value) return
          lastScannedCodeRef.current = value
          const studentId = value.startsWith('ATTENDPRO:STUDENT:')
            ? value.slice('ATTENDPRO:STUDENT:'.length)
            : ''
          const match = subjectRoster.find((student) => student.studentId === studentId)
          setScannedStudent(match ?? null)
          setScanMessage(
            match
              ? `Scanned ${match.studentName} (${match.studentId}). Check the displayed details and verify the status before selecting.`
              : studentId
                ? 'Student ID was not found in this subject roster.'
                : 'This QR code is not an AttendPro student code.',
          )
        })
        if (generationRef.current === generation) {
          scannerControlsRef.current = controls
        } else {
          controls.stop()
        }
      } catch (error) {
        setQrError(
          error instanceof Error ? `QR scanner could not start: ${error.message}` : 'QR scanner could not start.',
        )
      }
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
    if (!selectedSubject || pendingStudents.length === 0) return
    setActionError(null)
    setActionSuccess(null)
    setIsSaving(true)

    try {
      const results = await Promise.allSettled(
        pendingStudents.map((student) =>
          confirmLocalStaffAttendance(email, student.studentEmail, student.subjectId, sessionDate),
        ),
      )
      const savedEmails = new Set<string>()
      const failures: string[] = []
      results.forEach((result, index) => {
        const student = pendingStudents[index]
        if (!student) return
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
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card
      title="Camera-assisted attendance"
      description="Face detection and QR scanning are local visual aids. Staff must verify each student before saving."
    >
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
              setSelectedEmails(new Set())
              setScannedStudent(null)
              setScanMessage(null)
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
          <label htmlFor="camera-attendance-date" className="mb-1 block text-xs font-medium text-slate-600">
            Attendance session date
          </label>
          <input
            id="camera-attendance-date"
            type="date"
            value={sessionDate}
            onChange={(event) => setSessionDate(event.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <section aria-label="Webcam face detection and QR scanning">
          <div className="relative aspect-video overflow-hidden rounded-2xl bg-slate-950">
            <video
              ref={videoRef}
              muted
              playsInline
              aria-label="Live webcam preview for face detection and student QR scanning"
              className="absolute inset-0 h-full w-full scale-x-[-1] object-cover"
            />
            {!isRunning && !isStarting && (
              <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-slate-300">
                Start the camera when you are ready. Preview and detection stay on this device.
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
                Starting camera, face detection, and QR scanner...
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
              disabled={isStarting || isRunning || subjects.length === 0}
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
          {qrError && (
            <p role="alert" className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {qrError}
            </p>
          )}
          {scanMessage && (
            <p role="status" className="mt-2 rounded-xl bg-indigo-50 px-3 py-2 text-xs text-indigo-800">
              {scanMessage}
            </p>
          )}
          {scannedStudent && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
              <div className="min-w-0 text-xs text-indigo-900">
                <p className="font-semibold">{scannedStudent.studentName} · {scannedStudent.studentId}</p>
                <p className="mt-1">
                  Roll {scannedStudent.rollNumber || '—'} · {scannedStudent.department || 'Department not set'}
                </p>
                <p className="mt-1">
                  Verification: {verificationLabel(getVerificationStatus(scannedStudent))}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const key = scannedStudent.studentEmail.toLowerCase()
                  setSelectedEmails((current) => new Set(current).add(key))
                }}
                disabled={
                  getVerificationStatus(scannedStudent) !== 'verified' ||
                  checkedInEmails.has(scannedStudent.studentEmail.toLowerCase()) ||
                  isSaving
                }
                className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
              >
                {getVerificationStatus(scannedStudent) !== 'verified'
                  ? 'Verification required'
                  : checkedInEmails.has(scannedStudent.studentEmail.toLowerCase())
                  ? 'Already present'
                  : 'Select for review'}
              </button>
            </div>
          )}
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            Face boxes indicate detected faces only; they never identify a person. Face frames are processed locally and are not captured, stored, or uploaded. QR codes contain only the student ID.
          </p>
        </section>

        <section aria-labelledby="camera-roster-heading">
          <div className="flex items-center justify-between gap-2">
            <h3 id="camera-roster-heading" className="text-sm font-semibold text-slate-900">
              Student roster
            </h3>
            <Badge tone="neutral">{pendingStudents.length} selected</Badge>
          </div>
          {subjectRoster.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                title="No enrolled students for this subject."
                description="Students appear here when their local student account has this subject."
              />
            </div>
          ) : (
            <ul className="mt-3 max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
              {subjectRoster.map((student) => {
                const studentEmail = student.studentEmail.toLowerCase()
                const alreadyPresent = checkedInEmails.has(studentEmail)
                const isVerified = getVerificationStatus(student) === 'verified'
                return (
                  <li key={studentEmail}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={alreadyPresent || selectedEmails.has(studentEmail)}
                        disabled={alreadyPresent || !isVerified || isSaving}
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
                          {student.studentId !== '-' ? `${student.studentId} · ` : ''}Roll {student.rollNumber || '—'} · {student.studentEmail}
                        </span>
                      </span>
                      {alreadyPresent && <Badge tone="success">Present</Badge>}
                      {!alreadyPresent && (
                        <Badge tone={isVerified ? 'success' : 'warning'}>
                          {verificationLabel(getVerificationStatus(student))}
                        </Badge>
                      )}
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
          <p className="mt-1 text-sm text-slate-600">Scan a student QR code or select and visually verify students in the roster.</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {pendingStudents.map((student) => (
              <li key={student.studentEmail} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700">
                {student.studentName} · Roll {student.rollNumber || '—'} · {student.studentId}
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={() => void confirmAttendance()}
          disabled={!selectedSubject || !sessionDate || pendingStudents.length === 0 || isSaving}
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

      <p className="mt-4 border-t border-slate-100 pt-3 text-[11px] leading-relaxed text-slate-500">
        Camera confirmations write staff-confirmed attendance records to the existing local attendance storage. Local data is limited to this browser and does not synchronize to other devices.
      </p>
    </Card>
  )
}
