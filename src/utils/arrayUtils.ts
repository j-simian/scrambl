/** Reorder an array by moving the item at `fromIdx` to `toIdx`. Returns a new array. */
export function reorderArray<T>(arr: T[], fromIdx: number, toIdx: number): T[] {
  if (fromIdx === -1 || toIdx === -1) return arr
  const next = [...arr]
  const [moved] = next.splice(fromIdx, 1)
  next.splice(toIdx, 0, moved)
  return next
}
