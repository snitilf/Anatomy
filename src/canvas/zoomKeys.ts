import { editsText } from '../app/undoKeys'

/** What a key press does to the zoom, or undefined for any other key. Cmd or Ctrl with =, -, and 0, and Shift+1. */
export function zoomCommand(event: Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'target'>): 'in' | 'out' | 'reset' | 'fit' | undefined {
  if (event.altKey || editsText(event.target)) return undefined
  const mod = event.metaKey || event.ctrlKey
  if (mod && (event.key === '=' || event.key === '+')) return 'in'
  if (mod && (event.key === '-' || event.key === '_')) return 'out'
  if (mod && !event.shiftKey && event.key === '0') return 'reset'
  if (!mod && event.shiftKey && event.code === 'Digit1') return 'fit'
  return undefined
}
