import type { P3 } from './classifier.ts'

/**
 * Optional k-nearest-neighbour classifier trained on the user's own recorded
 * samples. Samples are 63 numbers (21 landmarks x 3), wrist-relative and
 * palm-normalised. They never leave the browser (localStorage only).
 */
const KEY = 'gesturevoice-custom-v1'
export type Store = Record<string, number[][]>
export const MIN_SAMPLES = 15

export function loadStore(): Store {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') as Store } catch { return {} }
}
export function saveStore(s: Store) {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* storage unavailable */ }
}

export function vectorize(l: P3[]): number[] {
  const palm = Math.max(Math.hypot(l[0].x - l[9].x, l[0].y - l[9].y, l[0].z - l[9].z), 1e-6)
  const out: number[] = []
  for (const p of l) out.push((p.x - l[0].x) / palm, (p.y - l[0].y) / palm, (p.z - l[0].z) / palm)
  return out
}

const vd = (a: number[], b: number[]) => {
  let s = 0
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d }
  return Math.sqrt(s)
}

export interface CustomModel { labels: { label: string; samples: number[][]; threshold: number }[] }

export function buildModel(store: Store): CustomModel {
  const labels = Object.entries(store)
    .filter(([, s]) => s.length >= MIN_SAMPLES)
    .map(([label, samples]) => {
      // Leave-one-out nearest-neighbour spread decides how strict this label is.
      const nn = samples.map((a, i) => Math.min(...samples.filter((_, j) => j !== i).map((b) => vd(a, b))))
      const mean = nn.reduce((x, y) => x + y, 0) / nn.length
      return { label, samples, threshold: Math.max(0.35, mean * 2.5) }
    })
  return { labels }
}

export function matchCustom(l: P3[], model: CustomModel): { label: string; confidence: number } | null {
  if (!model.labels.length) return null
  const v = vectorize(l)
  let best: { label: string; ratio: number } | null = null
  for (const m of model.labels) {
    const ds = m.samples.map((s) => vd(v, s)).sort((a, b) => a - b).slice(0, 3)
    const ratio = ds.reduce((x, y) => x + y, 0) / ds.length / m.threshold
    if (!best || ratio < best.ratio) best = { label: m.label, ratio }
  }
  if (!best || best.ratio >= 1) return null
  return { label: best.label, confidence: 1 - 0.25 * best.ratio }
}
