interface CubeDiagramProps {
  top: number[]      // 9 values
  sides?: number[]   // 12 values: T(L,C,R), R(T,C,B), B(R,C,L), L(B,C,T)
  size?: number
  colors?: boolean   // true = all stickers use multi-color palette (0–6)
  onToggleTop?: (index: number) => void
  onToggleSide?: (index: number) => void
}

const GRAY = '#374151'
const DARK = '#1f2937'

// Color palette for multi-color mode (index = value)
const PALETTE: Record<number, string> = {
  0: GRAY,
  1: '#eab308',    // yellow
  2: '#ef4444',    // red
  3: '#3b82f6',    // blue
  4: '#22c55e',    // green
  5: '#f97316',    // orange
  6: '#ffffff',    // white
}

function topColor(value: number, colorMode: boolean): string {
  if (!colorMode) return value === 1 ? PALETTE[1] : GRAY
  return PALETTE[value] ?? GRAY
}

function sideColor(value: number, colorMode: boolean): string {
  if (!colorMode) return value === 1 ? PALETTE[1] : DARK
  return (value === 0 ? DARK : PALETTE[value]) ?? DARK
}

export default function CubeDiagram({ top, sides, size = 80, colors = false, onToggleTop, onToggleSide }: CubeDiagramProps) {
  const padding = size * 0.15
  const gridSize = size - padding * 2
  const cell = gridSize / 3
  const sideH = padding * 0.5
  const gap = 1
  const interactive = !!(onToggleTop || onToggleSide)

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* 3x3 top face grid */}
      {top.map((val, i) => {
        const row = Math.floor(i / 3)
        const col = i % 3
        return (
          <rect
            key={`top-${i}`}
            x={padding + col * cell + gap}
            y={padding + row * cell + gap}
            width={cell - gap * 2}
            height={cell - gap * 2}
            rx={2}
            fill={topColor(val, colors)}
            style={onToggleTop ? { cursor: 'pointer' } : undefined}
            onClick={onToggleTop ? () => onToggleTop(i) : undefined}
          />
        )
      })}

      {/* Side indicators */}
      {sides && sides.length === 12 && (
        <>
          {/* Top side: indices 0,1,2 */}
          {[0, 1, 2].map(i => (
            <rect
              key={`side-t-${i}`}
              x={padding + i * cell + gap}
              y={padding - sideH - 1}
              width={cell - gap * 2}
              height={sideH}
              rx={1}
              fill={sideColor(sides[i], colors)}
              style={interactive ? { cursor: 'pointer' } : undefined}
              onClick={onToggleSide ? () => onToggleSide(i) : undefined}
            />
          ))}
          {/* Right side: indices 3,4,5 */}
          {[0, 1, 2].map(i => (
            <rect
              key={`side-r-${i}`}
              x={padding + gridSize + 1}
              y={padding + i * cell + gap}
              width={sideH}
              height={cell - gap * 2}
              rx={1}
              fill={sideColor(sides[3 + i], colors)}
              style={interactive ? { cursor: 'pointer' } : undefined}
              onClick={onToggleSide ? () => onToggleSide(3 + i) : undefined}
            />
          ))}
          {/* Bottom side: indices 6,7,8 */}
          {[0, 1, 2].map(i => (
            <rect
              key={`side-b-${i}`}
              x={padding + (2 - i) * cell + gap}
              y={padding + gridSize + 1}
              width={cell - gap * 2}
              height={sideH}
              rx={1}
              fill={sideColor(sides[6 + i], colors)}
              style={interactive ? { cursor: 'pointer' } : undefined}
              onClick={onToggleSide ? () => onToggleSide(6 + i) : undefined}
            />
          ))}
          {/* Left side: indices 9,10,11 */}
          {[0, 1, 2].map(i => (
            <rect
              key={`side-l-${i}`}
              x={padding - sideH - 1}
              y={padding + (2 - i) * cell + gap}
              width={sideH}
              height={cell - gap * 2}
              rx={1}
              fill={sideColor(sides[9 + i], colors)}
              style={interactive ? { cursor: 'pointer' } : undefined}
              onClick={onToggleSide ? () => onToggleSide(9 + i) : undefined}
            />
          ))}
        </>
      )}
    </svg>
  )
}
