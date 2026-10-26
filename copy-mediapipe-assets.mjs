// Copies the MediaPipe WASM runtime from node_modules into public/ so the app
// serves it from your own origin (no CDN, works offline once loaded).
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
const dest = join(root, 'public', 'mediapipe', 'wasm')

if (!existsSync(src)) {
  console.error('[gesturevoice] @mediapipe/tasks-vision is not installed yet. Run "npm install" first.')
  process.exit(1)
}
mkdirSync(dest, { recursive: true })
cpSync(src, dest, { recursive: true })
console.log('[gesturevoice] MediaPipe WASM runtime copied to public/mediapipe/wasm')
