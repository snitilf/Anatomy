import type { Board } from '../board/schema'
import type { BoardDiff } from '../layer/diff'
import { itemsOf, type ArchiveEntry, type Layer } from '../layer/model'
import { summarizeLayer } from '../layer/status'

/** How many entries each group of the Review tab holds. */
/** Items this revision adopted and the app archived. They show with the answers until the next revision. */
export function adoptedNow(board: Board, layer: Layer): ArchiveEntry[] {
  const responses = board.responses
  if (!responses) return []
  const ids = new Set(responses.items.filter((r) => r.status === 'adopted').map((r) => r.feedbackId))
  return layer.archive.filter((e) => e.response.status === 'adopted' && e.response.respondsTo === responses.respondsTo && ids.has(e.item.id))
}

export interface ReviewCounts {
  answers: number
  /** Archived items, which can be restored. */
  archive: number
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
  if (!board || !layer) return { answers: 0, archive: 0, relinking: 0, outdated: 0, changes: 0, decisions: 0, total: 0 }
  const answered = new Set(layer.answers.map((a) => a.id))
  // Answers on the map wait for Dismiss. Adoptions are done, so they show without asking for a decision.
  const open = itemsOf(layer).filter((e) => answered.has(e.item.id)).length
  const adopted = adoptedNow(board, layer).length
  const answers = open + adopted
  const archive = layer.archive.length - adopted
  const summary = summarizeLayer(board, layer)
  const relinking = summary.needsRelinking.length + summary.brokenLinks.length
  const outdated = summary.outdated.length
  const changed = changes ? changeCount(changes) : 0
  return { answers, archive, relinking, outdated, changes: changed, decisions: open + relinking + outdated, total: answers + archive + relinking + outdated + changed }
}
