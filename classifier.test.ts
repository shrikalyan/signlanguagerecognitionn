import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyBuiltin, type P3 } from '../src/recognition/classifier.ts'
import { SIGNS, type Sign } from '../src/recognition/vocab.ts'
import { StableFilter } from '../src/recognition/stability.ts'
import { buildModel, matchCustom, MIN_SAMPLES } from '../src/recognition/custom.ts'

// Rough anatomical hand in MediaPipe world coordinates (metres, y down), built
// from a sign's finger pattern. This checks the logic and plumbing; it does NOT
// replace testing with a real hand in front of a real webcam.
const MCP = [[-0.025, -0.09], [0, -0.095], [0.022, -0.09], [0.042, -0.078]]
function hand(s: Sign, jitter = 0): P3[] {
  const r = () => (Math.random() - 0.5) * jitter
  const p: P3[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }))
  const set = (i: number, x: number, y: number, z = 0) => { p[i] = { x: x + r(), y: y + r(), z: z + r() } }
  set(0, 0, 0)
  for (let f = 0; f < 4; f++) {
    const [mx, my] = MCP[f]
    const base = 5 + f * 4
    set(base, mx, my)
    if (s.variant === 'ok' && f === 0) { // index curls to meet the thumb
      set(base + 1, mx, my - 0.03); set(base + 2, mx, my - 0.025, 0.025); set(base + 3, mx - 0.005, my - 0.005, 0.04)
    } else if (s.fingers[f + 1]) {
      set(base + 1, mx, my - 0.04); set(base + 2, mx, my - 0.065); set(base + 3, mx, my - 0.087)
    } else {
      set(base + 1, mx, my - 0.03); set(base + 2, mx, my - 0.025, 0.025); set(base + 3, mx, my - 0.005, 0.04)
    }
  }
  set(1, -0.02, -0.02); set(2, -0.04, -0.04)
  if (s.variant === 'ok') { set(3, -0.04, -0.07, 0.03); set(4, -0.03, -0.09, 0.04) }
  else if (s.variant === 'up') { set(3, -0.05, -0.075); set(4, -0.055, -0.115) }
  else if (s.variant === 'down') { set(3, -0.05, 0.0); set(4, -0.055, 0.06) }
  else if (s.fingers[0]) { set(3, -0.075, -0.06); set(4, -0.105, -0.075) }
  else { set(3, -0.02, -0.055, 0.02); set(4, 0.0, -0.06, 0.03) }
  return p
}

for (const s of SIGNS) {
  test(`classifies "${s.label}" (${s.id})`, () => {
    const pred = classifyBuiltin(hand(s))
    assert.equal(pred.id, s.id)
    assert.ok(pred.confidence >= 0.8, `confidence ${pred.confidence}`)
  })
}

test('tolerates small landmark jitter', () => {
  let ok = 0, n = 0
  for (const s of SIGNS) for (let i = 0; i < 20; i++) { n++; if (classifyBuiltin(hand(s, 0.004)).id === s.id) ok++ }
  assert.ok(ok / n > 0.9, `only ${ok}/${n} correct under jitter`)
})

test('stability filter: commits once while held, never on flicker or low confidence', () => {
  const f = new StableFilter(10, 1200, 0.8)
  let t = 0, commits = 0
  for (let i = 0; i < 100; i++) { t += 33; if (f.update('yes', 0.95, t).commit) commits++ }
  assert.equal(commits, 1)

  const g = new StableFilter(10, 1200, 0.8); commits = 0; t = 0
  for (let i = 0; i < 100; i++) { t += 33; if (g.update(i % 2 ? 'yes' : 'no', 0.95, t).commit) commits++ }
  assert.equal(commits, 0)

  const h = new StableFilter(10, 1200, 0.8); commits = 0; t = 0
  for (let i = 0; i < 100; i++) { t += 33; if (h.update('yes', 0.6, t).commit) commits++ }
  assert.equal(commits, 0)
})

test('stability filter: same sign repeats only after the hand leaves and cooldown passes', () => {
  const f = new StableFilter(10, 1200, 0.8)
  let t = 0, commits = 0
  const run = (id: string | null, n: number) => { for (let i = 0; i < n; i++) { t += 33; if (f.update(id, id ? 0.95 : 0, t).commit) commits++ } }
  run('n1', 10)      // confirmed after 10 stable frames: commit 1 (t = 330 ms)
  run('n1', 20)      // still holding the same sign: no repeat
  assert.equal(commits, 1)
  run(null, 5)       // 165 ms gap: same gesture, must not re-arm
  run('n1', 10)
  assert.equal(commits, 1)
  run(null, 13)      // hand away > 400 ms: re-armed (cooldown already over here)
  run('n1', 10)      // new confirmation: commit 2
  assert.equal(commits, 2)
  const g = new StableFilter(10, 1200, 0.8); commits = 0; t = 0
  const runG = (id: string | null, n: number) => { for (let i = 0; i < n; i++) { t += 33; if (g.update(id, id ? 0.95 : 0, t).commit) commits++ } }
  runG('n1', 10)     // commit at 330 ms
  runG(null, 13)     // re-armed at ~760 ms
  runG('n1', 10)     // confirmed at ~1090 ms, inside the 1200 ms cooldown: blocked
  assert.equal(commits, 1)
  runG('n1', 20)     // cooldown expires while the sign is held: commit
  assert.equal(commits, 2)
})

test('custom kNN: recognises a recorded pose and rejects a different one', () => {
  const [a, b] = [SIGNS[4], SIGNS[7]]
  const model = buildModel({ Hello: Array.from({ length: MIN_SAMPLES + 5 }, () => {
    const h = hand(a, 0.004); return vec(h) }) })
  assert.equal(matchCustom(hand(a, 0.004), model)?.label, 'Hello')
  assert.equal(matchCustom(hand(b, 0.004), model), null)
})

import { vectorize } from '../src/recognition/custom.ts'
function vec(h: P3[]) { return vectorize(h) }
