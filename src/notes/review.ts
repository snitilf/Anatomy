import type { Board } from '../board/schema'
import type { BoardDiff } from '../layer/diff'
import { itemsOf, type Layer } from '../layer/model'
import { summarizeLayer } from '../layer/status'

/** How many entries each group of the Review tab holds. */
export interface ReviewCounts {
  answers: number
  relinking: number
  outdated: number
  changes: number
  /** Entries that need a decision: everything but the change list. */
  decisions: number
  total: number
}

export function hasChanges(changes: BoardDiff | undefined): changes is BoardDiff {
  return changes !== undefined && changeCount(changes) > 0
}

function changeCount(d: BoardDiff): number {
  return (
    (d.boardChanged ? 1 : 0) +
    [d.added, d.removed, d.changed].reduce((n, c) => n + c.components.length + c.relationships.length, 0)
  )
}

export function reviewCounts(board: Board | undefined, layer: Layer | undefined, changes: BoardDiff | undefined): ReviewCounts {
  if (!board || !layer) return { answers: 0, relinking: 0, outdated: 0, changes: 0, decisions: 0, total: 0 }
  const answered = new Set(board.responses?.items.map((r) => r.feedbackId))
  const answers = itemsOf(layer).filter((e) => answered.has(e.item.id)).length + layer.archive.filter((e) => e.response.status === 'adopted').length
  const summary = summarizeLayer(board, layer)
  const relinking = summary.needsRelinking.length + summary.brokenLinks.length
  const outdated = summary.outdated.length
  const changed = changes ? changeCount(changes) : 0
  return { answers, relinking, outdated, changes: changed, decisions: answers + relinking + outdated, total: answers + relinking + outdated + changed }
}
