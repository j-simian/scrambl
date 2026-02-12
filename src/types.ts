export type TimerState = 'idle' | 'holding' | 'ready' | 'running'

export type Penalty = 'none' | '+2' | 'dnf'

export interface SolveTime {
  id: number
  time: number
  date: string
  penalty?: Penalty
}
