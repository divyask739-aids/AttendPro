import type {
  Detection,
  FaceDetector,
  FaceDetectorOptions,
  FaceDetectorResult,
} from '@mediapipe/tasks-vision'

/**
 * Local, detection-only face foundation for staff camera attendance.
 *
 * MediaPipe reports face bounding boxes and confidence scores. This module
 * deliberately exposes no recognition, identity matching, embeddings, image
 * capture, or upload helpers, so camera frames never leave the browser.
 *
 * Assets are served from `public/mediapipe/`, resolved through the Vite base
 * path so GitHub Pages (`/AttendPro/`) and local development both work.
 */

type VisionModule = typeof import('@mediapipe/tasks-vision')

const basePath = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`

/** Directory passed to `FilesetResolver.forVisionTasks`. No trailing slash. */
export const FACE_DETECTION_WASM_PATH = `${basePath}mediapipe/wasm`

/** BlazeFace short-range model bundled with the app. */
export const FACE_DETECTION_MODEL_PATH = `${basePath}mediapipe/blaze_face_short_range.tflite`

export const DEFAULT_MIN_DETECTION_CONFIDENCE = 0.5
export const DEFAULT_MIN_SUPPRESSION_THRESHOLD = 0.3

export type FaceDetectionDelegate = 'GPU' | 'CPU'

export interface FaceDetectionOptions {
  /** Force a backend. When omitted the helper tries GPU, then CPU. */
  delegate?: FaceDetectionDelegate
  /** Minimum face detection confidence, 0-1. Defaults to 0.5. */
  minDetectionConfidence?: number
  /** Non-maximum-suppression threshold, 0-1. Defaults to 0.3. */
  minSuppressionThreshold?: number
}

/** A single detected face in source-video pixel coordinates. */
export interface DetectedFace {
  x: number
  y: number
  width: number
  height: number
  confidence: number
}

export interface FaceDetectionFrame {
  faces: DetectedFace[]
  faceCount: number
  timestampMs: number
}

let visionModulePromise: Promise<VisionModule> | null = null
let visionFilesetPromise: ReturnType<VisionModule['FilesetResolver']['forVisionTasks']> | null = null
let sharedDetectorPromise: Promise<FaceDetector> | null = null

/** MediaPipe requires strictly increasing video timestamps per detector. */
const lastTimestamps = new WeakMap<FaceDetector, number>()

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function loadVision(): Promise<VisionModule> {
  if (!visionModulePromise) {
    visionModulePromise = import('@mediapipe/tasks-vision').catch((error) => {
      visionModulePromise = null
      throw error
    })
  }
  return visionModulePromise
}

function loadVisionFileset(): ReturnType<VisionModule['FilesetResolver']['forVisionTasks']> {
  if (!visionFilesetPromise) {
    visionFilesetPromise = loadVision()
      .then(({ FilesetResolver }) => FilesetResolver.forVisionTasks(FACE_DETECTION_WASM_PATH))
      .catch((error) => {
        visionFilesetPromise = null
        throw error
      })
  }
  return visionFilesetPromise
}

async function buildDetector(
  options: FaceDetectionOptions,
  delegate: FaceDetectionDelegate,
): Promise<FaceDetector> {
  const [{ FaceDetector }, visionFileset] = await Promise.all([loadVision(), loadVisionFileset()])

  const detectorOptions = {
    baseOptions: {
      modelAssetPath: FACE_DETECTION_MODEL_PATH,
      delegate,
    },
    runningMode: 'VIDEO',
    minDetectionConfidence:
      options.minDetectionConfidence ?? DEFAULT_MIN_DETECTION_CONFIDENCE,
    minSuppressionThreshold:
      options.minSuppressionThreshold ?? DEFAULT_MIN_SUPPRESSION_THRESHOLD,
  } satisfies FaceDetectorOptions

  return FaceDetector.createFromOptions(visionFileset, detectorOptions)
}

/**
 * Creates a new MediaPipe FaceDetector configured for video frames.
 *
 * Callers own the returned instance and must call `closeFaceDetector` when the
 * camera stops. When `delegate` is omitted, GPU is attempted first and CPU is
 * used as a fallback for laptops without WebGL support.
 */
export async function createFaceDetector(
  options: FaceDetectionOptions = {},
): Promise<FaceDetector> {
  if (options.delegate) {
    return buildDetector(options, options.delegate)
  }

  try {
    return await buildDetector(options, 'GPU')
  } catch (gpuError) {
    try {
      return await buildDetector(options, 'CPU')
    } catch (cpuError) {
      throw new Error(
        `Unable to start face detection (${describeError(cpuError)}). GPU attempt: ${describeError(gpuError)}`,
      )
    }
  }
}

/**
 * Lazily creates one reusable detector for the whole app session.
 *
 * Options are applied on the first successful call only. Prefer this when the
 * camera is opened and closed repeatedly; use `createFaceDetector` when an
 * isolated instance is needed.
 */
export function getSharedFaceDetector(
  options: FaceDetectionOptions = {},
): Promise<FaceDetector> {
  if (!sharedDetectorPromise) {
    sharedDetectorPromise = createFaceDetector(options).catch((error) => {
      sharedDetectorPromise = null
      throw error
    })
  }
  return sharedDetectorPromise
}

function toFrame(result: FaceDetectorResult, timestampMs: number): FaceDetectionFrame {
  const faces = result.detections.map((detection: Detection): DetectedFace => {
    const box = detection.boundingBox
    return {
      x: box?.originX ?? 0,
      y: box?.originY ?? 0,
      width: box?.width ?? 0,
      height: box?.height ?? 0,
      confidence: detection.categories[0]?.score ?? 0,
    }
  })

  return { faces, faceCount: faces.length, timestampMs }
}

/**
 * Detects visible faces in the current video frame.
 *
 * Returns an empty frame while the video is not ready, so callers can poll on
 * every animation frame without guarding element state themselves. Coordinates
 * are in the video's intrinsic pixel space; scale them to the preview size when
 * drawing overlays.
 */
export function detectFaces(
  detector: FaceDetector,
  video: HTMLVideoElement,
  timestampMs: number = performance.now(),
): FaceDetectionFrame {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    return { faces: [], faceCount: 0, timestampMs }
  }
  if (video.videoWidth === 0 || video.videoHeight === 0) {
    return { faces: [], faceCount: 0, timestampMs }
  }

  // rAF timestamps can repeat; MediaPipe rejects non-increasing timestamps.
  const previous = lastTimestamps.get(detector) ?? -1
  const nextTimestamp = Math.max(Math.round(timestampMs), previous + 1)
  lastTimestamps.set(detector, nextTimestamp)

  return toFrame(detector.detectForVideo(video, nextTimestamp), nextTimestamp)
}

/** Releases detector resources. Safe to call with null and during cleanup. */
export function closeFaceDetector(detector: FaceDetector | null | undefined): void {
  if (!detector) return
  lastTimestamps.delete(detector)
  try {
    detector.close()
  } catch {
    // The detector may already be closed during unmount; cleanup must not throw.
  }
}

/** Closes the shared detector, if one was created. */
export async function closeSharedFaceDetector(): Promise<void> {
  const pending = sharedDetectorPromise
  sharedDetectorPromise = null
  if (!pending) return

  try {
    closeFaceDetector(await pending)
  } catch {
    // Initialisation failed, so there is nothing to release.
  }
}

/**
 * True when the runtime can load the WASM detector. Camera permission and
 * secure-context checks belong to the future camera hook.
 */
export function isFaceDetectionSupported(): boolean {
  return typeof window !== 'undefined' && typeof WebAssembly !== 'undefined'
}
