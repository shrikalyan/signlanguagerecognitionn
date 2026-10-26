export type F = 0 | 1
export type Variant = 'up' | 'down' | 'ok'

export interface Sign {
  id: string
  /** Text appended to the sentence when this sign is confirmed. */
  text: string
  label: string
  meaning: string
  /** Language / origin shown in the reference panel. */
  language: string
  /** Finger pattern: thumb, index, middle, ring, pinky (1 = extended). */
  fingers: [F, F, F, F, F]
  variant?: Variant
  isNumeral: boolean
}

const NUM = 'ISL numeral (finger count)'
const POSE = 'Hand pose, phrase set by this app (not an ISL sign)'

export const SIGNS: Sign[] = [
  { id: 'n1', text: '1', label: 'One', meaning: 'Number 1', language: NUM, fingers: [0, 1, 0, 0, 0], isNumeral: true },
  { id: 'n2', text: '2', label: 'Two', meaning: 'Number 2', language: NUM, fingers: [0, 1, 1, 0, 0], isNumeral: true },
  { id: 'n3', text: '3', label: 'Three', meaning: 'Number 3', language: NUM, fingers: [0, 1, 1, 1, 0], isNumeral: true },
  { id: 'n4', text: '4', label: 'Four', meaning: 'Number 4', language: NUM, fingers: [0, 1, 1, 1, 1], isNumeral: true },
  { id: 'n5', text: '5', label: 'Five', meaning: 'Number 5', language: NUM, fingers: [1, 1, 1, 1, 1], isNumeral: true },
  { id: 'yes', text: 'Yes', label: 'Thumb up', meaning: 'Yes', language: POSE, fingers: [1, 0, 0, 0, 0], variant: 'up', isNumeral: false },
  { id: 'no', text: 'No', label: 'Thumb down', meaning: 'No', language: POSE, fingers: [1, 0, 0, 0, 0], variant: 'down', isNumeral: false },
  { id: 'wait', text: 'Please wait', label: 'Closed fist', meaning: 'Please wait', language: POSE, fingers: [0, 0, 0, 0, 0], isNumeral: false },
  { id: 'ok', text: 'Okay', label: 'Ring (OK)', meaning: 'Okay', language: POSE, fingers: [0, 0, 1, 1, 1], variant: 'ok', isNumeral: false },
  { id: 'call', text: 'Please call me', label: 'Thumb and little finger', meaning: 'Please call me', language: POSE, fingers: [1, 0, 0, 0, 1], isNumeral: false },
]

export const SIGN_BY_ID = new Map(SIGNS.map((s) => [s.id, s]))
