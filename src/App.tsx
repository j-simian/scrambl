import { useState, useEffect, useCallback, useRef } from 'react'
import './App.css'
import AlgPractice from './AlgPractice'

type TimerState = 'idle' | 'holding' | 'ready' | 'running'

interface FaceConfig {
  face: string
  moves: string[]
}

interface EventConfig {
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

const EVENT_GROUPS = ['nxn', 'bld-oh', 'other'] as const

const EVENTS: EventConfig[] = [
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

function generateScramble(event: EventConfig): string {
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

type Penalty = 'none' | '+2' | 'dnf'

interface SolveTime {
  id: number
  time: number
  date: string
  penalty?: Penalty
}

function effectiveTime(solve: SolveTime): number {
  if (solve.penalty === 'dnf') return Infinity
  if (solve.penalty === '+2') return solve.time + 2000
  return solve.time
}

function displaySolveTime(solve: SolveTime): string {
  if (solve.penalty === 'dnf') return 'DNF'
  if (solve.penalty === '+2') return formatTime(solve.time) + '+2'
  return formatTime(solve.time)
}

function formatAverage(ms: number): string {
  return ms === Infinity ? 'DNF' : formatTime(ms)
}

function storageKey(eventId: string): string {
  return `cubetimer-solves-${eventId}`
}

function trimmedMean(times: number[]): number {
  const sorted = [...times].sort((a, b) => a - b)
  // drop best and worst
  const middle = sorted.slice(1, -1)
  return middle.reduce((sum, t) => sum + t, 0) / middle.length
}

function formatTime(ms: number): string {
  const totalSeconds = ms / 1000
  if (totalSeconds < 60) {
    return totalSeconds.toFixed(2)
  }
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = (totalSeconds % 60).toFixed(2).padStart(5, '0')
  return `${minutes}:${seconds}`
}

function migrateOldData(): void {
  const old = localStorage.getItem('cubetimer-solves')
  if (old !== null) {
    if (!localStorage.getItem(storageKey('3x3'))) {
      localStorage.setItem(storageKey('3x3'), old)
    }
    localStorage.removeItem('cubetimer-solves')
  }
}

function loadTimes(eventId: string): SolveTime[] {
  try {
    const stored = localStorage.getItem(storageKey(eventId))
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function saveTimes(eventId: string, times: SolveTime[]): void {
  localStorage.setItem(storageKey(eventId), JSON.stringify(times))
}

migrateOldData()

const DEFAULT_EVENT = EVENTS.find(e => e.id === '3x3')!

type Page = 'timer' | 'algs'

function App() {
  const [page, setPage] = useState<Page>('timer')
  const [currentEvent, setCurrentEvent] = useState<EventConfig>(DEFAULT_EVENT)
  const [timerState, setTimerState] = useState<TimerState>('idle')
  const [displayTime, setDisplayTime] = useState(0)
  const [solves, setSolves] = useState<SolveTime[]>(() => loadTimes(DEFAULT_EVENT.id))
  const [scramble, setScramble] = useState(() => generateScramble(DEFAULT_EVENT))

  const [editingSolve, setEditingSolve] = useState<SolveTime | null>(null)
  const [editTimeInput, setEditTimeInput] = useState('')

  const startTimeRef = useRef<number>(0)
  const animationFrameRef = useRef<number>(0)
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const timerRef = useRef<HTMLDivElement>(null)

  const updateDisplay = useCallback(() => {
    if (startTimeRef.current > 0) {
      setDisplayTime(Date.now() - startTimeRef.current)
      animationFrameRef.current = requestAnimationFrame(updateDisplay)
    }
  }, [])

  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now()
    setTimerState('running')
    animationFrameRef.current = requestAnimationFrame(updateDisplay)
  }, [updateDisplay])

  const stopTimer = useCallback(() => {
    cancelAnimationFrame(animationFrameRef.current)
    const finalTime = Date.now() - startTimeRef.current
    setDisplayTime(finalTime)
    startTimeRef.current = 0
    setTimerState('idle')

    const newSolve: SolveTime = {
      id: Date.now(),
      time: finalTime,
      date: new Date().toISOString()
    }
    setSolves(prev => {
      const updated = [newSolve, ...prev]
      saveTimes(currentEvent.id, updated)
      return updated
    })
    setScramble(generateScramble(currentEvent))
  }, [currentEvent])

  const deleteSolve = (id: number) => {
    setSolves(prev => {
      const updated = prev.filter(s => s.id !== id)
      saveTimes(currentEvent.id, updated)
      return updated
    })
  }

  const clearAllSolves = () => {
    setSolves([])
    saveTimes(currentEvent.id, [])
    setDisplayTime(0)
  }

  const switchEvent = (event: EventConfig) => {
    if (event.id === currentEvent.id || timerState === 'running') return
    setCurrentEvent(event)
    setSolves(loadTimes(event.id))
    setScramble(generateScramble(event))
    setDisplayTime(0)
    setTimerState('idle')
  }

  const updateSolve = (id: number, patch: Partial<SolveTime>) => {
    setSolves(prev => {
      const updated = prev.map(s => s.id === id ? { ...s, ...patch } : s)
      saveTimes(currentEvent.id, updated)
      return updated
    })
  }

  const openEditModal = (solve: SolveTime) => {
    setEditingSolve(solve)
    setEditTimeInput(formatTime(solve.time))
  }

  const applyEditTime = () => {
    if (!editingSolve) return
    // Parse "M:SS.xx" or "SS.xx"
    const parts = editTimeInput.split(':')
    let seconds: number
    if (parts.length === 2) {
      seconds = parseFloat(parts[0]) * 60 + parseFloat(parts[1])
    } else {
      seconds = parseFloat(parts[0])
    }
    if (isNaN(seconds) || seconds <= 0) return
    updateSolve(editingSolve.id, { time: Math.round(seconds * 1000) })
    setEditingSolve(null)
  }

  // Prevent spacebar from scrolling the page
  useEffect(() => {
    const preventSpaceScroll = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      e.preventDefault()
    }
    window.addEventListener('keydown', preventSpaceScroll)
    return () => window.removeEventListener('keydown', preventSpaceScroll)
  }, [])

  useEffect(() => {
    if (page !== 'timer') return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return
      e.preventDefault()

      if (timerState === 'idle') {
        setTimerState('holding')
        holdTimeoutRef.current = setTimeout(() => {
          setTimerState('ready')
        }, 550)
      } else if (timerState === 'running') {
        stopTimer()
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      e.preventDefault()

      if (timerState === 'holding') {
        clearTimeout(holdTimeoutRef.current)
        setTimerState('idle')
      } else if (timerState === 'ready') {
        startTimer()
      }
    }

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      e.preventDefault()
      if (timerState === 'idle') {
        setTimerState('holding')
        holdTimeoutRef.current = setTimeout(() => {
          setTimerState('ready')
        }, 550)
      } else if (timerState === 'running') {
        stopTimer()
      }
    }

    const handlePointerUp = () => {
      if (timerState === 'holding') {
        clearTimeout(holdTimeoutRef.current)
        setTimerState('idle')
      } else if (timerState === 'ready') {
        startTimer()
      }
    }

    const timerEl = timerRef.current
    if (timerEl) {
      timerEl.addEventListener('mousedown', handlePointerDown)
      timerEl.addEventListener('touchstart', handlePointerDown, { passive: false })
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('mouseup', handlePointerUp)
    window.addEventListener('touchend', handlePointerUp)

    return () => {
      if (timerEl) {
        timerEl.removeEventListener('mousedown', handlePointerDown)
        timerEl.removeEventListener('touchstart', handlePointerDown)
      }
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('mouseup', handlePointerUp)
      window.removeEventListener('touchend', handlePointerUp)
    }
  }, [page, timerState, startTimer, stopTimer])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animationFrameRef.current)
      clearTimeout(holdTimeoutRef.current)
    }
  }, [])

  // Calculate stats
  const validTimes = solves.map(effectiveTime).filter(t => t !== Infinity)
  const avg5 = solves.length >= 5
    ? trimmedMean(solves.slice(0, 5).map(effectiveTime))
    : null
  const avg12 = solves.length >= 12
    ? trimmedMean(solves.slice(0, 12).map(effectiveTime))
    : null
  const best = validTimes.length > 0
    ? Math.min(...validTimes)
    : null

  // Rolling averages per solve index (newest-first)
  const ao5Map = new Map<number, number>()
  const ao12Map = new Map<number, number>()
  for (let i = 0; i <= solves.length - 5; i++) {
    ao5Map.set(i, trimmedMean(solves.slice(i, i + 5).map(effectiveTime)))
  }
  for (let i = 0; i <= solves.length - 12; i++) {
    ao12Map.set(i, trimmedMean(solves.slice(i, i + 12).map(effectiveTime)))
  }

  return (
    <div className="app">
      <header>
        <h1>scrambl</h1>
        <nav className="page-tabs">
          <button className={`page-tab ${page === 'timer' ? 'active' : ''}`} onClick={() => setPage('timer')}>Timer</button>
          <button className={`page-tab ${page === 'algs' ? 'active' : ''}`} onClick={() => setPage('algs')}>Alg Practice</button>
        </nav>
      </header>

      {page === 'timer' && <>
        <div className="event-tabs">
          {EVENT_GROUPS.map(group => (
            <div key={group} className="event-tab-row">
              {EVENTS.filter(e => e.group === group).map(event => (
                <button
                  key={event.id}
                  className={`event-tab ${event.id === currentEvent.id ? 'active' : ''}`}
                  onClick={() => switchEvent(event)}
                >
                  {event.label}
                </button>
              ))}
            </div>
          ))}
        </div>

      <main>
        <div className="scramble">{scramble}</div>
        <div ref={timerRef} className={`timer ${timerState}`}>
          <span className="time">{formatTime(displayTime)}</span>
          <span className="hint">
            {timerState === 'idle' && 'Hold to start'}
            {timerState === 'holding' && 'Hold...'}
            {timerState === 'ready' && 'Release to start'}
            {timerState === 'running' && 'Tap to stop'}
          </span>
        </div>

        {solves.length > 0 && (
          <div className="stats">
            {best !== null && <div className="stat"><label>Best</label><span>{formatTime(best)}</span></div>}
            {avg5 !== null && <div className="stat"><label>Ao5</label><span>{formatAverage(avg5)}</span></div>}
            {avg12 !== null && <div className="stat"><label>Ao12</label><span>{formatAverage(avg12)}</span></div>}
          </div>
        )}

        {solves.length > 0 && (
          <div className="solves">
            <div className="solves-header">
              <h2>Solves ({solves.length})</h2>
              <button className="clear-btn" onClick={clearAllSolves}>Clear All</button>
            </div>
            <ul>
              {solves.map((solve, index) => (
                <li key={solve.id}>
                  <span className="solve-num">{solves.length - index}.</span>
                  <span className={`solve-time ${solve.penalty === 'dnf' ? 'dnf' : ''}`}>{displaySolveTime(solve)}</span>
                  <span className="solve-averages">
                    {ao5Map.has(index) && <span className="solve-ao">ao5: {formatAverage(ao5Map.get(index)!)}</span>}
                    {ao12Map.has(index) && <span className="solve-ao">ao12: {formatAverage(ao12Map.get(index)!)}</span>}
                  </span>
                  <button className="edit-btn" onClick={() => openEditModal(solve)}>&#9998;</button>
                  <button className="delete-btn" onClick={() => deleteSolve(solve.id)}>×</button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {editingSolve && (
          <div className="modal-overlay" onClick={() => setEditingSolve(null)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <h3>Edit Solve</h3>
              <p className="modal-time">{displaySolveTime(editingSolve)}</p>
              <div className="modal-penalties">
                <button
                  className={`penalty-btn ${editingSolve.penalty === 'dnf' ? 'active' : ''}`}
                  onClick={() => {
                    const newPenalty = editingSolve.penalty === 'dnf' ? 'none' : 'dnf'
                    updateSolve(editingSolve.id, { penalty: newPenalty })
                    setEditingSolve({ ...editingSolve, penalty: newPenalty })
                  }}
                >DNF</button>
                <button
                  className={`penalty-btn ${editingSolve.penalty === '+2' ? 'active' : ''}`}
                  onClick={() => {
                    const newPenalty = editingSolve.penalty === '+2' ? 'none' : '+2'
                    updateSolve(editingSolve.id, { penalty: newPenalty })
                    setEditingSolve({ ...editingSolve, penalty: newPenalty })
                  }}
                >+2</button>
              </div>
              <form className="modal-edit-time" onSubmit={e => { e.preventDefault(); applyEditTime() }}>
                <input
                  type="text"
                  value={editTimeInput}
                  onChange={e => setEditTimeInput(e.target.value)}
                  placeholder="0.00 or 0:00.00"
                />
                <button type="submit">Save</button>
              </form>
              <button className="modal-close" onClick={() => setEditingSolve(null)}>Close</button>
            </div>
          </div>
        )}
      </main>
      </>}

      {page === 'algs' && (
        <main>
          <AlgPractice />
        </main>
      )}
    </div>
  )
}

export default App
