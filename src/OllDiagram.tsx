interface OllDiagramProps {
  top: number[]      // 9 values: 1 = yellow, 0 = not
  sides?: number[]   // 12 values: T(L,C,R), R(T,C,B), B(R,C,L), L(B,C,T)
  size?: number      // overall width/height of the SVG
  onToggleTop?: (index: number) => void
  onToggleSide?: (index: number) => void
}

const YELLOW = '#eab308'
const GRAY = '#374151'
const SIDE_YELLOW = '#eab308'
const SIDE_GRAY = '#1f2937'

export default function OllDiagram({ top, sides, size = 80, onToggleTop, onToggleSide }: OllDiagramProps) {
  const padding = size * 0.15     // space for side indicators
  const gridSize = size - padding * 2
  const cell = gridSize / 3
  const sideH = padding * 0.5     // height of side indicator rectangles
  const gap = 1                    // gap between cells
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
            fill={val === 1 ? YELLOW : GRAY}
            style={onToggleTop ? { cursor: 'pointer' } : undefined}
            onClick={onToggleTop ? () => onToggleTop(i) : undefined}
          />
        )
      })}

      {/* Side indicators */}
      {sides && sides.length === 12 && (
        <>
          {/* Top side: indices 0,1,2 → L,C,R */}
          {[0, 1, 2].map(i => (
            <rect
              key={`side-t-${i}`}
              x={padding + i * cell + gap}
              y={padding - sideH - 1}
              width={cell - gap * 2}
              height={sideH}
              rx={1}
              fill={sides[i] === 1 ? SIDE_YELLOW : SIDE_GRAY}
              style={interactive ? { cursor: 'pointer' } : undefined}
              onClick={onToggleSide ? () => onToggleSide(i) : undefined}
            />
          ))}
          {/* Right side: indices 3,4,5 → T,C,B */}
          {[0, 1, 2].map(i => (
            <rect
              key={`side-r-${i}`}
              x={padding + gridSize + 1}
              y={padding + i * cell + gap}
              width={sideH}
              height={cell - gap * 2}
              rx={1}
              fill={sides[3 + i] === 1 ? SIDE_YELLOW : SIDE_GRAY}
              style={interactive ? { cursor: 'pointer' } : undefined}
              onClick={onToggleSide ? () => onToggleSide(3 + i) : undefined}
            />
          ))}
          {/* Bottom side: indices 6,7,8 → R,C,L */}
          {[0, 1, 2].map(i => (
            <rect
              key={`side-b-${i}`}
              x={padding + (2 - i) * cell + gap}
              y={padding + gridSize + 1}
              width={cell - gap * 2}
              height={sideH}
              rx={1}
              fill={sides[6 + i] === 1 ? SIDE_YELLOW : SIDE_GRAY}
              style={interactive ? { cursor: 'pointer' } : undefined}
              onClick={onToggleSide ? () => onToggleSide(6 + i) : undefined}
            />
          ))}
          {/* Left side: indices 9,10,11 → B,C,T */}
          {[0, 1, 2].map(i => (
            <rect
              key={`side-l-${i}`}
              x={padding - sideH - 1}
              y={padding + (2 - i) * cell + gap}
              width={sideH}
              height={cell - gap * 2}
              rx={1}
              fill={sides[9 + i] === 1 ? SIDE_YELLOW : SIDE_GRAY}
              style={interactive ? { cursor: 'pointer' } : undefined}
              onClick={onToggleSide ? () => onToggleSide(9 + i) : undefined}
            />
          ))}
        </>
      )}
    </svg>
  )
}
