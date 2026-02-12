import { useState, useCallback, useRef, useEffect } from 'react'
import type { TimerState } from '../types'

const HOLD_DELAY = 550

interface UseTimerOptions {
  /** Called with the final elapsed time (ms) when the timer stops. */
  onStop: (finalTime: number) => void
  /** The timer only binds events when `active` is true. */
  active: boolean
}

export function useTimer({ onStop, active }: UseTimerOptions) {
  const [timerState, setTimerState] = useState<TimerState>('idle')
  const [displayTime, setDisplayTime] = useState(0)

  const startTimeRef = useRef<number>(0)
  const animationFrameRef = useRef<number>(0)
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const timerRef = useRef<HTMLDivElement>(null)
  const onStopRef = useRef(onStop)
  onStopRef.current = onStop

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
    onStopRef.current(finalTime)
  }, [])

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

  // Keyboard and pointer event handling
  useEffect(() => {
    if (!active) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return
      e.preventDefault()

      if (timerState === 'idle') {
        setTimerState('holding')
        holdTimeoutRef.current = setTimeout(() => {
          setTimerState('ready')
        }, HOLD_DELAY)
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
        }, HOLD_DELAY)
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
  }, [active, timerState, startTimer, stopTimer])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animationFrameRef.current)
      clearTimeout(holdTimeoutRef.current)
    }
  }, [])

  const resetTimer = useCallback(() => {
    setTimerState('idle')
    cancelAnimationFrame(animationFrameRef.current)
    clearTimeout(holdTimeoutRef.current)
    startTimeRef.current = 0
  }, [])

  return { timerState, displayTime, setDisplayTime, timerRef, resetTimer }
}
