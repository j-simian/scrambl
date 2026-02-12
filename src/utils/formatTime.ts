export function formatTime(ms: number): string {
  const totalSeconds = ms / 1000
  if (totalSeconds < 60) {
    return totalSeconds.toFixed(2)
  }
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = (totalSeconds % 60).toFixed(2).padStart(5, '0')
  return `${minutes}:${seconds}`
}
