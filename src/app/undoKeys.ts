const TEXT_INPUTS = new Set(['text', 'search', 'url', 'tel', 'email', 'password', 'number'])

/** True when the element edits text, so its own undo wins over the board's. */
export function editsText(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) return true
  return target instanceof HTMLInputElement && TEXT_INPUTS.has(target.type)
}

/** Cmd or Ctrl with Z undoes. Shift with it, or Ctrl+Y, redoes. Undefined for every other key, and while text is edited. */
export function undoCommand(event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'target'>): 'undo' | 'redo' | undefined {
  if (!(event.metaKey || event.ctrlKey) || event.altKey || editsText(event.target)) return undefined
  const key = event.key.toLowerCase()
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo'
  if (key === 'y' && event.ctrlKey && !event.shiftKey) return 'redo'
  return undefined
}
