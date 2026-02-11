import { useState, useEffect, useCallback, useRef } from 'react'
import { OLL_SET } from './algs/oll'
import { PLL_SET } from './algs/pll'
import type { AlgCase, AlgSet, AlgSetSection } from './algs/oll'
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

const CUSTOM_SETS_KEY = 'scrambl-custom-algsets'

function loadCustomSets(): AlgSet[] {
  try {
    const stored = localStorage.getItem(CUSTOM_SETS_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function saveCustomSets(sets: AlgSet[]): void {
  localStorage.setItem(CUSTOM_SETS_KEY, JSON.stringify(sets))
}

const PAINT_COLORS = [
  { value: 0, color: '#374151', label: 'Gray (unset)' },
  { value: 1, color: '#eab308', label: 'Yellow' },
  { value: 2, color: '#ef4444', label: 'Red' },
  { value: 3, color: '#3b82f6', label: 'Blue' },
  { value: 4, color: '#22c55e', label: 'Green' },
  { value: 5, color: '#f97316', label: 'Orange' },
  { value: 6, color: '#ffffff', label: 'White' },
]

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

function initSets(): AlgSet[] {
  const stored = loadCustomSets()
  const ids = new Set(stored.map(s => s.id))
  let needsSave = false
  const result = [...stored]
  // Seed built-in sets if not yet present, applying any existing overrides
  for (const builtIn of [...ALG_SETS].reverse()) {
    if (!ids.has(builtIn.id)) {
      const cases = builtIn.cases.map(c => {
        const merged = applyOverride(c)
        localStorage.removeItem(overrideKey(c.id))
        return merged
      })
      result.unshift({ ...builtIn, cases })
      needsSave = true
    }
  }
  if (needsSave) saveCustomSets(result)
  return result
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

function sectionsKey(setId: string): string {
  return `scrambl-alg-sections-${setId}`
}

function loadSections(set: AlgSet): AlgSetSection[] {
  try {
    const stored = localStorage.getItem(sectionsKey(set.id))
    if (stored) return JSON.parse(stored)
  } catch { /* ignore */ }
  return set.sections ? set.sections.map(s => ({ ...s, caseIds: [...s.caseIds] })) : []
}

function saveSections(setId: string, sections: AlgSetSection[]): void {
  localStorage.setItem(sectionsKey(setId), JSON.stringify(sections))
}

function getUnsortedIds(set: AlgSet, sections: AlgSetSection[]): string[] {
  const assigned = new Set(sections.flatMap(s => s.caseIds))
  return set.cases.map(c => c.id).filter(id => !assigned.has(id))
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
  const [selectedColor, setSelectedColor] = useState(0)
  const [isNewCase, setIsNewCase] = useState(false)
  // Set edit modal state
  const [editingSetInfo, setEditingSetInfo] = useState(false)
  const [editSetName, setEditSetName] = useState('')
  const [editSetColors, setEditSetColors] = useState(false)
  // Force re-render of case grid after saving
  const [overrideVersion, setOverrideVersion] = useState(0)

  // Custom sets
  const [customSets, setCustomSets] = useState<AlgSet[]>(initSets)

  // Sections state
  const [sections, setSections] = useState<AlgSetSection[]>([])
  const [dragOverSection, setDragOverSection] = useState<string | null>(null)
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null)

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
        const next = randomCase(selectedSet, selectedCase)
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
    setSections(loadSections(set))
    setView('cases')
  }

  const openEditModal = (algCase: AlgCase, asNew = false) => {
    setEditingCase(algCase)
    setIsNewCase(asNew)
    setEditName(algCase.name)
    setEditAlg(algCase.alg)
    setEditTop([...algCase.top])
    setEditSides([...(algCase.sides ?? Array(12).fill(0))])
  }

  const saveEdit = () => {
    if (!editingCase || !selectedSet) return
    const updatedCase: AlgCase = {
      id: editingCase.id,
      name: editName,
      alg: editAlg,
      top: editTop,
      sides: editSides,
    }
    const updatedSets = customSets.map(s => {
      if (s.id !== selectedSet.id) return s
      if (isNewCase) {
        return { ...s, cases: [...s.cases, updatedCase] }
      }
      return { ...s, cases: s.cases.map(c => c.id === editingCase.id ? updatedCase : c) }
    })
    saveCustomSets(updatedSets)
    setCustomSets(updatedSets)
    const updated = updatedSets.find(s => s.id === selectedSet.id)
    if (updated) setSelectedSet(updated)
    setEditingCase(null)
    setIsNewCase(false)
    setOverrideVersion(v => v + 1)
  }

  const practiceCase = (algCase: AlgCase) => {
    setSelectedCase(algCase)
    setSolves(loadTimes(algCase.id))
    setDisplayTime(0)
    setTimerState('idle')
    setShowAlg(false)
    setRandomMode(false)
    setView('practice')
  }

  const practiceSet = () => {
    if (!selectedSet) return
    const c = randomCase(selectedSet)
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

  const createCustomSet = () => {
    const id = `custom-${Date.now()}`
    const newSet: AlgSet = { id, name: 'New Set', cases: [], colors: true }
    const updated = [...customSets, newSet]
    saveCustomSets(updated)
    setCustomSets(updated)
    openSet(newSet)
  }

  const deleteCustomSet = (e: React.MouseEvent, setId: string) => {
    e.stopPropagation()
    const updated = customSets.filter(s => s.id !== setId)
    saveCustomSets(updated)
    setCustomSets(updated)
  }

  const deleteCase = () => {
    if (!editingCase || !selectedSet) return
    const updatedSets = customSets.map(s => {
      if (s.id !== selectedSet.id) return s
      return { ...s, cases: s.cases.filter(c => c.id !== editingCase.id) }
    })
    saveCustomSets(updatedSets)
    setCustomSets(updatedSets)
    const updated = updatedSets.find(s => s.id === selectedSet.id)
    if (updated) setSelectedSet(updated)
    setEditingCase(null)
    setIsNewCase(false)
    setOverrideVersion(v => v + 1)
  }

  const openSetEdit = () => {
    if (!selectedSet) return
    setEditSetName(selectedSet.name)
    setEditSetColors(selectedSet.colors ?? false)
    setEditingSetInfo(true)
  }

  const saveSetEdit = () => {
    if (!selectedSet) return
    const updatedSets = customSets.map(s =>
      s.id === selectedSet.id ? { ...s, name: editSetName, colors: editSetColors } : s
    )
    saveCustomSets(updatedSets)
    setCustomSets(updatedSets)
    const updated = updatedSets.find(s => s.id === selectedSet.id)
    if (updated) setSelectedSet(updated)
    setEditingSetInfo(false)
  }

  // --- Set list view ---
  if (view === 'sets') {
    return (
      <div className="alg-practice">
        <div className="alg-sets">
          {customSets.map(set => (
            <button key={set.id} className="alg-set-card" onClick={() => openSet(set)}>
              <span className="alg-set-name">{set.name}</span>
              <span className="alg-set-count">{set.cases.length} cases</span>
              <span className="alg-set-delete" onClick={e => deleteCustomSet(e, set.id)}>&times;</span>
            </button>
          ))}
          <button className="alg-new-set-card" onClick={createCustomSet}>
            <span className="alg-set-name">+</span>
            <span className="alg-set-count">New Set</span>
          </button>
        </div>
      </div>
    )
  }

  // --- Case list view ---
  if (view === 'cases' && selectedSet) {
    void overrideVersion // used to trigger re-render
    const caseMap = new Map(selectedSet.cases.map(c => [c.id, c]))

    const unsortedIds = getUnsortedIds(selectedSet, sections)
    const hasSections = sections.length > 0 || (selectedSet.sections && selectedSet.sections.length > 0)

    const handleDragStart = (e: React.DragEvent, caseId: string, fromSectionId: string) => {
      e.dataTransfer.setData('text/plain', JSON.stringify({ caseId, fromSectionId }))
      e.dataTransfer.effectAllowed = 'move'
    }

    const handleDragOver = (e: React.DragEvent, sectionId: string) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setDragOverSection(sectionId)
    }

    const handleDragLeave = (e: React.DragEvent, sectionId: string) => {
      // Only clear if we're actually leaving this section (not entering a child)
      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
        if (dragOverSection === sectionId) setDragOverSection(null)
      }
    }

    const handleDrop = (e: React.DragEvent, toSectionId: string) => {
      e.preventDefault()
      setDragOverSection(null)
      try {
        const { caseId, fromSectionId } = JSON.parse(e.dataTransfer.getData('text/plain'))
        if (fromSectionId === toSectionId) return

        // Remove from source section (if it's a real section, not unsorted)
        // Add to target section (if it's a real section, not unsorted)
        const next = sections.map(s => {
          if (s.id === fromSectionId) {
            return { ...s, caseIds: s.caseIds.filter(id => id !== caseId) }
          }
          if (s.id === toSectionId) {
            return { ...s, caseIds: [...s.caseIds, caseId] }
          }
          return s
        })
        setSections(next)
        saveSections(selectedSet.id, next)
      } catch { /* ignore bad data */ }
    }

    const handleDragEnd = () => {
      setDragOverSection(null)
    }

    const addSection = () => {
      const id = `sec-${Date.now()}`
      const next = [...sections, { id, name: 'New Section', caseIds: [] }]
      setSections(next)
      saveSections(selectedSet.id, next)
      setEditingSectionId(id)
    }

    const deleteSection = (sectionId: string) => {
      const next = sections.filter(s => s.id !== sectionId)
      setSections(next)
      saveSections(selectedSet.id, next)
    }

    const renameSection = (sectionId: string, name: string) => {
      const next = sections.map(s => s.id === sectionId ? { ...s, name } : s)
      setSections(next)
      saveSections(selectedSet.id, next)
    }

    const renderCaseCard = (caseId: string, sectionId: string) => {
      const c = caseMap.get(caseId)
      if (!c) return null
      return (
        <button
          key={caseId}
          className="alg-case-card"
          draggable={hasSections}
          onDragStart={e => handleDragStart(e, caseId, sectionId)}
          onDragEnd={handleDragEnd}
          onClick={() => openEditModal(c)}
        >
          <OllDiagram top={c.top} sides={c.sides} size={60} colors={selectedSet.colors} />
          <span className="alg-case-name">{c.name}</span>
        </button>
      )
    }

    const renderSectionHeader = (section: AlgSetSection) => (
      <div className="alg-section-header" key={`header-${section.id}`}>
        {editingSectionId === section.id ? (
          <input
            className="alg-section-name-input"
            autoFocus
            defaultValue={section.name}
            onBlur={e => { renameSection(section.id, e.target.value || section.name); setEditingSectionId(null) }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          />
        ) : (
          <h3
            className="alg-section-name"
            onClick={() => setEditingSectionId(section.id)}
          >
            {section.name}
          </h3>
        )}
        <button className="alg-section-delete" onClick={() => deleteSection(section.id)} title="Delete section">&times;</button>
      </div>
    )

    return (
      <div className="alg-practice">
        <button className="alg-back" onClick={goBackToSets}>&larr; Back</button>
        <div className="alg-set-header">
          <h2 className="alg-section-title">{selectedSet.name}</h2>
          <button className="alg-set-edit-btn" onClick={openSetEdit} title="Edit set">&#9998;</button>
        </div>
        {selectedSet.cases.length > 0 && (
          <button className="alg-practice-set-btn" onClick={practiceSet}>Practice Set</button>
        )}
        <button className="alg-add-case-btn" onClick={() => {
          const id = `${selectedSet.id}-${Date.now()}`
          const blank: AlgCase = { id, name: '', alg: '', top: Array(9).fill(0), sides: Array(12).fill(0) }
          openEditModal(blank, true)
        }}>+ Add Case</button>

        {hasSections ? (
          <>
            {sections.map(section => (
              <div
                key={section.id}
                className={`alg-section ${dragOverSection === section.id ? 'drag-over' : ''}`}
                onDragOver={e => handleDragOver(e, section.id)}
                onDragLeave={e => handleDragLeave(e, section.id)}
                onDrop={e => handleDrop(e, section.id)}
              >
                {renderSectionHeader(section)}
                <div className="alg-case-grid">
                  {section.caseIds.map(id => renderCaseCard(id, section.id))}
                </div>
              </div>
            ))}
            {unsortedIds.length > 0 && (
              <div
                className={`alg-section alg-section-unsorted ${dragOverSection === '__unsorted' ? 'drag-over' : ''}`}
                onDragOver={e => handleDragOver(e, '__unsorted')}
                onDragLeave={e => handleDragLeave(e, '__unsorted')}
                onDrop={e => handleDrop(e, '__unsorted')}
              >
                <div className="alg-section-header">
                  <h3 className="alg-section-name unsorted">Unsorted</h3>
                </div>
                <div className="alg-case-grid">
                  {unsortedIds.map(id => renderCaseCard(id, '__unsorted'))}
                </div>
              </div>
            )}
            <button className="alg-add-section-btn" onClick={addSection}>+ Add Section</button>
          </>
        ) : (
          <>
            <div className="alg-case-grid">
              {selectedSet.cases.map(c => renderCaseCard(c.id, '__flat'))}
            </div>
            <button className="alg-add-section-btn" onClick={addSection}>+ Add Section</button>
          </>
        )}

        {editingCase && (
          <div className="modal-overlay" onClick={() => { setEditingCase(null); setIsNewCase(false) }}>
            <div className="modal alg-edit-modal" onClick={e => e.stopPropagation()}>
              <h3>{isNewCase ? 'Add Case' : 'Edit Case'}</h3>

              <div className="alg-edit-diagram-tools">
                <button className="alg-tool-btn" title="Clear" onClick={() => {
                  setEditTop(Array(9).fill(0))
                  setEditSides(Array(12).fill(0))
                }}>&#8709;</button>
                <button className="alg-tool-btn" title="Rotate CCW" onClick={() => {
                  const t = editTop
                  setEditTop([t[2], t[5], t[8], t[1], t[4], t[7], t[0], t[3], t[6]])
                  const s = editSides
                  setEditSides([s[3], s[4], s[5], s[6], s[7], s[8], s[9], s[10], s[11], s[0], s[1], s[2]])
                }}>&#8634;</button>
                <button className="alg-tool-btn" title="Rotate CW" onClick={() => {
                  const t = editTop
                  setEditTop([t[6], t[3], t[0], t[7], t[4], t[1], t[8], t[5], t[2]])
                  const s = editSides
                  setEditSides([s[9], s[10], s[11], s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7], s[8]])
                }}>&#8635;</button>
              </div>

              <div className="alg-edit-diagram-row">
                <OllDiagram
                  top={editTop}
                  sides={editSides}
                  size={140}
                  colors={selectedSet?.colors}
                  onToggleTop={i => {
                    const next = [...editTop]
                    next[i] = selectedColor
                    setEditTop(next)
                  }}
                  onToggleSide={i => {
                    const next = [...editSides]
                    next[i] = selectedColor
                    setEditSides(next)
                  }}
                />
                <div className="alg-edit-palette">
                  {PAINT_COLORS.filter(({ value }) => selectedSet?.colors || value <= 1).map(({ value, color, label }) => (
                    <button
                      key={value}
                      className={`alg-palette-swatch ${selectedColor === value ? 'active' : ''}`}
                      style={{ background: color }}
                      title={label}
                      onClick={() => setSelectedColor(value)}
                    />
                  ))}
                </div>
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
                {!isNewCase && (
                  <button className="alg-edit-practice" onClick={() => { setEditingCase(null); practiceCase(editingCase) }}>Practice</button>
                )}
                {!isNewCase && (
                  <button className="alg-edit-delete" onClick={deleteCase}>Delete</button>
                )}
              </div>

              <button className="modal-close" onClick={() => { setEditingCase(null); setIsNewCase(false) }}>Close</button>
            </div>
          </div>
        )}

        {editingSetInfo && (
          <div className="modal-overlay" onClick={() => setEditingSetInfo(false)}>
            <div className="modal alg-edit-modal" onClick={e => e.stopPropagation()}>
              <h3>Edit Set</h3>

              <label className="alg-edit-label">
                Name
                <input
                  type="text"
                  value={editSetName}
                  onChange={e => setEditSetName(e.target.value)}
                />
              </label>

              <label className="alg-edit-toggle">
                <input
                  type="checkbox"
                  checked={editSetColors}
                  onChange={e => setEditSetColors(e.target.checked)}
                />
                Multi-color stickers
              </label>

              <div className="alg-edit-actions">
                <button className="alg-edit-save" onClick={saveSetEdit}>Save</button>
              </div>

              <button className="modal-close" onClick={() => setEditingSetInfo(false)}>Close</button>
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
          <OllDiagram top={selectedCase.top} sides={selectedCase.sides} size={120} colors={selectedSet?.colors} />
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
