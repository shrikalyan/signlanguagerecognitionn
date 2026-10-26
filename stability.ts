/**
 * Turns noisy per-frame predictions into confirmed signs.
 * - a sign must be the same, above the confidence threshold, for `stableFrames` frames
 * - after a sign is confirmed, the same sign is blocked until the hand leaves the
 *   frame (or a different sign is shown) AND the cooldown has passed
 */
export class StableFilter {
  private candidate: string | null = null
  private count = 0
  private committed: string | null = null
  private armed = true
  private lastCommit = -Infinity
  private lastSeen = -Infinity

  stableFrames: number
  cooldownMs: number
  minConfidence: number
  releaseMs: number

  constructor(stableFrames = 10, cooldownMs = 1200, minConfidence = 0.8, releaseMs = 400) {
    this.stableFrames = stableFrames
    this.cooldownMs = cooldownMs
    this.minConfidence = minConfidence
    this.releaseMs = releaseMs
  }

  update(id: string | null, confidence: number, now: number): { progress: number; commit: string | null } {
    const key = id && confidence >= this.minConfidence ? id : null
    if (key) this.lastSeen = now
    else if (now - this.lastSeen > this.releaseMs) { this.committed = null; this.armed = true }

    if (!key) { this.candidate = null; this.count = 0; return { progress: 0, commit: null } }
    if (key === this.candidate) this.count++
    else { this.candidate = key; this.count = 1; if (key !== this.committed) this.armed = true }

    if (this.count >= this.stableFrames && this.armed && now - this.lastCommit >= this.cooldownMs) {
      this.armed = false
      this.committed = key
      this.lastCommit = now
      return { progress: 1, commit: key }
    }
    return { progress: Math.min(1, this.count / this.stableFrames), commit: null }
  }

  reset() {
    this.candidate = null; this.count = 0; this.committed = null; this.armed = true
    this.lastCommit = -Infinity; this.lastSeen = -Infinity
  }
}
