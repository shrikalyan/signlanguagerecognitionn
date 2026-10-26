import type { Sign } from '../recognition/vocab.ts'

const FX = [30, 42, 54, 66]
const FH = [44, 50, 45, 36]

/**
 * Schematic hand diagram drawn from the same finger pattern the classifier uses,
 * so what you see is exactly what the model checks. It is a pose diagram, not a
 * photograph of a signer.
 */
export default function HandIcon({ sign }: { sign: Sign }) {
  const f = sign.fingers
  const ok = sign.variant === 'ok'
  const stroke = 'var(--color-teal)'
  const fill = 'var(--color-raised)'
  return (
    <svg viewBox="0 0 100 120" role="img" aria-label={`Diagram: ${sign.label}`} className="h-28 w-24" fill="none" strokeLinejoin="round">
      <g transform={sign.variant === 'down' ? 'translate(0 120) scale(1 -1)' : undefined} stroke={stroke} strokeWidth={2.5} fill={fill}>
        <rect x="28" y="58" width="48" height="44" rx="12" />
        {FX.map((x, i) => {
          const ext = f[i + 1] === 1
          if (ok && i === 0) return <circle key={i} cx={x + 5} cy={60} r={6} />
          return ext
            ? <rect key={i} x={x} y={58 - FH[i]} width="10" height={FH[i] + 8} rx="5" />
            : <rect key={i} x={x} y={52} width="10" height="16" rx="5" />
        })}
        {sign.variant === 'up' || sign.variant === 'down'
          ? <rect x="17" y="20" width="12" height="50" rx="6" />
          : ok
            ? <><circle cx="27" cy="56" r="11" /><rect x="26" y="66" width="22" height="10" rx="5" /></>
            : f[0] === 1
              ? <rect x="6" y="62" width="34" height="11" rx="5.5" transform="rotate(-38 30 70)" />
              : <rect x="38" y="76" width="24" height="10" rx="5" />}
      </g>
    </svg>
  )
}
