import { useState, useEffect, useCallback, useRef } from 'react'
import { OLL_SET } from './algs/oll'
import { PLL_SET } from './algs/pll'
import type { AlgCase, AlgSet } from './algs/oll'
import OllDiagram from './OllDiagram'

type View = 'sets' | 'cases' | 'practice'
type TimerState = 'idle' | 'holding' | 'ready' | 'running'

interface SolveTime {
  id: number
  time: number
  date: string
}

interface CaseOverride {
  name?: string
  alg?: string
  top?: number[]
  sides?: number[]
}

const ALG_SETS: AlgSet[] = [OLL_SET, PLL_SET]

function overrideKey(caseId: string): string {
  return `scrambl-alg-override-${caseId}`
}

function loadOverride(caseId: string): CaseOverride | null {
  try {
    const stored = localStorage.getItem(overrideKey(caseId))
    return stored ? JSON.parse(stored) : null
  } catch {
    return null
  }
}

function saveOverride(caseId: string, override: CaseOverride): void {
  localStorage.setItem(overrideKey(caseId), JSON.stringify(override))
}

function applyOverride(c: AlgCase): AlgCase {
  const o = loadOverride(c.id)
  if (!o) return c
  return {
    ...c,
    name: o.name ?? c.name,
    alg: o.alg ?? c.alg,
    top: o.top ?? c.top,
    sides: o.sides ?? c.sides,
  }
}

function storageKey(caseId: string): string {
  return `scrambl-alg-times-${caseId}`
}

function loadTimes(caseId: string): SolveTime[] {
  try {
    const stored = localStorage.getItem(storageKey(caseId))
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function saveTimes(caseId: string, times: SolveTime[]): void {
  localStorage.setItem(storageKey(caseId), JSON.stringify(times))
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

function randomCase(set: AlgSet, exclude?: AlgCase): AlgCase {
  const pool = set.cases.length > 1 && exclude
    ? set.cases.filter(c => c.id !== exclude.id)
    : set.cases
  return pool[Math.floor(Math.random() * pool.length)]
}

export default function AlgPractice() {
  const [view, setView] = useState<View>('sets')
  const [selectedSet, setSelectedSet] = useState<AlgSet | null>(null)
  const [selectedCase, setSelectedCase] = useState<AlgCase | null>(null)
  const [showAlg, setShowAlg] = useState(false)
  const [randomMode, setRandomMode] = useState(false)

  // Edit modal state
  const [editingCase, setEditingCase] = useState<AlgCase | null>(null)
  const [editName, setEditName] = useState('')
  const [editAlg, setEditAlg] = useState('')
  const [editTop, setEditTop] = useState<number[]>([])
  const [editSides, setEditSides] = useState<number[]>([])
  // Force re-render of case grid after saving
  const [overrideVersion, setOverrideVersion] = useState(0)

  // Timer state
  const [timerState, setTimerState] = useState<TimerState>('idle')
  const [displayTime, setDisplayTime] = useState(0)
  const [solves, setSolves] = useState<SolveTime[]>([])

  const startTimeRef = useRef<number>(0)
  const animationFrameRef = useRef<number>(0)
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)

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

    if (selectedCase) {
      const newSolve: SolveTime = {
        id: Date.now(),
        time: finalTime,
        date: new Date().toISOString()
      }
      if (randomMode && selectedSet) {
        const prev = loadTimes(selectedCase.id)
        saveTimes(selectedCase.id, [newSolve, ...prev])
        const next = applyOverride(randomCase(selectedSet, selectedCase))
        setSelectedCase(next)
        setSolves(loadTimes(next.id))
        setShowAlg(false)
      } else {
        setSolves(prev => {
          const updated = [newSolve, ...prev]
          saveTimes(selectedCase.id, updated)
          return updated
        })
      }
    }
  }, [selectedCase, randomMode, selectedSet])

  // Keyboard handler for practice timer
  useEffect(() => {
    if (view !== 'practice') return

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

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [view, timerState, startTimer, stopTimer])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animationFrameRef.current)
      clearTimeout(holdTimeoutRef.current)
    }
  }, [])

  const openSet = (set: AlgSet) => {
    setSelectedSet(set)
    setView('cases')
  }

  const openEditModal = (algCase: AlgCase) => {
    const c = applyOverride(algCase)
    setEditingCase(algCase) // keep base reference for saving
    setEditName(c.name)
    setEditAlg(c.alg)
    setEditTop([...c.top])
    setEditSides([...(c.sides ?? Array(12).fill(0))])
  }

  const saveEdit = () => {
    if (!editingCase) return
    const override: CaseOverride = {
      name: editName,
      alg: editAlg,
      top: editTop,
      sides: editSides,
    }
    saveOverride(editingCase.id, override)
    setEditingCase(null)
    setOverrideVersion(v => v + 1)
  }

  const resetEdit = () => {
    if (!editingCase) return
    localStorage.removeItem(overrideKey(editingCase.id))
    setEditName(editingCase.name)
    setEditAlg(editingCase.alg)
    setEditTop([...editingCase.top])
    setEditSides([...(editingCase.sides ?? Array(12).fill(0))])
    setOverrideVersion(v => v + 1)
  }

  const practiceCase = (algCase: AlgCase) => {
    const c = applyOverride(algCase)
    setSelectedCase(c)
    setSolves(loadTimes(c.id))
    setDisplayTime(0)
    setTimerState('idle')
    setShowAlg(false)
    setRandomMode(false)
    setView('practice')
  }

  const practiceSet = () => {
    if (!selectedSet) return
    const c = applyOverride(randomCase(selectedSet))
    setSelectedCase(c)
    setSolves(loadTimes(c.id))
    setDisplayTime(0)
    setTimerState('idle')
    setShowAlg(false)
    setRandomMode(true)
    setView('practice')
  }

  const goBackToCases = () => {
    setTimerState('idle')
    cancelAnimationFrame(animationFrameRef.current)
    clearTimeout(holdTimeoutRef.current)
    startTimeRef.current = 0
    setView('cases')
  }

  const goBackToSets = () => {
    setView('sets')
    setSelectedSet(null)
  }

  const deleteSolve = (id: number) => {
    if (!selectedCase) return
    setSolves(prev => {
      const updated = prev.filter(s => s.id !== id)
      saveTimes(selectedCase.id, updated)
      return updated
    })
  }

  const best = solves.length > 0
    ? Math.min(...solves.map(s => s.time))
    : null

  // --- Set list view ---
  if (view === 'sets') {
    return (
      <div className="alg-practice">
        <div className="alg-sets">
          {ALG_SETS.map(set => (
            <button key={set.id} className="alg-set-card" onClick={() => openSet(set)}>
              <span className="alg-set-name">{set.name}</span>
              <span className="alg-set-count">{set.cases.length} cases</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // --- Case list view ---
  if (view === 'cases' && selectedSet) {
    // Apply overrides for display (overrideVersion forces refresh)
    const displayCases = selectedSet.cases.map(c => applyOverride(c))
    void overrideVersion // used to trigger re-render

    return (
      <div className="alg-practice">
        <button className="alg-back" onClick={goBackToSets}>&larr; Back</button>
        <h2 className="alg-section-title">{selectedSet.name}</h2>
        <button className="alg-practice-set-btn" onClick={practiceSet}>Practice Set</button>
        <div className="alg-case-grid">
          {displayCases.map((c, i) => (
            <button key={c.id} className="alg-case-card" onClick={() => openEditModal(selectedSet.cases[i])}>
              <OllDiagram top={c.top} sides={c.sides} size={60} />
              <span className="alg-case-name">{c.name}</span>
            </button>
          ))}
        </div>

        {editingCase && (
          <div className="modal-overlay" onClick={() => setEditingCase(null)}>
            <div className="modal alg-edit-modal" onClick={e => e.stopPropagation()}>
              <h3>Edit Case</h3>

              <div className="alg-edit-diagram">
                <OllDiagram
                  top={editTop}
                  sides={editSides}
                  size={140}
                  onToggleTop={i => {
                    const next = [...editTop]
                    next[i] = next[i] === 1 ? 0 : 1
                    setEditTop(next)
                  }}
                  onToggleSide={i => {
                    const next = [...editSides]
                    next[i] = next[i] === 1 ? 0 : 1
                    setEditSides(next)
                  }}
                />
                <span className="alg-edit-diagram-hint">Click stickers to toggle</span>
              </div>

              <label className="alg-edit-label">
                Name
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                />
              </label>

              <label className="alg-edit-label">
                Algorithm
                <input
                  type="text"
                  value={editAlg}
                  onChange={e => setEditAlg(e.target.value)}
                />
              </label>

              <div className="alg-edit-actions">
                <button className="alg-edit-save" onClick={saveEdit}>Save</button>
                <button className="alg-edit-practice" onClick={() => { setEditingCase(null); practiceCase(editingCase) }}>Practice</button>
                <button className="alg-edit-reset" onClick={resetEdit}>Reset</button>
              </div>

              <button className="modal-close" onClick={() => setEditingCase(null)}>Close</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // --- Practice view ---
  if (view === 'practice' && selectedCase) {
    return (
      <div className="alg-practice">
        <button className="alg-back" onClick={goBackToCases}>&larr; Back to {selectedSet?.name}</button>

        <div className="alg-practice-case">
          <OllDiagram top={selectedCase.top} sides={selectedCase.sides} size={120} />
          <h2 className="alg-case-title">{selectedCase.name}</h2>
          <button className="alg-reveal-btn" onClick={() => setShowAlg(!showAlg)}>
            {showAlg ? 'Hide Algorithm' : 'Show Algorithm'}
          </button>
          {showAlg && <p className="alg-text">{selectedCase.alg}</p>}
        </div>

        <div className={`timer ${timerState}`}>
          <span className="time">{formatTime(displayTime)}</span>
          <span className="hint">
            {timerState === 'idle' && 'Hold space to start'}
            {timerState === 'holding' && 'Hold...'}
            {timerState === 'ready' && 'Release to start'}
            {timerState === 'running' && 'Press space to stop'}
          </span>
        </div>

        {(solves.length > 0 || best !== null) && (
          <div className="alg-practice-stats">
            {best !== null && (
              <div className="stat">
                <label>Best</label>
                <span>{formatTime(best)}</span>
              </div>
            )}
          </div>
        )}

        {solves.length > 0 && (
          <div className="alg-practice-solves">
            <h3>Recent ({solves.length})</h3>
            <ul>
              {solves.slice(0, 5).map(solve => (
                <li key={solve.id}>
                  <span className="solve-time">{formatTime(solve.time)}</span>
                  <button className="delete-btn" onClick={() => deleteSolve(solve.id)}>×</button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }

  return null
}
