import { SIGNS, type Sign } from './vocab.ts'

export interface P3 { x: number; y: number; z: number }

const dist = (a: P3, b: P3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
const sig = (x: number) => 1 / (1 + Math.exp(-x))

export interface Features {
  /** Extension score 0..1 for thumb, index, middle, ring, pinky. */
  fingers: number[]
  thumbUp: number
  thumbDown: number
  pinch: number
}

/**
 * Turns 21 hand landmarks (MediaPipe *world* coordinates, metres, y pointing down)
 * into scale-invariant finger-extension features. Everything is relative to palm
 * size, so hand distance from the camera does not matter.
 */
export function features(l: P3[]): Features {
  const palm = Math.max(dist(l[0], l[9]), 1e-6)
  const fingers = [sig((dist(l[4], l[17]) / palm - 0.85) / 0.12)]
  const tips = [8, 12, 16, 20]
  const mcps = [5, 9, 13, 17]
  for (let i = 0; i < 4; i++) {
    const ratio = dist(l[tips[i]], l[0]) / Math.max(dist(l[mcps[i]], l[0]), 1e-6)
    fingers.push(sig((ratio - 1.4) / 0.12))
  }
  return {
    fingers,
    thumbUp: sig(((l[0].y - l[4].y) / palm - 0.7) / 0.15),
    thumbDown: sig(((l[4].y - l[0].y) / palm - 0.3) / 0.15),
    pinch: sig((0.4 - dist(l[4], l[8]) / palm) / 0.07),
  }
}

export function scoreSign(s: Sign, f: Features): number {
  if (s.variant === 'ok') return Math.min(f.pinch, f.fingers[2], f.fingers[3], f.fingers[4])
  let score = 1
  for (let i = 0; i < 5; i++) score = Math.min(score, s.fingers[i] ? f.fingers[i] : 1 - f.fingers[i])
  if (s.variant === 'up') score = Math.min(score, f.thumbUp)
  if (s.variant === 'down') score = Math.min(score, f.thumbDown)
  return score
}

export interface Prediction { id: string | null; text: string; label: string; confidence: number }

export function classifyBuiltin(l: P3[]): Prediction {
  const f = features(l)
  let best: Sign | null = null
  let bestScore = 0
  for (const s of SIGNS) {
    const sc = scoreSign(s, f)
    if (sc > bestScore) { bestScore = sc; best = s }
  }
  return best
    ? { id: best.id, text: best.text, label: best.label, confidence: bestScore }
    : { id: null, text: '', label: '', confidence: 0 }
}
