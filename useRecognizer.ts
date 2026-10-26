import { useCallback, useEffect, useRef, useState } from 'react'
import { DrawingUtils, FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import { classifyBuiltin, type P3 } from '../recognition/classifier.ts'
import { buildModel, matchCustom, vectorize, type CustomModel, type Store } from '../recognition/custom.ts'
import { StableFilter } from '../recognition/stability.ts'

const base = import.meta.env.BASE_URL
const MODEL_URL = `${base}models/hand_landmarker.task`
const WASM_URL = `${base}mediapipe/wasm`
export const CONFIDENCE = 0.8
const FRAME_MS = 33 // ~30 inferences per second at most

export type ModelState = { phase: 'idle' | 'loading' | 'ready' | 'error'; progress: number; message?: string }
export type CameraState = 'off' | 'requesting' | 'on' | 'denied' | 'missing' | 'error'
export interface Live { handPresent: boolean; label: string; confidence: number; progress: number }
export interface Confirmed { id: string; text: string; custom: boolean }

async function fetchWithProgress(url: string, onProgress: (p: number) => void): Promise<Uint8Array> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Model file not found (${res.status}) at ${url}`)
  const total = Number(res.headers.get('content-length')) || 0
  if (!res.body) return new Uint8Array(await res.arrayBuffer())
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let got = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value); got += value.length
    if (total) onProgress(got / total)
  }
  const out = new Uint8Array(got)
  let o = 0
  for (const c of chunks) { out.set(c, o); o += c.length }
  onProgress(1)
  return out
}

export function useRecognizer(onConfirm: (c: Confirmed) => void, customStore: Store) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const landmarker = useRef<HandLandmarker | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const raf = useRef(0)
  const filter = useRef(new StableFilter(10, 1200, CONFIDENCE))
  const model = useRef<CustomModel>({ labels: [] })
  const onConfirmRef = useRef(onConfirm)
  const recording = useRef<{ label: string; left: number; samples: number[][]; done: (s: number[][]) => void } | null>(null)
  const lastFrame = useRef(0)
  const lastVideoTime = useRef(-1)
  const frameSkip = useRef(0)

  const [modelState, setModelState] = useState<ModelState>({ phase: 'idle', progress: 0 })
  const [camera, setCamera] = useState<CameraState>('off')
  const [running, setRunning] = useState(false)
  const [live, setLive] = useState<Live>({ handPresent: false, label: '', confidence: 0, progress: 0 })
  const [recordLeft, setRecordLeft] = useState(0)

  useEffect(() => { onConfirmRef.current = onConfirm }, [onConfirm])
  useEffect(() => { model.current = buildModel(customStore) }, [customStore])

  const loadModel = useCallback(async () => {
    if (landmarker.current) return landmarker.current
    setModelState({ phase: 'loading', progress: 0 })
    try {
      const buffer = await fetchWithProgress(MODEL_URL, (p) => setModelState({ phase: 'loading', progress: p }))
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL)
      const make = (delegate: 'GPU' | 'CPU') =>
        HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetBuffer: buffer, delegate },
          runningMode: 'VIDEO',
          numHands: 1,
          minHandDetectionConfidence: 0.6,
          minHandPresenceConfidence: 0.6,
          minTrackingConfidence: 0.5,
        })
      try { landmarker.current = await make('GPU') } catch { landmarker.current = await make('CPU') }
      setModelState({ phase: 'ready', progress: 1 })
      return landmarker.current
    } catch (e) {
      setModelState({ phase: 'error', progress: 0, message: e instanceof Error ? e.message : String(e) })
      return null
    }
  }, [])

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(raf.current)
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    const c = canvasRef.current
    c?.getContext('2d')?.clearRect(0, 0, c.width, c.height)
  }, [])

  const stop = useCallback(() => {
    stopCamera()
    recording.current = null
    setRecordLeft(0)
    setRunning(false)
    setCamera('off')
    setLive({ handPresent: false, label: '', confidence: 0, progress: 0 })
    filter.current.reset()
  }, [stopCamera])

  const loop = useCallback(() => {
    raf.current = requestAnimationFrame(loop)
    const video = videoRef.current, canvas = canvasRef.current, lm = landmarker.current
    if (!video || !canvas || !lm || video.readyState < 2) return
    const now = performance.now()
    if (now - lastFrame.current < FRAME_MS || video.currentTime === lastVideoTime.current) return
    lastFrame.current = now
    lastVideoTime.current = video.currentTime
    try {
      const res = lm.detectForVideo(video, now)
      const ctx = canvas.getContext('2d')!
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const pts = res.landmarks[0]
      const world = res.worldLandmarks[0] as P3[] | undefined
      if (!pts || !world) {
        const r = filter.current.update(null, 0, now)
        setLive((p) => (p.handPresent || p.progress ? { handPresent: false, label: '', confidence: 0, progress: r.progress } : p))
        return
      }
      const du = new DrawingUtils(ctx)
      du.drawConnectors(pts, HandLandmarker.HAND_CONNECTIONS, { color: '#2dd4bf', lineWidth: 3 })
      du.drawLandmarks(pts, { color: '#e8eef9', fillColor: '#0a101c', lineWidth: 1, radius: 3 })

      const rec = recording.current
      if (rec) {
        if (++frameSkip.current % 3 === 0) {
          rec.samples.push(vectorize(world)); rec.left--
          setRecordLeft(rec.left)
          if (rec.left <= 0) { recording.current = null; rec.done(rec.samples) }
        }
        setLive({ handPresent: true, label: `Recording “${rec.label}”`, confidence: 1, progress: 0 })
        return
      }

      const builtin = classifyBuiltin(world)
      const custom = matchCustom(world, model.current)
      const useCustom = custom && custom.confidence > builtin.confidence
      const id = useCustom ? `custom:${custom.label}` : builtin.id
      const label = useCustom ? custom.label : builtin.label
      const confidence = useCustom ? custom.confidence : builtin.confidence
      const text = useCustom ? custom.label : builtin.text
      const r = filter.current.update(id, confidence, now)
      setLive({ handPresent: true, label, confidence, progress: r.progress })
      if (r.commit) onConfirmRef.current({ id: r.commit, text, custom: !!useCustom })
    } catch (e) {
      console.error('Inference error', e)
    }
  }, [])

  const start = useCallback(async () => {
    if (running) return
    if (!navigator.mediaDevices?.getUserMedia) { setCamera('error'); return }
    setCamera('requesting')
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false })
      stream.current = s
      const v = videoRef.current!
      v.srcObject = s
      await v.play()
      const c = canvasRef.current!
      c.width = v.videoWidth || 640; c.height = v.videoHeight || 480
      setCamera('on')
    } catch (e) {
      const name = e instanceof DOMException ? e.name : ''
      setCamera(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'missing' : 'error')
      stopCamera()
      return
    }
    const lm = await loadModel()
    if (!lm) { stopCamera(); setCamera('off'); return }
    filter.current.reset()
    lastVideoTime.current = -1
    setRunning(true)
    raf.current = requestAnimationFrame(loop)
  }, [running, loadModel, loop, stopCamera])

  const record = useCallback((label: string, count: number) =>
    new Promise<number[][]>((resolve) => {
      frameSkip.current = 0
      recording.current = { label, left: count, samples: [], done: resolve }
      setRecordLeft(count)
    }), [])

  useEffect(() => () => {
    stopCamera()
    landmarker.current?.close()
    landmarker.current = null
  }, [stopCamera])

  return { videoRef, canvasRef, modelState, camera, running, live, recordLeft, start, stop, record }
}
