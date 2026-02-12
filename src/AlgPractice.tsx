import { useState, useEffect, useCallback, useRef } from 'react'
import type { AlgCase, AlgSet, AlgSetSection } from './algs/oll'
import CubeDiagram from './CubeDiagram'
import { formatTime } from './utils/formatTime'
import { loadFromStorage, saveToStorage } from './utils/storage'
import { reorderArray } from './utils/arrayUtils'
import { createDragClone } from './utils/touchDrag'
import { useTimer } from './hooks/useTimer'
import type { SolveTime } from './types'

type View = 'sets' | 'cases' | 'practice'

const PRESETS = [
  { name: 'OLL', path: '/presets/oll.json' },
  { name: 'PLL', path: '/presets/pll.json' },
]

const ALGSET_ICONS = [
  { id: '2x2', name: '2×2', path: '/icons/2x2.svg' },
]

const CUSTOM_SETS_KEY = 'scrambl-custom-algsets'

function loadCustomSets(): AlgSet[] {
  return loadFromStorage<AlgSet[]>(CUSTOM_SETS_KEY, [])
}

function saveCustomSets(sets: AlgSet[]): void {
  saveToStorage(CUSTOM_SETS_KEY, sets)
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

function timesKey(caseId: string): string {
  return `scrambl-alg-times-${caseId}`
}

function loadTimes(caseId: string): SolveTime[] {
  return loadFromStorage<SolveTime[]>(timesKey(caseId), [])
}

function saveTimes(caseId: string, times: SolveTime[]): void {
  saveToStorage(timesKey(caseId), times)
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
  saveToStorage(sectionsKey(setId), sections)
}

function getUnsortedIds(set: AlgSet, sections: AlgSetSection[]): string[] {
  const assigned = new Set(sections.flatMap(s => s.caseIds))
  return set.cases.map(c => c.id).filter(id => !assigned.has(id))
}

interface SetSection {
  id: string
  name: string
  setIds: string[]
  icon?: string
}

const SET_SECTIONS_KEY = 'scrambl-set-sections'

function loadSetSections(): SetSection[] {
  return loadFromStorage<SetSection[]>(SET_SECTIONS_KEY, [])
}

function saveSetSections(secs: SetSection[]): void {
  saveToStorage(SET_SECTIONS_KEY, secs)
}

function getUnsortedSetIds(sets: AlgSet[], secs: SetSection[]): string[] {
  const assigned = new Set(secs.flatMap(s => s.setIds))
  return sets.map(s => s.id).filter(id => !assigned.has(id))
}

// --- Touch drag state type ---

interface TouchDragState {
  type: 'case' | 'section' | 'set'
  caseId?: string
  fromSectionId?: string
  sectionId?: string
  setId?: string
  fromSetSectionId?: string
  startX: number
  startY: number
  sourceEl: HTMLElement
  clone: HTMLElement | null
  isDragging: boolean
  dragReady: boolean
  holdTimer: ReturnType<typeof setTimeout> | null
  currentTarget: { type: 'case' | 'section' | 'set'; id: string; sectionId?: string } | null
}

const HOLD_DELAY = 200
const MOVE_CANCEL_THRESHOLD = 8

function initTouchDrag(
  ref: React.MutableRefObject<TouchDragState | null>,
  e: React.TouchEvent,
  sourceEl: HTMLElement,
  props: Partial<TouchDragState>,
): void {
  if (ref.current) return
  const touch = e.touches[0]
  const holdTimer = setTimeout(() => {
    if (ref.current) {
      ref.current.dragReady = true
      sourceEl.classList.add('touch-drag-ready')
    }
  }, HOLD_DELAY)
  ref.current = {
    type: props.type ?? 'case',
    ...props,
    startX: touch.clientX,
    startY: touch.clientY,
    sourceEl,
    clone: null,
    isDragging: false,
    dragReady: false,
    holdTimer,
    currentTarget: null,
  }
}

export default function AlgPractice() {
  const [view, setView] = useState<View>('sets')
  const [selectedSet, setSelectedSet] = useState<AlgSet | null>(null)
  const [selectedCase, setSelectedCase] = useState<AlgCase | null>(null)
  const [showAlg, setShowAlg] = useState(false)
  const [, setRandomMode] = useState(false)

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

  // New set modal state
  const [showNewSetModal, setShowNewSetModal] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState('')
  const [loadingPreset, setLoadingPreset] = useState(false)
  const [newSetName, setNewSetName] = useState('New Set')

  // Set list view mode
  const [setListMode, setSetListMode] = useState<'view' | 'edit'>('view')
  const [dragOverSetId, setDragOverSetId] = useState<string | null>(null)

  // Set list sections
  const [setListSections, setSetListSections] = useState<SetSection[]>(loadSetSections)
  const [editingSetSectionId, setEditingSetSectionId] = useState<string | null>(null)
  const [dragOverSetSection, setDragOverSetSection] = useState<string | null>(null)

  // Custom sets
  const [customSets, setCustomSets] = useState<AlgSet[]>(loadCustomSets)

  // Case list view mode
  const [caseViewMode, setCaseViewMode] = useState<'view' | 'edit'>('view')
  const [selectedCaseIds, setSelectedCaseIds] = useState<Set<string>>(new Set())

  // Sections state
  const [sections, setSections] = useState<AlgSetSection[]>([])
  const [dragOverSection, setDragOverSection] = useState<string | null>(null)
  const [dragOverCaseId, setDragOverCaseId] = useState<string | null>(null)
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null)

  // Timer state
  const [solves, setSolves] = useState<SolveTime[]>([])

  // Touch drag and drop refs (for mobile support)
  const touchDragRef = useRef<TouchDragState | null>(null)
  const touchDropHandlerRef = useRef<((target: { type: 'case' | 'section' | 'set'; id: string; sectionId?: string }) => void) | null>(null)

  const handleTimerStop = useCallback((finalTime: number) => {
    const newSolve: SolveTime = {
      id: Date.now(),
      time: finalTime,
      date: new Date().toISOString()
    }
    setSelectedCase(prevCase => {
      if (!prevCase) return prevCase
      setRandomMode(prevRandom => {
        setSelectedSet(prevSet => {
          if (prevRandom && prevSet) {
            const prev = loadTimes(prevCase.id)
            saveTimes(prevCase.id, [newSolve, ...prev])
            const next = randomCase(prevSet, prevCase)
            setSelectedCase(next)
            setSolves(loadTimes(next.id))
            setShowAlg(false)
          } else {
            setSolves(prevSolves => {
              const updated = [newSolve, ...prevSolves]
              saveTimes(prevCase.id, updated)
              return updated
            })
          }
          return prevSet
        })
        return prevRandom
      })
      return prevCase
    })
  }, [])

  const { timerState, displayTime, timerRef, setDisplayTime, resetTimer } = useTimer({
    onStop: handleTimerStop,
    active: view === 'practice',
  })

  // Touch drag and drop for mobile (cases & sections in edit mode)
  useEffect(() => {
    if (view !== 'cases' || caseViewMode !== 'edit') {
      if (touchDragRef.current?.clone) {
        touchDragRef.current.clone.remove()
      }
      if (touchDragRef.current?.holdTimer) {
        clearTimeout(touchDragRef.current.holdTimer)
      }
      touchDragRef.current = null
      return
    }

    const handleTouchMove = (e: TouchEvent) => {
      const drag = touchDragRef.current
      if (!drag) return

      const touch = e.touches[0]
      const dx = touch.clientX - drag.startX
      const dy = touch.clientY - drag.startY

      // Before long press fires, cancel if finger moves too much
      if (!drag.dragReady && !drag.isDragging) {
        if (Math.abs(dx) > MOVE_CANCEL_THRESHOLD || Math.abs(dy) > MOVE_CANCEL_THRESHOLD) {
          if (drag.holdTimer) clearTimeout(drag.holdTimer)
          touchDragRef.current = null
        }
        return
      }

      // Long press fired but not yet dragging – create clone on first move
      if (drag.dragReady && !drag.isDragging) {
        drag.isDragging = true
        drag.clone = createDragClone(drag.sourceEl)
        drag.sourceEl.classList.add('touch-drag-source')
      }

      e.preventDefault()
      if (drag.clone) {
        drag.clone.style.transform = `translate(${dx}px, ${dy}px)`
      }

      // Find drop target under finger
      if (drag.clone) drag.clone.style.display = 'none'
      const el = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement | null
      if (drag.clone) drag.clone.style.display = ''

      if (el) {
        const caseCard = el.closest('[data-drag-case]') as HTMLElement | null
        if (caseCard && drag.type === 'case') {
          const caseId = caseCard.getAttribute('data-drag-case')!
          const sectionId = caseCard.getAttribute('data-drag-section')!
          drag.currentTarget = { type: 'case', id: caseId, sectionId }
          setDragOverCaseId(caseId)
          setDragOverSection(null)
          return
        }
        const sectionEl = el.closest('[data-drop-section]') as HTMLElement | null
        if (sectionEl) {
          const sectionId = sectionEl.getAttribute('data-drop-section')!
          drag.currentTarget = { type: 'section', id: sectionId }
          setDragOverSection(sectionId)
          setDragOverCaseId(null)
          return
        }
      }

      drag.currentTarget = null
      setDragOverSection(null)
      setDragOverCaseId(null)
    }

    const handleTouchEnd = () => {
      const drag = touchDragRef.current
      if (!drag) return

      if (drag.holdTimer) clearTimeout(drag.holdTimer)

      if (drag.isDragging && drag.currentTarget && touchDropHandlerRef.current) {
        touchDropHandlerRef.current(drag.currentTarget)
      }

      if (drag.clone) drag.clone.remove()
      if (drag.sourceEl) drag.sourceEl.classList.remove('touch-drag-source', 'touch-drag-ready')
      touchDragRef.current = null
      setDragOverSection(null)
      setDragOverCaseId(null)
    }

    window.addEventListener('touchmove', handleTouchMove, { passive: false })
    window.addEventListener('touchend', handleTouchEnd)

    return () => {
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
      if (touchDragRef.current?.clone) {
        touchDragRef.current.clone.remove()
      }
      if (touchDragRef.current?.holdTimer) {
        clearTimeout(touchDragRef.current.holdTimer)
      }
      touchDragRef.current = null
    }
  }, [view, caseViewMode])

  // Touch drag and drop for mobile (set list reorder in edit mode)
  useEffect(() => {
    const setsEditing = customSets.length === 0 || setListMode === 'edit'
    if (view !== 'sets' || !setsEditing) {
      return
    }

    const hasSetSecs = setListSections.length > 0

    const handleTouchMove = (e: TouchEvent) => {
      const drag = touchDragRef.current
      if (!drag || (drag.type !== 'set' && drag.type !== 'section')) return

      const touch = e.touches[0]
      const dx = touch.clientX - drag.startX
      const dy = touch.clientY - drag.startY

      if (!drag.dragReady && !drag.isDragging) {
        if (Math.abs(dx) > MOVE_CANCEL_THRESHOLD || Math.abs(dy) > MOVE_CANCEL_THRESHOLD) {
          if (drag.holdTimer) clearTimeout(drag.holdTimer)
          touchDragRef.current = null
        }
        return
      }

      if (drag.dragReady && !drag.isDragging) {
        drag.isDragging = true
        drag.clone = createDragClone(drag.sourceEl)
        drag.sourceEl.classList.add('touch-drag-source')
      }

      e.preventDefault()
      if (drag.clone) {
        drag.clone.style.transform = `translate(${dx}px, ${dy}px)`
      }

      if (drag.clone) drag.clone.style.display = 'none'
      const el = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement | null
      if (drag.clone) drag.clone.style.display = ''

      if (el) {
        if (drag.type === 'set') {
          // Looking for a set card target
          const setCard = el.closest('[data-set-id]') as HTMLElement | null
          if (setCard) {
            const setId = setCard.getAttribute('data-set-id')!
            const secId = setCard.getAttribute('data-set-section') || ''
            drag.currentTarget = { type: 'set', id: setId, sectionId: secId }
            setDragOverSetId(setId)
            setDragOverSetSection(null)
            return
          }
          // Looking for a section drop zone
          if (hasSetSecs) {
            const secEl = el.closest('[data-set-section-id]') as HTMLElement | null
            if (secEl) {
              const secId = secEl.getAttribute('data-set-section-id')!
              drag.currentTarget = { type: 'section', id: secId }
              setDragOverSetSection(secId)
              setDragOverSetId(null)
              return
            }
          }
        } else if (drag.type === 'section') {
          // Looking for a section target (reorder sections)
          const secEl = el.closest('[data-set-section-id]') as HTMLElement | null
          if (secEl) {
            const secId = secEl.getAttribute('data-set-section-id')!
            drag.currentTarget = { type: 'section', id: secId }
            setDragOverSetSection(secId)
            return
          }
        }
      }
      drag.currentTarget = null
      setDragOverSetId(null)
      setDragOverSetSection(null)
    }

    const handleTouchEnd = () => {
      const drag = touchDragRef.current
      if (!drag || (drag.type !== 'set' && drag.type !== 'section')) return

      if (drag.holdTimer) clearTimeout(drag.holdTimer)

      if (drag.isDragging && drag.currentTarget) {
        if (drag.type === 'set' && drag.setId) {
          if (hasSetSecs) {
            const fromSecId = drag.fromSetSectionId || ''
            if (drag.currentTarget.type === 'set') {
              const targetSetId = drag.currentTarget.id
              const targetSecId = drag.currentTarget.sectionId || ''
              if (drag.setId !== targetSetId) {
                if (fromSecId === '__unsorted-sets' && targetSecId === '__unsorted-sets') {
                  const next = reorderArray(customSets, customSets.findIndex(s => s.id === drag.setId), customSets.findIndex(s => s.id === targetSetId))
                  saveCustomSets(next)
                  setCustomSets(next)
                } else if (fromSecId === '__unsorted-sets') {
                  const toIdx = setListSections.find(s => s.id === targetSecId)?.setIds.indexOf(targetSetId) ?? -1
                  if (toIdx !== -1) {
                    const next = setListSections.map(s => {
                      if (s.id === targetSecId) {
                        const ids = [...s.setIds.filter(id => id !== drag.setId)]
                        ids.splice(toIdx, 0, drag.setId!)
                        return { ...s, setIds: ids }
                      }
                      return s
                    })
                    saveSetSections(next)
                    setSetListSections(next)
                  }
                } else if (targetSecId === '__unsorted-sets') {
                  const next = setListSections.map(s =>
                    s.id === fromSecId ? { ...s, setIds: s.setIds.filter(id => id !== drag.setId) } : s
                  )
                  saveSetSections(next)
                  setSetListSections(next)
                } else {
                  const toIdx = setListSections.find(s => s.id === targetSecId)?.setIds.indexOf(targetSetId) ?? -1
                  if (toIdx !== -1) {
                    const next = setListSections.map(s => {
                      let ids = s.setIds
                      if (s.id === fromSecId) ids = ids.filter(id => id !== drag.setId)
                      if (s.id === targetSecId) {
                        ids = [...ids.filter(id => id !== drag.setId)]
                        ids.splice(toIdx, 0, drag.setId!)
                      }
                      return ids === s.setIds ? s : { ...s, setIds: ids }
                    })
                    saveSetSections(next)
                    setSetListSections(next)
                  }
                }
              }
            } else if (drag.currentTarget.type === 'section') {
              const toSecId = drag.currentTarget.id
              if (fromSecId !== toSecId) {
                const next = setListSections.map(s => {
                  if (s.id === fromSecId) return { ...s, setIds: s.setIds.filter(id => id !== drag.setId) }
                  if (s.id === toSecId) return { ...s, setIds: [...s.setIds, drag.setId!] }
                  return s
                })
                saveSetSections(next)
                setSetListSections(next)
              }
            }
          } else {
            // Flat mode - reorder customSets
            if (drag.currentTarget.type === 'set') {
              const fromId = drag.setId
              const toId = drag.currentTarget.id
              if (fromId !== toId) {
                const next = reorderArray(customSets, customSets.findIndex(s => s.id === fromId), customSets.findIndex(s => s.id === toId))
                saveCustomSets(next)
                setCustomSets(next)
              }
            }
          }
        } else if (drag.type === 'section' && drag.sectionId && drag.currentTarget.type === 'section') {
          const fromId = drag.sectionId
          const toId = drag.currentTarget.id
          if (fromId !== toId) {
            const next = reorderArray(setListSections, setListSections.findIndex(s => s.id === fromId), setListSections.findIndex(s => s.id === toId))
            saveSetSections(next)
            setSetListSections(next)
          }
        }
      }

      if (drag.clone) drag.clone.remove()
      if (drag.sourceEl) drag.sourceEl.classList.remove('touch-drag-source', 'touch-drag-ready')
      touchDragRef.current = null
      setDragOverSetId(null)
      setDragOverSetSection(null)
    }

    window.addEventListener('touchmove', handleTouchMove, { passive: false })
    window.addEventListener('touchend', handleTouchEnd)

    return () => {
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
    }
  }, [view, setListMode, customSets, setListSections])

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
    setShowAlg(false)
    setRandomMode(true)
    setView('practice')
  }

  const practiceSelected = () => {
    if (!selectedSet || selectedCaseIds.size === 0) return
    const filteredSet: AlgSet = {
      ...selectedSet,
      cases: selectedSet.cases.filter(c => selectedCaseIds.has(c.id)),
    }
    const c = randomCase(filteredSet)
    setSelectedCase(c)
    setSolves(loadTimes(c.id))
    setDisplayTime(0)
    setShowAlg(false)
    setRandomMode(true)
    setSelectedSet(filteredSet)
    setView('practice')
  }

  const goBackToCases = () => {
    resetTimer()
    // Restore the full set if we were practicing a filtered subset
    const fullSet = customSets.find(s => s.id === selectedSet?.id)
    if (fullSet) setSelectedSet(fullSet)
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

  const createBlankSet = () => {
    const id = `custom-${Date.now()}`
    const newSet: AlgSet = { id, name: newSetName || 'New Set', cases: [], colors: true }
    const updated = [...customSets, newSet]
    saveCustomSets(updated)
    setCustomSets(updated)
    setShowNewSetModal(false)
    setNewSetName('New Set')
  }

  const createFromPreset = async (presetPath: string) => {
    setLoadingPreset(true)
    try {
      const resp = await fetch(presetPath)
      const preset: AlgSet = await resp.json()
      const id = `preset-${Date.now()}`
      const newSet: AlgSet = { ...preset, id }
      const updated = [...customSets, newSet]
      saveCustomSets(updated)
      setCustomSets(updated)
      setShowNewSetModal(false)
      setSelectedPreset('')
    } finally {
      setLoadingPreset(false)
    }
  }

  const exportSet = (e: React.MouseEvent, set: AlgSet) => {
    e.stopPropagation()
    const secs = loadSections(set)
    const data: AlgSet = { ...set, ...(secs.length > 0 ? { sections: secs } : {}) }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${set.name.toLowerCase().replace(/\s+/g, '-')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const duplicateSet = (e: React.MouseEvent, set: AlgSet) => {
    e.stopPropagation()
    const id = `copy-${Date.now()}`
    const copy: AlgSet = { ...set, id, name: `${set.name} (copy)` }
    const updated = [...customSets, copy]
    saveCustomSets(updated)
    setCustomSets(updated)
    // Copy sections too
    const secs = loadSections(set)
    if (secs.length > 0) saveSections(id, secs)
  }

  const importFromFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const preset: AlgSet = JSON.parse(reader.result as string)
        if (!preset.cases || !Array.isArray(preset.cases)) return
        const id = `import-${Date.now()}`
        const newSet: AlgSet = { ...preset, id }
        const updated = [...customSets, newSet]
        saveCustomSets(updated)
        setCustomSets(updated)
        if (preset.sections) saveSections(id, preset.sections)
        setShowNewSetModal(false)
      } catch { /* ignore bad files */ }
    }
    reader.readAsText(file)
  }

  const deleteCustomSet = (e: React.MouseEvent, setId: string) => {
    e.stopPropagation()
    const updated = customSets.filter(s => s.id !== setId)
    saveCustomSets(updated)
    setCustomSets(updated)
    // Clean up from set sections
    const cleanedSecs = setListSections.map(s => ({
      ...s, setIds: s.setIds.filter(id => id !== setId)
    }))
    saveSetSections(cleanedSecs)
    setSetListSections(cleanedSecs)
  }

  // Set list drag-and-drop reorder
  const handleSetDragStart = (e: React.DragEvent, setId: string) => {
    e.dataTransfer.setData('application/algset', setId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleSetDragOver = (e: React.DragEvent, setId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverSetId(setId)
  }

  const handleSetDragLeave = (e: React.DragEvent, setId: string) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      if (dragOverSetId === setId) setDragOverSetId(null)
    }
  }

  const handleSetDrop = (e: React.DragEvent, toSetId: string) => {
    e.preventDefault()
    setDragOverSetId(null)
    const fromId = e.dataTransfer.getData('application/algset')
    if (!fromId || fromId === toSetId) return
    const next = reorderArray(customSets, customSets.findIndex(s => s.id === fromId), customSets.findIndex(s => s.id === toSetId))
    saveCustomSets(next)
    setCustomSets(next)
  }

  const handleSetDragEnd = () => {
    setDragOverSetId(null)
    setDragOverSetSection(null)
  }

  // Sectioned set list drag handlers
  const handleSetDragStartSectioned = (e: React.DragEvent, setId: string, sectionId: string) => {
    e.dataTransfer.setData('application/algset-sectioned', JSON.stringify({ setId, fromSectionId: sectionId }))
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleSetCardDropSectioned = (e: React.DragEvent, targetSetId: string, targetSectionId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverSetId(null)
    setDragOverSetSection(null)

    const data = e.dataTransfer.getData('application/algset-sectioned')
    if (!data) return
    try {
      const { setId, fromSectionId } = JSON.parse(data)
      if (setId === targetSetId) return

      if (fromSectionId === '__unsorted-sets' && targetSectionId === '__unsorted-sets') {
        const next = reorderArray(customSets, customSets.findIndex(s => s.id === setId), customSets.findIndex(s => s.id === targetSetId))
        saveCustomSets(next)
        setCustomSets(next)
      } else if (fromSectionId === '__unsorted-sets') {
        const toIdx = setListSections.find(s => s.id === targetSectionId)?.setIds.indexOf(targetSetId) ?? -1
        if (toIdx !== -1) {
          const next = setListSections.map(s => {
            if (s.id === targetSectionId) {
              const ids = [...s.setIds.filter(id => id !== setId)]
              ids.splice(toIdx, 0, setId)
              return { ...s, setIds: ids }
            }
            return s
          })
          saveSetSections(next)
          setSetListSections(next)
        }
      } else if (targetSectionId === '__unsorted-sets') {
        const next = setListSections.map(s =>
          s.id === fromSectionId ? { ...s, setIds: s.setIds.filter(id => id !== setId) } : s
        )
        saveSetSections(next)
        setSetListSections(next)
      } else {
        const toIdx = setListSections.find(s => s.id === targetSectionId)?.setIds.indexOf(targetSetId) ?? -1
        if (toIdx === -1) return
        const next = setListSections.map(s => {
          let ids = s.setIds
          if (s.id === fromSectionId) ids = ids.filter(id => id !== setId)
          if (s.id === targetSectionId) {
            ids = [...ids.filter(id => id !== setId)]
            ids.splice(toIdx, 0, setId)
          }
          return ids === s.setIds ? s : { ...s, setIds: ids }
        })
        saveSetSections(next)
        setSetListSections(next)
      }
    } catch { /* ignore */ }
  }

  const handleSetSectionDragOver = (e: React.DragEvent, sectionId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverSetSection(sectionId)
  }

  const handleSetSectionDragLeave = (e: React.DragEvent, sectionId: string) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      if (dragOverSetSection === sectionId) setDragOverSetSection(null)
    }
  }

  const handleSetSectionDrop = (e: React.DragEvent, toSectionId: string) => {
    e.preventDefault()
    setDragOverSetSection(null)
    setDragOverSetId(null)

    // Section reorder
    const sectionData = e.dataTransfer.getData('application/set-section')
    if (sectionData) {
      try {
        const { sectionId: fromId } = JSON.parse(sectionData)
        if (fromId === toSectionId) return
        const next = reorderArray(setListSections, setListSections.findIndex(s => s.id === fromId), setListSections.findIndex(s => s.id === toSectionId))
        saveSetSections(next)
        setSetListSections(next)
      } catch { /* ignore */ }
      return
    }

    // Set move to section
    const data = e.dataTransfer.getData('application/algset-sectioned')
    if (data) {
      try {
        const { setId, fromSectionId } = JSON.parse(data)
        if (fromSectionId === toSectionId) return
        const next = setListSections.map(s => {
          if (s.id === fromSectionId) return { ...s, setIds: s.setIds.filter(id => id !== setId) }
          if (s.id === toSectionId) return { ...s, setIds: [...s.setIds, setId] }
          return s
        })
        saveSetSections(next)
        setSetListSections(next)
      } catch { /* ignore */ }
    }
  }

  const handleSetSectionDragStart = (e: React.DragEvent, sectionId: string) => {
    e.dataTransfer.setData('application/set-section', JSON.stringify({ sectionId }))
    e.dataTransfer.effectAllowed = 'move'
  }

  const addSetSection = () => {
    const id = `set-sec-${Date.now()}`
    const next = [...setListSections, { id, name: 'New Section', setIds: [] }]
    saveSetSections(next)
    setSetListSections(next)
    setEditingSetSectionId(id)
  }

  const deleteSetSection = (sectionId: string) => {
    const next = setListSections.filter(s => s.id !== sectionId)
    saveSetSections(next)
    setSetListSections(next)
  }

  const renameSetSection = (sectionId: string, name: string) => {
    const next = setListSections.map(s => s.id === sectionId ? { ...s, name } : s)
    saveSetSections(next)
    setSetListSections(next)
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
    const setsEditing = customSets.length === 0 || setListMode === 'edit'
    const hasSetSecs = setListSections.length > 0
    const setMap = new Map(customSets.map(s => [s.id, s]))
    const unsortedSetIds = getUnsortedSetIds(customSets, setListSections)

    const handleSetTouchStart = (e: React.TouchEvent, setId: string, sectionId: string) => {
      initTouchDrag(touchDragRef, e, e.currentTarget as HTMLElement, {
        type: 'set', setId, fromSetSectionId: sectionId,
      })
    }

    const handleSetSectionTouchStart = (e: React.TouchEvent, sectionId: string) => {
      e.stopPropagation()
      const sectionEl = (e.currentTarget as HTMLElement).closest('.alg-set-section') as HTMLElement
      initTouchDrag(touchDragRef, e, sectionEl, {
        type: 'section', sectionId,
      })
    }

    const renderSetCard = (set: AlgSet, sectionId: string) => {
      const isSectioned = hasSetSecs
      return (
        <button
          key={set.id}
          data-set-id={setsEditing ? set.id : undefined}
          data-set-section={setsEditing && isSectioned ? sectionId : undefined}
          className={`alg-set-card ${setsEditing && dragOverSetId === set.id ? 'drag-over' : ''}`}
          onClick={() => openSet(set)}
          draggable={setsEditing}
          onDragStart={setsEditing ? (isSectioned
            ? e => handleSetDragStartSectioned(e, set.id, sectionId)
            : e => handleSetDragStart(e, set.id)
          ) : undefined}
          onDragOver={setsEditing ? e => handleSetDragOver(e, set.id) : undefined}
          onDragLeave={setsEditing ? e => handleSetDragLeave(e, set.id) : undefined}
          onDrop={setsEditing ? (isSectioned
            ? e => handleSetCardDropSectioned(e, set.id, sectionId)
            : e => handleSetDrop(e, set.id)
          ) : undefined}
          onDragEnd={setsEditing ? handleSetDragEnd : undefined}
          onTouchStart={setsEditing ? e => handleSetTouchStart(e, set.id, sectionId) : undefined}
        >
          <span className="alg-set-name">{set.name}</span>
          <span className="alg-set-count">{set.cases.length} cases</span>
          {setsEditing && (
            <span className="alg-set-actions">
              <span className="alg-set-action" onClick={e => exportSet(e, set)} title="Export">&#8615;</span>
              <span className="alg-set-action" onClick={e => duplicateSet(e, set)} title="Duplicate">&#9776;</span>
              <span className="alg-set-action alg-set-action-delete" onClick={e => deleteCustomSet(e, set.id)} title="Delete">&times;</span>
            </span>
          )}
        </button>
      )
    }

    const updateSetSectionIcon = (sectionId: string, icon: string | undefined) => {
      const next = setListSections.map(s => s.id === sectionId ? { ...s, icon } : s)
      saveSetSections(next)
      setSetListSections(next)
    }

    const renderSetSectionHeader = (section: SetSection) => (
      <div className="alg-section-header" key={`header-${section.id}`}>
        {setsEditing && (
          <span
            className="alg-section-grip"
            draggable
            onDragStart={e => { e.stopPropagation(); handleSetSectionDragStart(e, section.id) }}
            onDragEnd={handleSetDragEnd}
            onTouchStart={e => handleSetSectionTouchStart(e, section.id)}
            title="Drag to reorder"
          >&#10303;</span>
        )}
        {section.icon && <img className="alg-section-icon" src={section.icon} alt="" />}
        {setsEditing && editingSetSectionId === section.id ? (
          <>
            <input
              className="alg-section-name-input"
              autoFocus
              defaultValue={section.name}
              onBlur={e => { renameSetSection(section.id, e.target.value || section.name); setEditingSetSectionId(null) }}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            />
            <div className="alg-icon-picker alg-icon-picker-inline">
              <div className="alg-icon-options">
                <button
                  className={`alg-icon-option ${!section.icon ? 'active' : ''}`}
                  onClick={() => updateSetSectionIcon(section.id, undefined)}
                >None</button>
                {ALGSET_ICONS.map(icon => (
                  <button
                    key={icon.id}
                    className={`alg-icon-option ${section.icon === icon.path ? 'active' : ''}`}
                    onClick={() => updateSetSectionIcon(section.id, icon.path)}
                    title={icon.name}
                  >
                    <img src={icon.path} alt={icon.name} />
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <h3
            className="alg-section-name"
            onClick={setsEditing ? () => setEditingSetSectionId(section.id) : undefined}
          >
            {section.name}
          </h3>
        )}
        {setsEditing && (
          <button className="alg-section-delete" onClick={() => deleteSetSection(section.id)} title="Delete section">&times;</button>
        )}
      </div>
    )

    return (
      <div className="alg-practice">
        <div className="alg-set-list-header">
          {customSets.length > 0 && (
            <button
              className="alg-mode-toggle"
              onClick={() => setSetListMode(m => m === 'view' ? 'edit' : 'view')}
            >
              {setsEditing ? 'Done' : 'Edit'}
            </button>
          )}
        </div>

        {customSets.length === 0 && (
          <p className="alg-empty-message">No algorithm sets yet! Try adding one.</p>
        )}

        {hasSetSecs ? (
          <>
            {setListSections.map(section => (
              <div
                key={section.id}
                data-set-section-id={setsEditing ? section.id : undefined}
                className={`alg-set-section ${setsEditing && dragOverSetSection === section.id ? 'drag-over' : ''}`}
                onDragOver={setsEditing ? e => handleSetSectionDragOver(e, section.id) : undefined}
                onDragLeave={setsEditing ? e => handleSetSectionDragLeave(e, section.id) : undefined}
                onDrop={setsEditing ? e => handleSetSectionDrop(e, section.id) : undefined}
              >
                {renderSetSectionHeader(section)}
                <div className="alg-sets">
                  {section.setIds.map(setId => {
                    const set = setMap.get(setId)
                    if (!set) return null
                    return renderSetCard(set, section.id)
                  })}
                </div>
              </div>
            ))}
            {unsortedSetIds.length > 0 && (
              <div
                data-set-section-id={setsEditing ? '__unsorted-sets' : undefined}
                className={`alg-set-section alg-section-unsorted ${setsEditing && dragOverSetSection === '__unsorted-sets' ? 'drag-over' : ''}`}
                onDragOver={setsEditing ? e => handleSetSectionDragOver(e, '__unsorted-sets') : undefined}
                onDragLeave={setsEditing ? e => handleSetSectionDragLeave(e, '__unsorted-sets') : undefined}
                onDrop={setsEditing ? e => handleSetSectionDrop(e, '__unsorted-sets') : undefined}
              >
                <div className="alg-section-header">
                  <h3 className="alg-section-name unsorted">Unsorted</h3>
                </div>
                <div className="alg-sets">
                  {unsortedSetIds.map(setId => {
                    const set = setMap.get(setId)
                    if (!set) return null
                    return renderSetCard(set, '__unsorted-sets')
                  })}
                </div>
              </div>
            )}
            {setsEditing && (
              <button className="alg-add-section-btn" onClick={addSetSection}>+ Add Section</button>
            )}
          </>
        ) : (
          <div className="alg-sets">
            {customSets.map(set => renderSetCard(set, '__flat-sets'))}
          </div>
        )}

        {setsEditing && (
          <>
            {!hasSetSecs && (
              <button className="alg-add-section-btn" onClick={addSetSection}>+ Add Section</button>
            )}
            <button className="alg-new-set-card" onClick={() => { setShowNewSetModal(true); setNewSetName('New Set') }}>
              <span className="alg-set-name">+</span>
              <span className="alg-set-count">New Set</span>
            </button>
          </>
        )}

        {showNewSetModal && (
          <div className="modal-overlay" onClick={() => { setShowNewSetModal(false); setSelectedPreset(''); setNewSetName('New Set') }}>
            <div className="modal alg-new-set-modal" onClick={e => e.stopPropagation()}>
              <h3>New Algorithm Set</h3>

              <div className="alg-new-set-blank-form">
                <span className="alg-new-set-option-name">Blank Set</span>
                <label className="alg-edit-label">
                  Name
                  <input
                    type="text"
                    value={newSetName}
                    onChange={e => setNewSetName(e.target.value)}
                  />
                </label>
                <button className="alg-preset-create" onClick={createBlankSet}>Create</button>
              </div>

              <div className="alg-new-set-divider">or from a preset</div>

              <div className="alg-preset-picker">
                <select
                  className="alg-preset-select"
                  value={selectedPreset}
                  onChange={e => setSelectedPreset(e.target.value)}
                >
                  <option value="">Select a preset...</option>
                  {PRESETS.map(p => (
                    <option key={p.path} value={p.path}>{p.name}</option>
                  ))}
                </select>
                <button
                  className="alg-preset-create"
                  disabled={!selectedPreset || loadingPreset}
                  onClick={() => selectedPreset && createFromPreset(selectedPreset)}
                >
                  {loadingPreset ? 'Loading...' : 'Create'}
                </button>
              </div>

              <div className="alg-new-set-divider">or import a file</div>

              <label className="alg-new-set-option alg-import-label">
                <span className="alg-new-set-option-name">Import JSON</span>
                <span className="alg-new-set-option-desc">Load from an exported file</span>
                <input
                  type="file"
                  accept=".json"
                  hidden
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) importFromFile(file)
                  }}
                />
              </label>

              <button className="modal-close" onClick={() => { setShowNewSetModal(false); setSelectedPreset(''); setNewSetName('New Set') }}>Close</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // --- Case list view ---
  if (view === 'cases' && selectedSet) {
    void overrideVersion // used to trigger re-render
    const caseMap = new Map(selectedSet.cases.map(c => [c.id, c]))

    const unsortedIds = getUnsortedIds(selectedSet, sections)
    const hasSections = sections.length > 0 || (selectedSet.sections && selectedSet.sections.length > 0)

    // Case drag handlers
    const handleDragStart = (e: React.DragEvent, caseId: string, fromSectionId: string) => {
      e.dataTransfer.setData('application/case', JSON.stringify({ caseId, fromSectionId }))
      e.dataTransfer.effectAllowed = 'move'
    }

    const handleDragOver = (e: React.DragEvent, sectionId: string) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setDragOverSection(sectionId)
    }

    const handleDragLeave = (e: React.DragEvent, sectionId: string) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
        if (dragOverSection === sectionId) setDragOverSection(null)
      }
    }

    const handleDrop = (e: React.DragEvent, toSectionId: string) => {
      e.preventDefault()
      setDragOverSection(null)

      // Section reorder
      const sectionData = e.dataTransfer.getData('application/section')
      if (sectionData) {
        try {
          const { sectionId: fromId } = JSON.parse(sectionData)
          if (fromId === toSectionId) return
          const next = reorderArray(sections, sections.findIndex(s => s.id === fromId), sections.findIndex(s => s.id === toSectionId))
          setSections(next)
          saveSections(selectedSet.id, next)
        } catch { /* ignore */ }
        return
      }

      // Case move
      try {
        const { caseId, fromSectionId } = JSON.parse(e.dataTransfer.getData('application/case'))
        if (fromSectionId === toSectionId) return
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

    const handleCaseDragOver = (e: React.DragEvent, caseId: string) => {
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'move'
      setDragOverCaseId(caseId)
    }

    const handleCaseDragLeave = (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
        setDragOverCaseId(null)
      }
    }

    const handleCaseDrop = (e: React.DragEvent, targetCaseId: string, targetSectionId: string) => {
      e.preventDefault()
      e.stopPropagation()
      setDragOverCaseId(null)
      setDragOverSection(null)

      const caseData = e.dataTransfer.getData('application/case')
      if (!caseData) return
      try {
        const { caseId, fromSectionId } = JSON.parse(caseData)
        if (caseId === targetCaseId) return

        if (targetSectionId === '__flat') {
          // Reorder within flat case list
          const cases = [...selectedSet.cases]
          const fromIdx = cases.findIndex(c => c.id === caseId)
          const toIdx = cases.findIndex(c => c.id === targetCaseId)
          if (fromIdx === -1 || toIdx === -1) return
          const reordered = reorderArray(cases, fromIdx, toIdx)
          const updatedSets = customSets.map(s =>
            s.id === selectedSet.id ? { ...s, cases: reordered } : s
          )
          saveCustomSets(updatedSets)
          setCustomSets(updatedSets)
          const updated = updatedSets.find(s => s.id === selectedSet.id)
          if (updated) setSelectedSet(updated)
        } else {
          // Reorder within/across sections
          const toIdx = sections.find(s => s.id === targetSectionId)?.caseIds.indexOf(targetCaseId) ?? -1
          if (toIdx === -1) return
          const next = sections.map(s => {
            let ids = s.caseIds
            if (s.id === fromSectionId) {
              ids = ids.filter(id => id !== caseId)
            }
            if (s.id === targetSectionId) {
              ids = [...ids.filter(id => id !== caseId)]
              ids.splice(toIdx, 0, caseId)
            }
            return ids === s.caseIds ? s : { ...s, caseIds: ids }
          })
          setSections(next)
          saveSections(selectedSet.id, next)
        }
      } catch { /* ignore */ }
    }

    const handleDragEnd = () => {
      setDragOverSection(null)
      setDragOverCaseId(null)
    }

    // Section drag handlers
    const handleSectionDragStart = (e: React.DragEvent, sectionId: string) => {
      e.dataTransfer.setData('application/section', JSON.stringify({ sectionId }))
      e.dataTransfer.effectAllowed = 'move'
    }

    // Touch drag handlers (mobile)
    const handleCaseTouchStart = (e: React.TouchEvent, caseId: string, sectionId: string) => {
      initTouchDrag(touchDragRef, e, e.currentTarget as HTMLElement, {
        type: 'case', caseId, fromSectionId: sectionId,
      })
    }

    const handleSectionTouchStart = (e: React.TouchEvent, sectionId: string) => {
      e.stopPropagation()
      const sectionEl = (e.currentTarget as HTMLElement).closest('.alg-section') as HTMLElement
      initTouchDrag(touchDragRef, e, sectionEl, {
        type: 'section', sectionId,
      })
    }

    // Touch drop handler (has access to current state via closure)
    touchDropHandlerRef.current = (target) => {
      const drag = touchDragRef.current
      if (!drag) return

      if (drag.type === 'section' && drag.sectionId) {
        if (target.type === 'section') {
          const fromId = drag.sectionId
          const toId = target.id
          if (fromId === toId) return
          const next = reorderArray(sections, sections.findIndex(s => s.id === fromId), sections.findIndex(s => s.id === toId))
          setSections(next)
          saveSections(selectedSet.id, next)
        }
      } else if (drag.type === 'case' && drag.caseId && drag.fromSectionId) {
        if (target.type === 'case' && target.sectionId) {
          const caseId = drag.caseId
          const fromSectionId = drag.fromSectionId
          const targetCaseId = target.id
          const targetSectionId = target.sectionId
          if (caseId === targetCaseId) return

          if (targetSectionId === '__flat') {
            const cases = [...selectedSet.cases]
            const fromIdx = cases.findIndex(c => c.id === caseId)
            const toIdx = cases.findIndex(c => c.id === targetCaseId)
            if (fromIdx === -1 || toIdx === -1) return
            const reordered = reorderArray(cases, fromIdx, toIdx)
            const updatedSets = customSets.map(s =>
              s.id === selectedSet.id ? { ...s, cases: reordered } : s
            )
            saveCustomSets(updatedSets)
            setCustomSets(updatedSets)
            const updated = updatedSets.find(s => s.id === selectedSet.id)
            if (updated) setSelectedSet(updated)
          } else {
            const toIdx = sections.find(s => s.id === targetSectionId)?.caseIds.indexOf(targetCaseId) ?? -1
            if (toIdx === -1) return
            const next = sections.map(s => {
              let ids = s.caseIds
              if (s.id === fromSectionId) {
                ids = ids.filter(id => id !== caseId)
              }
              if (s.id === targetSectionId) {
                ids = [...ids.filter(id => id !== caseId)]
                ids.splice(toIdx, 0, caseId)
              }
              return ids === s.caseIds ? s : { ...s, caseIds: ids }
            })
            setSections(next)
            saveSections(selectedSet.id, next)
          }
        } else if (target.type === 'section') {
          const caseId = drag.caseId
          const fromSectionId = drag.fromSectionId
          const toSectionId = target.id
          if (fromSectionId === toSectionId) return
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
        }
      }
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

    const isEditMode = caseViewMode === 'edit'

    const toggleCaseSelection = (caseId: string) => {
      setSelectedCaseIds(prev => {
        const next = new Set(prev)
        if (next.has(caseId)) next.delete(caseId)
        else next.add(caseId)
        return next
      })
    }

    const renderCaseCard = (caseId: string, sectionId: string) => {
      const c = caseMap.get(caseId)
      if (!c) return null
      const isSelected = !isEditMode && selectedCaseIds.has(caseId)
      return (
        <button
          key={caseId}
          data-drag-case={isEditMode ? caseId : undefined}
          data-drag-section={isEditMode ? sectionId : undefined}
          className={`alg-case-card ${isEditMode && dragOverCaseId === caseId ? 'drag-over' : ''} ${isSelected ? 'selected' : ''}`}
          draggable={isEditMode}
          onDragStart={isEditMode ? e => handleDragStart(e, caseId, sectionId) : undefined}
          onDragOver={isEditMode ? e => handleCaseDragOver(e, caseId) : undefined}
          onDragLeave={isEditMode ? handleCaseDragLeave : undefined}
          onDrop={isEditMode ? e => handleCaseDrop(e, caseId, sectionId) : undefined}
          onDragEnd={isEditMode ? handleDragEnd : undefined}
          onTouchStart={isEditMode ? e => handleCaseTouchStart(e, caseId, sectionId) : undefined}
          onClick={() => isEditMode ? openEditModal(c) : toggleCaseSelection(caseId)}
        >
          <CubeDiagram top={c.top} sides={c.sides} size={60} colors={selectedSet.colors} />
          <span className="alg-case-name">{c.name}</span>
        </button>
      )
    }

    const toggleSectionSelection = (caseIds: string[]) => {
      setSelectedCaseIds(prev => {
        const next = new Set(prev)
        const allSelected = caseIds.every(id => next.has(id))
        if (allSelected) {
          caseIds.forEach(id => next.delete(id))
        } else {
          caseIds.forEach(id => next.add(id))
        }
        return next
      })
    }

    const renderSectionHeader = (section: AlgSetSection) => (
      <div className="alg-section-header" key={`header-${section.id}`}>
        {isEditMode && (
          <span
            className="alg-section-grip"
            draggable
            onDragStart={e => { e.stopPropagation(); handleSectionDragStart(e, section.id) }}
            onDragEnd={handleDragEnd}
            onTouchStart={e => handleSectionTouchStart(e, section.id)}
            title="Drag to reorder"
          >&#10303;</span>
        )}
        {isEditMode && editingSectionId === section.id ? (
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
            onClick={isEditMode ? () => setEditingSectionId(section.id) : () => toggleSectionSelection(section.caseIds)}
            style={isEditMode ? undefined : { cursor: 'pointer' }}
          >
            {section.name}
          </h3>
        )}
        {isEditMode && (
          <button className="alg-section-delete" onClick={() => deleteSection(section.id)} title="Delete section">&times;</button>
        )}
      </div>
    )

    return (
      <div className="alg-practice">
        <button className="alg-back" onClick={goBackToSets}>&larr; Back</button>
        <div className="alg-set-header">
          <h2 className="alg-section-title">{selectedSet.name}</h2>
          {isEditMode && (
            <button className="alg-set-edit-btn" onClick={openSetEdit} title="Edit set">&#9998;</button>
          )}
          <button
            className="alg-mode-toggle"
            onClick={() => {
              setCaseViewMode(m => {
                if (m === 'view') setSelectedCaseIds(new Set())
                return m === 'view' ? 'edit' : 'view'
              })
            }}
          >
            {isEditMode ? 'Done' : 'Edit'}
          </button>
        </div>
        {selectedSet.cases.length > 0 && (
          selectedCaseIds.size > 0 && !isEditMode ? (
            <button className="alg-practice-set-btn" onClick={practiceSelected}>
              Practice Selected ({selectedCaseIds.size})
            </button>
          ) : (
            <button className="alg-practice-set-btn" onClick={practiceSet}>Practice Set</button>
          )
        )}
        {selectedCaseIds.size > 0 && !isEditMode && (
          <button className="alg-clear-selection-btn" onClick={() => setSelectedCaseIds(new Set())}>Clear Selection</button>
        )}
        {isEditMode && (
          <button className="alg-add-case-btn" onClick={() => {
            const id = `${selectedSet.id}-${Date.now()}`
            const blank: AlgCase = { id, name: '', alg: '', top: Array(9).fill(0), sides: Array(12).fill(0) }
            openEditModal(blank, true)
          }}>+ Add Case</button>
        )}

        {hasSections ? (
          <>
            {sections.map(section => (
              <div
                key={section.id}
                data-drop-section={isEditMode ? section.id : undefined}
                className={`alg-section ${isEditMode && dragOverSection === section.id ? 'drag-over' : ''}`}
                onDragOver={isEditMode ? e => handleDragOver(e, section.id) : undefined}
                onDragLeave={isEditMode ? e => handleDragLeave(e, section.id) : undefined}
                onDrop={isEditMode ? e => handleDrop(e, section.id) : undefined}
              >
                {renderSectionHeader(section)}
                <div className="alg-case-grid">
                  {section.caseIds.map(id => renderCaseCard(id, section.id))}
                </div>
              </div>
            ))}
            {unsortedIds.length > 0 && (
              <div
                data-drop-section={isEditMode ? '__unsorted' : undefined}
                className={`alg-section alg-section-unsorted ${isEditMode && dragOverSection === '__unsorted' ? 'drag-over' : ''}`}
                onDragOver={isEditMode ? e => handleDragOver(e, '__unsorted') : undefined}
                onDragLeave={isEditMode ? e => handleDragLeave(e, '__unsorted') : undefined}
                onDrop={isEditMode ? e => handleDrop(e, '__unsorted') : undefined}
              >
                <div className="alg-section-header">
                  <h3
                    className="alg-section-name unsorted"
                    onClick={!isEditMode ? () => toggleSectionSelection(unsortedIds) : undefined}
                    style={!isEditMode ? { cursor: 'pointer' } : undefined}
                  >Unsorted</h3>
                </div>
                <div className="alg-case-grid">
                  {unsortedIds.map(id => renderCaseCard(id, '__unsorted'))}
                </div>
              </div>
            )}
            {isEditMode && (
              <button className="alg-add-section-btn" onClick={addSection}>+ Add Section</button>
            )}
          </>
        ) : (
          <>
            <div className="alg-case-grid">
              {selectedSet.cases.map(c => renderCaseCard(c.id, '__flat'))}
            </div>
            {isEditMode && (
              <button className="alg-add-section-btn" onClick={addSection}>+ Add Section</button>
            )}
          </>
        )}

        {isEditMode && editingCase && (
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
                <CubeDiagram
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
          <CubeDiagram top={selectedCase.top} sides={selectedCase.sides} size={120} colors={selectedSet?.colors} />
          <h2 className="alg-case-title">{selectedCase.name}</h2>
          <button className="alg-reveal-btn" onClick={() => setShowAlg(!showAlg)}>
            {showAlg ? 'Hide Algorithm' : 'Show Algorithm'}
          </button>
          {showAlg && <p className="alg-text">{selectedCase.alg}</p>}
        </div>

        <div ref={timerRef} className={`timer ${timerState}`}>
          <span className="time">{formatTime(displayTime)}</span>
          <span className="hint">
            {timerState === 'idle' && 'Hold to start'}
            {timerState === 'holding' && 'Hold...'}
            {timerState === 'ready' && 'Release to start'}
            {timerState === 'running' && 'Tap to stop'}
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
