import { useState, useCallback } from 'react'
import './App.css'
import AlgPractice from './AlgPractice'
import { formatTime } from './utils/formatTime'
import { loadFromStorage, saveToStorage } from './utils/storage'
import { useTimer } from './hooks/useTimer'
import type { SolveTime, Penalty } from './types'
import { generateScramble, EVENTS, EVENT_GROUPS, DEFAULT_EVENT } from './scramble'
import type { EventConfig } from './scramble'

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
  return loadFromStorage<SolveTime[]>(storageKey(eventId), [])
}

function saveTimes(eventId: string, times: SolveTime[]): void {
  saveToStorage(storageKey(eventId), times)
}

migrateOldData()

type Page = 'timer' | 'algs'

function App() {
  const [page, setPage] = useState<Page>('timer')
  const [currentEvent, setCurrentEvent] = useState<EventConfig>(DEFAULT_EVENT)
  const [solves, setSolves] = useState<SolveTime[]>(() => loadTimes(DEFAULT_EVENT.id))
  const [scramble, setScramble] = useState(() => generateScramble(DEFAULT_EVENT))

  const [editingSolve, setEditingSolve] = useState<SolveTime | null>(null)
  const [editTimeInput, setEditTimeInput] = useState('')

  const currentEventRef = useCallback(() => currentEvent, [currentEvent])

  const handleTimerStop = useCallback((finalTime: number) => {
    const event = currentEventRef()
    const newSolve: SolveTime = {
      id: Date.now(),
      time: finalTime,
      date: new Date().toISOString()
    }
    setSolves(prev => {
      const updated = [newSolve, ...prev]
      saveTimes(event.id, updated)
      return updated
    })
    setScramble(generateScramble(event))
  }, [currentEventRef])

  const { timerState, displayTime, setDisplayTime, timerRef } = useTimer({
    onStop: handleTimerStop,
    active: page === 'timer',
  })

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

  const togglePenalty = (penalty: Penalty) => {
    if (!editingSolve) return
    const newPenalty = editingSolve.penalty === penalty ? 'none' : penalty
    updateSolve(editingSolve.id, { penalty: newPenalty })
    setEditingSolve({ ...editingSolve, penalty: newPenalty })
  }

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
                  onClick={() => togglePenalty('dnf')}
                >DNF</button>
                <button
                  className={`penalty-btn ${editingSolve.penalty === '+2' ? 'active' : ''}`}
                  onClick={() => togglePenalty('+2')}
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
