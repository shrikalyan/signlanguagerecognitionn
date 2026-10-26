import { useCallback, useEffect, useRef, useState } from 'react'
import HandIcon from './components/HandIcon.tsx'
import { CONFIDENCE, useRecognizer, type Confirmed } from './hooks/useRecognizer.ts'
import { MIN_SAMPLES, loadStore, saveStore, type Store } from './recognition/custom.ts'
import { SIGNS, SIGN_BY_ID } from './recognition/vocab.ts'

const btn = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-lg px-5 text-base font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40'
const primary = `${btn} bg-teal text-ink hover:bg-teal/85`
const secondary = `${btn} border border-line bg-raised text-text hover:border-teal`

function join(prev: string, add: string, numeral: boolean) {
  if (!prev) return add
  return numeral && /\d$/.test(prev) ? prev + add : `${prev} ${add}`
}

function Chip({ ok, children }: { ok: boolean | null; children: React.ReactNode }) {
  const mark = ok === null ? '…' : ok ? '✓' : '✕'
  const tone = ok === null ? 'text-warn' : ok ? 'text-teal' : 'text-bad'
  return (
    <li className="flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1.5 text-sm">
      <span aria-hidden className={`font-bold ${tone}`}>{mark}</span>
      <span>{children}</span>
    </li>
  )
}

export default function App() {
  const [text, setText] = useState('')
  const textRef = useRef('')
  const history = useRef<string[]>([])
  const [canUndo, setCanUndo] = useState(false)
  const [announce, setAnnounce] = useState('')
  const [store, setStore] = useState<Store>(() => loadStore())
  const [teachName, setTeachName] = useState('')

  const commit = useCallback((next: string) => {
    history.current.push(textRef.current)
    if (history.current.length > 100) history.current.shift()
    textRef.current = next
    setText(next)
    setCanUndo(true)
  }, [])

  const onConfirm = useCallback((c: Confirmed) => {
    const sign = SIGN_BY_ID.get(c.id)
    commit(join(textRef.current, c.text, !!sign?.isNumeral))
    setAnnounce(`Added ${c.text}`)
  }, [commit])

  const rec = useRecognizer(onConfirm, store)
  const { modelState, camera, running, live, recordLeft } = rec

  const undo = () => {
    const prev = history.current.pop()
    if (prev === undefined) return
    textRef.current = prev; setText(prev); setCanUndo(history.current.length > 0)
  }
  const clear = () => { if (textRef.current) commit('') }

  // ---- speech ----
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [voiceURI, setVoiceURI] = useState('')
  const [speaking, setSpeaking] = useState(false)
  const lastSpoken = useRef('')
  useEffect(() => {
    if (!synth) return
    const load = () => {
      const v = synth.getVoices()
      setVoices(v)
      setVoiceURI((cur) => cur || (v.find((x) => x.lang === 'en-IN') ?? v.find((x) => x.lang.startsWith('en')) ?? v[0])?.voiceURI || '')
    }
    load()
    synth.addEventListener('voiceschanged', load)
    return () => { synth.removeEventListener('voiceschanged', load); synth.cancel() }
  }, [synth])

  const speak = (message: string) => {
    if (!synth || !message.trim()) return
    synth.cancel()
    const u = new SpeechSynthesisUtterance(message)
    const v = voices.find((x) => x.voiceURI === voiceURI)
    if (v) { u.voice = v; u.lang = v.lang }
    u.onstart = () => setSpeaking(true)
    u.onend = u.onerror = () => setSpeaking(false)
    lastSpoken.current = message
    synth.speak(u)
  }

  // ---- teaching custom signs ----
  const teach = async () => {
    const name = teachName.trim()
    if (!name || !running) return
    const samples = await rec.record(name, 30)
    setStore((s) => { const next = { ...s, [name]: [...(s[name] ?? []), ...samples] }; saveStore(next); return next })
    setTeachName('')
  }
  const forget = (name: string) => setStore((s) => { const { [name]: _gone, ...rest } = s; saveStore(rest); return rest })

  // ---- live status wording ----
  let liveTitle = 'Recognition is stopped'
  let liveHelp = 'Press Start recognition and allow camera access.'
  if (running && !live.handPresent) { liveTitle = 'No hand detected'; liveHelp = 'Hold one hand in view, palm toward the camera, in good light.' }
  else if (running && live.confidence >= CONFIDENCE) { liveTitle = live.label; liveHelp = `Confidence ${Math.round(live.confidence * 100)}%. Hold steady to add it.` }
  else if (running && live.confidence >= 0.4) { liveTitle = 'Low confidence'; liveHelp = `Closest match: ${live.label} (${Math.round(live.confidence * 100)}%). Hold the sign steadier.` }
  else if (running) { liveTitle = 'Sign not recognized'; liveHelp = 'This hand shape is not in the vocabulary below.' }
  if (recordLeft > 0) { liveTitle = live.label || 'Recording'; liveHelp = `${recordLeft} samples to go. Hold the sign and move it slightly.` }

  const cameraMsg: Record<string, string> = {
    denied: 'Camera access was blocked. Allow the camera in your browser’s site settings, then press Start again.',
    missing: 'No camera was found. Connect a camera, or type your message below.',
    error: 'The camera could not be started. Close other apps using it and try again, or type your message below.',
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-8">
      <header className="mb-8 max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">GestureVoice AI</h1>
        <p className="mt-2 text-lg text-muted">
          Show a hand sign to your webcam, build a message, and have it spoken aloud. Hand tracking runs on this device;
          camera frames are never recorded or uploaded.
        </p>
      </header>

      <main className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {/* Camera */}
        <section aria-labelledby="cam-h" className="rounded-2xl border border-line bg-panel p-4 sm:p-5">
          <h2 id="cam-h" className="sr-only">Camera</h2>
          <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-line bg-black">
            <video ref={rec.videoRef} playsInline muted className="h-full w-full -scale-x-100 object-cover" aria-label="Live camera preview" />
            <canvas ref={rec.canvasRef} className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100 object-cover" aria-hidden />
            {camera !== 'on' && (
              <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-muted">
                {camera === 'requesting' ? 'Waiting for camera permission…'
                  : camera in cameraMsg ? cameraMsg[camera]
                  : 'The camera is off. Your video stays in this browser tab and is not stored.'}
              </div>
            )}
            {running && live.progress > 0 && live.progress < 1 && (
              <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/50" aria-hidden>
                <div className="h-full bg-teal" style={{ width: `${live.progress * 100}%` }} />
              </div>
            )}
          </div>

          <ul className="mt-4 flex flex-wrap gap-2" aria-label="System status">
            <Chip ok={camera === 'on' ? true : camera === 'requesting' ? null : false}>
              {camera === 'on' ? 'Camera on' : camera === 'requesting' ? 'Camera starting' : 'Camera off'}
            </Chip>
            <Chip ok={modelState.phase === 'ready' ? true : modelState.phase === 'loading' ? null : false}>
              {modelState.phase === 'ready' ? 'Hand model ready'
                : modelState.phase === 'loading' ? `Loading hand model ${Math.round(modelState.progress * 100)}%`
                : modelState.phase === 'error' ? 'Hand model failed' : 'Hand model not loaded'}
            </Chip>
            <Chip ok={running ? live.handPresent : false}>{running && live.handPresent ? 'Hand detected' : 'No hand detected'}</Chip>
          </ul>

          {modelState.phase === 'error' && (
            <p role="alert" className="mt-3 rounded-lg border border-bad/50 bg-bad/10 p-3 text-sm">
              The hand-tracking model could not load: {modelState.message}. Recognition is unavailable, but you can still type and speak below.
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {running
              ? <button className={secondary} onClick={rec.stop}>Stop recognition</button>
              : <button className={primary} onClick={rec.start} disabled={camera === 'requesting' || modelState.phase === 'loading'}>Start recognition</button>}
          </div>

          <div className="mt-5 rounded-xl border border-line bg-raised p-4" aria-live="polite">
            <p className="text-sm text-muted">Recognizing now</p>
            <p className="mt-1 text-2xl font-bold">{liveTitle}</p>
            <p className="mt-1 text-muted">{liveHelp}</p>
            {running && live.confidence > 0 && live.handPresent && recordLeft === 0 && (
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink" role="meter" aria-label="Confidence" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(live.confidence * 100)}>
                <div className="h-full bg-teal" style={{ width: `${live.confidence * 100}%` }} />
              </div>
            )}
          </div>
          <p className="sr-only" aria-live="assertive">{announce}</p>
        </section>

        {/* Message */}
        <section aria-labelledby="msg-h" className="flex flex-col gap-5 rounded-2xl border border-line bg-panel p-4 sm:p-5">
          <div>
            <label id="msg-h" htmlFor="message" className="text-sm text-muted">Your message. Signs are added here; you can also type or edit.</label>
            <textarea
              id="message" value={text} rows={6} spellCheck
              onChange={(e) => { textRef.current = e.target.value; setText(e.target.value) }}
              onFocus={() => { if (history.current[history.current.length - 1] !== textRef.current) { history.current.push(textRef.current); setCanUndo(true) } }}
              placeholder="Signs you confirm appear here…"
              className="mt-2 min-h-48 w-full resize-y rounded-xl border border-line bg-ink p-4 text-3xl leading-snug text-text placeholder:text-muted/60 sm:text-4xl"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <button className={primary} onClick={() => speak(text)} disabled={!synth || !text.trim()}>{speaking ? 'Speaking…' : 'Speak'}</button>
            <button className={secondary} onClick={() => speak(lastSpoken.current || text)} disabled={!synth || !(lastSpoken.current || text.trim())}>Repeat</button>
            <button className={secondary} onClick={undo} disabled={!canUndo}>Undo</button>
            <button className={secondary} onClick={clear} disabled={!text}>Clear</button>
          </div>
          <div>
            <label htmlFor="voice" className="text-sm text-muted">Speech voice and language</label>
            {!synth ? (
              <p role="alert" className="mt-2 rounded-lg border border-warn/50 bg-warn/10 p-3 text-sm">This browser cannot speak text aloud. Try Chrome, Edge, or Safari.</p>
            ) : voices.length === 0 ? (
              <p className="mt-2 rounded-lg border border-line bg-raised p-3 text-sm text-muted">No voices reported yet. Speak will use your device’s default voice if one exists.</p>
            ) : (
              <select id="voice" value={voiceURI} onChange={(e) => setVoiceURI(e.target.value)} className="mt-2 min-h-12 w-full rounded-lg border border-line bg-raised px-3 text-base">
                {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
              </select>
            )}
          </div>

          <details className="rounded-xl border border-line bg-raised p-4">
            <summary className="cursor-pointer text-base font-bold">Teach a sign (optional)</summary>
            <p className="mt-3 text-sm text-muted">
              Add your own sign, such as one you know from ISL. Start recognition, show the sign, and record 30 samples with the hand you will
              normally use. Samples stay in this browser only. A sign needs at least {MIN_SAMPLES} samples to be used; its name becomes the text it adds.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <input value={teachName} onChange={(e) => setTeachName(e.target.value)} aria-label="Name for the new sign" placeholder="Word or phrase, e.g. Water"
                className="min-h-12 min-w-0 flex-1 rounded-lg border border-line bg-ink px-3 text-base" />
              <button className={secondary} onClick={teach} disabled={!running || !teachName.trim() || recordLeft > 0 || !live.handPresent}>Record 30 samples</button>
            </div>
            {!running && <p className="mt-2 text-sm text-muted">Start recognition first.</p>}
          </details>
        </section>
      </main>

      {/* Reference */}
      <section aria-labelledby="ref-h" className="mt-10">
        <h2 id="ref-h" className="text-2xl font-bold">Signs this model recognizes</h2>
        <p className="mt-1 max-w-3xl text-muted">
          These {SIGNS.length} hand shapes are the whole built-in vocabulary. Diagrams are schematic and drawn from the exact finger rules the
          recognizer checks. The numerals follow the finger-count convention; confirm against official ISLRTC material before teaching or relying on them.
        </p>
        <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {SIGNS.map((s) => (
            <li key={s.id} className="flex flex-col items-center rounded-xl border border-line bg-panel p-4 text-center">
              <HandIcon sign={s} />
              <p className="mt-2 font-bold">{s.label}</p>
              <p className="text-sm">Adds “{s.text}”</p>
              <p className="mt-1 text-xs text-muted">{s.language}</p>
              <p className="mt-2 rounded-full border border-teal/40 px-2 py-0.5 text-xs text-teal"><span aria-hidden>✓ </span>Supported by active model</p>
            </li>
          ))}
          {Object.entries(store).map(([name, samples]) => (
            <li key={name} className="flex flex-col items-center rounded-xl border border-dashed border-line bg-panel p-4 text-center">
              <div className="flex h-28 w-24 items-center justify-center text-sm text-muted">No diagram</div>
              <p className="mt-2 font-bold">{name}</p>
              <p className="text-sm">Adds “{name}”</p>
              <p className="mt-1 text-xs text-muted">Recorded by you on this device</p>
              <p className="mt-2 rounded-full border border-line px-2 py-0.5 text-xs">
                {samples.length >= MIN_SAMPLES ? `${samples.length} samples, active` : `${samples.length} of ${MIN_SAMPLES} samples, not active yet`}
              </p>
              <button className="mt-2 text-sm underline" onClick={() => forget(name)} aria-label={`Delete recorded sign ${name}`}>Delete</button>
            </li>
          ))}
        </ul>
      </section>

      <footer className="mt-12 max-w-3xl space-y-2 border-t border-line pt-6 text-sm text-muted">
        <p>
          GestureVoice AI is a communication aid, not a full sign-language translator. Sign languages, including ISL, have their own grammar,
          two-handed signs, movement and facial expression; this app reads single-hand static shapes only.
        </p>
        <p>Hand landmarks come from Google’s MediaPipe Hand Landmarker (Apache-2.0), running in your browser.</p>
      </footer>
    </div>
  )
}
