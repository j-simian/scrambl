export interface AlgCase {
  id: string
  name: string
  alg: string
  top: number[]     // 9 values: 1 = yellow (oriented), 0 = not. Reading order L→R, T→B
  sides?: number[]  // 12 values: T(L,C,R), R(T,C,B), B(R,C,L), L(B,C,T) — 1 = yellow
}

export interface AlgSetSection {
  id: string
  name: string
  caseIds: string[]
}

export interface AlgSet {
  id: string
  name: string
  cases: AlgCase[]
  colors?: boolean  // true = stickers use multi-color values (0–5), false/undefined = binary yellow/gray
  sections?: AlgSetSection[]
  icon?: string     // path to icon image
}
