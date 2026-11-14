import type { Layer } from '../layer/model'

/** Earlier and later versions of the user layer, for undo and redo. Kept in memory only, per open board. */
export interface History {
  past: readonly Layer[]
  future: readonly Layer[]
}

export const HISTORY_LIMIT = 100

export const emptyHistory: History = { past: [], future: [] }

/** Remembers the layer before a change. A new change drops everything that could be redone. */
export function remember(history: History, before: Layer): History {
  const past = history.past.length >= HISTORY_LIMIT ? history.past.slice(1 - HISTORY_LIMIT) : history.past
  return { past: [...past, before], future: [] }
}

/** The layer to go back to, and the history after the step. Undefined when there is nothing to undo. */
export function stepBack(history: History, current: Layer): { layer: Layer; history: History } | undefined {
  const layer = history.past[history.past.length - 1]
  if (!layer) return undefined
  return { layer, history: { past: history.past.slice(0, -1), future: [current, ...history.future] } }
}

export function stepForward(history: History, current: Layer): { layer: Layer; history: History } | undefined {
  const layer = history.future[0]
  if (!layer) return undefined
  return { layer, history: { past: [...history.past, current], future: history.future.slice(1) } }
}
