export interface FaceConfig {
  face: string
  moves: string[]
}

export interface EventConfig {
  id: string
  label: string
  scrambleLength: number
  faces: FaceConfig[]
  customScramble?: () => string
  group: 'nxn' | 'bld-oh' | 'other'
}

const AXIS: Record<string, number> = { R: 0, L: 0, U: 1, D: 1, F: 2, B: 2 }
const MODIFIERS = ['', "'", '2'] as const

// --- Custom scramble generators for non-NxN events ---

function randomMovesScramble(
  faces: string[],
  axis: Record<string, number>,
  mods: string[],
  length: number,
): string[] {
  const moves: string[] = []
  let lastFace = ''
  let secondLastFace = ''
  for (let i = 0; i < length; i++) {
    let face: string
    do {
      face = faces[Math.floor(Math.random() * faces.length)]
    } while (
      face === lastFace ||
      (lastFace && secondLastFace && axis[face] === axis[lastFace] && axis[lastFace] === axis[secondLastFace])
    )
    moves.push(face + mods[Math.floor(Math.random() * mods.length)])
    secondLastFace = lastFace
    lastFace = face
  }
  return moves
}

function generatePyraminxScramble(): string {
  const axis = { R: 0, L: 0, U: 1, B: 1 }
  const mods = ['', "'"]
  const moves = randomMovesScramble(['R', 'U', 'L', 'B'], axis, mods, 11)
  for (const tip of ['r', 'u', 'l', 'b']) {
    if (Math.random() < 0.5) {
      moves.push(tip + mods[Math.floor(Math.random() * mods.length)])
    }
  }
  return moves.join(' ')
}

function generateSkewbScramble(): string {
  const axis = { R: 0, L: 0, U: 1, B: 1 }
  return randomMovesScramble(['R', 'U', 'L', 'B'], axis, ['', "'"], 11).join(' ')
}

function generateMegaminxScramble(): string {
  const lines: string[] = []
  for (let line = 0; line < 7; line++) {
    const parts: string[] = []
    for (let i = 0; i < 5; i++) {
      parts.push(Math.random() < 0.5 ? 'R++' : 'R--')
      parts.push(Math.random() < 0.5 ? 'D++' : 'D--')
    }
    parts.push(Math.random() < 0.5 ? 'U' : "U'")
    lines.push(parts.join(' '))
  }
  return lines.join('\n')
}

function generateSq1Scramble(): string {
  const parts: string[] = []
  for (let i = 0; i < 13; i++) {
    let top: number, bottom: number
    do {
      top = Math.floor(Math.random() * 12) - 5
      bottom = Math.floor(Math.random() * 12) - 5
    } while (top === 0 && bottom === 0)
    parts.push(`(${top},${bottom})`)
  }
  return parts.join(' / ')
}

// --- NxN face configs ---

const FACES_2: FaceConfig[] = [
  { face: 'R', moves: ['R'] }, { face: 'U', moves: ['U'] }, { face: 'F', moves: ['F'] },
]
const FACES_3: FaceConfig[] = [
  { face: 'R', moves: ['R'] }, { face: 'L', moves: ['L'] },
  { face: 'U', moves: ['U'] }, { face: 'D', moves: ['D'] },
  { face: 'F', moves: ['F'] }, { face: 'B', moves: ['B'] },
]
const FACES_4: FaceConfig[] = [
  { face: 'R', moves: ['R', 'Rw'] }, { face: 'L', moves: ['L'] },
  { face: 'U', moves: ['U', 'Uw'] }, { face: 'D', moves: ['D'] },
  { face: 'F', moves: ['F', 'Fw'] }, { face: 'B', moves: ['B'] },
]
const FACES_5: FaceConfig[] = [
  { face: 'R', moves: ['R', 'Rw'] }, { face: 'L', moves: ['L', 'Lw'] },
  { face: 'U', moves: ['U', 'Uw'] }, { face: 'D', moves: ['D', 'Dw'] },
  { face: 'F', moves: ['F', 'Fw'] }, { face: 'B', moves: ['B', 'Bw'] },
]
const FACES_6: FaceConfig[] = [
  { face: 'R', moves: ['R', 'Rw', '3Rw'] }, { face: 'L', moves: ['L', 'Lw'] },
  { face: 'U', moves: ['U', 'Uw', '3Uw'] }, { face: 'D', moves: ['D', 'Dw'] },
  { face: 'F', moves: ['F', 'Fw', '3Fw'] }, { face: 'B', moves: ['B', 'Bw'] },
]
const FACES_7: FaceConfig[] = [
  { face: 'R', moves: ['R', 'Rw', '3Rw'] }, { face: 'L', moves: ['L', 'Lw', '3Lw'] },
  { face: 'U', moves: ['U', 'Uw', '3Uw'] }, { face: 'D', moves: ['D', 'Dw', '3Dw'] },
  { face: 'F', moves: ['F', 'Fw', '3Fw'] }, { face: 'B', moves: ['B', 'Bw', '3Bw'] },
]

export const EVENT_GROUPS = ['nxn', 'bld-oh', 'other'] as const

export const EVENTS: EventConfig[] = [
  // NxN
  { id: '2x2', label: '2x2', scrambleLength: 9, faces: FACES_2, group: 'nxn' },
  { id: '3x3', label: '3x3', scrambleLength: 20, faces: FACES_3, group: 'nxn' },
  { id: '4x4', label: '4x4', scrambleLength: 40, faces: FACES_4, group: 'nxn' },
  { id: '5x5', label: '5x5', scrambleLength: 60, faces: FACES_5, group: 'nxn' },
  { id: '6x6', label: '6x6', scrambleLength: 80, faces: FACES_6, group: 'nxn' },
  { id: '7x7', label: '7x7', scrambleLength: 100, faces: FACES_7, group: 'nxn' },
  // BLD + OH
  { id: '3oh', label: '3-OH', scrambleLength: 20, faces: FACES_3, group: 'bld-oh' },
  { id: '3bld', label: '3-BLD', scrambleLength: 20, faces: FACES_3, group: 'bld-oh' },
  { id: '4bld', label: '4-BLD', scrambleLength: 40, faces: FACES_4, group: 'bld-oh' },
  { id: '5bld', label: '5-BLD', scrambleLength: 60, faces: FACES_5, group: 'bld-oh' },
  // Other
  { id: 'pyra', label: 'Pyraminx', scrambleLength: 0, faces: [], customScramble: generatePyraminxScramble, group: 'other' },
  { id: 'skewb', label: 'Skewb', scrambleLength: 0, faces: [], customScramble: generateSkewbScramble, group: 'other' },
  { id: 'mega', label: 'Megaminx', scrambleLength: 0, faces: [], customScramble: generateMegaminxScramble, group: 'other' },
  { id: 'sq1', label: 'Sq-1', scrambleLength: 0, faces: [], customScramble: generateSq1Scramble, group: 'other' },
]

export function generateScramble(event: EventConfig): string {
  if (event.customScramble) return event.customScramble()

  const { faces, scrambleLength } = event
  const moves: string[] = []
  let lastFace = ''
  let secondLastFace = ''

  for (let i = 0; i < scrambleLength; i++) {
    let faceEntry: FaceConfig
    do {
      faceEntry = faces[Math.floor(Math.random() * faces.length)]
    } while (
      faceEntry.face === lastFace ||
      (lastFace && secondLastFace && AXIS[faceEntry.face] === AXIS[lastFace] && AXIS[lastFace] === AXIS[secondLastFace])
    )

    const baseMove = faceEntry.moves[Math.floor(Math.random() * faceEntry.moves.length)]
    const modifier = MODIFIERS[Math.floor(Math.random() * MODIFIERS.length)]
    moves.push(baseMove + modifier)

    secondLastFace = lastFace
    lastFace = faceEntry.face
  }

  return moves.join(' ')
}

export const DEFAULT_EVENT = EVENTS.find(e => e.id === '3x3')!
