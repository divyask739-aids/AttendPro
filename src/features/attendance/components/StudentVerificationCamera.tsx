import { useCallback, useEffect, useRef, useState } from 'react'

import { Badge } from '@/components/ui/Badge'
import {
  closeFaceDetector,
  createFaceDetector,
  detectFaces,
  isFaceDetectionSupported,
  type DetectedFace,
} from '@/lib/faceDetection'

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

export function StudentVerificationCamera() {
  const [faces, setFaces] = useState<DetectedFace[]>([])
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const detectorRef = useRef<Awaited<ReturnType<typeof createFaceDetector>> | null>(null)
  const frameRef = useRef<number | null>(null)
  const generationRef = useRef(0)
  const lastDetectionRef = useRef(0)
  const startPendingRef = useRef(false)
  const mountedRef = useRef(false)

  const stopCamera = useCallback((updateState = true) => {
    generationRef.current += 1
    startPendingRef.current = false
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    closeFaceDetector(detectorRef.current)
    detectorRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null

    if (updateState) {
      setIsStarting(false)
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
    setFaces([])
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
      setIsRunning(true)
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
      if (generationRef.current === generation) {
        startPendingRef.current = false
        if (mountedRef.current) setIsStarting(false)
      }
    }
  }

  return (
    <section aria-labelledby="student-camera-heading">
      <h2 id="student-camera-heading" className="text-sm font-semibold text-slate-900">
        Camera face-presence check
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        Face detection only confirms that a face is visible. It does not identify you or prove your identity.
      </p>
      <div className="relative mt-3 aspect-video overflow-hidden rounded-2xl bg-slate-950">
        <video
          ref={videoRef}
          muted
          playsInline
          aria-label="Live camera preview for face presence detection"
          className="absolute inset-0 h-full w-full scale-x-[-1] object-cover"
        />
        {!isRunning && !isStarting && (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-slate-300">
            Start the camera to check for a visible face.
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
        {isRunning && (
          <div className="absolute left-3 top-3" role="status" aria-live="polite">
            <Badge tone={faces.length > 0 ? 'success' : 'warning'}>
              {faces.length === 0
                ? 'No face detected'
                : faces.length === 1
                  ? 'Face detected'
                  : `Multiple faces detected (${faces.length})`}
            </Badge>
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
        Camera frames remain on this device. No photograph is captured, saved, or uploaded.
      </p>
    </section>
  )
}
