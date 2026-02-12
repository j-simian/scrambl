/** Create a fixed-position drag clone of a source element for touch drag-and-drop. */
export function createDragClone(sourceEl: HTMLElement): HTMLElement {
  const rect = sourceEl.getBoundingClientRect()
  const clone = sourceEl.cloneNode(true) as HTMLElement
  clone.style.position = 'fixed'
  clone.style.left = `${rect.left}px`
  clone.style.top = `${rect.top}px`
  clone.style.width = `${rect.width}px`
  clone.style.height = `${rect.height}px`
  clone.style.opacity = '0.85'
  clone.style.zIndex = '10000'
  clone.style.pointerEvents = 'none'
  clone.style.transition = 'none'
  clone.style.margin = '0'
  clone.style.willChange = 'transform'
  clone.classList.add('touch-drag-clone')
  document.body.appendChild(clone)
  return clone
}
